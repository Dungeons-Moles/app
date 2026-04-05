import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSession } from '@/contexts/SessionContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createGameplayStateProgram,
  createPlayerProfileProgram,
  createSessionManagerProgram,
} from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import {
  GAMEPLAY_STATE_PROGRAM_ID,
  deriveDuelSessionPda,
  deriveSessionNoncesPda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  buildEnterDuelTransaction,
  buildResetOrphanedDuelEntryInstruction,
  deriveDuelEntryPda,
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
    if (!wallet.publicKey) return;
    const nonces = await fetchSessionNonces();
    const [duelSessionPda] = deriveDuelSessionPda(wallet.publicKey, nonces.duel);
    const baseProgram = createGameplayStateProgram(connection);
    const entry = await fetchDuelEntry(baseProgram, duelSessionPda);
    if (entry && isMountedRef.current) {
      setQueuedSeed(null);
      setQueuedSlot(null);
      setPhase((current) => (current === 'error' ? current : 'queued'));
    }
  }, [wallet.publicKey, connection, fetchSessionNonces]);

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
      return { success: false, error: switchResult.error ?? 'Failed to resume duel session' };
    },
    [switchToSession]
  );

  const enterCurrentSessionDuel = useCallback(async (onCommitted?: () => void): Promise<boolean | string> => {
    if (!wallet.publicKey) {
      setError('Wallet not connected');
      setPhase('error');
      return false;
    }

    setIsLoading(true);
    setError(null);
    console.log('[useDuels] enterCurrentSessionDuel:start', {
      wallet: wallet.publicKey.toBase58(),
      mapSeed: null,
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
      const [duelEntryPda] = deriveDuelEntryPda(duelSessionPda);

      const [sessionInfoBeforeReset, duelEntryInfoBeforeReset] = await Promise.all([
        connection.getAccountInfo(duelSessionPda, SOLANA_CONFIG.commitment),
        connection.getAccountInfo(duelEntryPda, SOLANA_CONFIG.commitment),
      ]);

      if (!sessionInfoBeforeReset && duelEntryInfoBeforeReset) {
        const gameplayProgram = createGameplayStateProgram(connection);
        const queuedOrphanEntry = await fetchDuelEntry(gameplayProgram, duelSessionPda);
        if (!queuedOrphanEntry) {
          console.log('[useDuels] resetOrphanedDuelEntry:skipping_empty_entry', {
            sessionPda: duelSessionPda.toBase58(),
            duelEntryPda: duelEntryPda.toBase58(),
          });
        } else {
        console.warn('[useDuels] resetOrphanedDuelEntry:found_orphan', {
          sessionPda: duelSessionPda.toBase58(),
          duelEntryPda: duelEntryPda.toBase58(),
          owner: duelEntryInfoBeforeReset.owner.toBase58(),
        });

        if (!duelEntryInfoBeforeReset.owner.equals(SOLANA_CONFIG.programs.gameplayState)) {
          throw new Error(
            `Orphaned duel entry is not owned by gameplay-state: ${duelEntryInfoBeforeReset.owner.toBase58()}`
          );
        }

        const resetIx = await buildResetOrphanedDuelEntryInstruction(
          gameplayProgram,
          duelSessionPda,
          wallet.publicKey
        );
        const resetTx = new Transaction().add(resetIx);
        const resetSig = await signAndSendTransaction(resetTx, { connection });
        await connection.confirmTransaction(resetSig, SOLANA_CONFIG.commitment);

        const postResetEntry = await fetchDuelEntry(gameplayProgram, duelSessionPda);
        if (postResetEntry) {
          throw new Error(
            `Orphaned duel entry still queued after reset attempt: ${duelEntryPda.toBase58()}`
          );
        }

        console.log('[useDuels] resetOrphanedDuelEntry:done', {
          signature: resetSig,
          duelEntryPda: duelEntryPda.toBase58(),
        });
        }
      }

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
          if (startResult.cancelled) return startResult.resumeSessionType ?? false;
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
        setQueuedSeed(null);
        setQueuedSlot(null);
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
      setQueuedSeed(null);
      setQueuedSlot(null);
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
        const SIG_LIMIT = 15;

        // 1. Read duel nonce to derive duel session PDAs (like GauntletHistory).
        //    Querying by duelEntryPda instead of wallet avoids scanning all wallet txs.
        let duelNonce = 0n;
        try {
          const [noncesPda] = deriveSessionNoncesPda(wallet.publicKey);
          const sessionProgram = createSessionManagerProgram(connection);
          const noncesInfo = await connection.getAccountInfo(noncesPda);
          if (noncesInfo) {
            const decoded = sessionProgram.coder.accounts.decode('sessionNonces', noncesInfo.data) as {
              duelNonce: { toString(): string };
            };
            duelNonce = BigInt(decoded.duelNonce.toString());
          }
        } catch {
          // Nonces account doesn't exist yet — use 0
        }

        // 2. Derive duel entry PDAs for current and recent nonces
        const noncesToCheck: bigint[] = [];
        for (let n = duelNonce; n >= 0n && noncesToCheck.length < 5; n--) {
          noncesToCheck.push(n);
        }

        // 3. Fetch signatures for each duel entry PDA in parallel,
        //    plus a small wallet query to catch opponent settle txs that
        //    reference us via creator_wallet (DuelResolved lives there
        //    when we're the creator and the joiner settles second).
        type SigInfo = Awaited<ReturnType<typeof connection.getSignaturesForAddress>>[0];
        const WALLET_SIG_LIMIT = 10;

        const sigFetches: Promise<SigInfo[]>[] = noncesToCheck.map(async (nonce) => {
          const [sessionPda] = deriveDuelSessionPda(wallet.publicKey!, nonce);
          const [duelEntryPda] = deriveDuelEntryPda(sessionPda);
          return connection
            .getSignaturesForAddress(duelEntryPda, { limit: SIG_LIMIT }, 'confirmed')
            .catch(() => [] as SigInfo[]);
        });

        // Wallet fallback: catches settle txs from opponents where our wallet
        // is the creator_wallet account (small limit keeps it fast).
        sigFetches.push(
          connection
            .getSignaturesForAddress(wallet.publicKey, { limit: WALLET_SIG_LIMIT }, 'confirmed')
            .catch(() => [] as SigInfo[])
        );

        const allSignatures = await Promise.all(sigFetches);

        // Flatten, deduplicate by signature, and sort by slot descending
        const sigMap = new Map<string, SigInfo>();
        for (const sigs of allSignatures) {
          for (const sig of sigs) {
            if (!sigMap.has(sig.signature)) {
              sigMap.set(sig.signature, sig);
            }
          }
        }
        const signatures = Array.from(sigMap.values())
          .sort((a, b) => (b.slot ?? 0) - (a.slot ?? 0))
          .slice(0, SIG_LIMIT);

        // 4. Fetch all transactions in parallel
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

        // 5. Parse duel matches from results
        const duelMatches: {
          sigInfo: (typeof signatures)[0];
          resolved: NonNullable<ReturnType<typeof parseDuelEventsFromLogs>['resolved']>;
          opponentWallet: string | null;
          txBlockTime: number | null;
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
            txBlockTime: tx.blockTime ?? null,
          });
        }

        // 6. Fetch opponent profile names in parallel
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

        // 7. Build history items
        const matches: DuelHistoryItem[] = duelMatches.map((m) => ({
          signature: m.sigInfo.signature,
          slot: m.sigInfo.slot ?? 0,
          playedAtUnix: m.sigInfo.blockTime ?? m.txBlockTime ?? null,
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
