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
        style={[
          styles.button,
          isActive && styles.buttonActive,
          disabled && styles.buttonDisabled,
        ]}
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
    backgroundColor: '#151518',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#2a2a30',
  },
  button: {
    width: 44,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1f1f25',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#2a2a30',
  },
  buttonActive: {
    backgroundColor: '#2b3442',
    borderColor: '#4b5563',
  },
  buttonDisabled: {
    backgroundColor: '#151518',
    borderColor: '#1f1f25',
  },
  buttonText: {
    fontSize: 16,
    color: '#cbd5f5',
  },
  buttonTextActive: {
    color: '#ffffff',
  },
  buttonTextDisabled: {
    color: '#555555',
  },
});
