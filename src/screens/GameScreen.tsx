/**
 * GameScreen - Main exploration gameplay screen
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 1
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { MapRenderer } from '../components/game/MapRenderer';
import { DPadControls } from '../components/game/DPadControls';
import { TopBar, StatsPanel, InventoryPanel, DebugOverlay } from '../components/game';
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

  // Handle back navigation
  const handleBack = useCallback(() => {
    dispatch({ type: 'RESET_GAME' });
    navigation.goBack();
  }, [dispatch, navigation]);

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
      {/* Top Bar with week progress and boss preview */}
      {state?.time && <TopBar time={state.time} />}

      <View style={styles.content}>
        {/* Map Area (center) */}
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
        </View>

        {/* Side Panel (right) - Stats and Inventory */}
        <View style={styles.sidePanel}>
          {/* Stats Panel (top-right per FR-045) */}
          <StatsPanel stats={state.player.stats} />

          {/* Inventory Panel */}
          <View style={styles.inventoryContainer}>
            <InventoryPanel
              inventory={state.player.inventory}
              equippedTool={state.player.equippedTool}
              inventoryCapacity={state.player.inventoryCapacity}
              activeItemsets={state.player.activeItemsets}
            />
          </View>

          {/* Exit Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    flex: 3,
    backgroundColor: '#000000',
    position: 'relative',
  },
  dpadOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
  },
  sidePanel: {
    flex: 1,
    backgroundColor: '#151518',
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a30',
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: 'flex-start',
    gap: 8,
  },
  inventoryContainer: {
    flex: 1,
    minHeight: 100,
  },
  backButton: {
    backgroundColor: '#1a1215',
    borderWidth: 1,
    borderColor: '#3a2020',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 12,
    color: '#a33a3a',
    fontWeight: '500',
  },
});
