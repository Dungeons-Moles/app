import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSession } from '@/contexts/SessionContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram } from '@/services/solana/programs';
import { deriveGauntletSessionPda, GAMEPLAY_STATE_PROGRAM_ID } from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  GAUNTLET_ENTRY_LAMPORTS,
  buildInitializeGauntletTransaction,
  buildEnterGauntletTransaction,
  deriveGauntletConfigPda,
  getGauntletErrorMessage,
} from '@/services/solana/gauntlet';

export type GauntletPhase = 'confirm' | 'queued' | 'error';
const GAUNTLET_ONCHAIN_LEVEL = 20;

function isGauntletRunMode(runMode: unknown): boolean {
  if (!runMode || typeof runMode !== 'object') return false;
  return 'gauntlet' in (runMode as Record<string, unknown>);
}

export function useGauntlet() {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const { mapSeed, startGauntletGame, switchToSession } = useSession();
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

      let seed = mapSeed;

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

      let alreadyEnteredGauntlet = false;

      if (existingGauntletSessionInfo) {
        console.log('[useGauntlet] enterGauntlet:resuming_existing_session');
        const switchResult = await switchToSession(gauntletSessionPda.toBase58());
        console.log('[useGauntlet] enterGauntlet:switch_result', switchResult);
        if (!switchResult.success) {
          setError(switchResult.error ?? 'Failed to resume gauntlet session');
          setPhase('error');
          return false;
        }
      } else {
        console.log('[useGauntlet] enterGauntlet:starting_new_gauntlet_session');
        const startResult = await startGauntletGame();
        console.log('[useGauntlet] enterGauntlet:startGauntletGame_result', startResult);
        if (!startResult.success) {
          setError(startResult.error ?? 'Failed to start gauntlet session');
          setPhase('error');
          return false;
        }
        seed = startResult.mapSeed ?? seed;
      }

      const [sessionPda] = deriveGauntletSessionPda(wallet.publicKey);
      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), sessionPda.toBuffer()],
        GAMEPLAY_STATE_PROGRAM_ID
      );

      const gameplayProgram = createGameplayStateProgram(connection);
      const gameStateAccount = await (
        gameplayProgram.account as {
          gameState: { fetch: (address: PublicKey) => Promise<{ runMode?: unknown }> };
        }
      ).gameState.fetch(gameStatePda);
      alreadyEnteredGauntlet = isGauntletRunMode(gameStateAccount.runMode);
      console.log('[useGauntlet] enterGauntlet:run_mode_checked', {
        gameStatePda: gameStatePda.toBase58(),
        alreadyEnteredGauntlet,
      });

      if (alreadyEnteredGauntlet) {
        console.log('[useGauntlet] enterGauntlet:already_entered_skip_payment_tx');
        setActiveSeed(seed);
        setPhase('queued');
        return true;
      }

      const tx = await buildEnterGauntletTransaction(
        connection,
        gameplayProgram,
        wallet.publicKey,
        gameStatePda
      );
      console.log('[useGauntlet] enterGauntlet:enter_tx_built', {
        gameStatePda: gameStatePda.toBase58(),
      });

      const signature = await signAndSendTransaction(tx);
      console.log('[useGauntlet] enterGauntlet:enter_tx_sent', { signature });
      await confirmWithTimeout(signature);
      console.log('[useGauntlet] enterGauntlet:enter_tx_confirmed', { signature });

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
    switchToSession,
    connection,
    signAndSendTransaction,
    confirmWithTimeout,
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
