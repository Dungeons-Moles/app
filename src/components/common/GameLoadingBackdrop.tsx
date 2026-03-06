import React from 'react';
import { StyleSheet } from 'react-native';
import { CachedImage as Image } from './CachedImage';
import {
  GAME_SCREEN_BACKGROUND_IMAGE,
  GAME_SCREEN_STAINS_BACKGROUND,
} from '../../constants/criticalImages';

export function GameLoadingBackdrop() {
  return (
    <>
      <Image source={GAME_SCREEN_BACKGROUND_IMAGE} style={styles.layer} resizeMode="cover" />
      <Image source={GAME_SCREEN_STAINS_BACKGROUND} style={styles.layer} resizeMode="cover" />
    </>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
