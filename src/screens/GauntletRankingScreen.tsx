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
import { PublicKey } from '@solana/web3.js';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { deriveGauntletConfigPda } from '@/services/solana/gauntlet';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { Typography } from '@/theme/typography';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const MAX_RANK_ROWS = 100;

type GauntletRankingScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GauntletRanking'>;
};

interface RankingItem {
  rank: number;
  wallet: string;
  profileName: string;
  points: number;
  sharePct: number;
  isYou: boolean;
}

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}..${wallet.slice(-4)}`;
}

function isMissingAccountError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('Account does not exist') || msg.includes('has no data');
}

export function GauntletRankingScreen({ navigation }: GauntletRankingScreenProps) {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epochId, setEpochId] = useState<bigint | null>(null);
  const [items, setItems] = useState<RankingItem[]>([]);

  const loadRanking = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const gameplayProgram = createGameplayStateProgram(connection);
      const profileProgram = createPlayerProfileProgram(connection);
      const [gauntletConfigPda] = deriveGauntletConfigPda();

      let currentEpoch: bigint | null = null;
      try {
        const gauntletConfig = await (
          gameplayProgram.account as {
            gauntletConfig: {
              fetch: (address: PublicKey) => Promise<{ currentEpochId: bigint | number }>;
            };
          }
        ).gauntletConfig.fetch(gauntletConfigPda);
        currentEpoch = BigInt(gauntletConfig.currentEpochId.toString());
      } catch (configErr) {
        if (!isMissingAccountError(configErr)) {
          throw configErr;
        }
      }

      const allScores = await (
        gameplayProgram.account as {
          gauntletPlayerScore: {
            all: () => Promise<Array<{ account: { epochId: bigint | number; player: PublicKey; points: bigint | number } }>>;
          };
        }
      ).gauntletPlayerScore.all();

      const normalized = allScores
        .map((row) => ({
          epochId: BigInt(row.account.epochId.toString()),
          player: row.account.player,
          points: Number(row.account.points.toString()),
        }));

      if (currentEpoch === null) {
        const maxEpoch = normalized.reduce<bigint | null>(
          (acc, row) => (acc === null || row.epochId > acc ? row.epochId : acc),
          null
        );
        currentEpoch = maxEpoch ?? 0n;
      }

      setEpochId(currentEpoch);

      const filtered = normalized
        .filter((row) => row.epochId === currentEpoch && row.points > 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, MAX_RANK_ROWS);

      const totalPoints = filtered.reduce((acc, item) => acc + item.points, 0);
      const profileNameCache = new Map<string, string>();

      const rows: RankingItem[] = [];
      for (let i = 0; i < filtered.length; i++) {
        const row = filtered[i];
        const walletStr = row.player.toBase58();
        const cached = profileNameCache.get(walletStr);

        let profileName = cached ?? '';
        if (!profileName) {
          try {
            const [profilePda] = derivePlayerProfilePda(row.player);
            const account = await (
              profileProgram.account as {
                playerProfile: {
                  fetchNullable: (address: PublicKey) => Promise<{ name?: unknown } | null>;
                };
              }
            ).playerProfile.fetchNullable(profilePda);

            const fetched = typeof account?.name === 'string' ? account.name.trim() : '';
            profileName = fetched.length > 0 ? fetched : shortWallet(walletStr);
          } catch {
            profileName = shortWallet(walletStr);
          }
          profileNameCache.set(walletStr, profileName);
        }

        rows.push({
          rank: i + 1,
          wallet: walletStr,
          profileName,
          points: row.points,
          sharePct: totalPoints > 0 ? (row.points * 100) / totalPoints : 0,
          isYou: wallet.publicKey?.toBase58() === walletStr,
        });
      }

      setItems(rows);
    } catch (err) {
      console.error('[GauntletRanking] Failed to load ranking:', err);
      setError('Failed to load gauntlet ranking. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    void loadRanking();
  }, [loadRanking]);

  const hasData = useMemo(() => items.length > 0, [items.length]);

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.centerContent}>
            <Text style={styles.title}>GAUNTLET RANKING</Text>
            <Text style={styles.subtitle}>Epoch: {epochId !== null ? epochId.toString() : '-'}</Text>

            {isLoading ? (
              <ActivityIndicator color="#FABC0F" size="large" />
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : !hasData ? (
              <Text style={styles.emptyText}>No ranking data yet for this epoch.</Text>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => `${item.wallet}-${item.rank}`}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={[styles.row, item.isYou && styles.rowYou]}>
                    <Text style={styles.rankText}>#{item.rank}</Text>
                    <View style={styles.rowMain}>
                      <Text style={styles.nameText}>{item.profileName}</Text>
                      <Text style={styles.metaText}>
                        {item.points} pts - {item.sharePct.toFixed(2)}%
                      </Text>
                    </View>
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
              <TouchableOpacity onPress={() => void loadRanking()} activeOpacity={0.7} disabled={isLoading}>
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
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  darkOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
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
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#c0c0c0',
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
  listContent: { padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
  },
  rowYou: {
    backgroundColor: 'rgba(250,188,15,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  rankText: {
    width: 46,
    fontFamily: Typography.number,
    fontSize: 14,
    color: '#FABC0F',
  },
  rowMain: {
    flex: 1,
  },
  nameText: {
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
