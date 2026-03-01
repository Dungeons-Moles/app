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
import { useIsFocused } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { useDuels, type DuelHistoryItem } from '@/hooks/useDuels';
import { useWallet } from '@/contexts/WalletContext';
import { useSolanaConnection } from '@/contexts/SolanaConnectionContext';
import { useScreenVariant } from '@/contexts/ScreenVariantContext';
import { Typography } from '@/theme/typography';
import { useAudio } from '../contexts/AudioContext';
import { useControllerAction } from '../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from '../components/ui/ControllerHints';
import { useInputMode } from '../hooks/useInputMode';
import { FocusGlow } from '../components/ui/FocusGlow';
import { HubSettingsModal } from '../components/ui/HubSettingsModal';
import { createGameplayStateProgram } from '@/services/solana/programs';
import { parseDuelEvents } from '@/services/solana/duels';
import { convertItemInstanceToTool, convertItemInstanceToGear } from '@/services/solana/pitDraft';
import { calculateItemStats } from '@/game/entities/items';
import type { CombatantState, Gear, Tool } from '@/game/engine/types';
import type { BackendCombatLogEntry } from '@/services/solana/types/combat_events';

const BACKGROUND_IMAGE = require('../../assets/ui/backgrounds/loading-background.png');
const STAINS_BACKGROUND = require('../../assets/ui/backgrounds/stains-background.png');
const DUELS_TITLE = require('../../assets/ui/text/duels.png');
const HISTORY_TITLE = require('../../assets/ui/text/history.png');
const HISTORY_SCROLL = require('../../assets/ui/illustrations/history-scroll.png');
const RECTANGLE_FRAME = require('../../assets/ui/frames/rectangle.png');
const GREEN_BRUSH = require('../../assets/ui/illustrations/green-brush.png');
const RED_BRUSH = require('../../assets/ui/illustrations/red-brush.png');
const buttonV1Source = require('../../assets/ui/buttons/button-v1.png');

// On-chain base values (ATK/ARM/SPD start at 0; bonuses come from BattleStart log entries)
const PVP_BASE_HP = 20;
const PVP_BASE_ATK = 0;
const PVP_BASE_ARM = 0;
const PVP_BASE_SPD = 0;
const PVP_BASE_DIG = 0;

function buildPvpCombatant(
  name: string,
  isPlayer: boolean,
  definitionId: string,
  tool: Tool | null,
  gear: Gear[]
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

type DuelsHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DuelsHistory'>;
};

