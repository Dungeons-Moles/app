import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
  ReactNode,
} from 'react';
import { Alert } from 'react-native';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
} from '@solana/web3.js';
import BN from 'bn.js';
import { useWallet } from './WalletContext';
import { useProfile } from './ProfileContext';
import { useSolanaConnection } from './SolanaConnectionContext';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useMapGenerator } from '@/hooks/useMapGenerator';
import { useSessionKey } from '@/hooks/useSessionKey';
import { useGameplayState } from '@/hooks/useGameplayState';
import { getGameStatePda, fetchGameState, warmMovePlayerCaches } from '@/services/solana/gameplayState';
import {
  deriveDuelSessionPda,
  deriveGauntletSessionPda,
  deriveGameStatePda,
  deriveGeneratedMapPda,
  deriveInventoryPda,
  deriveMapPoisPda,
  deriveSessionDiscoveryPda,
  deriveSessionPdas,
  deriveSessionPda,
  deriveSessionNoncesPda,
  deriveMapVrfStatePda,
  derivePoiVrfStatePda,
  deriveGameplayVrfStatePda,
  deriveGauntletEchoesPda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG, deriveErWsEndpoint } from '@/services/solana/config';
import {
  createMapGeneratorProgram,
  createSessionManagerProgram,
  createGameplayStateProgram,
  createPoiSystemProgram,
} from '@/services/solana/programs';
import {
  buildInitPoiVrfStateTransaction,
  buildInitMapVrfStateTransaction,
  buildInitGameplayVrfStateTransaction,
  buildRequestAndFulfillMapVrfInstructions,
  buildRequestAndFulfillPoiAndGameplayVrfTransaction,
  buildRequestAndFulfillPoiVrfTransaction,
  buildRequestGameplayVrfTransaction,
  buildMapAndSyncTransaction,
  buildSyncMapEnemiesInstruction,
  buildDiscoverSpawnPoisInstruction,
  waitForVrfFulfillment,
} from '@/services/solana/vrf';
import { fetchSessionDiscovery } from '@/services/solana/mapGeneratorClient';
import {
  queueCleanup,
  getPendingCleanups,
  loadCleanupQueue,
  removeCleanup,
  updateCleanup,
  incrementRetryCount,
} from '@/services/solana/deferredCleanup';
import {
  loadSessionSignerWallet,
  loadSessionSignerForSession,
  withdrawExcessToMain,
  calculateRequiredFunding,
  SESSION_COST_CAMPAIGN,
  SESSION_COST_DUEL,
  SESSION_COST_GAUNTLET,
  sendSessionSignerTransaction,
  buildSessionDerivationMessage,
  buildGameWalletDerivationMessage,
  deriveSessionSignerFromSignature,
} from '@/services/solana/sessionSigner';
import {
  fetchSessionList,
  checkSessionExists,
  getSessionForLevel,
  type ActiveSession,
} from '@/services/solana/sessionList';
import { abandonSession as abandonSessionTx } from '@/services/solana/sessionBundle';
import {
  buildAssignDuelMapSeedTransaction,
  buildEnterDuelInstruction,
  buildGenerateDuelMapTransaction,
  buildSettleDuelPayoutTransaction,
  deriveDuelEntryPda,
  fetchDuelEntry,
  parseDuelEvents,
} from '@/services/solana/duels';
import { clearFogState, clearBrokenWalls } from '@/services/solana/sessionRestore';
import { getLocalVrfPayerKeypair } from '@/services/solana/localVrfPayer';
import type { OnChainGameSession } from '@/services/solana/types/session_manager';
import {
  RunMode,
  type GameState,
  type MovePlayerParams,
  type ModifyStatParams,
} from '@/services/solana/types/gameplay_state';
import type { TransactionResult } from '@/types/solana';
import type { SessionSignerState } from '@/services/solana/sessionSigner';
import type { CombatEnemyInfo } from '@/services/solana/eventParser';
import type { GauntletCombatVisualEvent } from '@/services/solana/gauntlet';
import {
  buildEnterGauntletInstruction,
  buildRedrawGauntletEchoesInstruction,
  deriveGauntletConfigPda,
  buildSettleGauntletSessionTransaction,
  ensureLocalFeeAccounts,
} from '@/services/solana/gauntlet';

import {
  isForceUndelegateAvailable,
  forceUndelegateAccounts,
} from '@/services/solana/forceUndelegate';

/** Commit interval in milliseconds (30 seconds) */
const COMMIT_INTERVAL_MS = 30_000;
const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
const ER_PROPAGATION_WAIT_MS = 30_000;
const ER_PROPAGATION_POLL_MS = 300;
const UNKNOWN_ER_NODE = '11111111111111111111111111111111';
const DIRECT_ER_RPC_URL =
  process.env.EXPO_PUBLIC_EPHEMERAL_PROVIDER_ENDPOINT ?? 'https://devnet.magicblock.app/';

function isErPropagationErrorMessage(message: string): boolean {
  return (
    message.includes('InvalidWritableAccount') ||
    message.includes('InvalidAccountOwner') ||
    message.includes('AccountDidNotDeserialize') ||
    message.includes('"Custom":3003') ||
    message.includes('"Custom":3004')
  );
}
const DIRECT_ER_WS_URL =
  process.env.EXPO_PUBLIC_EPHEMERAL_WS_ENDPOINT ?? 'wss://devnet.magicblock.app/';
const ER_VRF_WAIT_TIMEOUT_MS = 120_000;
const ER_SYNC_MAP_ENEMIES_CU_LIMIT = 800_000; // still used by buildSyncMapEnemiesInstruction
const MAX_SERIALIZED_TX_BYTES = 1232;
const VRF_STATUS_OFFSET = 8 + 32 + 32 + 8;
const VRF_STATUS_FULFILLED = 1;

// ============================================================================
// Types
// ============================================================================

export interface SessionState {
  /** Current on-chain session (if any) */
  session: OnChainGameSession | null;
  /** Whether player has an active session */
  hasActiveSession: boolean;
  /** Map seed for current campaign level */
  mapSeed: bigint | null;
  /** Whether session operations are in progress */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Warning when wallet disconnects during active session */
  isWalletDisconnected: boolean;
  /** SessionSigner wallet state */
  sessionSignerState: SessionSignerState;
  /** SessionSigner wallet balance in lamports */
  sessionSignerBalance: number;
  /** Whether sessionSigner balance is low */
  isSessionSignerLowBalance: boolean;
  /** On-chain gameplay state */
  gameplayState: GameState | null;
  /** Gameplay sync status */
  gameplaySyncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  /** List of all active sessions across levels */
  activeSessions: ActiveSession[];
  /** Whether session list is loading */
  isSessionListLoading: boolean;
  /** Current session level (convenience accessor) */
  currentLevel: number | null;
  /** Session PDA as base58 string (for persistence keys) */
  sessionKey: string | null;
  /** Active session PDA (campaign, duel, or gauntlet) */
  sessionPda: PublicKey | null;
}

export type SessionStartupState = 'created' | 'delegated' | 'vrf_pending' | 'vrf_ready';

interface SessionContextType extends SessionState {
  /** Start a new game session for a campaign level */
  startGame: (campaignLevel: number, onCommitted?: () => void) => Promise<TransactionResult>;
  /** Override campaign session slot by bumping campaign nonce */
  overrideCampaignSession: () => Promise<TransactionResult>;
  /** Override duel session slot by bumping duel nonce */
  overrideDuelSession: () => Promise<TransactionResult>;
  /** Override gauntlet session slot by bumping gauntlet nonce */
  overrideGauntletSession: () => Promise<TransactionResult>;
  /** Override existing campaign session and start a new one in one wallet tx */
  overrideAndStartGame: (
    campaignLevel: number,
    onCommitted?: () => void
  ) => Promise<TransactionResult>;
  /** Override existing duel session and start a new one in one wallet tx */
  overrideAndStartDuelGame: (onCommitted?: () => void) => Promise<TransactionResult>;
  /** Override existing gauntlet session and start a new one in one wallet tx */
  overrideAndStartGauntletGame: (onCommitted?: () => void) => Promise<TransactionResult>;
  /** Start a new duel session */
  startDuelGame: (onCommitted?: () => void) => Promise<TransactionResult>;
  /** Start a new gauntlet session */
  startGauntletGame: (onCommitted?: () => void) => Promise<TransactionResult>;
  /** End the current session (after game over or victory) */
  endGame: () => Promise<TransactionResult>;
  /** End session immediately with session key signer (called after combat death/victory) */
  endSessionWithSessionSigner: () => Promise<TransactionResult>;
  /** Undelegate current session from rollup back to base chain */
  undelegateCurrentSession: () => Promise<TransactionResult>;
  /** Queue session cleanup for later processing (immediate return, no signature needed) */
  queueEndGame: (levelReached: number, isVictory: boolean) => Promise<void>;
  /** Process any pending cleanup tasks */
  processPendingCleanups: () => Promise<void>;
  /** Whether there are pending cleanups */
  hasPendingCleanups: boolean;
  /** Delegate session to MagicBlock (currently stubbed) */
  delegateToRollup: () => Promise<TransactionResult>;
  /** Commit current game state hash to chain */
  commitGameState: (stateHash: number[]) => Promise<TransactionResult>;
  /** Refresh session state from chain */
  refreshSession: () => Promise<void>;
  /** Get the seed to use for map generation */
  getMapSeedForLevel: (level: number) => Promise<bigint | null>;
  /** Verify that a seed matches the on-chain seed for a level */
  verifySeed: (level: number, seed: bigint) => Promise<boolean>;
  /** Start the auto-commit timer for periodic state checkpoints */
  startAutoCommit: (getStateHash: () => number[]) => void;
  /** Stop the auto-commit timer */
  stopAutoCommit: () => void;
  /** Whether auto-commit is currently running */
  isAutoCommitActive: boolean;
  /** Move player on-chain (via session key signer, awaits confirmation) */
  movePlayer: (params: MovePlayerParams) => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    combatOccurred?: boolean;
    combatEnemyInfo?: CombatEnemyInfo;
    bossFightReady?: boolean;
    isDead?: boolean;
    signature?: string;
    bossResolvedInline?: boolean;
    preBossPlayerHp?: number;
    inlineBossId?: string;
    gauntletCombatVisual?: GauntletCombatVisualEvent | null;
    discovery?: import('@/services/solana/mapGeneratorClient').SessionDiscoveryData | null;
  }>;
  /** Trigger boss fight on-chain (via session key signer) */
  triggerBoss: () => Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    isDead?: boolean;
    gauntletVisual?: GauntletCombatVisualEvent | null;
    signature?: string;
  }>;
  /** Modify player stat on-chain (via session key signer) */
  modifyPlayerStat: (params: ModifyStatParams) => Promise<{ success: boolean; newValue?: number }>;
  /** Top up session key signer */
  topUpSessionSigner: (amount?: number) => Promise<boolean>;
  /** Get current session keypair (for direct use) */
  getSessionSignerKeypair: () => Keypair | null;
  /** Refresh the list of all active sessions */
  refreshSessionList: () => Promise<void>;
  /** Switch to a different active session */
  switchToSession: (
    sessionPda: string,
    options?: { requirePoiVrfReady?: boolean }
  ) => Promise<TransactionResult>;
  /** Ensure required session VRF state is fulfilled before gameplay is allowed */
  ensureSessionVrfReady: (sessionPda?: string) => Promise<TransactionResult>;
  /** Inspect current startup/readiness state for an existing session */
  getSessionStartupState: (sessionPda?: string) => Promise<SessionStartupState | null>;
  /** Abandon a session (deducts 1 run) */
  abandonSession: (sessionPda: string) => Promise<TransactionResult>;
  /** Force abandon current session (bypasses death/victory requirement, for debugging) */
  forceAbandonCurrentSession: () => Promise<TransactionResult>;
  /** Check if a session exists for a given level */
  hasSessionForLevel: (level: number) => Promise<boolean>;
  /** Get the session PDA for a level if it exists */
  getSessionPdaForLevel: (level: number) => Promise<string | null>;
  /** Set the game state PDA for on-chain operations */
  setGameStatePda: (pda: PublicKey | null) => void;
  /** Refresh on-chain gameplay state (re-fetches from chain) */
  refreshGameplayState: () => Promise<GameState | null>;
  /** Fetch current per-mode session nonces for the connected player */
  fetchSessionNonces: () => Promise<{ campaign: bigint; duel: bigint; gauntlet: bigint }>;
  /**
   * Re-request and wait for map+gameplay VRF fulfillment on the Ephemeral Rollup
   * for an existing session (gauntlet/duel). Call this when resuming a session
   * after a VRF timeout. Returns { success: true } immediately on localnet.
   */
  retryErVrfForSession: (sessionPdaStr: string) => Promise<TransactionResult>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// ============================================================================
// Split Contexts for Performance
// ============================================================================

/** Stable session identity + actions (changes only on session start/end/switch) */
interface SessionIdentityContextType {
  session: OnChainGameSession | null;
  hasActiveSession: boolean;
  mapSeed: bigint | null;
  currentLevel: number | null;
  sessionKey: string | null;
  sessionPda: PublicKey | null;
  activeSessions: ActiveSession[];
  isSessionListLoading: boolean;
  isWalletDisconnected: boolean;
  sessionSignerState: SessionSignerState;
  sessionSignerBalance: number;
  isSessionSignerLowBalance: boolean;
  hasPendingCleanups: boolean;
  isAutoCommitActive: boolean;
  // Actions (stable callbacks)
  startGame: SessionContextType['startGame'];
  overrideCampaignSession: SessionContextType['overrideCampaignSession'];
  overrideDuelSession: SessionContextType['overrideDuelSession'];
  overrideGauntletSession: SessionContextType['overrideGauntletSession'];
  overrideAndStartGame: SessionContextType['overrideAndStartGame'];
  overrideAndStartDuelGame: SessionContextType['overrideAndStartDuelGame'];
  overrideAndStartGauntletGame: SessionContextType['overrideAndStartGauntletGame'];
  startDuelGame: SessionContextType['startDuelGame'];
  startGauntletGame: SessionContextType['startGauntletGame'];
  endGame: SessionContextType['endGame'];
  endSessionWithSessionSigner: SessionContextType['endSessionWithSessionSigner'];
  undelegateCurrentSession: SessionContextType['undelegateCurrentSession'];
  queueEndGame: SessionContextType['queueEndGame'];
  processPendingCleanups: SessionContextType['processPendingCleanups'];
  delegateToRollup: SessionContextType['delegateToRollup'];
  commitGameState: SessionContextType['commitGameState'];
  refreshSession: SessionContextType['refreshSession'];
  getMapSeedForLevel: SessionContextType['getMapSeedForLevel'];
  verifySeed: SessionContextType['verifySeed'];
  startAutoCommit: SessionContextType['startAutoCommit'];
  stopAutoCommit: SessionContextType['stopAutoCommit'];
  topUpSessionSigner: SessionContextType['topUpSessionSigner'];
  getSessionSignerKeypair: SessionContextType['getSessionSignerKeypair'];
  refreshSessionList: SessionContextType['refreshSessionList'];
  switchToSession: SessionContextType['switchToSession'];
  ensureSessionVrfReady: SessionContextType['ensureSessionVrfReady'];
  getSessionStartupState: SessionContextType['getSessionStartupState'];
  abandonSession: SessionContextType['abandonSession'];
  forceAbandonCurrentSession: SessionContextType['forceAbandonCurrentSession'];
  hasSessionForLevel: SessionContextType['hasSessionForLevel'];
  getSessionPdaForLevel: SessionContextType['getSessionPdaForLevel'];
  setGameStatePda: SessionContextType['setGameStatePda'];
  fetchSessionNonces: SessionContextType['fetchSessionNonces'];
  retryErVrfForSession: SessionContextType['retryErVrfForSession'];
}

/** Frequently-changing gameplay state (updates during active gameplay) */
interface SessionGameplayContextType {
  gameplayState: GameState | null;
  gameplaySyncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  isLoading: boolean;
  error: string | null;
  movePlayer: SessionContextType['movePlayer'];
  triggerBoss: SessionContextType['triggerBoss'];
  modifyPlayerStat: SessionContextType['modifyPlayerStat'];
  refreshGameplayState: SessionContextType['refreshGameplayState'];
}

