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
import { TopBar } from '../components/game';
import { useDirectionInput } from '../hooks/useInput';
import { Direction } from '../game/input/types';
import { TileType } from '../game/map/types';
import { TimePhase } from '../game/engine/types';

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
      {/* Top Bar with week progress and boss preview (T072) */}
      {state?.time && <TopBar time={state.time} />}

      <View style={styles.content}>
        {/* Map Area */}
        <View style={styles.mapArea}>
          <MapRenderer
            map={state.map}
            playerPosition={state.player.position}
          />
        </View>

        {/* Side Panel - Controls and Stats */}
        <View style={styles.sidePanel}>
          {/* Stats Panel */}
          <View style={styles.statsPanel}>
            <Text style={styles.statsTitle}>Stats</Text>
            <Text style={styles.statRow}>
              <Text style={styles.statEmoji}>❤️</Text> {state.player.stats.hp}/{state.player.stats.maxHp}
            </Text>
            <Text style={styles.statRow}>
              <Text style={styles.statEmoji}>⚔️</Text> {state.player.stats.atk}
            </Text>
            <Text style={styles.statRow}>
              <Text style={styles.statEmoji}>🛡️</Text> {state.player.stats.arm}
            </Text>
            <Text style={styles.statRow}>
              <Text style={styles.statEmoji}>⚡</Text> {state.player.stats.spd}
            </Text>
            <Text style={styles.statRow}>
              <Text style={styles.statEmoji}>💰</Text> {state.player.stats.gold}
            </Text>
          </View>

          {/* Time Display */}
          <View style={styles.timePanel}>
            <Text style={styles.timePhase}>
              {state.time.phase === TimePhase.Day ? '☀️ Day' : '🌙 Night'} {state.time.cycle}
            </Text>
            <Text style={styles.timeMoves}>
              Moves: {state.time.movesRemaining}
            </Text>
          </View>

          {/* D-Pad Controls */}
          <View style={styles.controlsArea}>
            <DPadControls
              onDirection={handleDirection}
              disabledDirections={disabledDirections}
              size={120}
            />
          </View>

          {/* Back Button */}
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
  },
  sidePanel: {
    flex: 1,
    backgroundColor: '#151518',
    borderLeftWidth: 1,
    borderLeftColor: '#2a2a30',
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'space-between',
  },
  statsPanel: {
    backgroundColor: '#0a0a0f',
    borderWidth: 1,
    borderColor: '#2a2a30',
    padding: 8,
  },
  statsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888888',
    marginBottom: 6,
    textAlign: 'center',
  },
  statRow: {
    fontSize: 12,
    color: '#cccccc',
    marginVertical: 2,
  },
  statEmoji: {
    fontSize: 12,
  },
  timePanel: {
    backgroundColor: '#0a0a0f',
    borderWidth: 1,
    borderColor: '#2a2a30',
    padding: 8,
    alignItems: 'center',
  },
  timePhase: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cccccc',
  },
  timeMoves: {
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },
  controlsArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    backgroundColor: '#1a1215',
    borderWidth: 1,
    borderColor: '#3a2020',
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
