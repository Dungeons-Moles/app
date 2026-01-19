/**
 * GameScreen - Main exploration gameplay screen
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 1
 */

import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { useSession } from '../contexts/SessionContext';
import { useProfile } from '../contexts/ProfileContext';
import { DPadControls } from '../components/game/DPadControls';
import {
  TopBar,
  GameCanvas,
  StatsPanel,
  InventoryPanel,
  ItemTooltip,
  DebugOverlay,
  POIModal,
  FastTravelOverlay,
} from '../components/game';
import { useDirectionInput } from '../hooks/useInput';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { Direction, DIRECTION_DELTA } from '../game/input/types';
import { TileType } from '../game/map/types';
import { TimePhase, type GearId, type Tool, type Gear } from '../game/engine/types';
import { canFastTravel, getDiscoveredWaypoints } from '../game/entities/pois';
import { canInteractWithPOI } from '../data/pois';
import { canAffordCostAcrossPhases } from '../game/time/progression';
import { Typography } from '../theme/typography';

type GameScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Game'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

/**
 * GameScreen - Container for exploration gameplay
 * Displays the dungeon map and D-pad controls in landscape orientation
 * @see T072: Wire up TopBar to GameScreen
 */
export function GameScreen({ navigation }: GameScreenProps) {
  const { state, dispatch, overviewMode, toggleOverviewMode, panOverview, zoomOverview } =
    useGame();
  const { mode } = useProfile();
  const { hasActiveSession, movePlayer } = useSession();
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wallBreakFeedback, setWallBreakFeedback] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const showWallBreakFeedback = useCallback((message: string) => {
    if (feedbackTimeout.current) {
      clearTimeout(feedbackTimeout.current);
    }
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

  const fastTravelAvailable = useMemo(() => {
    if (!state) {
      return false;
    }
    return state.phase === GamePhase.Exploration && canFastTravel(state.map);
  }, [state?.map, state?.phase]);

  const handleFastTravelPress = useCallback(() => {
    if (!state) {
      return;
    }
    if (state.fastTravel?.active) {
      dispatch({ type: 'CYCLE_FAST_TRAVEL' });
      return;
    }
    if (!fastTravelAvailable || overviewMode.active) {
      return;
    }
    dispatch({ type: 'ACTIVATE_FAST_TRAVEL' });
  }, [dispatch, fastTravelAvailable, overviewMode.active, state]);

  // Lock to landscape orientation (FR-044)
  useLandscapeLock();

  // Handle direction input
  const handleDirection = useCallback(
    (direction: Direction) => {
      if (
        !state ||
        state.phase !== GamePhase.Exploration ||
        overviewMode.active ||
        state.fastTravel?.active
      ) {
        return;
      }

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
        const targetTile = state.map.tiles[targetPos.y][targetPos.x];
        isWall = targetTile === TileType.Wall;

        if (isWall) {
          // Check if already highlighted
          const isHighlighted =
            state.wallHighlight &&
            state.wallHighlight.direction === direction &&
            state.wallHighlight.targetPosition.x === targetPos.x &&
            state.wallHighlight.targetPosition.y === targetPos.y;

          if (!isHighlighted) {
            // First click: Highlight only. No transaction.
            shouldSendTransaction = false;
          }

          if (state.player.stats.dig < 1) {
            showWallBreakFeedback('Requires DIG to break walls');
          } else if (
            state.wallHighlight &&
            state.wallHighlight.direction === direction &&
            state.wallHighlight.targetPosition.x === targetPos.x &&
            state.wallHighlight.targetPosition.y === targetPos.y &&
            !canAffordCostAcrossPhases(state.time, state.wallHighlight.cost)
          ) {
            showWallBreakFeedback(`Not enough moves (need ${state.wallHighlight.cost})`);
          }
        }
      }

      dispatch({ type: 'MOVE', direction });

      // US3: On-chain movement tracking (fire-and-forget)
      if (shouldSendTransaction && mode !== 'guest' && hasActiveSession && inBounds) {
        console.log(`[GameContext] Movement tracking: ${direction}`);
        movePlayer({
          targetX: targetPos.x,
          targetY: targetPos.y,
          isWall,
        })
          .then(({ success }) => {
            if (!success) {
              // Revert move if on-chain fails
              // This prevents visual desync
              // We calculate opposite direction to move back
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
            // Revert move on error too
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

  // Set up keyboard input
  useDirectionInput(handleDirection, {
    enabled: state?.phase === GamePhase.Exploration && !state.fastTravel?.active,
    blocked: overviewMode.active || Boolean(state?.fastTravel?.active),
  });

  // Calculate disabled directions (tiles player can't move to)
  const disabledDirections = useMemo(() => {
    if (!state) return [];
    if (overviewMode.active || state.fastTravel?.active) {
      return [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
    }

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

      // Check bounds
      if (nx < 0 || nx >= state.map.width || ny < 0 || ny >= state.map.height) {
        disabled.push(dir);
        continue;
      }
    }

    return disabled;
  }, [
    state?.player.position,
    state?.map.tiles,
    state?.map.width,
    state?.map.height,
    overviewMode.active,
    state?.fastTravel?.active,
  ]);

  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) {
        clearTimeout(feedbackTimeout.current);
      }
    };
  }, []);

  // Navigate to Combat screen when entering combat or boss fight
  useEffect(() => {
    if (state?.phase === GamePhase.Combat || state?.phase === GamePhase.BossFight) {
      navigation.navigate('Combat');
    }
  }, [state?.phase, navigation]);

  // Handle POI modal close
  const handlePOIClose = useCallback(() => {
    dispatch({ type: 'CLOSE_POI' });
  }, [dispatch]);

  const poiAtPlayer = useMemo(() => {
    if (!state) return null;
    const { x, y } = state.player.position;
    return state.map.pois.find((poi) => poi.position.x === x && poi.position.y === y) ?? null;
  }, [state?.map.pois, state?.player.position]);

  const canReopenPOI = useMemo(() => {
    if (!state) return false;
    if (state.phase !== GamePhase.Exploration) return false;
    if (overviewMode.active || state.fastTravel?.active) return false;
    if (!poiAtPlayer) return false;
    if (poiAtPlayer.visited) return false;
    if (poiAtPlayer.definitionId === 'L6') return false; // Survey Beacon auto-activates on step

    const isNight = state.time.phase === TimePhase.Night;
    return canInteractWithPOI(poiAtPlayer.definitionId, isNight);
  }, [overviewMode.active, poiAtPlayer, state, state?.fastTravel?.active]);

  const handlePOIReopen = useCallback(() => {
    if (!state || !poiAtPlayer) return;
    if (!canReopenPOI) return;
    dispatch({ type: 'INTERACT_POI', poiId: poiAtPlayer.id });
  }, [canReopenPOI, dispatch, poiAtPlayer, state]);

  const [kilnSelection, setKilnSelection] = useState<{
    gearId: GearId | null;
    emoji: string;
    count: number;
  }>({ gearId: null, emoji: '', count: 0 });
  const [inspectedItem, setInspectedItem] = useState<Tool | Gear | null>(null);
  const [isTooltipVisible, setTooltipVisible] = useState(false);

  useEffect(() => {
    if (state?.activePOI?.poi.definitionId !== 'L11') {
      setKilnSelection({ gearId: null, emoji: '', count: 0 });
    }
  }, [state?.activePOI?.poi.definitionId]);

  const handleInventoryItemPress = useCallback(
    (item: Tool | Gear, _slotIndex: number) => {
      if (state?.phase !== GamePhase.POIInteraction) {
        return;
      }
      if (state.activePOI?.poi.definitionId !== 'L11') {
        return;
      }
      if (!('currentRarity' in item)) {
        return;
      }
      if (item.currentRarity !== 'COMMON' && item.currentRarity !== 'GILDED') {
        return;
      }

      const availableCount = state.player.inventory.filter(
        (slot) => slot.item.id === item.id
      ).length;

      if (availableCount === 0) {
        return;
      }

      setKilnSelection((prev) => {
        if (!prev.gearId || prev.gearId !== item.id) {
          return { gearId: item.id, emoji: item.emoji, count: 1 };
        }
        const maxCount = Math.min(2, availableCount);
        if (prev.count < maxCount) {
          return { gearId: prev.gearId, emoji: prev.emoji, count: prev.count + 1 };
        }
        return prev;
      });
    },
    [state?.phase, state?.activePOI, state?.player.inventory]
  );

  const kilnFuseOptionIndex = useMemo(() => {
    if (state?.activePOI?.poi.definitionId !== 'L11') {
      return null;
    }
    if (!kilnSelection.gearId || kilnSelection.count < 2) {
      return null;
    }

    const options = state.activePOI.options ?? [];
    const optionIndex = options.findIndex(
      (option) =>
        option.item && 'currentRarity' in option.item && option.item.id === kilnSelection.gearId
    );

    return optionIndex >= 0 ? optionIndex : null;
  }, [state?.activePOI, kilnSelection]);

  const handleKilnSlotPress = useCallback((_slotIndex: number) => {
    setKilnSelection((prev) => {
      if (!prev.gearId || prev.count === 0) {
        return prev;
      }
      const nextCount = prev.count - 1;
      if (nextCount <= 0) {
        return { gearId: null, emoji: '', count: 0 };
      }
      return { ...prev, count: nextCount };
    });
  }, []);

  // Handle POI option selection
  const handlePOIOption = useCallback(
    (optionIndex: number) => {
      if (
        state?.activePOI?.poi.definitionId === 'L11' &&
        kilnFuseOptionIndex !== null &&
        optionIndex === kilnFuseOptionIndex
      ) {
        setKilnSelection({ gearId: null, emoji: '', count: 0 });
      }
      dispatch({ type: 'SELECT_POI_OPTION', optionIndex });
    },
    [dispatch, state?.activePOI?.poi.definitionId, kilnFuseOptionIndex]
  );

  const isRuneKilnActive =
    state?.phase === GamePhase.POIInteraction && state.activePOI?.poi.definitionId === 'L11';

  const handleInspectItem = useCallback((item: Tool | Gear, _slotIndex: number) => {
    setInspectedItem(item);
    setTooltipVisible(true);
  }, []);

  const handleInspectTool = useCallback((tool: Tool) => {
    setInspectedItem(tool);
    setTooltipVisible(true);
  }, []);

  const handleCloseTooltip = useCallback(() => {
    setTooltipVisible(false);
  }, []);

  // If no game state, show loading
  if (!state) {
    return (
      <View style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        {/* Left column: TopBar + Map */}
        <View style={styles.leftColumn}>
          {/* Top Bar with week progress and boss preview */}
          {state?.time && (
            <TopBar
              time={state.time}
              overviewActive={overviewMode.active}
              onToggleOverview={toggleOverviewMode}
            />
          )}

          {/* Map Area */}
          <View style={styles.mapArea}>
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

            {/* Debug Overlay (top-left) - P15: Debug Tooling Isolation */}
            <DebugOverlay
              debug={state.debug}
              seed={state.seed}
              phase={state.phase}
              time={state.time}
            />

            {/* D-Pad Controls (bottom-left overlay per FR-002) */}
            <View
              style={styles.dpadOverlay}
              pointerEvents={overviewMode.active || state.fastTravel?.active ? 'none' : 'auto'}
            >
              <DPadControls
                onDirection={handleDirection}
                onCenterPress={handlePOIReopen}
                centerDisabled={!canReopenPOI}
                centerLabel="A"
                disabledDirections={disabledDirections}
                size={120}
              />
            </View>

            {/* Gold Display (top-right of map) */}
            <View style={styles.goldOverlay}>
              <Text style={styles.goldEmoji}>🪙</Text>
              <Text style={styles.goldValue}>{state.player.stats.gold}</Text>
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

            {/* POI Interaction Modal - inside mapArea for proper overlay positioning */}
            <POIModal
              visible={state.phase === GamePhase.POIInteraction}
              interaction={state.activePOI}
              onSelectOption={handlePOIOption}
              onClose={handlePOIClose}
              kilnSelection={kilnSelection}
              kilnFuseOptionIndex={kilnFuseOptionIndex}
              onKilnSlotPress={handleKilnSlotPress}
            />
          </View>
        </View>

        {/* Side Panel (right) - Stats and Inventory - Full height */}
        <View style={styles.sidePanel}>
          {/* Stats Panel (top-right per FR-045) */}
          <StatsPanel stats={state.player.stats} />

          {/* Inventory Panel */}
          <InventoryPanel
            inventory={state.player.inventory}
            equippedTool={state.player.equippedTool}
            inventoryCapacity={state.player.inventoryCapacity}
            activeItemsets={state.player.activeItemsets}
            onItemPress={isRuneKilnActive ? handleInventoryItemPress : undefined}
            onItemInspect={handleInspectItem}
            onToolInspect={handleInspectTool}
          />
        </View>
      </View>

      <ItemTooltip item={inspectedItem} visible={isTooltipVisible} onClose={handleCloseTooltip} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  leftColumn: {
    flex: 1,
    flexDirection: 'column',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#666666',
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  dpadOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  sidePanel: {
    width: 170, // Increased width slightly
    backgroundColor: '#151518',
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a30',
    paddingVertical: 12, // Increased padding
    paddingHorizontal: 10,
    justifyContent: 'flex-start',
    gap: 8,
  },
  goldOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  goldEmoji: {
    fontSize: 14,
  },
  goldValue: {
    fontFamily: Typography.number,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
});
