/**
 * DebugOverlay - Dev-only debug information display
 * @see constitution.md P15: Debug Tooling Isolation
 *
 * Shows FPS counter, seed, game phase, and time state.
 * MUST NOT affect gameplay logic or RNG sequences.
 * MUST NOT consume resources when disabled.
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { GameState, TimeState, DebugState } from '../../game/engine/types';
import { GamePhase, TimePhase } from '../../game/engine/types';

// ============================================================================
// Types
// ============================================================================

export interface DebugOverlayProps {
  debug: DebugState;
  seed: number;
  phase: GamePhase;
  time: TimeState;
}

// ============================================================================
// FPS Tracker Hook
// ============================================================================

/**
 * Custom hook to track FPS without affecting game logic.
 * Only runs when showFPS is true to avoid resource consumption per P15.
 */
function useFPSTracker(enabled: boolean): number {
  const [fps, setFps] = useState(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Clean up and reset when disabled
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      frameTimesRef.current = [];
      setFps(0);
      return;
    }

    const measureFrame = (currentTime: number) => {
      if (lastFrameTimeRef.current > 0) {
        const delta = currentTime - lastFrameTimeRef.current;
        frameTimesRef.current.push(delta);

        // Keep last 60 frame times for rolling average
        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift();
        }

        // Calculate FPS every 10 frames to reduce state updates
        if (frameTimesRef.current.length % 10 === 0 && frameTimesRef.current.length > 0) {
          const avgDelta = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
          const calculatedFps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 0;
          setFps(calculatedFps);
        }
      }

      lastFrameTimeRef.current = currentTime;
      rafIdRef.current = requestAnimationFrame(measureFrame);
    };

    rafIdRef.current = requestAnimationFrame(measureFrame);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [enabled]);

  return fps;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatPhase(phase: GamePhase): string {
  switch (phase) {
    case GamePhase.MainMenu: return 'Menu';
    case GamePhase.Exploration: return 'Explore';
    case GamePhase.POIInteraction: return 'POI';
    case GamePhase.Combat: return 'Combat';
    case GamePhase.BossFight: return 'Boss';
    case GamePhase.Victory: return 'Victory';
    case GamePhase.Defeat: return 'Defeat';
    default: return 'Unknown';
  }
}

function formatTimePhase(phase: TimePhase): string {
  switch (phase) {
    case TimePhase.Day: return 'Day';
    case TimePhase.Night: return 'Night';
    case TimePhase.Boss: return 'Boss';
    default: return '?';
  }
}

// ============================================================================
// Sub-components (memoized for performance)
// ============================================================================

const FPSDisplay = memo(function FPSDisplay({ fps }: { fps: number }) {
  const fpsColor = fps >= 55 ? '#66ff66' : fps >= 30 ? '#ffff66' : '#ff6666';
  return (
    <View style={styles.row}>
      <Text style={styles.label}>FPS:</Text>
      <Text style={[styles.value, { color: fpsColor }]}>{fps}</Text>
    </View>
  );
});

const SeedDisplay = memo(function SeedDisplay({ seed }: { seed: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Seed:</Text>
      <Text style={styles.value}>{seed}</Text>
    </View>
  );
});

const StateDisplay = memo(function StateDisplay({
  phase,
  time
}: {
  phase: GamePhase;
  time: TimeState;
}) {
  return (
    <View style={styles.stateContainer}>
      <View style={styles.row}>
        <Text style={styles.label}>Phase:</Text>
        <Text style={styles.value}>{formatPhase(phase)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Week:</Text>
        <Text style={styles.value}>{time.week}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Time:</Text>
        <Text style={styles.value}>{formatTimePhase(time.phase)} C{time.cycle}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Moves:</Text>
        <Text style={styles.value}>{time.movesRemaining}</Text>
      </View>
    </View>
  );
});

// ============================================================================
// Main Component
// ============================================================================

/**
 * DebugOverlay - Renders debug information overlay
 *
 * Per P15: Debug Tooling Isolation:
 * - Toggled via debug state flags
 * - Does NOT affect gameplay logic or RNG
 * - Does NOT consume resources when disabled
 */
export const DebugOverlay = memo(function DebugOverlay({
  debug,
  seed,
  phase,
  time,
}: DebugOverlayProps) {
  // Early return if nothing to show - no resources consumed per P15
  const showAnything = debug.showFPS || debug.showSeed || debug.showStateInspector;

  // FPS tracking - only runs when enabled
  const fps = useFPSTracker(debug.showFPS);

  if (!showAnything) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.overlay}>
        {debug.showFPS && <FPSDisplay fps={fps} />}
        {debug.showSeed && <SeedDisplay seed={seed} />}
        {debug.showStateInspector && <StateDisplay phase={phase} time={time} />}
      </View>
    </View>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1000,
  },
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stateContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 4,
    marginTop: 4,
  },
  label: {
    fontSize: 10,
    color: '#888888',
    fontFamily: 'monospace',
  },
  value: {
    fontSize: 10,
    color: '#ffffff',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
});
