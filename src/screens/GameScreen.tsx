/**
 * GameScreen - Main exploration gameplay screen
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 1
 */

import React, { useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { MapRenderer } from '../components/game/MapRenderer';
import { DPadControls } from '../components/game/DPadControls';
import { TopBar, StatsPanel, InventoryPanel, DebugOverlay, POIModal } from '../components/game';
import { useDirectionInput } from '../hooks/useInput';
import { useLandscapeLock } from '../hooks/useOrientationLock';
import { Direction } from '../game/input/types';
import { TileType } from '../game/map/types';

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
  const { state, dispatch } = useGame();

  // Lock to landscape orientation (FR-044)
  useLandscapeLock();

  // Handle direction input
  const handleDirection = useCallback(
    (direction: Direction) => {
      if (state?.phase === GamePhase.Exploration) {
        dispatch({ type: 'MOVE', direction });
      }
    },
    [state?.phase, dispatch]
  );

  // Set up keyboard input
  useDirectionInput(handleDirection, {
    enabled: state?.phase === GamePhase.Exploration,
  });

  // Calculate disabled directions (tiles player can't move to)
  const disabledDirections = useMemo(() => {
    if (!state) return [];

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

      // Check if wall
      if (state.map.tiles[ny][nx] === TileType.Wall) {
        disabled.push(dir);
      }
    }

    return disabled;
  }, [state?.player.position, state?.map.tiles, state?.map.width, state?.map.height]);

  // Navigate to Combat screen when entering combat
  useEffect(() => {
    if (state?.phase === GamePhase.Combat) {
      navigation.navigate('Combat');
    }
  }, [state?.phase, navigation]);

  // Handle POI option selection
  const handlePOIOption = useCallback(
    (optionIndex: number) => {
      dispatch({ type: 'SELECT_POI_OPTION', optionIndex });
    },
    [dispatch]
  );

  // Handle POI modal close
  const handlePOIClose = useCallback(() => {
    dispatch({ type: 'CLOSE_POI' });
  }, [dispatch]);

  // If no game state, show loading
  if (!state) {
    return (
      <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
      <View style={styles.content}>
        {/* Left column: TopBar + Map */}
        <View style={styles.leftColumn}>
          {/* Top Bar with week progress and boss preview */}
          {state?.time && <TopBar time={state.time} />}

          {/* Map Area */}
          <View style={styles.mapArea}>
          <MapRenderer
            map={state.map}
            playerPosition={state.player.position}
          />

          {/* Debug Overlay (top-left) - P15: Debug Tooling Isolation */}
          <DebugOverlay
            debug={state.debug}
            seed={state.seed}
            phase={state.phase}
            time={state.time}
          />

          {/* D-Pad Controls (bottom-left overlay per FR-002) */}
          <View style={styles.dpadOverlay}>
            <DPadControls
              onDirection={handleDirection}
              disabledDirections={disabledDirections}
              size={120}
            />
          </View>

          {/* Gold Display (top-right of map) */}
          <View style={styles.goldOverlay}>
            <Text style={styles.goldEmoji}>🪙</Text>
            <Text style={styles.goldValue}>{state.player.stats.gold}</Text>
          </View>
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
          />
        </View>
      </View>

      {/* POI Interaction Modal */}
      <POIModal
        visible={state.phase === GamePhase.POIInteraction}
        interaction={state.activePOI}
        onSelectOption={handlePOIOption}
        onClose={handlePOIClose}
      />
    </SafeAreaView>
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
    fontSize: 16,
    color: '#666666',
  },
  mapArea: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
  },
  dpadOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
  },
  sidePanel: {
    width: 160,
    backgroundColor: '#151518',
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a30',
    paddingVertical: 8,
    paddingHorizontal: 6,
    justifyContent: 'flex-start',
    gap: 6,
  },
  goldOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
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
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
});
