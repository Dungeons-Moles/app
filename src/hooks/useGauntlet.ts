import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSession } from '@/contexts/SessionContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram } from '@/services/solana/programs';
import {
  deriveGauntletEchoesPda,
  deriveGauntletSessionPda,
  deriveGameStatePda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  GAUNTLET_ENTRY_LAMPORTS,
  buildInitializeGauntletTransaction,
  deriveGauntletConfigPda,
  getGauntletErrorMessage,
} from '@/services/solana/gauntlet';
import { fetchGameState } from '@/services/solana/gameplayState';

export type GauntletPhase = 'confirm' | 'queued' | 'error';
const MAX_SWITCH_RETRIES = 3;
const SWITCH_RETRY_DELAY_MS = 250;
const GAUNTLET_CLEANUP_WAIT_TIMEOUT_MS = 45000;
const GAUNTLET_CLEANUP_POLL_MS = 1000;

function isRecoverableStartError(errorMessage: string | undefined): boolean {
  const message = (errorMessage ?? '').toLowerCase();
  return (
    message.includes('failed to delegate session to rollup') ||
    message.includes('delegation not fully propagated') ||
    message.includes('no active session to delegate') ||
    message.includes('delegategameplayaccounts') ||
    message.includes('access violation') ||
    message.includes('failed to complete')
  );
}

