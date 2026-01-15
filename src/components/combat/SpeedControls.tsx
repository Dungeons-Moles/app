/**
 * SpeedControls - Combat animation speed selector
 * Provides pause, normal, and fast controls.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CombatSpeed } from '../../contexts/CombatContext';

export interface SpeedControlsProps {
  currentSpeed: CombatSpeed;
  onSpeedChange: (speed: CombatSpeed) => void;
  disabled?: boolean;
}

export function SpeedControls({
  currentSpeed,
  onSpeedChange,
  disabled = false,
}: SpeedControlsProps) {
  const renderButton = (speed: CombatSpeed, label: string) => {
    const isActive = currentSpeed === speed;

    return (
      <TouchableOpacity
        key={speed}
        style={[styles.button, isActive && styles.buttonActive, disabled && styles.buttonDisabled]}
        onPress={() => onSpeedChange(speed)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.buttonText,
            isActive && styles.buttonTextActive,
            disabled && styles.buttonTextDisabled,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {renderButton('paused', '⏸')}
      {renderButton('normal', '▶')}
      {renderButton('fast', '⏩')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4e4bc',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#c4a484',
  },
  button: {
    width: 40,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#e4d4ac',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: '#d4c49c',
  },
  buttonActive: {
    backgroundColor: '#8b4513',
    borderColor: '#5c4033',
  },
  buttonDisabled: {
    backgroundColor: '#d4c49c',
    borderColor: '#c4a484',
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    color: '#5c4033',
  },
  buttonTextActive: {
    color: '#ffffff',
  },
  buttonTextDisabled: {
    color: '#888888',
  },
});
