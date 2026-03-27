import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  SystemProgram,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  Keypair,
} from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createAnchorProvider,
  createGameplayStateProgram,
  createGameplayStateProgramWithProvider,
  createMapGeneratorProgram,
  createMapGeneratorProgramWithProvider,
  createPlayerInventoryProgram,
  createPlayerInventoryProgramWithProvider,
  createPoiSystemProgram,
  createPoiSystemProgramWithProvider,
  createSessionManagerProgram,
  createSessionManagerProgramWithProvider,
} from '@/services/solana/programs';
import { deriveSessionCounterPda } from '@/services/solana/types';
import {
  deriveDuelSessionPda,
  deriveGauntletSessionPda,
  derivePlayerProfilePda,
  deriveGameStatePda,
  deriveMapPoisPda,
  deriveInventoryPda,
  deriveGeneratedMapPda,
  deriveMapConfigPda,
  deriveSessionManagerAuthorityPda,
  deriveSessionPda,
  deriveSessionNoncesPda,
  deriveMapVrfStatePda,
  derivePoiVrfStatePda,
  deriveGameplayVrfStatePda,
  deriveSessionDiscoveryPda,
  deriveGauntletEchoesPda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import { getUserErrorMessage } from '@/services/solana/errors';
import { buildResetDuelEntryInstruction, deriveDuelEntryPda } from '@/services/solana/duels';
import { sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import { MAX_CAMPAIGN_LEVEL } from './useMapGenerator';
import {
  isForceUndelegateAvailable,
  forceUndelegateAccounts,
} from '@/services/solana/forceUndelegate';
import type { TransactionResult } from '@/types/solana';
import type { OnChainGameSession } from '@/services/solana/types/session_manager';

interface RawGameSessionAccount {
  player: PublicKey;
  sessionId: { toString(): string };
  campaignLevel: number;
  startedAt: number | bigint | { toString(): string };
  lastActivity: number | bigint | { toString(): string };
  isDelegated: boolean;
  bump: number;
  activeItemPool?: ArrayLike<number>;
  sessionSigner?: PublicKey;
  stateHash: ArrayLike<number>;
}

const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');

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

export function useSessionManager() {
  const { wallet, signAndSendTransaction } = useWallet();
  const { baseConnection, erConnection } = useSolanaConnection();

  const readOnlyProgram = useMemo(
    () => createSessionManagerProgram(baseConnection),
    [baseConnection]
  );
  const [session, setSession] = useState<OnChainGameSession | null>(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Reactive state tracking the active session PDA (for re-rendering consumers). */
  const [activeSessionPdaState, setActiveSessionPdaState] = useState<PublicKey | null>(null);

  const isMountedRef = useRef(true);
  /** Tracks the on-chain level (1-indexed) of the current/last session for PDA derivation */
  const activeOnChainLevelRef = useRef<number>(1);
  /** Tracks the exact active session PDA (campaign/duel/gauntlet). */
  const activeSessionPdaRef = useRef<PublicKey | null>(null);
  /** Ref mirrors for session/hasActiveSession — endSession reads these so deferred
   *  cleanup can call fetchSession() + endSession() in the same async tick without
   *  waiting for React to re-render and flush the setState calls from fetchSession. */
  const sessionRef = useRef<OnChainGameSession | null>(null);
  const hasActiveSessionRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Passthrough wallet adapter — session signer handles actual signing
  const walletAdapter = useMemo(
    () =>
      wallet.publicKey
        ? ({
            publicKey: wallet.publicKey,
            signTransaction: async (transaction: any) => transaction,
            signAllTransactions: async (transactions: any) => transactions,
          } as AnchorProvider['wallet'])
        : null,
    [wallet.publicKey]
  );

  const provider = useMemo(
    () => (walletAdapter ? createAnchorProvider(baseConnection, walletAdapter) : null),
    [baseConnection, walletAdapter]
  );

  // All write programs share the same provider — create them together
  const writePrograms = useMemo(() => {
    if (!provider) return null;
    return {
      sessionManager: createSessionManagerProgramWithProvider(provider),
      gameplayState: createGameplayStateProgramWithProvider(provider),
      mapGenerator: createMapGeneratorProgramWithProvider(provider),
      playerInventory: createPlayerInventoryProgramWithProvider(provider),
      poiSystem: createPoiSystemProgramWithProvider(provider),
    };
  }, [provider]);

  const baseWriteProgram = writePrograms?.sessionManager ?? null;
  const gameplayStateWriteProgram = writePrograms?.gameplayState ?? null;
  const mapGeneratorWriteProgram = writePrograms?.mapGenerator ?? null;
  const playerInventoryWriteProgram = writePrograms?.playerInventory ?? null;
  const poiSystemWriteProgram = writePrograms?.poiSystem ?? null;

  const erProvider = useMemo(
    () => (walletAdapter ? createAnchorProvider(erConnection, walletAdapter) : null),
    [erConnection, walletAdapter]
  );

  const erWriteProgram = useMemo(() => {
    if (!erProvider) {
      return null;
    }
    return createSessionManagerProgramWithProvider(erProvider);
  }, [erProvider]);

  const setActiveOnChainLevel = useCallback((onChainLevel: number) => {
    activeOnChainLevelRef.current = onChainLevel;
  }, []);

  const setActiveSessionPda = useCallback((sessionPda: PublicKey | null) => {
    activeSessionPdaRef.current = sessionPda;
    setActiveSessionPdaState(sessionPda);
  }, []);

  /**
   * Fetch the player's SessionNonces account.
   * Returns { campaign: 0n, duel: 0n, gauntlet: 0n } when the account doesn't exist yet.
   */
  const fetchSessionNonces = useCallback(
    async (
      player: PublicKey
    ): Promise<{ campaign: bigint; duel: bigint; gauntlet: bigint }> => {
      const defaults = { campaign: 0n, duel: 0n, gauntlet: 0n };
      try {
        const [noncesPda] = deriveSessionNoncesPda(player);
        const info = await baseConnection.getAccountInfo(noncesPda);
        if (!info) return defaults;
        const decoded = readOnlyProgram.coder.accounts.decode('sessionNonces', info.data) as {
          campaignNonce: { toString(): string };
          duelNonce: { toString(): string };
          gauntletNonce: { toString(): string };
        };
        return {
          campaign: BigInt(decoded.campaignNonce.toString()),
          duel: BigInt(decoded.duelNonce.toString()),
          gauntlet: BigInt(decoded.gauntletNonce.toString()),
        };
      } catch {
        return defaults;
      }
    },
    [baseConnection, readOnlyProgram]
  );

  const fetchSession = useCallback(async () => {
    if (!wallet.publicKey) {
      if (isMountedRef.current) setError('Wallet not connected');
      return;
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      let sessionPda = activeSessionPdaRef.current;
      const nonces = !sessionPda ? await fetchSessionNonces(wallet.publicKey) : null;
      if (!sessionPda) {
        const [fallbackSessionPda] = deriveSessionPda(
          wallet.publicKey,
          activeOnChainLevelRef.current,
          nonces!.campaign
        );
        sessionPda = fallbackSessionPda;
      }
      const decodeRawGameSession = async (pda: PublicKey): Promise<RawGameSessionAccount | null> => {
        const accountInfo = await baseConnection.getAccountInfo(
          pda,
          SOLANA_CONFIG.commitment
        );
        if (!accountInfo?.data) {
          return null;
        }
        return readOnlyProgram.coder.accounts.decode(
          'gameSession',
          accountInfo.data
        ) as RawGameSessionAccount;
      };

      const tryFetchSession = async (pda: PublicKey): Promise<RawGameSessionAccount | null> => {
        try {
          const account = await (
            readOnlyProgram.account as {
              gameSession: {
                fetchNullable: (address: PublicKey) => Promise<RawGameSessionAccount | null>;
              };
            }
          ).gameSession.fetchNullable(pda);
          if (account) return account;
          return await decodeRawGameSession(pda);
        } catch {
          // Delegated session accounts are owned by MagicBlock delegation program.
          return await decodeRawGameSession(pda).catch(() => null);
        }
      };

      let account = await tryFetchSession(sessionPda);

      // If no campaign session found and we have nonces, try duel and gauntlet PDAs.
      if (!account && nonces) {
        const [duelPda] = deriveDuelSessionPda(wallet.publicKey, nonces.duel);
        account = await tryFetchSession(duelPda);
        if (account) {
          sessionPda = duelPda;
        } else {
          const [gauntletPda] = deriveGauntletSessionPda(wallet.publicKey, nonces.gauntlet);
          account = await tryFetchSession(gauntletPda);
          if (account) {
            sessionPda = gauntletPda;
          }
        }
      }

      if (!isMountedRef.current) return;

      if (!account) {
        sessionRef.current = null;
        hasActiveSessionRef.current = false;
        setSession(null);
        setHasActiveSession(false);
        activeSessionPdaRef.current = null;
        setActiveSessionPdaState(null);
        return;
      }

      activeSessionPdaRef.current = sessionPda;
      setActiveSessionPdaState(sessionPda);

      const sessionData: OnChainGameSession = {
        player: account.player,
        sessionId: BigInt(account.sessionId.toString()),
        campaignLevel: account.campaignLevel,
        startedAt: Number(account.startedAt),
        lastActivity: Number(account.lastActivity),
        isDelegated: account.isDelegated,
        bump: account.bump,
        activeItemPool: Array.from(account.activeItemPool ?? []),
        sessionSigner: account.sessionSigner ?? wallet.publicKey,
        stateHash: Array.from(account.stateHash),
      };

      sessionRef.current = sessionData;
      hasActiveSessionRef.current = true;
      setSession(sessionData);
      setHasActiveSession(true);
    } catch (fetchError) {
      if (isMountedRef.current) {
        setError(getUserErrorMessage(fetchError));
        sessionRef.current = null;
        hasActiveSessionRef.current = false;
        setSession(null);
        setHasActiveSession(false);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [readOnlyProgram, wallet.publicKey]);

  const startSession = useCallback(
    async (campaignLevel: number): Promise<TransactionResult> => {
      console.log('[useSessionManager] startSession called', {
        campaignLevel,
        walletPublicKey: wallet.publicKey?.toBase58(),
        hasWriteProgram: !!baseWriteProgram,
      });

      if (!wallet.publicKey || !baseWriteProgram) {
        console.log('[useSessionManager] No wallet or write program');
        return { success: false, error: 'Wallet not connected' };
      }

      if (campaignLevel < 0 || campaignLevel > MAX_CAMPAIGN_LEVEL) {
        return {
          success: false,
          error: `Campaign level must be between 0 and ${MAX_CAMPAIGN_LEVEL}`,
        };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        // Frontend levels are 0-indexed, on-chain expects 1-indexed (1-40)
        const onChainLevel = campaignLevel + 1;
        activeOnChainLevelRef.current = onChainLevel;

        const nonces = await fetchSessionNonces(wallet.publicKey);
        const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel, nonces.campaign);
        // Don't cache the PDA yet — wait until the tx is confirmed.
        // If start_session fails, a stale PDA would mislead later reads.
        const [counterPda] = deriveSessionCounterPda();
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [poisPda] = deriveMapPoisPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
        const [mapConfigPda] = deriveMapConfigPda();
        console.log('[useSessionManager] PDAs derived', {
          sessionPda: sessionPda.toBase58(),
          counterPda: counterPda.toBase58(),
        });
        console.log('[useSessionManager] Building transaction...');
        const transaction = await baseWriteProgram.methods
          .startSession(onChainLevel)
          .accounts({
            gameSession: sessionPda,
            sessionCounter: counterPda,
            playerProfile: profilePda,
            player: wallet.publicKey,
            sessionSigner: wallet.publicKey, // Will be overridden by caller
            mapConfig: mapConfigPda,
            generatedMap: generatedMapPda,
            sessionDiscovery: sessionDiscoveryPda,
            gameState: gameStatePda,
            mapPois: poisPda,
            inventory: inventoryPda,
            mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
            gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
            poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
            playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        // start_session does multiple CPIs (map gen ~378k CUs, game state, inventory, POIs),
        // which far exceeds the default 200k compute unit limit
        transaction.instructions.unshift(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })
        );

        console.log('[useSessionManager] Requesting wallet signature...');
        const signature = await signAndSendTransaction(transaction, {
          connection: baseConnection,
        });
        console.log('[useSessionManager] Transaction sent:', signature);
        await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        console.log('[useSessionManager] Transaction confirmed');

        // Now that the tx is confirmed, cache the session PDA.
        activeSessionPdaRef.current = sessionPda;
        setActiveSessionPdaState(sessionPda);

        // Fetch the created session
        await fetchSession();

        return { success: true, signature };
      } catch (txError) {
        console.error('[useSessionManager] Transaction error:', txError);
        const message = getUserErrorMessage(txError, 'session_manager');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [baseConnection, fetchSession, signAndSendTransaction, wallet.publicKey, baseWriteProgram]
  );

  const overrideCampaignSession = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !baseWriteProgram) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
      const transaction = await baseWriteProgram.methods
        .overrideCampaignSession()
        .accounts({
          sessionNonces: sessionNoncesPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const signature = await signAndSendTransaction(transaction, {
        connection: baseConnection,
      });
      await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

      // Force future fetch/start flows to derive from current nonces.
      activeSessionPdaRef.current = null;
      setActiveSessionPdaState(null);
      await fetchSession();

      return { success: true, signature };
    } catch (txError) {
      const message = getUserErrorMessage(txError, 'session_manager');
      if (isMountedRef.current) setError(message);
      return { success: false, error: message };
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [baseConnection, fetchSession, signAndSendTransaction, wallet.publicKey, baseWriteProgram]);

  const overrideDuelSession = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !baseWriteProgram) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
      const transaction = await baseWriteProgram.methods
        .overrideDuelSession()
        .accounts({
          sessionNonces: sessionNoncesPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const signature = await signAndSendTransaction(transaction, {
        connection: baseConnection,
      });
      await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

      activeSessionPdaRef.current = null;
      setActiveSessionPdaState(null);
      await fetchSession();

      return { success: true, signature };
    } catch (txError) {
      const message = getUserErrorMessage(txError, 'session_manager');
      if (isMountedRef.current) setError(message);
      return { success: false, error: message };
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [baseConnection, fetchSession, signAndSendTransaction, wallet.publicKey, baseWriteProgram]);

  const overrideGauntletSession = useCallback(async (): Promise<TransactionResult> => {
    if (!wallet.publicKey || !baseWriteProgram) {
      return { success: false, error: 'Wallet not connected' };
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
      const transaction = await baseWriteProgram.methods
        .overrideGauntletSession()
        .accounts({
          sessionNonces: sessionNoncesPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const signature = await signAndSendTransaction(transaction, {
        connection: baseConnection,
      });
      await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

      activeSessionPdaRef.current = null;
      setActiveSessionPdaState(null);
      await fetchSession();

      return { success: true, signature };
    } catch (txError) {
      const message = getUserErrorMessage(txError, 'session_manager');
      if (isMountedRef.current) setError(message);
      return { success: false, error: message };
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [baseConnection, fetchSession, signAndSendTransaction, wallet.publicKey, baseWriteProgram]);

  const buildOverrideCampaignSessionTransaction = useCallback(
    async (): Promise<Transaction | null> => {
      if (!wallet.publicKey || !baseWriteProgram) return null;
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
      return baseWriteProgram.methods
        .overrideCampaignSession()
        .accounts({
          sessionNonces: sessionNoncesPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
    },
    [wallet.publicKey, baseWriteProgram]
  );

  const buildOverrideDuelSessionTransaction = useCallback(
    async (): Promise<Transaction | null> => {
      if (!wallet.publicKey || !baseWriteProgram) return null;
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
      return baseWriteProgram.methods
        .overrideDuelSession()
        .accounts({
          sessionNonces: sessionNoncesPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
    },
    [wallet.publicKey, baseWriteProgram]
  );

  const buildOverrideGauntletSessionTransaction = useCallback(
    async (): Promise<Transaction | null> => {
      if (!wallet.publicKey || !baseWriteProgram) return null;
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
      return baseWriteProgram.methods
        .overrideGauntletSession()
        .accounts({
          sessionNonces: sessionNoncesPda,
          player: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
    },
    [wallet.publicKey, baseWriteProgram]
  );

  const buildStartDuelSessionTransaction = useCallback(
    async (
      sessionSignerPublicKey: PublicKey,
      mapVrfStatePda?: PublicKey | null,
      nonceOverride?: bigint
    ): Promise<{ transaction: Transaction; sessionPda: PublicKey } | null> => {
      if (
        !wallet.publicKey ||
        !baseWriteProgram ||
        !gameplayStateWriteProgram ||
        !mapGeneratorWriteProgram ||
        !playerInventoryWriteProgram ||
        !poiSystemWriteProgram
      ) {
        return null;
      }
      const gameplayProgram = gameplayStateWriteProgram;
      const mapProgram = mapGeneratorWriteProgram;
      const inventoryProgram = playerInventoryWriteProgram;
      const poiProgram = poiSystemWriteProgram;

      const DUEL_ONCHAIN_LEVEL = 20;
      activeOnChainLevelRef.current = DUEL_ONCHAIN_LEVEL;

      const nonce = nonceOverride ?? (await fetchSessionNonces(wallet.publicKey)).duel;
      const [sessionPda] = deriveDuelSessionPda(wallet.publicKey, nonce);
      activeSessionPdaRef.current = sessionPda;
      setActiveSessionPdaState(sessionPda);
      const [counterPda] = deriveSessionCounterPda();
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
      const [mapConfigPda] = deriveMapConfigPda();
      const [sessionManagerAuthorityPda] = deriveSessionManagerAuthorityPda();

      const transaction = await (
        baseWriteProgram.methods as unknown as {
          startDuelSession: () => {
            accounts: (accounts: {
              gameSession: PublicKey;
              sessionCounter: PublicKey;
              playerProfile: PublicKey;
              player: PublicKey;
              sessionSigner: PublicKey;
              sessionManagerAuthority: PublicKey;
              mapConfig: PublicKey;
              generatedMap: PublicKey;
              sessionDiscovery: PublicKey | null;
              gameState: PublicKey;
              mapPois: PublicKey;
              inventory: PublicKey;
              mapVrfState: PublicKey | null;
              mapGeneratorProgram: PublicKey;
              gameplayStateProgram: PublicKey;
              poiSystemProgram: PublicKey;
              playerInventoryProgram: PublicKey;
              systemProgram: PublicKey;
            }) => { transaction: () => Promise<Transaction> };
          };
        }
      )
        .startDuelSession()
        .accounts({
          gameSession: sessionPda,
          sessionCounter: counterPda,
          playerProfile: profilePda,
          player: wallet.publicKey,
          sessionSigner: sessionSignerPublicKey,
          sessionManagerAuthority: sessionManagerAuthorityPda,
          mapConfig: mapConfigPda,
          generatedMap: generatedMapPda,
          sessionDiscovery: null, // Skipped — init separately to avoid insufficient lamports
          gameState: gameStatePda,
          mapPois: poisPda,
          inventory: inventoryPda,
          mapVrfState: mapVrfStatePda ?? null,
          mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
          gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
          poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return { transaction, sessionPda };
    },
    [wallet.publicKey, baseWriteProgram]
  );

  const buildStartGauntletSessionTransaction = useCallback(
    async (
      sessionSignerPublicKey: PublicKey,
      mapVrfStatePda?: PublicKey | null,
      nonceOverride?: bigint
    ): Promise<{ transaction: Transaction; sessionPda: PublicKey } | null> => {
      if (!wallet.publicKey || !baseWriteProgram) {
        return null;
      }

      const GAUNTLET_ONCHAIN_LEVEL = 20;
      activeOnChainLevelRef.current = GAUNTLET_ONCHAIN_LEVEL;

      const nonce = nonceOverride ?? (await fetchSessionNonces(wallet.publicKey)).gauntlet;
      const [sessionPda] = deriveGauntletSessionPda(wallet.publicKey, nonce);
      activeSessionPdaRef.current = sessionPda;
      setActiveSessionPdaState(sessionPda);
      const [counterPda] = deriveSessionCounterPda();
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
      const [mapConfigPda] = deriveMapConfigPda();
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
      const [sessionManagerAuthorityPda] = deriveSessionManagerAuthorityPda();

      const transaction = await (baseWriteProgram.methods as any)
        .startGauntletSession()
        .accountsPartial({
          sessionNonces: sessionNoncesPda,
          gameSession: sessionPda,
          sessionCounter: counterPda,
          playerProfile: profilePda,
          player: wallet.publicKey,
          sessionSigner: sessionSignerPublicKey,
          sessionManagerAuthority: sessionManagerAuthorityPda,
          generatedMap: generatedMapPda,
          sessionDiscovery: null,
          gameState: gameStatePda,
          mapPois: poisPda,
          inventory: inventoryPda,
          mapVrfState: mapVrfStatePda ?? null,
          mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
          gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
          poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return { transaction, sessionPda };
    },
    [wallet.publicKey, baseWriteProgram]
  );

  /**
   * Builds a start session transaction without sending it.
   * Used for combining with other instructions in a single transaction.
   */
  const buildStartSessionTransaction = useCallback(
    async (
      campaignLevel: number,
      sessionSignerPublicKey: PublicKey,
      nonceOverride?: bigint
    ): Promise<{ transaction: Transaction; sessionPda: PublicKey } | null> => {
      if (!wallet.publicKey || !baseWriteProgram) {
        return null;
      }

      if (campaignLevel < 0 || campaignLevel > MAX_CAMPAIGN_LEVEL) {
        return null;
      }

      // Frontend levels are 0-indexed, on-chain expects 1-indexed (1-40)
      const onChainLevel = campaignLevel + 1;
      activeOnChainLevelRef.current = onChainLevel;

      const nonce = nonceOverride ?? (await fetchSessionNonces(wallet.publicKey)).campaign;
      const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel, nonce);
      activeSessionPdaRef.current = sessionPda;
      setActiveSessionPdaState(sessionPda);
      const [counterPda] = deriveSessionCounterPda();
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
      const [mapConfigPda] = deriveMapConfigPda();
      const transaction = await baseWriteProgram.methods
        .startSession(onChainLevel)
        .accounts({
          gameSession: sessionPda,
          sessionCounter: counterPda,
          playerProfile: profilePda,
          player: wallet.publicKey,
          sessionSigner: sessionSignerPublicKey,
          mapConfig: mapConfigPda,
          generatedMap: generatedMapPda,
          sessionDiscovery: sessionDiscoveryPda,
          gameState: gameStatePda,
          mapPois: poisPda,
          inventory: inventoryPda,
          mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
          gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
          poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      return { transaction, sessionPda };
    },
    [wallet.publicKey, baseWriteProgram]
  );

  /**
   * Builds a delegate session transaction without sending it.
   * Intended to be bundled atomically with start_session in a single wallet signature.
   */
  const buildDelegateSessionTransaction = useCallback(
    async (
      campaignLevel: number,
      sessionSignerPublicKey: PublicKey,
      sessionPdaOverride?: PublicKey
    ): Promise<Transaction | null> => {
      if (!wallet.publicKey || !baseWriteProgram) {
        return null;
      }

      if (campaignLevel < 0 || campaignLevel > MAX_CAMPAIGN_LEVEL) {
        return null;
      }

      const onChainLevel = campaignLevel + 1;
      const [fallbackSessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
      const sessionPda = sessionPdaOverride ?? activeSessionPdaRef.current ?? fallbackSessionPda;
      const sessionDelegate = deriveDelegatePdas(sessionPda, SOLANA_CONFIG.programs.sessionManager);
      const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);

      const delegateSessionIx = await baseWriteProgram.methods
        .delegateSession(onChainLevel, SOLANA_CONFIG.magic.delegationValidator)
        .accountsStrict({
          bufferGameSession: sessionDelegate.buffer,
          delegationRecordGameSession: sessionDelegate.delegationRecord,
          delegationMetadataGameSession: sessionDelegate.delegationMetadata,
          gameSession: sessionPda,
          player: wallet.publicKey,
          sessionSigner: sessionSignerPublicKey,
          sessionNonces: sessionNoncesPda,
          ownerProgram: SOLANA_CONFIG.programs.sessionManager,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .instruction();

      return new Transaction().add(delegateSessionIx);
    },
    [wallet.publicKey, baseWriteProgram]
  );

  const delegateSession = useCallback(
    async (
      sessionSignerKeypair: Keypair,
      options?: {
        sessionPda?: PublicKey;
        onChainLevel?: number;
        /** VRF state types to delegate (pre-init'd on base). */
        delegateVrf?: ('poi' | 'map' | 'gameplay')[];
      }
    ): Promise<TransactionResult> => {
      if (!wallet.publicKey || !baseWriteProgram) {
        return { success: false, error: 'Wallet not connected' };
      }
      if (
        !gameplayStateWriteProgram ||
        !mapGeneratorWriteProgram ||
        !playerInventoryWriteProgram ||
        !poiSystemWriteProgram
      ) {
        return { success: false, error: 'Required delegate programs not available' };
      }

      const hasSessionOverride = Boolean(options?.sessionPda);
      if (!hasActiveSessionRef.current && !hasSessionOverride) {
        return { success: false, error: 'No active session to delegate' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const onChainLevel =
          options?.onChainLevel ??
          sessionRef.current?.campaignLevel ??
          activeOnChainLevelRef.current;
        const [fallbackSessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
        const sessionPda = options?.sessionPda ?? activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
        const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);
        const gameplayGameStateDelegate = deriveDelegatePdas(
          gameStatePda,
          SOLANA_CONFIG.programs.gameplayState
        );
        const generatedMapDelegate = deriveDelegatePdas(
          generatedMapPda,
          SOLANA_CONFIG.programs.mapGenerator
        );
        const inventoryDelegate = deriveDelegatePdas(
          inventoryPda,
          SOLANA_CONFIG.programs.playerInventory
        );
        const mapPoisDelegate = deriveDelegatePdas(mapPoisPda, SOLANA_CONFIG.programs.poiSystem);
        const sessionDiscoveryDelegate = deriveDelegatePdas(
          sessionDiscoveryPda,
          SOLANA_CONFIG.programs.mapGenerator
        );
        const delegationValidator = SOLANA_CONFIG.magic.delegationValidator;

        const delegateGameplayIx = await gameplayStateWriteProgram.methods
          .delegateGameplayAccounts(delegationValidator)
          .accountsStrict({
            gameState: gameStatePda,
            gameSession: sessionPda,
            player: sessionSignerKeypair.publicKey,
            bufferGameState: gameplayGameStateDelegate.buffer,
            delegationRecordGameState: gameplayGameStateDelegate.delegationRecord,
            delegationMetadataGameState: gameplayGameStateDelegate.delegationMetadata,
            ownerProgram: SOLANA_CONFIG.programs.gameplayState,
            delegationProgram: DELEGATION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .instruction();
        const delegateGeneratedMapIx = await mapGeneratorWriteProgram.methods
          .delegateGeneratedMap(delegationValidator)
          .accountsStrict({
            generatedMap: generatedMapPda,
            session: sessionPda,
            player: sessionSignerKeypair.publicKey,
            bufferGeneratedMap: generatedMapDelegate.buffer,
            delegationRecordGeneratedMap: generatedMapDelegate.delegationRecord,
            delegationMetadataGeneratedMap: generatedMapDelegate.delegationMetadata,
            ownerProgram: SOLANA_CONFIG.programs.mapGenerator,
            delegationProgram: DELEGATION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .instruction();
        const delegateInventoryIx = await playerInventoryWriteProgram.methods
          .delegateInventory(delegationValidator)
          .accountsStrict({
            inventory: inventoryPda,
            session: sessionPda,
            player: sessionSignerKeypair.publicKey,
            bufferInventory: inventoryDelegate.buffer,
            delegationRecordInventory: inventoryDelegate.delegationRecord,
            delegationMetadataInventory: inventoryDelegate.delegationMetadata,
            ownerProgram: SOLANA_CONFIG.programs.playerInventory,
            delegationProgram: DELEGATION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .instruction();
        const delegateMapPoisIx = await poiSystemWriteProgram.methods
          .delegateMapPois(delegationValidator)
          .accountsStrict({
            mapPois: mapPoisPda,
            gameSession: sessionPda,
            player: sessionSignerKeypair.publicKey,
            bufferMapPois: mapPoisDelegate.buffer,
            delegationRecordMapPois: mapPoisDelegate.delegationRecord,
            delegationMetadataMapPois: mapPoisDelegate.delegationMetadata,
            ownerProgram: SOLANA_CONFIG.programs.poiSystem,
            delegationProgram: DELEGATION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .instruction();
        const delegateSessionDiscoveryIx = await mapGeneratorWriteProgram.methods
          .delegateSessionDiscovery(delegationValidator)
          .accountsStrict({
            sessionDiscovery: sessionDiscoveryPda,
            session: sessionPda,
            player: sessionSignerKeypair.publicKey,
            bufferSessionDiscovery: sessionDiscoveryDelegate.buffer,
            delegationRecordSessionDiscovery: sessionDiscoveryDelegate.delegationRecord,
            delegationMetadataSessionDiscovery: sessionDiscoveryDelegate.delegationMetadata,
            ownerProgram: SOLANA_CONFIG.programs.mapGenerator,
            delegationProgram: DELEGATION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .instruction();
        const [sessionNoncesPda] = deriveSessionNoncesPda(wallet.publicKey);
        const delegateSessionIx = await baseWriteProgram.methods
          .delegateSession(onChainLevel, delegationValidator)
          .accountsStrict({
            bufferGameSession: deriveDelegatePdas(sessionPda, SOLANA_CONFIG.programs.sessionManager)
              .buffer,
            delegationRecordGameSession: deriveDelegatePdas(
              sessionPda,
              SOLANA_CONFIG.programs.sessionManager
            ).delegationRecord,
            delegationMetadataGameSession: deriveDelegatePdas(
              sessionPda,
              SOLANA_CONFIG.programs.sessionManager
            ).delegationMetadata,
            gameSession: sessionPda,
            player: wallet.publicKey,
            sessionSigner: sessionSignerKeypair.publicKey,
            sessionNonces: sessionNoncesPda,
            ownerProgram: SOLANA_CONFIG.programs.sessionManager,
            delegationProgram: DELEGATION_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          } as any)
          .instruction();

        // Split delegation into 2+ transactions to stay under the 1232-byte tx size limit.
        // Tx1: gameplay (gameState) + session
        // Tx2: generatedMap + inventory + mapPois
        // Tx3 (optional): VRF state accounts (poi, map, gameplay) — pre-initialized on base,
        //   delegated here so CPI-based VRF requests on ER can write to them.
        const delegationTx1 = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
          delegateGameplayIx,
          delegateSessionIx
        );
        const delegationTx2 = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
          delegateGeneratedMapIx,
          delegateSessionDiscoveryIx,
          delegateInventoryIx,
          delegateMapPoisIx
        );
        // Base-layer delegation must be confirmed before we start waiting on ER pickup.
        // Otherwise transient devnet send/confirm failures show up later as misleading
        // "delegation not propagated" errors even though the delegation transaction failed.
        await sendSessionSignerTransaction(baseConnection, delegationTx1, sessionSignerKeypair);
        await sendSessionSignerTransaction(baseConnection, delegationTx2, sessionSignerKeypair);

        // Tx2b (optional): Delegate GauntletEchoes if it exists (gauntlet sessions only).
        const gauntletEchoesInfo = await baseConnection
          .getAccountInfo(gauntletEchoesPda, 'processed')
          .catch(() => null);
        if (gauntletEchoesInfo) {
          const gauntletEchoesDelegate = deriveDelegatePdas(
            gauntletEchoesPda,
            SOLANA_CONFIG.programs.gameplayState
          );
          const delegateGauntletEchoesIx = await gameplayStateWriteProgram.methods
            .delegateGauntletEchoes(delegationValidator)
            .accountsStrict({
              gauntletEchoes: gauntletEchoesPda,
              gameSession: sessionPda,
              player: sessionSignerKeypair.publicKey,
              bufferGauntletEchoes: gauntletEchoesDelegate.buffer,
              delegationRecordGauntletEchoes: gauntletEchoesDelegate.delegationRecord,
              delegationMetadataGauntletEchoes: gauntletEchoesDelegate.delegationMetadata,
              ownerProgram: SOLANA_CONFIG.programs.gameplayState,
              delegationProgram: DELEGATION_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            } as any)
            .instruction();
          const delegationTxGe = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
            delegateGauntletEchoesIx
          );
          await sendSessionSignerTransaction(baseConnection, delegationTxGe, sessionSignerKeypair);
        }

        // Tx3: Delegate VRF state accounts if requested.
        // VRF states must be pre-initialized on base before this step.
        const vrfTypes = options?.delegateVrf ?? [];
        let signature: string | undefined;
        if (vrfTypes.length > 0) {
          const delegationTx3 = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 })
          );

          if (vrfTypes.includes('poi')) {
            const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
            const poiVrfDelegate = deriveDelegatePdas(poiVrfStatePda, SOLANA_CONFIG.programs.poiSystem);
            const delegatePoiVrfIx = await poiSystemWriteProgram.methods
              .delegatePoiVrfState(delegationValidator)
              .accountsStrict({
                poiVrfState: poiVrfStatePda,
                gameSession: sessionPda,
                player: sessionSignerKeypair.publicKey,
                bufferPoiVrfState: poiVrfDelegate.buffer,
                delegationRecordPoiVrfState: poiVrfDelegate.delegationRecord,
                delegationMetadataPoiVrfState: poiVrfDelegate.delegationMetadata,
                ownerProgram: SOLANA_CONFIG.programs.poiSystem,
                delegationProgram: DELEGATION_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              } as any)
              .instruction();
            delegationTx3.add(delegatePoiVrfIx);
          }

          if (vrfTypes.includes('map')) {
            const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
            const mapVrfDelegate = deriveDelegatePdas(mapVrfStatePda, SOLANA_CONFIG.programs.mapGenerator);
            const delegateMapVrfIx = await mapGeneratorWriteProgram.methods
              .delegateMapVrfState(delegationValidator)
              .accountsStrict({
                mapVrfState: mapVrfStatePda,
                session: sessionPda,
                player: sessionSignerKeypair.publicKey,
                bufferMapVrfState: mapVrfDelegate.buffer,
                delegationRecordMapVrfState: mapVrfDelegate.delegationRecord,
                delegationMetadataMapVrfState: mapVrfDelegate.delegationMetadata,
                ownerProgram: SOLANA_CONFIG.programs.mapGenerator,
                delegationProgram: DELEGATION_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              } as any)
              .instruction();
            delegationTx3.add(delegateMapVrfIx);
          }

          if (vrfTypes.includes('gameplay')) {
            const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
            const gameplayVrfDelegate = deriveDelegatePdas(gameplayVrfStatePda, SOLANA_CONFIG.programs.gameplayState);
            const delegateGameplayVrfIx = await gameplayStateWriteProgram.methods
              .delegateGameplayVrfState(delegationValidator)
              .accountsStrict({
                gameplayVrfState: gameplayVrfStatePda,
                gameSession: sessionPda,
                player: sessionSignerKeypair.publicKey,
                bufferGameplayVrfState: gameplayVrfDelegate.buffer,
                delegationRecordGameplayVrfState: gameplayVrfDelegate.delegationRecord,
                delegationMetadataGameplayVrfState: gameplayVrfDelegate.delegationMetadata,
                ownerProgram: SOLANA_CONFIG.programs.gameplayState,
                delegationProgram: DELEGATION_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
              } as any)
              .instruction();
            delegationTx3.add(delegateGameplayVrfIx);
          }

          signature = await sendSessionSignerTransaction(
            baseConnection,
            delegationTx3,
            sessionSignerKeypair
          );
        }

        // Warm ER connections (fire-and-forget). On React Native, the first HTTP request
        // to a host pays a full TLS handshake (~500ms). This pre-establishes connections
        // so gameplay sendTransaction is fast.
        const { warmErBlockhashCache } = await import('@/services/solana/sessionSigner');
        warmErBlockhashCache(erConnection);
        erConnection.getSlot().catch(() => {});

        // Refresh session state
        await fetchSession();

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [baseConnection, erConnection, fetchSession, hasActiveSession, session, wallet.publicKey, baseWriteProgram]
  );

  const commitSession = useCallback(
    async (stateHash: number[]): Promise<TransactionResult> => {
      if (!wallet.publicKey || !erWriteProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!hasActiveSessionRef.current) {
        return { success: false, error: 'No active session to commit' };
      }

      if (stateHash.length !== 32) {
        return { success: false, error: 'State hash must be 32 bytes' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const onChainLevel = sessionRef.current?.campaignLevel ?? activeOnChainLevelRef.current;
        const [fallbackSessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
        const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);

        const { programId: magicProgramId, contextId: magicContextId } = SOLANA_CONFIG.magic;

        // Check if poiVrfState is delegated (VRF sessions only)
        const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
        const poiVrfInfo = await erConnection.getAccountInfo(poiVrfStatePda).catch(() => null);

        const transaction = await erWriteProgram.methods
          .commitSession(onChainLevel, stateHash)
          .accountsPartial({
            gameSession: sessionPda,
            gameState: gameStatePda,
            generatedMap: generatedMapPda,
            inventory: inventoryPda,
            mapPois: mapPoisPda,
            poiVrfState: poiVrfInfo ? poiVrfStatePda : null,
            player: wallet.publicKey,
            magicProgram: magicProgramId,
            magicContext: magicContextId,
          } as any)
          .transaction();

        const signature = await signAndSendTransaction(transaction, {
          connection: erConnection,
          skipPreflight: true,
        });
        await erConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        // Refresh session state
        await fetchSession();

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [erConnection, fetchSession, signAndSendTransaction, wallet.publicKey, erWriteProgram]
  );

  const undelegateSession = useCallback(
    async (stateHash: number[], sessionSignerKeypair: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey || !erWriteProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (!hasActiveSessionRef.current) {
        return { success: false, error: 'No active session to undelegate' };
      }

      if (stateHash.length !== 32) {
        return { success: false, error: 'State hash must be 32 bytes' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const onChainLevel = sessionRef.current?.campaignLevel ?? activeOnChainLevelRef.current;
        const [fallbackSessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
        const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);

        // Frontend state can be stale (e.g., after interrupted cleanup). Check every account,
        // not only session PDA, because mixed ownership causes InvalidWritableAccount on move.
        const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
        const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
        const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);
        const [
          baseSessionInfo,
          baseGameStateInfo,
          baseGeneratedMapInfo,
          baseInventoryInfo,
          baseMapPoisInfo,
          basePoiVrfInfo,
          baseSessionDiscoveryInfo,
          baseGauntletEchoesInfo,
        ] = await Promise.all([
          baseConnection.getAccountInfo(sessionPda, 'processed'),
          baseConnection.getAccountInfo(gameStatePda, 'processed'),
          baseConnection.getAccountInfo(generatedMapPda, 'processed'),
          baseConnection.getAccountInfo(inventoryPda, 'processed'),
          baseConnection.getAccountInfo(mapPoisPda, 'processed'),
          baseConnection.getAccountInfo(poiVrfStatePda, 'processed').catch(() => null),
          baseConnection.getAccountInfo(sessionDiscoveryPda, 'processed').catch(() => null),
          baseConnection.getAccountInfo(gauntletEchoesPda, 'processed').catch(() => null),
        ]);
        if (!baseSessionInfo) {
          return { success: false, error: 'Session account not found' };
        }
        const delegatedSession = !!baseSessionInfo.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedGameState = !!baseGameStateInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedMap = !!baseGeneratedMapInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedInventory = !!baseInventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedPois = !!baseMapPoisInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedPoiVrf = !!basePoiVrfInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedSessionDiscovery = !!baseSessionDiscoveryInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedGauntletEchoes = !!baseGauntletEchoesInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const hasAnyDelegated =
          delegatedSession ||
          delegatedGameState ||
          delegatedMap ||
          delegatedInventory ||
          delegatedPois ||
          delegatedPoiVrf ||
          delegatedSessionDiscovery ||
          delegatedGauntletEchoes;
        if (!hasAnyDelegated) {
          console.warn(
            '[useSessionManager] undelegateSession skipped: no delegated accounts detected'
          );
          await fetchSession();
          return { success: true, signature: 'undelegate_skipped_not_delegated' };
        }

        const { programId: magicProgramId, contextId: magicContextId } = SOLANA_CONFIG.magic;

        const gameplayProgramEr = createGameplayStateProgram(erConnection);
        const mapGeneratorProgramEr = createMapGeneratorProgram(erConnection);
        const playerInventoryProgramEr = createPlayerInventoryProgram(erConnection);
        const poiSystemProgramEr = createPoiSystemProgram(erConnection);

        // Check if an account is already restored to its expected base-layer owner.
        const isAlreadyRestored = async (
          account: PublicKey,
          expectedOwner: PublicKey
        ): Promise<boolean> => {
          const info = await baseConnection.getAccountInfo(account, 'confirmed');
          return !!info?.owner.equals(expectedOwner);
        };

        // Helper: send undelegate tx to ER. If it fails, check whether the
        // account(s) were already restored on base (previous partial attempt
        // succeeded on ER but base hadn't caught up when we checked owners).
        // If restored, skip silently. Otherwise, re-throw.
        const undelegateErrors: string[] = [];
        const isRecoverableUndelegateError = (message: string): boolean =>
          message.includes('InvalidAccountOwner') ||
          message.includes('InvalidWritableAccount') ||
          message.includes('ReadonlyDataModified') ||
          message.toLowerCase().includes('blockhash not found');
        const tryUndelegateOrSkip = async (
          sendTx: () => Promise<void>,
          checks: Array<[PublicKey, PublicKey, string]>,
          continueOnFailure = false
        ): Promise<void> => {
          const labels = checks.map(([, , l]) => l).join(', ');
          const maxAttempts = 3;
          let lastError: unknown = null;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              await sendTx();
              console.log(
                `[useSessionManager] undelegate ${labels}: success (attempt ${attempt}/${maxAttempts})`
              );
              return;
            } catch (err) {
              lastError = err;
              const errMsg = err instanceof Error ? err.message : String(err);
              console.warn(
                `[useSessionManager] undelegate ${labels}: tx failed (attempt ${attempt}/${maxAttempts}) —`,
                errMsg
              );

              // Give base layer time to reflect any prior commit before deciding to retry/fail.
              await new Promise((resolve) => setTimeout(resolve, 1200));
              const restored = await Promise.all(
                checks.map(([pda, owner]) => isAlreadyRestored(pda, owner))
              );
              const allRestored = restored.every(Boolean);
              checks.forEach(([pda, , label], idx) => {
                console.log(
                  `[useSessionManager] undelegate ${label}: base restored = ${restored[idx]} (${pda.toBase58().slice(0, 8)}…)`
                );
              });
              if (allRestored) {
                console.log(
                  `[useSessionManager] undelegate ${labels}: already restored on base; skipping`
                );
                return;
              }

              const recoverable = isRecoverableUndelegateError(errMsg);
              const canRetry = recoverable && attempt < maxAttempts;
              if (canRetry) {
                await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
                continue;
              }

              if (continueOnFailure) {
                if (!recoverable) {
                  undelegateErrors.push(`${labels}: ${errMsg}`);
                } else {
                  console.log(
                    `[useSessionManager] undelegate ${labels}: recoverable tx error after retries; waiting for base owner restoration`
                  );
                }
                return;
              }

              throw err;
            }
          }
          if (!continueOnFailure && lastError) throw lastError;
        };

        // Log initial account owners for diagnostics
        console.log('[useSessionManager] undelegate: base account owners', {
          session: delegatedSession ? 'DELEGATED' : 'base',
          gameState: delegatedGameState ? 'DELEGATED' : 'base',
          map: delegatedMap ? 'DELEGATED' : 'base',
          inventory: delegatedInventory ? 'DELEGATED' : 'base',
          pois: delegatedPois ? 'DELEGATED' : 'base',
          poiVrf: delegatedPoiVrf ? 'DELEGATED' : basePoiVrfInfo ? 'base' : 'n/a',
          sessionDiscovery: delegatedSessionDiscovery ? 'DELEGATED' : baseSessionDiscoveryInfo ? 'base' : 'n/a',
          gauntletEchoes: delegatedGauntletEchoes ? 'DELEGATED' : baseGauntletEchoesInfo ? 'base' : 'n/a',
        });

        // Send-and-confirm helper for ER undelegation.
        // MagicBlock ER requires skipPreflight: true — simulation does not
        // handle delegated accounts correctly on the ER.
        const UNDELEGATE_CU_LIMIT = 400_000;
        const sendAndConfirmOnEr = async (tx: Transaction, label: string): Promise<string> => {
          tx.instructions.unshift(
            ComputeBudgetProgram.setComputeUnitLimit({ units: UNDELEGATE_CU_LIMIT })
          );
          const sig = await sendSessionSignerTransaction(erConnection, tx, sessionSignerKeypair);
          console.log(`[useSessionManager] undelegate ${label}: confirmed ${sig.slice(0, 20)}…`);
          return sig;
        };

        // Undelegate all child accounts in parallel, then session last.
        // Each undelegation TX is independent (different accounts, different programs).
        const childUndelegations: Promise<void>[] = [];

        if (delegatedGameState) {
          childUndelegations.push(tryUndelegateOrSkip(
            async () => {
              const undelegateGameplayTx = await gameplayProgramEr.methods
                .undelegateGameplayAccounts()
                .accounts({
                  gameState: gameStatePda,
                  gameSession: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendAndConfirmOnEr(undelegateGameplayTx, 'gameplay');
            },
            [
              [gameStatePda, SOLANA_CONFIG.programs.gameplayState, 'game_state'],
            ],
            true
          ));
        }

        if (delegatedMap) {
          childUndelegations.push(tryUndelegateOrSkip(
            async () => {
              const undelegateMapTx = await mapGeneratorProgramEr.methods
                .undelegateGeneratedMap()
                .accounts({
                  generatedMap: generatedMapPda,
                  session: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendAndConfirmOnEr(undelegateMapTx, 'generated_map');
            },
            [[generatedMapPda, SOLANA_CONFIG.programs.mapGenerator, 'generated_map']],
            true
          ));
        }

        if (delegatedSessionDiscovery) {
          childUndelegations.push(tryUndelegateOrSkip(
            async () => {
              const undelegateDiscoveryTx = await mapGeneratorProgramEr.methods
                .undelegateSessionDiscovery()
                .accounts({
                  sessionDiscovery: sessionDiscoveryPda,
                  session: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendAndConfirmOnEr(undelegateDiscoveryTx, 'session_discovery');
            },
            [[sessionDiscoveryPda, SOLANA_CONFIG.programs.mapGenerator, 'session_discovery']],
            true
          ));
        }

        if (delegatedGauntletEchoes) {
          childUndelegations.push(tryUndelegateOrSkip(
            async () => {
              const undelegateGauntletEchoesTx = await gameplayProgramEr.methods
                .undelegateGauntletEchoes()
                .accounts({
                  gauntletEchoes: gauntletEchoesPda,
                  gameSession: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendAndConfirmOnEr(undelegateGauntletEchoesTx, 'gauntlet_echoes');
            },
            [[gauntletEchoesPda, SOLANA_CONFIG.programs.gameplayState, 'gauntlet_echoes']],
            true
          ));
        }

        if (delegatedInventory) {
          childUndelegations.push(tryUndelegateOrSkip(
            async () => {
              const undelegateInventoryTx = await playerInventoryProgramEr.methods
                .undelegateInventory()
                .accounts({
                  inventory: inventoryPda,
                  session: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendAndConfirmOnEr(undelegateInventoryTx, 'inventory');
            },
            [[inventoryPda, SOLANA_CONFIG.programs.playerInventory, 'inventory']],
            true
          ));
        }

        if (delegatedPois) {
          childUndelegations.push(tryUndelegateOrSkip(
            async () => {
              const undelegatePoisTx = await poiSystemProgramEr.methods
                .undelegateMapPois()
                .accounts({
                  mapPois: mapPoisPda,
                  gameSession: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendAndConfirmOnEr(undelegatePoisTx, 'map_pois');
            },
            [[mapPoisPda, SOLANA_CONFIG.programs.poiSystem, 'map_pois']],
            true
          ));
        }

        if (delegatedPoiVrf) {
          childUndelegations.push(tryUndelegateOrSkip(
            async () => {
              const undelegatePoiVrfTx = await poiSystemProgramEr.methods
                .undelegatePoiVrfState()
                .accounts({
                  poiVrfState: poiVrfStatePda,
                  gameSession: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendSessionSignerTransaction(
                erConnection,
                undelegatePoiVrfTx,
                sessionSignerKeypair
              );
            },
            [[poiVrfStatePda, SOLANA_CONFIG.programs.poiSystem, 'poi_vrf_state']],
            true
          ));
        }

        // Send all child undelegations in parallel
        await Promise.all(childUndelegations);

        // Undelegate the session account last (parent)
        let signature = 'undelegate_partial';
        if (delegatedSession) {
          await tryUndelegateOrSkip(
            async () => {
              const transaction = await erWriteProgram.methods
                .undelegateSession(onChainLevel, stateHash)
                .accounts({
                  gameSession: sessionPda,
                  player: wallet.publicKey!,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              signature = await sendAndConfirmOnEr(transaction, 'session');
            },
            [[sessionPda, SOLANA_CONFIG.programs.sessionManager, 'game_session']],
            true
          );
        }

        // Wait for ALL accounts to be restored on base chain.
        const allChecks: Array<[PublicKey, PublicKey, string]> = [];
        if (delegatedGameState) {
          allChecks.push([gameStatePda, SOLANA_CONFIG.programs.gameplayState, 'game_state']);
        }
        if (delegatedMap) {
          allChecks.push([generatedMapPda, SOLANA_CONFIG.programs.mapGenerator, 'generated_map']);
        }
        if (delegatedSessionDiscovery) {
          allChecks.push([sessionDiscoveryPda, SOLANA_CONFIG.programs.mapGenerator, 'session_discovery']);
        }
        if (delegatedGauntletEchoes) {
          allChecks.push([gauntletEchoesPda, SOLANA_CONFIG.programs.gameplayState, 'gauntlet_echoes']);
        }
        if (delegatedInventory) {
          allChecks.push([inventoryPda, SOLANA_CONFIG.programs.playerInventory, 'inventory']);
        }
        if (delegatedPois) {
          allChecks.push([mapPoisPda, SOLANA_CONFIG.programs.poiSystem, 'map_pois']);
        }
        if (delegatedPoiVrf) {
          allChecks.push([poiVrfStatePda, SOLANA_CONFIG.programs.poiSystem, 'poi_vrf_state']);
        }
        if (delegatedSession) {
          allChecks.push([sessionPda, SOLANA_CONFIG.programs.sessionManager, 'game_session']);
        }

        let allRestored = false;
        // Wait for ER→base commit propagation, then poll.
        // With parallel undelegation TXs already confirmed on ER, base restoration
        // typically completes within 2-3s.
        console.log('[useSessionManager] undelegate: waiting 2s for base layer restoration...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        for (let i = 0; i < 30; i += 1) {
          const infos = await Promise.all(
            allChecks.map(([pda]) => baseConnection.getAccountInfo(pda, 'processed'))
          );
          allRestored = infos.every((info, idx) => info?.owner.equals(allChecks[idx][1]));
          if (allRestored) break;
          if (i === 0) {
            // Log which accounts are NOT yet restored on first check
            infos.forEach((info, idx) => {
              const restored = !!info?.owner.equals(allChecks[idx][1]);
              if (!restored) {
                console.log(
                  `[useSessionManager] undelegate: waiting for ${allChecks[idx][2]} (owner=${info?.owner.toBase58() ?? 'null'})`
                );
              }
            });
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // LOCAL-ONLY: If ER-based undelegation didn't restore accounts, try
        // force-undelegate via the Delegation Program directly on the base layer.
        if (!allRestored && isForceUndelegateAvailable()) {
          const stillDelegated = (
            await Promise.all(
              allChecks.map(([pda]) => baseConnection.getAccountInfo(pda, 'processed'))
            )
          )
            .map((info, idx) => ({ info, pda: allChecks[idx][0], label: allChecks[idx][2] }))
            .filter(({ info }) => info && info.owner.equals(DELEGATION_PROGRAM_ID));

          if (stillDelegated.length > 0) {
            console.log(
              '[useSessionManager] undelegate: falling back to local force-undelegate for:',
              stillDelegated.map((a) => a.label)
            );
            const count = await forceUndelegateAccounts(
              baseConnection,
              stillDelegated.map((a) => a.pda)
            );
            console.log(
              `[useSessionManager] force-undelegated ${count}/${stillDelegated.length} accounts`
            );
            // Re-check after force-undelegate
            const recheckInfos = await Promise.all(
              allChecks.map(([pda]) => baseConnection.getAccountInfo(pda, 'processed'))
            );
            allRestored = recheckInfos.every((info, idx) => info?.owner.equals(allChecks[idx][1]));
            if (allRestored) {
              console.log('[useSessionManager] All accounts restored after force-undelegate');
            }
          }
        }

        if (!allRestored && undelegateErrors.length > 0) {
          throw new Error(`Undelegate failed for: ${undelegateErrors.join(' | ')}`);
        }

        if (!allRestored) {
          const sessionInfo = await baseConnection.getAccountInfo(sessionPda, 'processed');
          const sessionRestored = !!sessionInfo?.owner.equals(
            SOLANA_CONFIG.programs.sessionManager
          );
          if (sessionRestored) {
            console.warn(
              '[useSessionManager] undelegate: session restored but some child owners still delegated; continuing with partial success'
            );
            await fetchSession();
            return { success: true, signature };
          }
          throw new Error('Owner not restored for all accounts after undelegate');
        }

        if (baseGauntletEchoesInfo || delegatedGauntletEchoes) {
          const gauntletEchoesInfo = await baseConnection
            .getAccountInfo(gauntletEchoesPda, 'processed')
            .catch(() => null);
          if (gauntletEchoesInfo?.owner.equals(SOLANA_CONFIG.programs.gameplayState)) {
            const gameplayProgramBase = createGameplayStateProgram(baseConnection);
            const closeGauntletEchoesTx = await gameplayProgramBase.methods
              .closeGauntletEchoes()
              .accounts({
                gauntletEchoes: gauntletEchoesPda,
                gameState: gameStatePda,
                player: wallet.publicKey,
                sessionSigner: sessionSignerKeypair.publicKey,
              })
              .transaction();
            await sendSessionSignerTransaction(
              baseConnection,
              closeGauntletEchoesTx,
              sessionSignerKeypair
            );
            console.log(
              '[useSessionManager] undelegate: closed gauntlet_echoes after base restoration'
            );
          }
        }

        await fetchSession();

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [baseConnection, erConnection, erWriteProgram, fetchSession, wallet.publicKey]
  );

  /**
   * Settle run result without closing session accounts.
   * Idempotent on-chain: safe to call before endSession retries.
   */
  const settleSessionResult = useCallback(
    async (sessionSignerKeypair: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      const currentSession = sessionRef.current;
      const currentHasActive = hasActiveSessionRef.current;
      if (!currentHasActive || !currentSession) {
        return { success: false, error: 'No active session to settle' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [fallbackSessionPda] = deriveSessionPda(
          wallet.publicKey,
          currentSession.campaignLevel
        );
        const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [playerProfilePda] = derivePlayerProfilePda(wallet.publicKey);

        const program = createSessionManagerProgram(baseConnection);
        const transaction = new Transaction();

        const settleIx = await program.methods
          .settleSessionResult(currentSession.campaignLevel)
          .accounts({
            gameSession: sessionPda,
            gameState: gameStatePda,
            playerProfile: playerProfilePda,
            player: wallet.publicKey,
            sessionSigner: sessionSignerKeypair.publicKey,
            sessionManagerAuthority: deriveSessionManagerAuthorityPda()[0],
            playerProfileProgram: SOLANA_CONFIG.programs.playerProfile,
          })
          .instruction();
        transaction.add(settleIx);

        const { blockhash } = await baseConnection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = sessionSignerKeypair.publicKey;
        transaction.sign(sessionSignerKeypair);

        const signature = await baseConnection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: SOLANA_CONFIG.commitment,
        });
        await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
        console.log('[useSessionManager] Session result settled successfully:', signature);
        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        console.error('[useSessionManager] Failed to settle session result:', message, txError);
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [baseConnection, wallet.publicKey]
  );

  /**
   * Emergency fallback: close only the session PDA after terminal state settlement.
   * Used when ER child-account undelegation is stuck.
   */
  const closeSessionOnly = useCallback(
    async (sessionSignerKeypair: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      const currentSession = sessionRef.current;
      const currentHasActive = hasActiveSessionRef.current;
      if (!currentHasActive || !currentSession) {
        return { success: false, error: 'No active session to close' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [fallbackSessionPda] = deriveSessionPda(
          wallet.publicKey,
          currentSession.campaignLevel
        );
        const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [playerProfilePda] = derivePlayerProfilePda(wallet.publicKey);

        const program = createSessionManagerProgram(baseConnection);
        const transaction = new Transaction();

        const [duelEntryPda] = deriveDuelEntryPda(sessionPda);
        const duelEntryInfo = await baseConnection.getAccountInfo(duelEntryPda);
        if (duelEntryInfo) {
          const gameplayProgram = createGameplayStateProgram(baseConnection);
          const resetIx = await buildResetDuelEntryInstruction(
            gameplayProgram,
            sessionPda,
            gameStatePda,
            wallet.publicKey,
            sessionSignerKeypair.publicKey
          );
          transaction.add(resetIx);
        }

        const closeIx = await program.methods
          .closeSessionOnly()
          .accounts({
            gameSession: sessionPda,
            gameState: gameStatePda,
            playerProfile: playerProfilePda,
            player: wallet.publicKey,
            sessionSigner: sessionSignerKeypair.publicKey,
            sessionManagerAuthority: deriveSessionManagerAuthorityPda()[0],
            playerProfileProgram: SOLANA_CONFIG.programs.playerProfile,
          })
          .instruction();
        transaction.add(closeIx);

        const { blockhash } = await baseConnection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = sessionSignerKeypair.publicKey;
        transaction.sign(sessionSignerKeypair);

        const signature = await baseConnection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: SOLANA_CONFIG.commitment,
        });
        await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        console.log('[useSessionManager] Session closed via closeSessionOnly:', signature);
        sessionRef.current = null;
        hasActiveSessionRef.current = false;
        activeSessionPdaRef.current = null;
        if (isMountedRef.current) {
          setSession(null);
          setHasActiveSession(false);
          setActiveSessionPdaState(null);
        }

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        console.error('[useSessionManager] Failed to close session only:', message, txError);
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [baseConnection, wallet.publicKey]
  );

  /**
   * Tolerant session close: settles result and closes whichever child accounts
   * are on base layer. Delegated/missing children are skipped. This prevents
   * the soft-lock where close_session_only leaves orphaned child accounts that
   * block start_session.
   */
  const forceCloseSession = useCallback(
    async (sessionSignerKeypair: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      const currentSession = sessionRef.current;
      const currentHasActive = hasActiveSessionRef.current;
      if (!currentHasActive || !currentSession) {
        return { success: false, error: 'No active session to force-close' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [fallbackSessionPda] = deriveSessionPda(
          wallet.publicKey,
          currentSession.campaignLevel
        );
        const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [playerProfilePda] = derivePlayerProfilePda(wallet.publicKey);

        const program = createSessionManagerProgram(baseConnection);
        const transaction = new Transaction();

        const [duelEntryPda] = deriveDuelEntryPda(sessionPda);
        const duelEntryInfo = await baseConnection.getAccountInfo(duelEntryPda);
        if (duelEntryInfo) {
          const gameplayProgram = createGameplayStateProgram(baseConnection);
          const resetIx = await buildResetDuelEntryInstruction(
            gameplayProgram,
            sessionPda,
            gameStatePda,
            wallet.publicKey,
            sessionSignerKeypair.publicKey
          );
          transaction.add(resetIx);
        }

        const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
        const forceCloseIx = await program.methods
          .forceCloseSession()
          .accounts({
            gameSession: sessionPda,
            gameState: gameStatePda,
            generatedMap: generatedMapPda,
            mapPois: mapPoisPda,
            inventory: inventoryPda,
            sessionDiscovery: sessionDiscoveryPda,
            playerProfile: playerProfilePda,
            player: wallet.publicKey,
            sessionSigner: sessionSignerKeypair.publicKey,
            sessionManagerAuthority: deriveSessionManagerAuthorityPda()[0],
            playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
            gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
            playerProfileProgram: SOLANA_CONFIG.programs.playerProfile,
            mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
            poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          })
          .instruction();
        transaction.add(forceCloseIx);

        const { blockhash } = await baseConnection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = sessionSignerKeypair.publicKey;
        transaction.sign(sessionSignerKeypair);

        const signature = await baseConnection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: SOLANA_CONFIG.commitment,
        });
        await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        console.log('[useSessionManager] Session force-closed:', signature);
        sessionRef.current = null;
        hasActiveSessionRef.current = false;
        activeSessionPdaRef.current = null;
        if (isMountedRef.current) {
          setSession(null);
          setHasActiveSession(false);
          setActiveSessionPdaState(null);
        }

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        console.error('[useSessionManager] Failed to force-close session:', message, txError);
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [baseConnection, wallet.publicKey]
  );

  /**
   * Close orphaned child accounts after force_close_session already freed the session PDA.
   * Calls session-manager's close_orphaned_accounts which CPIs into child programs.
   * Only closes accounts that are on base layer (owned by their programs).
   * Order: map_pois → game_state (game_state last since others depend on it).
   */
  const closeOrphanedAccounts = useCallback(
    async (sessionPda: PublicKey, sessionSignerKeypair: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);

        const program = createSessionManagerProgram(baseConnection);
        const transaction = new Transaction();

        const ix = await program.methods
          .closeOrphanedAccounts()
          .accounts({
            gameState: gameStatePda,
            mapPois: mapPoisPda,
            player: wallet.publicKey,
            sessionSigner: sessionSignerKeypair.publicKey,
            gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
            poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          })
          .instruction();
        transaction.add(ix);

        const { blockhash } = await baseConnection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = sessionSignerKeypair.publicKey;
        transaction.sign(sessionSignerKeypair);

        const signature = await baseConnection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: SOLANA_CONFIG.commitment,
        });
        await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        console.log('[useSessionManager] Orphaned accounts closed:', signature);
        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        console.error('[useSessionManager] Failed to close orphaned accounts:', message, txError);
        return { success: false, error: message };
      }
    },
    [baseConnection, wallet.publicKey]
  );

  /**
   * Close corrupted/empty orphaned accounts individually.
   * After an ER reset + force-undelegate, accounts may have 0-byte data.
   * This calls the close_empty_* instructions on each program directly.
   */
  const closeEmptyOrphanedAccounts = useCallback(
    async (sessionPda: PublicKey, signerKeypair: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      try {
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);

        const gameplayProgram = createGameplayStateProgram(baseConnection);
        const poiProgram = createPoiSystemProgram(baseConnection);
        const transaction = new Transaction();

        // Check each account and add close_empty_* ix if it exists with 0 data
        const [gsInfo, mpInfo] = await Promise.all([
          baseConnection.getAccountInfo(gameStatePda, 'confirmed'),
          baseConnection.getAccountInfo(mapPoisPda, 'confirmed'),
        ]);

        if (mpInfo && mpInfo.data.length === 0) {
          console.log('[useSessionManager] Adding close_empty_map_pois ix');
          const ix = await poiProgram.methods
            .closeEmptyMapPois()
            .accounts({
              mapPois: mapPoisPda,
              destination: wallet.publicKey,
              payer: signerKeypair.publicKey,
            })
            .instruction();
          transaction.add(ix);
        }

        if (gsInfo && gsInfo.data.length === 0) {
          console.log('[useSessionManager] Adding close_empty_game_state ix');
          const ix = await gameplayProgram.methods
            .closeEmptyGameState()
            .accounts({
              gameState: gameStatePda,
              destination: wallet.publicKey,
              payer: signerKeypair.publicKey,
            })
            .instruction();
          transaction.add(ix);
        } else if (gsInfo && gsInfo.data.length > 0) {
          // game_state has valid data but session PDA is gone — close via session signer
          console.log(
            '[useSessionManager] Adding close_game_state_via_session_signer ix (valid data, orphaned)'
          );
          const ix = await gameplayProgram.methods
            .closeGameStateViaSessionSigner()
            .accounts({
              gameState: gameStatePda,
              player: wallet.publicKey,
              sessionSigner: signerKeypair.publicKey,
            })
            .instruction();
          transaction.add(ix);
        }

        if (transaction.instructions.length === 0) {
          console.log('[useSessionManager] No empty orphaned accounts to close');
          return { success: true };
        }

        const { blockhash } = await baseConnection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = signerKeypair.publicKey;
        transaction.sign(signerKeypair);

        const signature = await baseConnection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: SOLANA_CONFIG.commitment,
        });
        await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        console.log('[useSessionManager] Empty orphaned accounts closed:', signature);
        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        console.error(
          '[useSessionManager] Failed to close empty orphaned accounts:',
          message,
          txError
        );
        return { success: false, error: message };
      }
    },
    [baseConnection, wallet.publicKey]
  );

  /**
   * End session after death or level completion.
   * Only requires session signer - no user interaction needed.
   * Victory/defeat is determined on-chain from game_state.
   */
  const endSession = useCallback(
    async (sessionSignerKeypair: Keypair): Promise<TransactionResult> => {
      if (!wallet.publicKey) {
        return { success: false, error: 'Wallet not connected' };
      }

      // Read from refs (not closure state) so that callers who await fetchSession()
      // and then immediately call endSession() in the same async tick get the
      // freshly-fetched values instead of stale pre-render state.
      const currentSession = sessionRef.current;
      const currentHasActive = hasActiveSessionRef.current;

      if (!currentHasActive || !currentSession) {
        return { success: false, error: 'No active session to end' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [fallbackSessionPda] = deriveSessionPda(
          wallet.publicKey,
          currentSession.campaignLevel
        );
        const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [playerProfilePda] = derivePlayerProfilePda(wallet.publicKey);

        // Build transaction manually since we're only using the session signer
        const program = createSessionManagerProgram(baseConnection);
        const transaction = new Transaction();

        // duel_entry is non-delegated and keyed by session PDA, so detect it directly
        // instead of inferring duel mode from a possibly stale/default nonce.
        const [duelEntryPda] = deriveDuelEntryPda(sessionPda);
        const duelEntryInfo = await baseConnection.getAccountInfo(duelEntryPda);
        if (duelEntryInfo) {
          const gameplayProgram = createGameplayStateProgram(baseConnection);
          const resetIx = await buildResetDuelEntryInstruction(
            gameplayProgram,
            sessionPda,
            gameStatePda,
            wallet.publicKey,
            sessionSignerKeypair.publicKey
          );
          transaction.add(resetIx);
        }

        // Check which VRF accounts exist (only for sessions that used VRF)
        const [mapVrfStatePda] = deriveMapVrfStatePda(sessionPda);
        const [poiVrfStatePda] = derivePoiVrfStatePda(sessionPda);
        const [gameplayVrfStatePda] = deriveGameplayVrfStatePda(sessionPda);
        const [gauntletEchoesPda] = deriveGauntletEchoesPda(sessionPda);
        const [mapVrfInfo, poiVrfInfo, gameplayVrfInfo, gauntletEchoesInfo] = await Promise.all([
          baseConnection.getAccountInfo(mapVrfStatePda).catch(() => null),
          baseConnection.getAccountInfo(poiVrfStatePda).catch(() => null),
          baseConnection.getAccountInfo(gameplayVrfStatePda).catch(() => null),
          baseConnection.getAccountInfo(gauntletEchoesPda).catch(() => null),
        ]);

        const [sessionDiscoveryPda] = deriveSessionDiscoveryPda(sessionPda);
        const endSessionIx = await program.methods
          .endSession(currentSession.campaignLevel)
          .accountsPartial({
            gameSession: sessionPda,
            gameState: gameStatePda,
            generatedMap: generatedMapPda,
            mapPois: mapPoisPda,
            playerProfile: playerProfilePda,
            player: wallet.publicKey,
            sessionSigner: sessionSignerKeypair.publicKey,
            sessionManagerAuthority: deriveSessionManagerAuthorityPda()[0],
            inventory: inventoryPda,
            sessionDiscovery: sessionDiscoveryPda,
            mapVrfState: mapVrfInfo ? mapVrfStatePda : null,
            poiVrfState: poiVrfInfo ? poiVrfStatePda : null,
            gameplayVrfState: gameplayVrfInfo ? gameplayVrfStatePda : null,
            gauntletEchoes: gauntletEchoesInfo ? gauntletEchoesPda : null,
            playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
            gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
            playerProfileProgram: SOLANA_CONFIG.programs.playerProfile,
            mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
            poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          } as any)
          .instruction();
        transaction.add(endSessionIx);

        // Set blockhash and fee payer (session signer pays)
        const { blockhash } = await baseConnection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = sessionSignerKeypair.publicKey;

        // Sign with session signer only
        transaction.sign(sessionSignerKeypair);

        // Send raw transaction (no user signature needed)
        const signature = await baseConnection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: SOLANA_CONFIG.commitment,
        });
        await baseConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        console.log('[useSessionManager] Session ended successfully:', signature);

        // Clear session state
        sessionRef.current = null;
        hasActiveSessionRef.current = false;
        activeSessionPdaRef.current = null;
        if (isMountedRef.current) {
          setSession(null);
          setHasActiveSession(false);
          setActiveSessionPdaState(null);
        }

        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'session_manager');
        console.error('[useSessionManager] Failed to end session:', message, txError);
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [baseConnection, wallet.publicKey]
  );

  const resetSession = useCallback(() => {
    sessionRef.current = null;
    hasActiveSessionRef.current = false;
    activeSessionPdaRef.current = null;
    setSession(null);
    setHasActiveSession(false);
    setError(null);
    setActiveSessionPdaState(null);
  }, []);

  return {
    session,
    hasActiveSession,
    isLoading,
    error,
    /** The currently active session PDA (campaign, duel, or gauntlet). */
    activeSessionPda: activeSessionPdaState,
    fetchSession,
    startSession,
    overrideCampaignSession,
    overrideDuelSession,
    overrideGauntletSession,
    buildOverrideCampaignSessionTransaction,
    buildOverrideDuelSessionTransaction,
    buildOverrideGauntletSessionTransaction,
    buildStartDuelSessionTransaction,
    buildStartGauntletSessionTransaction,
    buildStartSessionTransaction,
    buildDelegateSessionTransaction,
    setActiveOnChainLevel,
    setActiveSessionPda,
    delegateSession,
    commitSession,
    undelegateSession,
    settleSessionResult,
    closeSessionOnly,
    forceCloseSession,
    closeOrphanedAccounts,
    closeEmptyOrphanedAccounts,
    endSession,
    resetSession,
    fetchSessionNonces,
  };
}
