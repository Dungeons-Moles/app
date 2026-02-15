import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { createGameplayStateProgram, createPlayerProfileProgram } from '@/services/solana/programs';
import { derivePlayerProfilePda } from '@/services/solana/types';
import {
  derivePitDraftQueuePda,
  parsePitDraftEvents,
} from '@/services/solana/pitDraft';
import { Typography } from '@/theme/typography';
import { PublicKey } from '@solana/web3.js';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const PIT_DRAFT_TITLE = require('../../assets/ui/text/pit-draft.png');
const HISTORY_TITLE = require('../../assets/ui/text/history.png');
const HISTORY_SCROLL = require('../../assets/ui/illustrations/history-scroll.png');
const RECTANGLE_FRAME = require('../../assets/ui/frames/rectangle.png');
const GREEN_BRUSH = require('../../assets/ui/illustrations/green-brush.png');
const RED_BRUSH = require('../../assets/ui/illustrations/red-brush.png');
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
  const isCompact = useScreenVariant() === 'compact';
  const [items, setItems] = useState<PitDraftHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = useCallback((unixTs: number | null) => {
    if (!unixTs) return '—';
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

  const hasData = useMemo(() => items.length > 0, [items.length]);

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        <View style={styles.content}>
          {/* Header */}
          <View style={[styles.header, isCompact && compactStyles.header]}>
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
            {!isCompact && (
              <View style={styles.titleRow}>
                <Image
                  source={PIT_DRAFT_TITLE}
                  style={styles.titleImage}
                  resizeMode="contain"
                />
                <Image
                  source={HISTORY_TITLE}
                  style={styles.historyTitleImage}
                  resizeMode="contain"
                />
              </View>
            )}
            {!isCompact && <View style={styles.headerButtonPlaceholder} />}
            {isCompact && <View style={styles.headerSpacer} />}
          </View>

          {/* Title row — compact only */}
          {isCompact && (
            <View style={compactStyles.titleRow}>
              <Image
                source={PIT_DRAFT_TITLE}
                style={compactStyles.titleImage}
                resizeMode="contain"
              />
              <Image
                source={HISTORY_TITLE}
                style={compactStyles.historyTitleImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Scroll with history data */}
          <View style={[styles.centerContent, isCompact && compactStyles.centerContent]}>
            <View style={[styles.scrollWrapper, isCompact && compactStyles.scrollWrapper]}>
              <Image
                source={HISTORY_SCROLL}
                style={styles.scrollImage}
                resizeMode="stretch"
              />
              <View style={[styles.scrollOverlay, isCompact && compactStyles.scrollOverlay]}>
                {isLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#000000" size="large" />
                  </View>
                ) : error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : !hasData ? (
                  <View style={styles.emptyWrapper}>
                    <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>No Pit Draft matches found yet.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={items}
                    keyExtractor={(item) => item.signature}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                      styles.listContent,
                      isCompact && compactStyles.listContent,
                    ]}
                    renderItem={({ item }) => (
                      <View style={styles.rowOuter}>
                        <Image
                          source={RECTANGLE_FRAME}
                          style={styles.rowFrame}
                          resizeMode="stretch"
                        />
                        <View style={[styles.rowInner, isCompact && compactStyles.rowInner]}>
                          <View style={styles.resultRow}>
                            <View style={styles.brushWrapper}>
                              <Image
                                source={item.isWinner ? GREEN_BRUSH : RED_BRUSH}
                                style={styles.brushImage}
                                resizeMode="stretch"
                              />
                              <Text
                                style={[
                                  styles.resultLabel,
                                  isCompact && compactStyles.resultLabel,
                                ]}
                              >
                                {item.isWinner ? 'WIN' : 'LOSS'}
                              </Text>
                            </View>
                            <Text style={[styles.resultText, isCompact && compactStyles.resultText]}>
                              vs {item.opponentName}
                            </Text>
                          </View>
                          <View style={styles.metaRow}>
                            <Text style={[styles.metaText, isCompact && compactStyles.metaText]}>
                              Turns: {item.turnsTaken}
                            </Text>
                            <Text style={[styles.metaText, isCompact && compactStyles.metaText]}>
                              Payout: {item.isWinner ? formatSol(item.winnerPayoutLamports) : '0.000'} SOL
                            </Text>
                            <Text style={[styles.metaText, isCompact && compactStyles.metaText]}>
                              {formatDate(item.playedAtUnix)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Refresh button centered below scroll */}
          <View style={styles.refreshRow}>
            <TouchableOpacity
              onPress={() => void loadHistory()}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <ImageBackground
                source={buttonV4Source}
                style={[styles.refreshButton, isCompact && compactStyles.refreshButton]}
                resizeMode="stretch"
              >
                <Text
                  style={[styles.refreshButtonText, isCompact && compactStyles.refreshButtonText]}
                >
                  Refresh
                </Text>
              </ImageBackground>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  stainsOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  headerButton: {
    width: 90,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonPlaceholder: {
    width: 90,
  },
  headerSpacer: { flex: 1 },
  headerButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#3d2b1f',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleImage: {
    width: 130,
    height: 38,
  },
  historyTitleImage: {
    width: 100,
    height: 32,
    marginTop: 5,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    marginTop: 4,
  },
  scrollWrapper: {
    width: '90%',
    maxWidth: 520,
    flex: 1,
  },
  scrollImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  scrollOverlay: {
    flex: 1,
    paddingHorizontal: 36,
    paddingTop: 24,
    paddingBottom: 16,
  },
  listContent: {
    paddingBottom: 16,
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowOuter: {
    position: 'relative',
  },
  rowFrame: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  rowInner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brushWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  brushImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  resultText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: '#000000',
  },
  resultLabel: {
    fontFamily: Typography.body,
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaText: {
    fontFamily: Typography.body,
    color: '#000000',
    fontSize: 11,
  },
  emptyWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Typography.body,
    color: '#000000',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    color: '#c0392b',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  refreshRow: {
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  refreshButton: {
    width: 140,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 4,
  },
});

const compactStyles = StyleSheet.create({
  header: {
    marginTop: 12,
  },
  headerButton: {
    width: 140,
    height: 76,
  },
  headerButtonText: {
    fontSize: 28,
    marginBottom: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 8,
  },
  titleImage: {
    width: 320,
    height: 85,
  },
  historyTitleImage: {
    width: 240,
    height: 74,
    marginTop: 5,
  },
  centerContent: {
    justifyContent: 'center',
  },
  scrollWrapper: {
    maxWidth: 900,
    maxHeight: 540,
  },
  scrollOverlay: {
    paddingHorizontal: 76,
    paddingTop: 56,
    paddingBottom: 44,
  },
  listContent: {
    gap: 12,
  },
  rowInner: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  resultText: {
    fontSize: 32,
  },
  resultLabel: {
    fontSize: 36,
  },
  metaText: {
    fontSize: 22,
  },
  emptyText: {
    fontSize: 28,
  },
  refreshButton: {
    width: 200,
    height: 76,
  },
  refreshButtonText: {
    fontSize: 24,
    marginBottom: 6,
  },
});
