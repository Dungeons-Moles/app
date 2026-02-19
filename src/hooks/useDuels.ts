import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSession } from '@/contexts/SessionContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createMapGeneratorProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { GAMEPLAY_STATE_PROGRAM_ID, deriveDuelSessionPda, deriveGeneratedMapPda } from '@/services/solana/constants';
import { fetchGeneratedMap } from '@/services/solana/mapGeneratorClient';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  buildEnterDuelTransaction,
  fetchDuelQueue,
  fetchDuelEntry,
  parseDuelEvents,
  getDuelsErrorMessage,
  DUEL_ENTRY_LAMPORTS,
  type DuelResolvedEvent,
} from '@/services/solana/duels';

export type DuelsPhase = 'confirm' | 'queued' | 'error';

export interface DuelHistoryItem {
  signature: string;
  slot: number;
  playedAtUnix: number | null;
  seed: bigint;
  opponentWallet: string | null;
  opponentProfileName: string;
  isWinner: boolean;
  winnerPayoutLamports: number;
  resolution: DuelResolvedEvent['resolution'];
  turnsTaken: number | null;
}

export function useDuels() {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const { mapSeed, startDuelGame, switchToSession } = useSession();
  const { connection, gameplayConnection, erConnection } = useSolanaConnection();

  const [phase, setPhase] = useState<DuelsPhase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [queuedSeed, setQueuedSeed] = useState<bigint | null>(null);
  const [queuedSlot, setQueuedSlot] = useState<number | null>(null);
  const [history, setHistory] = useState<DuelHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const ENTER_DUEL_MAX_SEND_ATTEMPTS = 2;
  const MAX_SEED_FETCH_RETRIES = 8;
  const SEED_FETCH_RETRY_DELAY_MS = 250;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchProfileNameByWallet = useCallback(
    async (walletKey: PublicKey): Promise<string | null> => {
      try {
        const program = createPlayerProfileProgram(connection);
        const [profilePda] = derivePlayerProfilePda(walletKey);
        const account = await (
          program.account as {
            playerProfile: {
              fetchNullable: (address: PublicKey) => Promise<{ name?: unknown } | null>;
            };
          }
        ).playerProfile.fetchNullable(profilePda);

        if (!account || typeof account.name !== 'string') return null;
        const trimmed = account.name.trim();
        return trimmed.length > 0 ? trimmed : null;
      } catch {
        return null;
      }
    },
    [connection]
  );

  const refreshQueueStatus = useCallback(async () => {
    if (!wallet.publicKey || mapSeed === null) return;
    // Duel queue is a non-delegated base chain account
    const program = createGameplayStateProgram(connection);
    const queue = await fetchDuelQueue(program, mapSeed);
    if (!queue) return;

    const ourKey = wallet.publicKey.toBase58();
    if (queue.playerA?.player.toBase58() === ourKey || queue.playerB?.player.toBase58() === ourKey) {
      if (isMountedRef.current) {
        setQueuedSeed(mapSeed);
        setQueuedSlot(queue.playerA?.player.toBase58() === ourKey ? 1 : 2);
        setPhase('queued');
      }
    }
  }, [wallet.publicKey, mapSeed, connection]);

  useEffect(() => {
    void refreshQueueStatus();
  }, [refreshQueueStatus]);

  const isRecoverableDuelStartError = useCallback((errorMessage: string | undefined): boolean => {
    const message = (errorMessage ?? '').toLowerCase();
    return (
      message.includes('session key signer not available for delegation') ||
      message.includes('failed to delegate session to rollup') ||
      message.includes('no active session to delegate') ||
      message.includes('delegatesession') ||
      message.includes('access violation') ||
      message.includes('failed to complete')
    );
  }, []);

  const resolveSessionGeneratedSeed = useCallback(
    async (sessionPda: PublicKey): Promise<bigint | null> => {
      const connectionsToTry = [gameplayConnection, erConnection, connection];
      for (let attempt = 1; attempt <= MAX_SEED_FETCH_RETRIES; attempt++) {
        for (const conn of connectionsToTry) {
          try {
            const mapProgram = createMapGeneratorProgram(conn);
            const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
            const generatedMap = await fetchGeneratedMap(mapProgram, generatedMapPda);
            if (generatedMap?.seed !== undefined && generatedMap.seed !== null) {
              return generatedMap.seed;
            }
          } catch {
            // Try next connection / retry while generated map settles after start tx.
          }
        }
        if (attempt < MAX_SEED_FETCH_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, SEED_FETCH_RETRY_DELAY_MS));
        }
      }
      return null;
    },
    [connection, erConnection, gameplayConnection]
  );

  const switchToDuelSessionOrTolerateDelegation = useCallback(
    async (duelSessionPda: PublicKey): Promise<{ success: boolean; error?: string }> => {
      const switchResult = await switchToSession(duelSessionPda.toBase58());
      if (switchResult.success) {
        return { success: true };
      }
      const message = (switchResult.error ?? '').toLowerCase();
      const nonBlocking =
        message.includes('session key signer not available for delegation') ||
        message.includes('failed to delegate session to rollup') ||
        message.includes('delegatesession') ||
        message.includes('access violation') ||
        message.includes('failed to complete');
      if (nonBlocking) {
        console.warn(
          '[useDuels] enterCurrentSessionDuel:continuing_despite_switch_delegation_error',
          switchResult.error
        );
        return { success: true };
      }
      return { success: false, error: switchResult.error ?? 'Failed to resume duel session' };
    },
    [switchToSession]
  );

  const enterCurrentSessionDuel = useCallback(async (): Promise<boolean> => {
    if (!wallet.publicKey) {
      setError('Wallet not connected');
      setPhase('error');
      return false;
    }

    setIsLoading(true);
    setError(null);
    console.log('[useDuels] enterCurrentSessionDuel:start', {
      wallet: wallet.publicKey.toBase58(),
      mapSeed: mapSeed?.toString() ?? null,
    });

    try {
      const hasBalance = await checkBalance(BigInt(DUEL_ENTRY_LAMPORTS + 10_000));
      if (!hasBalance) {
        setError('Insufficient SOL balance. You need at least 0.1 SOL.');
        setPhase('error');
        return false;
      }

      const [duelSessionPda] = deriveDuelSessionPda(wallet.publicKey);
      const existingDuelSessionInfo = await connection.getAccountInfo(
        duelSessionPda,
        SOLANA_CONFIG.commitment
      );

      if (!existingDuelSessionInfo) {
        // ─── NEW GAME ───
        // startDuelGame now calls enter_duel on base chain before delegation.
        const startResult = await startDuelGame();
        if (!startResult.success) {
          const canRecoverViaResume = isRecoverableDuelStartError(startResult.error);
          if (!canRecoverViaResume) {
            setError(startResult.error ?? 'Failed to start duel session');
            setPhase('error');
            return false;
          }
          // Session may have been created despite the error — fall through to resume handling
          const postStartInfo = await connection.getAccountInfo(duelSessionPda, SOLANA_CONFIG.commitment);
          if (!postStartInfo) {
            setError(startResult.error ?? 'Failed to start duel session');
            setPhase('error');
            return false;
          }
          // Fall through to the resume / recovery logic below
        } else if (startResult.duelQueued) {
          // Successfully queued via startDuelGame (enter_duel ran before delegation)
          console.log('[useDuels] enterCurrentSessionDuel:queued_via_startDuelGame', {
            seed: startResult.duelQueued.seed.toString(),
            slot: startResult.duelQueued.slot,
          });
          setQueuedSeed(startResult.duelQueued.seed);
          setQueuedSlot(startResult.duelQueued.slot);
          setPhase('queued');
          return true;
        }
        // startDuelGame succeeded but duelQueued is missing — fall through to resume check
      }

      // ─── RESUME / RECOVERY ───
      // Session exists (either from resume or fallthrough from new game).
      // Check for existing duel entry on BASE CHAIN (duel_entry is non-delegated).
      const baseProgram = createGameplayStateProgram(connection);
      const existingEntry = await fetchDuelEntry(baseProgram, duelSessionPda);

      if (existingEntry) {
        // Already queued — just switch to the session and proceed
        console.log('[useDuels] Already queued, skipping enterDuel tx');
        const switchResult = await switchToDuelSessionOrTolerateDelegation(duelSessionPda);
        if (!switchResult.success) {
          setError(switchResult.error ?? 'Failed to resume duel session');
          setPhase('error');
          return false;
        }
        setQueuedSeed(existingEntry.seed);
        setPhase('queued');
        return true;
      }

      // No duel entry yet. Try to call enter_duel on base chain (only works if
      // game_state hasn't been delegated yet).
      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), duelSessionPda.toBuffer()],
        GAMEPLAY_STATE_PROGRAM_ID
      );
      const gameStateInfo = await connection.getAccountInfo(gameStatePda);
      if (!gameStateInfo || !gameStateInfo.owner.equals(GAMEPLAY_STATE_PROGRAM_ID)) {
        // game_state is delegated or missing — can't call enter_duel on base chain
        setError('Duel session exists but duel entry is missing. Please abandon this session and start a new duel.');
        setPhase('error');
        return false;
      }

      // game_state is still on base chain — safe to call enter_duel
      const duelSeed = await resolveSessionGeneratedSeed(duelSessionPda);
      if (duelSeed === null) {
        setError('Failed to resolve duel seed from session.');
        setPhase('error');
        return false;
      }
      console.log('[useDuels] enterCurrentSessionDuel:calling_enter_duel_on_base', {
        duelSeed: duelSeed.toString(),
      });

      let signature: string | null = null;
      for (let attempt = 1; attempt <= ENTER_DUEL_MAX_SEND_ATTEMPTS; attempt++) {
        try {
          const tx = await buildEnterDuelTransaction(
            connection,
            baseProgram,
            wallet.publicKey,
            gameStatePda,
            duelSessionPda,
            duelSeed
          );
          signature = await signAndSendTransaction(tx);
          console.log('[useDuels] enterCurrentSessionDuel:enter_tx_sent', { signature, attempt });
          await connection.confirmTransaction(signature, 'confirmed');
          console.log('[useDuels] enterCurrentSessionDuel:enter_tx_confirmed', { signature, attempt });
          break;
        } catch (sendErr) {
          const message = sendErr instanceof Error ? sendErr.message.toLowerCase() : String(sendErr).toLowerCase();
          if (attempt < ENTER_DUEL_MAX_SEND_ATTEMPTS && message.includes('blockhash not found')) {
            continue;
          }
          throw sendErr;
        }
      }
      if (!signature) {
        throw new Error('Failed to send duel entry transaction');
      }

      const events = await parseDuelEvents(connection, baseProgram, signature);
      if (!events.queued) {
        setError('Transaction succeeded but DuelQueued event was not found.');
        setPhase('error');
        return false;
      }

      // enter_duel succeeded on base chain — now switch to session (which delegates)
      const switchResult = await switchToDuelSessionOrTolerateDelegation(duelSessionPda);
      if (!switchResult.success) {
        console.warn('[useDuels] enterCurrentSessionDuel:post_queue_switch_failed', switchResult.error);
      }
      setQueuedSeed(events.queued.seed);
      setQueuedSlot(events.queued.slot);
      setPhase('queued');
      return true;
    } catch (err) {
      console.error('[useDuels] enterCurrentSessionDuel failed:', err);
      setError(getDuelsErrorMessage(err));
      setPhase('error');
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    wallet.publicKey,
    mapSeed,
    startDuelGame,
    switchToDuelSessionOrTolerateDelegation,
    checkBalance,
    connection,
    signAndSendTransaction,
    resolveSessionGeneratedSeed,
    isRecoverableDuelStartError,
  ]);

  const loadHistory = useCallback(
    async (maxMatches = 20) => {
      if (!wallet.publicKey) {
        setHistoryError('Wallet not connected');
        return;
      }

      setIsHistoryLoading(true);
      setHistoryError(null);

      try {
        const gameplayProgram = createGameplayStateProgram(connection);
        const ourKey = wallet.publicKey.toBase58();

        const profileNameCache = new Map<string, string>();
        const signaturesById = new Map<string, { signature: string; slot: number; blockTime: number | null }>();

        const [walletSigs, programSigs] = await Promise.all([
          connection.getSignaturesForAddress(wallet.publicKey, { limit: 100 }, 'confirmed'),
          connection.getSignaturesForAddress(GAMEPLAY_STATE_PROGRAM_ID, { limit: 150 }, 'confirmed'),
        ]);

        for (const sig of [...walletSigs, ...programSigs]) {
          if (!signaturesById.has(sig.signature)) {
            signaturesById.set(sig.signature, {
              signature: sig.signature,
              slot: sig.slot ?? 0,
              blockTime: sig.blockTime ?? null,
            });
          }
        }

        const ordered = Array.from(signaturesById.values()).sort((a, b) => b.slot - a.slot);
        const matches: DuelHistoryItem[] = [];

        for (const sigInfo of ordered) {
          const events = await parseDuelEvents(connection, gameplayProgram, sigInfo.signature);
          if (!events.resolved) continue;

          const playerA = events.resolved.playerA.toBase58();
          const playerB = events.resolved.playerB?.toBase58() ?? null;
          if (playerA !== ourKey && playerB !== ourKey) continue;

          const opponentWallet = playerA === ourKey ? playerB : playerA;

          let opponentProfileName = 'Opponent';
          if (opponentWallet) {
            const cached = profileNameCache.get(opponentWallet);
            if (cached) {
              opponentProfileName = cached;
            } else {
              const fetched = await fetchProfileNameByWallet(new PublicKey(opponentWallet));
              opponentProfileName =
                fetched ?? `${opponentWallet.slice(0, 4)}..${opponentWallet.slice(-4)}`;
              profileNameCache.set(opponentWallet, opponentProfileName);
            }
          }

          matches.push({
            signature: sigInfo.signature,
            slot: sigInfo.slot,
            playedAtUnix: sigInfo.blockTime,
            seed: events.resolved.seed,
            opponentWallet,
            opponentProfileName,
            isWinner: events.resolved.winner?.toBase58() === ourKey,
            winnerPayoutLamports: events.resolved.winnerPayout,
            resolution: events.resolved.resolution,
            turnsTaken: events.resolved.turnsTaken,
          });

          if (matches.length >= maxMatches) break;
        }

        if (isMountedRef.current) {
          setHistory(matches);
        }
      } catch (err) {
        console.error('[useDuels] Failed to load history:', err);
        if (isMountedRef.current) {
          setHistoryError('Failed to load match history. Please try again.');
        }
      } finally {
        if (isMountedRef.current) {
          setIsHistoryLoading(false);
        }
      }
    },
    [wallet.publicKey, connection, fetchProfileNameByWallet]
  );

  const reset = useCallback(() => {
    setPhase('confirm');
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    phase,
    error,
    isLoading,
    queuedSeed,
    queuedSlot,
    history,
    isHistoryLoading,
    historyError,
    enterCurrentSessionDuel,
    loadHistory,
    refreshQueueStatus,
    reset,
  };
}
