/**
 * Pit Draft PvP Hook
 *
 * Manages the full Pit Draft flow: entry confirmation, queueing,
 * match detection, combat data preparation, and result display.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { GAMEPLAY_STATE_PROGRAM_ID } from '@/services/solana/constants';
import {
  buildEnterPitDraftTransaction,
  fetchPitDraftQueue,
  parsePitDraftEvents,
  getPitDraftErrorMessage,
  derivePitDraftQueuePda,
  PIT_DRAFT_ENTRY_LAMPORTS,
  convertItemInstanceToTool,
  convertItemInstanceToGear,
  type PitDraftCombatVisualEvent,
  type PitDraftResolvedEvent,
} from '@/services/solana/pitDraft';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';
import type { CombatantState, Tool, Gear } from '@/game/engine/types';
import { calculateItemStats } from '@/game/entities/items';

// ============================================================================
// Types
// ============================================================================

export type PitDraftPhase =
  | 'confirm'
  | 'queuing'
  | 'matched'
  | 'combat'
  | 'result'
  | 'error';

export interface PitDraftMatchData {
  combatVisual: PitDraftCombatVisualEvent;
  resolved: PitDraftResolvedEvent;
  /** Which player we are: 'a' or 'b' */
  ourSide: 'a' | 'b';
  /** Did we win? */
  isWinner: boolean;
  /** Combat log entries */
  combatLog: BackendCombatLogEntry[];
  /** Our combatant state (for CombatProvider) */
  player: CombatantState;
  /** Opponent combatant state */
  enemy: CombatantState;
  /** Our drafted tool */
  playerTool: Tool | null;
  /** Our drafted gear */
  playerGear: Gear[];
  /** Our starting gold in this Pit Draft fight */
  playerGold: number;
  /** Opponent's drafted tool */
  enemyTool: Tool | null;
  /** Opponent's drafted gear */
  enemyGear: Gear[];
  /** Opponent starting gold in this Pit Draft fight */
  enemyGold: number;
  /** Our wallet address */
  playerWallet: string;
  /** Opponent wallet address */
  opponentWallet: string;
  /** Our profile name (fallback: "You") */
  playerProfileName: string;
  /** Opponent profile name (fallback: "Opponent") */
  opponentProfileName: string;
  /** Opponent's equipped skin pubkey (null if none equipped) */
  opponentSkinPubkey: PublicKey | null;
}

export interface PitDraftHistoryItem {
  signature: string;
  slot: number;
  playedAtUnix: number | null;
  opponentWallet: string;
  opponentProfileName: string;
  isWinner: boolean;
  winnerPayoutLamports: number;
  turnsTaken: number;
}

// ============================================================================
// Hook
// ============================================================================

const QUEUE_POLL_INTERVAL_MS = 3000;
const PIT_DRAFT_BASE_HP = 15;
const PIT_DRAFT_BASE_ATK = 1;
const PIT_DRAFT_BASE_ARM = 0;
const PIT_DRAFT_BASE_SPD = 0;
const PIT_DRAFT_BASE_DIG = 0;

