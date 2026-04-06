import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Position } from '../../game/engine/types';
import type { MapPOI } from '../../game/map/types';

interface FastTravelOverlayProps {
  waypoints: MapPOI[];
  selectedIndex: number;
  currentPosition: Position;
  onCycle: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FastTravelOverlay({
  waypoints,
  selectedIndex,
  currentPosition,
  onCycle,
  onConfirm,
  onCancel,
}: FastTravelOverlayProps) {
  const longPressTriggered = useRef(false);

  const selectableWaypoints = useMemo(
    () =>
      waypoints.filter(
        (poi) => poi.position.x !== currentPosition.x || poi.position.y !== currentPosition.y
      ),
    [waypoints, currentPosition.x, currentPosition.y]
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);

  const handlePress = useCallback(() => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectableWaypoints.length > 0) {
      onCycle();
    }
  }, [onCycle, selectableWaypoints.length]);

  const handleLongPress = useCallback(() => {
    if (selectableWaypoints.length === 0) {
      return;
    }
    longPressTriggered.current = true;
    onConfirm();
  }, [onConfirm, selectableWaypoints.length]);

  const instructionLabel =
    selectableWaypoints.length > 0
      ? '◀ ▶ cycle   A travel'
      : 'No other waypoints discovered';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />

      <View style={styles.instructions} pointerEvents="none">
        <Text style={styles.instructionText}>{instructionLabel}</Text>
      </View>

      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 12, 0.35)',
  },
  instructions: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  cancelButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: '#f97316',
  },
  cancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f97316',
    textTransform: 'uppercase',
  },
});
