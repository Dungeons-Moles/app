import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { parseGauntletEvents } from '@/services/solana/gauntlet';
import { convertItemInstanceToTool, convertItemInstanceToGear } from '@/services/solana/pitDraft';
import { GAMEPLAY_STATE_PROGRAM_ID } from '@/services/solana/constants';
import { Typography } from '@/theme/typography';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { calculateItemStats } from '@/game/entities/items';
import type { CombatantState, Gear, Tool } from '@/game/engine/types';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const GAUNTLET_TITLE = require('../../assets/ui/text/gauntlet.png');
const HISTORY_TITLE = require('../../assets/ui/text/history.png');
const HISTORY_SCROLL = require('../../assets/ui/illustrations/history-scroll.png');
const RECTANGLE_FRAME = require('../../assets/ui/frames/rectangle.png');
const GREEN_BRUSH = require('../../assets/ui/illustrations/green-brush.png');
const RED_BRUSH = require('../../assets/ui/illustrations/red-brush.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');

// On-chain base values (ATK/ARM/SPD start at 0; bonuses come from BattleStart log entries)
const PVP_BASE_HP = 15;
const PVP_BASE_ATK = 0;
const PVP_BASE_ARM = 0;
const PVP_BASE_SPD = 0;
const PVP_BASE_DIG = 0;

