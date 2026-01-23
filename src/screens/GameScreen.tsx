/**
 * GameScreen - Main exploration gameplay screen
 */

import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ImageBackground, Image, Pressable } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useSession } from '../contexts/SessionContext';
import { useProfile } from '../contexts/ProfileContext';
import { DPadControls } from '../components/game/DPadControls';
import {
  TopBar,
  GameCanvas,
  DebugOverlay,
  POIModal,
  FastTravelOverlay,
  ItemTooltip,
} from '../components/game';
import { Sidebar } from '../components/game/Sidebar';
import { useDirectionInput } from '../hooks/useInput';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { Direction, DIRECTION_DELTA } from '../game/input/types';
import { TileType } from '../game/map/types';
import { canFastTravel, getDiscoveredWaypoints } from '../game/entities/pois';
import { canAffordCostAcrossPhases } from '../game/time/progression';
import { Typography } from '../theme/typography';
import type { Gear, GearId, Tool } from '../game/engine/types';
import Svg, { Path } from 'react-native-svg';

const BACKGROUND_IMAGE = require('../../assets/loading/background.png');
const COIN_ICON = require('../../assets/icons/coin.png');
const MAP_ICON = require('../../assets/icons/map.png');

const SIDEBAR_WIDTH = 230;
const NAVBAR_HEIGHT = 60;

function ThinSeparator({ horizontal = true }: { horizontal?: boolean }) {
  if (horizontal) {
    return (
      <View style={styles.hSeparator}>
        <Svg height="6" width="100%" preserveAspectRatio="none" viewBox="0 0 100 6">
          <Path d="M 0 3 C 20 1, 80 1, 100 3 C 80 5, 20 5, 0 3" fill="black" />
        </Svg>
      </View>
    );
  }
  return (
    <View style={styles.vSeparator}>
      <Svg height="100%" width="6" preserveAspectRatio="none" viewBox="0 0 6 100">
        <Path d="M 3 0 C 1 20, 1 80, 3 100 C 5 80, 5 20, 3 0" fill="black" />
      </Svg>
    </View>
  );
}

function CrossingLines() {
  return (
    <View style={styles.linesOverlay} pointerEvents="none">
      <View style={styles.hLineContainer}>
        <ThinSeparator horizontal={true} />
      </View>
      <View style={styles.vLineContainer}>
        <ThinSeparator horizontal={false} />
      </View>
    </View>
  );
}

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

