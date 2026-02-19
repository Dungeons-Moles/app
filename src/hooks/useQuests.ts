import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import {
  createAnchorProvider,
  createNftMarketplaceProgram,
  createNftMarketplaceProgramWithProvider,
} from '@/services/solana/programs';
import { deriveQuestDefPda, deriveQuestProgressPda } from '@/services/solana/constants';
import { getUserErrorMessage } from '@/services/solana/errors';
import { SOLANA_CONFIG } from '@/services/solana/config';
import type { QuestDefinitionData, QuestProgressData, QuestWithProgress, TransactionResult } from '@/types/solana';

export function useQuests() {
  const { wallet, signAndSendTransaction } = useWallet();
  const { connection } = useSolanaConnection();
  const readOnlyProgram = useMemo(() => createNftMarketplaceProgram(connection), [connection]);

  const [quests, setQuests] = useState<QuestWithProgress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const provider = useMemo(() => {
    if (!wallet.publicKey) return null;
    const walletAdapter = {
      publicKey: wallet.publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    } as any;
    return createAnchorProvider(connection, walletAdapter);
  }, [connection, wallet.publicKey]);

  const writeProgram = useMemo(() => {
    if (!provider) return null;
    return createNftMarketplaceProgramWithProvider(provider);
  }, [provider]);

  // Fetch all quest definitions + player progress
  const fetchQuests = useCallback(async () => {
    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const allDefs = await (readOnlyProgram.account as any).questDefinition.all();

      const questsWithProgress: QuestWithProgress[] = [];
      for (const { account } of allDefs) {
        const definition: QuestDefinitionData = {
          questId: account.questId,
          questType: account.questType,
          objectiveType: account.objectiveType,
          objectiveCount: account.objectiveCount,
          rewardType: account.rewardType,
          rewardData: new Uint8Array(account.rewardData),
          season: account.season,
          active: account.active,
        };

        let progress: QuestProgressData | null = null;
        if (wallet.publicKey) {
          try {
            const [progressPda] = deriveQuestProgressPda(wallet.publicKey, definition.questId);
            const progressAccount = await (readOnlyProgram.account as any).questProgress.fetchNullable(progressPda);
            if (progressAccount) {
              progress = {
                player: progressAccount.player,
                questId: progressAccount.questId,
                progress: progressAccount.progress,
                completed: progressAccount.completed,
                claimed: progressAccount.claimed,
                lastReset: Number(progressAccount.lastReset),
              };
            }
          } catch {
            // No progress account yet
          }
        }

        questsWithProgress.push({ definition, progress });
      }

      if (isMountedRef.current) setQuests(questsWithProgress);
    } catch (e) {
      if (isMountedRef.current) setError(getUserErrorMessage(e));
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [readOnlyProgram, wallet.publicKey]);

  // Accept a quest
  const acceptQuest = useCallback(
    async (questId: number): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [questDefPda] = deriveQuestDefPda(questId);
        const [questProgressPda] = deriveQuestProgressPda(wallet.publicKey, questId);

        const transaction = await writeProgram.methods
          .acceptQuest(questId)
          .accounts({
            questDefinition: questDefPda,
            questProgress: questProgressPda,
            player: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await fetchQuests();
        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, fetchQuests, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  // Claim quest reward
  const claimReward = useCallback(
    async (questId: number): Promise<TransactionResult> => {
      if (!wallet.publicKey || !writeProgram) {
        return { success: false, error: 'Wallet not connected' };
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [questDefPda] = deriveQuestDefPda(questId);
        const [questProgressPda] = deriveQuestProgressPda(wallet.publicKey, questId);

        const transaction = await writeProgram.methods
          .claimQuestReward(questId)
          .accounts({
            questDefinition: questDefPda,
            questProgress: questProgressPda,
            player: wallet.publicKey,
          })
          .transaction();

        const signature = await signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, SOLANA_CONFIG.commitment);

        await fetchQuests();
        return { success: true, signature };
      } catch (txError) {
        const message = getUserErrorMessage(txError, 'nft_marketplace');
        if (isMountedRef.current) setError(message);
        return { success: false, error: message };
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [connection, fetchQuests, signAndSendTransaction, wallet.publicKey, writeProgram]
  );

  return {
    quests,
    isLoading,
    error,
    fetchQuests,
    acceptQuest,
    claimReward,
  };
}
