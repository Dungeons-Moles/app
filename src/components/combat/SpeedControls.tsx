/**
 * SpeedControls - Combat animation speed selector
 * Provides pause, normal, and fast controls.
 */

import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  ImageSourcePropType,
} from 'react-native';
import type { CombatSpeed } from '../../contexts/CombatContext';

const buttonBgSource = require('../../../assets/ui/buttons/button-v1.png');
const buttonBgActiveSource = require('../../../assets/ui/buttons/button-v3.png');
const stopIconSource = require('../../../assets/icons/ui/stop.png');
const normalIconSource = require('../../../assets/icons/ui/normal-speed.png');
const fastIconSource = require('../../../assets/icons/ui/fast-speed.png');

export interface SpeedControlsProps {
  currentSpeed: CombatSpeed;
  onSpeedChange: (speed: CombatSpeed) => void;
  disabled?: boolean;
  /** Scale factor for compact/mobile views (default 1) */
  scale?: number;
}

export function SpeedControls({
  currentSpeed,
  onSpeedChange,
  disabled = false,
  scale = 1,
}: SpeedControlsProps) {
  const renderButton = (speed: CombatSpeed, iconSource: ImageSourcePropType) => {
    const isActive = currentSpeed === speed;

    return (
      <TouchableOpacity
        key={speed}
        style={[
          { width: 60 * scale, height: 48 * scale },
          disabled && styles.buttonDisabled,
        ]}
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
            style={[
              { width: 20 * scale, height: 20 * scale, marginBottom: 5 * scale },
              styles.icon,
              isActive && styles.iconActive,
            ]}
            resizeMode="contain"
          />
        </ImageBackground>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { gap: 8 * scale }]}>
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
