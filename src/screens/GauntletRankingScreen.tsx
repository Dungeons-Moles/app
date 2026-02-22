import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { PublicKey } from '@solana/web3.js';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { deriveGauntletConfigPda } from '@/services/solana/gauntlet';
import { derivePlayerProfilePda } from '@/services/solana/types';
import { Typography } from '@/theme/typography';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const BOOK_IMAGE_MOBILE = require('../../assets/ui/backgrounds/book-wide.png');
const BOOK_IMAGE_COMPACT = require('../../assets/ui/backgrounds/book-compact.png');
const GAUNTLET_TITLE = require('../../assets/ui/text/gauntlet.png');
const RANKING_TITLE = require('../../assets/ui/text/ranking.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');
const buttonV4Source = require('../../assets/ui/buttons/button-v4.png');
const MAX_RANK_ROWS = 100;
const PAGE_SIZE = 10;
const HALF_PAGE = 5;

type GauntletRankingScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GauntletRanking'>;
  route: RouteProp<RootStackParamList, 'GauntletRanking'>;
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

export function GauntletRankingScreen({ navigation, route }: GauntletRankingScreenProps) {
  const returnTo = route.params?.returnTo;
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const isCompact = useScreenVariant() === 'compact';
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
            all: () => Promise<
              Array<{
                account: { epochId: bigint | number; player: PublicKey; points: bigint | number };
              }>
            >;
          };
        }
      ).gauntletPlayerScore.all();

      const normalized = allScores.map((row) => ({
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

  const [page, setPage] = useState(0);
  const totalPages = useMemo(() => Math.ceil(items.length / PAGE_SIZE), [items.length]);
  const pageItems = useMemo(
    () => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [items, page]
  );
  const leftItems = useMemo(() => pageItems.slice(0, HALF_PAGE), [pageItems]);
  const rightItems = useMemo(() => pageItems.slice(HALF_PAGE), [pageItems]);
  const hasData = useMemo(() => items.length > 0, [items.length]);

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const [actionFocus, setActionFocus] = useState(0); // 0 = Refresh, 1 = Prev, 2 = Next

  const handleBack = useCallback(() => {
    if (returnTo) {
      navigation.navigate(returnTo);
    } else {
      navigation.goBack();
    }
  }, [navigation, returnTo]);

  useControllerAction(
    {
      onB: handleBack,
      onA: () => {
        if (actionFocus === 0) void loadRanking();
        else if (actionFocus === 1) setPage((p) => Math.max(0, p - 1));
        else if (actionFocus === 2) setPage((p) => Math.min(totalPages - 1, p + 1));
      },
      onDPadLeft: () => setActionFocus((f) => Math.max(0, f - 1)),
      onDPadRight: () => setActionFocus((f) => Math.min(totalPages > 1 ? 2 : 0, f + 1)),
    },
    isController
  );

  const controllerHints: ButtonHint[] = [
    { button: 'DPadLeftRight', label: 'Switch' },
    { button: 'A', label: 'Select' },
    { button: 'B', label: 'Back' },
  ];

  const renderRow = (item: RankingItem) => (
    <View
      key={`${item.wallet}-${item.rank}`}
      style={[styles.row, item.isYou && styles.rowYou, isCompact && compactStyles.row]}
    >
      <Text style={[styles.rankText, isCompact && compactStyles.rankText]}>#{item.rank}</Text>
      <View style={styles.rowMain}>
        <Text style={[styles.nameText, isCompact && compactStyles.nameText]}>
          {item.profileName}
        </Text>
        <Text style={[styles.metaText, isCompact && compactStyles.metaText]}>
          {item.points} pts - {item.sharePct.toFixed(1)}%
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Image source={BACKGROUND_IMAGE} style={styles.absoluteFill} resizeMode="cover" />
      <Image source={STAINS_BACKGROUND} style={styles.absoluteFill} resizeMode="cover" />
      <Image
        source={isCompact ? BOOK_IMAGE_COMPACT : BOOK_IMAGE_MOBILE}
        style={styles.absoluteFill}
        resizeMode="stretch"
      />

      <View style={[styles.content, isCompact && compactStyles.content]}>
        {/* Header */}
        <View style={[styles.header, isCompact && compactStyles.header]}>
          {isController ? (
            <View style={[styles.headerButton, isCompact && compactStyles.headerButton]} />
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <ImageBackground
                source={buttonV1Source}
                style={[styles.headerButton, isCompact && compactStyles.headerButton]}
                resizeMode="stretch"
              >
                <Text
                  style={[styles.headerButtonText, isCompact && compactStyles.headerButtonText]}
                >
                  Back
                </Text>
              </ImageBackground>
            </TouchableOpacity>
          )}

          <View style={[styles.titleRow, isCompact && compactStyles.titleRow]}>
            <Image
              source={GAUNTLET_TITLE}
              style={[styles.titleImage, isCompact && compactStyles.titleImage]}
              resizeMode="contain"
            />
            <Image
              source={RANKING_TITLE}
              style={[styles.rankingTitleImage, isCompact && compactStyles.rankingTitleImage]}
              resizeMode="contain"
            />
          </View>

          <Text style={[styles.epochText, isCompact && compactStyles.epochText]}>
            Epoch: {epochId !== null ? epochId.toString() : '-'}
          </Text>
        </View>

        {/* Two-column book layout */}
        {isLoading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator color="#3d2b1f" size="large" />
          </View>
        ) : error ? (
          <View style={styles.loadingWrapper}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !hasData ? (
          <View style={[styles.columnsContainer, isCompact && compactStyles.columnsContainer]}>
            <View style={styles.emptyColumn}>
              <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                No ranking data yet for this epoch.
              </Text>
            </View>
            <View style={styles.column} />
          </View>
        ) : (
          <View style={[styles.columnsContainer, isCompact && compactStyles.columnsContainer]}>
            {/* Left page */}
            <View style={styles.column}>
              {leftItems.map(renderRow)}
              <View style={styles.columnFooter}>
                <FocusGlow active={isController && actionFocus === 0}>
                  <TouchableOpacity
                    onPress={() => void loadRanking()}
                    activeOpacity={0.7}
                    disabled={isLoading}
                  >
                    <ImageBackground
                      source={buttonV4Source}
                      style={[styles.actionButton, isCompact && compactStyles.actionButton]}
                      resizeMode="stretch"
                    >
                      <Text
                        style={[
                          styles.buttonTextPrimary,
                          isCompact && compactStyles.buttonTextPrimary,
                        ]}
                      >
                        Refresh
                      </Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </FocusGlow>
              </View>
            </View>

            {/* Right page */}
            <View
              style={[styles.column, styles.rightColumn, isCompact && compactStyles.rightColumn]}
            >
              {rightItems.map(renderRow)}
              {totalPages > 1 && (
                <View style={styles.columnFooter}>
                  <View style={styles.paginationRow}>
                    <FocusGlow active={isController && actionFocus === 1}>
                      <TouchableOpacity
                        onPress={() => setPage((p) => Math.max(0, p - 1))}
                        activeOpacity={0.7}
                        disabled={page === 0}
                      >
                        <ImageBackground
                          source={buttonV1Source}
                          style={[styles.pageButton, isCompact && compactStyles.pageButton]}
                          resizeMode="stretch"
                        >
                          <Text
                            style={[
                              styles.buttonText,
                              isCompact && compactStyles.buttonText,
                              page === 0 && styles.buttonTextDisabled,
                            ]}
                          >
                            Prev
                          </Text>
                        </ImageBackground>
                      </TouchableOpacity>
                    </FocusGlow>
                    <Text style={[styles.pageIndicator, isCompact && compactStyles.pageIndicator]}>
                      {page + 1} / {totalPages}
                    </Text>
                    <FocusGlow active={isController && actionFocus === 2}>
                      <TouchableOpacity
                        onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        activeOpacity={0.7}
                        disabled={page === totalPages - 1}
                      >
                        <ImageBackground
                          source={buttonV1Source}
                          style={[styles.pageButton, isCompact && compactStyles.pageButton]}
                          resizeMode="stretch"
                        >
                          <Text
                            style={[
                              styles.buttonText,
                              isCompact && compactStyles.buttonText,
                              page === totalPages - 1 && styles.buttonTextDisabled,
                            ]}
                          >
                            Next
                          </Text>
                        </ImageBackground>
                      </TouchableOpacity>
                    </FocusGlow>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
      <ControllerHints hints={controllerHints} horizontal />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6d5b8',
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 64,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerButton: {
    width: 80,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  epochText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5c4033',
    minWidth: 80,
    textAlign: 'right',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  titleImage: {
    width: 130,
    height: 35,
    transform: [{ translateX: -14 }],
  },
  rankingTitleImage: {
    width: 110,
    height: 32,
    marginTop: 5,
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  columnsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
  },
  column: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  rightColumn: {
    paddingLeft: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(61,43,31,0.12)',
    paddingVertical: 8,
  },
  rowYou: {
    backgroundColor: 'rgba(250,188,15,0.12)',
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  rankText: {
    width: 36,
    fontFamily: Typography.number,
    fontSize: 13,
    color: '#8a6d3b',
  },
  rowMain: {
    flex: 1,
  },
  nameText: {
    fontFamily: Typography.body,
    color: '#3d2b1f',
    fontSize: 13,
    fontWeight: '700',
  },
  metaText: {
    fontFamily: Typography.body,
    color: '#8a7a6a',
    fontSize: 10,
    marginTop: 1,
  },
  emptyColumn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Typography.body,
    color: '#5c4033',
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    color: '#c0392b',
    fontSize: 14,
    textAlign: 'center',
  },
  columnFooter: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pageButton: {
    width: 80,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageIndicator: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#3d2b1f',
    minWidth: 40,
    textAlign: 'center',
  },
  buttonText: {
    fontFamily: Typography.button,
    fontSize: 12,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  buttonTextDisabled: {
    opacity: 0.4,
  },
  actionButton: {
    width: 120,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonTextPrimary: {
    fontFamily: Typography.button,
    fontSize: 13,
    color: '#1a1a1a',
    marginBottom: 4,
  },
});

const compactStyles = StyleSheet.create({
  content: {
    paddingTop: 130,
    paddingHorizontal: 88,
    paddingBottom: 160,
  },
  header: {
    marginBottom: 8,
  },
  headerButton: {
    width: 140,
    height: 76,
  },
  headerButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  epochText: {
    fontSize: 20,
    minWidth: 140,
  },
  titleRow: {
    gap: 0,
  },
  titleImage: {
    width: 280,
    height: 70,
    transform: [{ translateX: -28 }],
  },
  rankingTitleImage: {
    width: 240,
    height: 64,
    marginTop: 8,
  },
  columnsContainer: {
    gap: 32,
    marginTop: 120,
  },
  rightColumn: {
    paddingLeft: 40,
  },
  emptyText: {
    fontSize: 28,
  },
  row: {
    paddingVertical: 12,
  },
  rankText: {
    width: 56,
    fontSize: 24,
  },
  nameText: {
    fontSize: 24,
  },
  metaText: {
    fontSize: 18,
    marginTop: 2,
  },
  actionButton: {
    width: 180,
    height: 70,
  },
  buttonTextPrimary: {
    fontSize: 24,
    marginBottom: 6,
  },
  pageButton: {
    width: 130,
    height: 60,
  },
  buttonText: {
    fontSize: 22,
    marginBottom: 6,
  },
  pageIndicator: {
    fontSize: 22,
    minWidth: 60,
  },
});