export function DuelsHistoryScreen({ navigation }: DuelsHistoryScreenProps) {
  const duels = useDuels();
  const { wallet, disconnect } = useWallet();
  const { connection } = useSolanaConnection();
  const isCompact = useScreenVariant() === 'compact';
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoadingReplay, setIsLoadingReplay] = useState(false);
  const flatListRef = useRef<FlatList<DuelHistoryItem>>(null);

  useEffect(() => {
    void duels.loadHistory();
  }, []);

  const historyData = duels.history;
  const hasData = useMemo(() => historyData.length > 0, [historyData.length]);

  // --- Replay handler ---
  const handleReplay = useCallback(
    async (item: DuelHistoryItem) => {
      if (isLoadingReplay || !wallet.publicKey) return;
      setIsLoadingReplay(true);
      try {
        const gameplayProgram = createGameplayStateProgram(connection);
        const events = await parseDuelEvents(connection, gameplayProgram, item.signature);
        if (!events.combatVisual) {
          setIsLoadingReplay(false);
          return;
        }

        const visual = events.combatVisual;
        const ourKey = wallet.publicKey.toBase58();
        const isPlayerA = visual.playerA.toBase58() === ourKey;

        const ourToolInst = isPlayerA ? visual.playerATool : visual.playerBTool;
        const ourGearInsts = isPlayerA ? visual.playerAGear : visual.playerBGear;
        const oppToolInst = isPlayerA ? visual.playerBTool : visual.playerATool;
        const oppGearInsts = isPlayerA ? visual.playerBGear : visual.playerAGear;

        const playerTool = ourToolInst ? convertItemInstanceToTool(ourToolInst) : null;
        const playerGear = ourGearInsts
          .filter((g): g is NonNullable<typeof g> => g !== null)
          .map((g) => convertItemInstanceToGear(g))
          .filter((g): g is Gear => g !== null);

        const enemyTool = oppToolInst ? convertItemInstanceToTool(oppToolInst) : null;
        const enemyGear = oppGearInsts
          .filter((g): g is NonNullable<typeof g> => g !== null)
          .map((g) => convertItemInstanceToGear(g))
          .filter((g): g is Gear => g !== null);

        const player = buildPvpCombatant('You', true, 'player', playerTool, playerGear);
        const enemy = buildPvpCombatant(
          item.opponentProfileName,
          false,
          'pvpOpponent',
          enemyTool,
          enemyGear
        );

        const combatLog: BackendCombatLogEntry[] = visual.combatLog.map((entry) => ({
          ...entry,
          isPlayer: isPlayerA ? entry.isPlayer : !entry.isPlayer,
        }));

        navigation.navigate('Combat', {
          combatInput: {
            player,
            enemy,
            seed: 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            enemyDefinitionId: 'pvpOpponent' as any, // PvP uses a non-EnemyId definitionId
            combatLog,
            onChainOutcome: {
              finalPlayerHp: isPlayerA ? visual.finalPlayerAHp : visual.finalPlayerBHp,
              finalPlayerGold: 0,
              playerWon: item.isWinner,
            },
            playerTool: playerTool,
            playerGear: playerGear,
            enemyTool: enemyTool,
            enemyGear: enemyGear,
            duelReplay: true,
            historyReplay: true,
            preserveArmor: true,
          },
        });
      } catch (err) {
        console.error('[DuelsHistory] Failed to load replay:', err);
      } finally {
        setIsLoadingReplay(false);
      }
    },
    [isLoadingReplay, wallet.publicKey, connection, navigation]
  );

  // --- Controller navigation ---
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isFocused = useIsFocused();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const { playSfx } = useAudio();
  const handleBack = useCallback(() => {
    playSfx('ui_back');
    navigation.goBack();
  }, [navigation, playSfx]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Account' }],
    });
  }, [disconnect, navigation]);

  const handleDPadUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleDPadDown = useCallback(() => {
    setSelectedIndex((prev) => Math.min(historyData.length - 1, prev + 1));
  }, [historyData.length]);

  useEffect(() => {
    if (historyData.length > 0 && selectedIndex >= 0) {
      flatListRef.current?.scrollToIndex({
        index: selectedIndex,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [selectedIndex, historyData.length]);

  useControllerAction(
    {
      onB: handleBack,
      onStart: () => setShowSettingsModal(true),
      onA: () => {
        if (historyData.length > 0 && selectedIndex >= 0 && selectedIndex < historyData.length) {
          void handleReplay(historyData[selectedIndex]);
        } else {
          void duels.loadHistory();
        }
      },
      onDPadUp: handleDPadUp,
      onDPadDown: handleDPadDown,
    },
    isController && isFocused && !showSettingsModal
  );

  const controllerHints: ButtonHint[] = [
    { button: 'DPadUpDown', label: 'Navigate' },
    { button: 'A', label: historyData.length > 0 ? 'Watch' : 'Refresh' },
    { button: 'B', label: 'Back' },
  ];

  const formatDate = (unixTs: number | null) => {
    if (!unixTs) return '—';
    return new Date(unixTs * 1000).toLocaleString();
  };

  const formatSol = (lamports: number) => (lamports / 1_000_000_000).toFixed(3);

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
                <Image source={DUELS_TITLE} style={styles.titleImage} resizeMode="contain" />
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

          {/* Title row — compact only (separate from header) */}
          {isCompact && (
            <View style={compactStyles.titleRow}>
              <Image source={DUELS_TITLE} style={compactStyles.titleImage} resizeMode="contain" />
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
              <Image source={HISTORY_SCROLL} style={styles.scrollImage} resizeMode="stretch" />
              <View style={[styles.scrollOverlay, isCompact && compactStyles.scrollOverlay]}>
                {duels.isHistoryLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#000000" size="large" />
                  </View>
                ) : duels.historyError ? (
                  <Text style={styles.errorText}>{duels.historyError}</Text>
                ) : !hasData ? (
                  <View style={styles.emptyWrapper}>
                    <Text style={[styles.emptyText, isCompact && compactStyles.emptyText]}>
                      No Duels matches found yet.
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    ref={flatListRef}
                    data={historyData}
                    keyExtractor={(item) => item.signature}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={10}
                    maxToRenderPerBatch={5}
                    windowSize={5}
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
                                <Text
                                  style={[styles.resultText, isCompact && compactStyles.resultText]}
                                >
                                  vs {item.opponentProfileName}
                                </Text>
                              </View>
                              <View style={styles.metaRow}>
                                <Text
                                  style={[styles.metaText, isCompact && compactStyles.metaText]}
                                >
                                  Payout:{' '}
                                  {item.isWinner ? formatSol(item.winnerPayoutLamports) : '0.000'}{' '}
                                  SOL
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
      <HubSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onDisconnect={handleDisconnect}
      />
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
    width: 110,
    height: 35,
  },
  historyTitleImage: {
    width: 125,
    height: 40,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 260,
    height: 80,
  },
  historyTitleImage: {
    width: 290,
    height: 88,
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
