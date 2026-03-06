import React from 'react';
import { CachedImageBackground } from './CachedImageBackground';

type InstantImageBackgroundProps = React.ComponentProps<typeof CachedImageBackground>;

export function InstantImageBackground(props: InstantImageBackgroundProps) {
  return <CachedImageBackground {...props} transition={0} />;
}

