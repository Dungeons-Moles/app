/**
 * DPadControls - Touch-based D-pad for mobile input
 * @see specs/001-pve-dungeon-crawler/spec.md FR-002
 */

import React, { useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Direction } from '../../game/input/types';

// ============================================================================
// Types
// ============================================================================

export interface DPadControlsProps {
  /**
   * Callback when a direction is pressed.
   */
  onDirection: (direction: Direction) => void;

  /**
   * Callback when the center action button is pressed.
   */
  onCenterPress?: () => void;

  /**
   * Whether the center action button should be disabled.
   */
  centerDisabled?: boolean;

  /**
   * Label for the center action button (default: 'A').
   */
  centerLabel?: string;

  /**
   * Directions that should be disabled (e.g., blocked by walls).
   */
  disabledDirections?: Direction[];

  /**
   * Size of the D-pad (default: 150).
   */
  size?: number;
}

// ============================================================================
// Component
// ============================================================================

export function DPadControls({
  onDirection,
  onCenterPress,
  centerDisabled = false,
  centerLabel = 'A',
  disabledDirections = [],
  size = 150,
}: DPadControlsProps) {
  const buttonSize = size / 3;

  const isDisabled = useCallback(
    (direction: Direction) => disabledDirections.includes(direction),
    [disabledDirections]
  );

  const handlePress = useCallback(
    (direction: Direction) => {
      if (!isDisabled(direction)) {
        onDirection(direction);
      }
    },
    [onDirection, isDisabled]
  );

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Top row - Up button */}
      <View style={styles.row}>
        <View style={[styles.spacer, { width: buttonSize, height: buttonSize }]} />
        <TouchableOpacity
          style={[
            styles.button,
            { width: buttonSize, height: buttonSize },
            isDisabled(Direction.Up) && styles.buttonDisabled,
          ]}
          onPress={() => handlePress(Direction.Up)}
          disabled={isDisabled(Direction.Up)}
          activeOpacity={0.6}
        >
          <Text
            style={[
              styles.arrow,
              isDisabled(Direction.Up) && styles.arrowDisabled,
            ]}
          >
            ▲
          </Text>
        </TouchableOpacity>
        <View style={[styles.spacer, { width: buttonSize, height: buttonSize }]} />
      </View>

      {/* Middle row - Left, Center, Right */}
      <View style={styles.row}>
        <TouchableOpacity
          style={[
            styles.button,
            { width: buttonSize, height: buttonSize },
            isDisabled(Direction.Left) && styles.buttonDisabled,
          ]}
          onPress={() => handlePress(Direction.Left)}
          disabled={isDisabled(Direction.Left)}
          activeOpacity={0.6}
        >
          <Text
            style={[
              styles.arrow,
              isDisabled(Direction.Left) && styles.arrowDisabled,
            ]}
          >
            ◀
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.centerButton,
            { width: buttonSize, height: buttonSize },
            (centerDisabled || !onCenterPress) && styles.buttonDisabled,
          ]}
          onPress={onCenterPress}
          disabled={centerDisabled || !onCenterPress}
          activeOpacity={0.6}
        >
          <Text
            style={[
              styles.centerLabel,
              (centerDisabled || !onCenterPress) && styles.arrowDisabled,
            ]}
          >
            {centerLabel}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            { width: buttonSize, height: buttonSize },
            isDisabled(Direction.Right) && styles.buttonDisabled,
          ]}
          onPress={() => handlePress(Direction.Right)}
          disabled={isDisabled(Direction.Right)}
          activeOpacity={0.6}
        >
          <Text
            style={[
              styles.arrow,
              isDisabled(Direction.Right) && styles.arrowDisabled,
            ]}
          >
            ▶
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom row - Down button */}
      <View style={styles.row}>
        <View style={[styles.spacer, { width: buttonSize, height: buttonSize }]} />
        <TouchableOpacity
          style={[
            styles.button,
            { width: buttonSize, height: buttonSize },
            isDisabled(Direction.Down) && styles.buttonDisabled,
          ]}
          onPress={() => handlePress(Direction.Down)}
          disabled={isDisabled(Direction.Down)}
          activeOpacity={0.6}
        >
          <Text
            style={[
              styles.arrow,
              isDisabled(Direction.Down) && styles.arrowDisabled,
            ]}
          >
            ▼
          </Text>
        </TouchableOpacity>
        <View style={[styles.spacer, { width: buttonSize, height: buttonSize }]} />
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  spacer: {
    backgroundColor: 'transparent',
  },
  button: {
    backgroundColor: '#2a2a30',
    borderWidth: 1,
    borderColor: '#3a3a40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#1a1a1f',
    borderColor: '#252528',
  },
  centerButton: {
    backgroundColor: '#151518',
    borderWidth: 1,
    borderColor: '#252528',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    fontSize: 20,
    color: '#aaaaaa',
  },
  arrowDisabled: {
    color: '#444444',
  },
  centerLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#aaaaaa',
  },
});