export function GameScreen({ navigation }: GameScreenProps) {
  const { state, dispatch, overviewMode, toggleOverviewMode, panOverview, zoomOverview } =
    useGame();
  const { mode } = useProfile();
  const { hasActiveSession, movePlayer } = useSession();
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wallBreakFeedback, setWallBreakFeedback] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  const showWallBreakFeedback = useCallback((message: string) => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    setWallBreakFeedback(message);
    feedbackTimeout.current = setTimeout(() => {
      setWallBreakFeedback(null);
      feedbackTimeout.current = null;
    }, 2000);
  }, []);

  const discoveredWaypoints = useMemo(
    () => (state ? getDiscoveredWaypoints(state.map) : []),
    [state?.map]
  );
  const fastTravelAvailable = useMemo(
    () => state?.phase === GamePhase.Exploration && canFastTravel(state.map),
    [state?.map, state?.phase]
  );

  useLandscapeLock();

  const handleDirection = useCallback(
    (direction: Direction) => {
      if (
        !state ||
        state.phase !== GamePhase.Exploration ||
        overviewMode.active ||
        state.fastTravel?.active
      )
        return;
      const delta = DIRECTION_DELTA[direction];
      const targetPos = {
        x: state.player.position.x + delta.x,
        y: state.player.position.y + delta.y,
      };
      const inBounds =
        targetPos.x >= 0 &&
        targetPos.x < state.map.width &&
        targetPos.y >= 0 &&
        targetPos.y < state.map.height;
      let isWall = false;
      let shouldSendTransaction = true;

      if (inBounds) {
        isWall = state.map.tiles[targetPos.y][targetPos.x] === TileType.Wall;
        if (isWall) {
          const isHighlighted =
            state.wallHighlight &&
            state.wallHighlight.direction === direction &&
            state.wallHighlight.targetPosition.x === targetPos.x &&
            state.wallHighlight.targetPosition.y === targetPos.y;
          if (!isHighlighted) shouldSendTransaction = false;
          if (state.player.stats.dig < 1) showWallBreakFeedback('Requires DIG to break walls');
          else if (
            state.wallHighlight &&
            state.wallHighlight.direction === direction &&
            !canAffordCostAcrossPhases(state.time, state.wallHighlight.cost)
          )
            showWallBreakFeedback(`Not enough moves (need ${state.wallHighlight.cost})`);
        }
      }

      dispatch({ type: 'MOVE', direction });

      if (shouldSendTransaction && mode !== 'guest' && hasActiveSession && inBounds) {
        movePlayer({ targetX: targetPos.x, targetY: targetPos.y, isWall })
          .then(({ success }) => {
            if (!success) {
              let reverseDir: Direction;
              switch (direction) {
                case Direction.Up:
                  reverseDir = Direction.Down;
                  break;
                case Direction.Down:
                  reverseDir = Direction.Up;
                  break;
                case Direction.Left:
                  reverseDir = Direction.Right;
                  break;
                case Direction.Right:
                  reverseDir = Direction.Left;
                  break;
              }
              dispatch({ type: 'MOVE', direction: reverseDir });
              showWallBreakFeedback('Movement failed on-chain');
            }
          })
          .catch(() => {
            let reverseDir: Direction;
            switch (direction) {
              case Direction.Up:
                reverseDir = Direction.Down;
                break;
              case Direction.Down:
                reverseDir = Direction.Up;
                break;
              case Direction.Left:
                reverseDir = Direction.Right;
                break;
              case Direction.Right:
                reverseDir = Direction.Left;
                break;
            }
            dispatch({ type: 'MOVE', direction: reverseDir });
            showWallBreakFeedback('Movement sync error');
          });
      }
    },
    [
      dispatch,
      overviewMode.active,
      showWallBreakFeedback,
      state,
      mode,
      hasActiveSession,
      movePlayer,
    ]
  );

  useDirectionInput(handleDirection, {
    enabled: state?.phase === GamePhase.Exploration && !state.fastTravel?.active,
    blocked: overviewMode.active || Boolean(state?.fastTravel?.active),
  });

  const disabledDirections = useMemo(() => {
    if (!state) return [];
    if (overviewMode.active || state.fastTravel?.active)
      return [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
    const disabled: Direction[] = [];
    const { x, y } = state.player.position;
    const directions = [
      { dir: Direction.Up, dx: 0, dy: -1 },
      { dir: Direction.Down, dx: 0, dy: 1 },
      { dir: Direction.Left, dx: -1, dy: 0 },
      { dir: Direction.Right, dx: 1, dy: 0 },
    ];
    for (const { dir, dx, dy } of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= state.map.width || ny < 0 || ny >= state.map.height) disabled.push(dir);
    }
    return disabled;
  }, [state, overviewMode.active]);

  useEffect(() => {
    if (state?.phase === GamePhase.Combat || state?.phase === GamePhase.BossFight)
      navigation.navigate('Combat');
  }, [state?.phase, navigation]);

  const handlePOIClose = useCallback(() => {
    setKilnSelection({ gearId: null, emoji: '', count: 0 });
    setScrapSelection(null);
    dispatch({ type: 'CLOSE_POI' });
  }, [dispatch]);

  const handlePOIOption = useCallback(
    (optionIndex: number) => {
      setKilnSelection({ gearId: null, emoji: '', count: 0 });
      setScrapSelection(null);
      dispatch({ type: 'SELECT_POI_OPTION', optionIndex });
    },
    [dispatch]
  );

  const [kilnSelection, setKilnSelection] = useState<{
    gearId: GearId | null;
    emoji: string;
    count: number;
  }>({ gearId: null, emoji: '', count: 0 });
  const [scrapSelection, setScrapSelection] = useState<Gear | null>(null);

  const [inspectedItem, setInspectedItem] = useState<Tool | Gear | null>(null);
  const [isTooltipVisible, setTooltipVisible] = useState(false);

  const handleInspectItem = useCallback((item: Tool | Gear) => {
    setInspectedItem(item);
    setTooltipVisible(true);
  }, []);
  const handleInspectTool = useCallback((tool: Tool) => {
    setInspectedItem(tool);
    setTooltipVisible(true);
  }, []);
  const handleCloseTooltip = useCallback(() => setTooltipVisible(false), []);

  const handleInventoryItemPress = useCallback(
    (item: Tool | Gear) => {
      if (state?.phase !== GamePhase.POIInteraction) return;

      // Rune Kiln (L11) Logic
      if (state.activePOI?.poi.definitionId === 'L11' && 'currentRarity' in item) {
        if (item.currentRarity !== 'COMMON' && item.currentRarity !== 'GILDED') return;
        const availableCount = state.player.inventory.filter(
          (slot) => slot.item.id === item.id
        ).length;
        if (availableCount === 0) return;
        setKilnSelection((prev) => {
          if (!prev.gearId || prev.gearId !== item.id)
            return { gearId: item.id, emoji: item.emoji, count: 1 };
          const maxCount = Math.min(2, availableCount);
          return prev.count < maxCount ? { ...prev, count: prev.count + 1 } : prev;
        });
        return;
      }

      // Scrap Chute (L14) Logic
      if (state.activePOI?.poi.definitionId === 'L14' && 'currentRarity' in item) {
        setScrapSelection(item as Gear);
      }
    },
    [state]
  );

  const kilnFuseOptionIndex = useMemo(() => {
    if (
      state?.activePOI?.poi.definitionId !== 'L11' ||
      !kilnSelection.gearId ||
      kilnSelection.count < 2
    )
      return null;
    const options = state.activePOI.options ?? [];
    const index = options.findIndex(
      (opt) => opt.item && 'currentRarity' in opt.item && opt.item.id === kilnSelection.gearId
    );
    return index >= 0 ? index : null;
  }, [state, kilnSelection]);

  const scrapOptionIndex = useMemo(() => {
    if (state?.activePOI?.poi.definitionId !== 'L14' || !scrapSelection) return null;
    const options = state.activePOI.options ?? [];
    return options.findIndex((opt) => opt.item === scrapSelection);
  }, [state, scrapSelection]);

  const handleKilnSlotPress = useCallback(() => {
    setKilnSelection((prev) => {
      if (!prev.gearId || prev.count === 0) return prev;
      return prev.count - 1 <= 0
        ? { gearId: null, emoji: '', count: 0 }
        : { ...prev, count: prev.count - 1 };
    });
  }, []);

  const handleScrapSlotPress = useCallback(() => {
    setScrapSelection(null);
  }, []);

  const isRuneKilnActive =
    state?.phase === GamePhase.POIInteraction && state.activePOI?.poi.definitionId === 'L11';

  if (!state) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={BACKGROUND_IMAGE}
          style={styles.backgroundImage}
          resizeMode="cover"
        >
          <View style={styles.darkOverlay}>
            <View style={styles.loading}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          </View>
        </ImageBackground>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ImageBackground source={BACKGROUND_IMAGE} style={styles.backgroundImage} resizeMode="cover">
        <View style={styles.darkOverlay}>
          <View style={styles.fullLayout}>
            {/* Top Area */}
            <View style={styles.topRow}>
              <View style={styles.navbarArea}>
                <View style={styles.navbarLeft}>
                  <Pressable style={styles.mapToggleButton} onPress={toggleOverviewMode}>
                    <Image source={MAP_ICON} style={styles.mapIcon} resizeMode="contain" />
                  </Pressable>
                </View>
                <View style={styles.navbarCenter}>
                  <Text style={styles.weekText}>Week {state.time.week}</Text>
                  <TopBar time={state.time} />
                </View>
                <View style={styles.navbarRight}>
                  <View style={styles.goldDisplay}>
                    <Image source={COIN_ICON} style={styles.coinIcon} resizeMode="contain" />
                    <Text style={styles.goldValue}>{state.player.stats.gold}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.bossTopContainer}>
                <Sidebar
                  time={state.time}
                  stats={state.player.stats}
                  inventory={state.player.inventory}
                  inventoryCapacity={state.player.inventoryCapacity}
                  equippedTool={state.player.equippedTool}
                  activeItemsets={state.player.activeItemsets}
                  onlyBoss={true}
                />
              </View>
            </View>

            {/* Bottom Area */}
            <View style={styles.bottomRow}>
              <View style={styles.mapAreaContainer}>
                <GameCanvas
                  map={state.map}
                  playerPosition={state.player.position}
                  playerFacing={state.player.facing}
                  timePhase={state.time.phase}
                  wallHighlight={state.wallHighlight}
                  overviewMode={overviewMode}
                  onPanOverview={panOverview}
                  onZoomOverview={zoomOverview}
                  feedbackMessage={wallBreakFeedback}
                />
                <DebugOverlay
                  debug={state.debug}
                  seed={state.seed}
                  phase={state.phase}
                  time={state.time}
                />

                <View
                  style={styles.dpadOverlay}
                  pointerEvents={overviewMode.active || state.fastTravel?.active ? 'none' : 'auto'}
                >
                  <DPadControls
                    onDirection={handleDirection}
                    size={120}
                    disabledDirections={disabledDirections}
                  />
                </View>

                {state.fastTravel?.active && (
                  <FastTravelOverlay
                    waypoints={discoveredWaypoints}
                    selectedIndex={state.fastTravel.selectedIndex}
                    currentPosition={state.player.position}
                    overviewMode={overviewMode}
                    onCycle={() => dispatch({ type: 'CYCLE_FAST_TRAVEL' })}
                    onConfirm={() => dispatch({ type: 'CONFIRM_FAST_TRAVEL' })}
                    onCancel={() => dispatch({ type: 'CANCEL_FAST_TRAVEL' })}
                  />
                )}
                <POIModal
                  visible={state.phase === GamePhase.POIInteraction}
                  interaction={state.activePOI}
                  onSelectOption={handlePOIOption}
                  onClose={handlePOIClose}
                  kilnSelection={kilnSelection}
                  kilnFuseOptionIndex={kilnFuseOptionIndex}
                  onKilnSlotPress={handleKilnSlotPress}
                  scrapSelection={scrapSelection}
                  scrapOptionIndex={scrapOptionIndex}
                  onScrapSlotPress={handleScrapSlotPress}
                  equippedTool={state.player.equippedTool}
                />
              </View>
              <View style={styles.sidebarBottomContainer}>
                <Sidebar
                  time={state.time}
                  stats={state.player.stats}
                  inventory={state.player.inventory}
                  inventoryCapacity={state.player.inventoryCapacity}
                  equippedTool={state.player.equippedTool}
                  activeItemsets={state.player.activeItemsets}
                  onItemInspect={handleInspectItem}
                  onToolInspect={handleInspectTool}
                  isRuneKilnActive={isRuneKilnActive}
                  handleInventoryItemPress={handleInventoryItemPress}
                  onlyContent={true}
                />
              </View>
            </View>

            {/* Crossing Separators */}
            <CrossingLines />
          </View>

          <ItemTooltip
            item={inspectedItem}
            visible={isTooltipVisible}
            onClose={handleCloseTooltip}
          />
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  darkOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.15)' },
  fullLayout: { flex: 1 },
  topRow: { height: NAVBAR_HEIGHT, flexDirection: 'row' },
  navbarArea: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  navbarLeft: { width: 100, justifyContent: 'center', alignItems: 'flex-start', gap: 2 },
  navbarCenter: { flex: 1, justifyContent: 'center' },
  navbarRight: { width: 80, justifyContent: 'center', alignItems: 'flex-end' },
  weekText: {
    alignSelf: 'center',
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#000000',
    fontWeight: 'bold',
  },
  bossTopContainer: { width: SIDEBAR_WIDTH },
  bottomRow: { flex: 1, flexDirection: 'row' },
  mapAreaContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebarBottomContainer: { width: SIDEBAR_WIDTH, padding: 6 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontFamily: Typography.header, fontSize: 20, color: '#666666' },
  dpadOverlay: { position: 'absolute', bottom: 24, left: 24 },
  goldDisplay: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coinIcon: { width: 28, height: 28 },
  goldValue: { fontFamily: Typography.number, fontSize: 24, fontWeight: 'bold', color: '#000000' },
  mapToggleButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  mapIcon: { width: 32, height: 32 },

  // Crossing Line Styles
  linesOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  hLineContainer: { position: 'absolute', top: NAVBAR_HEIGHT - 3, left: 0, right: 0, height: 6 },
  hSeparator: { width: '100%', height: 6 },
  vLineContainer: { position: 'absolute', top: 0, bottom: 0, right: SIDEBAR_WIDTH - 3, width: 6 },
  vSeparator: { height: '100%', width: 6 },
});
