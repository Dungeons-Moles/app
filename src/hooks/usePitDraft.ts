/**
 * Pit Draft PvP Hook
 *
 * Manages the full Pit Draft flow: entry confirmation, queueing,
 * match detection, combat data preparation, and result display.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { ConnectionMagicRouter } from '@magicblock-labs/ephemeral-rollups-sdk';
import { useWallet } from '@/contexts/WalletContext';
import { useProfile } from '@/contexts/ProfileContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { GAMEPLAY_STATE_PROGRAM_ID, derivePitDraftVrfStatePda } from '@/services/solana/constants';
import {
  buildEnterPitDraftTransaction,
  buildLeavePitDraftTransaction,
  buildQueueOnlyTransaction,
  buildQueueWithVrfInitTransaction,
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
import {
  buildInitPitDraftVrfStateTransaction,
  buildUndelegatePitDraftVrfStateTransaction,
  buildRequestGameplayVrfTransaction,
  waitForVrfFulfillment,
} from '@/services/solana/vrf';
import { SOLANA_CONFIG } from '@/services/solana/config';
import { getLocalVrfPayerKeypair } from '@/services/solana/localVrfPayer';
import { sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import type { CombatantState, Tool, Gear } from '@/game/engine/types';
import { calculateItemStats } from '@/game/entities/items';

// ============================================================================
// Types
// ============================================================================

export type PitDraftPhase = 'confirm' | 'queuing' | 'preparing' | 'matched' | 'combat' | 'result' | 'error';

export interface PitDraftMatchData {
  combatVisual: PitDraftCombatVisualEvent;
  resolved: PitDraftResolvedEvent;
  /** Which player we are: 'a' or 'b' */
  ourSide: 'a' | 'b';
  /** Did we win? */
  isWinner: boolean;
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
const VRF_FULFILLMENT_TIMEOUT_MS = 30_000;
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

const DIRECT_ER_RPC_URL =
  process.env.EXPO_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT ?? 'https://devnet.magicblock.app/';
const DIRECT_ER_WS_URL =
  process.env.EXPO_PUBLIC_EPHEMERAL_WS_ENDPOINT ?? DIRECT_ER_RPC_URL.replace('https://', 'wss://');

/**
 * Derive delegation-related PDAs for a given account.
 */