export function useGauntlet() {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const {
    startGauntletGame,
    switchToSession,
    forceAbandonCurrentSession,
    processPendingCleanups,
    hasPendingCleanups,
    fetchSessionNonces,
    retryErVrfForSession,
  } = useSession();
  const { connection } = useSolanaConnection();

  const [phase, setPhase] = useState<GauntletPhase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const confirmWithTimeout = useCallback(
    async (signature: string, timeoutMs = 15000): Promise<void> => {
      console.log('[useGauntlet] confirmWithTimeout:start', {
        signature,
        commitment: SOLANA_CONFIG.commitment,
        timeoutMs,
      });
      try {
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        console.log('[useGauntlet] confirmWithTimeout:confirmTransaction:ok', { signature });
        return;
      } catch {
        console.warn('[useGauntlet] confirmWithTimeout:confirmTransaction:falling_back', {
          signature,
        });
        // fall through to polling
      }

      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const statuses = await connection.getSignatureStatuses([signature]);
        const status = statuses.value[0];
        console.log('[useGauntlet] confirmWithTimeout:poll', {
          signature,
          status: status?.confirmationStatus ?? null,
          hasErr: !!status?.err,
          elapsedMs: Date.now() - start,
        });
        if (status?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (status && (status.confirmationStatus === 'processed' || status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      throw new Error('Timed out waiting for gauntlet transaction confirmation');
    },
    [connection]
  );

  const ensureGauntletInitialized = useCallback(async (): Promise<void> => {
    if (!wallet.publicKey) return;
    console.log('[useGauntlet] ensureGauntletInitialized:start', {
      wallet: wallet.publicKey.toBase58(),
    });
    const gameplayProgram = createGameplayStateProgram(connection);
    const [gauntletConfigPda] = deriveGauntletConfigPda();

    try {
      await (
        gameplayProgram.account as {
          gauntletConfig: { fetch: (address: PublicKey) => Promise<unknown> };
        }
      ).gauntletConfig.fetch(gauntletConfigPda);
      console.log('[useGauntlet] ensureGauntletInitialized:already_initialized', {
        gauntletConfigPda: gauntletConfigPda.toBase58(),
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const missing = msg.includes('Account does not exist') || msg.includes('has no data');
      if (!missing) {
        console.error('[useGauntlet] ensureGauntletInitialized:fetch_failed', err);
        throw err;
      }
      console.log('[useGauntlet] ensureGauntletInitialized:missing_config_initializing', {
        gauntletConfigPda: gauntletConfigPda.toBase58(),
      });
    }

    const initTx = await buildInitializeGauntletTransaction(
      connection,
      gameplayProgram,
      wallet.publicKey
    );
    const initSig = await signAndSendTransaction(initTx);
    console.log('[useGauntlet] ensureGauntletInitialized:init_sent', { signature: initSig });
    await confirmWithTimeout(initSig);
    console.log('[useGauntlet] ensureGauntletInitialized:init_confirmed', { signature: initSig });
  }, [wallet.publicKey, connection, signAndSendTransaction, confirmWithTimeout]);

  const closeOrphanedGauntletEchoes = useCallback(
    async (sessionPda: PublicKey): Promise<void> => {
      if (!wallet.publicKey) return;

      const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);
      const [sessionInfo, gauntletEchoesInfo] = await Promise.all([
        connection.getAccountInfo(sessionPda, SOLANA_CONFIG.commitment),
        connection.getAccountInfo(gauntletEchoesPda, SOLANA_CONFIG.commitment),
      ]);

      if (sessionInfo || !gauntletEchoesInfo) {
        return;
      }

      console.warn('[useGauntlet] closeOrphanedGauntletEchoes:found_orphan', {
        sessionPda: sessionPda.toBase58(),
        gauntletEchoesPda: gauntletEchoesPda.toBase58(),
        owner: gauntletEchoesInfo.owner.toBase58(),
      });

      // Skip if account is delegated (owned by delegation program, not gameplay-state)
      const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
      if (
        !gauntletEchoesInfo.owner.equals(SOLANA_CONFIG.programs.gameplayState) &&
        !gauntletEchoesInfo.owner.equals(DELEGATION_PROGRAM_ID)
      ) {
        console.warn(
          '[useGauntlet] closeOrphanedGauntletEchoes:unexpected_owner, skipping',
          gauntletEchoesInfo.owner.toBase58()
        );
        return;
      }

      // If delegated, the account is still active on the ER — not truly orphaned
      if (gauntletEchoesInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
        console.warn(
          '[useGauntlet] closeOrphanedGauntletEchoes:account_delegated, skipping',
          gauntletEchoesPda.toBase58()
        );
        return;
      }

      console.log('[useGauntlet] closeOrphanedGauntletEchoes:start', {
        sessionPda: sessionPda.toBase58(),
        gauntletEchoesPda: gauntletEchoesPda.toBase58(),
      });

      try {
        const gameplayProgram = createGameplayStateProgram(connection);
        const transaction = await (gameplayProgram.methods as any)
          .closeOrphanedGauntletEchoes()
          .accounts({
            gauntletEchoes: gauntletEchoesPda,
            sessionPda,
            destination: wallet.publicKey,
            payer: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction, { connection });
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        const postCloseInfo = await connection.getAccountInfo(
          gauntletEchoesPda,
          SOLANA_CONFIG.commitment
        );
        if (postCloseInfo) {
          console.warn(
            '[useGauntlet] closeOrphanedGauntletEchoes:still_exists_after_close',
            gauntletEchoesPda.toBase58()
          );
        } else {
          console.log('[useGauntlet] closeOrphanedGauntletEchoes:done', {
            signature,
            gauntletEchoesPda: gauntletEchoesPda.toBase58(),
          });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err ?? '');
        // AccountDiscriminatorNotFound (0xbb9 / 3001) — account data is corrupted
        // or in an intermediate undelegation state. Skip rather than blocking entry.
        if (errMsg.includes('3001') || errMsg.includes('0xbb9') || errMsg.includes('AccountDiscriminatorNotFound')) {
          console.warn(
            '[useGauntlet] closeOrphanedGauntletEchoes:discriminator_not_found, skipping',
            gauntletEchoesPda.toBase58()
          );
          return;
        }
        throw err;
      }
    },
    [connection, signAndSendTransaction, wallet.publicKey]
  );

  const validateResumedGauntletState = useCallback(
    async (
      sessionPda: PublicKey,
      expectedState: Awaited<ReturnType<typeof fetchGameState>>
    ): Promise<{ success: boolean; error?: string }> => {
      if (!expectedState) {
        return { success: false, error: 'Failed to verify existing gauntlet session state.' };
      }

      const gameplayProgram = createGameplayStateProgram(connection);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const resumedState = await fetchGameState(gameplayProgram, gameStatePda);

      if (!resumedState) {
        return { success: false, error: 'Resumed gauntlet game state could not be fetched.' };
      }

      const mismatchedSession = !resumedState.session.equals(sessionPda);
      const wrongRunMode = resumedState.runMode !== 2;
      const mutatedDuringResume =
        resumedState.totalMoves !== expectedState.totalMoves ||
        resumedState.week !== expectedState.week ||
        resumedState.phase !== expectedState.phase ||
        resumedState.positionX !== expectedState.positionX ||
        resumedState.positionY !== expectedState.positionY;

      if (mismatchedSession || wrongRunMode || mutatedDuringResume) {
        console.error('[useGauntlet] enterGauntlet:resume_state_validation_failed', {
          sessionPda: sessionPda.toBase58(),
          expected: expectedState
            ? {
                totalMoves: expectedState.totalMoves,
                week: expectedState.week,
                phase: expectedState.phase,
                positionX: expectedState.positionX,
                positionY: expectedState.positionY,
                runMode: expectedState.runMode,
              }
            : null,
          resumed: {
            totalMoves: resumedState.totalMoves,
            week: resumedState.week,
            phase: resumedState.phase,
            positionX: resumedState.positionX,
            positionY: resumedState.positionY,
            runMode: resumedState.runMode,
            session: resumedState.session.toBase58(),
          },
        });
        return {
          success: false,
          error:
            'Resumed gauntlet session state was inconsistent after delegation. Please retry; if it persists, abandon the stuck session.',
        };
      }

      return { success: true };
    },
    [connection]
  );

  const switchToGauntletSessionWithRetry = useCallback(
    async (gauntletSessionPda: PublicKey): Promise<{ success: boolean; error?: string }> => {
      let lastError: string | undefined;
      for (let attempt = 1; attempt <= MAX_SWITCH_RETRIES; attempt++) {
        const switchResult = await switchToSession(gauntletSessionPda.toBase58());
        console.log('[useGauntlet] enterGauntlet:switch_result', { ...switchResult, attempt });
        if (switchResult.success) {
          return { success: true };
        }
        lastError = switchResult.error ?? 'Failed to resume gauntlet session';
        if (attempt < MAX_SWITCH_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, SWITCH_RETRY_DELAY_MS));
        }
      }
      return { success: false, error: lastError ?? 'Failed to resume gauntlet session' };
    },
    [switchToSession]
  );

  const enterGauntlet = useCallback(async (onCommitted?: () => void): Promise<boolean> => {
    if (!wallet.publicKey) {
      setError('Wallet not connected');
      setPhase('error');
      return false;
    }

    setIsLoading(true);
    setError(null);
    console.log('[useGauntlet] enterGauntlet:start', {
      wallet: wallet.publicKey.toBase58(),
    });

    try {
      const hasBalance = await checkBalance(BigInt(GAUNTLET_ENTRY_LAMPORTS + 10_000));
      console.log('[useGauntlet] enterGauntlet:balance_checked', { hasBalance });
      if (!hasBalance) {
        setError('Insufficient SOL balance. You need at least 0.01 SOL.');
        setPhase('error');
        return false;
      }

      await ensureGauntletInitialized();

      const nonces = await fetchSessionNonces();
      const [gauntletSessionPda] = deriveGauntletSessionPda(wallet.publicKey, nonces.gauntlet);
      if (hasPendingCleanups) {
        const waitStartedAt = Date.now();
        while (Date.now() - waitStartedAt < GAUNTLET_CLEANUP_WAIT_TIMEOUT_MS) {
          await processPendingCleanups().catch((err) => {
            console.warn('[useGauntlet] cleanup wait: processPendingCleanups failed', err);
          });
          const pendingSessionInfo = await connection.getAccountInfo(
            gauntletSessionPda,
            SOLANA_CONFIG.commitment
          );
          if (!pendingSessionInfo) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, GAUNTLET_CLEANUP_POLL_MS));
        }

        const stillPendingSessionInfo = await connection.getAccountInfo(
          gauntletSessionPda,
          SOLANA_CONFIG.commitment
        );
        if (stillPendingSessionInfo) {
          setError(
            'Previous gauntlet session cleanup is still in progress. Please wait a few seconds and try again.'
          );
          setPhase('error');
          return false;
        }
      }

      console.log('[useGauntlet] enterGauntlet:checking_existing_session', {
        gauntletSessionPda: gauntletSessionPda.toBase58(),
      });
      await closeOrphanedGauntletEchoes(gauntletSessionPda);
      const existingGauntletSessionInfo = await connection.getAccountInfo(
        gauntletSessionPda,
        SOLANA_CONFIG.commitment
      );
      console.log('[useGauntlet] enterGauntlet:existing_session_check_result', {
        exists: !!existingGauntletSessionInfo,
      });

      let shouldSkipEnterTx = !!existingGauntletSessionInfo;
      let needsFreshStart = false;

      if (existingGauntletSessionInfo) {
        // Check if the existing session is dead or stuck before resuming
        const [gameStatePda] = deriveGameStatePda(gauntletSessionPda);
        const gameplayProgram = createGameplayStateProgram(connection);
        const gameState = await fetchGameState(gameplayProgram, gameStatePda);

        if (gameState?.isDead) {
          console.log('[useGauntlet] enterGauntlet:existing_session_is_dead, abandoning');
          await forceAbandonCurrentSession();
          needsFreshStart = true;
          shouldSkipEnterTx = false;
        } else if (gameState?.bossFightReady) {
          console.log('[useGauntlet] enterGauntlet:existing_session_stuck (bossFightReady), abandoning');
          await forceAbandonCurrentSession();
          needsFreshStart = true;
          shouldSkipEnterTx = false;
        } else {
          console.log('[useGauntlet] enterGauntlet:resuming_existing_session');
          onCommitted?.();
          const switchResult = await switchToGauntletSessionWithRetry(gauntletSessionPda);
          if (!switchResult.success) {
            setError(switchResult.error ?? 'Failed to resume gauntlet session');
            setPhase('error');
            return false;
          }
          const resumeValidation = await validateResumedGauntletState(
            gauntletSessionPda,
            gameState
          );
          if (!resumeValidation.success) {
            setError(resumeValidation.error ?? 'Failed to validate resumed gauntlet session');
            setPhase('error');
            return false;
          }
          // Ensure ER VRF (map + gameplay) is fulfilled before proceeding.
          // On localnet this is a no-op. On devnet/mainnet, re-requests VRF if needed
          // so we never proceed with the fallback seed (Rule 3: no non-VRF randomness).
          const vrfResult = await retryErVrfForSession(gauntletSessionPda.toBase58());
          if (!vrfResult.success) {
            setError(vrfResult.error ?? 'Randomness (VRF) not received from oracle — please try again');
            setPhase('error');
            return false;
          }
        }
      }

      if (needsFreshStart) {
        // Dead/stuck session was cleaned up — start a fresh gauntlet
        console.log('[useGauntlet] enterGauntlet:starting_fresh_after_cleanup');
        const startResult = await startGauntletGame(onCommitted);
        if (!startResult.success) {
          setError(startResult.error ?? 'Failed to start gauntlet session after cleanup');
          setPhase('error');
          return false;
        }
        const switchResult = await switchToGauntletSessionWithRetry(gauntletSessionPda);
        if (!switchResult.success) {
          setError(switchResult.error ?? 'Failed to finalize gauntlet session setup');
          setPhase('error');
          return false;
        }
        } else if (!existingGauntletSessionInfo) {
          console.log('[useGauntlet] enterGauntlet:starting_new_gauntlet_session');
          const startResult = await startGauntletGame(onCommitted);
          console.log('[useGauntlet] enterGauntlet:startGauntletGame_result', startResult);
          if (!startResult.success) {
          const canRecoverViaResume = isRecoverableStartError(startResult.error);
          if (!canRecoverViaResume) {
            setError(startResult.error ?? 'Failed to start gauntlet session');
            setPhase('error');
            return false;
          }

          // Recovery path: session creation can succeed while delegate/setup reports a transient failure.
          // If the gauntlet session account now exists, continue as resume.
          const postStartSessionInfo = await connection.getAccountInfo(
            gauntletSessionPda,
            SOLANA_CONFIG.commitment
          );
          if (!postStartSessionInfo) {
            setError(startResult.error ?? 'Failed to start gauntlet session');
            setPhase('error');
            return false;
          }

          console.warn(
            '[useGauntlet] enterGauntlet:recovering_after_start_failure_via_resume',
            startResult.error
          );
          shouldSkipEnterTx = true;
          const switchResult = await switchToGauntletSessionWithRetry(gauntletSessionPda);
          if (!switchResult.success) {
            setError(switchResult.error ?? 'Failed to resume gauntlet session');
            setPhase('error');
            return false;
          }
          const vrfResult = await retryErVrfForSession(gauntletSessionPda.toBase58());
          if (!vrfResult.success) {
            setError(vrfResult.error ?? 'Randomness (VRF) not received from oracle — please try again');
            setPhase('error');
            return false;
          }
        } else {
          // Run the same switch path as resume so first entry gets identical finalized setup.
          const switchResult = await switchToGauntletSessionWithRetry(gauntletSessionPda);
          if (!switchResult.success) {
            setError(switchResult.error ?? 'Failed to finalize gauntlet session setup');
            setPhase('error');
            return false;
          }
        }
      }

      if (shouldSkipEnterTx) {
        console.log('[useGauntlet] enterGauntlet:resume_existing_session_skip_enter_tx');
      } else {
        console.log('[useGauntlet] enterGauntlet:new_session_ready_skip_extra_enter_tx');
      }

      setPhase('queued');
      return true;
    } catch (err) {
      console.error('[useGauntlet] enterGauntlet failed:', err);
      setError(getGauntletErrorMessage(err));
      setPhase('error');
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    wallet.publicKey,
    checkBalance,
    closeOrphanedGauntletEchoes,
    ensureGauntletInitialized,
    startGauntletGame,
    switchToGauntletSessionWithRetry,
    connection,
    processPendingCleanups,
    hasPendingCleanups,
    fetchSessionNonces,
    retryErVrfForSession,
    validateResumedGauntletState,
  ]);

  const reset = useCallback(() => {
    setPhase('confirm');
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    phase,
    error,
    isLoading,
    enterGauntlet,
    reset,
  };
}
