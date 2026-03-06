import React from 'react';
import {
  type ImageContentFit,
  type ImageSource,
} from 'expo-image';
import {
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface InstantImageBackgroundProps {
  source: ImageSource;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  imageStyle?: StyleProp<ImageStyle>;
  children?: React.ReactNode;
}

const RESIZE_TO_OBJECT_FIT: Record<string, React.CSSProperties['objectFit']> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
};

function resolveUri(source: ImageSource): string {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && 'uri' in source) {
    return source.uri ?? '';
  }
  return String(source);
}

export function InstantImageBackground({
  source,
  style,
  contentFit,
  resizeMode,
  imageStyle,
  children,
}: InstantImageBackgroundProps) {
  const uri = resolveUri(source);
  const fit = contentFit ?? (resizeMode ? RESIZE_TO_OBJECT_FIT[resizeMode] : 'fill');

  return (
    <View style={style}>
      <img
        src={uri}
        alt=""
        fetchPriority="high"
        loading="eager"
        decoding="sync"
        style={
          {
            ...(StyleSheet.flatten(styles.image) as React.CSSProperties),
            ...(StyleSheet.flatten(imageStyle) as React.CSSProperties),
            objectFit: fit === 'fill' ? 'fill' : fit,
          } as React.CSSProperties
        }
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
});
