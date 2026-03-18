/**
 * SpeedControls - Combat animation speed selector
 * Provides pause, normal, and fast controls.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
import type { CombatSpeed } from '../../contexts/CombatContext';

const buttonBgSource = require('../../../assets/ui/buttons/button-v1.webp');
const buttonBgActiveSource = require('../../../assets/ui/buttons/button-v3.webp');
const stopIconSource = require('../../../assets/icons/ui/stop.webp');
const normalIconSource = require('../../../assets/icons/ui/normal-speed.webp');
const fastIconSource = require('../../../assets/icons/ui/fast-speed.webp');
const superFastIconSource = require('../../../assets/icons/ui/super-fast-speed.webp');

export interface SpeedControlsProps {
  currentSpeed: CombatSpeed;
  onSpeedChange: (speed: CombatSpeed) => void;
  disabled?: boolean;
  /** Scale factor for compact/mobile views (default 1) */
  scale?: number;
  /** Optional callback fired on button press (e.g. for SFX) */
  onPress?: () => void;
}

export function SpeedControls({
  currentSpeed,
  onSpeedChange,
  disabled = false,
  scale = 1,
  onPress,
}: SpeedControlsProps) {
  const renderButton = (speed: CombatSpeed, iconSource: ImageSourcePropType) => {
    const isActive = currentSpeed === speed;

    return (
      <TouchableOpacity
        key={speed}
        style={[{ width: 60 * scale, height: 48 * scale }, disabled && styles.buttonDisabled]}
        onPress={() => {
          onPress?.();
          onSpeedChange(speed);
        }}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <CachedImageBackground
          source={isActive ? buttonBgActiveSource : buttonBgSource}
          style={styles.buttonBg}
          resizeMode="stretch"
        >
          <Image
            source={iconSource}
            style={[
              { width: 20 * scale, height: 20 * scale, marginBottom: 5 * scale },
              styles.icon,
              isActive && styles.iconActive,
            ]}
            resizeMode="contain"
          />
        </CachedImageBackground>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { gap: 8 * scale }]}>
      {renderButton('paused', stopIconSource)}
      {renderButton('normal', normalIconSource)}
      {renderButton('fast', fastIconSource)}
      {renderButton('super-fast', superFastIconSource)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
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
    tintColor: '#5c4033',
  },
  iconActive: {
    tintColor: '#FABC0F',
  },
});
