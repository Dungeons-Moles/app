import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GAME_SCREEN_BACKGROUND_IMAGE,
  GAME_SCREEN_STAINS_BACKGROUND,
} from '../../constants/criticalImages';

function resolveUri(source: any): string {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && 'uri' in source) {
    return source.uri ?? '';
  }
  return String(source);
}

const backgroundUri = resolveUri(GAME_SCREEN_BACKGROUND_IMAGE);
const stainsUri = resolveUri(GAME_SCREEN_STAINS_BACKGROUND);

export function GameLoadingBackdrop() {
  return (
    <>
      <View
        // RN web does not type backgroundImage, but it is supported in the DOM style output.
        // This avoids the delayed <img>/expo-image paint path for the first loading frame.
        // eslint-disable-next-line react-native/no-inline-styles
        style={[
          styles.layer,
          {
            backgroundImage: `url("${backgroundUri}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          } as any,
        ]}
      />
      <View
        // eslint-disable-next-line react-native/no-inline-styles
        style={[
          styles.layer,
          {
            backgroundImage: `url("${stainsUri}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          } as any,
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
});
