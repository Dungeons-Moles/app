import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { ScreenVariantProvider } from '../contexts/ScreenVariantContext';

/**
 * Native fallback — no simulator shell, derives variant from actual screen dimensions.
 */
export function Psg1Wrapper({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const variant = width / height < 1.4 ? 'compact' : 'wide';

  return <ScreenVariantProvider variant={variant}>{children}</ScreenVariantProvider>;
}