function deriveDelegatePdas(target: PublicKey, ownerProgram: PublicKey) {
  const [buffer] = PublicKey.findProgramAddressSync(
    [Buffer.from('buffer'), target.toBuffer()],
    ownerProgram
  );
  const [delegationRecord] = PublicKey.findProgramAddressSync(
    [Buffer.from('delegation'), target.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  const [delegationMetadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('delegation-metadata'), target.toBuffer()],
    DELEGATION_PROGRAM_ID
  );
  return { buffer, delegationRecord, delegationMetadata };
}

const PIT_DRAFT_BASE_HP = 20;
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

// Module-level temp keypair for background VRF operations.
// Survives React remounts but not app restarts (acceptable — new queue entry = new keypair).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _pitDraftTempKeypair: Keypair | null = null;

const VRF_PREPARE_TIMEOUT_MS = 45_000;

/**
 * Run background VRF setup after player 1's queue TX confirms.
 * All transactions signed by the temp keypair — no wallet interaction.
 */
async function backgroundVrfSetup(
  baseConnection: Connection,
  program: ReturnType<typeof createGameplayStateProgram>,
  signerKeypair: Keypair,
  seedKey: PublicKey,
  vrfStatePda: PublicKey,
): Promise<void> {
  if (SOLANA_CONFIG.isLocalValidator) {
    // Localnet: request + fulfill VRF on base layer (local oracle)
    console.log('[usePitDraft] BG VRF: request on base (localnet)');
    const localPayer = getLocalVrfPayerKeypair();
    const payer = localPayer ?? signerKeypair;
    const vrfRequestTx = await buildRequestGameplayVrfTransaction(
      program,
      seedKey,
      payer.publicKey,
      payer.publicKey,
    );
    await sendSessionSignerTransaction(baseConnection, vrfRequestTx, payer);
    console.log('[usePitDraft] BG VRF: requested, waiting for oracle...');

    const fulfilled = await waitForVrfFulfillment(
      baseConnection,
      vrfStatePda,
      VRF_FULFILLMENT_TIMEOUT_MS,
    );
    if (!fulfilled) {
      console.error('[usePitDraft] BG VRF: fulfillment timed out on base');
      Sentry.captureMessage('BG VRF fulfillment timed out on base (localnet)', { tags: { source: 'usePitDraft.backgroundVrfSetup' } });
    } else {
      console.log('[usePitDraft] BG VRF: fulfilled on base (localnet)');
    }
    return;
  }

  // Devnet/Mainnet: delegate → request on ER → wait → undelegate
  // Check if already delegated (e.g., from a previous attempt that failed mid-flow).
  const baseVrfInfo = await baseConnection.getAccountInfo(vrfStatePda).catch(() => null);
  const alreadyDelegated = baseVrfInfo && baseVrfInfo.owner.equals(DELEGATION_PROGRAM_ID);

  if (alreadyDelegated) {
    console.log('[usePitDraft] BG VRF: already delegated, skipping delegation step');
  } else {
    console.log('[usePitDraft] BG VRF: delegate VRF state to ER');
    const vrfDelegate = deriveDelegatePdas(vrfStatePda, SOLANA_CONFIG.programs.gameplayState);
    const delegateVrfIx = await program.methods
      .delegatePitDraftVrfState(SOLANA_CONFIG.magic.delegationValidator)
      .accountsStrict({
        gameplayVrfState: vrfStatePda,
        seedKey,
        payer: signerKeypair.publicKey,
        bufferGameplayVrfState: vrfDelegate.buffer,
        delegationRecordGameplayVrfState: vrfDelegate.delegationRecord,
        delegationMetadataGameplayVrfState: vrfDelegate.delegationMetadata,
        ownerProgram: SOLANA_CONFIG.programs.gameplayState,
        delegationProgram: DELEGATION_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .instruction();
    const delegateTx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      delegateVrfIx,
    );
    await sendSessionSignerTransaction(baseConnection, delegateTx, signerKeypair);
    console.log('[usePitDraft] BG VRF: delegated');
  }

  // Resolve the correct ER validator endpoint for the delegated VRF state.
  // The MagicBlock router distributes delegated accounts across ER nodes;
  // sending to the wrong node means the oracle never sees the VRF request.
  let erConnectionForVrf: Connection;
  if (SOLANA_CONFIG.useMagicRouter) {
    console.log('[usePitDraft] BG VRF: resolving ER validator via router');
    const routerConn = new ConnectionMagicRouter(SOLANA_CONFIG.erRpcUrl, {
      commitment: SOLANA_CONFIG.erCommitment,
      wsEndpoint: SOLANA_CONFIG.erWsUrl,
    });
    let fqdn: string | undefined;
    try {
      const status = await routerConn.getDelegationStatus(vrfStatePda) as
        { isDelegated: boolean; fqdn?: string };
      fqdn = status?.fqdn ?? undefined;
    } catch { /* fall through */ }
    if (fqdn) {
      console.log('[usePitDraft] BG VRF: resolved ER validator:', fqdn);
      erConnectionForVrf = new Connection(fqdn, {
        commitment: SOLANA_CONFIG.erCommitment,
        wsEndpoint: fqdn.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://'),
      });
    } else {
      console.log('[usePitDraft] BG VRF: no fqdn from router, falling back to direct ER');
      erConnectionForVrf = new Connection(DIRECT_ER_RPC_URL, {
        commitment: SOLANA_CONFIG.erCommitment,
        wsEndpoint: DIRECT_ER_WS_URL,
      });
    }
  } else {
    erConnectionForVrf = new Connection(DIRECT_ER_RPC_URL, {
      commitment: SOLANA_CONFIG.erCommitment,
      wsEndpoint: DIRECT_ER_WS_URL,
    });
  }

  // Wait for delegation to propagate on ER
  const maxDelegateWaitMs = 15_000;
  const startWait = Date.now();
  while (Date.now() - startWait < maxDelegateWaitMs) {
    const info = await erConnectionForVrf.getAccountInfo(vrfStatePda).catch(() => null);
    if (info) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  // Request VRF on ER via CPI (gameplay program signs for identity PDA)
  console.log('[usePitDraft] BG VRF: request on ER');
  const erProgram = createGameplayStateProgram(erConnectionForVrf);
  const vrfRequestTx = await buildRequestGameplayVrfTransaction(
    erProgram,
    seedKey,
    signerKeypair.publicKey,
    signerKeypair.publicKey,
  );
  await sendSessionSignerTransaction(erConnectionForVrf, vrfRequestTx, signerKeypair);
  console.log('[usePitDraft] BG VRF: request sent on ER');

  // Wait for fulfillment on ER
  const fulfilled = await waitForVrfFulfillment(
    erConnectionForVrf,
    vrfStatePda,
    VRF_FULFILLMENT_TIMEOUT_MS,
  );
  if (!fulfilled) {
    console.error('[usePitDraft] BG VRF: fulfillment timed out on ER');
    Sentry.captureMessage('BG VRF fulfillment timed out on ER', { tags: { source: 'usePitDraft.backgroundVrfSetup' } });
    return;
  }
  console.log('[usePitDraft] BG VRF: fulfilled on ER');

  // Undelegate back to base
  console.log('[usePitDraft] BG VRF: undelegating from ER');
  const undelegateTx = await buildUndelegatePitDraftVrfStateTransaction(
    erProgram,
    seedKey,
    signerKeypair.publicKey,
  );
  await sendSessionSignerTransaction(
    erConnectionForVrf,
    undelegateTx,
    signerKeypair,
  );
  console.log('[usePitDraft] BG VRF: undelegate sent');

  // Wait for VRF state to return to base
  const undelegateWaitMs = 30_000;
  const undelegateStart = Date.now();
  while (Date.now() - undelegateStart < undelegateWaitMs) {
    const info = await baseConnection.getAccountInfo(vrfStatePda).catch(() => null);
    if (info && !info.owner.equals(DELEGATION_PROGRAM_ID)) {
      console.log('[usePitDraft] BG VRF: state back on base layer');
      return;
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  console.error('[usePitDraft] BG VRF: undelegate timed out');
  Sentry.captureMessage('BG VRF undelegate timed out', { tags: { source: 'usePitDraft.backgroundVrfSetup' } });
}

export function usePitDraft(initialPhase?: PitDraftPhase) {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const { mode, profile } = useProfile();
  const { connection } = useSolanaConnection();

  const [phase, setPhase] = useState<PitDraftPhase>(initialPhase ?? 'confirm');
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
    async (
      walletKey: PublicKey
    ): Promise<{ name: string | null; equippedSkin: PublicKey | null }> => {
      try {
        const program = createPlayerProfileProgram(connection);
        const [profilePda] = derivePlayerProfilePda(walletKey);
        const account = await (
          program.account as {
            playerProfile: {
              fetchNullable: (
                address: PublicKey
              ) => Promise<{ name?: unknown; equippedSkin?: unknown } | null>;
            };
          }
        ).playerProfile.fetchNullable(profilePda);

        if (!account) return { name: null, equippedSkin: null };
        const name = (() => {
          const raw = account.name;
          if (typeof raw !== 'string')
            return (
              Buffer.from(raw as ArrayLike<number>)
                .toString('utf-8')
                .replace(/\0/g, '')
                .trim() || null
            );
          if (/^\d+(,\d+)*$/.test(raw))
            return (
              Buffer.from(raw.split(',').map(Number)).toString('utf-8').replace(/\0/g, '').trim() ||
              null
            );
          return raw.replace(/\0/g, '').trim() || null;
        })();
        const equippedSkin =
          account.equippedSkin instanceof PublicKey &&
          !PublicKey.default.equals(account.equippedSkin)
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

      const localProfileName = (() => {
        const raw = profile?.name;
        if (raw == null) return undefined;
        if (typeof raw !== 'string')
          return Buffer.from(raw as ArrayLike<number>)
            .toString('utf-8')
            .replace(/\0/g, '')
            .trim();
        if (/^\d+(,\d+)*$/.test(raw))
          return Buffer.from(raw.split(',').map(Number))
            .toString('utf-8')
            .replace(/\0/g, '')
            .trim();
        return raw.replace(/\0/g, '').trim();
      })();
      const playerProfileName =
        localProfileName && localProfileName.length > 0 ? localProfileName : 'You';
      const opponentProfile = await fetchProfileByWallet(opponentWalletKey);
      const opponentProfileName = opponentProfile.name ?? 'Opponent';

      return {
        combatVisual,
        resolved,
        ourSide,
        isWinner,
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

    const signatures = signatureGroups.flat().sort((a, b) => (b.slot ?? 0) - (a.slot ?? 0));

    for (const sigInfo of signatures) {
      const anchorSlot = queueAnchorSlotRef.current;
      if (anchorSlot !== null && (sigInfo.slot ?? 0) < anchorSlot) continue;
      if (processedQueueSignaturesRef.current.has(sigInfo.signature)) continue;
      processedQueueSignaturesRef.current.add(sigInfo.signature);

      const events = await parsePitDraftEvents(connection, program, sigInfo.signature);

      // Atomic resolution: combat+resolved events come from the enter_pit_draft TX
      // when the second player enters with pre-fulfilled VRF.
      if (events.combatVisual && events.resolved) {
        const data = await buildMatchData(events.combatVisual, events.resolved);
        if (!data) continue;

        if (isMountedRef.current) {
          setMatchData(data);
          setPhase('matched');
        }
        return true;
      }
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
   *
   * Single-wallet-signature flow:
   * - Queue empty (player 1): bundle queue + init VRF + fund temp keypair → 1 wallet TX.
   *   Background VRF setup runs via temp keypair (no wallet popups).
   * - Queue has waiting player (player 2): wait for VRF fulfillment → enter with match accounts → 1 wallet TX.
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

      // Check queue state to determine flow
      const queue = await fetchPitDraftQueue(program);

      if (queue?.waitingPlayer) {
        // ── PLAYER 2: Match path ────────────────────────────────────────
        // VRF was set up by player 1 in the background. Wait for it, then enter.
        const waitingPlayer = queue.waitingPlayer;
        const [vrfStatePda] = derivePitDraftVrfStatePda(waitingPlayer);

        console.log('[usePitDraft] Queue has waiting player, waiting for VRF fulfillment');
        // Stay on 'confirm' with isLoading spinner while VRF is polled.
        // Only transition to 'preparing' once VRF is ready and the wallet TX is imminent.

        // Poll VRF state on base until fulfilled (player 1's background VRF setup)
        let vrfReady = await waitForVrfFulfillment(
          connection,
          vrfStatePda,
          VRF_PREPARE_TIMEOUT_MS,
        );

        // Fallback: player 1 left before VRF completed — player 2 takes over.
        // This costs an extra wallet TX (init VRF + fund temp keypair), then
        // background VRF via temp keypair, then the enter TX.
        if (!vrfReady) {
          console.log('[usePitDraft] VRF not ready, player 2 taking over VRF setup');

          const tempKeypair = Keypair.generate();
          _pitDraftTempKeypair = tempKeypair;

          // Check if VRF state is already delegated (from player 1's partial attempt).
          // If so, skip init and just fund the temp keypair for ER VRF request.
          const vrfBaseInfo = await connection.getAccountInfo(vrfStatePda).catch(() => null);
          const vrfAlreadyDelegated = vrfBaseInfo && vrfBaseInfo.owner.equals(DELEGATION_PROGRAM_ID);

          if (vrfAlreadyDelegated) {
            console.log('[usePitDraft] VRF state already delegated, skipping init — funding temp keypair only');
            const fundTx = new Transaction().add(
              SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tempKeypair.publicKey,
                lamports: 5_000_000,
              }),
            );
            const fundSig = await signAndSendTransaction(fundTx);
            await connection.confirmTransaction(fundSig, 'confirmed');
            console.log('[usePitDraft] Player 2 fund-only TX confirmed:', fundSig);
          } else {
            // Wallet TX 1 of 2: init VRF state + fund temp keypair
            const initVrfTx = await buildInitPitDraftVrfStateTransaction(
              program,
              waitingPlayer,
              wallet.publicKey,
            );
            // Append funding instruction to the same TX
            initVrfTx.add(
              SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tempKeypair.publicKey,
                lamports: 5_000_000, // 0.005 SOL for VRF TX fees
              }),
            );
            const initSig = await signAndSendTransaction(initVrfTx);
            await connection.confirmTransaction(initSig, 'confirmed');
            console.log('[usePitDraft] Player 2 VRF init + fund TX confirmed:', initSig);
          }

          // Background VRF setup via temp keypair (no wallet interaction)
          await backgroundVrfSetup(connection, program, tempKeypair, waitingPlayer, vrfStatePda);

          // Wait for VRF to land on base
          vrfReady = await waitForVrfFulfillment(
            connection,
            vrfStatePda,
            VRF_FULFILLMENT_TIMEOUT_MS,
          );

          if (!vrfReady) {
            throw new Error('VRF fulfillment timed out. Please try again.');
          }
        }

        // Enter with fulfilled VRF — match + combat resolves atomically (1 wallet TX)
        console.log('[usePitDraft] Entering pit draft with match accounts (atomic resolution)');
        const transaction = await buildEnterPitDraftTransaction(
          connection,
          program,
          wallet.publicKey,
          {
            waitingProfile: queue.waitingProfile!,
            waitingPlayerWallet: waitingPlayer,
            vrfStatePda,
          },
        );

        const signature = await signAndSendTransaction(transaction);
        console.log('[usePitDraft] Enter+match TX sent:', signature);
        setPhase('preparing');
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('[usePitDraft] Enter+match TX confirmed');

        // Parse combat events from this TX
        const events = await parsePitDraftEvents(connection, program, signature);
        if (events.combatVisual && events.resolved) {
          const data = await buildMatchData(events.combatVisual, events.resolved);
          if (data) {
            setMatchData(data);
            setPhase('matched');
          } else {
            setError('Failed to parse match data');
            setPhase('error');
          }
        } else {
          setError('Match transaction succeeded but combat events not found');
          setPhase('error');
        }
      } else {
        // ── PLAYER 1: Queue path ────────────────────────────────────────
        // Bundle queue entry + VRF init + fund temp keypair in a single wallet TX.
        console.log('[usePitDraft] Queue empty, entering queue with VRF init');

        const tempKeypair = Keypair.generate();
        _pitDraftTempKeypair = tempKeypair;

        // Check if VRF state is still delegated from a previous attempt.
        // If so, skip init (backgroundVrfSetup handles already-delegated state).
        const [vrfCheckPda] = derivePitDraftVrfStatePda(wallet.publicKey);
        const vrfInfo = await connection.getAccountInfo(vrfCheckPda).catch(() => null);
        const vrfStillDelegated = vrfInfo && vrfInfo.owner.equals(DELEGATION_PROGRAM_ID);

        let transaction: Transaction;
        if (vrfStillDelegated) {
          console.log('[usePitDraft] VRF state still delegated, skipping init — queue + fund only');
          transaction = await buildQueueOnlyTransaction(
            connection, program, wallet.publicKey, tempKeypair.publicKey,
          );
        } else {
          transaction = await buildQueueWithVrfInitTransaction(
            connection, program, wallet.publicKey, tempKeypair.publicKey,
          );
        }

        const signature = await signAndSendTransaction(transaction);
        console.log('[usePitDraft] Queue+VRF init TX sent:', signature);
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('[usePitDraft] Queue+VRF init TX confirmed');

        // Parse events — should get PitDraftQueued
        const events = await parsePitDraftEvents(connection, program, signature);

        if (events.queued) {
          processedQueueSignaturesRef.current.clear();
          processedQueueSignaturesRef.current.add(signature);
          await setQueueAnchorFromSignature(signature);
          setPhase('queuing');
          startPolling();

          // Fire-and-forget background VRF setup (temp keypair signs all)
          const [vrfStatePda] = derivePitDraftVrfStatePda(wallet.publicKey);
          backgroundVrfSetup(connection, program, tempKeypair, wallet.publicKey, vrfStatePda).catch(
            (err) => {
              console.error('[usePitDraft] Background VRF setup failed:', err);
              Sentry.captureException(err, { tags: { source: 'usePitDraft.backgroundVrfSetup' } });
            },
          );
        } else {
          setError('Transaction succeeded but no queue event found');
          setPhase('error');
        }
      }
    } catch (err) {
      console.error('[usePitDraft] Enter failed:', err);
      Sentry.captureException(err, { tags: { source: 'usePitDraft.enterPitDraft' } });
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

  const loadHistory = useCallback(
    async (maxMatches = 20) => {
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
              opponentProfileName =
                fetched.name ?? opponentWallet.slice(0, 4) + '..' + opponentWallet.slice(-4);
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
        Sentry.captureException(err, { tags: { source: 'usePitDraft.loadHistory' } });
        if (isMountedRef.current) {
          setHistoryError('Failed to load match history. Please try again.');
        }
      } finally {
        if (isMountedRef.current) {
          setIsHistoryLoading(false);
        }
      }
    },
    [wallet.publicKey, connection, fetchProfileByWallet]
  );

  /**
   * Leave the pit draft queue on-chain, refunding the entry fee.
   */
  const leaveQueue = useCallback(async () => {
    if (!wallet.publicKey) return;
    setIsLoading(true);
    try {
      const program = createGameplayStateProgram(connection);
      const tx = await buildLeavePitDraftTransaction(connection, program, wallet.publicKey);
      const sig = await signAndSendTransaction(tx);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('[usePitDraft] Left queue, refund confirmed:', sig);
    } catch (err) {
      console.error('[usePitDraft] Leave queue failed:', err);
      Sentry.captureException(err, { tags: { source: 'usePitDraft.leaveQueue' } });
      setError(err instanceof Error ? err.message : 'Failed to leave queue');
    } finally {
      stopPolling();
      processedQueueSignaturesRef.current.clear();
      queueAnchorSlotRef.current = null;
      setPhase('confirm');
      setMatchData(null);
      setIsLoading(false);
    }
  }, [wallet.publicKey, connection, signAndSendTransaction, stopPolling]);

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
    leaveQueue,
    startCombatPhase,
    showResult,
    reset,
  };
}
