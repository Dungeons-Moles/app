import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { Psg1InputProvider } from 'psg1-sim';
import { ScreenVariantProvider } from '../contexts/ScreenVariantContext';

/**
 * Native fallback — no simulator shell, derives variant from actual screen dimensions.
 * Wraps with Psg1InputProvider so usePsg1Gamepad() has a valid context
 * (events arrive via the Android gamepad backend when a controller is connected).
 */
export function Psg1Wrapper({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const variant = width / height < 1.4 ? 'compact' : 'wide';

  return (
    <Psg1InputProvider>
      <ScreenVariantProvider variant={variant}>{children}</ScreenVariantProvider>
    </Psg1InputProvider>
  );
}
