import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import {
  derivePitDraftQueuePda,
  parsePitDraftEvents,
} from '@/services/solana/pitDraft';
import { Typography } from '@/theme/typography';
import { PublicKey } from '@solana/web3.js';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');

const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const DEFAULT_MATCHES = 20;

type PitDraftHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PitDraftHistory'>;
};

interface PitDraftHistoryItem {
  signature: string;
  playedAtUnix: number | null;
  opponentWallet: string;
  opponentName: string;
  isWinner: boolean;
  winnerPayoutLamports: number;
  turnsTaken: number;
}

export function PitDraftHistoryScreen({ navigation }: PitDraftHistoryScreenProps) {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const [items, setItems] = useState<PitDraftHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = useCallback((unixTs: number | null) => {
    if (!unixTs) return 'Unknown date';
    return new Date(unixTs * 1000).toLocaleString();
  }, []);

  const formatSol = useCallback((lamports: number) => (lamports / 1_000_000_000).toFixed(3), []);

  const loadHistory = useCallback(async () => {
    if (!wallet.publicKey) {
      setError('Connect a wallet to view match history.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const ourKey = wallet.publicKey.toBase58();
      const gameplayProgram = createGameplayStateProgram(connection);
      const profileProgram = createPlayerProfileProgram(connection);
      const [queuePda] = derivePitDraftQueuePda();
      const profileNameCache = new Map<string, string>();
      const blockTimeCache = new Map<number, number | null>();
      const history: PitDraftHistoryItem[] = [];
      let before: string | undefined;
      let pages = 0;

      while (history.length < DEFAULT_MATCHES && pages < MAX_PAGES) {
        const signatures = await connection.getSignaturesForAddress(
          queuePda,
          { limit: PAGE_SIZE, before },
          'confirmed'
        );
        if (signatures.length === 0) break;

        for (const sigInfo of signatures) {
          const events = await parsePitDraftEvents(connection, gameplayProgram, sigInfo.signature);
          if (!events.resolved) continue;

          const playerA = events.resolved.playerA.toBase58();
          const playerB = events.resolved.playerB.toBase58();
          if (playerA !== ourKey && playerB !== ourKey) continue;

          const opponentWallet = playerA === ourKey ? playerB : playerA;
          let opponentName = profileNameCache.get(opponentWallet);

          if (!opponentName) {
            try {
              const [profilePda] = derivePlayerProfilePda(new PublicKey(opponentWallet));
              const account = await (
                profileProgram.account as {
                  playerProfile: {
                    fetchNullable: (address: PublicKey) => Promise<{ name?: unknown } | null>;
                  };
                }
              ).playerProfile.fetchNullable(profilePda);
              const fetched = typeof account?.name === 'string' ? account.name.trim() : '';
              opponentName =
                fetched.length > 0
                  ? fetched
                  : `${opponentWallet.slice(0, 4)}..${opponentWallet.slice(-4)}`;
            } catch {
              opponentName = `${opponentWallet.slice(0, 4)}..${opponentWallet.slice(-4)}`;
            }
            profileNameCache.set(opponentWallet, opponentName);
          }

          let playedAtUnix = sigInfo.blockTime ?? null;
          if (playedAtUnix === null && typeof sigInfo.slot === 'number') {
            const cachedTime = blockTimeCache.get(sigInfo.slot);
            if (cachedTime !== undefined) {
              playedAtUnix = cachedTime;
            } else {
              try {
                playedAtUnix = await connection.getBlockTime(sigInfo.slot);
              } catch {
                playedAtUnix = null;
              }
              blockTimeCache.set(sigInfo.slot, playedAtUnix);
            }
          }

          history.push({
            signature: sigInfo.signature,
            playedAtUnix,
            opponentWallet,
            opponentName,
            isWinner: events.resolved.winner.toBase58() === ourKey,
            winnerPayoutLamports: events.resolved.winnerPayout,
            turnsTaken: events.resolved.turnsTaken,
          });
          if (history.length >= DEFAULT_MATCHES) break;
        }

        before = signatures[signatures.length - 1]?.signature;
        pages += 1;
      }

      setItems(history);
    } catch (err) {
      console.error('[PitDraftHistory] Failed to load history:', err);
      setError('Failed to load history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const hasData = useMemo(() => items.length > 0, [items.length]);

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            <Text style={styles.title}>PIT DRAFT HISTORY</Text>

            {isLoading ? (
              <ActivityIndicator color="#FABC0F" size="large" />
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : !hasData ? (
              <Text style={styles.emptyText}>No Pit Draft matches found yet.</Text>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => item.signature}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Text style={styles.resultText}>
                      {item.isWinner ? 'WIN' : 'LOSS'} vs {item.opponentName}
                    </Text>
                    <Text style={styles.metaText}>Turns: {item.turnsTaken}</Text>
                    <Text style={styles.metaText}>Payout: {formatSol(item.winnerPayoutLamports)} SOL</Text>
                    <Text style={styles.metaText}>{formatDate(item.playedAtUnix)}</Text>
                  </View>
                )}
              />
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <ImageBackground source={buttonV1Source} style={styles.actionButton} resizeMode="stretch">
                  <Text style={styles.buttonText}>Back</Text>
                </ImageBackground>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void loadHistory()} activeOpacity={0.7} disabled={isLoading}>
                <ImageBackground source={buttonV4Source} style={styles.actionButton} resizeMode="stretch">
                  <Text style={styles.buttonTextPrimary}>Refresh</Text>
                </ImageBackground>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  darkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  centerContent: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 30,
    color: '#FABC0F',
    marginBottom: 16,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    maxWidth: 560,
    maxHeight: 420,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
  },
  listContent: {
    padding: 12,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
  },
  resultText: {
    fontFamily: Typography.body,
    color: '#f5f5f5',
    fontSize: 14,
    fontWeight: '700',
  },
  metaText: {
    fontFamily: Typography.body,
    color: '#c0c0c0',
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: Typography.body,
    color: '#bdbdbd',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    color: '#ff8f8f',
    fontSize: 14,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    width: 140,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  buttonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 4,
  },
});
