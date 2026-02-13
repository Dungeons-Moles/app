import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSession } from '@/contexts/SessionContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createMapGeneratorProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { GAMEPLAY_STATE_PROGRAM_ID, deriveGeneratedMapPda, deriveSessionPda } from '@/services/solana/constants';
import { fetchGeneratedMap } from '@/services/solana/mapGeneratorClient';
import { SOLANA_CONFIG } from '@/services/solana/config';
import { RunMode } from '@/services/solana/types/gameplay_state';
import {
  buildEnterDuelTransaction,
  fetchDuelQueue,
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

const DUEL_ONCHAIN_LEVEL = 20;

export function useDuels() {
  const { wallet, signAndSendTransaction, checkBalance } = useWallet();
  const { session, mapSeed, startDuelGame, switchToSession } = useSession();
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

      let duelSeed = mapSeed;
      const [duelSessionPda] = deriveSessionPda(wallet.publicKey, DUEL_ONCHAIN_LEVEL);
      const existingDuelSessionInfo = await connection.getAccountInfo(
        duelSessionPda,
        SOLANA_CONFIG.commitment
      );

      if (existingDuelSessionInfo) {
        const switchResult = await switchToSession(duelSessionPda.toBase58());
        if (!switchResult.success) {
          setError(switchResult.error ?? 'Failed to resume duel session');
          setPhase('error');
          return false;
        }

        const [generatedMapPda] = deriveGeneratedMapPda(duelSessionPda);
        const mapProgram = createMapGeneratorProgram(connection);
        const generatedMap = await fetchGeneratedMap(mapProgram, generatedMapPda);
        duelSeed = generatedMap?.seed ?? duelSeed;
      } else {
        const startResult = await startDuelGame();
        if (!startResult.success) {
          setError(startResult.error ?? 'Failed to start duel session');
          setPhase('error');
          return false;
        }
        duelSeed = startResult.mapSeed ?? duelSeed;
      }

      if (duelSeed === null) {
        setError('Failed to resolve duel seed from session.');
        setPhase('error');
        return false;
      }
      console.log('[useDuels] enterCurrentSessionDuel:resolved_seed', { duelSeed: duelSeed.toString() });

      const program = createGameplayStateProgram(connection);
      const [sessionPda] = deriveSessionPda(wallet.publicKey, DUEL_ONCHAIN_LEVEL);
      const [gameStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('game_state'), sessionPda.toBuffer()],
        GAMEPLAY_STATE_PROGRAM_ID
      );
      const gameStateAccount = await (
        program.account as {
          gameState: { fetch: (address: PublicKey) => Promise<{ runMode: RunMode }> };
        }
      ).gameState.fetch(gameStatePda);
      if (gameStateAccount.runMode === RunMode.Gauntlet) {
        setError('Active level-20 session is in Gauntlet mode. Finish or abandon it before entering Duels.');
        setPhase('error');
        return false;
      }

      const tx = await buildEnterDuelTransaction(
        connection,
        program,
        wallet.publicKey,
        gameStatePda,
        sessionPda,
        duelSeed
      );

      const signature = await signAndSendTransaction(tx);
      console.log('[useDuels] enterCurrentSessionDuel:enter_tx_sent', { signature });
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('[useDuels] enterCurrentSessionDuel:enter_tx_confirmed', { signature });

      const events = await parseDuelEvents(connection, program, signature);
      if (!events.queued) {
        setError('Transaction succeeded but DuelQueued event was not found.');
        setPhase('error');
        return false;
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
    session,
    mapSeed,
    startDuelGame,
    switchToSession,
    checkBalance,
    connection,
    signAndSendTransaction,
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
