/**
 * Drop-in replacement for React Native's ImageBackground using expo-image.
 * Provides disk + memory caching and hardware-accelerated decoding.
 */
import React from 'react';
import { View, type ViewStyle, type StyleProp, type ImageStyle } from 'react-native';
import { Image, type ImageSource, type ImageContentFit } from 'expo-image';

interface CachedImageBackgroundProps {
  source: ImageSource;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  /** Maps to RN ImageBackground's resizeMode. Converted to contentFit. */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  /** Compat with RN ImageBackground — applied to the background image */
  imageStyle?: StyleProp<ImageStyle>;
  children?: React.ReactNode;
  /** Fade-in transition duration in ms (default 150) */
  transition?: number;
}

const RESIZE_TO_CONTENT_FIT: Record<string, ImageContentFit> = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
};

export const CachedImageBackground = React.forwardRef<View, CachedImageBackgroundProps>(
  function CachedImageBackground(
    { source, style, contentFit, resizeMode, imageStyle, children, transition = 150 },
    ref,
  ) {
    const fit = contentFit ?? (resizeMode ? RESIZE_TO_CONTENT_FIT[resizeMode] : 'fill');

    return (
      <View ref={ref} style={style}>
        <Image
          source={source}
          contentFit={fit}
          transition={transition}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            },
            imageStyle,
          ]}
        />
        {children}
      </View>
    );
  },
);