function buildPitDraftCombatant(
  name: string,
  isPlayer: boolean,
  definitionId: string,
  tool: Tool | null,
  gear: Gear[]
): CombatantState {
  const itemStats = calculateItemStats(tool, gear);
  const maxHp = PIT_DRAFT_BASE_HP + (itemStats.hp ?? 0);

  return {
    name,
    emoji: '',
    definitionId,
    isPlayer,
    maxHp,
    hp: maxHp,
    atk: PIT_DRAFT_BASE_ATK + (itemStats.atk ?? 0),
    arm: PIT_DRAFT_BASE_ARM + (itemStats.arm ?? 0),
    spd: PIT_DRAFT_BASE_SPD + (itemStats.spd ?? 0),
    dig: PIT_DRAFT_BASE_DIG + (itemStats.dig ?? 0),
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

export function usePitDraft() {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const { mode, profile } = useProfile();
  const { connection } = useSolanaConnection();

  const [phase, setPhase] = useState<PitDraftPhase>('confirm');
  const [matchData, setMatchData] = useState<PitDraftMatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<PitDraftHistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const processedQueueSignaturesRef = useRef<Set<string>>(new Set());
  const queueAnchorSlotRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const setQueueAnchorFromSignature = useCallback(
    async (signature: string) => {
      try {
        const tx = await connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
        if (tx?.slot !== undefined && tx.slot !== null) {
          queueAnchorSlotRef.current = tx.slot;
          return;
        }
      } catch (err) {
        console.warn('[usePitDraft] Failed to derive queue anchor slot from signature:', err);
      }

      try {
        queueAnchorSlotRef.current = await connection.getSlot('confirmed');
      } catch (err) {
        console.warn('[usePitDraft] Failed to derive queue anchor slot from current slot:', err);
      }
    },
    [connection]
  );

  const setQueueAnchorToCurrentSlot = useCallback(async () => {
    try {
      queueAnchorSlotRef.current = await connection.getSlot('confirmed');
    } catch (err) {
      console.warn('[usePitDraft] Failed to set queue anchor to current slot:', err);
    }
  }, [connection]);

  /**
   * Build match data from parsed events.
   */
  const fetchProfileByWallet = useCallback(
    async (walletKey: PublicKey): Promise<{ name: string | null; equippedSkin: PublicKey | null }> => {
      try {
        const program = createPlayerProfileProgram(connection);
        const [profilePda] = derivePlayerProfilePda(walletKey);
        const account = await (
          program.account as {
            playerProfile: {
              fetchNullable: (address: PublicKey) => Promise<{ name?: unknown; equippedSkin?: unknown } | null>;
            };
          }
        ).playerProfile.fetchNullable(profilePda);

        if (!account) return { name: null, equippedSkin: null };
        const name = typeof account.name === 'string' ? account.name.trim() || null : null;
        const equippedSkin = account.equippedSkin instanceof PublicKey && !PublicKey.default.equals(account.equippedSkin)
          ? account.equippedSkin
          : null;
        return { name, equippedSkin };
      } catch (err) {
        console.warn('[usePitDraft] Failed to fetch profile:', err);
        return { name: null, equippedSkin: null };
      }
    },
    [connection]
  );

  const buildMatchData = useCallback(
    async (
      combatVisual: PitDraftCombatVisualEvent,
      resolved: PitDraftResolvedEvent
    ): Promise<PitDraftMatchData | null> => {
      if (!wallet.publicKey) return null;

      const ourKey = wallet.publicKey.toBase58();
      const isPlayerA = combatVisual.playerA.toBase58() === ourKey;
      const isPlayerB = combatVisual.playerB.toBase58() === ourKey;

      if (!isPlayerA && !isPlayerB) {
        console.warn('[usePitDraft] We are neither player A nor player B');
        return null;
      }

      const ourSide = isPlayerA ? 'a' : 'b';
      const isWinner = resolved.winner.toBase58() === ourKey;

      // For combat replay: map our player to "player" and opponent to "enemy"
      // The combat log uses isPlayer=true for player_a and isPlayer=false for player_b
      // If we are player_b, we need to invert the isPlayer flag in the log
      const combatLog: BackendCombatLogEntry[] = combatVisual.combatLog.map((entry) => ({
        ...entry,
        isPlayer: isPlayerA ? entry.isPlayer : !entry.isPlayer,
      }));

      // Convert on-chain item instances to frontend Tool/Gear objects
      const ourToolInstance = isPlayerA ? combatVisual.playerATool : combatVisual.playerBTool;
      const ourGearInstances = isPlayerA ? combatVisual.playerAGear : combatVisual.playerBGear;
      const oppToolInstance = isPlayerA ? combatVisual.playerBTool : combatVisual.playerATool;
      const oppGearInstances = isPlayerA ? combatVisual.playerBGear : combatVisual.playerAGear;

      const playerTool = ourToolInstance ? convertItemInstanceToTool(ourToolInstance) : null;
      const playerGear = ourGearInstances
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .map((g) => convertItemInstanceToGear(g))
        .filter((g): g is Gear => g !== null);

      const enemyTool = oppToolInstance ? convertItemInstanceToTool(oppToolInstance) : null;
      const enemyGear = oppGearInstances
        .filter((g): g is NonNullable<typeof g> => g !== null)
        .map((g) => convertItemInstanceToGear(g))
        .filter((g): g is Gear => g !== null);

      const player = buildPitDraftCombatant('You', true, 'player', playerTool, playerGear);
      const enemy = buildPitDraftCombatant('Opponent', false, 'pvpOpponent', enemyTool, enemyGear);
      const playerGold = isPlayerA ? combatVisual.playerAGold : combatVisual.playerBGold;
      const enemyGold = isPlayerA ? combatVisual.playerBGold : combatVisual.playerAGold;

      // Wallet addresses
      const playerWallet = ourKey;
      const opponentWallet = isPlayerA
        ? combatVisual.playerB.toBase58()
        : combatVisual.playerA.toBase58();
      const opponentWalletKey = isPlayerA ? combatVisual.playerB : combatVisual.playerA;

      const localProfileName = profile?.name?.trim();
      const playerProfileName = localProfileName && localProfileName.length > 0 ? localProfileName : 'You';
      const opponentProfile = await fetchProfileByWallet(opponentWalletKey);
      const opponentProfileName = opponentProfile.name ?? 'Opponent';

      return {
        combatVisual,
        resolved,
        ourSide,
        isWinner,
        combatLog,
        player,
        enemy,
        playerTool,
        playerGear,
        playerGold,
        enemyTool,
        enemyGear,
        enemyGold,
        playerWallet,
        opponentWallet,
        playerProfileName,
        opponentProfileName,
        opponentSkinPubkey: opponentProfile.equippedSkin,
      };
    },
    [wallet.publicKey, profile?.name, fetchProfileByWallet]
  );

  const tryResolveMatchFromQueueTransactions = useCallback(async (): Promise<boolean> => {
    const program = createGameplayStateProgram(connection);
    const [queuePda] = derivePitDraftQueuePda();
    const signatureSources: PublicKey[] = [queuePda, GAMEPLAY_STATE_PROGRAM_ID];
    if (wallet.publicKey) {
      signatureSources.push(wallet.publicKey);
    }

    const signatureGroups = await Promise.all(
      signatureSources.map((address) =>
        connection.getSignaturesForAddress(address, { limit: 25 }, 'confirmed')
      )
    );

    const signatures = signatureGroups
      .flat()
      .sort((a, b) => (b.slot ?? 0) - (a.slot ?? 0));

    for (const sigInfo of signatures) {
      const anchorSlot = queueAnchorSlotRef.current;
      if (anchorSlot !== null && (sigInfo.slot ?? 0) < anchorSlot) continue;
      if (processedQueueSignaturesRef.current.has(sigInfo.signature)) continue;
      processedQueueSignaturesRef.current.add(sigInfo.signature);

      const events = await parsePitDraftEvents(connection, program, sigInfo.signature);
      if (!events.combatVisual || !events.resolved) continue;

      const data = await buildMatchData(events.combatVisual, events.resolved);
      if (!data) continue;

      if (isMountedRef.current) {
        setMatchData(data);
        setPhase('matched');
      }
      return true;
    }

    return false;
  }, [connection, wallet.publicKey, buildMatchData]);

  /**
   * Poll the queue account to detect when we've been matched.
   */
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;

    pollTimerRef.current = setInterval(async () => {
      if (!isMountedRef.current) {
        stopPolling();
        return;
      }

      try {
        if (await tryResolveMatchFromQueueTransactions()) {
          stopPolling();
          return;
        }

        const program = createGameplayStateProgram(connection);
        const queue = await fetchPitDraftQueue(program);

        // If queue is no longer ours, keep polling a bit longer for the match tx
        // instead of failing immediately (RPC/event propagation can lag).
        if (
          !queue ||
          !queue.waitingPlayer ||
          queue.waitingPlayer.toBase58() !== wallet.publicKey?.toBase58()
        ) {
          // Queue moved away from us: force a second immediate scan so we
          // don't linger in "waiting" if the resolve tx landed just now.
          await tryResolveMatchFromQueueTransactions();
        }
      } catch (err) {
        console.warn('[usePitDraft] Poll error:', err);
      }
    }, QUEUE_POLL_INTERVAL_MS);
  }, [connection, wallet.publicKey, stopPolling, tryResolveMatchFromQueueTransactions]);

  // Restore queued state when opening Pit Draft while already queued on-chain.
  useEffect(() => {
    if (!wallet.publicKey || mode === 'guest') return;
    if (phase !== 'confirm') return;

    let cancelled = false;
    const restoreQueuedState = async () => {
      try {
        const program = createGameplayStateProgram(connection);
        const queue = await fetchPitDraftQueue(program);
        if (cancelled) return;

        if (queue?.waitingPlayer?.toBase58() === wallet.publicKey?.toBase58()) {
          processedQueueSignaturesRef.current.clear();
          await setQueueAnchorToCurrentSlot();
          if (cancelled) return;
          setPhase('queuing');
          startPolling();
        }
      } catch (err) {
        console.warn('[usePitDraft] Failed to restore queue state:', err);
      }
    };

    void restoreQueuedState();

    return () => {
      cancelled = true;
    };
  }, [wallet.publicKey, mode, phase, connection, startPolling, setQueueAnchorToCurrentSlot]);

  /**
   * Enter the Pit Draft: build transaction, sign, send, parse events.
   */
  const enterPitDraft = useCallback(async () => {
    if (!wallet.publicKey) {
      setError('Wallet not connected');
      setPhase('error');
      return;
    }

    if (mode === 'guest') {
      setError('Please connect a wallet to enter Pit Draft');
      setPhase('error');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check balance
      const hasBalance = await checkBalance(BigInt(PIT_DRAFT_ENTRY_LAMPORTS + 10_000)); // entry + fees
      if (!hasBalance) {
        setError('Insufficient SOL balance. You need at least 0.1 SOL.');
        setPhase('error');
        setIsLoading(false);
        return;
      }

      const program = createGameplayStateProgram(connection);

      // Check queue state to determine which accounts to pass
      const queue = await fetchPitDraftQueue(program);

      let waitingProfile: PublicKey | null = null;
      let waitingPlayerWallet: PublicKey | null = null;

      if (queue?.waitingPlayer) {
        // Queue has a waiting player - we need their accounts for the match
        waitingProfile = queue.waitingProfile ?? null;
        waitingPlayerWallet = queue.waitingPlayer;
      }

      // Build and send transaction
      const transaction = await buildEnterPitDraftTransaction(
        connection,
        program,
        wallet.publicKey,
        waitingProfile,
        waitingPlayerWallet
      );

      const signature = await signAndSendTransaction(transaction);
      console.log('[usePitDraft] Transaction sent:', signature);

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('[usePitDraft] Transaction confirmed');

      // Parse events from the transaction
      const events = await parsePitDraftEvents(connection, program, signature);

      if (events.combatVisual && events.resolved) {
        // Match resolved immediately (we were the second player)
        const data = await buildMatchData(events.combatVisual, events.resolved);
        if (data) {
          setMatchData(data);
          setPhase('matched');
        } else {
          setError('Failed to parse match data');
          setPhase('error');
        }
      } else if (events.queued) {
        // We're queued, waiting for an opponent
        processedQueueSignaturesRef.current.clear();
        processedQueueSignaturesRef.current.add(signature);
        await setQueueAnchorFromSignature(signature);
        setPhase('queuing');
        startPolling();
      } else {
        setError('Transaction succeeded but no events found');
        setPhase('error');
      }
    } catch (err) {
      console.error('[usePitDraft] Enter failed:', err);
      setError(getPitDraftErrorMessage(err));
      setPhase('error');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [
    wallet.publicKey,
    mode,
    connection,
    signAndSendTransaction,
    checkBalance,
    buildMatchData,
    startPolling,
    setQueueAnchorFromSignature,
  ]);

  /**
   * Transition from matched phase to combat phase.
   */
  const startCombatPhase = useCallback(() => {
    setPhase('combat');
  }, []);

  /**
   * Transition from combat phase to result phase.
   */
  const showResult = useCallback(() => {
    setPhase('result');
  }, []);

  const loadHistory = useCallback(async (maxMatches = 20) => {
    if (!wallet.publicKey) {
      setHistoryError('Wallet not connected');
      return;
    }

    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const program = createGameplayStateProgram(connection);
      const [queuePda] = derivePitDraftQueuePda();
      const ourKey = wallet.publicKey.toBase58();
      const matches: PitDraftHistoryItem[] = [];
      const profileNameCache = new Map<string, string>();
      let before: string | undefined;
      let pages = 0;
      const PAGE_SIZE = 50;
      const MAX_PAGES = 10; // Hard cap: scan at most 500 txs

      while (matches.length < maxMatches && pages < MAX_PAGES) {
        const signatures = await connection.getSignaturesForAddress(
          queuePda,
          { limit: PAGE_SIZE, before },
          'confirmed'
        );
        if (signatures.length === 0) break;

        for (const sigInfo of signatures) {
          const events = await parsePitDraftEvents(connection, program, sigInfo.signature);
          if (!events.resolved) continue;

          const { resolved } = events;
          const playerA = resolved.playerA.toBase58();
          const playerB = resolved.playerB.toBase58();
          if (playerA !== ourKey && playerB !== ourKey) continue;

          const opponentWallet = playerA === ourKey ? playerB : playerA;
          let opponentProfileName = profileNameCache.get(opponentWallet);
          if (!opponentProfileName) {
            const fetched = await fetchProfileByWallet(new PublicKey(opponentWallet));
            opponentProfileName = fetched.name ?? opponentWallet.slice(0, 4) + '..' + opponentWallet.slice(-4);
            profileNameCache.set(opponentWallet, opponentProfileName);
          }

          matches.push({
            signature: sigInfo.signature,
            slot: sigInfo.slot ?? 0,
            playedAtUnix: sigInfo.blockTime ?? null,
            opponentWallet,
            opponentProfileName,
            isWinner: resolved.winner.toBase58() === ourKey,
            winnerPayoutLamports: resolved.winnerPayout,
            turnsTaken: resolved.turnsTaken,
          });

          if (matches.length >= maxMatches) break;
        }

        before = signatures[signatures.length - 1]?.signature;
        pages += 1;
      }

      if (isMountedRef.current) {
        setHistory(matches);
      }
    } catch (err) {
      console.error('[usePitDraft] Failed to load history:', err);
      if (isMountedRef.current) {
        setHistoryError('Failed to load match history. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsHistoryLoading(false);
      }
    }
  }, [wallet.publicKey, connection, fetchProfileByWallet]);

  /**
   * Reset to initial state.
   */
  const reset = useCallback(() => {
    stopPolling();
    processedQueueSignaturesRef.current.clear();
    queueAnchorSlotRef.current = null;
    setPhase('confirm');
    setMatchData(null);
    setError(null);
    setIsLoading(false);
    setHistoryError(null);
  }, [stopPolling]);

  return {
    phase,
    matchData,
    error,
    isLoading,
    history,
    isHistoryLoading,
    historyError,
    loadHistory,
    enterPitDraft,
    startCombatPhase,
    showResult,
    reset,
  };
}
