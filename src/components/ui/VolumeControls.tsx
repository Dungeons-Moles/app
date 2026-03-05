import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
import { useAudio } from '../../contexts/AudioContext';

const buttonBgSource = require('../../../assets/ui/buttons/button-v1.webp');

export interface VolumeControlsProps {
  currentVolume: number; // 0.0 to 1.0
  onVolumeChange: (vol: number) => void;
  scale?: number;
}

export function VolumeControls({ currentVolume, onVolumeChange, scale = 1 }: VolumeControlsProps) {
  const { playSfx } = useAudio();

  // Round to nearest 0.1 to avoid float imprecision issues
  const decrease = () => {
    playSfx('ui_click');
    onVolumeChange(Math.round(Math.max(0, currentVolume - 0.1) * 10) / 10);
  };
  const increase = () => {
    playSfx('ui_click');
    onVolumeChange(Math.round(Math.min(1, currentVolume + 0.1) * 10) / 10);
  };

  const displayVol = Math.round(currentVolume * 100) + '%';

  return (
    <View style={[styles.container, { gap: 8 * scale }]}>
      <TouchableOpacity
        style={[{ width: 40 * scale, height: 40 * scale }]}
        onPress={decrease}
        activeOpacity={0.7}
      >
        <CachedImageBackground source={buttonBgSource} style={styles.buttonBg} resizeMode="stretch">
          <Text style={[styles.btnText, { fontSize: 20 * scale }]}>-</Text>
        </CachedImageBackground>
      </TouchableOpacity>

      <View
        style={[
          { width: 60 * scale, height: 40 * scale, justifyContent: 'center', alignItems: 'center' },
        ]}
      >
        <Text style={[styles.volText, { fontSize: 16 * scale }]}>{displayVol}</Text>
      </View>

      <TouchableOpacity
        style={[{ width: 40 * scale, height: 40 * scale }]}
        onPress={increase}
        activeOpacity={0.7}
      >
        <CachedImageBackground source={buttonBgSource} style={styles.buttonBg} resizeMode="stretch">
          <Text style={[styles.btnText, { fontSize: 20 * scale }]}>+</Text>
        </CachedImageBackground>
      </TouchableOpacity>
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
  btnText: {
    color: '#5c4033',
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  volText: {
    color: '#3d2b1f',
    fontFamily: 'Inter-Bold',
  },
});
