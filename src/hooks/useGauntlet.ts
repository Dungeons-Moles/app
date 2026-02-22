import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSession } from '@/contexts/SessionContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createMapGeneratorProgram } from '@/services/solana/programs';
import {
  deriveGauntletSessionPda,
  deriveGeneratedMapPda,
  deriveGameStatePda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  GAUNTLET_ENTRY_LAMPORTS,
  buildInitializeGauntletTransaction,
  deriveGauntletConfigPda,
  getGauntletErrorMessage,
} from '@/services/solana/gauntlet';
import { fetchGeneratedMap } from '@/services/solana/mapGeneratorClient';
import { fetchGameState } from '@/services/solana/gameplayState';

export type GauntletPhase = 'confirm' | 'queued' | 'error';
const MAX_SEED_FETCH_RETRIES = 8;
const SEED_FETCH_RETRY_DELAY_MS = 250;
const MAX_SWITCH_RETRIES = 3;
const SWITCH_RETRY_DELAY_MS = 250;

function isNonBlockingDelegationError(errorMessage: string | undefined): boolean {
  const message = (errorMessage ?? '').toLowerCase();
  return (
    message.includes('failed to delegate session to rollup') ||
    message.includes('delegategameplayaccounts') ||
    message.includes('access violation') ||
    message.includes('failed to complete')
  );
}

function isRecoverableStartError(errorMessage: string | undefined): boolean {
  const message = (errorMessage ?? '').toLowerCase();
  return (
    message.includes('failed to delegate session to rollup') ||
    message.includes('no active session to delegate') ||
    message.includes('delegategameplayaccounts') ||
    message.includes('access violation') ||
    message.includes('failed to complete')
  );
}

export function useGauntlet() {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const { mapSeed, startGauntletGame, switchToSession, queueEndGame, forceAbandonCurrentSession } = useSession();
  const { connection } = useSolanaConnection();

  const [phase, setPhase] = useState<GauntletPhase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSeed, setActiveSeed] = useState<bigint | null>(null);

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

  const resolveSessionGeneratedSeed = useCallback(
    async (sessionPda: PublicKey): Promise<bigint | null> => {
      const mapProgram = createMapGeneratorProgram(connection);
      for (let attempt = 1; attempt <= MAX_SEED_FETCH_RETRIES; attempt++) {
        try {
          const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
          const generatedMap = await fetchGeneratedMap(mapProgram, generatedMapPda);
          if (generatedMap?.seed !== undefined && generatedMap.seed !== null) {
            return generatedMap.seed;
          }
        } catch {
          // Retry while generated map account settles after start tx.
        }
        if (attempt < MAX_SEED_FETCH_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, SEED_FETCH_RETRY_DELAY_MS));
        }
      }
      return null;
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
        if (isNonBlockingDelegationError(switchResult.error)) {
          console.warn(
            '[useGauntlet] enterGauntlet:continuing_despite_delegation_failure',
            switchResult.error
          );
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

  const enterGauntlet = useCallback(async (): Promise<boolean> => {
    if (!wallet.publicKey) {
      setError('Wallet not connected');
      setPhase('error');
      return false;
    }

    setIsLoading(true);
    setError(null);
    console.log('[useGauntlet] enterGauntlet:start', {
      wallet: wallet.publicKey.toBase58(),
      currentMapSeed: mapSeed?.toString() ?? null,
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

      let seed: bigint | null = null;

      const [gauntletSessionPda] = deriveGauntletSessionPda(wallet.publicKey);
      console.log('[useGauntlet] enterGauntlet:checking_existing_session', {
        gauntletSessionPda: gauntletSessionPda.toBase58(),
      });
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
          console.log('[useGauntlet] enterGauntlet:existing_session_is_dead, queueing cleanup');
          await queueEndGame(gameState.campaignLevel, false);
          needsFreshStart = true;
          shouldSkipEnterTx = false;
        } else if (gameState?.bossFightReady) {
          console.log('[useGauntlet] enterGauntlet:existing_session_stuck (bossFightReady), abandoning');
          await forceAbandonCurrentSession();
          needsFreshStart = true;
          shouldSkipEnterTx = false;
        } else {
          console.log('[useGauntlet] enterGauntlet:resuming_existing_session');
          const switchResult = await switchToGauntletSessionWithRetry(gauntletSessionPda);
          if (!switchResult.success) {
            setError(switchResult.error ?? 'Failed to resume gauntlet session');
            setPhase('error');
            return false;
          }
          seed = await resolveSessionGeneratedSeed(gauntletSessionPda);
        }
      }

      if (needsFreshStart) {
        // Dead/stuck session was cleaned up — start a fresh gauntlet
        console.log('[useGauntlet] enterGauntlet:starting_fresh_after_cleanup');
        const startResult = await startGauntletGame();
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
        seed = startResult.mapSeed ?? (await resolveSessionGeneratedSeed(gauntletSessionPda));
      } else if (!existingGauntletSessionInfo) {
        console.log('[useGauntlet] enterGauntlet:starting_new_gauntlet_session');
        const startResult = await startGauntletGame();
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
          seed = await resolveSessionGeneratedSeed(gauntletSessionPda);
        } else {
          // Run the same switch path as resume so first entry gets identical finalized setup.
          const switchResult = await switchToGauntletSessionWithRetry(gauntletSessionPda);
          if (!switchResult.success) {
            setError(switchResult.error ?? 'Failed to finalize gauntlet session setup');
            setPhase('error');
            return false;
          }
          seed = startResult.mapSeed ?? (await resolveSessionGeneratedSeed(gauntletSessionPda));
        }
      }

      if (seed === null) {
        console.warn(
          '[useGauntlet] enterGauntlet:seed_unavailable_continuing_with_onchain_restore_only'
        );
      }

      if (shouldSkipEnterTx) {
        console.log('[useGauntlet] enterGauntlet:resume_existing_session_skip_enter_tx');
      } else {
        console.log('[useGauntlet] enterGauntlet:new_session_ready_skip_extra_enter_tx');
      }

      setActiveSeed(seed);
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
    ensureGauntletInitialized,
    mapSeed,
    startGauntletGame,
    switchToGauntletSessionWithRetry,
    connection,
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
    activeSeed,
    enterGauntlet,
    reset,
  };
}
