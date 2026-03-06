import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSession } from '@/contexts/SessionContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { GAMEPLAY_STATE_PROGRAM_ID, deriveDuelSessionPda } from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  buildEnterDuelTransaction,
  fetchDuelQueue,
  fetchDuelEntry,
  parseDuelEvents,
  parseDuelEventsFromLogs,
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

const DUEL_CLEANUP_WAIT_TIMEOUT_MS = 45000;
const DUEL_CLEANUP_POLL_MS = 1000;

export function useDuels() {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const {
    mapSeed,
    startDuelGame,
    switchToSession,
    processPendingCleanups,
    hasPendingCleanups,
    fetchSessionNonces,
    retryErVrfForSession,
  } = useSession();
  const { connection } = useSolanaConnection();

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

        if (!account) return null;
        const raw = account.name;
        let decoded: string;
        if (typeof raw !== 'string') {
          decoded = Buffer.from(raw as ArrayLike<number>).toString('utf-8').replace(/\0/g, '').trim();
        } else if (/^\d+(,\d+)*$/.test(raw)) {
          decoded = Buffer.from(raw.split(',').map(Number)).toString('utf-8').replace(/\0/g, '').trim();
        } else {
          decoded = raw.replace(/\0/g, '').trim();
        }
        const trimmed = decoded;
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
        // Do not override 'error' phase — user must explicitly retry after a failed start
        setPhase((current) => (current === 'error' ? current : 'queued'));
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
      message.includes('delegation not fully propagated') ||
      message.includes('no active session to delegate') ||
      message.includes('delegatesession') ||
      message.includes('access violation') ||
      message.includes('failed to complete')
    );
  }, []);

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
        message.includes('delegation not fully propagated') ||
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

  const enterCurrentSessionDuel = useCallback(async (onCommitted?: () => void): Promise<boolean> => {
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

      const nonces = await fetchSessionNonces();
      const [duelSessionPda] = deriveDuelSessionPda(wallet.publicKey, nonces.duel);

      // If a previous duel run is still being undelegated/closed in background,
      // wait for the duel session PDA to disappear before starting a new one.
      if (hasPendingCleanups) {
        const waitStartedAt = Date.now();
        while (Date.now() - waitStartedAt < DUEL_CLEANUP_WAIT_TIMEOUT_MS) {
          await processPendingCleanups().catch((err) => {
            console.warn('[useDuels] cleanup wait: processPendingCleanups failed', err);
          });
          const pendingSessionInfo = await connection.getAccountInfo(
            duelSessionPda,
            SOLANA_CONFIG.commitment
          );
          if (!pendingSessionInfo) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, DUEL_CLEANUP_POLL_MS));
        }

        const stillPendingSessionInfo = await connection.getAccountInfo(
          duelSessionPda,
          SOLANA_CONFIG.commitment
        );
        if (stillPendingSessionInfo) {
          setError(
            'Previous duel session cleanup is still in progress. Please wait a few seconds and try again.'
          );
          setPhase('error');
          return false;
        }
      }

      const existingDuelSessionInfo = await connection.getAccountInfo(
        duelSessionPda,
        SOLANA_CONFIG.commitment
      );

      if (!existingDuelSessionInfo) {
        // ─── NEW GAME ───
        // startDuelGame now calls enter_duel on base chain before delegation.
        const startResult = await startDuelGame(onCommitted);
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
        onCommitted?.();
        const switchResult = await switchToDuelSessionOrTolerateDelegation(duelSessionPda);
        if (!switchResult.success) {
          setError(switchResult.error ?? 'Failed to resume duel session');
          setPhase('error');
          return false;
        }
        // Ensure ER VRF (map + gameplay) is fulfilled before proceeding.
        // On localnet this is a no-op. On devnet/mainnet, re-requests VRF if needed
        // so we never proceed with the fallback seed (Rule 3: no non-VRF randomness).
        const vrfResult = await retryErVrfForSession(duelSessionPda.toBase58());
        if (!vrfResult.success) {
          setError(vrfResult.error ?? 'Randomness (VRF) not received from oracle — please try again');
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
      console.log('[useDuels] enterCurrentSessionDuel:calling_enter_duel_on_base');

      let signature: string | null = null;
      for (let attempt = 1; attempt <= ENTER_DUEL_MAX_SEND_ATTEMPTS; attempt++) {
        try {
          const tx = await buildEnterDuelTransaction(
            connection,
            baseProgram,
            wallet.publicKey,
            gameStatePda,
            duelSessionPda
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
      onCommitted?.();
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
    isRecoverableDuelStartError,
    processPendingCleanups,
    hasPendingCleanups,
    fetchSessionNonces,
    retryErVrfForSession,
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
        const ourKey = wallet.publicKey.toBase58();
        const SIG_LIMIT = 30;

        // 1. Fetch recent wallet signatures (user-scoped)
        const signatures = await connection.getSignaturesForAddress(
          wallet.publicKey,
          { limit: SIG_LIMIT },
          'confirmed'
        );

        // 2. Fetch all transactions in parallel
        const txs = await Promise.all(
          signatures.map((s) =>
            connection
              .getTransaction(s.signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
              })
              .catch(() => null)
          )
        );

        // 3. Parse duel matches from results
        const duelMatches: {
          sigInfo: (typeof signatures)[0];
          resolved: NonNullable<ReturnType<typeof parseDuelEventsFromLogs>['resolved']>;
          opponentWallet: string | null;
        }[] = [];

        for (let i = 0; i < txs.length && duelMatches.length < maxMatches; i++) {
          const tx = txs[i];
          if (!tx?.meta?.logMessages) continue;
          const events = parseDuelEventsFromLogs(tx.meta.logMessages);
          if (!events.resolved) continue;

          const playerA = events.resolved.playerA.toBase58();
          const playerB = events.resolved.playerB?.toBase58() ?? null;
          if (playerA !== ourKey && playerB !== ourKey) continue;

          duelMatches.push({
            sigInfo: signatures[i],
            resolved: events.resolved,
            opponentWallet: playerA === ourKey ? playerB : playerA,
          });
        }

        // 4. Fetch opponent profile names in parallel
        const uniqueOpponents = [
          ...new Set(
            duelMatches
              .map((m) => m.opponentWallet)
              .filter((w): w is string => w !== null)
          ),
        ];
        const profileNameMap = new Map<string, string>();
        if (uniqueOpponents.length > 0) {
          const profileResults = await Promise.all(
            uniqueOpponents.map((w) =>
              fetchProfileNameByWallet(new PublicKey(w)).catch(() => null)
            )
          );
          for (let k = 0; k < uniqueOpponents.length; k++) {
            const w = uniqueOpponents[k];
            profileNameMap.set(w, profileResults[k] ?? `${w.slice(0, 4)}..${w.slice(-4)}`);
          }
        }

        // 5. Build history items
        const matches: DuelHistoryItem[] = duelMatches.map((m) => ({
          signature: m.sigInfo.signature,
          slot: m.sigInfo.slot ?? 0,
          playedAtUnix: m.sigInfo.blockTime ?? null,
          seed: m.resolved.seed,
          opponentWallet: m.opponentWallet,
          opponentProfileName: m.opponentWallet
            ? profileNameMap.get(m.opponentWallet) ?? 'Opponent'
            : 'Opponent',
          isWinner: m.resolved.winner?.toBase58() === ourKey,
          winnerPayoutLamports: m.resolved.winnerPayout,
          resolution: m.resolved.resolution,
          turnsTaken: m.resolved.turnsTaken,
        }));

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
