/**
 * SpeedControls - Combat animation speed selector
 * Provides pause, normal, and fast controls.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ImageBackground } from 'react-native';
import type { CombatSpeed } from '../../contexts/CombatContext';

const buttonBgSource = require('../../../assets/hub/button-v1.png');
const buttonBgActiveSource = require('../../../assets/hub/button-v3.png');
const stopIconSource = require('../../../assets/icons/stop.png');
const normalIconSource = require('../../../assets/icons/normal-speed.png');
const fastIconSource = require('../../../assets/icons/fast-speed.png');

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
  const renderButton = (speed: CombatSpeed, iconSource: any) => {
    const isActive = currentSpeed === speed;

    return (
      <TouchableOpacity
        key={speed}
        style={[styles.buttonWrapper, disabled && styles.buttonDisabled]}
        onPress={() => onSpeedChange(speed)}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <ImageBackground
          source={isActive ? buttonBgActiveSource : buttonBgSource}
          style={styles.buttonBg}
          resizeMode="stretch"
        >
          <Image
            source={iconSource}
            style={[styles.icon, isActive && { tintColor: '#FABC0F' }]}
            resizeMode="contain"
          />
        </ImageBackground>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {renderButton('paused', stopIconSource)}
      {renderButton('normal', normalIconSource)}
      {renderButton('fast', fastIconSource)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonWrapper: {
    width: 60,
    height: 48,
  },
  buttonBg: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  icon: {
    width: 20,
    height: 20,
    marginBottom: 5,
    tintColor: '#5c4033', // Dark wood color by default
  },
});