const SessionIdentityContext = createContext<SessionIdentityContextType | undefined>(undefined);
const SessionGameplayContext = createContext<SessionGameplayContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function SessionProvider({ children }: { children: ReactNode }) {
  const { wallet, signMessage, signAndSendTransaction, signAndSendTransactions } = useWallet();
  const { connection, gameplayConnection, erConnection, setUseErForGameplay, setResolvedErEndpoint } =
    useSolanaConnection();
  const { profile } = useProfile();
  const sessionManager = useSessionManager();
  const mapGenerator = useMapGenerator();
  const sessionSigner = useSessionKey();
  const gameplayState = useGameplayState();

  const [mapSeed, setMapSeed] = useState<bigint | null>(null);
  const [isAutoCommitActive, setIsAutoCommitActive] = useState(false);
  const [isWalletDisconnected, setIsWalletDisconnected] = useState(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [isSessionListLoading, setIsSessionListLoading] = useState(false);
  const walletId = wallet.address ?? wallet.publicKey?.toBase58() ?? null;
  const commitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const getStateHashRef = useRef<(() => number[]) | null>(null);
  const vrfReadySessionsRef = useRef<Set<string>>(new Set());
  const forceAbandonCurrentSessionRef = useRef<(() => Promise<TransactionResult>) | null>(null);
  // Tracks in-flight session teardown so new session starts wait for cleanup to finish.
  const pendingTeardownRef = useRef<Promise<TransactionResult> | null>(null);
  const directErConnection = useMemo(
    () =>
      new Connection(DIRECT_ER_RPC_URL, {
        commitment: SOLANA_CONFIG.erCommitment,
        wsEndpoint: DIRECT_ER_WS_URL,
      }),
    []
  );

  // Send a session bootstrap tx directly to ER (non-router path).
  const sendRoutedErTransaction = useCallback(
    async (
      transaction: Transaction,
      signerKeypair: Keypair,
      routingAccounts: PublicKey[]
    ): Promise<string> => {
      const getWritableAccounts = (tx: Transaction): string[] => {
        const writable = new Set<string>();
        if (tx.feePayer) writable.add(tx.feePayer.toBase58());
        for (const ix of tx.instructions) {
          for (const key of ix.keys) {
            if (key.isWritable) writable.add(key.pubkey.toBase58());
          }
        }
        return [...writable];
      };

      const getRouterBlockhashForAccounts = async (
        accounts: string[]
      ): Promise<{ blockhash: string; lastValidBlockHeight: number }> => {
        const response = await fetch(erConnection.rpcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBlockhashForAccounts',
            params: [accounts],
          }),
        });
        const payload = (await response.json()) as {
          result?: { blockhash?: string; lastValidBlockHeight?: number };
          error?: { message?: string };
        };
        const blockhash = payload.result?.blockhash;
        const lastValidBlockHeight = payload.result?.lastValidBlockHeight;
        if (!blockhash || typeof lastValidBlockHeight !== 'number') {
          throw new Error(
            payload.error?.message ??
              'Router did not return blockhash for routed accounts (missing result.blockhash)'
          );
        }
        return { blockhash, lastValidBlockHeight };
      };

      const waitForErSignature = async (
        signature: string,
        statusConnection: Connection,
        blockhashInfo?: { blockhash: string; lastValidBlockHeight: number }
      ): Promise<void> => {
        if (blockhashInfo) {
          // Use confirmTransaction (websocket-based) — avoids repeated polling
          // round trips which are expensive from high-latency locations.
          const result = await statusConnection.confirmTransaction(
            { signature, ...blockhashInfo },
            'processed'
          );
          const err = (result as { value?: { err?: unknown } })?.value?.err;
          if (err) {
            throw new Error(`ER transaction failed on-chain: ${JSON.stringify(err)}`);
          }
          return;
        }
        // Fallback: poll when blockhash info is unavailable (e.g., router path).
        const timeoutMs = 20_000;
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
          const statuses = await statusConnection
            .getSignatureStatuses([signature], {
              searchTransactionHistory: false,
            })
            .catch(() => null);
          const status = statuses?.value?.[0] ?? null;
          if (status) {
            if (status.err) {
              throw new Error(`ER transaction failed on-chain: ${JSON.stringify(status.err)}`);
            }
            if (
              status.confirmationStatus === 'processed' ||
              status.confirmationStatus === 'confirmed' ||
              status.confirmationStatus === 'finalized'
            ) {
              return;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const historyStatus = await statusConnection
          .getSignatureStatuses([signature], {
            searchTransactionHistory: true,
          })
          .catch(() => null);
        const status = historyStatus?.value?.[0] ?? null;
        if (!status) {
          throw new Error(
            `ER transaction ${signature} did not reach processed status within ${timeoutMs}ms`
          );
        }
        if (status.err) {
          throw new Error(`ER transaction failed on-chain: ${JSON.stringify(status.err)}`);
        }
      };

      const maxAttempts = 8;
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const tx = new Transaction();
          tx.feePayer = signerKeypair.publicKey;
          tx.add(...transaction.instructions);

          // Prefer router path so tx lands on the ER node that owns delegated accounts.
          // Include delegated routing accounts (session PDA, VRF PDA, etc.) so the
          // router can pick the correct validator even when writable keys are passthrough.
          const useRouterPath = erConnection.rpcEndpoint.includes('router.magicblock.app');
          if (useRouterPath) {
            const sendViaDirectDelegatedValidator = async (): Promise<string> => {
              const routerWithDelegation = erConnection as Connection & {
                getDelegationStatus?: (
                  account: string | PublicKey
                ) => Promise<{ isDelegated: boolean; fqdn?: string }>;
              };
              if (typeof routerWithDelegation.getDelegationStatus !== 'function') {
                throw new Error('Router delegation-status API unavailable');
              }
              const delegation = await routerWithDelegation.getDelegationStatus(routingAccounts[0]);
              if (!delegation?.fqdn) {
                throw new Error('Delegation status missing validator fqdn');
              }
              const directValidatorConnection = new Connection(delegation.fqdn, {
                commitment: SOLANA_CONFIG.erCommitment,
                wsEndpoint: deriveErWsEndpoint(delegation.fqdn),
              });
              const directLatest = await directValidatorConnection.getLatestBlockhash('confirmed');
              tx.feePayer = signerKeypair.publicKey;
              tx.recentBlockhash = directLatest.blockhash;
              tx.lastValidBlockHeight = directLatest.lastValidBlockHeight;
              tx.sign(signerKeypair);

              const sig = await directValidatorConnection.sendRawTransaction(tx.serialize(), {
                skipPreflight: true,
                maxRetries: 2,
              });
              await waitForErSignature(sig, directValidatorConnection, directLatest);
              console.log('[SessionContext] sendRoutedErTransaction:direct_validator_ok', {
                attempt,
                signature: sig,
                fqdn: delegation.fqdn,
              });
              return sig;
            };

            try {
              const routedAccounts = new Set<string>([
                ...getWritableAccounts(tx),
                ...routingAccounts.map((account) => account.toBase58()),
              ]);
              const latest = await getRouterBlockhashForAccounts([...routedAccounts]);
              tx.feePayer = signerKeypair.publicKey;
              tx.recentBlockhash = latest.blockhash;
              tx.lastValidBlockHeight = latest.lastValidBlockHeight;
              tx.sign(signerKeypair);

              const sig = await erConnection.sendRawTransaction(tx.serialize(), {
                skipPreflight: true,
                maxRetries: 2,
              });
              await waitForErSignature(sig, erConnection, latest);
              console.log('[SessionContext] sendRoutedErTransaction:router_ok', {
                attempt,
                signature: sig,
              });
              return sig;
            } catch (routerErr) {
              const routerMessage =
                routerErr instanceof Error ? routerErr.message : String(routerErr);
              const needsDirectValidatorRoute =
                routerMessage.includes('delegated to unknown ER node') ||
                routerMessage.includes('delegated to different ER nodes') ||
                routerMessage.includes('InvalidAccountForFee');
              if (!needsDirectValidatorRoute || routingAccounts.length === 0) {
                throw routerErr;
              }
              return sendViaDirectDelegatedValidator();
            }
          }

          // Direct ER path (used when router is disabled).
          const latest = await directErConnection.getLatestBlockhash('confirmed');
          if (!latest?.blockhash) {
            throw new Error('ER blockhash unavailable');
          }
          tx.feePayer = signerKeypair.publicKey;
          tx.recentBlockhash = latest.blockhash;
          tx.lastValidBlockHeight = latest.lastValidBlockHeight;
          tx.sign(signerKeypair);
          const sig = await directErConnection.sendRawTransaction(tx.serialize(), {
            skipPreflight: true,
            maxRetries: 2,
          });
          await waitForErSignature(sig, directErConnection, latest);
          console.log('[SessionContext] sendRoutedErTransaction:direct_ok', {
            attempt,
            signature: sig,
          });
          return sig;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          const isUnknownNode =
            message.includes('delegated to unknown ER node') ||
            message.includes('different ER nodes');
          const isFeeVisibilityIssue = message.includes('InvalidAccountForFee');
          const isBlockhashIssue = message.includes('blockhash');
          if ((!isUnknownNode && !isBlockhashIssue && !isFeeVisibilityIssue) || attempt >= maxAttempts) {
            throw error;
          }
          console.warn('[SessionContext] sendRoutedErTransaction:retry', {
            attempt,
            error: message,
          });
          await new Promise((resolve) => setTimeout(resolve, ER_PROPAGATION_POLL_MS));
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error('Failed to send routed ER transaction');
    },
    [directErConnection, erConnection]
  );

  // Monitor wallet connection during active session
  useEffect(() => {
    if (sessionManager.hasActiveSession && !wallet.isConnected) {
      setIsWalletDisconnected(true);
      stopAutoCommit();
    } else if (wallet.isConnected) {
      setIsWalletDisconnected(false);
    }
  }, [sessionManager.hasActiveSession, wallet.isConnected]);

  // Fetch session when wallet connects
  const { fetchSession, resetSession, hasActiveSession: smHasActive } = sessionManager;
  useEffect(() => {
    if (wallet.isConnected && wallet.publicKey) {
      fetchSession();
    } else {
      // Only reset if we don't have an active session that we want to preserve
      // to allow for reconnection handling
      if (!smHasActive) {
        resetSession();
        setMapSeed(null);
      }
    }
  }, [wallet.isConnected, wallet.publicKey, fetchSession, resetSession, smHasActive]);

  useEffect(() => {
    if (!sessionManager.hasActiveSession || !sessionManager.session) {
      setUseErForGameplay(false);
      return;
    }
    setUseErForGameplay(sessionManager.session.isDelegated);
  }, [
    sessionManager.hasActiveSession,
    sessionManager.session,
    sessionManager.session?.isDelegated,
    setUseErForGameplay,
  ]);

  const fetchSessionGeneratedSeed = useCallback(
    async (_sessionPda: PublicKey): Promise<bigint | null> => {
      return null;
    },
    []
  );

  const getSessionDelegationTargets = useCallback(
    (sessionPda: PublicKey, options?: { includeVrf?: boolean; includeDuelEntry?: boolean }) => {
      const {
        gameStatePda,
        generatedMapPda,
        inventoryPda,
        mapPoisPda,
        poiVrfStatePda,
        sessionDiscoveryPda,
      } =
        deriveSessionPdas(sessionPda);
      const targets = [
        {
          label: 'session',
          pda: sessionPda,
          expectedOwner: SOLANA_CONFIG.programs.sessionManager,
        },
        {
          label: 'game_state',
          pda: gameStatePda,
          expectedOwner: SOLANA_CONFIG.programs.gameplayState,
        },
        {
          label: 'generated_map',
          pda: generatedMapPda,
          expectedOwner: SOLANA_CONFIG.programs.mapGenerator,
        },
        {
          label: 'inventory',
          pda: inventoryPda,
          expectedOwner: SOLANA_CONFIG.programs.playerInventory,
        },
        {
          label: 'map_pois',
          pda: mapPoisPda,
          expectedOwner: SOLANA_CONFIG.programs.poiSystem,
        },
        {
          label: 'session_discovery',
          pda: sessionDiscoveryPda,
          expectedOwner: SOLANA_CONFIG.programs.mapGenerator,
        },
      ];
      if (options?.includeVrf) {
        targets.push({
          label: 'poi_vrf_state',
          pda: poiVrfStatePda,
          expectedOwner: SOLANA_CONFIG.programs.poiSystem,
        });
      }
      if (options?.includeDuelEntry) {
        const [duelEntryPda] = deriveDuelEntryPda(sessionPda);
        targets.push({
          label: 'duel_entry',
          pda: duelEntryPda,
          expectedOwner: SOLANA_CONFIG.programs.gameplayState,
        });
      }
      return targets;
    },
    []
  );

  const isSessionFullyDelegatedOnBase = useCallback(
    async (sessionPda: PublicKey): Promise<boolean> => {
      try {
        const targets = getSessionDelegationTargets(sessionPda);
        const infos = await Promise.all(
          targets.map(({ pda }) => connection.getAccountInfo(pda, 'processed'))
        );
        return infos.every((info) => Boolean(info?.owner.equals(DELEGATION_PROGRAM_ID)));
      } catch {
        return false;
      }
    },
    [connection, getSessionDelegationTargets]
  );

  const waitForErSessionAccounts = useCallback(
    async (sessionPda: PublicKey, options?: { includeVrf?: boolean; includeDuelEntry?: boolean }): Promise<boolean> => {
      // Wait for the 6 core accounts that are always delegated from base chain.
      // VRF states (poi, map, gameplay) are also delegated but not checked here —
      // their readiness is verified via VRF fulfillment polling after requests are sent.
      const targets = getSessionDelegationTargets(sessionPda, {
        includeVrf: options?.includeVrf,
        includeDuelEntry: options?.includeDuelEntry,
      });
      const startedAt = Date.now();
      const routerConnection = erConnection as Connection & {
        getDelegationStatus?: (
          account: string | PublicKey
        ) => Promise<{ isDelegated: boolean; fqdn?: string }>;
      };
      const canUseRouterStatus = typeof routerConnection.getDelegationStatus === 'function';
      const delegationRecordPdas = canUseRouterStatus
        ? []
        : targets.map(({ pda }) =>
            PublicKey.findProgramAddressSync(
              [Buffer.from('delegation'), pda.toBuffer()],
              DELEGATION_PROGRAM_ID
            )[0]
          );
      const canDecodeCoreAccounts = async (): Promise<boolean> => {
        try {
          const routedConn = await getRoutedErConnectionForAccount(sessionPda);
          const conn = routedConn ?? directErConnection;
          const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
          const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
          const [mapPoisPda] = deriveMapPoisPda(sessionPda);
          const [generatedMapInfo, sessionDiscoveryInfo, mapPoisInfo] = await Promise.all([
            conn.getAccountInfo(generatedMapPda, 'processed'),
            conn.getAccountInfo(sessionDiscoveryPda, 'processed'),
            conn.getAccountInfo(mapPoisPda, 'processed'),
          ]);
          return !!generatedMapInfo && !!sessionDiscoveryInfo && !!mapPoisInfo;
        } catch {
          return false;
        }
      };

      while (Date.now() - startedAt < ER_PROPAGATION_WAIT_MS) {
        try {
          const infos = await Promise.all(
            targets.map(({ pda }) => directErConnection.getAccountInfo(pda, 'processed'))
          );
          const allReadyOnEr = infos.every(
            (info, index) =>
              Boolean(info) && info?.owner.equals(targets[index].expectedOwner)
          );
          const allDelegationRecordsAssigned = canUseRouterStatus
            ? (
                await Promise.all(
                  targets.map(({ pda }) => routerConnection.getDelegationStatus?.(pda))
                )
              ).every((status) => status?.isDelegated && !!status?.fqdn)
            : (
                await Promise.all(
                  delegationRecordPdas.map((pda) => connection.getAccountInfo(pda, 'processed'))
                )
              ).every((recordInfo) => {
                if (!recordInfo || recordInfo.data.length < 40) {
                  return false;
                }
                const authority = new PublicKey(recordInfo.data.slice(8, 40)).toBase58();
                return authority !== UNKNOWN_ER_NODE;
              });
          if (allReadyOnEr && allDelegationRecordsAssigned && (await canDecodeCoreAccounts())) {
            return true;
          }
        } catch {
          // ER may briefly reject reads while indexer catches up.
        }
        await new Promise((resolve) => setTimeout(resolve, ER_PROPAGATION_POLL_MS));
      }
      return false;
    },
    [connection, directErConnection, erConnection, getSessionDelegationTargets]
  );

  const getRoutedErConnectionForAccount = useCallback(
    async (account: PublicKey): Promise<Connection | null> => {
      const routerConnection = erConnection as Connection & {
        getDelegationStatus?: (
          account: string | PublicKey
        ) => Promise<{ isDelegated: boolean; fqdn?: string }>;
      };
      if (typeof routerConnection.getDelegationStatus !== 'function') {
        return null;
      }
      try {
        const status = await routerConnection.getDelegationStatus(account);
        if (!status?.fqdn) return null;
        return new Connection(status.fqdn, {
          commitment: SOLANA_CONFIG.erCommitment,
          wsEndpoint: deriveErWsEndpoint(status.fqdn),
        });
      } catch {
        return null;
      }
    },
    [erConnection]
  );

  const resolveAndSetErEndpoint = useCallback(
    async (sessionPda: PublicKey): Promise<Connection | null> => {
      try {
        const conn = await getRoutedErConnectionForAccount(sessionPda);
        if (conn) {
          console.log('[SessionContext] Resolved ER validator endpoint:', conn.rpcEndpoint);
          setResolvedErEndpoint(conn.rpcEndpoint);
          return conn;
        }
      } catch {
        // Non-fatal: reads will fall back to generic endpoint
      }
      return null;
    },
    [getRoutedErConnectionForAccount, setResolvedErEndpoint]
  );

  const sendErInitTransactionWithRetry = useCallback(
    async (
      label: string,
      transaction: Transaction,
      signerKeypair: Keypair,
      sessionPda: PublicKey
    ): Promise<string> => {
      const MAX_ATTEMPTS = 5;
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          return await sendRoutedErTransaction(transaction, signerKeypair, [sessionPda]);
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          const isPropagationError = isErPropagationErrorMessage(message);

          if (!isPropagationError || attempt >= MAX_ATTEMPTS) {
            throw error;
          }

          console.warn(`[SessionContext] ${label}:retry_after_er_propagation_error`, {
            attempt,
            error: message,
          });
          await waitForErSessionAccounts(sessionPda, {
            includeVrf: !SOLANA_CONFIG.isLocalValidator,
          });
          await new Promise((resolve) => setTimeout(resolve, ER_PROPAGATION_POLL_MS));
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`Failed to send ${label} transaction on ER`);
    },
    [sendRoutedErTransaction, waitForErSessionAccounts]
  );

  /**
   * Wait for the session signer's passthrough account to become usable on the ER.
   * The session signer is funded on the base chain but the ER needs time to sync
   * non-delegated (passthrough) accounts. Without this wait, VRF transactions
   * fail with "InvalidAccountForFee" because the ER can't debit fees from the
   * payer account until it is materialized as a normal system account.
   */
  const waitForSessionSignerOnEr = useCallback(
    async (signerPublicKey: PublicKey, routeAccount?: PublicKey): Promise<{ ready: boolean; endpoint?: string }> => {
      const WAIT_MS = 15_000;
      const POLL_MS = 1_000;
      const startedAt = Date.now();
      const routedConn = routeAccount
        ? await getRoutedErConnectionForAccount(routeAccount)
        : null;
      const candidates = [routedConn, directErConnection].filter(
        (conn): conn is Connection => conn !== null
      );

      while (Date.now() - startedAt < WAIT_MS) {
        try {
          for (const conn of candidates) {
            const accountInfo = await conn.getAccountInfo(signerPublicKey, 'processed');
            const lamports = accountInfo?.lamports ?? 0;
            const owner = accountInfo?.owner?.toBase58() ?? null;
            const dataLength = accountInfo?.data.length ?? null;
            const isSystemFeePayer =
              lamports > 0 &&
              accountInfo !== null &&
              accountInfo.owner.equals(SystemProgram.programId) &&
              accountInfo.data.length === 0 &&
              !accountInfo.executable;

            if (isSystemFeePayer) {
              console.log('[SessionContext] waitForSessionSignerOnEr: signer ready on ER', {
                lamports,
                elapsed: Date.now() - startedAt,
                endpoint: conn.rpcEndpoint,
              });
              return { ready: true, endpoint: conn.rpcEndpoint };
            }

            if (lamports > 0) {
              console.log('[SessionContext] waitForSessionSignerOnEr: signer not fee-ready yet', {
                lamports,
                owner,
                dataLength,
                elapsed: Date.now() - startedAt,
                endpoint: conn.rpcEndpoint,
              });
            }
          }
        } catch {
          // ER may briefly reject reads while indexer catches up.
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      console.warn('[SessionContext] waitForSessionSignerOnEr: timed out waiting for signer on ER');
      return { ready: false };
    },
    [directErConnection, getRoutedErConnectionForAccount]
  );

  /**
   * Read the map VRF seed from the base-layer VRF state after fulfillment.
   * Used on localnet to call fillMapWithSeed instead of generateMapWithVrf,
   * since the VRF state isn't delegated and can't be written on ER.
   */
  const readMapVrfSeedFromBase = useCallback(
    async (sessionPda: PublicKey): Promise<bigint> => {
      const [mapVrfPda] = deriveMapVrfStatePda(sessionPda);
      const info = await connection.getAccountInfo(mapVrfPda, 'confirmed');
      if (!info || info.data.length < 48) {
        throw new Error('Map VRF state not found or not yet fulfilled on base layer');
      }
      // Extract first 8 bytes of randomness (offset 40 = 8 discriminator + 32 session) as u64 LE
      const buf = info.data.slice(40, 48);
      const seed = Buffer.from(buf).readBigUInt64LE(0);
      console.log('[SessionContext] readMapVrfSeedFromBase: seed', { seed: seed.toString() });
      return seed;
    },
    [connection]
  );

  /**
   * On localnet, request VRF on the base layer and wait for oracle fulfillment.
   * The VRF state is NOT delegated — the ER clones it from base on first read.
   * This avoids VRF program CPI on ER which triggers post-execution rejection.
   *
   * On devnet/mainnet this is a no-op (returns success immediately).
   */
  const requestBaseLayerVrf = useCallback(
    async (
      sessionPda: PublicKey,
      sessionSignerKeypair: Keypair,
      vrfTypes: ('poi' | 'map' | 'gameplay')[]
    ): Promise<{ success: boolean; error?: string }> => {
      if (!SOLANA_CONFIG.isLocalValidator) return { success: true };
      if (vrfTypes.length === 0) return { success: true };

      const label = vrfTypes.join('+');
      const localPayer = getLocalVrfPayerKeypair() ?? sessionSignerKeypair;
      console.log(`[SessionContext] requestBaseLayerVrf: requesting ${label} on base (localnet)`, {
        payer: localPayer.publicKey.toBase58(),
      });
      try {
        const tx = new Transaction();

        if (vrfTypes.includes('poi')) {
          const basePoiSysProg = createPoiSystemProgram(connection);
          const poiVrfTx = await buildRequestAndFulfillPoiVrfTransaction(
            basePoiSysProg,
            sessionPda,
            localPayer.publicKey,
            localPayer.publicKey
          );
          tx.add(...poiVrfTx.instructions);
        }
        if (vrfTypes.includes('map')) {
          const baseMapGenProg = createMapGeneratorProgram(connection);
          const mapVrfIxs = await buildRequestAndFulfillMapVrfInstructions(
            baseMapGenProg,
            sessionPda,
            localPayer.publicKey,
            localPayer.publicKey
          );
          tx.add(...mapVrfIxs);
        }
        if (vrfTypes.includes('gameplay')) {
          const baseGameplayProg = createGameplayStateProgram(connection);
          const gameplayVrfTx = await buildRequestGameplayVrfTransaction(
            baseGameplayProg,
            sessionPda,
            localPayer.publicKey,
            localPayer.publicKey
          );
          tx.add(...gameplayVrfTx.instructions);
        }

        try {
          await sendSessionSignerTransaction(connection, tx, localPayer);
        } catch (sendErr) {
          // VRF already fulfilled from a previous session attempt — treat as success.
          const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
          if (errMsg.includes('VrfAlreadyFulfilled') || errMsg.includes('0x1799')) {
            console.log(`[SessionContext] requestBaseLayerVrf: ${label} already fulfilled, skipping`);
            vrfReadySessionsRef.current.add(sessionPda.toBase58());
            return { success: true };
          }
          throw sendErr;
        }
        console.log(`[SessionContext] requestBaseLayerVrf: ${label} requested, waiting for oracle...`);

        const waitPromises: Promise<boolean>[] = [];
        if (vrfTypes.includes('poi')) {
          const [pda] = derivePoiVrfStatePda(sessionPda);
          waitPromises.push(waitForVrfFulfillment(connection, pda, 30_000));
        }
        if (vrfTypes.includes('map')) {
          const [pda] = deriveMapVrfStatePda(sessionPda);
          waitPromises.push(waitForVrfFulfillment(connection, pda, 30_000));
        }
        if (vrfTypes.includes('gameplay')) {
          const [pda] = deriveGameplayVrfStatePda(sessionPda);
          waitPromises.push(waitForVrfFulfillment(connection, pda, 30_000));
        }

        const results = await Promise.all(waitPromises);
        if (results.every(Boolean)) {
          console.log(`[SessionContext] requestBaseLayerVrf: ${label} fulfilled on base (localnet)`);
          vrfReadySessionsRef.current.add(sessionPda.toBase58());
          return { success: true };
        }
        return {
          success: false,
          error: `VRF (${label}) not fulfilled on base layer. Ensure vrf-oracle is running against base layer (RPC_URL=http://127.0.0.1:8899).`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[SessionContext] requestBaseLayerVrf: failed`, err);
        return { success: false, error: `Base layer VRF request failed: ${msg}` };
      }
    },
    [connection]
  );

  const readPoiVrfStatus = useCallback(
    async (sessionPda: PublicKey): Promise<number | null> => {
      const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
      const routedConnection = await getRoutedErConnectionForAccount(sessionPda);
      const candidates = [routedConnection, directErConnection].filter(
        (conn): conn is Connection => conn !== null
      );
      for (const conn of candidates) {
        const info = await conn.getAccountInfo(poiVrfStatePda, 'processed').catch(() => null);
        if (info && info.data.length > VRF_STATUS_OFFSET) {
          return info.data[VRF_STATUS_OFFSET] ?? null;
        }
      }
      return null;
    },
    [directErConnection, getRoutedErConnectionForAccount]
  );

  const logErSignatureDiagnostics = useCallback(
    async (label: string, signature: string) => {
      try {
        const [statusResp, txResp] = await Promise.all([
          directErConnection.getSignatureStatuses([signature], {
            searchTransactionHistory: true,
          }),
          directErConnection
            .getTransaction(signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            })
            .catch(() => null),
        ]);
        const status = statusResp.value[0] ?? null;
        const txMeta = txResp?.meta ?? null;
        console.error(`[SessionContext] ${label}:signature_diagnostics`, {
          signature,
          confirmationStatus: status?.confirmationStatus ?? null,
          statusErr: status?.err ?? null,
          txErr: txMeta?.err ?? null,
          logCount: txMeta?.logMessages?.length ?? 0,
          logs: txMeta?.logMessages ?? null,
        });
      } catch (diagErr) {
        console.warn(`[SessionContext] ${label}:diagnostics_failed`, {
          signature,
          error: diagErr instanceof Error ? diagErr.message : String(diagErr),
        });
      }
    },
    [directErConnection]
  );

  const ensureSessionVrfReady = useCallback(
    async (sessionPdaInput?: string): Promise<TransactionResult> => {
      const resolvedSessionPda =
        (sessionPdaInput ? new PublicKey(sessionPdaInput) : null) ??
        sessionManager.activeSessionPda ??
        null;
      if (!resolvedSessionPda) {
        return { success: false, error: 'No active session to validate VRF' };
      }

      const sessionKey = resolvedSessionPda.toBase58();
      if (vrfReadySessionsRef.current.has(sessionKey)) {
        return { success: true };
      }

      const [poiVrfStatePda] = derivePoiVrfStatePda(resolvedSessionPda);

      const isFulfilledStatus = (status: number | null): boolean =>
        status !== null && status >= VRF_STATUS_FULFILLED;

      // POI VRF is initialized and requested on the Ephemeral Rollup after delegation.
      // Always poll the ER connection for fulfillment status.
      const readStatusFromAny = async (): Promise<number | null> => {
        const routedConnection = await getRoutedErConnectionForAccount(resolvedSessionPda);
        const candidates = [routedConnection, directErConnection].filter(
          (conn): conn is Connection => conn !== null
        );
        for (const conn of candidates) {
          const info = await conn.getAccountInfo(poiVrfStatePda, 'processed').catch(() => null);
          if (info && info.data.length > VRF_STATUS_OFFSET) {
            return info.data[VRF_STATUS_OFFSET] ?? null;
          }
        }
        return null;
      };

      // Quick check: already fulfilled?
      const statusNow = await readStatusFromAny();
      if (isFulfilledStatus(statusNow)) {
        vrfReadySessionsRef.current.add(sessionKey);
        return { success: true };
      }

      console.log('[SessionContext] ensureSessionVrfReady: waiting for fulfillment', {
        sessionPda: sessionKey,
        poiVrfStatePda: poiVrfStatePda.toBase58(),
        statusNow,
      });

      // Wait for oracle fulfillment on ER.
      const WAIT_TIMEOUT_MS = 30_000;
      const POLL_MS = 1_000;
      const startedAt = Date.now();
      while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
        const status = await readStatusFromAny();
        if (isFulfilledStatus(status)) {
          console.log('[SessionContext] ensureSessionVrfReady: fulfilled');
          vrfReadySessionsRef.current.add(sessionKey);
          return { success: true };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }

      return {
        success: false,
        error:
          'POI VRF was not fulfilled in time. The oracle may not have processed the request. Try overriding the session.',
      };
    },
    [
      directErConnection,
      getRoutedErConnectionForAccount,
      sessionManager.activeSessionPda,
    ]
  );

  const ensureSessionDiscoveryInitialized = useCallback(
    async (
      sessionPda: PublicKey,
      sessionSignerKeypair: Keypair,
      flowLabel: string
    ): Promise<void> => {
      const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
      const sessionDiscoveryInfo = await connection
        .getAccountInfo(sessionDiscoveryPda)
        .catch(() => null);
      if (sessionDiscoveryInfo) {
        return;
      }

      try {
        const mapGenProg = createMapGeneratorProgram(connection);
        const initSessionDiscoveryTx = await mapGenProg.methods
          .initSessionDiscovery()
          .accounts({
            payer: sessionSignerKeypair.publicKey,
            session: sessionPda,
            sessionDiscovery: sessionDiscoveryPda,
            systemProgram: SystemProgram.programId,
          })
          .transaction();
        await sendSessionSignerTransaction(connection, initSessionDiscoveryTx, sessionSignerKeypair);
        console.log(`[SessionContext] ${flowLabel}:init_session_discovery:ok`);
      } catch (sessionDiscoveryError) {
        console.warn(
          `[SessionContext] ${flowLabel}:init_session_discovery:failed`,
          sessionDiscoveryError
        );
      }
    },
    [connection]
  );

  /**
   * Re-request and wait for map+gameplay VRF fulfillment on the ER for an
   * existing gauntlet/duel session. Call this when resuming after a VRF timeout.
   */
  const retryErVrfForSession = useCallback(
    async (sessionPdaStr: string): Promise<TransactionResult> => {
      const sessionPda = new PublicKey(sessionPdaStr);
      const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
      const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
      const routedConnection =
        (await getRoutedErConnectionForAccount(sessionPda)) ?? directErConnection;

      const rebuildMapFromVrf = async (sessionSignerKeypair: Keypair): Promise<void> => {
        await ensureSessionDiscoveryInitialized(
          sessionPda,
          sessionSignerKeypair,
          'retryErVrfForSession'
        );
        const erMapGenProgram = createMapGeneratorProgram(directErConnection);
        const erGameplayProgram = createGameplayStateProgram(directErConnection);
        const erPoiSystemProgram = createPoiSystemProgram(directErConnection);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const localMapSeed = SOLANA_CONFIG.isLocalValidator
          ? await readMapVrfSeedFromBase(sessionPda)
          : undefined;
        const { mapTx, syncTx } = await buildMapAndSyncTransaction(
          SOLANA_CONFIG.isLocalValidator ? 'seed' : 'vrf',
          erMapGenProgram,
          erGameplayProgram,
          sessionPda,
          sessionSignerKeypair.publicKey,
          { campaignLevel: 20, seed: localMapSeed, gameplayVrfStatePda: deriveGameplayVrfStatePda(sessionPda)[0] }
        );
        const mapWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
          ...mapTx.instructions
        );
        await sendErInitTransactionWithRetry(
          'resumeGame:fill_map',
          mapWithBudgetTx,
          sessionSignerKeypair,
          sessionPda
        );
        // Refresh MapPois BEFORE sync_map_enemies so that sync_map_enemies can
        // read the mole-den from MapPois and record it in SessionDiscovery.
        const generatedSeed = (await fetchSessionGeneratedSeed(sessionPda)) ?? BigInt(20);
        const refreshMapPoisIx = await erPoiSystemProgram.methods
          .refreshMapPois(2, 1, new BN(generatedSeed.toString()))
          .accounts({
            mapPois: mapPoisPda,
            session: sessionPda,
            generatedMap: generatedMapPda,
            gameState: gameStatePda,
            sessionSigner: sessionSignerKeypair.publicKey,
          })
          .instruction();
        const rebuildMapPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          refreshMapPoisIx
        );
        await sendErInitTransactionWithRetry(
          'resumeGame:refresh_map_pois',
          rebuildMapPoisTx,
          sessionSignerKeypair,
          sessionPda
        );

        const syncWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          ...syncTx.instructions
        );
        await sendErInitTransactionWithRetry(
          'resumeGame:sync_map_enemies',
          syncWithBudgetTx,
          sessionSignerKeypair,
          sessionPda
        );

        // Discover POIs near spawn so they appear immediately
        const discoverPoisIx = await buildDiscoverSpawnPoisInstruction(
          erPoiSystemProgram,
          sessionPda,
          sessionSignerKeypair.publicKey,
          6 // SPAWN_VISION_RADIUS
        );
        const discoverPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          discoverPoisIx
        );
        await sendErInitTransactionWithRetry(
          'resumeGame:discover_spawn_pois',
          discoverPoisTx,
          sessionSignerKeypair,
          sessionPda
        );
      };

      // Quick check — oracle may have responded since the last attempt
      const [mapReadyQuick, gameplayReadyQuick] = await Promise.all([
        waitForVrfFulfillment(routedConnection, mapVrfStatePda, 2_000),
        waitForVrfFulfillment(routedConnection, gameplayVrfStatePda, 2_000),
      ]);

      if (mapReadyQuick && gameplayReadyQuick) {
        console.log('[SessionContext] retryErVrfForSession: already fulfilled (oracle was slow)');
        // VRF fulfilled/consumed but map may not have been generated yet.
        // Check if generated_map already exists (e.g. resuming a session where
        // VRF was consumed by a prior generate_map_with_vrf call). If it does,
        // skip rebuild — calling generate_map_with_vrf on a Consumed VRF state
        // would fail with VrfNotFulfilled (error 6011).
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const existingMap = await directErConnection.getAccountInfo(generatedMapPda, 'processed');
        if (existingMap) {
          console.log('[SessionContext] retryErVrfForSession: map already exists, skipping rebuild');
          return { success: true };
        }
        try {
          const walletAddr = wallet.publicKey?.toBase58() ?? '';
          const sessionSignerKeypair = await loadSessionSignerForSession(walletAddr, sessionPdaStr);
          if (sessionSignerKeypair) {
            await rebuildMapFromVrf(sessionSignerKeypair);
          }
        } catch (regenErr) {
          console.error('[SessionContext] retryErVrfForSession: map+sync failed', regenErr);
          return {
            success: false,
            error:
              regenErr instanceof Error
                ? regenErr.message
                : 'Failed to generate map after VRF',
          };
        }
        return { success: true };
      }

      // VRF not yet fulfilled — load session signer and re-request on ER
      const walletAddr = wallet.publicKey?.toBase58() ?? '';
      const sessionSignerKeypair = await loadSessionSignerForSession(walletAddr, sessionPdaStr);
      if (!sessionSignerKeypair) {
        return { success: false, error: 'Session key not found — cannot re-request VRF' };
      }

      console.log('[SessionContext] retryErVrfForSession: re-requesting map+gameplay VRF on ER');
      try {
        const gameplayProg = createGameplayStateProgram(directErConnection);
        const erMapGenProgram = createMapGeneratorProgram(directErConnection);
        const mapVrfIxs = await buildRequestAndFulfillMapVrfInstructions(
          erMapGenProgram,
          sessionPda,
          sessionSignerKeypair.publicKey,
          sessionSignerKeypair.publicKey
        );
        const gameplayVrfTx = await buildRequestGameplayVrfTransaction(
          gameplayProg,
          sessionPda,
          sessionSignerKeypair.publicKey,
          sessionSignerKeypair.publicKey
        );
        const allVrfTx = new Transaction();
        allVrfTx.add(...mapVrfIxs);
        allVrfTx.add(...gameplayVrfTx.instructions);
        await sendRoutedErTransaction(allVrfTx, sessionSignerKeypair, [sessionPda]);
        console.log('[SessionContext] retryErVrfForSession: VRF re-requested, waiting for oracle...');
      } catch (requestErr) {
        // Re-request may fail if VRF is already in a pending state — log and continue polling
        console.warn(
          '[SessionContext] retryErVrfForSession: re-request failed (may already be pending)',
          requestErr
        );
      }

      // Wait for oracle fulfillment
      const [mapFulfilled, gameplayFulfilled] = await Promise.all([
        waitForVrfFulfillment(routedConnection, mapVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
        waitForVrfFulfillment(routedConnection, gameplayVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
      ]);

      if (!mapFulfilled || !gameplayFulfilled) {
        return {
          success: false,
          error: 'Randomness (VRF) not received from oracle — please try again',
        };
      }

      // Fulfilled — generate map with VRF seed and sync enemies
      try {
        await rebuildMapFromVrf(sessionSignerKeypair);
        console.log('[SessionContext] retryErVrfForSession: map+sync complete (ER)');
      } catch (regenErr) {
        console.error('[SessionContext] retryErVrfForSession:map+sync failed', regenErr);
        return {
          success: false,
          error: regenErr instanceof Error ? regenErr.message : 'Failed to generate map after VRF',
        };
      }

      return { success: true };
    },
    [
      ensureSessionDiscoveryInitialized,
      directErConnection,
      fetchSessionGeneratedSeed,
      getRoutedErConnectionForAccount,
      sendRoutedErTransaction,
      sendErInitTransactionWithRetry,
      wallet.publicKey,
    ]
  );

  const getSessionStartupState = useCallback(
    async (sessionPdaInput?: string): Promise<SessionStartupState | null> => {
      const resolvedSessionPda =
        (sessionPdaInput ? new PublicKey(sessionPdaInput) : null) ??
        sessionManager.activeSessionPda ??
        null;
      if (!resolvedSessionPda) {
        return null;
      }

      const sessionKey = resolvedSessionPda.toBase58();
      if (vrfReadySessionsRef.current.has(sessionKey)) {
        return 'vrf_ready';
      }

      const delegatedOnBase = await isSessionFullyDelegatedOnBase(resolvedSessionPda);
      if (!delegatedOnBase) {
        return 'created';
      }

      const erReady = await waitForErSessionAccounts(resolvedSessionPda);
      if (!erReady) {
        return 'delegated';
      }

      const status = await readPoiVrfStatus(resolvedSessionPda).catch(() => null);
      if (status !== null && status >= VRF_STATUS_FULFILLED) {
        vrfReadySessionsRef.current.add(sessionKey);
        return 'vrf_ready';
      }
      return 'vrf_pending';
    },
    [
      isSessionFullyDelegatedOnBase,
      readPoiVrfStatus,
      sessionManager.activeSessionPda,
      waitForErSessionAccounts,
    ]
  );

  // Always sync map seed from the active session's generated map account.
  // This avoids overwriting PvP sessions with campaign-level map config seeds.
  useEffect(() => {
    let isMounted = true;

    const syncMapSeedFromActiveSession = async () => {
      if (!sessionManager.session) {
        setMapSeed(null);
        return;
      }

      if (!sessionManager.activeSessionPda) {
        return;
      }

      const generatedSeed = await fetchSessionGeneratedSeed(sessionManager.activeSessionPda);
      if (isMounted) {
        setMapSeed(generatedSeed);
      }
    };

    void syncMapSeedFromActiveSession();

    return () => {
      isMounted = false;
    };
  }, [
    fetchSessionGeneratedSeed,
    sessionManager.activeSessionPda,
    sessionManager.session?.sessionId,
  ]);

  const confirmSignatureWithTimeout = useCallback(
    async (signature: string, timeoutMs = 15000): Promise<void> => {
      console.log('[SessionContext] confirmSignatureWithTimeout:start', {
        signature,
        timeoutMs,
        commitment: SOLANA_CONFIG.commitment,
      });
      try {
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        console.log('[SessionContext] confirmSignatureWithTimeout:confirmTransaction:ok', {
          signature,
        });
        return;
      } catch {
        console.warn('[SessionContext] confirmSignatureWithTimeout:falling_back_to_poll', {
          signature,
        });
        // fall through to status polling
      }

      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const statuses = await connection.getSignatureStatuses([signature]);
        const status = statuses.value[0];
        console.log('[SessionContext] confirmSignatureWithTimeout:poll', {
          signature,
          confirmationStatus: status?.confirmationStatus ?? null,
          hasErr: !!status?.err,
          elapsedMs: Date.now() - start,
        });
        if (status?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (
          status &&
          (status.confirmationStatus === 'processed' ||
            status.confirmationStatus === 'confirmed' ||
            status.confirmationStatus === 'finalized')
        ) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('Timed out waiting for transaction confirmation');
    },
    [connection]
  );

  const formatUnknownErrorMessage = useCallback((err: unknown): string => {
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === 'string') {
      return err;
    }
    if (err && typeof err === 'object') {
      const maybeMessage = (err as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.length > 0) {
        return maybeMessage;
      }
      try {
        return JSON.stringify(err);
      } catch {
        return String(err);
      }
    }
    return String(err);
  }, []);

  const logTxDebugError = useCallback((label: string, err: unknown) => {
    const e = err as
      | Error
      | {
          message?: string;
          logs?: string[];
          transactionLogs?: string[];
          cause?: unknown;
        };
    const directLogs = Array.isArray((e as { logs?: string[] }).logs)
      ? (e as { logs: string[] }).logs
      : null;
    const txLogs = Array.isArray((e as { transactionLogs?: string[] }).transactionLogs)
      ? (e as { transactionLogs: string[] }).transactionLogs
      : null;
    const causeLogs =
      typeof (e as { cause?: unknown }).cause === 'object' &&
      (e as { cause?: { logs?: string[] } }).cause &&
      Array.isArray(((e as { cause?: { logs?: string[] } }).cause as { logs?: string[] }).logs)
        ? (((e as { cause?: { logs?: string[] } }).cause as { logs?: string[] }).logs ?? null)
        : null;

    console.error(`[SessionContext] ${label}:error`, {
      message: formatUnknownErrorMessage(err),
      logs: directLogs,
      transactionLogs: txLogs,
      causeLogs,
      raw: err,
    });
  }, [formatUnknownErrorMessage]);

  const debugSimulateTransaction = useCallback(
    async (label: string, transaction: Transaction): Promise<void> => {
      try {
        const sim = await connection.simulateTransaction(transaction);
        if (sim.value.err) {
          console.warn(`[SessionContext] ${label}:simulate:err`, {
            err: sim.value.err,
            logs: sim.value.logs ?? [],
            unitsConsumed: sim.value.unitsConsumed ?? null,
          });
        } else {
          console.log(`[SessionContext] ${label}:simulate:ok`, {
            unitsConsumed: sim.value.unitsConsumed ?? null,
          });
        }
      } catch (simErr) {
        console.warn(`[SessionContext] ${label}:simulate:failed`, simErr);
      }
    },
    [connection]
  );

  const getSerializedTransactionSize = useCallback((transaction: Transaction): number | null => {
    try {
      return transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }).length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const match = message.match(/Transaction too large:\s*(\d+)\s*>\s*(\d+)/i);
      if (match) {
        return Number(match[1]);
      }
      return null;
    }
  }, []);

  const isAccountNotInitializedError = useCallback((err: unknown): boolean => {
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.includes('AccountNotInitialized') ||
      message.includes('custom program error: 0xbc4') ||
      message.includes('custom program error: 0xBC4')
    );
  }, []);

  const getFallbackStateHash = useCallback((): number[] => {
    const stateHash = sessionManager.session?.stateHash
      ? Array.from(sessionManager.session.stateHash)
      : [];
    if (stateHash.length === 32) {
      return stateHash;
    }
    return new Array<number>(32).fill(0);
  }, [sessionManager.session?.stateHash]);

  const ensureDelegatedToRollup = useCallback(
    async (options?: {
      sessionPda?: PublicKey;
      onChainLevel?: number;
      sessionSignerKeypair?: Keypair;
      delegateVrf?: ('poi' | 'map' | 'gameplay')[];
      delegateDuelEntry?: boolean;
    }): Promise<TransactionResult> => {
      const targetSessionPda = options?.sessionPda ?? sessionManager.activeSessionPda ?? null;
      // Check on-chain first — avoids redundant delegation attempts when React state is stale
      // (e.g. switchToSession called right after startGauntletGame already delegated).
      if (targetSessionPda) {
        const alreadyDelegated = await isSessionFullyDelegatedOnBase(targetSessionPda);
        if (alreadyDelegated) {
          // Core accounts are delegated. But DuelEntry may still need delegation
          // (it's created in enter_duel after session delegation on previous flows).
          if (options?.delegateDuelEntry) {
            const [duelEntryPda] = deriveDuelEntryPda(targetSessionPda);
            const duelEntryInfo = await connection.getAccountInfo(duelEntryPda, 'processed').catch(() => null);
            if (duelEntryInfo && !duelEntryInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
              // DuelEntry exists but not delegated — delegate it now via direct IX.
              const sessionSignerKp = options?.sessionSignerKeypair ?? sessionSigner.keypair;
              if (sessionSignerKp) {
                console.log('[SessionContext] ensureDelegatedToRollup: delegating DuelEntry');
                await sessionManager.delegateDuelEntry(sessionSignerKp, targetSessionPda);
              }
            }
          }
          const erReady = await waitForErSessionAccounts(targetSessionPda, {
            includeDuelEntry: options?.delegateDuelEntry,
          });
          if (!erReady) {
            console.warn(
              '[SessionContext] Delegated on base but ER is missing session accounts after timeout'
            );
          }
          setUseErForGameplay(erReady);
          if (erReady) {
            await resolveAndSetErEndpoint(targetSessionPda);
            return { success: true };
          }
          return { success: false, error: 'Delegation not fully propagated to ER yet. Please retry.' };
        }
      } else if (sessionManager.session?.isDelegated) {
        // Session state says delegated, but DuelEntry may still need delegation.
        if (options?.delegateDuelEntry && targetSessionPda) {
          const [duelEntryPda] = deriveDuelEntryPda(targetSessionPda);
          const duelEntryInfo = await connection.getAccountInfo(duelEntryPda, 'processed').catch(() => null);
          if (duelEntryInfo && !duelEntryInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
            const sessionSignerKp = options?.sessionSignerKeypair ?? sessionSigner.keypair;
            if (sessionSignerKp) {
              console.log('[SessionContext] ensureDelegatedToRollup: session delegated but DuelEntry needs delegation');
              await sessionManager.delegateDuelEntry(sessionSignerKp, targetSessionPda);
              await waitForErSessionAccounts(targetSessionPda, { includeDuelEntry: true });
            }
          }
        }
        setUseErForGameplay(true);
        return { success: true };
      }

      const sessionSignerKeypair = options?.sessionSignerKeypair ?? sessionSigner.keypair;
      if (!sessionSignerKeypair) {
        return { success: false, error: 'Session key signer not available for delegation' };
      }

      const delegateWithOverrides = () =>
        sessionManager.delegateSession(sessionSignerKeypair, {
          sessionPda: targetSessionPda ?? undefined,
          onChainLevel: options?.onChainLevel ?? sessionManager.session?.campaignLevel ?? undefined,
          delegateVrf: options?.delegateVrf,
          delegateDuelEntry: options?.delegateDuelEntry,
        });

      let result = await delegateWithOverrides();
      const initialMessage = result.error?.toLowerCase() ?? '';
      if (!result.success && initialMessage.includes('no active session to delegate')) {
        // Newly-created sessions can hit a short state propagation race; refresh once and retry.
        await sessionManager.fetchSession();
        result = await delegateWithOverrides();
      }

      if (result.success) {
        // Wait for ER to pick up delegated accounts before switching gameplay route
        if (targetSessionPda) {
          const erReady = await waitForErSessionAccounts(targetSessionPda, {
            includeDuelEntry: options?.delegateDuelEntry,
          });
          if (!erReady) {
            return {
              success: false,
              error: 'Delegation not fully propagated to ER yet. Please retry.',
            };
          }
          await resolveAndSetErEndpoint(targetSessionPda);
        }
        setUseErForGameplay(true);
        return result;
      }

      const message = result.error?.toLowerCase() ?? '';
      if (message.includes('already delegated')) {
        if (targetSessionPda) await resolveAndSetErEndpoint(targetSessionPda);
        setUseErForGameplay(true);
        return { success: true, signature: result.signature };
      }

      return result;
    },
    [
      sessionManager,
      isSessionFullyDelegatedOnBase,
      sessionManager.activeSessionPda,
      sessionManager.session?.campaignLevel,
      sessionSigner.keypair,
      setUseErForGameplay,
      erConnection,
      resolveAndSetErEndpoint,
      waitForErSessionAccounts,
    ]
  );

  const recoverDeterministicSessionSigner = useCallback(
    async (sessionPda: PublicKey): Promise<Keypair | null> => {
      if (!wallet.publicKey) {
        return null;
      }

      try {
        const accountInfo = await connection.getAccountInfo(sessionPda, 'processed');
        if (!accountInfo?.data) {
          return null;
        }

        const sessionManagerProgram = createSessionManagerProgram(connection);
        const decoded = sessionManagerProgram.coder.accounts.decode(
          'gameSession',
          accountInfo.data
        ) as { sessionSigner?: PublicKey };
        const expectedSessionSigner = decoded.sessionSigner ?? null;
        if (!expectedSessionSigner) {
          return null;
        }

        const nonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
        const candidates: Array<{ mode: string; nonce: bigint; matches: boolean }> = [];

        for (let level = 1; level <= 40; level += 1) {
          const [candidatePda] = deriveSessionPda(wallet.publicKey, level, nonces.campaign);
          if (candidatePda.equals(sessionPda)) {
            candidates.push({
              mode: `campaign-${level}`,
              nonce: nonces.campaign,
              matches: true,
            });
            break;
          }
        }

        const [duelPda] = deriveDuelSessionPda(wallet.publicKey, nonces.duel);
        if (duelPda.equals(sessionPda)) {
          candidates.push({ mode: 'duel', nonce: nonces.duel, matches: true });
        }

        const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey, nonces.gauntlet);
        if (gauntletPda.equals(sessionPda)) {
          candidates.push({ mode: 'gauntlet', nonce: nonces.gauntlet, matches: true });
        }

        for (const candidate of candidates) {
          if (!candidate.matches) continue;
          let derivedKeypair: Keypair;
          if (sessionSigner.keypair && sessionSigner.keypair.publicKey.equals(expectedSessionSigner)) {
            derivedKeypair = sessionSigner.keypair;
          } else {
            // Try new fixed derivation first
            const signature = await signMessage(
              buildGameWalletDerivationMessage()
            );
            derivedKeypair = deriveSessionSignerFromSignature(signature);

            // Fallback: try legacy per-session derivation for sessions created before v1
            if (!derivedKeypair.publicKey.equals(expectedSessionSigner)) {
              const legacySig = await signMessage(
                buildSessionDerivationMessage(candidate.mode, candidate.nonce)
              );
              derivedKeypair = deriveSessionSignerFromSignature(legacySig);
            }
          }
          if (!derivedKeypair.publicKey.equals(expectedSessionSigner)) {
            continue;
          }

          await sessionSigner.markAsActive(derivedKeypair);
          await sessionSigner.associateWithSession(derivedKeypair, sessionPda.toBase58());
          return derivedKeypair;
        }
      } catch (error) {
        console.warn('[SessionContext] Failed to recover deterministic session signer:', error);
      }

      return null;
    },
    [connection, sessionManager, sessionSigner, signMessage, wallet.publicKey]
  );

  const startGame = useCallback(
    async (campaignLevel: number, onCommitted?: () => void): Promise<TransactionResult> => {
      console.log('[SessionContext] startGame called', {
        campaignLevel,
        hasProfile: !!profile,
        availableRuns: profile?.availableRuns,
        currentLevel: profile?.currentLevel,
      });

      // Wait for any in-flight teardown from a previous session before creating a new one.
      if (pendingTeardownRef.current) {
        console.log('[SessionContext] Waiting for previous session teardown to complete...');
        await pendingTeardownRef.current.catch(() => {});
        pendingTeardownRef.current = null;
      }

      // Validate player has available runs
      if (profile && profile.availableRuns <= 0) {
        console.log('[SessionContext] No available runs');
        return { success: false, error: 'No available sessions remaining' };
      }

      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      // Resolve using current nonce namespace + on-chain existence.
      // Cached session state can be stale right after override (X).
      const onChainLevel = campaignLevel + 1;
      const currentNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
      const [currentNonceSessionPda] = deriveSessionPda(
        wallet.publicKey,
        onChainLevel,
        currentNonces.campaign
      );
      const currentSessionInfo = await connection.getAccountInfo(currentNonceSessionPda, 'processed');

      // Check if session already exists on-chain before trying to create a new one.
      if (currentSessionInfo) {
        console.log('[SessionContext] Session already exists, signaling resume...');
        setMapSeed(null);
        const resumedSessionPda = currentNonceSessionPda;
        sessionManager.setActiveOnChainLevel(onChainLevel);
        sessionManager.setActiveSessionPda(resumedSessionPda);

        // Load the correct session signer keypair for this session.
        // If it isn't stored locally, attempt deterministic recovery from signMessage.
        let resolvedSessionSigner =
          (walletId
            ? await loadSessionSignerForSession(walletId, resumedSessionPda.toBase58())
            : null) ?? sessionSigner.keypair;
        if (!resolvedSessionSigner) {
          const recovered = await sessionSigner.checkPendingSession();
          resolvedSessionSigner = recovered ? sessionSigner.keypair : null;
        }
        if (!resolvedSessionSigner) {
          resolvedSessionSigner = await recoverDeterministicSessionSigner(resumedSessionPda);
        } else {
          await sessionSigner.associateWithSession(
            resolvedSessionSigner,
            resumedSessionPda.toBase58()
          );
        }
        if (!resolvedSessionSigner) {
          return {
            success: false,
            error: 'Session credentials lost. Please reset or abandon run.',
          };
        }

        // Set up GameState PDA for the gameplay state hook
        if (resumedSessionPda) {
          const [gameStatePda] = getGameStatePda(resumedSessionPda);
          gameplayState.setGameStatePda(gameStatePda);
          console.log(
            '[SessionContext] Restored GameState PDA for existing session:',
            gameStatePda.toBase58()
          );
        }

        const delegateResult = await ensureDelegatedToRollup({
          sessionPda: resumedSessionPda,
          onChainLevel,
          sessionSignerKeypair: resolvedSessionSigner,
        });
        if (!delegateResult.success) {
          return {
            success: false,
            error: delegateResult.error ?? 'Failed to delegate session to rollup',
          };
        }

        // Signal resumption — caller will do full on-chain restore
        return {
          success: true,
          isResumed: true,
          mapSeed: null,
          sessionPda: resumedSessionPda.toBase58(),
        };
      }

      // Validate campaign level is unlocked
      if (profile && campaignLevel > profile.currentLevel) {
        console.log('[SessionContext] Level not unlocked');
        return { success: false, error: 'Campaign level not unlocked yet' };
      }

      // Step 0: Check for orphaned child accounts that would block start_session (init).
      // This can happen when force_close_session freed the session PDA but some children
      // were still delegated. After ER restart + undelegation, they sit at the same PDAs.
      {
        const onChainLevel = campaignLevel + 1;
        const startNonces = await sessionManager.fetchSessionNonces(wallet.publicKey!);
        const [targetSessionPda] = deriveSessionPda(
          wallet.publicKey!,
          onChainLevel,
          startNonces.campaign
        );
        const [gameStatePda] = deriveGameStatePda(targetSessionPda);
        const [mapPoisPda] = deriveMapPoisPda(targetSessionPda);
        const [inventoryPda] = deriveInventoryPda(targetSessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(targetSessionPda);
        console.log('[SessionContext] Step 0: orphan check', {
          campaignLevel,
          onChainLevel,
          wallet: wallet.publicKey!.toBase58(),
          sessionPda: targetSessionPda.toBase58(),
          gameStatePda: gameStatePda.toBase58(),
          mapPoisPda: mapPoisPda.toBase58(),
          inventoryPda: inventoryPda.toBase58(),
          generatedMapPda: generatedMapPda.toBase58(),
          rpcEndpoint: connection.rpcEndpoint,
        });
        const [sessionInfo, gsInfo, mpInfo, invInfo, gmInfo] = await Promise.all([
          connection.getAccountInfo(targetSessionPda, 'processed'),
          connection.getAccountInfo(gameStatePda, 'processed'),
          connection.getAccountInfo(mapPoisPda, 'processed'),
          connection.getAccountInfo(inventoryPda, 'processed'),
          connection.getAccountInfo(generatedMapPda, 'processed'),
        ]);
        console.log('[SessionContext] Step 0: account info results', {
          session: sessionInfo
            ? `exists owner=${sessionInfo.owner.toBase58()} size=${sessionInfo.data.length}`
            : 'null',
          gameState: gsInfo
            ? `exists owner=${gsInfo.owner.toBase58()} size=${gsInfo.data.length}`
            : 'null',
          mapPois: mpInfo
            ? `exists owner=${mpInfo.owner.toBase58()} size=${mpInfo.data.length}`
            : 'null',
          inventory: invInfo
            ? `exists owner=${invInfo.owner.toBase58()} size=${invInfo.data.length}`
            : 'null',
          generatedMap: gmInfo
            ? `exists owner=${gmInfo.owner.toBase58()} size=${gmInfo.data.length}`
            : 'null',
        });
        const sessionExists = !!sessionInfo;
        const orphanedChildren = !sessionExists && (!!gsInfo || !!mpInfo || !!invInfo || !!gmInfo);
        if (orphanedChildren) {
          console.log('[SessionContext] Detected orphaned child accounts at session slot', {
            sessionPda: targetSessionPda.toBase58(),
            gameState: !!gsInfo,
            mapPois: !!mpInfo,
          });
          // Need a session signer that matches game_state.session_signer to close them.
          // Read directly from storage (not via React state hook) so we get the keypair immediately.
          const walletId = wallet.publicKey!.toBase58();
          let orphanKp =
            (await loadSessionSignerForSession(walletId, targetSessionPda.toBase58())) ??
            (await loadSessionSignerWallet(walletId));
          if (!orphanKp) {
            console.warn(
              '[SessionContext] Orphaned child accounts found but no session signer available to close them'
            );
            return {
              success: false,
              error:
                'Orphaned accounts from a previous session are blocking. Session credentials not found.',
            };
          }
          console.log(
            '[SessionContext] Found session signer for orphan cleanup:',
            orphanKp.publicKey.toBase58()
          );

          const delegatedAccounts = [
            { info: gsInfo, pda: gameStatePda, label: 'game_state' },
            { info: mpInfo, pda: mapPoisPda, label: 'map_pois' },
          ].filter((a) => a.info && a.info.owner.equals(DELEGATION_PROGRAM_ID));

          if (delegatedAccounts.length > 0) {
            const delegatedPdas = delegatedAccounts.map((a) => a.pda);

            // LOCAL-ONLY: call Delegation Program directly on base layer.
            // On devnet the ER handles undelegation natively via Magic Program.
            if (isForceUndelegateAvailable()) {
              console.log(
                '[SessionContext] Using local force-undelegate for orphaned accounts:',
                delegatedAccounts.map((a) => a.label)
              );
              const count = await forceUndelegateAccounts(connection, delegatedPdas);
              console.log(
                `[SessionContext] Force-undelegated ${count}/${delegatedPdas.length} accounts`
              );
              if (count < delegatedPdas.length) {
                // Check what's still delegated
                const rechecks = await Promise.all(
                  delegatedPdas.map((pda) => connection.getAccountInfo(pda, 'processed'))
                );
                const stillDelegated = rechecks.filter(
                  (info) => info && info.owner.equals(DELEGATION_PROGRAM_ID)
                );
                if (stillDelegated.length > 0) {
                  return {
                    success: false,
                    error: `Force-undelegate failed for ${stillDelegated.length} account(s). Try restarting the ER.`,
                  };
                }
              }
            } else {
              // DEVNET/MAINNET: undelegate via ER using Magic Program's ScheduleCommitAndUndelegate.
              console.log(
                '[SessionContext] Attempting ER-level undelegation for orphaned accounts:',
                delegatedAccounts.map((a) => a.label)
              );
              const undelegateData = Buffer.alloc(4);
              undelegateData.writeUInt32LE(2, 0);
              const undelegateIx = new TransactionInstruction({
                programId: SOLANA_CONFIG.magic.programId,
                keys: [
                  { pubkey: orphanKp.publicKey, isSigner: true, isWritable: true },
                  { pubkey: SOLANA_CONFIG.magic.contextId, isSigner: false, isWritable: true },
                  ...delegatedPdas.map((pda) => ({
                    pubkey: pda,
                    isSigner: false,
                    isWritable: false,
                  })),
                ],
                data: undelegateData,
              });

              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  const tx = new Transaction().add(undelegateIx);
                  const { blockhash } = await erConnection.getLatestBlockhash('confirmed');
                  tx.recentBlockhash = blockhash;
                  tx.feePayer = orphanKp.publicKey;
                  tx.sign(orphanKp);
                  const sig = await erConnection.sendRawTransaction(tx.serialize(), {
                    skipPreflight: true,
                  });
                  console.log(`[SessionContext] ER undelegate sent (attempt ${attempt}/3):`, sig);
                } catch (erErr: unknown) {
                  const errDetail = erErr instanceof Error ? erErr.message : String(erErr);
                  console.warn(
                    `[SessionContext] ER undelegate failed (attempt ${attempt}/3):`,
                    errDetail
                  );
                }

                await new Promise((r) => setTimeout(r, 2000 * attempt));

                const [gsCheck, mpCheck] = await Promise.all([
                  connection.getAccountInfo(gameStatePda, 'processed'),
                  connection.getAccountInfo(mapPoisPda, 'processed'),
                ]);
                const remaining = [gsCheck, mpCheck].filter(
                  (info) => info && info.owner.equals(DELEGATION_PROGRAM_ID)
                );
                if (remaining.length === 0) {
                  console.log('[SessionContext] All orphaned accounts undelegated on base layer');
                  break;
                }
                console.log(
                  `[SessionContext] ${remaining.length} account(s) still delegated after attempt ${attempt}/3`
                );
                if (attempt === 3) {
                  console.warn(
                    '[SessionContext] Orphaned accounts still delegated after all attempts'
                  );
                  return {
                    success: false,
                    error:
                      'Orphaned accounts from a previous session are still delegated. Please try stopping the ER, deleting its storage directory, and restarting it.',
                  };
                }
              }
            }
          }

          // All orphaned accounts are on base layer — close them
          const anyRemaining = await Promise.all([
            connection.getAccountInfo(gameStatePda, 'processed'),
            connection.getAccountInfo(mapPoisPda, 'processed'),
          ]).then((infos) => infos.some((i) => !!i));

          if (anyRemaining) {
            console.log('[SessionContext] Closing orphaned child accounts...');
            const closeResult = await sessionManager.closeOrphanedAccounts(
              targetSessionPda,
              orphanKp
            );
            if (!closeResult.success) {
              console.warn(
                '[SessionContext] closeOrphanedAccounts failed, trying closeEmptyOrphanedAccounts:',
                closeResult.error
              );
              // Fallback: accounts may have 0-byte data (corrupted by ER reset + force-undelegate)
              const emptyCloseResult = await sessionManager.closeEmptyOrphanedAccounts(
                targetSessionPda,
                orphanKp
              );
              if (!emptyCloseResult.success) {
                console.error(
                  '[SessionContext] Failed to close empty orphaned accounts:',
                  emptyCloseResult.error
                );
                return {
                  success: false,
                  error: `Failed to close orphaned accounts: ${emptyCloseResult.error}`,
                };
              }
            }
            console.log('[SessionContext] Orphaned accounts cleaned up successfully');
          }
        }
      }

      // Step 1: Reuse existing sessionSigner or derive a new one.
      // With fixed derivation message, the same wallet always produces the same keypair.
      // Skip the signMessage popup if we already have a stored signer.
      console.log(
        '[SessionContext] Step 1: Getting sessionSigner wallet... (current keypair:',
        sessionSigner.keypair?.publicKey.toBase58() ?? 'null',
        ')'
      );
      let derivedSessionSigner: Keypair;
      if (sessionSigner.keypair) {
        derivedSessionSigner = sessionSigner.keypair;
        console.log('[SessionContext] Reusing existing sessionSigner:', derivedSessionSigner.publicKey.toBase58());
      } else {
        const derivationSignature = await signMessage(
          buildGameWalletDerivationMessage()
        );
        derivedSessionSigner = deriveSessionSignerFromSignature(derivationSignature);
      }
      const signerBalance = await connection.getBalance(derivedSessionSigner.publicKey);
      const fundingNeeded = calculateRequiredFunding(signerBalance, SESSION_COST_CAMPAIGN);
      const sessionSignerResult = await sessionSigner.createWithoutFundingFromKeypair(
        derivedSessionSigner,
        fundingNeeded
      );
      if (!sessionSignerResult) {
        return { success: false, error: 'Failed to create sessionSigner wallet' };
      }
      const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;
      console.log(
        '[SessionContext] SessionSigner keypair created:',
        newSessionSignerKeypair.publicKey.toBase58()
      );

      // Step 2: Build start session transaction with the new sessionSigner's public key
      console.log('[SessionContext] Step 2: Building start session transaction...');
      const sessionResult = await sessionManager.buildStartSessionTransaction(
        campaignLevel,
        newSessionSignerKeypair.publicKey
      );
      if (!sessionResult) {
        sessionSigner.resetState();
        return { success: false, error: 'Failed to build session transaction' };
      }
      const { transaction: sessionTransaction, sessionPda } = sessionResult;

      // Clear stale fog/walls from a previous session on the same deterministic PDA
      await clearFogState(sessionPda.toBase58()).catch(() => {});
      await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});

      // Step 3: Build/start transaction only (fund + start), then delegate in a second tx.
      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      const startTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
      );
      startTx.add(...fundTransaction.instructions);
      startTx.add(...sessionInstructions);
      const startBh = await connection.getLatestBlockhash('confirmed');
      startTx.recentBlockhash = startBh.blockhash;
      startTx.feePayer = wallet.publicKey ?? undefined;

      // Step 4: SessionSigner wallet partially signs start transaction.
      console.log('[SessionContext] Step 4: SessionSigner wallet partially signing start tx...');
      startTx.partialSign(newSessionSignerKeypair);

      // Step 5: Wallet signs/sends start transaction.
      console.log('[SessionContext] Step 5: Requesting main wallet signature for start tx...');
      await debugSimulateTransaction('startGame:start_tx', startTx);
      try {
        const [startSignature] = await signAndSendTransactions([startTx], {
          connection,
          skipPreflight: true,
        });
        console.log('[SessionContext] startGame:start_tx_sent', { signature: startSignature });
        await confirmSignatureWithTimeout(startSignature);
        console.log('[SessionContext] startGame:start_tx_confirmed', {
          signature: startSignature,
        });
        onCommitted?.();

        // Mark sessionSigner as active now that funding is confirmed
        console.log(
          '[SessionContext] Marking sessionSigner as active:',
          newSessionSignerKeypair.publicKey.toBase58()
        );
        await sessionSigner.markAsActive(newSessionSignerKeypair);
        await sessionSigner.associateWithSession(newSessionSignerKeypair, sessionPda.toBase58());
        console.log(
          '[SessionContext] SessionSigner after markAsActive:',
          sessionSigner.keypair?.publicKey.toBase58() ?? 'null (state may not have updated yet)'
        );

        // Fetch the created session
        await sessionManager.fetchSession();
      } catch (txError: unknown) {
        // Check for session_counter not initialized error (Code 3012)
        // This is common on devnet/testnet if the program hasn't been initialized by an admin
        const error = txError as { message?: string; logs?: string[] };
        const isCounterUninitialized =
          isAccountNotInitializedError(txError) ||
          (Array.isArray(error?.logs) &&
            error.logs.some(
              (log: string) =>
                log.includes('Error Code: AccountNotInitialized') && log.includes('session_counter')
            ));

        if (isCounterUninitialized) {
          console.warn(
            '[SessionContext] Session counter not initialized on-chain. Cannot start session.'
          );
        } else {
          logTxDebugError('startGame:start_tx', txError);
        }

        sessionSigner.resetState();
        return {
          success: false,
          error:
            txError instanceof Error
              ? txError.message
              : isCounterUninitialized
                ? 'Session counter not initialized'
                : 'Transaction failed',
        };
      }

      // Step 6b: Pre-init POI VRF state on base chain so it can be delegated.
      // Check ownership first: skip init if already exists, skip delegation if already delegated.
      let campaignVrfToDelegate: ('poi')[] | undefined = ['poi'];
      console.log('[SessionContext] Step 6b: Pre-init POI VRF state on base chain...');
      {
        const [poiVrfPda] = derivePoiVrfStatePda(sessionPda);
        const poiVrfInfo = await connection.getAccountInfo(poiVrfPda).catch(() => null);
        if (poiVrfInfo && poiVrfInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
          console.log('[SessionContext] Step 6b: POI VRF already delegated, skipping init+delegation');
          campaignVrfToDelegate = undefined;
        } else if (poiVrfInfo) {
          console.log('[SessionContext] Step 6b: POI VRF already exists, skipping init');
          // Check if VRF is already fulfilled (leftover from a previous session at the same PDA).
          // If so, skip the request entirely — the fulfilled data is still valid.
          const vrfStatus = poiVrfInfo.data.length > VRF_STATUS_OFFSET
            ? poiVrfInfo.data[VRF_STATUS_OFFSET]
            : null;
          if (vrfStatus === 2) { // 2 = Fulfilled
            console.log('[SessionContext] Step 6b: POI VRF already fulfilled, skipping request');
            vrfReadySessionsRef.current.add(sessionPda.toBase58());
            campaignVrfToDelegate = undefined;
          }
        } else {
          try {
            const basePoiSysProg = createPoiSystemProgram(connection);
            const initPoiVrfTx = await buildInitPoiVrfStateTransaction(
              basePoiSysProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            await sendSessionSignerTransaction(connection, initPoiVrfTx, newSessionSignerKeypair);
            console.log('[SessionContext] Step 6b: POI VRF state pre-initialized on base');
          } catch (initErr) {
            logTxDebugError('startGame:init_poi_vrf', initErr);
            console.warn(
              '[SessionContext] Step 6b: init_poi_vrf failed (may already exist):',
              initErr instanceof Error ? initErr.message : initErr
            );
          }
        }
      }

      // On localnet, request+fulfill VRF on base layer. The VRF state is NOT delegated —
      // the ER clones it from base in replica mode, avoiding VRF CPI on ER.
      if (campaignVrfToDelegate) {
        const baseVrfResult = await requestBaseLayerVrf(
          sessionPda,
          newSessionSignerKeypair,
          campaignVrfToDelegate
        );
        if (!baseVrfResult.success) {
          return { success: false, error: baseVrfResult.error! };
        }
      }

      // Step 7: Delegate all runtime accounts + VRF states after session creation.
      const delegateResult = await sessionManager.delegateSession(newSessionSignerKeypair, {
        sessionPda,
        onChainLevel: campaignLevel + 1,
        delegateVrf: SOLANA_CONFIG.isLocalValidator ? undefined : campaignVrfToDelegate,
      });
      if (!delegateResult.success) {
        logTxDebugError('startGame:delegate_tx', delegateResult.error);
        sessionSigner.resetState();
        return {
          success: false,
          error: delegateResult.error ?? 'Delegation transaction failed after session creation',
        };
      }

      // Delegation succeeded — wait for ER to replicate delegated accounts before
      // switching to ER for gameplay. MagicBlock's devnet ER needs a few seconds to
      // detect and pick up newly delegated accounts from the base layer.
      console.log('[SessionContext] Step 7b: Waiting for ER to pick up delegated accounts...', {
        erEndpoint: directErConnection.rpcEndpoint,
        sessionPda: sessionPda.toBase58(),
      });
      const erReady = await waitForErSessionAccounts(sessionPda, { includeVrf: !SOLANA_CONFIG.isLocalValidator });
      if (!erReady) {
        console.warn(
          '[SessionContext] ER did not pick up all delegated session accounts within timeout'
        );
        // Log what the ER returns to help diagnose
        try {
          const targets = getSessionDelegationTargets(sessionPda, { includeVrf: true });
          const erInfos = await Promise.all(
            targets.map(({ pda }) => directErConnection.getAccountInfo(pda, 'processed'))
          );
          const diag = targets.map((target, idx) => ({
            account: target.label,
            pda: target.pda.toBase58(),
            presentOnEr: !!erInfos[idx],
          }));
          console.warn('[SessionContext] ER delegation diagnostics:', diag);
        } catch (diagErr) {
          console.warn(
            '[SessionContext] ER diag fetch failed:',
            diagErr instanceof Error ? diagErr.message : diagErr
          );
        }
      } else {
        console.log(
          '[SessionContext] ER has all delegated gameplay accounts — delegation propagated'
        );
      }

      setUseErForGameplay(erReady);
      if (!erReady) {
        return {
          success: false,
          error: 'Delegation not fully propagated to ER yet. Please retry starting the session.',
        };
      }

      // Resolve the specific ER validator endpoint for reads.
      // The generic endpoint (devnet.magicblock.app) returns stale/zeroed data for
      // delegated accounts; the actual state lives on the assigned validator node.
      let resolvedConn = await resolveAndSetErEndpoint(sessionPda);

      // Step 7c: Wait for session signer to be visible on ER before sending VRF.
      // The session signer was funded on the base chain; ER needs to sync passthrough account.
      console.log('[SessionContext] startGame:wait_signer_on_er');
      const signerResult = await waitForSessionSignerOnEr(
        newSessionSignerKeypair.publicKey,
        sessionPda
      );
      if (!signerResult.ready) {
        console.warn('[SessionContext] startGame:signer_not_on_er — proceeding anyway (may retry)');
      }
      // Retry endpoint resolution if it failed earlier — the router's delegation
      // index may lag behind account propagation to ER.
      if (!resolvedConn) {
        resolvedConn = await resolveAndSetErEndpoint(sessionPda);
      }
      // Last resort: use the endpoint discovered by the signer wait (which
      // polls getRoutedErConnectionForAccount internally).
      if (!resolvedConn && signerResult.endpoint) {
        console.log('[SessionContext] Using signer-wait endpoint as fallback:', signerResult.endpoint);
        setResolvedErEndpoint(signerResult.endpoint);
        resolvedConn = new Connection(signerResult.endpoint, {
          commitment: SOLANA_CONFIG.erCommitment,
          wsEndpoint: deriveErWsEndpoint(signerResult.endpoint),
        });
      }

      // Step 7d: Request POI VRF on the Ephemeral Rollup via CPI.
      if (vrfReadySessionsRef.current.has(sessionPda.toBase58())) {
        console.log('[SessionContext] startGame:poi_vrf:already_fulfilled_on_base, skipping ER request');
      } else {
        console.log('[SessionContext] startGame:poi_vrf (ER)');
        try {
          const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
          const erPoiSysProg = createPoiSystemProgram(directErConnection);
          const poiVrfTx = await buildRequestAndFulfillPoiVrfTransaction(
            erPoiSysProg,
            sessionPda,
            newSessionSignerKeypair.publicKey,
            newSessionSignerKeypair.publicKey
          );

          const VRF_MAX_RETRIES = 3;
          for (let vrfAttempt = 1; vrfAttempt <= VRF_MAX_RETRIES; vrfAttempt++) {
            try {
              const vrfSig = await sendRoutedErTransaction(
                poiVrfTx,
                newSessionSignerKeypair,
                [sessionPda, poiVrfStatePda]
              );
              console.log('[SessionContext] startGame:poi_vrf:sent', { signature: vrfSig, attempt: vrfAttempt });
              break;
            } catch (vrfSendErr) {
              const msg = vrfSendErr instanceof Error ? vrfSendErr.message : String(vrfSendErr);
              if (msg.includes('InvalidAccountForFee') && vrfAttempt < VRF_MAX_RETRIES) {
                console.warn('[SessionContext] startGame:poi_vrf:retry_after_fee_error', { attempt: vrfAttempt });
                await new Promise((resolve) => setTimeout(resolve, 2_000));
                continue;
              }
              throw vrfSendErr;
            }
          }

          const routedVrfConnection =
            (await getRoutedErConnectionForAccount(sessionPda)) ?? directErConnection;
          const fulfilled = await waitForVrfFulfillment(
            routedVrfConnection,
            poiVrfStatePda,
            30_000
          );
          if (fulfilled) {
            console.log('[SessionContext] startGame:poi_vrf:fulfilled (ER)');
            vrfReadySessionsRef.current.add(sessionPda.toBase58());
          } else {
            console.warn('[SessionContext] startGame:poi_vrf:fulfillment_timeout (ER)');
            return {
              success: false,
              error:
                'POI VRF was not fulfilled in time. Session was created, but gameplay remains blocked until the oracle fulfills the request. Return and retry or resume once VRF is ready.',
            };
          }
        } catch (poiVrfErr) {
          logTxDebugError('startGame:poi_vrf_er', poiVrfErr);
          return {
            success: false,
            error:
              poiVrfErr instanceof Error
                ? poiVrfErr.message
                : 'Failed to request POI VRF on ER',
          };
        }
      }

      await ensureSessionDiscoveryInitialized(
        sessionPda,
        newSessionSignerKeypair,
        'startGame'
      );

      // Step 7d: Generate map on ER with deterministic seed and sync enemies to MapEnemies.
      // Campaign seeds are public/deterministic, but the frontend does not build the map.
      // It only passes the seed through so ER programs remain the source of truth.
      console.log('[SessionContext] startGame:map_and_sync (ER)');
      try {
        const levelSeed = (await mapGenerator.getMapSeed(campaignLevel)) ?? BigInt(onChainLevel);
        const erMapGenProgram = createMapGeneratorProgram(directErConnection);
        const erGameplayProgram = createGameplayStateProgram(directErConnection);
        const erPoiSystemProgram = createPoiSystemProgram(directErConnection);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const campaignAct = Math.max(1, Math.min(4, Math.floor((onChainLevel - 1) / 10) + 1));
        const campaignWeek = 1;
        const { mapTx, syncTx } = await buildMapAndSyncTransaction(
          'seed',
          erMapGenProgram,
          erGameplayProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          { campaignLevel: onChainLevel, seed: levelSeed }
        );
        const mapWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
          ...mapTx.instructions
        );
        await sendErInitTransactionWithRetry(
          'startGame:fill_map',
          mapWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );
        // Refresh MapPois BEFORE sync_map_enemies so that sync_map_enemies can
        // read the mole-den from MapPois and record it in SessionDiscovery.
        const refreshMapPoisIx = await erPoiSystemProgram.methods
          .refreshMapPois(campaignAct, campaignWeek, new BN(levelSeed.toString()))
          .accounts({
            mapPois: mapPoisPda,
            session: sessionPda,
            generatedMap: generatedMapPda,
            gameState: gameStatePda,
            sessionSigner: newSessionSignerKeypair.publicKey,
          })
          .instruction();
        const rebuildMapPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          refreshMapPoisIx
        );
        await sendErInitTransactionWithRetry(
          'startGame:refresh_map_pois',
          rebuildMapPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );

        const syncWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          ...syncTx.instructions
        );

        // Discover POIs near spawn so they appear immediately
        const discoverPoisIx = await buildDiscoverSpawnPoisInstruction(
          erPoiSystemProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          6 // SPAWN_VISION_RADIUS
        );
        const discoverPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          discoverPoisIx
        );

        await sendErInitTransactionWithRetry(
          'startGame:sync_map_enemies',
          syncWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );
        await sendErInitTransactionWithRetry(
          'startGame:discover_spawn_pois',
          discoverPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );
        console.log('[SessionContext] startGame:map_and_sync_complete (ER)');
      } catch (mapErr) {
        logTxDebugError('startGame:map_and_sync', mapErr);
        return {
          success: false,
          error: formatUnknownErrorMessage(mapErr) || 'Failed to generate map on ER',
        };
      }

      // Step 8: Fetch the map seed for this level
      // Note: start_session now atomically creates GameState, MapEnemies,
      // PlayerInventory, MapPois, and GeneratedMap via CPI, so no separate
      // initialization step is needed.
      console.log('[SessionContext] Step 8: Privacy-safe session bootstrap');
      setMapSeed(null);

      // Step 9: Set GameState PDA so the gameplay hook can start working
      console.log('[SessionContext] Step 9: Setting GameState PDA...');
      if (wallet.publicKey) {
        const [gameStatePda] = getGameStatePda(sessionPda);
        gameplayState.setGameStatePda(gameStatePda);
        console.log('[SessionContext] GameState PDA set:', gameStatePda.toBase58());
      }

      console.log('[SessionContext] startGame complete');
      // Pre-warm move caches so the first move doesn't pay 3 RPC round trips
      if (resolvedConn) {
        warmMovePlayerCaches(resolvedConn, createGameplayStateProgram(resolvedConn), sessionPda);
      }
      return { success: true, mapSeed: null, sessionPda: sessionPda.toBase58(), resolvedErConnection: resolvedConn ?? undefined };
    },
    [
      sessionSigner,
      connection,
      erConnection,
      directErConnection,
      gameplayState,
      mapGenerator,
      profile,
      sessionManager,
      signAndSendTransaction,
      signAndSendTransactions,
      confirmSignatureWithTimeout,
      debugSimulateTransaction,
      ensureSessionDiscoveryInitialized,
      ensureDelegatedToRollup,
      formatUnknownErrorMessage,
      getRoutedErConnectionForAccount,
      getSessionDelegationTargets,
      isAccountNotInitializedError,
      logErSignatureDiagnostics,
      logTxDebugError,
      readPoiVrfStatus,
      resolveAndSetErEndpoint,
      sendRoutedErTransaction,
      sendErInitTransactionWithRetry,
      waitForSessionSignerOnEr,
      wallet.publicKey,
    ]
  );

  const startDuelGame = useCallback(async (onCommitted?: () => void): Promise<TransactionResult> => {
    console.log('[SessionContext] startDuelGame called');

    if (pendingTeardownRef.current) {
      console.log('[SessionContext] Waiting for previous session teardown to complete...');
      await pendingTeardownRef.current.catch(() => {});
      pendingTeardownRef.current = null;
    }

    if (!wallet.publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    const duelNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
    let duelSessionSigner: Keypair;
    if (sessionSigner.keypair) {
      duelSessionSigner = sessionSigner.keypair;
    } else {
      const duelSignature = await signMessage(
        buildGameWalletDerivationMessage()
      );
      duelSessionSigner = deriveSessionSignerFromSignature(duelSignature);
    }
    const duelSignerBalance = await connection.getBalance(duelSessionSigner.publicKey);
    const duelFundingNeeded = calculateRequiredFunding(duelSignerBalance, SESSION_COST_DUEL);
    const sessionSignerResult = await sessionSigner.createWithoutFundingFromKeypair(
      duelSessionSigner,
      duelFundingNeeded
    );
    if (!sessionSignerResult) {
      return { success: false, error: 'Failed to create sessionSigner wallet' };
    }

    const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;

    // start_duel_session no longer requires pre-fulfilled map VRF.
    // Map VRF is requested via session signer on ER after delegation (regenerate_map).
    // This eliminates the pre-VRF wallet TX, achieving Rule 1 (single wallet signature).
    const sessionResult = await sessionManager.buildStartDuelSessionTransaction(
      newSessionSignerKeypair.publicKey,
      null
    );

    if (!sessionResult) {
      return { success: false, error: 'Failed to build duel session transaction' };
    }

    const { transaction: sessionTransaction, sessionPda } = sessionResult;

    // Clear stale fog/walls from a previous session on the same deterministic PDA
    await clearFogState(sessionPda.toBase58()).catch(() => {});
    await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});

    // Build enter_duel instruction (no seed arg needed — reads from generated_map account)
    const [gameStatePda] = getGameStatePda(sessionPda);
    const gameplayProgram = createGameplayStateProgram(connection);
    const enterDuelIx = await buildEnterDuelInstruction(
      gameplayProgram,
      wallet.publicKey,
      gameStatePda,
      sessionPda
    );
    // Combine: fund_session_signer + start_duel_session + enter_duel in a single TX.
    // Map/POI/gameplay VRF are requested on ER after delegation for every cluster.
    const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
    const sessionInstructions = sessionTransaction.instructions.filter(
      (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
    );

    const combinedTransaction = new Transaction();
    combinedTransaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    combinedTransaction.add(...fundTransaction.instructions);
    combinedTransaction.add(...sessionInstructions);
    combinedTransaction.add(enterDuelIx);
    const { blockhash: duelBh } = await connection.getLatestBlockhash('confirmed');
    combinedTransaction.recentBlockhash = duelBh;
    combinedTransaction.feePayer = wallet.publicKey ?? undefined;
    combinedTransaction.partialSign(newSessionSignerKeypair);

    let signature: string;
    await debugSimulateTransaction('startDuelGame:combined_tx', combinedTransaction);
    try {
      signature = await signAndSendTransaction(combinedTransaction);
      console.log('[SessionContext] startDuelGame:combined_tx_sent', { signature });
      await confirmSignatureWithTimeout(signature);
      console.log('[SessionContext] startDuelGame:combined_tx_confirmed', { signature });
      onCommitted?.();
      await sessionSigner.markAsActive(newSessionSignerKeypair);
      await sessionSigner.associateWithSession(newSessionSignerKeypair, sessionPda.toBase58());
      console.log('[SessionContext] startDuelGame:sessionSigner_marked_active');
      await sessionManager.fetchSession();
      console.log('[SessionContext] startDuelGame:session_fetched');
    } catch (txError: unknown) {
      logTxDebugError('startDuelGame:combined_tx', txError);
      if (isAccountNotInitializedError(txError)) {
        return {
          success: false,
          error:
            'Session manager is not initialized on this validator (AccountNotInitialized / 0xbc4). Run init first.',
        };
      }
      return {
        success: false,
        error: txError instanceof Error ? txError.message : 'Duel session transaction failed',
      };
    }

    // Parse DuelQueued event from the combined TX
    let duelQueued: { seed: bigint; slot: number } | undefined;
    const events = await parseDuelEvents(connection, gameplayProgram, signature);
    if (events.queued) {
      duelQueued = {
        seed: events.queued.seed,
        slot: events.queued.slot,
      };
    }

    // Init SessionDiscovery separately (skipped in combined TX to avoid insufficient lamports)
    await ensureSessionDiscoveryInitialized(
      sessionPda,
      newSessionSignerKeypair,
      'startDuelGame'
    );

    // Assign duel map seed on base layer BEFORE delegation.
    // Reads DuelOpenQueue (only accessible on base) and stores the creator's seed
    // in game_state.duel_map_seed so generate_duel_map on ER can use it.
    try {
      console.log('[SessionContext] startDuelGame:assign_duel_map_seed (base)');
      const baseGameplayProg = createGameplayStateProgram(connection);
      const assignSeedTx = await buildAssignDuelMapSeedTransaction(
        baseGameplayProg,
        sessionPda,
        newSessionSignerKeypair.publicKey
      );
      await sendSessionSignerTransaction(connection, assignSeedTx, newSessionSignerKeypair);
      console.log('[SessionContext] startDuelGame:assign_duel_map_seed done');
    } catch (assignErr) {
      console.warn('[SessionContext] startDuelGame:assign_duel_map_seed failed:', assignErr instanceof Error ? assignErr.message : assignErr);
      // Non-fatal: if this fails, generate_duel_map will use VRF (creator path)
    }

    // Pre-init VRF states on base chain so they can be delegated.
    // Check ownership first: skip init for existing accounts, skip delegation for already-delegated ones.
    let duelVrfTypesToDelegate: ('poi' | 'map' | 'gameplay')[] = ['poi', 'map', 'gameplay'];
    console.log('[SessionContext] startDuelGame:pre_init_vrf_states');
    const [poiVrfPda] = derivePoiVrfStatePda(sessionPda);
    const [mapVrfPda] = deriveMapVrfStatePda(sessionPda);
    const [gameplayVrfPda] = deriveGameplayVrfStatePda(sessionPda);
    const [poiVrfInfo, mapVrfInfo, gameplayVrfInfo] = await Promise.all([
      connection.getAccountInfo(poiVrfPda).catch(() => null),
      connection.getAccountInfo(mapVrfPda).catch(() => null),
      connection.getAccountInfo(gameplayVrfPda).catch(() => null),
    ]);

    const needsInit: { poi: boolean; map: boolean; gameplay: boolean } = {
      poi: !poiVrfInfo,
      map: !mapVrfInfo,
      gameplay: !gameplayVrfInfo,
    };
    duelVrfTypesToDelegate = (['poi', 'map', 'gameplay'] as const).filter((type) => {
      const info = type === 'poi' ? poiVrfInfo : type === 'map' ? mapVrfInfo : gameplayVrfInfo;
      return !info || !info.owner.equals(DELEGATION_PROGRAM_ID);
    });

    console.log('[SessionContext] startDuelGame:vrf_ownership_check', {
      needsInit,
      duelVrfTypesToDelegate,
    });

    if (needsInit.poi || needsInit.map || needsInit.gameplay) {
      try {
        const basePoiSysProg = createPoiSystemProgram(connection);
        const baseMapGenProg = createMapGeneratorProgram(connection);
        const baseGameplayProg = createGameplayStateProgram(connection);
        const initAllVrfTx = new Transaction();
        if (needsInit.poi) {
          const initPoiVrfTx = await buildInitPoiVrfStateTransaction(basePoiSysProg, sessionPda, newSessionSignerKeypair.publicKey);
          initAllVrfTx.add(...initPoiVrfTx.instructions);
        }
        if (needsInit.map) {
          const initMapVrfTx = await buildInitMapVrfStateTransaction(baseMapGenProg, sessionPda, newSessionSignerKeypair.publicKey);
          initAllVrfTx.add(...initMapVrfTx.instructions);
        }
        if (needsInit.gameplay) {
          const initGameplayVrfTx = await buildInitGameplayVrfStateTransaction(baseGameplayProg, sessionPda, newSessionSignerKeypair.publicKey);
          initAllVrfTx.add(...initGameplayVrfTx.instructions);
        }
        await sendSessionSignerTransaction(connection, initAllVrfTx, newSessionSignerKeypair);
        console.log('[SessionContext] startDuelGame:vrf_states_pre_initialized');
      } catch (initErr) {
        console.warn('[SessionContext] startDuelGame:init_vrf_failed (may already exist):', initErr instanceof Error ? initErr.message : initErr);
      }
    }

    // On localnet, request+fulfill VRF on base layer. The VRF state is NOT delegated —
    // the ER clones it from base in replica mode, avoiding VRF CPI on ER.
    if (duelVrfTypesToDelegate.length > 0) {
      const baseVrfResult = await requestBaseLayerVrf(
        sessionPda,
        newSessionSignerKeypair,
        duelVrfTypesToDelegate
      );
      if (!baseVrfResult.success) {
        return { success: false, error: baseVrfResult.error! };
      }
    }

    // Delegate to ER including VRF states and DuelEntry (only those not already delegated).
    const delegateResult = await ensureDelegatedToRollup({
      sessionPda,
      onChainLevel: 20,
      sessionSignerKeypair: newSessionSignerKeypair,
      delegateVrf: SOLANA_CONFIG.isLocalValidator ? undefined : (duelVrfTypesToDelegate.length > 0 ? duelVrfTypesToDelegate : undefined),
    });
    if (!delegateResult.success) {
      return {
        success: false,
        error: delegateResult.error ?? 'Failed to delegate duel session to rollup',
      };
    }

    // Wait for session signer to be visible on ER before sending VRF.
    console.log('[SessionContext] startDuelGame:wait_signer_on_er');
    const signerResult = await waitForSessionSignerOnEr(newSessionSignerKeypair.publicKey);
    if (!signerResult.ready) {
      console.warn('[SessionContext] startDuelGame:signer_not_on_er — proceeding anyway (may retry)');
    }

    if (vrfReadySessionsRef.current.has(sessionPda.toBase58())) {
      console.log('[SessionContext] startDuelGame:all_vrf:already_fulfilled_on_base, skipping ER request');
    } else {
    console.log('[SessionContext] startDuelGame:all_vrf_on_er');
    try {
      const erPoiSysProg = createPoiSystemProgram(directErConnection);
      const erMapGenProg = createMapGeneratorProgram(directErConnection);
      const erGameplayProg = createGameplayStateProgram(directErConnection);
      const poiGameplayVrfTx = await buildRequestAndFulfillPoiAndGameplayVrfTransaction(
        { poiSystem: erPoiSysProg, gameplayState: erGameplayProg },
        sessionPda,
        newSessionSignerKeypair.publicKey,
        newSessionSignerKeypair.publicKey
      );
      const mapVrfIxs = await buildRequestAndFulfillMapVrfInstructions(
        erMapGenProg, sessionPda,
        newSessionSignerKeypair.publicKey, newSessionSignerKeypair.publicKey
      );
      const allVrfTx = new Transaction();
      allVrfTx.add(...poiGameplayVrfTx.instructions);
      allVrfTx.add(...mapVrfIxs);

      const VRF_MAX_RETRIES = 3;
      for (let vrfAttempt = 1; vrfAttempt <= VRF_MAX_RETRIES; vrfAttempt++) {
        try {
          await sendRoutedErTransaction(allVrfTx, newSessionSignerKeypair, [sessionPda]);
          console.log('[SessionContext] startDuelGame:vrf_tx_sent', { attempt: vrfAttempt });
          break;
        } catch (vrfSendErr) {
          const msg = vrfSendErr instanceof Error ? vrfSendErr.message : String(vrfSendErr);
          if (msg.includes('InvalidAccountForFee') && vrfAttempt < VRF_MAX_RETRIES) {
            console.warn('[SessionContext] startDuelGame:vrf_fee_error, retrying...', { attempt: vrfAttempt });
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            continue;
          }
          throw vrfSendErr;
        }
      }

      const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
      const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
      const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
      const routedVrfConnection =
        (await getRoutedErConnectionForAccount(sessionPda)) ?? directErConnection;
      const [mapReady, poiReady, gameplayReady] = await Promise.all([
        waitForVrfFulfillment(routedVrfConnection, mapVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
        waitForVrfFulfillment(routedVrfConnection, poiVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
        waitForVrfFulfillment(routedVrfConnection, gameplayVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
      ]);
      if (!mapReady || !gameplayReady || !poiReady) {
        throw new Error('Randomness (VRF) not received from oracle — please try again');
      }
      vrfReadySessionsRef.current.add(sessionPda.toBase58());
    } catch (vrfError) {
      logTxDebugError('startDuelGame:er_vrf', vrfError);
      return {
        success: false,
        error:
          vrfError instanceof Error
            ? vrfError.message
            : 'Failed to initialize duel randomness on ER',
      };
    }
    } // end else (ER VRF)

    // Generate duel map via gameplay-state CPI (seed from DuelErQueue or VRF)
    try {
        // Debug: check DuelEntry status on ER before generate_duel_map
        const [debugDuelEntryPda] = deriveDuelEntryPda(sessionPda);
        const debugDuelEntryInfo = await directErConnection.getAccountInfo(debugDuelEntryPda, 'processed').catch(() => null);
        console.log('[SessionContext] startDuelGame:duel_entry_on_er', {
          exists: !!debugDuelEntryInfo,
          owner: debugDuelEntryInfo?.owner.toBase58() ?? 'N/A',
        });
        console.log('[SessionContext] startDuelGame:generate_duel_map (ER)');
        const erGameplayProgram = createGameplayStateProgram(directErConnection);
        const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
        const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
        const generateDuelMapTx = await buildGenerateDuelMapTransaction(
          erGameplayProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          {
            mapVrfStatePda,
            sessionDiscoveryPda,
          }
        );
        const mapWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
          ...generateDuelMapTx.instructions
        );
        await sendErInitTransactionWithRetry(
          'startDuelGame:generate_duel_map',
          mapWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );
        // Refresh MapPois BEFORE sync_map_enemies so that sync_map_enemies can
        // read the mole-den from MapPois and record it in SessionDiscovery.
        const erPoiSystemProgram = createPoiSystemProgram(directErConnection);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [duelGameStatePda] = deriveGameStatePda(sessionPda);
        const duelGeneratedSeed = (await fetchSessionGeneratedSeed(sessionPda)) ?? BigInt(20);
        const duelAct = 2;
        const duelWeek = 1;
        const refreshMapPoisIx = await erPoiSystemProgram.methods
          .refreshMapPois(duelAct, duelWeek, new BN(duelGeneratedSeed.toString()))
          .accounts({
            mapPois: mapPoisPda,
            session: sessionPda,
            generatedMap: generatedMapPda,
            gameState: duelGameStatePda,
            sessionSigner: newSessionSignerKeypair.publicKey,
          })
          .instruction();
        const rebuildMapPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          refreshMapPoisIx
        );
        await sendErInitTransactionWithRetry(
          'startDuelGame:refresh_map_pois',
          rebuildMapPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );

        const duelSyncIx = await buildSyncMapEnemiesInstruction(
          erGameplayProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          { gameplayVrfStatePda: deriveGameplayVrfStatePda(sessionPda)[0] }
        );
        const syncWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          duelSyncIx
        );

        // Discover POIs near spawn so they appear immediately
        const discoverPoisIx = await buildDiscoverSpawnPoisInstruction(
          erPoiSystemProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          6 // SPAWN_VISION_RADIUS
        );
        const discoverPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          discoverPoisIx
        );

        await sendErInitTransactionWithRetry(
          'startDuelGame:sync_map_enemies',
          syncWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );
        await sendErInitTransactionWithRetry(
          'startDuelGame:discover_spawn_pois',
          discoverPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );
        console.log('[SessionContext] startDuelGame:all_vrf_ready (ER)');
    } catch (vrfError) {
      logTxDebugError('startDuelGame:map_gen', vrfError);
      return {
        success: false,
        error:
          vrfError instanceof Error
            ? vrfError.message
            : 'Failed to generate duel map on ER',
      };
    }

    const generatedSeed = await fetchSessionGeneratedSeed(sessionPda);
    console.log('[SessionContext] startDuelGame:generated_seed', {
      generatedSeed: generatedSeed?.toString() ?? null,
    });
    setMapSeed(null);
    gameplayState.setGameStatePda(gameStatePda);
    warmMovePlayerCaches(directErConnection, createGameplayStateProgram(directErConnection), sessionPda);

    return { success: true, mapSeed: null, duelQueued };
  }, [
    sessionSigner,
    connection,
    erConnection,
    directErConnection,
    gameplayState,
    sessionManager,
    signAndSendTransaction,
    wallet.publicKey,
    fetchSessionGeneratedSeed,
    confirmSignatureWithTimeout,
    debugSimulateTransaction,
    ensureSessionDiscoveryInitialized,
    ensureDelegatedToRollup,
    isAccountNotInitializedError,
    logTxDebugError,
    getRoutedErConnectionForAccount,
    sendRoutedErTransaction,
    sendErInitTransactionWithRetry,
    waitForSessionSignerOnEr,
  ]);

  const startGauntletGame = useCallback(async (onCommitted?: () => void): Promise<TransactionResult> => {
    console.log('[SessionContext] startGauntletGame called');

    if (pendingTeardownRef.current) {
      console.log('[SessionContext] Waiting for previous session teardown to complete...');
      await pendingTeardownRef.current.catch(() => {});
      pendingTeardownRef.current = null;
    }

    if (!wallet.publicKey) {
      return { success: false, error: 'Wallet not connected' };
    }

    const gauntletNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
    let gauntletSessionSigner: Keypair;
    if (sessionSigner.keypair) {
      gauntletSessionSigner = sessionSigner.keypair;
    } else {
      const gauntletSignature = await signMessage(
        buildGameWalletDerivationMessage()
      );
      gauntletSessionSigner = deriveSessionSignerFromSignature(gauntletSignature);
    }
    const gauntletSignerBalance = await connection.getBalance(gauntletSessionSigner.publicKey);
    const gauntletFundingNeeded = calculateRequiredFunding(gauntletSignerBalance, SESSION_COST_GAUNTLET);
    const sessionSignerResult = await sessionSigner.createWithoutFundingFromKeypair(
      gauntletSessionSigner,
      gauntletFundingNeeded
    );
    if (!sessionSignerResult) {
      return { success: false, error: 'Failed to create sessionSigner wallet' };
    }

    const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;

    // start_gauntlet_session no longer requires pre-fulfilled map VRF.
    // Map VRF is requested via session signer on ER after delegation (regenerate_map).
    // fund_session_signer moves into the combined TX (no size issue without mapVrfState).
    // This eliminates the pre-VRF wallet TX, achieving Rule 1 (single wallet signature).
    const sessionResult = await sessionManager.buildStartGauntletSessionTransaction(
      newSessionSignerKeypair.publicKey,
      null
    );

    if (!sessionResult) {
      return { success: false, error: 'Failed to build gauntlet session transaction' };
    }

    const { transaction: sessionTransaction, sessionPda } = sessionResult;

    // Clear stale fog/walls from a previous session on the same deterministic PDA
    await clearFogState(sessionPda.toBase58()).catch(() => {});
    await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});

    // Build enter_gauntlet instruction to bundle into the same TX (Rule 1: single wallet signature)
    await ensureLocalFeeAccounts(connection);
    const [gameStatePda] = getGameStatePda(sessionPda);
    const gameplayProgram = createGameplayStateProgram(connection);

    const [gauntletConfigPda] = deriveGauntletConfigPda();
    const gauntletConfig = await (
      gameplayProgram.account as {
        gauntletConfig: {
          fetch: (address: PublicKey) => Promise<{ currentEpochId: bigint | number }>;
        };
      }
    ).gauntletConfig.fetch(gauntletConfigPda);

    const epochIdBigInt = BigInt(gauntletConfig.currentEpochId.toString());
    const epochIdBN = new BN(gauntletConfig.currentEpochId.toString());

    const enterGauntletIx = await buildEnterGauntletInstruction(
      gameplayProgram,
      wallet.publicKey,
      gameStatePda,
      sessionPda,
      epochIdBN,
      epochIdBigInt
    );
    // Combine: fund_session_signer + start_gauntlet_session + enter_gauntlet in a single TX.
    // Map/POI/gameplay VRF are requested on ER after delegation for every cluster.
    const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
    const sessionInstructions = sessionTransaction.instructions.filter(
      (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
    );

    // Combined TX: fund + start_gauntlet_session (without SessionDiscovery) + enter_gauntlet.
    // SessionDiscovery is skipped here to fit under the 1232-byte TX limit (single wallet signature).
    // It's initialized separately before delegation.
    const combinedTransaction = new Transaction();
    combinedTransaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
    combinedTransaction.add(...fundTransaction.instructions);
    combinedTransaction.add(...sessionInstructions);
    combinedTransaction.add(enterGauntletIx);
    const { blockhash: gauntletBh } = await connection.getLatestBlockhash('confirmed');
    combinedTransaction.recentBlockhash = gauntletBh;
    combinedTransaction.feePayer = wallet.publicKey ?? undefined;
    combinedTransaction.partialSign(newSessionSignerKeypair);

    await debugSimulateTransaction('startGauntletGame:combined_tx', combinedTransaction);
    try {
      const signature = await signAndSendTransaction(combinedTransaction);
      console.log('[SessionContext] startGauntletGame:combined_tx_sent', { signature });
      await confirmSignatureWithTimeout(signature);
      console.log('[SessionContext] startGauntletGame:combined_tx_confirmed', { signature });
      onCommitted?.();
      await sessionSigner.markAsActive(newSessionSignerKeypair);
      await sessionSigner.associateWithSession(newSessionSignerKeypair, sessionPda.toBase58());
      console.log('[SessionContext] startGauntletGame:sessionSigner_marked_active');
      await sessionManager.fetchSession();
      console.log('[SessionContext] startGauntletGame:session_fetched');
    } catch (txError: unknown) {
      logTxDebugError('startGauntletGame:combined_tx', txError);
      if (isAccountNotInitializedError(txError)) {
        return {
          success: false,
          error:
            'Session manager is not initialized on this validator (AccountNotInitialized / 0xbc4). Run init first.',
        };
      }
      return {
        success: false,
        error: txError instanceof Error ? txError.message : 'Gauntlet session transaction failed',
      };
    }

    // Init SessionDiscovery separately (skipped in combined TX to fit under size limit)
    await ensureSessionDiscoveryInitialized(
      sessionPda,
      newSessionSignerKeypair,
      'startGauntletGame'
    );

    // Pre-init VRF states on base chain so they can be delegated.
    // Check ownership first: skip init for existing accounts, skip delegation for already-delegated ones.
    let vrfTypesToDelegate: ('poi' | 'map' | 'gameplay')[] = ['poi', 'map', 'gameplay'];
    console.log('[SessionContext] startGauntletGame:pre_init_vrf_states');
    const [poiVrfPda] = derivePoiVrfStatePda(sessionPda);
    const [mapVrfPda] = deriveMapVrfStatePda(sessionPda);
    const [gameplayVrfPda] = deriveGameplayVrfStatePda(sessionPda);
    const [poiVrfInfo, mapVrfInfo, gameplayVrfInfo] = await Promise.all([
      connection.getAccountInfo(poiVrfPda).catch(() => null),
      connection.getAccountInfo(mapVrfPda).catch(() => null),
      connection.getAccountInfo(gameplayVrfPda).catch(() => null),
    ]);

    const needsInit: { poi: boolean; map: boolean; gameplay: boolean } = {
      poi: !poiVrfInfo,
      map: !mapVrfInfo,
      gameplay: !gameplayVrfInfo,
    };
    vrfTypesToDelegate = (['poi', 'map', 'gameplay'] as const).filter((type) => {
      const info = type === 'poi' ? poiVrfInfo : type === 'map' ? mapVrfInfo : gameplayVrfInfo;
      return !info || !info.owner.equals(DELEGATION_PROGRAM_ID);
    });

    console.log('[SessionContext] startGauntletGame:vrf_ownership_check', {
      needsInit,
      vrfTypesToDelegate,
    });

    if (needsInit.poi || needsInit.map || needsInit.gameplay) {
      try {
        const basePoiSysProg = createPoiSystemProgram(connection);
        const baseMapGenProg = createMapGeneratorProgram(connection);
        const baseGameplayProg = createGameplayStateProgram(connection);
        const initAllVrfTx = new Transaction();
        if (needsInit.poi) {
          const initPoiVrfTx = await buildInitPoiVrfStateTransaction(basePoiSysProg, sessionPda, newSessionSignerKeypair.publicKey);
          initAllVrfTx.add(...initPoiVrfTx.instructions);
        }
        if (needsInit.map) {
          const initMapVrfTx = await buildInitMapVrfStateTransaction(baseMapGenProg, sessionPda, newSessionSignerKeypair.publicKey);
          initAllVrfTx.add(...initMapVrfTx.instructions);
        }
        if (needsInit.gameplay) {
          const initGameplayVrfTx = await buildInitGameplayVrfStateTransaction(baseGameplayProg, sessionPda, newSessionSignerKeypair.publicKey);
          initAllVrfTx.add(...initGameplayVrfTx.instructions);
        }
        await sendSessionSignerTransaction(connection, initAllVrfTx, newSessionSignerKeypair);
        console.log('[SessionContext] startGauntletGame:vrf_states_pre_initialized');
      } catch (initErr) {
        console.warn('[SessionContext] startGauntletGame:init_vrf_failed (may already exist):', initErr instanceof Error ? initErr.message : initErr);
      }
    }

    // On localnet, request+fulfill VRF on base layer. The VRF state is NOT delegated —
    // the ER clones it from base in replica mode, avoiding VRF CPI on ER.
    if (vrfTypesToDelegate.length > 0) {
      const baseVrfResult = await requestBaseLayerVrf(
        sessionPda,
        newSessionSignerKeypair,
        vrfTypesToDelegate
      );
      if (!baseVrfResult.success) {
        return { success: false, error: baseVrfResult.error! };
      }
    }

    // Delegate to ER including VRF states (only those not already delegated).
    const delegateResult = await ensureDelegatedToRollup({
      sessionPda,
      onChainLevel: 20,
      sessionSignerKeypair: newSessionSignerKeypair,
      delegateVrf: SOLANA_CONFIG.isLocalValidator ? undefined : (vrfTypesToDelegate.length > 0 ? vrfTypesToDelegate : undefined),
    });
    if (!delegateResult.success) {
      return {
        success: false,
        error: delegateResult.error ?? 'Failed to delegate session to rollup',
      };
    }

    // Wait for session signer to be visible on ER before sending VRF.
    console.log('[SessionContext] startGauntletGame:wait_signer_on_er');
    const signerResult = await waitForSessionSignerOnEr(newSessionSignerKeypair.publicKey);
    if (!signerResult.ready) {
      console.warn('[SessionContext] startGauntletGame:signer_not_on_er — proceeding anyway (may retry)');
    }

    if (vrfReadySessionsRef.current.has(sessionPda.toBase58())) {
      console.log('[SessionContext] startGauntletGame:all_vrf:already_fulfilled_on_base, skipping ER request');
    } else {
    console.log('[SessionContext] startGauntletGame:all_vrf_on_er');
    try {
      const erPoiSysProg = createPoiSystemProgram(directErConnection);
      const erMapGenProg = createMapGeneratorProgram(directErConnection);
      const erGameplayProg = createGameplayStateProgram(directErConnection);
      const poiGameplayVrfTx = await buildRequestAndFulfillPoiAndGameplayVrfTransaction(
        { poiSystem: erPoiSysProg, gameplayState: erGameplayProg },
        sessionPda,
        newSessionSignerKeypair.publicKey,
        newSessionSignerKeypair.publicKey
      );
      const mapVrfIxs = await buildRequestAndFulfillMapVrfInstructions(
        erMapGenProg, sessionPda,
        newSessionSignerKeypair.publicKey, newSessionSignerKeypair.publicKey
      );
      const allVrfTx = new Transaction();
      allVrfTx.add(...poiGameplayVrfTx.instructions);
      allVrfTx.add(...mapVrfIxs);

      const VRF_MAX_RETRIES = 3;
      for (let vrfAttempt = 1; vrfAttempt <= VRF_MAX_RETRIES; vrfAttempt++) {
        try {
          await sendRoutedErTransaction(allVrfTx, newSessionSignerKeypair, [sessionPda]);
          console.log('[SessionContext] startGauntletGame:vrf_tx_sent', { attempt: vrfAttempt });
          break;
        } catch (vrfSendErr) {
          const msg = vrfSendErr instanceof Error ? vrfSendErr.message : String(vrfSendErr);
          if (msg.includes('InvalidAccountForFee') && vrfAttempt < VRF_MAX_RETRIES) {
            console.warn('[SessionContext] startGauntletGame:vrf_fee_error, retrying...', { attempt: vrfAttempt });
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            continue;
          }
          throw vrfSendErr;
        }
      }

      const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
      const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
      const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
      const routedVrfConnection =
        (await getRoutedErConnectionForAccount(sessionPda)) ?? directErConnection;
      const [mapReady, poiReady, gameplayReady] = await Promise.all([
        waitForVrfFulfillment(routedVrfConnection, mapVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
        waitForVrfFulfillment(routedVrfConnection, poiVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
        waitForVrfFulfillment(routedVrfConnection, gameplayVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
      ]);
      if (!mapReady || !gameplayReady || !poiReady) {
        throw new Error('Randomness (VRF) not received from oracle — please try again');
      }
      vrfReadySessionsRef.current.add(sessionPda.toBase58());
    } catch (vrfError) {
      logTxDebugError('startGauntletGame:er_vrf', vrfError);
      return {
        success: false,
        error:
          vrfError instanceof Error
            ? vrfError.message
            : 'Failed to initialize gauntlet randomness on ER',
      };
    }
    } // end else (ER VRF)

    // Draw gauntlet echoes using VRF on ER.
    // enter_gauntlet only inits the GauntletEchoes account — echoes are drawn here.
    {
      const erGameplayProgramForRedraw = createGameplayStateProgram(directErConnection);
      const redrawIx = await buildRedrawGauntletEchoesInstruction(
        erGameplayProgramForRedraw, sessionPda, newSessionSignerKeypair.publicKey
      );
      const redrawTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
        redrawIx
      );
      await sendErInitTransactionWithRetry(
        'startGauntletGame:draw_echoes',
        redrawTx,
        newSessionSignerKeypair,
        sessionPda
      );
      console.log('[SessionContext] startGauntletGame:echoes_drawn_with_vrf');
    }

    // Generate map with VRF-derived randomness and sync enemies in a single ER transaction
    try {
        console.log('[SessionContext] startGauntletGame:map_and_sync (ER)');
        const erMapGenProgram = createMapGeneratorProgram(directErConnection);
        const erGameplayProgram = createGameplayStateProgram(directErConnection);
        const localMapSeed = SOLANA_CONFIG.isLocalValidator
          ? await readMapVrfSeedFromBase(sessionPda)
          : undefined;
        const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);
        const { mapTx, syncTx } = await buildMapAndSyncTransaction(
          SOLANA_CONFIG.isLocalValidator ? 'seed' : 'vrf',
          erMapGenProgram,
          erGameplayProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          { campaignLevel: 20, seed: localMapSeed, gameplayVrfStatePda: deriveGameplayVrfStatePda(sessionPda)[0] }
        );
        const mapWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
          ...mapTx.instructions
        );
        await sendErInitTransactionWithRetry(
          'startGauntletGame:fill_map',
          mapWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );
        // Refresh MapPois BEFORE sync_map_enemies so that sync_map_enemies can
        // read the mole-den from MapPois and record it in SessionDiscovery.
        const erPoiSystemProgram = createPoiSystemProgram(directErConnection);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [gauntletGameStatePda] = deriveGameStatePda(sessionPda);
        const gauntletGeneratedSeed = (await fetchSessionGeneratedSeed(sessionPda)) ?? BigInt(20);
        const gauntletAct = 2;
        const gauntletWeek = 1;
        const refreshMapPoisIx = await erPoiSystemProgram.methods
          .refreshMapPois(gauntletAct, gauntletWeek, new BN(gauntletGeneratedSeed.toString()))
          .accounts({
            mapPois: mapPoisPda,
            session: sessionPda,
            generatedMap: generatedMapPda,
            gameState: gauntletGameStatePda,
            sessionSigner: newSessionSignerKeypair.publicKey,
          })
          .instruction();
        const rebuildMapPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          refreshMapPoisIx
        );
        await sendErInitTransactionWithRetry(
          'startGauntletGame:refresh_map_pois',
          rebuildMapPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );

        const syncWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          ...syncTx.instructions
        );

        // Discover POIs near spawn so they appear immediately
        const discoverPoisIx = await buildDiscoverSpawnPoisInstruction(
          erPoiSystemProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          6 // SPAWN_VISION_RADIUS
        );
        const discoverPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          discoverPoisIx
        );

        await sendErInitTransactionWithRetry(
          'startGauntletGame:sync_map_enemies',
          syncWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );
        await sendErInitTransactionWithRetry(
          'startGauntletGame:discover_spawn_pois',
          discoverPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );
        console.log('[SessionContext] startGauntletGame:all_vrf_ready (ER)');

        // Re-run sync_map_enemies WITH GauntletEchoes to write echo preview to SessionDiscovery.
        // The first sync ran without it because GauntletEchoes delegation was fire-and-forget
        // and may not have propagated to ER yet. By now (~5-10s later) it should be available.
        try {
          const geInfo = await directErConnection.getAccountInfo(gauntletEchoesPda, 'processed').catch(() => null);
          if (geInfo) {
            const echoSyncIx = await buildSyncMapEnemiesInstruction(
              erGameplayProgram, sessionPda, newSessionSignerKeypair.publicKey,
              { gauntletEchoesPda }
            );
            const echoSyncTx = new Transaction().add(
              ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
              echoSyncIx
            );
            await sendErInitTransactionWithRetry(
              'startGauntletGame:sync_echo',
              echoSyncTx,
              newSessionSignerKeypair,
              sessionPda
            );
            console.log('[SessionContext] startGauntletGame:echo_synced_to_discovery');
          } else {
            console.warn('[SessionContext] startGauntletGame: GauntletEchoes still not on ER, echo preview unavailable');
          }
        } catch (echoErr) {
          console.warn('[SessionContext] startGauntletGame:echo_sync_failed (non-fatal):', echoErr instanceof Error ? echoErr.message : echoErr);
        }
    } catch (vrfError) {
      logTxDebugError('startGauntletGame:map_gen', vrfError);
      return {
        success: false,
        error:
          vrfError instanceof Error
            ? vrfError.message
            : 'Failed to generate gauntlet map on ER',
      };
    }

    const generatedSeed = await fetchSessionGeneratedSeed(sessionPda);
    console.log('[SessionContext] startGauntletGame:generated_seed', {
      generatedSeed: generatedSeed?.toString() ?? null,
    });
    setMapSeed(null);
    gameplayState.setGameStatePda(gameStatePda);
    warmMovePlayerCaches(directErConnection, createGameplayStateProgram(directErConnection), sessionPda);

    return { success: true, mapSeed: null };
  }, [
    sessionSigner,
    connection,
    erConnection,
    directErConnection,
    gameplayState,
    sessionManager,
    signAndSendTransaction,
    wallet.publicKey,
    fetchSessionGeneratedSeed,
    confirmSignatureWithTimeout,
    debugSimulateTransaction,
    ensureSessionDiscoveryInitialized,
    ensureDelegatedToRollup,
    isAccountNotInitializedError,
    logTxDebugError,
    getRoutedErConnectionForAccount,
    sendRoutedErTransaction,
    sendErInitTransactionWithRetry,
    waitForSessionSignerOnEr,
  ]);

  /**
   * Resolve the correct signer for a session PDA.
   * Prefers session-scoped signer, then in-memory signer, then legacy global signer.
   * If expectedSigner is provided, only a matching keypair is returned.
   */
  const resolveSessionSignerForSession = useCallback(
    async (sessionPda: PublicKey, expectedSigner?: PublicKey | null): Promise<Keypair | null> => {
      const sessionPdaStr = sessionPda.toBase58();
      const candidates: Keypair[] = [];
      const seen = new Set<string>();

      const push = (keypair: Keypair | null) => {
        if (!keypair) return;
        const key = keypair.publicKey.toBase58();
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(keypair);
      };

      if (walletId) {
        push(await loadSessionSignerForSession(walletId, sessionPdaStr));
      }
      push(sessionSigner.keypair);
      if (walletId) {
        push(await loadSessionSignerWallet(walletId));
      }

      if (!expectedSigner) {
        return candidates[0] ?? (await recoverDeterministicSessionSigner(sessionPda));
      }

      return (
        candidates.find((candidate) => candidate.publicKey.equals(expectedSigner)) ??
        (await recoverDeterministicSessionSigner(sessionPda))
      );
    },
    [recoverDeterministicSessionSigner, sessionSigner.keypair, walletId]
  );

  const removeSessionFromActiveList = useCallback(
    (sessionPda: PublicKey, onChainLevel?: number | null): void => {
      const pdaBase58 = sessionPda.toBase58();
      const frontendLevel =
        typeof onChainLevel === 'number' && onChainLevel > 0 ? onChainLevel - 1 : null;
      setActiveSessions((prev) =>
        prev.filter(
          (session) =>
            session.sessionPda !== pdaBase58 &&
            (frontendLevel === null || session.level !== frontendLevel)
        )
      );
    },
    []
  );

  /**
   * End session immediately with session key signer (no user interaction).
   * Called automatically after combat ends in death or final victory.
   * The program validates that game_state.is_dead or game_state.completed is true.
   */
  const endSessionWithSessionSignerInner = useCallback(async (): Promise<TransactionResult> => {
    console.log('[SessionContext] Ending session with session key signer...');
    let settleSignature: string | undefined;
    await sessionManager.fetchSession();
    const endNonces = wallet.publicKey
      ? await sessionManager.fetchSessionNonces(wallet.publicKey)
      : null;
    const sessionPda =
      sessionManager.activeSessionPda ??
      (wallet.publicKey && sessionManager.session?.campaignLevel && endNonces
        ? deriveSessionPda(
            wallet.publicKey,
            sessionManager.session.campaignLevel,
            endNonces.campaign
          )[0]
        : null);
    if (!sessionPda) {
      return { success: false, error: 'Active session PDA not available' };
    }

    const expectedSessionSigner = sessionManager.session?.sessionSigner ?? null;
    const currentOnChainLevel = sessionManager.session?.campaignLevel ?? null;
    const cleanupSigner = await resolveSessionSignerForSession(sessionPda, expectedSessionSigner);
    if (!cleanupSigner) {
      return {
        success: false,
        error: expectedSessionSigner
          ? `Session key signer mismatch. Expected ${expectedSessionSigner.toBase58()}`
          : 'Session key signer not available',
      };
    }

    const sessionAccount = await connection.getAccountInfo(sessionPda, 'processed');
    if (!sessionAccount) {
      return { success: false, error: 'Session account not found on-chain' };
    }

    // Check ALL accounts for delegation, not just the session.
    // Child accounts (game_state, etc.) can remain delegated even when the session
    // account has been restored, causing end_session to fail with AccountOwnedByWrongProgram.
    const [gameStatePda] = deriveGameStatePda(sessionPda);
    const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
    const [mapPoisPda] = deriveMapPoisPda(sessionPda);
    const [inventoryPda] = deriveInventoryPda(sessionPda);

    const childInfos = await Promise.all([
      connection.getAccountInfo(gameStatePda, 'processed'),
      connection.getAccountInfo(generatedMapPda, 'processed'),
      connection.getAccountInfo(mapPoisPda, 'processed'),
      connection.getAccountInfo(inventoryPda, 'processed'),
    ]);
    const sessionOwnedByProgram = sessionAccount.owner.equals(
      SOLANA_CONFIG.programs.sessionManager
    );
    const anyChildDelegated = childInfos.some(
      (info) => info && info.owner.equals(DELEGATION_PROGRAM_ID)
    );

    // Settlement is handled after undelegation completes (or by end_session via CPI).
    // For the common delegated case, we skip the early settle to save a TX round-trip.
    // For the non-delegated case (session already on base), settle now to capture the
    // settleSignature for ItemUnlocked event parsing.
    if (sessionOwnedByProgram && !anyChildDelegated) {
      const settleResult = await sessionManager.settleSessionResult(cleanupSigner);
      if (settleResult.success && settleResult.signature) {
        settleSignature = settleResult.signature;
      }
    }

    const mustUndelegate =
      !sessionOwnedByProgram || anyChildDelegated || Boolean(sessionManager.session?.isDelegated);
    if (mustUndelegate) {
      const undelegateResult = await sessionManager.undelegateSession(
        getFallbackStateHash(),
        cleanupSigner
      );
      if (!undelegateResult.success) {
        const latestSessionInfo = await connection.getAccountInfo(sessionPda, 'processed');
        if (latestSessionInfo?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
          console.warn(
            '[SessionContext] Undelegate failed with session already on base; trying forceCloseSession fallback:',
            undelegateResult.error
          );
          const forceCloseResult = await sessionManager.forceCloseSession(cleanupSigner);
          if (forceCloseResult.success) {
            setUseErForGameplay(false);
            removeSessionFromActiveList(sessionPda, currentOnChainLevel);
            return forceCloseResult.signature
              ? { ...forceCloseResult, settleSignature: forceCloseResult.signature }
              : forceCloseResult;
          }
          console.warn(
            '[SessionContext] forceCloseSession failed; trying closeSessionOnly last-resort'
          );
          const closeOnlyResult = await sessionManager.closeSessionOnly(cleanupSigner);
          if (closeOnlyResult.success) {
            setUseErForGameplay(false);
            removeSessionFromActiveList(sessionPda, currentOnChainLevel);
            return closeOnlyResult.signature
              ? { ...closeOnlyResult, settleSignature: closeOnlyResult.signature }
              : closeOnlyResult;
          }
        }
        return {
          success: false,
          error: undelegateResult.error ?? 'Failed to undelegate session from rollup',
        };
      }
      setUseErForGameplay(false);

      // Ensure base layer ownership is restored for ALL accounts before attempting end_session.
      let restored = false;
      const expectedOwners: Array<[PublicKey, PublicKey]> = [
        [sessionPda, SOLANA_CONFIG.programs.sessionManager],
        [gameStatePda, SOLANA_CONFIG.programs.gameplayState],
        [generatedMapPda, SOLANA_CONFIG.programs.mapGenerator],
        [mapPoisPda, SOLANA_CONFIG.programs.poiSystem],
        [inventoryPda, SOLANA_CONFIG.programs.playerInventory],
      ];
      for (let i = 0; i < 20; i += 1) {
        const infos = await Promise.all(
          expectedOwners.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
        );
        restored = infos.every((info, idx) => info?.owner.equals(expectedOwners[idx][1]));
        if (restored) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      // LOCAL-ONLY: force-undelegate remaining accounts via Delegation Program on base layer.
      if (!restored && isForceUndelegateAvailable()) {
        const freshInfos = await Promise.all(
          expectedOwners.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
        );
        const stillDelegatedPdas = expectedOwners
          .filter((_, idx) => freshInfos[idx]?.owner.equals(DELEGATION_PROGRAM_ID))
          .map(([pda]) => pda);
        if (stillDelegatedPdas.length > 0) {
          console.log(
            '[SessionContext] Using local force-undelegate for',
            stillDelegatedPdas.length,
            'accounts in endSession cleanup'
          );
          await forceUndelegateAccounts(connection, stillDelegatedPdas);
          // Re-check
          const postForceInfos = await Promise.all(
            expectedOwners.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
          );
          restored = postForceInfos.every((info, idx) =>
            info?.owner.equals(expectedOwners[idx][1])
          );
          if (restored) {
            console.log('[SessionContext] All accounts restored after force-undelegate');
          }
        }
      }

      if (!restored) {
        const latestSessionInfo = await connection.getAccountInfo(sessionPda, 'processed');
        if (latestSessionInfo?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
          console.warn(
            '[SessionContext] Owner restore timed out with session on base; trying forceCloseSession fallback'
          );
          const forceCloseResult = await sessionManager.forceCloseSession(cleanupSigner);
          if (forceCloseResult.success) {
            setUseErForGameplay(false);
            removeSessionFromActiveList(sessionPda, currentOnChainLevel);
            return forceCloseResult.signature
              ? { ...forceCloseResult, settleSignature: forceCloseResult.signature }
              : forceCloseResult;
          }
          console.warn(
            '[SessionContext] forceCloseSession failed; trying closeSessionOnly last-resort'
          );
          const closeOnlyResult = await sessionManager.closeSessionOnly(cleanupSigner);
          if (closeOnlyResult.success) {
            setUseErForGameplay(false);
            removeSessionFromActiveList(sessionPda, currentOnChainLevel);
            return closeOnlyResult.signature
              ? { ...closeOnlyResult, settleSignature: closeOnlyResult.signature }
              : closeOnlyResult;
          }
        }
        return {
          success: false,
          error: 'Session undelegate not finalized yet; please retry in a moment',
        };
      }

      // Session ownership is restored now — settle to capture the settleSignature
      // for ItemUnlocked event parsing. end_session also settles via CPI as fallback.
      const settleAfterUndelegate = await sessionManager.settleSessionResult(cleanupSigner);
      if (settleAfterUndelegate.success && settleAfterUndelegate.signature) {
        settleSignature = settleAfterUndelegate.signature;
      } else if (!settleAfterUndelegate.success) {
        console.warn(
          '[SessionContext] settleSessionResult after undelegate failed (will continue cleanup):',
          settleAfterUndelegate.error
        );
      }
    }

    // For duel sessions, settle payout on base layer before ending.
    // Captures loadout, resolves PvP if matched, handles payouts, pushes to queue.
    // Don't rely on context runMode (may be stale) — check DuelEntry existence instead.
    if (wallet.publicKey) {
      try {
        const [duelEntryPda] = deriveDuelEntryPda(sessionPda);
        const duelEntryInfo = await connection.getAccountInfo(duelEntryPda, 'processed').catch(() => null);
        if (duelEntryInfo && duelEntryInfo.owner.equals(SOLANA_CONFIG.programs.gameplayState)) {
          const duelProgram = createGameplayStateProgram(connection);
          const duelEntry = await fetchDuelEntry(duelProgram, sessionPda).catch(() => null);
          if (duelEntry && duelEntry.entryLamports > 0 && !duelEntry.settled) {
            console.log('[SessionContext] Duel: settling payout before end...');
            const duelSettleTx = await buildSettleDuelPayoutTransaction(
              connection,
              duelProgram,
              wallet.publicKey,
              cleanupSigner.publicKey,
              gameStatePda,
              sessionPda,
              duelEntry.matchedCreatorPlayer
            );
            const duelSettleSig = await sendSessionSignerTransaction(connection, duelSettleTx, cleanupSigner);
            await connection.confirmTransaction(duelSettleSig, 'confirmed');
            console.log('[SessionContext] Duel settle confirmed:', duelSettleSig);
          }
        }
      } catch (duelSettleErr) {
        console.warn('[SessionContext] Duel settle failed (non-fatal):', duelSettleErr);
      }
    }

    // For gauntlet sessions, settle points/echoes on base layer before ending.
    // settle_gauntlet_session is signed by the session key (no wallet popup).
    if (
      gameplayState.gameState?.runMode === RunMode.Gauntlet &&
      !gameplayState.gameState?.gauntletSettled &&
      wallet.publicKey
    ) {
      try {
        console.log('[SessionContext] Gauntlet: settling session before end...');
        const gameplayProgram = createGameplayStateProgram(connection);
        const settleTx = await buildSettleGauntletSessionTransaction(
          connection,
          gameplayProgram,
          wallet.publicKey,
          cleanupSigner.publicKey,
          gameStatePda,
          sessionPda
        );
        const settleSig = await sendSessionSignerTransaction(connection, settleTx, cleanupSigner);
        await connection.confirmTransaction(settleSig, 'confirmed');
        console.log('[SessionContext] Gauntlet settle confirmed:', settleSig);
      } catch (settleErr) {
        console.warn('[SessionContext] Gauntlet settle failed (non-fatal):', settleErr);
        // Continue to end_session even if settle fails — the session can still be closed
      }
    }

    // End the session on-chain (only session signer signs)
    let result = await sessionManager.endSession(cleanupSigner);
    // If settle didn't capture the signature, end_session may have done the unlock.
    if (!settleSignature && result.success && result.signature) {
      settleSignature = result.signature;
    }

    // If endSession fails, try forceCloseSession as fallback (handles non-terminal
    // abandoned sessions, partially delegated children, etc.)
    if (!result.success) {
      console.warn(
        '[SessionContext] endSession failed; trying forceCloseSession fallback:',
        result.error
      );
      const forceResult = await sessionManager.forceCloseSession(cleanupSigner);
      if (forceResult.success) {
        result = forceResult;
        if (!settleSignature && forceResult.signature) {
          settleSignature = forceResult.signature;
        }
      } else {
        console.warn(
          '[SessionContext] forceCloseSession failed; trying closeSessionOnly last-resort'
        );
        const closeOnlyResult = await sessionManager.closeSessionOnly(cleanupSigner);
        if (closeOnlyResult.success) {
          result = closeOnlyResult;
          if (!settleSignature && closeOnlyResult.signature) {
            settleSignature = closeOnlyResult.signature;
          }
        }
      }
    }

    if (result.success) {
      console.log('[SessionContext] Session ended successfully');
      removeSessionFromActiveList(sessionPda, currentOnChainLevel);
      vrfReadySessionsRef.current.delete(sessionPda.toBase58());

      // Clear local state
      setMapSeed(null);
      gameplayState.setGameStatePda(null);

      // Clear fog and broken walls for all possible session PDA types
      if (wallet.publicKey) {
        const endNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
        const pdaKeys: string[] = [];
        if (sessionManager.session?.campaignLevel) {
          const [campPda] = deriveSessionPda(
            wallet.publicKey,
            sessionManager.session.campaignLevel,
            endNonces.campaign
          );
          pdaKeys.push(campPda.toBase58());
        }
        const [duelPda] = deriveDuelSessionPda(wallet.publicKey, endNonces.duel);
        pdaKeys.push(duelPda.toBase58());
        const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey, endNonces.gauntlet);
        pdaKeys.push(gauntletPda.toBase58());
        for (const key of pdaKeys) {
          await clearFogState(key).catch(() => {});
          await clearBrokenWalls(key).catch(() => {});
        }
      }

      // Withdraw excess balance in background (signer persists for reuse).
      void (async () => {
        try {
          const keypair = sessionSigner.keypair;
          if (keypair && wallet.publicKey) {
            await withdrawExcessToMain(connection, keypair, wallet.publicKey);
          }
        } catch (err) {
          console.warn('[SessionContext] Background excess withdrawal failed:', err);
        }
      })();
      setUseErForGameplay(false);
    }

    return settleSignature ? { ...result, settleSignature } : result;
  }, [
    sessionSigner,
    getFallbackStateHash,
    sessionManager,
    setUseErForGameplay,
    wallet.publicKey,
    connection,
    gameplayState.setGameStatePda,
    gameplayState.gameState?.runMode,
    gameplayState.gameState?.gauntletSettled,
    resolveSessionSignerForSession,
    removeSessionFromActiveList,
  ]);

  // Wrapper that tracks the teardown promise so new sessions wait for cleanup.
  const endSessionWithSessionSigner = useCallback((): Promise<TransactionResult> => {
    const promise = endSessionWithSessionSignerInner();
    pendingTeardownRef.current = promise;
    // Clear ref when done (success or failure)
    void promise.finally(() => {
      if (pendingTeardownRef.current === promise) {
        pendingTeardownRef.current = null;
      }
    });
    return promise;
  }, [endSessionWithSessionSignerInner]);

  /**
   * Undelegate the current session from the rollup back to base chain.
   * Extracted for use by CombatScreen before duel finalization.
   */
  const undelegateCurrentSession = useCallback(async (): Promise<TransactionResult> => {
    const undelegateNonces = wallet.publicKey
      ? await sessionManager.fetchSessionNonces(wallet.publicKey)
      : null;
    const sessionPda =
      sessionManager.activeSessionPda ??
      (wallet.publicKey && sessionManager.session?.campaignLevel && undelegateNonces
        ? deriveSessionPda(
            wallet.publicKey,
            sessionManager.session.campaignLevel,
            undelegateNonces.campaign
          )[0]
        : null);
    if (!sessionPda) {
      return { success: false, error: 'Active session PDA not available' };
    }

    await sessionManager.fetchSession();
    const expectedSessionSigner = sessionManager.session?.sessionSigner ?? null;
    const cleanupSigner = await resolveSessionSignerForSession(sessionPda, expectedSessionSigner);
    if (!cleanupSigner) {
      return {
        success: false,
        error: expectedSessionSigner
          ? `Session key signer mismatch. Expected ${expectedSessionSigner.toBase58()}`
          : 'Session key signer not available',
      };
    }

    const sessionAccount = await connection.getAccountInfo(sessionPda, 'processed');
    if (!sessionAccount) {
      return { success: false, error: 'Session account not found on-chain' };
    }

    const sessionOwnedByProgram = sessionAccount.owner.equals(
      SOLANA_CONFIG.programs.sessionManager
    );
    if (sessionOwnedByProgram && !sessionManager.session?.isDelegated) {
      // Already on base chain
      return { success: true };
    }

    const undelegateResult = await sessionManager.undelegateSession(
      getFallbackStateHash(),
      cleanupSigner
    );
    if (!undelegateResult.success) {
      return {
        success: false,
        error: undelegateResult.error ?? 'Failed to undelegate session from rollup',
      };
    }

    // Wait for base layer ownership to be restored for ALL accounts.
    // Child accounts (game_state) can remain delegated even after the session PDA
    // is restored, causing downstream instructions to fail with AccountOwnedByWrongProgram.
    const [gameStatePda] = deriveGameStatePda(sessionPda);
    const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
    const [mapPoisPda] = deriveMapPoisPda(sessionPda);
    const [inventoryPda] = deriveInventoryPda(sessionPda);
    let restored = false;
    const expectedOwners: Array<[PublicKey, PublicKey]> = [
      [sessionPda, SOLANA_CONFIG.programs.sessionManager],
      [gameStatePda, SOLANA_CONFIG.programs.gameplayState],
      [generatedMapPda, SOLANA_CONFIG.programs.mapGenerator],
      [mapPoisPda, SOLANA_CONFIG.programs.poiSystem],
      [inventoryPda, SOLANA_CONFIG.programs.playerInventory],
    ];
    for (let i = 0; i < 20; i += 1) {
      const infos = await Promise.all(
        expectedOwners.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
      );
      restored = infos.every((info, idx) => info?.owner.equals(expectedOwners[idx][1]));
      if (restored) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!restored) {
      return {
        success: false,
        error: 'Session undelegate not finalized yet; please retry in a moment',
      };
    }

    setUseErForGameplay(false);
    return { success: true };
  }, [
    sessionManager,
    wallet.publicKey,
    connection,
    getFallbackStateHash,
    setUseErForGameplay,
    resolveSessionSignerForSession,
  ]);

  /**
   * End game (legacy function for compatibility).
   * Now delegates to endSessionWithSessionSigner.
   */
  const endGame = useCallback(async (): Promise<TransactionResult> => {
    return endSessionWithSessionSigner();
  }, [endSessionWithSessionSigner]);

  const delegateToRollup = useCallback(async (): Promise<TransactionResult> => {
    return ensureDelegatedToRollup();
  }, [ensureDelegatedToRollup]);

  const commitGameState = useCallback(
    async (stateHash: number[]): Promise<TransactionResult> => {
      return sessionManager.commitSession(stateHash);
    },
    [sessionManager]
  );

  const refreshSession = useCallback(async () => {
    await sessionManager.fetchSession();
  }, [sessionManager]);

  const getMapSeedForLevel = useCallback(async (_level: number): Promise<bigint | null> => null, []);

  const verifySeed = useCallback(async (_level: number, _seed: bigint): Promise<boolean> => true, []);

  /**
   * Stop the auto-commit timer.
   */
  const stopAutoCommit = useCallback(() => {
    if (commitTimerRef.current) {
      clearInterval(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    getStateHashRef.current = null;
    setIsAutoCommitActive(false);
  }, []);

  /**
   * Start the auto-commit timer for periodic state checkpoints.
   * The timer commits the current state hash to the chain every 30 seconds.
   *
   * @param getStateHash - Function that returns the current game state hash (32 bytes)
   */
  const startAutoCommit = useCallback(
    (getStateHash: () => number[]) => {
      // Stop any existing timer
      stopAutoCommit();

      // Store the state hash getter
      getStateHashRef.current = getStateHash;
      setIsAutoCommitActive(true);

      // Start the interval timer
      commitTimerRef.current = setInterval(async () => {
        if (!getStateHashRef.current || !sessionManager.hasActiveSession) {
          stopAutoCommit();
          return;
        }

        try {
          const stateHash = getStateHashRef.current();
          if (stateHash.length === 32) {
            const result = await sessionManager.commitSession(stateHash);
            if (!result.success) {
              console.warn('Auto-commit failed:', result.error);
            }
          }
        } catch (error) {
          console.error('Auto-commit error:', error);
        }
      }, COMMIT_INTERVAL_MS);
    },
    [sessionManager, stopAutoCommit]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (commitTimerRef.current) {
        clearInterval(commitTimerRef.current);
      }
    };
  }, []);

  /**
   * Move player on-chain via session key signer.
   * On-chain-first: awaits confirmation and returns confirmed state.
   */
  const movePlayer = useCallback(
    async (
      params: MovePlayerParams
    ): Promise<{
      success: boolean;
      newState?: GameState;
      previousState?: GameState;
      combatOccurred?: boolean;
      combatEnemyInfo?: CombatEnemyInfo;
      bossFightReady?: boolean;
      isDead?: boolean;
      signature?: string;
      bossResolvedInline?: boolean;
      preBossPlayerHp?: number;
      inlineBossId?: string;
    }> => {
      const activeSessionPda = sessionManager.activeSessionPda;
      const expectedSessionSigner = sessionManager.session?.sessionSigner ?? null;
      const resolvedSessionSigner =
        sessionSigner.keypair ??
        (activeSessionPda
          ? await resolveSessionSignerForSession(activeSessionPda, expectedSessionSigner)
          : null);

      if (!resolvedSessionSigner) {
        console.error('[SessionContext] movePlayer failed: Session key signer not available');
        return { success: false };
      }

      if (activeSessionPda && !sessionSigner.keypair) {
        await sessionSigner.markAsActive(resolvedSessionSigner);
        await sessionSigner.associateWithSession(
          resolvedSessionSigner,
          activeSessionPda.toBase58()
        );
      }

      if (activeSessionPda) {
        const vrfReady = await ensureSessionVrfReady(activeSessionPda.toBase58());
        if (!vrfReady.success) {
          console.error('[SessionContext] movePlayer blocked: VRF not fulfilled', vrfReady.error);
          return { success: false };
        }
      }
      console.log(
        '[SessionContext] movePlayer: sessionSigner =',
        resolvedSessionSigner.publicKey.toBase58(),
        ', gameStatePda =',
        gameplayState.gameStatePda?.toBase58() ?? 'null',
        ', gameState =',
        gameplayState.gameState ? 'set' : 'null'
      );
      return gameplayState.move(resolvedSessionSigner, params);
    },
    [
      ensureSessionVrfReady,
      gameplayState,
      resolveSessionSignerForSession,
      sessionManager.activeSessionPda,
      sessionManager.session?.sessionSigner,
      sessionSigner,
    ]
  );

  /**
   * Trigger boss fight on-chain via session key signer.
   * Gauntlet echo combat requires a separate trigger_boss_fight call (not inline).
   * Campaign and Duel (weeks 1-2) resolve inline in move_player.
   */
  const triggerBoss = useCallback(async (): Promise<{
    success: boolean;
    newState?: GameState;
    previousState?: GameState;
    isDead?: boolean;
    gauntletVisual?: GauntletCombatVisualEvent | null;
    signature?: string;
  }> => {
    const activeSessionPda = sessionManager.activeSessionPda;
    const expectedSessionSigner = sessionManager.session?.sessionSigner ?? null;
    const resolvedSessionSigner =
      sessionSigner.keypair ??
      (activeSessionPda
        ? await resolveSessionSignerForSession(activeSessionPda, expectedSessionSigner)
        : null);

    if (!resolvedSessionSigner) {
      console.error('[SessionContext] triggerBoss failed: Session key signer not available');
      return { success: false };
    }

    if (activeSessionPda && !sessionSigner.keypair) {
      await sessionSigner.markAsActive(resolvedSessionSigner);
      await sessionSigner.associateWithSession(resolvedSessionSigner, activeSessionPda.toBase58());
    }

    return gameplayState.triggerBoss(resolvedSessionSigner);
  }, [
    gameplayState,
    resolveSessionSignerForSession,
    sessionManager.activeSessionPda,
    sessionManager.session?.sessionSigner,
    sessionSigner,
  ]);

  /**
   * Modify player stat on-chain via session key signer.
   */
  const modifyPlayerStat = useCallback(
    async (params: ModifyStatParams): Promise<{ success: boolean; newValue?: number }> => {
      const activeSessionPda = sessionManager.activeSessionPda;
      const expectedSessionSigner = sessionManager.session?.sessionSigner ?? null;
      const resolvedSessionSigner =
        sessionSigner.keypair ??
        (activeSessionPda
          ? await resolveSessionSignerForSession(activeSessionPda, expectedSessionSigner)
          : null);

      if (!resolvedSessionSigner) {
        return { success: false };
      }

      if (activeSessionPda && !sessionSigner.keypair) {
        await sessionSigner.markAsActive(resolvedSessionSigner);
        await sessionSigner.associateWithSession(
          resolvedSessionSigner,
          activeSessionPda.toBase58()
        );
      }

      return gameplayState.updateStat(resolvedSessionSigner, params);
    },
    [
      gameplayState,
      resolveSessionSignerForSession,
      sessionManager.activeSessionPda,
      sessionManager.session?.sessionSigner,
      sessionSigner,
    ]
  );

  /**
   * Top up session key signer with additional SOL.
   */
  const topUpSessionSigner = useCallback(
    async (amount?: number): Promise<boolean> => {
      return sessionSigner.topUp(amount);
    },
    [sessionSigner]
  );

  /**
   * Get current session keypair for direct use.
   */
  const getSessionSignerKeypair = useCallback((): Keypair | null => {
    return sessionSigner.keypair;
  }, [sessionSigner.keypair]);

  // Track pending cleanups state
  const [hasPendingCleanupsState, setHasPendingCleanupsState] = useState(false);
  const cleanupProcessingRef = useRef(false);

  /**
   * Refresh the list of all active sessions for the player.
   */
  const refreshSessionList = useCallback(async (): Promise<void> => {
    if (!wallet.publicKey || !connection) {
      setActiveSessions([]);
      return;
    }

    setIsSessionListLoading(true);
    try {
      // For now, use direct account fetching since we may not have all programs
      // The sessionList service handles this
      const sessionProgram = createSessionManagerProgram(connection);
      const gameplayProgram = createGameplayStateProgram(connection);
      const nonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
      const sessions = await fetchSessionList(
        connection,
        sessionProgram,
        gameplayProgram,
        wallet.publicKey,
        { campaign: nonces.campaign, duel: nonces.duel, gauntlet: nonces.gauntlet }
      ).catch(() => []);
      setActiveSessions(sessions);
    } catch (error) {
      console.warn('[SessionContext] Failed to fetch session list:', error);
      setActiveSessions([]);
    } finally {
      setIsSessionListLoading(false);
    }
  }, [connection, wallet.publicKey]);

  // Fetch session list when wallet connects
  useEffect(() => {
    if (wallet.isConnected && wallet.publicKey) {
      refreshSessionList();
    } else {
      setActiveSessions([]);
    }
  }, [wallet.isConnected, wallet.publicKey, refreshSessionList]);

  /**
   * Check if a session exists for a specific level.
   */
  const hasSessionForLevel = useCallback(
    async (level: number): Promise<boolean> => {
      if (!wallet.publicKey || !connection) {
        return false;
      }
      const nonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
      return checkSessionExists(connection, wallet.publicKey, level, nonces.campaign);
    },
    [connection, wallet.publicKey, sessionManager]
  );

  /**
   * Get the session PDA for a level if it exists.
   */
  const getSessionPdaForLevel = useCallback(
    async (level: number): Promise<string | null> => {
      if (!wallet.publicKey || !connection) {
        return null;
      }
      const nonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
      const pda = await getSessionForLevel(connection, wallet.publicKey, level, nonces.campaign);
      return pda ? pda.toBase58() : null;
    },
    [connection, wallet.publicKey, sessionManager]
  );

  const fetchSessionNonces = useCallback(async (): Promise<{
    campaign: bigint;
    duel: bigint;
    gauntlet: bigint;
  }> => {
    if (!wallet.publicKey) {
      return { campaign: 0n, duel: 0n, gauntlet: 0n };
    }
    return sessionManager.fetchSessionNonces(wallet.publicKey);
  }, [wallet.publicKey, sessionManager]);

  const overrideCampaignSession = useCallback(async (): Promise<TransactionResult> => {
    const result = await sessionManager.overrideCampaignSession();
    if (!result.success) {
      return result;
    }
    await refreshSessionList();
    return result;
  }, [sessionManager, refreshSessionList]);

  const overrideDuelSession = useCallback(async (): Promise<TransactionResult> => {
    const result = await sessionManager.overrideDuelSession();
    if (!result.success) {
      return result;
    }
    await refreshSessionList();
    return result;
  }, [sessionManager, refreshSessionList]);

  const overrideGauntletSession = useCallback(async (): Promise<TransactionResult> => {
    const result = await sessionManager.overrideGauntletSession();
    if (!result.success) {
      return result;
    }
    await refreshSessionList();
    return result;
  }, [sessionManager, refreshSessionList]);

  const overrideAndStartGame = useCallback(
    async (campaignLevel: number, onCommitted?: () => void): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }
      const _t0 = Date.now();
      const _mark = (label: string) => console.log(`[perf] override: ${label} +${Date.now() - _t0}ms`);

      const onChainLevel = campaignLevel + 1;
      const currentNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
      const newNonce = currentNonces.campaign + 1n;
      let derivedSessionSigner: Keypair;
      if (sessionSigner.keypair) {
        derivedSessionSigner = sessionSigner.keypair;
      } else {
        const walletSig = await signMessage(
          buildGameWalletDerivationMessage()
        );
        derivedSessionSigner = deriveSessionSignerFromSignature(walletSig);
      }
      const overrideSignerBalance = await connection.getBalance(derivedSessionSigner.publicKey);
      const overrideFundingNeeded = calculateRequiredFunding(overrideSignerBalance, SESSION_COST_CAMPAIGN);
      const sessionSignerResult = await sessionSigner.createWithoutFundingFromKeypair(
        derivedSessionSigner,
        overrideFundingNeeded
      );
      if (!sessionSignerResult) {
        return { success: false, error: 'Failed to create sessionSigner wallet' };
      }
      const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;

      const overrideTx = await sessionManager.buildOverrideCampaignSessionTransaction();
      const sessionResult = await sessionManager.buildStartSessionTransaction(
        campaignLevel,
        newSessionSignerKeypair.publicKey,
        newNonce
      );
      if (!overrideTx || !sessionResult) {
        sessionSigner.resetState();
        return { success: false, error: 'Failed to build override/start transaction' };
      }

      const { transaction: sessionTransaction, sessionPda } = sessionResult;
      await clearFogState(sessionPda.toBase58()).catch(() => {});
      await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});
      vrfReadySessionsRef.current.delete(sessionPda.toBase58());

      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      const combinedTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
      );
      combinedTx.add(...fundTransaction.instructions);
      combinedTx.add(...overrideTx.instructions);
      combinedTx.add(...sessionInstructions);
      const startBh = await connection.getLatestBlockhash('confirmed');
      combinedTx.recentBlockhash = startBh.blockhash;
      combinedTx.feePayer = wallet.publicKey ?? undefined;
      combinedTx.partialSign(newSessionSignerKeypair);

      try {
        const [signature] = await signAndSendTransactions([combinedTx], {
          connection,
          skipPreflight: true,
        });
        await confirmSignatureWithTimeout(signature);
        _mark('tx_confirmed');
        onCommitted?.();
        await sessionSigner.markAsActive(newSessionSignerKeypair);
        await sessionSigner.associateWithSession(newSessionSignerKeypair, sessionPda.toBase58());
        // Defer session fetch + list refresh — not needed before delegation/gameplay
        void sessionManager.fetchSession().then(() => refreshSessionList());
        _mark('session_setup');
      } catch (txError: unknown) {
        sessionSigner.resetState();
        return {
          success: false,
          error: txError instanceof Error ? txError.message : 'Transaction failed',
        };
      }

      let campaignVrfToDelegate: ('poi')[] | undefined = ['poi'];
      {
        const [poiVrfPda] = derivePoiVrfStatePda(sessionPda);
        const poiVrfInfo = await connection.getAccountInfo(poiVrfPda).catch(() => null);
        if (poiVrfInfo && poiVrfInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
          campaignVrfToDelegate = undefined;
        } else if (!poiVrfInfo) {
          try {
            const basePoiSysProg = createPoiSystemProgram(connection);
            const initPoiVrfTx = await buildInitPoiVrfStateTransaction(
              basePoiSysProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            await sendSessionSignerTransaction(connection, initPoiVrfTx, newSessionSignerKeypair);
          } catch {}
        }
      }
      _mark('vrf_init');

      // On localnet, request+fulfill VRF on base layer. The VRF state is NOT delegated —
      // the ER clones it from base in replica mode, avoiding VRF CPI on ER.
      if (campaignVrfToDelegate) {
        const baseVrfResult = await requestBaseLayerVrf(
          sessionPda,
          newSessionSignerKeypair,
          campaignVrfToDelegate
        );
        if (!baseVrfResult.success) {
          return { success: false, error: baseVrfResult.error! };
        }
      }
      _mark('base_vrf');

      const delegateResult = await sessionManager.delegateSession(newSessionSignerKeypair, {
        sessionPda,
        onChainLevel,
        delegateVrf: SOLANA_CONFIG.isLocalValidator ? undefined : campaignVrfToDelegate,
      });
      _mark('delegated');
      if (!delegateResult.success) {
        sessionSigner.resetState();
        return {
          success: false,
          error: delegateResult.error ?? 'Delegation transaction failed after session creation',
        };
      }

      const erReady = await waitForErSessionAccounts(sessionPda, { includeVrf: !SOLANA_CONFIG.isLocalValidator });
      _mark('er_ready');
      setUseErForGameplay(erReady);
      if (!erReady) {
        return {
          success: false,
          error: 'Delegation not fully propagated to ER yet. Please retry starting the session.',
        };
      }

      let resolvedConn = await resolveAndSetErEndpoint(sessionPda);
      const signerResult = await waitForSessionSignerOnEr(
        newSessionSignerKeypair.publicKey,
        sessionPda
      );
      _mark('signer_on_er');
      if (!resolvedConn) {
        resolvedConn = await resolveAndSetErEndpoint(sessionPda);
      }
      if (!resolvedConn && signerResult.endpoint) {
        setResolvedErEndpoint(signerResult.endpoint);
        resolvedConn = new Connection(signerResult.endpoint, {
          commitment: SOLANA_CONFIG.erCommitment,
          wsEndpoint: deriveErWsEndpoint(signerResult.endpoint),
        });
      }

      if (vrfReadySessionsRef.current.has(sessionPda.toBase58())) {
        console.log('[SessionContext] overrideAndStartGame:poi_vrf:already_fulfilled_on_base, skipping ER request');
      } else {
        try {
          const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
          const erPoiSysProg = createPoiSystemProgram(directErConnection);
          const poiVrfTx = await buildRequestAndFulfillPoiVrfTransaction(
            erPoiSysProg,
            sessionPda,
            newSessionSignerKeypair.publicKey,
            newSessionSignerKeypair.publicKey
          );
          await sendRoutedErTransaction(poiVrfTx, newSessionSignerKeypair, [
            sessionPda,
            poiVrfStatePda,
          ]);
          const routedVrfConnection =
            (await getRoutedErConnectionForAccount(sessionPda)) ?? directErConnection;
          const fulfilled = await waitForVrfFulfillment(
            routedVrfConnection,
            poiVrfStatePda,
            30_000
          );
          if (fulfilled) {
            vrfReadySessionsRef.current.add(sessionPda.toBase58());
          } else {
            return {
              success: false,
              error:
                'POI VRF was not fulfilled in time. Session was created, but gameplay remains blocked until the oracle fulfills the request. Return and retry or resume once VRF is ready.',
            };
          }
        } catch (poiVrfErr) {
          logTxDebugError('overrideAndStartGame:poi_vrf_er', poiVrfErr);
          return {
            success: false,
            error:
              poiVrfErr instanceof Error
                ? poiVrfErr.message
                : 'Failed to request POI VRF on ER',
          };
        }
      }
      _mark('vrf_done');

      await ensureSessionDiscoveryInitialized(
        sessionPda,
        newSessionSignerKeypair,
        'overrideAndStartGame'
      );

      try {
        const levelSeed = (await mapGenerator.getMapSeed(campaignLevel)) ?? BigInt(onChainLevel);
        const erMapGenProgram = createMapGeneratorProgram(directErConnection);
        const erGameplayProgram = createGameplayStateProgram(directErConnection);
        const erPoiSystemProgram = createPoiSystemProgram(directErConnection);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const campaignAct = Math.max(1, Math.min(4, Math.floor((onChainLevel - 1) / 10) + 1));
        const campaignWeek = 1;
        const { mapTx, syncTx } = await buildMapAndSyncTransaction(
          'seed',
          erMapGenProgram,
          erGameplayProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          { campaignLevel: onChainLevel, seed: levelSeed }
        );
        const mapWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
          ...mapTx.instructions
        );
        // Step 1: Fill map (must complete before sync/refresh)
        await sendErInitTransactionWithRetry(
          'overrideAndStartGame:fill_map',
          mapWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );

        // Step 2: Refresh MapPois BEFORE sync_map_enemies so that sync_map_enemies can
        // read the mole-den from MapPois and record it in SessionDiscovery.
        const refreshMapPoisIx = await erPoiSystemProgram.methods
          .refreshMapPois(campaignAct, campaignWeek, new BN(levelSeed.toString()))
          .accounts({
            mapPois: mapPoisPda,
            session: sessionPda,
            generatedMap: generatedMapPda,
            gameState: gameStatePda,
            sessionSigner: newSessionSignerKeypair.publicKey,
          })
          .instruction();
        const rebuildMapPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          refreshMapPoisIx
        );
        await sendErInitTransactionWithRetry(
          'overrideAndStartGame:refresh_map_pois',
          rebuildMapPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );

        const syncWithBudgetTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
          ...syncTx.instructions
        );
        await sendErInitTransactionWithRetry(
          'overrideAndStartGame:sync_map_enemies',
          syncWithBudgetTx,
          newSessionSignerKeypair,
          sessionPda
        );

        // Step 3: Discover POIs near spawn (needs refresh_map_pois)
        const discoverPoisIx = await buildDiscoverSpawnPoisInstruction(
          erPoiSystemProgram,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          6 // SPAWN_VISION_RADIUS
        );
        const discoverPoisTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          discoverPoisIx
        );
        await sendErInitTransactionWithRetry(
          'overrideAndStartGame:discover_spawn_pois',
          discoverPoisTx,
          newSessionSignerKeypair,
          sessionPda
        );
      } catch (mapErr) {
        logTxDebugError('overrideAndStartGame:map_and_sync', mapErr);
        return {
          success: false,
          error: formatUnknownErrorMessage(mapErr) || 'Failed to initialize map',
        };
      }

      const generatedSeed = await fetchSessionGeneratedSeed(sessionPda);
      setMapSeed(null);
      gameplayState.setGameStatePda(getGameStatePda(sessionPda)[0]);
      _mark('complete');
      if (resolvedConn) {
        warmMovePlayerCaches(resolvedConn, createGameplayStateProgram(resolvedConn), sessionPda);
      }
      return { success: true, mapSeed: null, sessionPda: sessionPda.toBase58() };
    },
    [
      wallet.publicKey,
      signMessage,
      sessionManager,
      sessionSigner,
      connection,
      signAndSendTransactions,
      confirmSignatureWithTimeout,
      formatUnknownErrorMessage,
      refreshSessionList,
      waitForErSessionAccounts,
      setUseErForGameplay,
      resolveAndSetErEndpoint,
      waitForSessionSignerOnEr,
      setResolvedErEndpoint,
      directErConnection,
      getRoutedErConnectionForAccount,
      mapGenerator,
      ensureSessionDiscoveryInitialized,
      sendRoutedErTransaction,
      sendErInitTransactionWithRetry,
      fetchSessionGeneratedSeed,
      gameplayState,
      erConnection,
    ]
  );

  const overrideAndStartDuelGame = useCallback(
    async (onCommitted?: () => void): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      const duelNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
      const newNonce = duelNonces.duel + 1n;
      let duelSessionSigner: Keypair;
      if (sessionSigner.keypair) {
        duelSessionSigner = sessionSigner.keypair;
      } else {
        const duelSignature = await signMessage(buildGameWalletDerivationMessage());
        duelSessionSigner = deriveSessionSignerFromSignature(duelSignature);
      }
      const overrideDuelBalance = await connection.getBalance(duelSessionSigner.publicKey);
      const overrideDuelFunding = calculateRequiredFunding(overrideDuelBalance, SESSION_COST_DUEL);
      const sessionSignerResult = await sessionSigner.createWithoutFundingFromKeypair(
        duelSessionSigner,
        overrideDuelFunding
      );
      if (!sessionSignerResult) {
        return { success: false, error: 'Failed to create sessionSigner wallet' };
      }
      const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;

      const overrideTx = await sessionManager.buildOverrideDuelSessionTransaction();
      const sessionResult = await sessionManager.buildStartDuelSessionTransaction(
        newSessionSignerKeypair.publicKey,
        null,
        newNonce
      );
      if (!overrideTx || !sessionResult) {
        sessionSigner.resetState();
        return { success: false, error: 'Failed to build duel session transaction' };
      }

      const { transaction: sessionTransaction, sessionPda } = sessionResult;
      await clearFogState(sessionPda.toBase58()).catch(() => {});
      await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});
      vrfReadySessionsRef.current.delete(sessionPda.toBase58());

      const [gameStatePda] = getGameStatePda(sessionPda);
      const gameplayProgram = createGameplayStateProgram(connection);
      const enterDuelIx = await buildEnterDuelInstruction(
        gameplayProgram,
        wallet.publicKey,
        gameStatePda,
        sessionPda
      );
      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      const combinedTransaction = new Transaction();
      combinedTransaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
      combinedTransaction.add(...fundTransaction.instructions);
      combinedTransaction.add(...overrideTx.instructions);
      combinedTransaction.add(...sessionInstructions);
      combinedTransaction.add(enterDuelIx);
      const { blockhash: duelBh } = await connection.getLatestBlockhash('confirmed');
      combinedTransaction.recentBlockhash = duelBh;
      combinedTransaction.feePayer = wallet.publicKey ?? undefined;
      combinedTransaction.partialSign(newSessionSignerKeypair);

      let signature: string;
      try {
        signature = await signAndSendTransaction(combinedTransaction);
        await confirmSignatureWithTimeout(signature);
        onCommitted?.();
        await sessionSigner.markAsActive(newSessionSignerKeypair);
        await sessionSigner.associateWithSession(newSessionSignerKeypair, sessionPda.toBase58());
        await sessionManager.fetchSession();
        await refreshSessionList();
      } catch (txError: unknown) {
        return {
          success: false,
          error: txError instanceof Error ? txError.message : 'Duel session transaction failed',
        };
      }

      let duelQueued: { seed: bigint; slot: number } | undefined;
      const events = await parseDuelEvents(connection, gameplayProgram, signature);
      if (events.queued) {
        duelQueued = {
          seed: events.queued.seed,
          slot: events.queued.slot,
        };
      }

      // Init SessionDiscovery separately (skipped in combined TX)
      await ensureSessionDiscoveryInitialized(
        sessionPda,
        newSessionSignerKeypair,
        'overrideAndStartDuelGame'
      );

      // Assign duel map seed on base layer BEFORE delegation.
      try {
        console.log('[SessionContext] overrideAndStartDuelGame:assign_duel_map_seed (base)');
        const baseGameplayProg = createGameplayStateProgram(connection);
        const assignSeedTx = await buildAssignDuelMapSeedTransaction(
          baseGameplayProg,
          sessionPda,
          newSessionSignerKeypair.publicKey
        );
        await sendSessionSignerTransaction(connection, assignSeedTx, newSessionSignerKeypair);
        console.log('[SessionContext] overrideAndStartDuelGame:assign_duel_map_seed done');
      } catch (assignErr) {
        console.warn('[SessionContext] overrideAndStartDuelGame:assign_duel_map_seed failed:', assignErr instanceof Error ? assignErr.message : assignErr);
      }

      let duelVrfTypesToDelegate: ('poi' | 'map' | 'gameplay')[] = ['poi', 'map', 'gameplay'];
      const [poiVrfPda] = derivePoiVrfStatePda(sessionPda);
      const [mapVrfPda] = deriveMapVrfStatePda(sessionPda);
      const [gameplayVrfPda] = deriveGameplayVrfStatePda(sessionPda);
      const [poiVrfInfo, mapVrfInfo, gameplayVrfInfo] = await Promise.all([
        connection.getAccountInfo(poiVrfPda).catch(() => null),
        connection.getAccountInfo(mapVrfPda).catch(() => null),
        connection.getAccountInfo(gameplayVrfPda).catch(() => null),
      ]);

      const needsInit = { poi: !poiVrfInfo, map: !mapVrfInfo, gameplay: !gameplayVrfInfo };
      duelVrfTypesToDelegate = (['poi', 'map', 'gameplay'] as const).filter((type) => {
        const info = type === 'poi' ? poiVrfInfo : type === 'map' ? mapVrfInfo : gameplayVrfInfo;
        return !info || !info.owner.equals(DELEGATION_PROGRAM_ID);
      });

      if (needsInit.poi || needsInit.map || needsInit.gameplay) {
        try {
          const basePoiSysProg = createPoiSystemProgram(connection);
          const baseMapGenProg = createMapGeneratorProgram(connection);
          const baseGameplayProg = createGameplayStateProgram(connection);
          const initAllVrfTx = new Transaction();
          if (needsInit.poi) {
            const initPoiVrfTx = await buildInitPoiVrfStateTransaction(
              basePoiSysProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            initAllVrfTx.add(...initPoiVrfTx.instructions);
          }
          if (needsInit.map) {
            const initMapVrfTx = await buildInitMapVrfStateTransaction(
              baseMapGenProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            initAllVrfTx.add(...initMapVrfTx.instructions);
          }
          if (needsInit.gameplay) {
            const initGameplayVrfTx = await buildInitGameplayVrfStateTransaction(
              baseGameplayProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            initAllVrfTx.add(...initGameplayVrfTx.instructions);
          }
          await sendSessionSignerTransaction(connection, initAllVrfTx, newSessionSignerKeypair);
        } catch {}
      }

      // On localnet, request+fulfill VRF on base layer. The VRF state is NOT delegated —
      // the ER clones it from base in replica mode, avoiding VRF CPI on ER.
      if (duelVrfTypesToDelegate.length > 0) {
        const baseVrfResult = await requestBaseLayerVrf(
          sessionPda,
          newSessionSignerKeypair,
          duelVrfTypesToDelegate
        );
        if (!baseVrfResult.success) {
          return { success: false, error: baseVrfResult.error! };
        }
      }

      const delegateResult = await ensureDelegatedToRollup({
        sessionPda,
        onChainLevel: 20,
        sessionSignerKeypair: newSessionSignerKeypair,
        delegateVrf: SOLANA_CONFIG.isLocalValidator ? undefined : (duelVrfTypesToDelegate.length > 0 ? duelVrfTypesToDelegate : undefined),
        });
      if (!delegateResult.success) {
        return {
          success: false,
          error: delegateResult.error ?? 'Failed to delegate duel session to rollup',
        };
      }

      await waitForSessionSignerOnEr(newSessionSignerKeypair.publicKey);

      if (vrfReadySessionsRef.current.has(sessionPda.toBase58())) {
        console.log('[SessionContext] overrideAndStartDuelGame:all_vrf:already_fulfilled_on_base, skipping ER request');
      } else {
      try {
        const erPoiSysProg = createPoiSystemProgram(directErConnection);
        const erMapGenProg = createMapGeneratorProgram(directErConnection);
        const erGameplayProg = createGameplayStateProgram(directErConnection);
        const poiGameplayVrfTx = await buildRequestAndFulfillPoiAndGameplayVrfTransaction(
          { poiSystem: erPoiSysProg, gameplayState: erGameplayProg },
          sessionPda,
          newSessionSignerKeypair.publicKey,
          newSessionSignerKeypair.publicKey
        );
        const mapVrfIxs = await buildRequestAndFulfillMapVrfInstructions(
          erMapGenProg,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          newSessionSignerKeypair.publicKey
        );
        const allVrfTx = new Transaction();
        allVrfTx.add(...poiGameplayVrfTx.instructions);
        allVrfTx.add(...mapVrfIxs);
        await sendRoutedErTransaction(allVrfTx, newSessionSignerKeypair, [sessionPda]);

        const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
        const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
        const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
        const routedVrfConnection =
          (await getRoutedErConnectionForAccount(sessionPda)) ?? directErConnection;
        const [mapReady, poiReady, gameplayReady] = await Promise.all([
          waitForVrfFulfillment(routedVrfConnection, mapVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
          waitForVrfFulfillment(routedVrfConnection, poiVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
          waitForVrfFulfillment(routedVrfConnection, gameplayVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
        ]);
        if (!mapReady || !gameplayReady) {
          return {
            success: false,
            error: 'Randomness (VRF) not received from oracle — please try again',
          };
        }
        if (poiReady) {
          vrfReadySessionsRef.current.add(sessionPda.toBase58());
        }
      } catch (vrfError) {
        return {
          success: false,
          error:
            vrfError instanceof Error
              ? vrfError.message
              : 'Failed to initialize duel randomness on ER',
        };
      }
      } // end else (ER VRF)

      try {
          const erGameplayProgram = createGameplayStateProgram(directErConnection);
          const [overrideMapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
          const [overrideSessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
          const generateDuelMapTx = await buildGenerateDuelMapTransaction(
            erGameplayProgram,
            sessionPda,
            newSessionSignerKeypair.publicKey,
            {
              mapVrfStatePda: overrideMapVrfStatePda,
              sessionDiscoveryPda: overrideSessionDiscoveryPda,
            }
          );
          const mapWithBudgetTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
            ...generateDuelMapTx.instructions
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartDuelGame:generate_duel_map',
            mapWithBudgetTx,
            newSessionSignerKeypair,
            sessionPda
          );
          // Refresh MapPois BEFORE sync_map_enemies so that sync_map_enemies can
          // read the mole-den from MapPois and record it in SessionDiscovery.
          const erPoiSystemProgram = createPoiSystemProgram(directErConnection);
          const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
          const [mapPoisPda] = deriveMapPoisPda(sessionPda);
          const [duelGameStatePda] = deriveGameStatePda(sessionPda);
          const duelGeneratedSeed = (await fetchSessionGeneratedSeed(sessionPda)) ?? BigInt(20);
          const refreshMapPoisIx = await erPoiSystemProgram.methods
            .refreshMapPois(2, 1, new BN(duelGeneratedSeed.toString()))
            .accounts({
              mapPois: mapPoisPda,
              session: sessionPda,
              generatedMap: generatedMapPda,
              gameState: duelGameStatePda,
              sessionSigner: newSessionSignerKeypair.publicKey,
            })
            .instruction();
          const rebuildMapPoisTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
            refreshMapPoisIx
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartDuelGame:refresh_map_pois',
            rebuildMapPoisTx,
            newSessionSignerKeypair,
            sessionPda
          );

          const overrideSyncIx = await buildSyncMapEnemiesInstruction(
            erGameplayProgram,
            sessionPda,
            newSessionSignerKeypair.publicKey,
            { gameplayVrfStatePda: deriveGameplayVrfStatePda(sessionPda)[0] }
          );
          const syncWithBudgetTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
            overrideSyncIx
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartDuelGame:sync_map_enemies',
            syncWithBudgetTx,
            newSessionSignerKeypair,
            sessionPda
          );

          // Discover POIs near spawn so they appear immediately
          const discoverPoisIx = await buildDiscoverSpawnPoisInstruction(
            erPoiSystemProgram,
            sessionPda,
            newSessionSignerKeypair.publicKey,
            6 // SPAWN_VISION_RADIUS
          );
          const discoverPoisTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
            discoverPoisIx
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartDuelGame:discover_spawn_pois',
            discoverPoisTx,
            newSessionSignerKeypair,
            sessionPda
          );
      } catch (vrfError) {
        return {
          success: false,
          error:
            vrfError instanceof Error
              ? vrfError.message
              : 'Failed to generate duel map on ER',
        };
      }

      const generatedSeed = await fetchSessionGeneratedSeed(sessionPda);
      setMapSeed(null);
      gameplayState.setGameStatePda(gameStatePda);
      warmMovePlayerCaches(directErConnection, createGameplayStateProgram(directErConnection), sessionPda);
      return { success: true, mapSeed: null, duelQueued };
    },
    [
      wallet.publicKey,
      signMessage,
      sessionManager,
      sessionSigner,
      connection,
      signAndSendTransaction,
      confirmSignatureWithTimeout,
      refreshSessionList,
      directErConnection,
      ensureSessionDiscoveryInitialized,
      ensureDelegatedToRollup,
      fetchSessionGeneratedSeed,
      gameplayState,
      getRoutedErConnectionForAccount,
      sendRoutedErTransaction,
      sendErInitTransactionWithRetry,
      waitForSessionSignerOnEr,
    ]
  );

  const overrideAndStartGauntletGame = useCallback(
    async (onCommitted?: () => void): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      const gauntletNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
      const newNonce = gauntletNonces.gauntlet + 1n;
      let gauntletSessionSigner: Keypair;
      if (sessionSigner.keypair) {
        gauntletSessionSigner = sessionSigner.keypair;
      } else {
        const gauntletSignature = await signMessage(
          buildGameWalletDerivationMessage()
        );
        gauntletSessionSigner = deriveSessionSignerFromSignature(gauntletSignature);
      }
      const overrideGauntletBalance = await connection.getBalance(gauntletSessionSigner.publicKey);
      const overrideGauntletFunding = calculateRequiredFunding(overrideGauntletBalance, SESSION_COST_GAUNTLET);
      const sessionSignerResult = await sessionSigner.createWithoutFundingFromKeypair(
        gauntletSessionSigner,
        overrideGauntletFunding
      );
      if (!sessionSignerResult) {
        return { success: false, error: 'Failed to create sessionSigner wallet' };
      }
      const { keypair: newSessionSignerKeypair, fundTransaction } = sessionSignerResult;

      const overrideTx = await sessionManager.buildOverrideGauntletSessionTransaction();
      const sessionResult = await sessionManager.buildStartGauntletSessionTransaction(
        newSessionSignerKeypair.publicKey,
        null,
        newNonce
      );
      if (!overrideTx || !sessionResult) {
        sessionSigner.resetState();
        return { success: false, error: 'Failed to build gauntlet session transaction' };
      }

      const { transaction: sessionTransaction, sessionPda } = sessionResult;
      await clearFogState(sessionPda.toBase58()).catch(() => {});
      await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});
      vrfReadySessionsRef.current.delete(sessionPda.toBase58());

      await ensureLocalFeeAccounts(connection);
      const [gameStatePda] = getGameStatePda(sessionPda);
      const gameplayProgram = createGameplayStateProgram(connection);
      const [gauntletConfigPda] = deriveGauntletConfigPda();
      const gauntletConfig = await (
        gameplayProgram.account as {
          gauntletConfig: { fetch: (address: PublicKey) => Promise<{ currentEpochId: bigint | number }> };
        }
      ).gauntletConfig.fetch(gauntletConfigPda);
      const epochIdBigInt = BigInt(gauntletConfig.currentEpochId.toString());
      const epochIdBN = new BN(gauntletConfig.currentEpochId.toString());
      const enterGauntletIx = await buildEnterGauntletInstruction(
        gameplayProgram,
        wallet.publicKey,
        gameStatePda,
        sessionPda,
        epochIdBN,
        epochIdBigInt
      );

      const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
      const sessionInstructions = sessionTransaction.instructions.filter(
        (ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID
      );
      const combinedTransaction = new Transaction();
      combinedTransaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
      combinedTransaction.add(...fundTransaction.instructions);
      combinedTransaction.add(...overrideTx.instructions);
      combinedTransaction.add(...sessionInstructions);
      combinedTransaction.add(enterGauntletIx);
      const { blockhash: gauntletBh } = await connection.getLatestBlockhash('confirmed');
      combinedTransaction.recentBlockhash = gauntletBh;
      combinedTransaction.feePayer = wallet.publicKey ?? undefined;
      combinedTransaction.partialSign(newSessionSignerKeypair);

      try {
        const signature = await signAndSendTransaction(combinedTransaction);
        await confirmSignatureWithTimeout(signature);
        onCommitted?.();
        await sessionSigner.markAsActive(newSessionSignerKeypair);
        await sessionSigner.associateWithSession(newSessionSignerKeypair, sessionPda.toBase58());
        await sessionManager.fetchSession();
        await refreshSessionList();
      } catch (txError: unknown) {
        return {
          success: false,
          error:
            txError instanceof Error ? txError.message : 'Gauntlet session transaction failed',
        };
      }

      // Init SessionDiscovery separately (skipped in combined TX to fit under size limit)
      await ensureSessionDiscoveryInitialized(
        sessionPda,
        newSessionSignerKeypair,
        'overrideAndStartGauntletGame'
      );

      let vrfTypesToDelegate: ('poi' | 'map' | 'gameplay')[] = ['poi', 'map', 'gameplay'];
      const [poiVrfPda] = derivePoiVrfStatePda(sessionPda);
      const [mapVrfPda] = deriveMapVrfStatePda(sessionPda);
      const [gameplayVrfPda] = deriveGameplayVrfStatePda(sessionPda);
      const [poiVrfInfo, mapVrfInfo, gameplayVrfInfo] = await Promise.all([
        connection.getAccountInfo(poiVrfPda).catch(() => null),
        connection.getAccountInfo(mapVrfPda).catch(() => null),
        connection.getAccountInfo(gameplayVrfPda).catch(() => null),
      ]);

      const needsInit = { poi: !poiVrfInfo, map: !mapVrfInfo, gameplay: !gameplayVrfInfo };
      vrfTypesToDelegate = (['poi', 'map', 'gameplay'] as const).filter((type) => {
        const info = type === 'poi' ? poiVrfInfo : type === 'map' ? mapVrfInfo : gameplayVrfInfo;
        return !info || !info.owner.equals(DELEGATION_PROGRAM_ID);
      });

      if (needsInit.poi || needsInit.map || needsInit.gameplay) {
        try {
          const basePoiSysProg = createPoiSystemProgram(connection);
          const baseMapGenProg = createMapGeneratorProgram(connection);
          const baseGameplayProg = createGameplayStateProgram(connection);
          const initAllVrfTx = new Transaction();
          if (needsInit.poi) {
            const initPoiVrfTx = await buildInitPoiVrfStateTransaction(
              basePoiSysProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            initAllVrfTx.add(...initPoiVrfTx.instructions);
          }
          if (needsInit.map) {
            const initMapVrfTx = await buildInitMapVrfStateTransaction(
              baseMapGenProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            initAllVrfTx.add(...initMapVrfTx.instructions);
          }
          if (needsInit.gameplay) {
            const initGameplayVrfTx = await buildInitGameplayVrfStateTransaction(
              baseGameplayProg,
              sessionPda,
              newSessionSignerKeypair.publicKey
            );
            initAllVrfTx.add(...initGameplayVrfTx.instructions);
          }
          await sendSessionSignerTransaction(connection, initAllVrfTx, newSessionSignerKeypair);
        } catch {}
      }

      // On localnet, request+fulfill VRF on base layer. The VRF state is NOT delegated —
      // the ER clones it from base in replica mode, avoiding VRF CPI on ER.
      if (vrfTypesToDelegate.length > 0) {
        const baseVrfResult = await requestBaseLayerVrf(
          sessionPda,
          newSessionSignerKeypair,
          vrfTypesToDelegate
        );
        if (!baseVrfResult.success) {
          return { success: false, error: baseVrfResult.error! };
        }
      }

      const delegateResult = await ensureDelegatedToRollup({
        sessionPda,
        onChainLevel: 20,
        sessionSignerKeypair: newSessionSignerKeypair,
        delegateVrf: SOLANA_CONFIG.isLocalValidator ? undefined : (vrfTypesToDelegate.length > 0 ? vrfTypesToDelegate : undefined),
      });
      if (!delegateResult.success) {
        return {
          success: false,
          error: delegateResult.error ?? 'Failed to delegate session to rollup',
        };
      }

      await waitForSessionSignerOnEr(newSessionSignerKeypair.publicKey);

      if (vrfReadySessionsRef.current.has(sessionPda.toBase58())) {
        console.log('[SessionContext] overrideAndStartGauntletGame:all_vrf:already_fulfilled_on_base, skipping ER request');
      } else {
      try {
        const erPoiSysProg = createPoiSystemProgram(directErConnection);
        const erMapGenProg = createMapGeneratorProgram(directErConnection);
        const erGameplayProg = createGameplayStateProgram(directErConnection);
        const poiGameplayVrfTx = await buildRequestAndFulfillPoiAndGameplayVrfTransaction(
          { poiSystem: erPoiSysProg, gameplayState: erGameplayProg },
          sessionPda,
          newSessionSignerKeypair.publicKey,
          newSessionSignerKeypair.publicKey
        );
        const mapVrfIxs = await buildRequestAndFulfillMapVrfInstructions(
          erMapGenProg,
          sessionPda,
          newSessionSignerKeypair.publicKey,
          newSessionSignerKeypair.publicKey
        );
        const allVrfTx = new Transaction();
        allVrfTx.add(...poiGameplayVrfTx.instructions);
        allVrfTx.add(...mapVrfIxs);
        await sendRoutedErTransaction(allVrfTx, newSessionSignerKeypair, [sessionPda]);

        const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
        const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
        const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
        const routedVrfConnection =
          (await getRoutedErConnectionForAccount(sessionPda)) ?? directErConnection;
        const [mapReady, poiReady, gameplayReady] = await Promise.all([
          waitForVrfFulfillment(routedVrfConnection, mapVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
          waitForVrfFulfillment(routedVrfConnection, poiVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
          waitForVrfFulfillment(routedVrfConnection, gameplayVrfStatePda, ER_VRF_WAIT_TIMEOUT_MS),
        ]);
        if (!mapReady || !gameplayReady) {
          return {
            success: false,
            error: 'Randomness (VRF) not received from oracle — please try again',
          };
        }
        if (poiReady) {
          vrfReadySessionsRef.current.add(sessionPda.toBase58());
        }
      } catch (vrfError) {
        return {
          success: false,
          error:
            vrfError instanceof Error
              ? vrfError.message
              : 'Failed to initialize gauntlet randomness on ER',
        };
      }
      } // end else (ER VRF)

      // Draw gauntlet echoes using VRF on ER
      {
        const erGameplayProgramForRedraw = createGameplayStateProgram(directErConnection);
        const redrawIx = await buildRedrawGauntletEchoesInstruction(
          erGameplayProgramForRedraw, sessionPda, newSessionSignerKeypair.publicKey
        );
        const redrawTx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          redrawIx
        );
        await sendErInitTransactionWithRetry(
          'overrideAndStartGauntletGame:draw_echoes',
          redrawTx,
          newSessionSignerKeypair,
          sessionPda
        );
        console.log('[SessionContext] overrideAndStartGauntletGame:echoes_drawn_with_vrf');
      }

      try {
          const erMapGenProgram = createMapGeneratorProgram(directErConnection);
          const erGameplayProgram = createGameplayStateProgram(directErConnection);
          const localMapSeed = SOLANA_CONFIG.isLocalValidator
            ? await readMapVrfSeedFromBase(sessionPda)
            : undefined;
          const [gauntletEchoesPdaOverride] = deriveGauntletEchoesPda(sessionPda);
          const { mapTx, syncTx } = await buildMapAndSyncTransaction(
            SOLANA_CONFIG.isLocalValidator ? 'seed' : 'vrf',
            erMapGenProgram,
            erGameplayProgram,
            sessionPda,
            newSessionSignerKeypair.publicKey,
            { campaignLevel: 20, seed: localMapSeed, gameplayVrfStatePda: deriveGameplayVrfStatePda(sessionPda)[0] }
          );
          const mapWithBudgetTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
            ...mapTx.instructions
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartGauntletGame:fill_map',
            mapWithBudgetTx,
            newSessionSignerKeypair,
            sessionPda
          );
          // Refresh MapPois BEFORE sync_map_enemies so that sync_map_enemies can
          // read the mole-den from MapPois and record it in SessionDiscovery.
          const erPoiSystemProgram = createPoiSystemProgram(directErConnection);
          const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
          const [mapPoisPda] = deriveMapPoisPda(sessionPda);
          const [gauntletGameStatePda] = deriveGameStatePda(sessionPda);
          const gauntletGeneratedSeed =
            (await fetchSessionGeneratedSeed(sessionPda)) ?? BigInt(20);
          const refreshMapPoisIx = await erPoiSystemProgram.methods
            .refreshMapPois(2, 1, new BN(gauntletGeneratedSeed.toString()))
            .accounts({
              mapPois: mapPoisPda,
              session: sessionPda,
              generatedMap: generatedMapPda,
              gameState: gauntletGameStatePda,
              sessionSigner: newSessionSignerKeypair.publicKey,
            })
            .instruction();
          const rebuildMapPoisTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
            refreshMapPoisIx
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartGauntletGame:refresh_map_pois',
            rebuildMapPoisTx,
            newSessionSignerKeypair,
            sessionPda
          );

          const syncWithBudgetTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
            ...syncTx.instructions
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartGauntletGame:sync_map_enemies',
            syncWithBudgetTx,
            newSessionSignerKeypair,
            sessionPda
          );

          // Discover POIs near spawn so they appear immediately
          const discoverPoisIx = await buildDiscoverSpawnPoisInstruction(
            erPoiSystemProgram,
            sessionPda,
            newSessionSignerKeypair.publicKey,
            6 // SPAWN_VISION_RADIUS
          );
          const discoverPoisTx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
            discoverPoisIx
          );
          await sendErInitTransactionWithRetry(
            'overrideAndStartGauntletGame:discover_spawn_pois',
            discoverPoisTx,
            newSessionSignerKeypair,
            sessionPda
          );

          // Re-run sync_map_enemies WITH GauntletEchoes to write echo preview to SessionDiscovery
          try {
            const geInfo = await directErConnection.getAccountInfo(gauntletEchoesPdaOverride, 'processed').catch(() => null);
            if (geInfo) {
              const echoSyncIx = await buildSyncMapEnemiesInstruction(
                erGameplayProgram, sessionPda, newSessionSignerKeypair.publicKey,
                { gauntletEchoesPda: gauntletEchoesPdaOverride }
              );
              const echoSyncTx = new Transaction().add(
                ComputeBudgetProgram.setComputeUnitLimit({ units: ER_SYNC_MAP_ENEMIES_CU_LIMIT }),
                echoSyncIx
              );
              await sendErInitTransactionWithRetry(
                'overrideAndStartGauntletGame:sync_echo',
                echoSyncTx,
                newSessionSignerKeypair,
                sessionPda
              );
            } else {
              console.warn('[SessionContext] overrideAndStartGauntletGame: GauntletEchoes still not on ER');
            }
          } catch (echoErr) {
            console.warn('[SessionContext] overrideAndStartGauntletGame:echo_sync_failed (non-fatal):', echoErr instanceof Error ? echoErr.message : echoErr);
          }
      } catch (vrfError) {
        return {
          success: false,
          error:
            vrfError instanceof Error
              ? vrfError.message
              : 'Failed to initialize gauntlet randomness on ER',
        };
      }

      const generatedSeed = await fetchSessionGeneratedSeed(sessionPda);
      setMapSeed(null);
      gameplayState.setGameStatePda(gameStatePda);
      warmMovePlayerCaches(directErConnection, createGameplayStateProgram(directErConnection), sessionPda);
      return { success: true, mapSeed: null };
    },
    [
      wallet.publicKey,
      signMessage,
      sessionManager,
      sessionSigner,
      connection,
      signAndSendTransaction,
      confirmSignatureWithTimeout,
      refreshSessionList,
      directErConnection,
      ensureSessionDiscoveryInitialized,
      ensureDelegatedToRollup,
      fetchSessionGeneratedSeed,
      gameplayState,
      getRoutedErConnectionForAccount,
      sendRoutedErTransaction,
      sendErInitTransactionWithRetry,
      waitForSessionSignerOnEr,
    ]
  );

  /**
   * Switch to a different active session.
   */
  const switchToSessionFn = useCallback(
    async (
      sessionPda: string,
      options?: { requirePoiVrfReady?: boolean }
    ): Promise<TransactionResult> => {
      if (!wallet.publicKey || !connection) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        const sessionPubkey = new PublicKey(sessionPda);
        // Infer on-chain level from PDA so SessionManager fetch targets the right session.
        const switchNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
        let onChainLevel: number | null = null;
        for (let level = 1; level <= 40; level++) {
          const [candidate] = deriveSessionPda(wallet.publicKey, level, switchNonces.campaign);
          if (candidate.equals(sessionPubkey)) {
            onChainLevel = level;
            break;
          }
        }
        if (onChainLevel === null) {
          const [duelSessionPda] = deriveDuelSessionPda(wallet.publicKey, switchNonces.duel);
          const [gauntletSessionPda] = deriveGauntletSessionPda(wallet.publicKey, switchNonces.gauntlet);
          if (duelSessionPda.equals(sessionPubkey) || gauntletSessionPda.equals(sessionPubkey)) {
            onChainLevel = 20;
          }
        }
        sessionManager.setActiveSessionPda(sessionPubkey);
        if (onChainLevel !== null) {
          sessionManager.setActiveOnChainLevel(onChainLevel);
        }

        // Load the session signer keypair for the target session.
        // Each session has its own keypair — using the wrong one causes Unauthorized (6009).
        let resolvedSessionSigner =
          (walletId ? await loadSessionSignerForSession(walletId, sessionPda) : null) ??
          sessionSigner.keypair;
        if (!resolvedSessionSigner) {
          const recovered = await sessionSigner.checkPendingSession();
          resolvedSessionSigner = recovered ? sessionSigner.keypair : null;
        }
        if (!resolvedSessionSigner) {
          resolvedSessionSigner = await recoverDeterministicSessionSigner(sessionPubkey);
        } else {
          await sessionSigner.associateWithSession(resolvedSessionSigner, sessionPda);
        }
        if (!resolvedSessionSigner) {
          return {
            success: false,
            error: 'Session key signer not available. Please reconnect your wallet.',
          };
        }

        // Get the session's game state PDA and set it
        const [gameStatePda] = getGameStatePda(sessionPubkey);
        gameplayState.setGameStatePda(gameStatePda);

        // Fetch map seed directly from this session's generated map account.
        const seed = await fetchSessionGeneratedSeed(sessionPubkey);
        setMapSeed(seed);

        // Refresh the session manager to point to this session
        await sessionManager.fetchSession();

        const delegateResult = await ensureDelegatedToRollup({
          sessionPda: sessionPubkey,
          onChainLevel: onChainLevel ?? undefined,
          sessionSignerKeypair: resolvedSessionSigner,
        });
        if (!delegateResult.success) {
          const delegatedOnBase = await isSessionFullyDelegatedOnBase(sessionPubkey);
          if (delegatedOnBase) {
            const erReady = await waitForErSessionAccounts(sessionPubkey);
            if (!erReady) {
              return {
                success: false,
                error:
                  'Delegation not fully propagated to ER yet. Please retry in a moment.',
              };
            }
            await resolveAndSetErEndpoint(sessionPubkey);
            setUseErForGameplay(true);
            console.warn(
              '[SessionContext] switchToSession: delegation tx failed but session accounts are delegated; continuing in ER mode',
              delegateResult.error
            );
          } else {
            return {
              success: false,
              error: delegateResult.error ?? 'Failed to delegate session to rollup',
            };
          }
        }

        // Refresh session list to update last played time
        await refreshSessionList();

        const requirePoiVrfReady = options?.requirePoiVrfReady ?? true;
        if (requirePoiVrfReady) {
          const vrfReady = await ensureSessionVrfReady(sessionPda);
          if (!vrfReady.success) {
            return vrfReady;
          }
        }

        console.log(
          '[SessionContext] Switched to session:',
          sessionPda,
          'onChainLevel:',
          onChainLevel
        );
        return { success: true };
      } catch (error) {
        console.error('[SessionContext] Failed to switch session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to switch session',
        };
      }
    },
    [
      sessionSigner,
      connection,
      fetchSessionGeneratedSeed,
      gameplayState,
      sessionManager,
      ensureDelegatedToRollup,
      isSessionFullyDelegatedOnBase,
      wallet.publicKey,
      refreshSessionList,
      ensureSessionVrfReady,
      setUseErForGameplay,
      waitForErSessionAccounts,
    ]
  );

  // Derive current level from session
  const currentLevel = sessionManager.session?.campaignLevel ?? null;

  // Use the active session PDA from session manager (handles campaign/duel/gauntlet correctly)
  const activeSessionPda = sessionManager.activeSessionPda ?? null;

  // Compute session key (base58 string) for persistence
  const sessionKey = useMemo(() => {
    return activeSessionPda?.toBase58() ?? null;
  }, [activeSessionPda]);

  /**
   * Queue session cleanup for deferred processing.
   * This returns immediately without requiring any signatures,
   * allowing instant navigation after combat ends.
   */
  const queueEndGame = useCallback(
    async (levelReached: number, isVictory: boolean): Promise<void> => {
      if (!walletId) {
        console.warn('[SessionContext] Cannot queue cleanup: no wallet address');
        return;
      }

      const campaignLevel = sessionManager.session?.campaignLevel ?? 0;

      // Detect session type by comparing active PDA against known duel/gauntlet PDAs
      let sessionType: 'campaign' | 'duel' | 'gauntlet' = 'campaign';
      if (wallet.publicKey && sessionManager.activeSessionPda) {
        const queueNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
        const [duelPda] = deriveDuelSessionPda(wallet.publicKey, queueNonces.duel);
        const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey, queueNonces.gauntlet);
        if (sessionManager.activeSessionPda.equals(duelPda)) {
          sessionType = 'duel';
        } else if (sessionManager.activeSessionPda.equals(gauntletPda)) {
          sessionType = 'gauntlet';
        }
      }

      console.log('[SessionContext] Queueing deferred cleanup:', {
        walletAddress: walletId,
        campaignLevel,
        levelReached,
        isVictory,
        sessionType,
      });

      await queueCleanup({
        walletAddress: walletId,
        campaignLevel,
        levelReached,
        isVictory,
        needsSessionEnd: sessionManager.hasActiveSession,
        needsResultRecord: true,
        sessionType,
      });

      setHasPendingCleanupsState(true);

      // Clear local session state immediately for better UX
      // The actual on-chain cleanup will happen later
      setMapSeed(null);

      // Clear fog state and broken walls for this session (and duel/gauntlet variants)
      // This ensures next playthrough starts fresh
      if (wallet.publicKey) {
        const fogNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);
        const pdaKeys: string[] = [];
        if (campaignLevel > 0) {
          const [campPda] = deriveSessionPda(wallet.publicKey, campaignLevel, fogNonces.campaign);
          pdaKeys.push(campPda.toBase58());
        }
        const [duelPda] = deriveDuelSessionPda(wallet.publicKey, fogNonces.duel);
        pdaKeys.push(duelPda.toBase58());
        const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey, fogNonces.gauntlet);
        pdaKeys.push(gauntletPda.toBase58());
        for (const key of pdaKeys) {
          await clearFogState(key).catch(() => {});
          await clearBrokenWalls(key).catch(() => {});
        }
        console.log('[SessionContext] Fog and broken walls cleared for session PDAs');
      }

      // Keep sessionSigner persisted so deferred cleanup can undelegate/end on next app launch.
      setUseErForGameplay(false);

      console.log('[SessionContext] Cleanup queued, local state cleared');
    },
    [
      walletId,
      wallet.publicKey,
      sessionManager.session?.campaignLevel,
      sessionManager.hasActiveSession,
      sessionManager.activeSessionPda,
      sessionSigner,
      setUseErForGameplay,
    ]
  );

  /**
   * Process pending cleanup tasks.
   * This attempts to end sessions and record results for any queued cleanups.
   */
  const processPendingCleanups = useCallback(async (): Promise<void> => {
    if (cleanupProcessingRef.current) {
      console.log('[SessionContext] processPendingCleanups:skip_already_running');
      return;
    }
    cleanupProcessingRef.current = true;
    let resolveCleanupGate: (() => void) | null = null;
    let cleanupGate: Promise<TransactionResult> | null = null;

    console.log('[SessionContext] processPendingCleanups:start', {
      walletId,
      hasWalletPubkey: !!wallet.publicKey,
      hasConnection: !!connection,
    });
    try {
      if (!walletId || !wallet.publicKey || !connection) {
        console.log('[SessionContext] processPendingCleanups:early_return:no_wallet_or_connection');
        return;
      }

      let pending = await getPendingCleanups(walletId);
      console.log('[SessionContext] processPendingCleanups:initial_pending_count', pending.length);

      let fullQueue = await loadCleanupQueue();
      const existingCleanupLevels = new Set(
        fullQueue.items
          .filter((item) => item.walletAddress === walletId)
          .map((item) => item.campaignLevel)
      );
      const staleFinishedQueuedLevels = new Set<number>();

      // Fetch session nonces once for all PDA derivations in this cleanup pass
      const cleanupNonces = await sessionManager.fetchSessionNonces(wallet.publicKey);

      // Discover finished sessions that were never queued (e.g. app navigated away/crashed
      // before queueEndGame ran) and enqueue them for background cleanup.
      try {
        const sessionProgram = createSessionManagerProgram(connection);
        const gameplayProgramBase = createGameplayStateProgram(connection);
        const gameplayProgramEr = createGameplayStateProgram(gameplayConnection);
        const sessions = await fetchSessionList(
          connection,
          sessionProgram,
          gameplayProgramBase,
          wallet.publicKey,
          { campaign: cleanupNonces.campaign, duel: cleanupNonces.duel, gauntlet: cleanupNonces.gauntlet }
        );
        console.log('[SessionContext] processPendingCleanups:session_scan_count', sessions.length);

        for (const sessionInfo of sessions) {
          try {
            const sessionPda = new PublicKey(sessionInfo.sessionPda);
            const [gameStatePda] = getGameStatePda(sessionPda);

            const sessionInfoOnBase = await connection.getAccountInfo(sessionPda, 'processed');
            const delegatedOnBase = !!sessionInfoOnBase?.owner.equals(DELEGATION_PROGRAM_ID);

            // If delegated, prefer ER state first (base can be stale during/after ER gameplay).
            const primaryState = delegatedOnBase
              ? await fetchGameState(gameplayProgramEr, gameStatePda)
              : await fetchGameState(gameplayProgramBase, gameStatePda);
            const secondaryState = primaryState
              ? null
              : delegatedOnBase
                ? await fetchGameState(gameplayProgramBase, gameStatePda)
                : await fetchGameState(gameplayProgramEr, gameStatePda);
            const state = primaryState ?? secondaryState;
            if (!state) {
              if (delegatedOnBase) {
                console.log(
                  '[SessionContext] processPendingCleanups:skip_session_no_decodable_gamestate',
                  sessionInfo.sessionPda
                );
                continue;
              }
              // Session is on base layer but game state is unreadable — abandoned session.
              const abandonedLevel = sessionInfo.level + 1;
              if (!existingCleanupLevels.has(abandonedLevel)) {
                await queueCleanup({
                  walletAddress: walletId,
                  campaignLevel: abandonedLevel,
                  levelReached: abandonedLevel,
                  isVictory: false,
                  needsSessionEnd: true,
                  needsResultRecord: false,
                });
                console.log(
                  '[SessionContext] processPendingCleanups:queued_abandoned_no_gamestate',
                  { sessionPda: sessionInfo.sessionPda, campaignLevel: abandonedLevel }
                );
                existingCleanupLevels.add(abandonedLevel);
              }
              continue;
            }

            const hpIsZeroOrBelow = typeof state.hp === 'number' && state.hp <= 0;
            const isDead = Boolean(state.isDead || hpIsZeroOrBelow);
            const completed = Boolean(state.completed);
            const campaignLevel = sessionInfo.level + 1;
            console.log('[SessionContext] processPendingCleanups:session_status', {
              sessionPda: sessionInfo.sessionPda,
              campaignLevel,
              isDead,
              completed,
              hp: state.hp,
              alreadyQueued: existingCleanupLevels.has(campaignLevel),
              delegatedOnBase,
              stateSource: delegatedOnBase
                ? primaryState
                  ? 'er'
                  : 'base_fallback'
                : primaryState
                  ? 'base'
                  : 'er_fallback',
            });

            if (!isDead && !completed) {
              if (delegatedOnBase) {
                continue; // Session delegated to ER — might be active gameplay
              }
              // Non-terminal session on base layer = abandoned. Will be cleaned up as defeat.
              console.log(
                '[SessionContext] processPendingCleanups:queueing_abandoned_base_session',
                { sessionPda: sessionInfo.sessionPda, campaignLevel, hp: state.hp }
              );
            }

            if (existingCleanupLevels.has(campaignLevel)) {
              staleFinishedQueuedLevels.add(campaignLevel);
              continue;
            }

            await queueCleanup({
              walletAddress: walletId,
              campaignLevel,
              levelReached: campaignLevel,
              isVictory: completed && !isDead,
              needsSessionEnd: true,
              needsResultRecord: true,
            });
            console.log('[SessionContext] processPendingCleanups:queued_stale_finished_session', {
              sessionPda: sessionInfo.sessionPda,
              campaignLevel,
            });
            existingCleanupLevels.add(campaignLevel);
          } catch (sessionScanErr) {
            console.warn('[SessionContext] processPendingCleanups:scan_one_session_failed', {
              sessionPda: sessionInfo.sessionPda,
              error: sessionScanErr,
            });
          }
        }

        // Scan duel and gauntlet session PDAs for stale finished sessions.
        // fetchSessionList now includes duel/gauntlet, but this extra scan
        // provides additional cleanup logic (delegation-aware ER state check).
        const extraPdas: Array<{
          pda: PublicKey;
          sessionType: 'duel' | 'gauntlet';
          sentinel: number;
        }> = [
          { pda: deriveDuelSessionPda(wallet.publicKey, cleanupNonces.duel)[0], sessionType: 'duel', sentinel: 100 },
          {
            pda: deriveGauntletSessionPda(wallet.publicKey, cleanupNonces.gauntlet)[0],
            sessionType: 'gauntlet',
            sentinel: 200,
          },
        ];

        for (const { pda, sessionType, sentinel } of extraPdas) {
          try {
            const accountInfo = await connection.getAccountInfo(pda, 'processed');
            if (!accountInfo) {
              console.log('[SessionContext] processPendingCleanups:pvp_scan_no_account', {
                sessionType,
                pda: pda.toBase58(),
              });
              continue;
            }

            const [gameStatePda] = getGameStatePda(pda);
            const delegatedOnBase = !!accountInfo.owner.equals(DELEGATION_PROGRAM_ID);

            // Prefer ER state when session is delegated (ER is more up-to-date during gameplay)
            const primaryState = delegatedOnBase
              ? await fetchGameState(gameplayProgramEr, gameStatePda)
              : await fetchGameState(gameplayProgramBase, gameStatePda);
            const state =
              primaryState ??
              (delegatedOnBase
                ? await fetchGameState(gameplayProgramBase, gameStatePda)
                : await fetchGameState(gameplayProgramEr, gameStatePda));

            if (!state) {
              console.log('[SessionContext] processPendingCleanups:pvp_scan_no_gamestate', {
                sessionType,
                pda: pda.toBase58(),
                delegatedOnBase,
              });
              continue;
            }

            const isDead = Boolean(state.isDead || (typeof state.hp === 'number' && state.hp <= 0));
            const completed = Boolean(state.completed);
            console.log('[SessionContext] processPendingCleanups:pvp_scan_status', {
              sessionType,
              pda: pda.toBase58(),
              isDead,
              completed,
              hp: state.hp,
              delegatedOnBase,
              alreadyQueued: existingCleanupLevels.has(sentinel),
            });
            if (!isDead && !completed) continue;

            if (existingCleanupLevels.has(sentinel)) {
              staleFinishedQueuedLevels.add(sentinel);
              continue;
            }

            await queueCleanup({
              walletAddress: walletId,
              campaignLevel: sentinel,
              levelReached: sentinel,
              isVictory: completed && !isDead,
              needsSessionEnd: true,
              needsResultRecord: true,
              sessionType,
            });
            console.log('[SessionContext] processPendingCleanups:queued_stale_finished_session', {
              sessionType,
              sentinel,
            });
            existingCleanupLevels.add(sentinel);
          } catch (err) {
            console.warn(`[SessionContext] processPendingCleanups:scan_${sessionType}_failed`, err);
          }
        }

        pending = await getPendingCleanups(walletId);
        if (pending.length === 0 && staleFinishedQueuedLevels.size > 0) {
          fullQueue = await loadCleanupQueue();
          const walletQueueItems = fullQueue.items.filter(
            (item) => item.walletAddress === walletId
          );
          let revivedCount = 0;
          for (const level of staleFinishedQueuedLevels) {
            const queuedForLevel = walletQueueItems.find(
              (item) => item.campaignLevel === level && item.needsSessionEnd
            );
            if (!queuedForLevel || queuedForLevel.retryCount < 3) {
              continue;
            }
            // Cap revivals to prevent infinite retry loops for truly stuck sessions
            // (e.g., ER unresponsive, accounts permanently delegated).
            const currentRevivalCount = queuedForLevel.revivalCount ?? 0;
            if (currentRevivalCount >= 2) {
              console.warn('[SessionContext] processPendingCleanups:skip_revival_max_reached', {
                cleanupId: queuedForLevel.id,
                campaignLevel: level,
                revivalCount: currentRevivalCount,
              });
              continue;
            }
            await updateCleanup(queuedForLevel.id, {
              retryCount: 0,
              revivalCount: currentRevivalCount + 1,
            });
            revivedCount += 1;
            console.log('[SessionContext] processPendingCleanups:revived_exhausted_cleanup', {
              cleanupId: queuedForLevel.id,
              campaignLevel: level,
              revivalCount: currentRevivalCount + 1,
            });
          }
          if (revivedCount > 0) {
            pending = await getPendingCleanups(walletId);
          }
        }
        console.log('[SessionContext] processPendingCleanups:pending_after_scan', pending.length);
      } catch (scanError) {
        console.warn('[SessionContext] Failed to scan for stale finished sessions:', scanError);
      }

      if (pending.length === 0) {
        setHasPendingCleanupsState(false);
        await refreshSessionList().catch((err) =>
          console.warn('[SessionContext] processPendingCleanups:refreshSessionList failed:', err)
        );
        console.log('[SessionContext] processPendingCleanups:done_no_pending');
        return;
      }

      console.log('[SessionContext] Processing pending cleanups:', pending.length);

      // Track cleanup so new session starts wait for it to finish.
      cleanupGate = new Promise<TransactionResult>((resolve) => {
        resolveCleanupGate = () => resolve({ success: true });
      });
      if (!pendingTeardownRef.current) {
        pendingTeardownRef.current = cleanupGate;
      }

      for (const cleanup of pending) {
        try {
          let allComplete = true;
          const isRecoverableDelegationError = (errorText: string): boolean =>
            errorText.includes('InvalidAccountOwner') ||
            errorText.includes('InvalidWritableAccount');

          if (cleanup.needsSessionEnd) {
            // Derive correct PDA based on session type (using current nonces)
            const sessionPda =
              cleanup.sessionType === 'duel'
                ? deriveDuelSessionPda(wallet.publicKey, cleanupNonces.duel)[0]
                : cleanup.sessionType === 'gauntlet'
                  ? deriveGauntletSessionPda(wallet.publicKey, cleanupNonces.gauntlet)[0]
                  : deriveSessionPda(wallet.publicKey, cleanup.campaignLevel, cleanupNonces.campaign)[0];
            sessionManager.setActiveOnChainLevel(cleanup.campaignLevel);
            sessionManager.setActiveSessionPda(sessionPda);

            await sessionManager.fetchSession();
            const expectedSessionSigner = sessionManager.session?.sessionSigner ?? null;
            const cleanupSigner = await resolveSessionSignerForSession(
              sessionPda,
              expectedSessionSigner
            );

            if (!cleanupSigner) {
              // Session signer is lost — increment retry and drop after 3 attempts.
              // Without the signer we can never end the session via deferred cleanup;
              // the user must use the wallet-signed override flow instead.
              const retryCount = await incrementRetryCount(cleanup.id);
              if (retryCount >= 3) {
                console.warn(
                  '[SessionContext] Deferred cleanup: dropping — session signer permanently lost',
                  { cleanupId: cleanup.id, retryCount }
                );
                await removeCleanup(cleanup.id);
                continue;
              }
              allComplete = false;
              console.warn(
                '[SessionContext] Deferred cleanup waiting for matching session signer:',
                {
                  cleanupId: cleanup.id,
                  expectedSessionSigner: expectedSessionSigner?.toBase58() ?? null,
                  retryCount,
                }
              );
            } else {
              const sessionAccount = await connection.getAccountInfo(sessionPda, 'processed');
              if (!sessionAccount) {
                console.log('[SessionContext] Deferred cleanup: session already closed on-chain', {
                  cleanupId: cleanup.id,
                  campaignLevel: cleanup.campaignLevel,
                });
                await removeCleanup(cleanup.id);
                continue;
              }

              const ownerIsDelegationProgram = sessionAccount.owner.equals(DELEGATION_PROGRAM_ID);
              const ownerIsSessionProgram = sessionAccount.owner.equals(
                SOLANA_CONFIG.programs.sessionManager
              );

              console.log('[SessionContext] Deferred cleanup: owner check', {
                cleanupId: cleanup.id,
                sessionPda: sessionPda.toBase58(),
                owner: sessionAccount.owner.toBase58(),
                ownerIsDelegationProgram,
                ownerIsSessionProgram,
              });

              if (ownerIsDelegationProgram) {
                const [gameStatePda] = getGameStatePda(sessionPda);
                const gameStateInfo = await connection.getAccountInfo(gameStatePda, 'processed');
                const gameStateOwner = gameStateInfo?.owner ?? null;
                const gameStateOwnerSupported = !!(
                  gameStateOwner &&
                  (gameStateOwner.equals(SOLANA_CONFIG.programs.gameplayState) ||
                    gameStateOwner.equals(DELEGATION_PROGRAM_ID))
                );
                if (!gameStateOwnerSupported) {
                  console.warn(
                    '[SessionContext] Deferred cleanup: dropping legacy incompatible cleanup',
                    {
                      cleanupId: cleanup.id,
                      sessionPda: sessionPda.toBase58(),
                      gameStatePda: gameStatePda.toBase58(),
                      gameStateOwner: gameStateOwner?.toBase58() ?? null,
                    }
                  );
                  await removeCleanup(cleanup.id);
                  continue;
                }

                const undelegateResult = await sessionManager.undelegateSession(
                  getFallbackStateHash(),
                  cleanupSigner
                );
                if (!undelegateResult.success) {
                  const undelegateError = undelegateResult.error ?? 'Deferred undelegate failed';
                  if (!isRecoverableDelegationError(undelegateError)) {
                    throw new Error(undelegateError);
                  }
                  // Recoverable delegation error — accounts may already be partially
                  // restored from a previous attempt.  The owner wait loop below will
                  // verify all accounts before we call endSession.
                  console.log(
                    '[SessionContext] Deferred cleanup: undelegate returned recoverable error; will verify account owners',
                    { cleanupId: cleanup.id, undelegateError }
                  );
                }

                // Wait for ALL account owners to be restored, not just the session PDA.
                // After ER undelegation, base-layer accounts may take time to propagate.
                const [gsP] = getGameStatePda(sessionPda);
                const [gmP] = deriveGeneratedMapPda(sessionPda);
                const [mpP] = deriveMapPoisPda(sessionPda);
                const [invP] = deriveInventoryPda(sessionPda);
                const expectedOwners: Array<[PublicKey, PublicKey, string]> = [
                  [sessionPda, SOLANA_CONFIG.programs.sessionManager, 'session'],
                  [gsP, SOLANA_CONFIG.programs.gameplayState, 'gameState'],
                  [gmP, SOLANA_CONFIG.programs.mapGenerator, 'generatedMap'],
                  [mpP, SOLANA_CONFIG.programs.poiSystem, 'mapPois'],
                  [invP, SOLANA_CONFIG.programs.playerInventory, 'inventory'],
                ];
                // This is a background operation so we can afford to wait longer
                // (60 * 1s = 60s) for the ER commit to propagate to base layer.
                let allRestored = false;
                for (let i = 0; i < 60; i += 1) {
                  const infos = await Promise.all(
                    expectedOwners.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
                  );
                  allRestored = infos.every((info, idx) =>
                    info?.owner.equals(expectedOwners[idx][1])
                  );
                  if (allRestored) break;
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
                if (!allRestored) {
                  const latestSessionInfo = await connection.getAccountInfo(
                    sessionPda,
                    'processed'
                  );
                  if (latestSessionInfo?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
                    console.warn(
                      '[SessionContext] Deferred cleanup: owner restore timed out; trying forceCloseSession fallback',
                      { cleanupId: cleanup.id }
                    );
                    const forceCloseResult = await sessionManager.forceCloseSession(cleanupSigner);
                    if (forceCloseResult.success) {
                      await updateCleanup(cleanup.id, { needsSessionEnd: false });
                      cleanup.needsSessionEnd = false;
                      await removeCleanup(cleanup.id);
                      continue;
                    }
                    console.warn(
                      '[SessionContext] forceCloseSession failed; trying closeSessionOnly last-resort'
                    );
                    const closeOnlyResult = await sessionManager.closeSessionOnly(cleanupSigner);
                    if (closeOnlyResult.success) {
                      await updateCleanup(cleanup.id, { needsSessionEnd: false });
                      cleanup.needsSessionEnd = false;
                      await removeCleanup(cleanup.id);
                      continue;
                    }
                  }
                  throw new Error('Deferred undelegate did not restore all account owners in time');
                }
              } else if (!ownerIsSessionProgram) {
                console.warn(
                  '[SessionContext] Deferred cleanup: unexpected session owner, dropping cleanup',
                  {
                    cleanupId: cleanup.id,
                    owner: sessionAccount.owner.toBase58(),
                  }
                );
                await removeCleanup(cleanup.id);
                continue;
              } else {
                // Session PDA is owned by session-manager, but child accounts may
                // still be delegated from a partial undelegation that timed out.
                const [gsP] = getGameStatePda(sessionPda);
                const [gmP] = deriveGeneratedMapPda(sessionPda);
                const [mpP] = deriveMapPoisPda(sessionPda);
                const [invP] = deriveInventoryPda(sessionPda);
                const childAccounts: Array<[PublicKey, PublicKey, string]> = [
                  [gsP, SOLANA_CONFIG.programs.gameplayState, 'gameState'],
                  [gmP, SOLANA_CONFIG.programs.mapGenerator, 'generatedMap'],
                  [mpP, SOLANA_CONFIG.programs.poiSystem, 'mapPois'],
                  [invP, SOLANA_CONFIG.programs.playerInventory, 'inventory'],
                ];
                const childInfos = await Promise.all(
                  childAccounts.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
                );
                const anyChildDelegated = childInfos.some(
                  (info) => info && info.owner.equals(DELEGATION_PROGRAM_ID)
                );

                if (anyChildDelegated) {
                  console.log(
                    '[SessionContext] Deferred cleanup: session restored but child accounts still delegated, retrying undelegation',
                    {
                      cleanupId: cleanup.id,
                      delegated: childAccounts
                        .filter((_, idx) => childInfos[idx]?.owner.equals(DELEGATION_PROGRAM_ID))
                        .map(([, , label]) => label),
                    }
                  );

                  // Retry undelegation for the remaining accounts.
                  // The ER may return InvalidWritableAccount if it already committed
                  // the accounts — that's fine, we just need to wait for the base
                  // layer to receive the commit. Treat any error as recoverable here.
                  let undelegateRetrySucceeded = false;
                  try {
                    const retryResult = await sessionManager.undelegateSession(
                      getFallbackStateHash(),
                      cleanupSigner
                    );
                    undelegateRetrySucceeded = retryResult.success;
                  } catch (undelegateErr) {
                    console.warn(
                      '[SessionContext] Deferred cleanup: undelegate retry error (will still wait for base layer)',
                      undelegateErr instanceof Error ? undelegateErr.message : undelegateErr
                    );
                  }

                  // Wait for all child accounts to be restored on base layer.
                  // If undelegation succeeded, wait longer (60s) for ER commit propagation.
                  // If it failed, use a short wait (5s) before falling back.
                  const maxWaitIterations = undelegateRetrySucceeded ? 60 : 5;
                  let allRestored = false;
                  for (let i = 0; i < maxWaitIterations; i += 1) {
                    const infos = await Promise.all(
                      childAccounts.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
                    );
                    allRestored = infos.every((info, idx) =>
                      info?.owner.equals(childAccounts[idx][1])
                    );
                    if (allRestored) break;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                  }

                  // LOCAL-ONLY: force-undelegate via Delegation Program on base layer.
                  if (!allRestored && isForceUndelegateAvailable()) {
                    // Re-fetch to get accurate list
                    const freshInfos = await Promise.all(
                      childAccounts.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
                    );
                    const stillDelegatedPdas = childAccounts
                      .filter((_, idx) => freshInfos[idx]?.owner.equals(DELEGATION_PROGRAM_ID))
                      .map(([pda]) => pda);

                    if (stillDelegatedPdas.length > 0) {
                      console.log(
                        '[SessionContext] Deferred cleanup: using local force-undelegate for',
                        stillDelegatedPdas.length,
                        'accounts'
                      );
                      await forceUndelegateAccounts(connection, stillDelegatedPdas);
                      // Re-check
                      const postForceInfos = await Promise.all(
                        childAccounts.map(([pda]) => connection.getAccountInfo(pda, 'processed'))
                      );
                      allRestored = postForceInfos.every((info, idx) =>
                        info?.owner.equals(childAccounts[idx][1])
                      );
                      if (allRestored) {
                        console.log(
                          '[SessionContext] Deferred cleanup: all accounts restored after force-undelegate'
                        );
                      }
                    }
                  }

                  if (!allRestored) {
                    const latestSessionInfo = await connection.getAccountInfo(
                      sessionPda,
                      'processed'
                    );
                    if (latestSessionInfo?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
                      console.warn(
                        '[SessionContext] Deferred cleanup: child owners still delegated; trying forceCloseSession fallback',
                        { cleanupId: cleanup.id }
                      );
                      const forceCloseResult =
                        await sessionManager.forceCloseSession(cleanupSigner);
                      if (forceCloseResult.success) {
                        await updateCleanup(cleanup.id, { needsSessionEnd: false });
                        cleanup.needsSessionEnd = false;
                        await removeCleanup(cleanup.id);
                        continue;
                      }
                      console.warn(
                        '[SessionContext] forceCloseSession failed; trying closeSessionOnly last-resort'
                      );
                      const closeOnlyResult = await sessionManager.closeSessionOnly(cleanupSigner);
                      if (closeOnlyResult.success) {
                        await updateCleanup(cleanup.id, { needsSessionEnd: false });
                        cleanup.needsSessionEnd = false;
                        await removeCleanup(cleanup.id);
                        continue;
                      }
                    }
                    throw new Error('Child accounts still delegated after undelegation retry');
                  }
                }
              }

              // For gauntlet sessions, settle points/echoes before ending.
              // Without this, deferred cleanup closes the session without crediting points.
              if (cleanup.sessionType === 'gauntlet') {
                try {
                  const [gsP] = getGameStatePda(sessionPda);
                  const gameplayProgram = createGameplayStateProgram(connection);
                  const gsState = await fetchGameState(gameplayProgram, gsP);
                  if (gsState && !gsState.gauntletSettled && wallet.publicKey) {
                    console.log('[SessionContext] Deferred cleanup: settling gauntlet session...');
                    const settleTx = await buildSettleGauntletSessionTransaction(
                      connection,
                      gameplayProgram,
                      wallet.publicKey,
                      cleanupSigner.publicKey,
                      gsP,
                      sessionPda
                    );
                    const settleSig = await sendSessionSignerTransaction(
                      connection,
                      settleTx,
                      cleanupSigner
                    );
                    await connection.confirmTransaction(settleSig, 'confirmed');
                    console.log('[SessionContext] Deferred cleanup: gauntlet settle confirmed:', settleSig);
                  }
                } catch (settleErr) {
                  console.warn('[SessionContext] Deferred cleanup: gauntlet settle failed (non-fatal):', settleErr);
                }
              }

              const endResult = await sessionManager.endSession(cleanupSigner);
              if (!endResult.success) {
                const endError = endResult.error ?? 'Deferred end session failed';
                if (
                  endError.includes('No active session to end') ||
                  isRecoverableDelegationError(endError)
                ) {
                  const postEndInfo = await connection.getAccountInfo(sessionPda, 'processed');
                  if (!postEndInfo) {
                    console.log(
                      '[SessionContext] Deferred cleanup: end session returned recoverable error but session is already closed',
                      { cleanupId: cleanup.id }
                    );
                    await removeCleanup(cleanup.id);
                    continue;
                  }
                }
                // Always try forceCloseSession as fallback for any endSession failure
                // (covers non-terminal abandoned sessions, delegation errors, etc.)
                const latestSessionInfo = await connection.getAccountInfo(sessionPda, 'processed');
                if (latestSessionInfo?.owner.equals(SOLANA_CONFIG.programs.sessionManager)) {
                  console.warn(
                    '[SessionContext] Deferred cleanup: endSession failed; trying forceCloseSession fallback',
                    { cleanupId: cleanup.id, endError }
                  );
                  const forceCloseResult = await sessionManager.forceCloseSession(cleanupSigner);
                  if (forceCloseResult.success) {
                    await updateCleanup(cleanup.id, { needsSessionEnd: false });
                    cleanup.needsSessionEnd = false;
                    await removeCleanup(cleanup.id);
                    continue;
                  }
                  console.warn(
                    '[SessionContext] forceCloseSession failed; trying closeSessionOnly last-resort'
                  );
                  const closeOnlyResult = await sessionManager.closeSessionOnly(cleanupSigner);
                  if (closeOnlyResult.success) {
                    await updateCleanup(cleanup.id, { needsSessionEnd: false });
                    cleanup.needsSessionEnd = false;
                    await removeCleanup(cleanup.id);
                    continue;
                  }
                }
                throw new Error(endError);
              }

              try {
                await withdrawExcessToMain(connection, cleanupSigner, wallet.publicKey);
              } catch (drainErr) {
                console.warn('[SessionContext] Deferred cleanup excess withdrawal failed:', drainErr);
              }

              await updateCleanup(cleanup.id, { needsSessionEnd: false });
              cleanup.needsSessionEnd = false;
            }
          }

          // Try to record the run result if needed
          // Note: recordRunResult is handled by ProfileContext, not here
          // We just mark it as complete since the queueing is for the session end
          if (cleanup.needsResultRecord && allComplete) {
            // The run result recording is deferred to ProfileContext's offline sync
            // Just mark this cleanup as not needing result recording
            await updateCleanup(cleanup.id, { needsResultRecord: false });
            cleanup.needsResultRecord = false;
          }

          // If everything completed, remove the cleanup
          if (allComplete && !cleanup.needsSessionEnd) {
            await removeCleanup(cleanup.id);
            console.log('[SessionContext] Cleanup completed:', cleanup.id);
          }
        } catch (error) {
          console.error('[SessionContext] Error processing cleanup:', cleanup.id, error);
          const retryCount = await incrementRetryCount(cleanup.id);
          console.warn('[SessionContext] processPendingCleanups:retry_incremented', {
            cleanupId: cleanup.id,
            retryCount,
          });
        }
      }

      // Check if there are still pending cleanups
      const remaining = await getPendingCleanups(walletId);
      setHasPendingCleanupsState(remaining.length > 0);
      await refreshSessionList().catch((err) =>
        console.warn('[SessionContext] processPendingCleanups:refreshSessionList failed:', err)
      );
      console.log('[SessionContext] processPendingCleanups:done_remaining', remaining.length);
    } finally {
      cleanupProcessingRef.current = false;
      // Release any waiting session starts.
      if (resolveCleanupGate) resolveCleanupGate();
      if (pendingTeardownRef.current === cleanupGate) {
        pendingTeardownRef.current = null;
      }
    }
  }, [
    walletId,
    wallet.publicKey,
    connection,
    gameplayConnection,
    sessionManager,
    sessionSigner.keypair,
    getFallbackStateHash,
    resolveSessionSignerForSession,
    refreshSessionList,
  ]);

  // IMPORTANT: pending cleanup processing is intentionally triggered only by Campaign screen focus.

  /**
   * Abandon a session (end it as a defeat, deducting 1 run).
   */
  const abandonSessionFn = useCallback(
    async (sessionPda: string): Promise<TransactionResult> => {
      if (!wallet.publicKey || !connection) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        if (sessionManager.activeSessionPda?.toBase58() === sessionPda) {
          const immediateAbandon = forceAbandonCurrentSessionRef.current;
          if (!immediateAbandon) {
            return { success: false, error: 'Immediate abandon is not available yet' };
          }
          return await immediateAbandon();
        }

        // Find the session
        const session = activeSessions.find((s) => s.sessionPda === sessionPda);
        if (!session) {
          return { success: false, error: 'Session not found' };
        }

        // Queue cleanup for the session (this will end it as a defeat)
        await queueEndGame(session.level, false);

        // Refresh session list
        await refreshSessionList();

        console.log('[SessionContext] Abandoned session:', sessionPda);
        return { success: true };
      } catch (error) {
        console.error('[SessionContext] Failed to abandon session:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to abandon session',
        };
      }
    },
    [activeSessions, connection, wallet.publicKey, refreshSessionList, queueEndGame]
  );

  /**
   * Force abandon the current session by calling the Solana abandon_session instruction.
   * This bypasses the "death or victory" requirement of end_session.
   * Requires main wallet signature.
   */
  const forceAbandonCurrentSession = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !connection) {
      return { success: false, error: 'Wallet not connected' };
    }

    const session = sessionManager.session;
    if (!session) {
      return { success: false, error: 'No active session' };
    }
    const sessionOwner = session.player;
    if (!wallet.publicKey.equals(sessionOwner)) {
      return {
        success: false,
        error: `Connected wallet does not own this session. Switch to ${sessionOwner.toBase58()}`,
      };
    }

    try {
      console.log('[SessionContext] Force abandoning session...', {
        level: session.campaignLevel,
        sessionOwner: sessionOwner.toBase58(),
        wallet: wallet.publicKey.toBase58(),
      });

      // Use the exact active session PDA (works for campaign/duel/gauntlet).
      const sessionPda = sessionManager.activeSessionPda;
      if (!sessionPda) {
        return { success: false, error: 'Active session PDA not available' };
      }

      const sessionSignerKeypair = await resolveSessionSignerForSession(
        sessionPda,
        session.sessionSigner ?? null
      );
      if (!sessionSignerKeypair) {
        return {
          success: false,
          error: session.sessionSigner
            ? `Session key signer mismatch. Expected ${session.sessionSigner.toBase58()}`
            : 'Session key signer not available',
        };
      }

      // Always undelegate first. `session.isDelegated` can be stale when session decode
      // falls back to metadata, and abandon requires base-owner session accounts.
      const undelegateResult = await sessionManager.undelegateSession(
        getFallbackStateHash(),
        sessionSignerKeypair
      );
      if (!undelegateResult.success) {
        console.warn(
          '[SessionContext] forceAbandon: undelegation failed, trying fallbacks...',
          undelegateResult.error
        );
        // Fallback: try forceCloseSession (handles delegated children) or closeSessionOnly
        const forceCloseResult = await sessionManager.forceCloseSession(sessionSignerKeypair);
        if (forceCloseResult.success) {
          console.log('[SessionContext] forceAbandon: forceCloseSession succeeded as fallback');
          setUseErForGameplay(false);
          await clearFogState(sessionPda.toBase58()).catch(() => {});
          await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});
          sessionManager.resetSession();
          sessionSigner.resetState();
          return { success: true, signature: forceCloseResult.signature };
        }
        const closeOnlyResult = await sessionManager.closeSessionOnly(sessionSignerKeypair);
        if (closeOnlyResult.success) {
          console.log('[SessionContext] forceAbandon: closeSessionOnly succeeded as fallback');
          setUseErForGameplay(false);
          await clearFogState(sessionPda.toBase58()).catch(() => {});
          await clearBrokenWalls(sessionPda.toBase58()).catch(() => {});
          sessionManager.resetSession();
          sessionSigner.resetState();
          return { success: true, signature: closeOnlyResult.signature };
        }
        return {
          success: false,
          error: undelegateResult.error ?? 'Failed to undelegate session from rollup',
        };
      }
      setUseErForGameplay(false);

      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [mapPoisPda] = deriveMapPoisPda(sessionPda);
      const [
        sessionInfo,
        gameStateInfo,
        generatedMapInfo,
        inventoryInfo,
        mapPoisInfo,
      ] = await Promise.all([
        connection.getAccountInfo(sessionPda, 'processed'),
        connection.getAccountInfo(gameStatePda, 'processed'),
        connection.getAccountInfo(generatedMapPda, 'processed'),
        connection.getAccountInfo(inventoryPda, 'processed'),
        connection.getAccountInfo(mapPoisPda, 'processed'),
      ]);
      const stillDelegated =
        !!sessionInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!gameStateInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!generatedMapInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!inventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
        !!mapPoisInfo?.owner.equals(DELEGATION_PROGRAM_ID);
      console.log('[SessionContext] forceAbandon:post_undelegate_owner_check', {
        sessionPda: sessionPda.toBase58(),
        stillDelegated,
        owners: {
          session: sessionInfo?.owner.toBase58() ?? null,
          gameState: gameStateInfo?.owner.toBase58() ?? null,
          generatedMap: generatedMapInfo?.owner.toBase58() ?? null,
          inventory: inventoryInfo?.owner.toBase58() ?? null,
          mapPois: mapPoisInfo?.owner.toBase58() ?? null,
        },
      });
      if (stillDelegated) {
        return {
          success: false,
          error:
            'Session accounts are still delegated after undelegate; try again in a few seconds',
        };
      }

      // Create a program instance for the abandon call
      const { createSessionManagerProgram } = await import('@/services/solana/programs');
      const program = createSessionManagerProgram(connection);

      // Create the abandon session transaction
      const tx = await abandonSessionTx(
        connection,
        program,
        sessionPda,
        inventoryPda,
        sessionOwner,
        sessionSignerKeypair.publicKey,
        session.campaignLevel
      );

      // Add compute budget for safety (increased for closing all accounts via CPI)
      tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));

      // SessionSigner needs to sign (for closing sub-accounts)
      tx.partialSign(sessionSignerKeypair);

      // Send via wallet adapter (main wallet signs)
      const signature = await signAndSendTransaction(tx);
      await connection.confirmTransaction(signature, 'confirmed');

      console.log('[SessionContext] Session abandoned successfully:', signature);

      // Derive session key for clearing local state
      const sessionKey = sessionPda.toBase58();

      // Clear local state
      await clearFogState(sessionKey);
      await clearBrokenWalls(sessionKey);
      vrfReadySessionsRef.current.delete(sessionKey);
      sessionManager.resetSession();
      sessionSigner.resetState();
      setUseErForGameplay(false);

      // Refresh session list
      await refreshSessionList();

      return { success: true, signature };
    } catch (error) {
      console.error('[SessionContext] Failed to force abandon session:', error);
      try {
        const sessionPda = sessionManager.activeSessionPda;
        if (sessionPda) {
          const [gameStatePda] = deriveGameStatePda(sessionPda);
          const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
          const [inventoryPda] = deriveInventoryPda(sessionPda);
          const [mapPoisPda] = deriveMapPoisPda(sessionPda);
          const [
            sessionInfo,
            gameStateInfo,
            generatedMapInfo,
            inventoryInfo,
            mapPoisInfo,
          ] = await Promise.all([
            connection.getAccountInfo(sessionPda, 'processed'),
            connection.getAccountInfo(gameStatePda, 'processed'),
            connection.getAccountInfo(generatedMapPda, 'processed'),
            connection.getAccountInfo(inventoryPda, 'processed'),
            connection.getAccountInfo(mapPoisPda, 'processed'),
          ]);
          const isStillDelegated =
            !!sessionInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!gameStateInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!generatedMapInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!inventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
            !!mapPoisInfo?.owner.equals(DELEGATION_PROGRAM_ID);
          setUseErForGameplay(isStillDelegated);
          console.log('[SessionContext] forceAbandon:reconciled_gameplay_route', {
            sessionPda: sessionPda.toBase58(),
            isStillDelegated,
          });
        }
      } catch (reconcileErr) {
        console.warn('[SessionContext] forceAbandon:failed_to_reconcile_route', reconcileErr);
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to abandon session',
      };
    }
  }, [
    wallet.publicKey,
    signAndSendTransaction,
    connection,
    sessionManager.session,
    sessionManager.activeSessionPda,
    sessionManager.resetSession,
    sessionManager.undelegateSession,
    resolveSessionSignerForSession,
    refreshSessionList,
    getFallbackStateHash,
    setUseErForGameplay,
  ]);

  forceAbandonCurrentSessionRef.current = forceAbandonCurrentSession;

  // Split context: stable identity + actions (only changes on session start/end/switch)
  const identityValue = useMemo<SessionIdentityContextType>(
    () => ({
      session: sessionManager.session,
      hasActiveSession: sessionManager.hasActiveSession,
      mapSeed,
      currentLevel,
      sessionKey,
      sessionPda: activeSessionPda,
      activeSessions,
      isSessionListLoading,
      isWalletDisconnected,
      sessionSignerState: sessionSigner.state,
      sessionSignerBalance: sessionSigner.balance,
      isSessionSignerLowBalance: sessionSigner.isLowBalance,
      hasPendingCleanups: hasPendingCleanupsState,
      isAutoCommitActive,
      startGame,
      overrideCampaignSession,
      overrideDuelSession,
      overrideGauntletSession,
      overrideAndStartGame,
      overrideAndStartDuelGame,
      overrideAndStartGauntletGame,
      startDuelGame,
      startGauntletGame,
      endGame,
      endSessionWithSessionSigner,
      undelegateCurrentSession,
      queueEndGame,
      processPendingCleanups,
      delegateToRollup,
      commitGameState,
      refreshSession,
      getMapSeedForLevel,
      verifySeed,
      startAutoCommit,
      stopAutoCommit,
      topUpSessionSigner,
      getSessionSignerKeypair,
      refreshSessionList,
      switchToSession: switchToSessionFn,
      ensureSessionVrfReady,
      getSessionStartupState,
      abandonSession: abandonSessionFn,
      forceAbandonCurrentSession,
      hasSessionForLevel,
      getSessionPdaForLevel,
      setGameStatePda: gameplayState.setGameStatePda,
      fetchSessionNonces,
      retryErVrfForSession,
    }),
    [
      sessionManager.session,
      sessionManager.hasActiveSession,
      mapSeed,
      currentLevel,
      sessionKey,
      activeSessionPda,
      activeSessions,
      isSessionListLoading,
      isWalletDisconnected,
      sessionSigner.state,
      sessionSigner.balance,
      sessionSigner.isLowBalance,
      hasPendingCleanupsState,
      isAutoCommitActive,
      startGame,
      overrideCampaignSession,
      overrideDuelSession,
      overrideGauntletSession,
      overrideAndStartGame,
      overrideAndStartDuelGame,
      overrideAndStartGauntletGame,
      startDuelGame,
      startGauntletGame,
      endGame,
      endSessionWithSessionSigner,
      undelegateCurrentSession,
      queueEndGame,
      processPendingCleanups,
      delegateToRollup,
      commitGameState,
      refreshSession,
      getMapSeedForLevel,
      verifySeed,
      startAutoCommit,
      stopAutoCommit,
      topUpSessionSigner,
      getSessionSignerKeypair,
      refreshSessionList,
      switchToSessionFn,
      ensureSessionVrfReady,
      getSessionStartupState,
      abandonSessionFn,
      forceAbandonCurrentSession,
      hasSessionForLevel,
      getSessionPdaForLevel,
      gameplayState.setGameStatePda,
      fetchSessionNonces,
      retryErVrfForSession,
    ]
  );

  // Split context: frequently-changing gameplay state (updates during active gameplay)
  const gameplayValue = useMemo<SessionGameplayContextType>(
    () => ({
      gameplayState: gameplayState.gameState,
      gameplaySyncStatus: gameplayState.syncStatus,
      isLoading: sessionManager.isLoading || gameplayState.isLoading,
      error: sessionManager.error || gameplayState.error || sessionSigner.error,
      movePlayer,
      triggerBoss,
      modifyPlayerStat,
      refreshGameplayState: gameplayState.refresh,
    }),
    [
      gameplayState.gameState,
      gameplayState.syncStatus,
      gameplayState.isLoading,
      gameplayState.error,
      gameplayState.refresh,
      sessionManager.isLoading,
      sessionManager.error,
      sessionSigner.error,
      movePlayer,
      triggerBoss,
      modifyPlayerStat,
    ]
  );

  // Combined value for backward-compatible useSession() hook
  const value = useMemo<SessionContextType>(
    () => ({
      ...identityValue,
      ...gameplayValue,
      refreshGameplayState: gameplayValue.refreshGameplayState,
    }),
    [identityValue, gameplayValue]
  );

  return (
    <SessionContext.Provider value={value}>
      <SessionIdentityContext.Provider value={identityValue}>
        <SessionGameplayContext.Provider value={gameplayValue}>
          {children}
        </SessionGameplayContext.Provider>
      </SessionIdentityContext.Provider>
    </SessionContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

/**
 * Use only stable session identity & actions. Does NOT re-render when
 * gameplayState, syncStatus, isLoading, or error change.
 * Prefer this in screens that don't need live gameplay updates
 * (HubScreen, CampaignSelectScreen, GauntletScreen, DuelsScreen).
 */
export function useSessionIdentity() {
  const context = useContext(SessionIdentityContext);
  if (context === undefined) {
    throw new Error('useSessionIdentity must be used within a SessionProvider');
  }
  return context;
}

/**
 * Use only frequently-changing gameplay fields (gameplayState, syncStatus,
 * isLoading, error, movePlayer, triggerBoss, etc.). Does NOT re-render when
 * session identity fields change.
 * Prefer this in components that only need live gameplay data
 * (GameScreen gameplay logic, Sidebar stats, usePoiInteraction).
 */
export function useSessionGameplay() {
  const context = useContext(SessionGameplayContext);
  if (context === undefined) {
    throw new Error('useSessionGameplay must be used within a SessionProvider');
  }
  return context;
}
