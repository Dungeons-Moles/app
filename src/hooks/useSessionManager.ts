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
  deriveMapEnemiesPda,
  deriveMapPoisPda,
  deriveInventoryPda,
  deriveGeneratedMapPda,
  deriveMapConfigPda,
  deriveSessionManagerAuthorityPda,
  deriveSessionPda,
} from '@/services/solana/constants';
import { SOLANA_CONFIG } from '@/services/solana/config';
import { getUserErrorMessage } from '@/services/solana/errors';
import { buildResetDuelEntryInstruction, deriveDuelEntryPda } from '@/services/solana/duels';
import { sendSessionSignerTransaction } from '@/services/solana/sessionSigner';
import { MAX_CAMPAIGN_LEVEL } from './useMapGenerator';
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
  const [buffer] = PublicKey.findProgramAddressSync([Buffer.from('buffer'), target.toBuffer()], ownerProgram);
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

  const readOnlyProgram = useMemo(() => createSessionManagerProgram(baseConnection), [baseConnection]);
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
      const [fallbackSessionPda] = deriveSessionPda(
        wallet.publicKey,
        activeOnChainLevelRef.current
      );
      const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
      const decodeRawGameSession = async (): Promise<RawGameSessionAccount | null> => {
        const accountInfo = await baseConnection.getAccountInfo(sessionPda, SOLANA_CONFIG.commitment);
        if (!accountInfo?.data) {
          return null;
        }
        return readOnlyProgram.coder.accounts.decode(
          'gameSession',
          accountInfo.data
        ) as RawGameSessionAccount;
      };
      let account: RawGameSessionAccount | null = null;

      try {
        account = await (
          readOnlyProgram.account as {
            gameSession: {
              fetchNullable: (address: PublicKey) => Promise<RawGameSessionAccount | null>;
            };
          }
        ).gameSession.fetchNullable(sessionPda);

        // For delegated accounts, Anchor fetchNullable may return null instead of throwing
        // due owner mismatch. Try raw decode before considering session absent.
        if (!account) {
          account = await decodeRawGameSession();
        }
      } catch (anchorFetchError) {
        // Delegated session accounts are owned by MagicBlock delegation program.
        // Anchor account fetch enforces owner, so it can fail while delegated.
        try {
          account = await decodeRawGameSession();
        } catch (decodeError) {
          throw anchorFetchError;
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

        const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
        activeSessionPdaRef.current = sessionPda;
        setActiveSessionPdaState(sessionPda);
        const [counterPda] = deriveSessionCounterPda();
        const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
        const [poisPda] = deriveMapPoisPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
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
            gameState: gameStatePda,
            mapEnemies: enemiesPda,
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

  const buildStartDuelSessionTransaction = useCallback(
    async (
      sessionSignerPublicKey: PublicKey
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

      const [sessionPda] = deriveDuelSessionPda(wallet.publicKey);
      activeSessionPdaRef.current = sessionPda;
      setActiveSessionPdaState(sessionPda);
      const [counterPda] = deriveSessionCounterPda();
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
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
              gameState: PublicKey;
              mapEnemies: PublicKey;
              mapPois: PublicKey;
              inventory: PublicKey;
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
          gameState: gameStatePda,
          mapEnemies: enemiesPda,
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

  const buildStartGauntletSessionTransaction = useCallback(
    async (
      sessionSignerPublicKey: PublicKey
    ): Promise<{ transaction: Transaction; sessionPda: PublicKey } | null> => {
      if (!wallet.publicKey || !baseWriteProgram) {
        return null;
      }

      const GAUNTLET_ONCHAIN_LEVEL = 20;
      activeOnChainLevelRef.current = GAUNTLET_ONCHAIN_LEVEL;

      const [sessionPda] = deriveGauntletSessionPda(wallet.publicKey);
      activeSessionPdaRef.current = sessionPda;
      setActiveSessionPdaState(sessionPda);
      const [counterPda] = deriveSessionCounterPda();
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [mapConfigPda] = deriveMapConfigPda();
      const [sessionManagerAuthorityPda] = deriveSessionManagerAuthorityPda();

      const transaction = await (
        baseWriteProgram.methods as unknown as {
          startGauntletSession: () => {
            accounts: (accounts: {
              gameSession: PublicKey;
              sessionCounter: PublicKey;
              playerProfile: PublicKey;
              player: PublicKey;
              sessionSigner: PublicKey;
              mapConfig: PublicKey;
              generatedMap: PublicKey;
              gameState: PublicKey;
              mapEnemies: PublicKey;
              mapPois: PublicKey;
              inventory: PublicKey;
              mapGeneratorProgram: PublicKey;
              gameplayStateProgram: PublicKey;
              poiSystemProgram: PublicKey;
              playerInventoryProgram: PublicKey;
              systemProgram: PublicKey;
            }) => { transaction: () => Promise<Transaction> };
          };
        }
      )
        .startGauntletSession()
        .accounts({
          gameSession: sessionPda,
          sessionCounter: counterPda,
          playerProfile: profilePda,
          player: wallet.publicKey,
          sessionSigner: sessionSignerPublicKey,
          mapConfig: mapConfigPda,
          generatedMap: generatedMapPda,
          gameState: gameStatePda,
          mapEnemies: enemiesPda,
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
   * Builds a start session transaction without sending it.
   * Used for combining with other instructions in a single transaction.
   */
  const buildStartSessionTransaction = useCallback(
    async (
      campaignLevel: number,
      sessionSignerPublicKey: PublicKey
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

      const [sessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
      activeSessionPdaRef.current = sessionPda;
      setActiveSessionPdaState(sessionPda);
      const [counterPda] = deriveSessionCounterPda();
      const [profilePda] = derivePlayerProfilePda(wallet.publicKey);
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [enemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [poisPda] = deriveMapPoisPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
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
          gameState: gameStatePda,
          mapEnemies: enemiesPda,
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
      if (
        !wallet.publicKey ||
        !baseWriteProgram
      ) {
        return null;
      }

      if (campaignLevel < 0 || campaignLevel > MAX_CAMPAIGN_LEVEL) {
        return null;
      }

      const onChainLevel = campaignLevel + 1;
      const [fallbackSessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
      const sessionPda = sessionPdaOverride ?? activeSessionPdaRef.current ?? fallbackSessionPda;
      const sessionDelegate = deriveDelegatePdas(sessionPda, SOLANA_CONFIG.programs.sessionManager);

      const delegateSessionIx = await baseWriteProgram.methods
        .delegateSession(onChainLevel)
        .accountsStrict({
          bufferGameSession: sessionDelegate.buffer,
          delegationRecordGameSession: sessionDelegate.delegationRecord,
          delegationMetadataGameSession: sessionDelegate.delegationMetadata,
          gameSession: sessionPda,
          player: wallet.publicKey,
          sessionSigner: sessionSignerPublicKey,
          ownerProgram: SOLANA_CONFIG.programs.sessionManager,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .instruction();

      return new Transaction().add(delegateSessionIx);
    },
    [wallet.publicKey, baseWriteProgram]
  );

  const delegateSession = useCallback(async (
    sessionSignerKeypair: Keypair,
    options?: {
      sessionPda?: PublicKey;
      onChainLevel?: number;
    }
  ): Promise<TransactionResult> => {
    if (!wallet.publicKey || !baseWriteProgram) {
      return { success: false, error: 'Wallet not connected' };
    }
    if (!gameplayStateWriteProgram || !mapGeneratorWriteProgram || !playerInventoryWriteProgram || !poiSystemWriteProgram) {
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
        options?.onChainLevel ?? sessionRef.current?.campaignLevel ?? activeOnChainLevelRef.current;
      const [fallbackSessionPda] = deriveSessionPda(wallet.publicKey, onChainLevel);
      const sessionPda = options?.sessionPda ?? activeSessionPdaRef.current ?? fallbackSessionPda;
      const [gameStatePda] = deriveGameStatePda(sessionPda);
      const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
      const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
      const [inventoryPda] = deriveInventoryPda(sessionPda);
      const [mapPoisPda] = deriveMapPoisPda(sessionPda);
      const gameplayGameStateDelegate = deriveDelegatePdas(gameStatePda, SOLANA_CONFIG.programs.gameplayState);
      const gameplayMapEnemiesDelegate = deriveDelegatePdas(mapEnemiesPda, SOLANA_CONFIG.programs.gameplayState);
      const generatedMapDelegate = deriveDelegatePdas(generatedMapPda, SOLANA_CONFIG.programs.mapGenerator);
      const inventoryDelegate = deriveDelegatePdas(inventoryPda, SOLANA_CONFIG.programs.playerInventory);
      const mapPoisDelegate = deriveDelegatePdas(mapPoisPda, SOLANA_CONFIG.programs.poiSystem);

      const delegateGameplayIx = await gameplayStateWriteProgram.methods
        .delegateGameplayAccounts()
        .accountsStrict({
          gameState: gameStatePda,
          mapEnemies: mapEnemiesPda,
          gameSession: sessionPda,
          player: sessionSignerKeypair.publicKey,
          bufferGameState: gameplayGameStateDelegate.buffer,
          delegationRecordGameState: gameplayGameStateDelegate.delegationRecord,
          delegationMetadataGameState: gameplayGameStateDelegate.delegationMetadata,
          bufferMapEnemies: gameplayMapEnemiesDelegate.buffer,
          delegationRecordMapEnemies: gameplayMapEnemiesDelegate.delegationRecord,
          delegationMetadataMapEnemies: gameplayMapEnemiesDelegate.delegationMetadata,
          ownerProgram: SOLANA_CONFIG.programs.gameplayState,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .instruction();
      const delegateGeneratedMapIx = await mapGeneratorWriteProgram.methods
        .delegateGeneratedMap()
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
        .delegateInventory()
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
        .delegateMapPois()
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
      const delegateSessionIx = await baseWriteProgram.methods
        .delegateSession(onChainLevel)
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
          ownerProgram: SOLANA_CONFIG.programs.sessionManager,
          delegationProgram: DELEGATION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .instruction();

      // Split delegation into 2 transactions to stay under the 1232-byte tx size limit.
      // Tx1: gameplay (gameState + mapEnemies) + session
      // Tx2: generatedMap + inventory + mapPois
      const delegationTx1 = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
        delegateGameplayIx,
        delegateSessionIx
      );
      const delegationTx2 = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
        delegateGeneratedMapIx,
        delegateInventoryIx,
        delegateMapPoisIx
      );
      await sendSessionSignerTransaction(
        baseConnection,
        delegationTx1,
        sessionSignerKeypair
      );
      const signature = await sendSessionSignerTransaction(
        baseConnection,
        delegationTx2,
        sessionSignerKeypair
      );

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
  }, [
    baseConnection,
    fetchSession,
    hasActiveSession,
    session,
    wallet.publicKey,
    baseWriteProgram,
  ]);

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
        const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);

        const { programId: magicProgramId, contextId: magicContextId } = SOLANA_CONFIG.magic;

        const transaction = await erWriteProgram.methods
          .commitSession(onChainLevel, stateHash)
          .accounts({
            gameSession: sessionPda,
            gameState: gameStatePda,
            mapEnemies: mapEnemiesPda,
            generatedMap: generatedMapPda,
            inventory: inventoryPda,
            mapPois: mapPoisPda,
            player: wallet.publicKey,
            magicProgram: magicProgramId,
            magicContext: magicContextId,
          })
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
    [
      erConnection,
      fetchSession,
      signAndSendTransaction,
      wallet.publicKey,
      erWriteProgram,
    ]
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
        const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);

        // Frontend state can be stale (e.g., after interrupted cleanup). Check every account,
        // not only session PDA, because mixed ownership causes InvalidWritableAccount on move.
        const [
          baseSessionInfo,
          baseGameStateInfo,
          baseMapEnemiesInfo,
          baseGeneratedMapInfo,
          baseInventoryInfo,
          baseMapPoisInfo,
        ] = await Promise.all([
          baseConnection.getAccountInfo(sessionPda, 'processed'),
          baseConnection.getAccountInfo(gameStatePda, 'processed'),
          baseConnection.getAccountInfo(mapEnemiesPda, 'processed'),
          baseConnection.getAccountInfo(generatedMapPda, 'processed'),
          baseConnection.getAccountInfo(inventoryPda, 'processed'),
          baseConnection.getAccountInfo(mapPoisPda, 'processed'),
        ]);
        if (!baseSessionInfo) {
          return { success: false, error: 'Session account not found' };
        }
        const delegatedSession = !!baseSessionInfo.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedGameplay =
          !!baseGameStateInfo?.owner.equals(DELEGATION_PROGRAM_ID) ||
          !!baseMapEnemiesInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedMap = !!baseGeneratedMapInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedInventory = !!baseInventoryInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const delegatedPois = !!baseMapPoisInfo?.owner.equals(DELEGATION_PROGRAM_ID);
        const hasAnyDelegated =
          delegatedSession ||
          delegatedGameplay ||
          delegatedMap ||
          delegatedInventory ||
          delegatedPois;
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
        const tryUndelegateOrSkip = async (
          sendTx: () => Promise<void>,
          checks: Array<[PublicKey, PublicKey, string]>,
          continueOnFailure = false
        ): Promise<void> => {
          const labels = checks.map(([, , l]) => l).join(', ');
          try {
            await sendTx();
            console.log(`[useSessionManager] undelegate ${labels}: success`);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn(`[useSessionManager] undelegate ${labels}: tx failed —`, errMsg);
            // Wait briefly for base propagation then re-check
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const restored = await Promise.all(
              checks.map(([pda, owner]) => isAlreadyRestored(pda, owner))
            );
            const allRestored = restored.every(Boolean);
            // Log per-account status
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
            if (continueOnFailure) {
              undelegateErrors.push(`${labels}: ${errMsg}`);
              return;
            }
            throw err;
          }
        };

        // Log initial account owners for diagnostics
        console.log('[useSessionManager] undelegate: base account owners', {
          session: delegatedSession ? 'DELEGATED' : 'base',
          gameplay: delegatedGameplay ? 'DELEGATED' : 'base',
          map: delegatedMap ? 'DELEGATED' : 'base',
          inventory: delegatedInventory ? 'DELEGATED' : 'base',
          pois: delegatedPois ? 'DELEGATED' : 'base',
        });

        // Undelegate child accounts via their owning programs first, then session last.
        // Each program can only undelegate accounts it owns (delegation program validates ownership).
        if (delegatedGameplay) {
          await tryUndelegateOrSkip(
            async () => {
              const undelegateGameplayTx = await gameplayProgramEr.methods
                .undelegateGameplayAccounts()
                .accounts({
                  gameState: gameStatePda,
                  mapEnemies: mapEnemiesPda,
                  gameSession: sessionPda,
                  sessionSigner: sessionSignerKeypair.publicKey,
                  magicProgram: magicProgramId,
                  magicContext: magicContextId,
                })
                .transaction();
              await sendSessionSignerTransaction(
                erConnection,
                undelegateGameplayTx,
                sessionSignerKeypair
              );
            },
            [
              [gameStatePda, SOLANA_CONFIG.programs.gameplayState, 'game_state'],
              [mapEnemiesPda, SOLANA_CONFIG.programs.gameplayState, 'map_enemies'],
            ],
            true
          );
        }

        if (delegatedMap) {
          await tryUndelegateOrSkip(
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
              await sendSessionSignerTransaction(
                erConnection,
                undelegateMapTx,
                sessionSignerKeypair
              );
            },
            [[generatedMapPda, SOLANA_CONFIG.programs.mapGenerator, 'generated_map']],
            true
          );
        }

        if (delegatedInventory) {
          await tryUndelegateOrSkip(
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
              await sendSessionSignerTransaction(
                erConnection,
                undelegateInventoryTx,
                sessionSignerKeypair
              );
            },
            [[inventoryPda, SOLANA_CONFIG.programs.playerInventory, 'inventory']],
            true
          );
        }

        if (delegatedPois) {
          await tryUndelegateOrSkip(
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
              await sendSessionSignerTransaction(
                erConnection,
                undelegatePoisTx,
                sessionSignerKeypair
              );
            },
            [[mapPoisPda, SOLANA_CONFIG.programs.poiSystem, 'map_pois']],
            true
          );
        }

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
              signature = await sendSessionSignerTransaction(
                erConnection,
                transaction,
                sessionSignerKeypair
              );
              await erConnection.confirmTransaction(signature, SOLANA_CONFIG.commitment);
            },
            [[sessionPda, SOLANA_CONFIG.programs.sessionManager, 'game_session']],
            true
          );
        }

        // Wait for ALL accounts to be restored on base chain.
        const allChecks: Array<[PublicKey, PublicKey, string]> = [];
        if (delegatedGameplay) {
          allChecks.push(
            [gameStatePda, SOLANA_CONFIG.programs.gameplayState, 'game_state'],
            [mapEnemiesPda, SOLANA_CONFIG.programs.gameplayState, 'map_enemies']
          );
        }
        if (delegatedMap) {
          allChecks.push([generatedMapPda, SOLANA_CONFIG.programs.mapGenerator, 'generated_map']);
        }
        if (delegatedInventory) {
          allChecks.push([inventoryPda, SOLANA_CONFIG.programs.playerInventory, 'inventory']);
        }
        if (delegatedPois) {
          allChecks.push([mapPoisPda, SOLANA_CONFIG.programs.poiSystem, 'map_pois']);
        }
        if (delegatedSession) {
          allChecks.push([sessionPda, SOLANA_CONFIG.programs.sessionManager, 'game_session']);
        }

        let allRestored = false;
        for (let i = 0; i < 30; i += 1) {
          const infos = await Promise.all(
            allChecks.map(([pda]) => baseConnection.getAccountInfo(pda, 'processed'))
          );
          allRestored = infos.every(
            (info, idx) => info?.owner.equals(allChecks[idx][1])
          );
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
          await new Promise((resolve) => setTimeout(resolve, 250));
        }

        if (!allRestored && undelegateErrors.length > 0) {
          throw new Error(
            `Undelegate failed for: ${undelegateErrors.join(' | ')}`
          );
        }
        if (!allRestored) {
          throw new Error('Owner not restored for all accounts after undelegate');
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
    [
      baseConnection,
      erConnection,
      erWriteProgram,
      fetchSession,
      wallet.publicKey,
    ]
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
        const [fallbackSessionPda] = deriveSessionPda(wallet.publicKey, currentSession.campaignLevel);
        const sessionPda = activeSessionPdaRef.current ?? fallbackSessionPda;
        const [gameStatePda] = deriveGameStatePda(sessionPda);
        const [inventoryPda] = deriveInventoryPda(sessionPda);
        const [mapEnemiesPda] = deriveMapEnemiesPda(sessionPda);
        const [generatedMapPda] = deriveGeneratedMapPda(sessionPda);
        const [mapPoisPda] = deriveMapPoisPda(sessionPda);
        const [playerProfilePda] = derivePlayerProfilePda(wallet.publicKey);

        // Build transaction manually since we're only using the session signer
        const program = createSessionManagerProgram(baseConnection);
        const transaction = new Transaction();

        // For duel sessions, prepend reset_duel_entry to clean up duel state before closing
        const [duelSessionPda] = deriveDuelSessionPda(wallet.publicKey);
        const isDuelSession = sessionPda.equals(duelSessionPda);
        if (isDuelSession) {
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
        }

        const endSessionIx = await program.methods
          .endSession(currentSession.campaignLevel)
          .accounts({
            gameSession: sessionPda,
            gameState: gameStatePda,
            mapEnemies: mapEnemiesPda,
            generatedMap: generatedMapPda,
            mapPois: mapPoisPda,
            playerProfile: playerProfilePda,
            player: wallet.publicKey,
            sessionSigner: sessionSignerKeypair.publicKey,
            sessionManagerAuthority: deriveSessionManagerAuthorityPda()[0],
            inventory: inventoryPda,
            playerInventoryProgram: SOLANA_CONFIG.programs.playerInventory,
            gameplayStateProgram: SOLANA_CONFIG.programs.gameplayState,
            playerProfileProgram: SOLANA_CONFIG.programs.playerProfile,
            mapGeneratorProgram: SOLANA_CONFIG.programs.mapGenerator,
            poiSystemProgram: SOLANA_CONFIG.programs.poiSystem,
          })
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
    buildStartDuelSessionTransaction,
    buildStartGauntletSessionTransaction,
    buildStartSessionTransaction,
    buildDelegateSessionTransaction,
    setActiveOnChainLevel,
    setActiveSessionPda,
    delegateSession,
    commitSession,
    undelegateSession,
    endSession,
    resetSession,
  };
}
