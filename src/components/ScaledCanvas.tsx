import { useEffect, useState, type ReactNode } from 'react';
import { View, Dimensions, type ScaledSize } from 'react-native';
import { useScreenVariant } from '../contexts/ScreenVariantContext';

/**
 * The fixed logical canvas the game's "compact" layout is designed against —
 * the same 1240x1080 dp surface the psg1-sim web simulator renders into.
 */
export const CANVAS_WIDTH = 1240;
export const CANVAS_HEIGHT = 1080;

/** Real on-device screen size (NOT the virtual canvas), kept in sync with rotation. */
function useRealScreen(): ScaledSize {
  const [size, setSize] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => setSize(screen));
    return () => sub.remove();
  }, []);
  return size;
}

/**
 * Renders children inside a fixed CANVAS_WIDTH x CANVAS_HEIGHT dp surface,
 * uniformly scaled and centered to fit the real screen.
 *
 * Why: real PSG1 hardware (1240x1080 px @ 272 dpi) only exposes a ~729x635 dp
 * logical canvas to React Native, but the "compact" layout is calibrated for a
 * 1240x1080 dp canvas. Android does not let an app enlarge its own dp canvas
 * (a per-app density override is treated as a compatibility density and just
 * compat-scales the pixel buffer). So instead we lay the UI out at the full
 * 1240x1080 dp and shrink it with a transform — exactly what the web simulator
 * does with a CSS `transform: scale()`.
 *
 * For the `wide` variant (real phones) this is a transparent pass-through.
 */
export function ScaledCanvas({ children }: { children: ReactNode }) {
  const variant = useScreenVariant();
  const screen = useRealScreen();

  if (variant !== 'compact') {
    return <>{children}</>;
  }

  const scale = Math.min(screen.width / CANVAS_WIDTH, screen.height / CANVAS_HEIGHT);

  return (
    <View style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: [{ scale }] }}>
        {children}
      </View>
    </View>
  );
}
