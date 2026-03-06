import React from 'react';
import { Image as ExpoImage, type ImageProps } from 'expo-image';

export const CachedImage = React.forwardRef<ExpoImage, ImageProps>(function CachedImage(
  { cachePolicy = 'memory-disk', transition = 0, ...props },
  ref,
) {
  return <ExpoImage ref={ref} cachePolicy={cachePolicy} transition={transition} {...props} />;
});