function buildPvpCombatant(
  name: string,
  isPlayer: boolean,
  definitionId: string,
  tool: Tool | null,
  gear: Gear[],
): CombatantState {
  const itemStats = calculateItemStats(tool, gear);
  const maxHp = PVP_BASE_HP + (itemStats.hp ?? 0);
  return {
    name,
    emoji: '',
    definitionId,
    isPlayer,
    maxHp,
    hp: maxHp,
    atk: PVP_BASE_ATK,
    arm: PVP_BASE_ARM,
    spd: PVP_BASE_SPD,
    dig: PVP_BASE_DIG + (itemStats.dig ?? 0),
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

const PAGE_SIZE = 60;
const MAX_PAGES = 8;
const DEFAULT_MATCHES = 25;

type GauntletHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GauntletHistory'>;
};

interface GauntletHistoryItem {
  signature: string;
  playedAtUnix: number | null;
  week: number;
  result: 'WIN' | 'LOSS';
  turnsTaken: number;
  sourceLabel: string;
  completedRun: boolean;
}

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}..${wallet.slice(-4)}`;
}

export function GauntletHistoryScreen({ navigation }: GauntletHistoryScreenProps) {
  const { wallet } = useWallet();
  const { connection } = useSolanaConnection();
  const isCompact = useScreenVariant() === 'compact';
  const [items, setItems] = useState<GauntletHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoadingReplay, setIsLoadingReplay] = useState(false);
  const flatListRef = useRef<FlatList<GauntletHistoryItem>>(null);

  const formatDate = useCallback((unixTs: number | null) => {
    if (!unixTs) return '—';
    return new Date(unixTs * 1000).toLocaleString();
  }, []);

  const loadHistory = useCallback(async () => {
    if (!wallet.publicKey) {
      setError('Connect a wallet to view gauntlet history.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const ourKey = wallet.publicKey.toBase58();
      const signaturesById = new Map<string, { signature: string; slot: number; blockTime: number | null }>();
      const [walletSigs, programSigs] = await Promise.all([
        connection.getSignaturesForAddress(wallet.publicKey, { limit: PAGE_SIZE }, 'confirmed'),
        connection.getSignaturesForAddress(GAMEPLAY_STATE_PROGRAM_ID, { limit: PAGE_SIZE * MAX_PAGES }, 'confirmed'),
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
      const history: GauntletHistoryItem[] = [];

      for (const sigInfo of ordered) {
        const events = await parseGauntletEvents(connection, sigInfo.signature);
        const visual = events.combatVisual;
        if (!visual) continue;
        if (visual.player.toBase58() !== ourKey) continue;

        const source = events.weekEchoSelected?.sourcePlayer
          ? `Echo: ${shortWallet(events.weekEchoSelected.sourcePlayer.toBase58())}`
          : 'Echo: Bootstrap';

        const completedRun = Boolean(
          events.weekAdvanced?.completed || events.runEnded?.completed
        );

        history.push({
          signature: sigInfo.signature,
          playedAtUnix: sigInfo.blockTime ?? null,
          week: visual.week,
          result: visual.playerWon ? 'WIN' : 'LOSS',
          turnsTaken: visual.turnsTaken,
          sourceLabel: source,
          completedRun,
        });

        if (history.length >= DEFAULT_MATCHES) break;
      }

      setItems(history);
    } catch (err) {
      console.error('[GauntletHistory] Failed to load history:', err);
      setError('Failed to load gauntlet history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    void loadHistory();
  }, []);

  const hasData = useMemo(() => items.length > 0, [items.length]);

  // --- Replay handler ---
  const handleReplay = useCallback(
    async (item: GauntletHistoryItem) => {
      if (isLoadingReplay) return;
      setIsLoadingReplay(true);
      try {
        const events = await parseGauntletEvents(connection, item.signature);
        if (!events.combatVisual) {
          setIsLoadingReplay(false);
          return;
        }

        const visual = events.combatVisual;

        const playerTool = visual.playerTool
          ? convertItemInstanceToTool(visual.playerTool)
          : null;
        const playerGear = visual.playerGear
          .filter((g): g is NonNullable<typeof g> => g !== null)
          .map((g) => convertItemInstanceToGear(g))
          .filter((g): g is Gear => g !== null);

        const echoTool = visual.echoTool
          ? convertItemInstanceToTool(visual.echoTool)
          : null;
        const echoGear = visual.echoGear
          .filter((g): g is NonNullable<typeof g> => g !== null)
          .map((g) => convertItemInstanceToGear(g))
          .filter((g): g is Gear => g !== null);

        const player = buildPvpCombatant('You', true, 'player', playerTool, playerGear);
        const enemy = buildPvpCombatant(
          item.sourceLabel.replace('Echo: ', 'Echo '),
          false,
          'pvpOpponent',
          echoTool,
          echoGear,
        );

        const combatLog: BackendCombatLogEntry[] = visual.combatLog;

        navigation.navigate('Combat', {
          combatInput: {
            player,
            enemy,
            seed: 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            enemyDefinitionId: 'pvpOpponent' as any, // PvP uses a non-EnemyId definitionId
            combatLog,
            onChainOutcome: {
              finalPlayerHp: visual.finalPlayerHp,
              finalPlayerGold: 0,
              playerWon: visual.playerWon,
            },
            playerTool: playerTool,
            playerGear: playerGear,
            enemyTool: echoTool,
            enemyGear: echoGear,
            duelReplay: true,
            historyReplay: true,
            preserveArmor: true,
          },
        });
      } catch (err) {
        console.error('[GauntletHistory] Failed to load replay:', err);
      } finally {
        setIsLoadingReplay(false);
      }
    },
    [isLoadingReplay, connection, navigation],
  );

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleDPadUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleDPadDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
  }, [items.length]);

  useEffect(() => {
    if (items.length > 0 && selectedIndex >= 0) {
      flatListRef.current?.scrollToIndex({
        index: selectedIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [selectedIndex, items.length]);

  useControllerAction(
    {
      onB: handleBack,
      onA: () => {
        if (items.length > 0 && selectedIndex >= 0 && selectedIndex < items.length) {
          void handleReplay(items[selectedIndex]);
        } else {
          void loadHistory();
        }
      },
      onDPadUp: handleDPadUp,
      onDPadDown: handleDPadDown,
    },
    isController,
  );

  const controllerHints: ButtonHint[] = [
    { button: 'DPadUpDown', label: 'Navigate' },
    { button: 'A', label: items.length > 0 ? 'Watch' : 'Refresh' },
    { button: 'B', label: 'Back' },
  ];

  return (
    <View style={styles.container}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <Image source={STAINS_BACKGROUND} style={styles.stainsOverlay} resizeMode="cover" />
        <View style={styles.content}>
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
            {!isCompact && (
              <View style={styles.titleRow}>
                <Image
                  source={GAUNTLET_TITLE}
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
                source={GAUNTLET_TITLE}
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
                    <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>No gauntlet fights found yet.</Text>
                  </View>
                ) : (
                  <FlatList
                    ref={flatListRef}
                    data={items}
                    keyExtractor={(item) => item.signature}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                      styles.listContent,
                      isCompact && compactStyles.listContent,
                    ]}
                    onScrollToIndexFailed={(info) => {
                      flatListRef.current?.scrollToOffset({
                        offset: info.averageItemLength * info.index,
                        animated: true,
                      });
                    }}
                    renderItem={({ item, index }) => (
                      <FocusGlow active={isController && selectedIndex === index}>
                        <Pressable
                          onPress={() => {
                            setSelectedIndex(index);
                            void handleReplay(item);
                          }}
                        >
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
                                    source={item.result === 'WIN' ? GREEN_BRUSH : RED_BRUSH}
                                    style={styles.brushImage}
                                    resizeMode="stretch"
                                  />
                                  <Text
                                    style={[
                                      styles.resultLabel,
                                      isCompact && compactStyles.resultLabel,
                                    ]}
                                  >
                                    {item.result}
                                  </Text>
                                </View>
                                <Text
                                  style={[
                                    styles.resultText,
                                    isCompact && compactStyles.resultText,
                                  ]}
                                >
                                  - Week {item.week}
                                </Text>
                              </View>
                              <View style={styles.metaRow}>
                                <Text
                                  style={[styles.metaText, isCompact && compactStyles.metaText]}
                                >
                                  Points: {item.turnsTaken}
                                </Text>
                                <Text
                                  style={[styles.metaText, isCompact && compactStyles.metaText]}
                                >
                                  Echo: {item.sourceLabel.replace('Echo: ', '')}
                                </Text>
                                <Text
                                  style={[styles.metaText, isCompact && compactStyles.metaText]}
                                >
                                  {formatDate(item.playedAtUnix)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </Pressable>
                      </FocusGlow>
                    )}
                  />
                )}
              </View>
            </View>
          </View>

          {isLoadingReplay && (
            <View style={styles.replayOverlay}>
              <ActivityIndicator color="#000000" size="large" />
            </View>
          )}
        </View>
      </ImageBackground>
      <ControllerHints hints={controllerHints} horizontal />
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
    height: 35,
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
  replayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
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
    height: 80,
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
});
