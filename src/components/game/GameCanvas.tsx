import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OverviewModeState } from '../../contexts/GameContext';
import type { Position, WallHighlightState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import type { GameMap } from '../../game/map/types';
import { MapRenderer } from './MapRenderer';

interface GameCanvasProps {
  map: GameMap;
  playerPosition: Position;
  playerFacing?: 'left' | 'right';
  timePhase: TimePhase;
  wallHighlight?: WallHighlightState;
  overviewMode?: OverviewModeState;
  onPanOverview?: (delta: Position) => void;
  onZoomOverview?: (zoomDelta: number) => void;
  feedbackMessage?: string | null;
  width?: number;
  height?: number;
}

export function GameCanvas({
  map,
  playerPosition,
  playerFacing,
  timePhase,
  wallHighlight,
  overviewMode,
  onPanOverview,
  onZoomOverview,
  feedbackMessage,
  width,
  height,
}: GameCanvasProps) {
  return (
    <View style={styles.container}>
      <MapRenderer
        map={map}
        playerPosition={playerPosition}
        playerFacing={playerFacing}
        timePhase={timePhase}
        wallHighlight={wallHighlight}
        overviewMode={overviewMode}
        onPanOverview={onPanOverview}
        onZoomOverview={onZoomOverview}
        width={width}
        height={height}
      />
      {feedbackMessage && (
        <View style={styles.feedbackOverlay} pointerEvents="none">
          <Text style={styles.feedbackText}>{feedbackMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  feedbackOverlay: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  feedbackText: {
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    color: '#fbbf24',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
});
