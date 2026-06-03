/**
 * Animated focus glow wrapper for controller navigation.
 * Uses `filter: drop-shadow()` so the glow follows the alpha channel of the
 * child images and respects irregular shapes — it hugs the actual rendered
 * pixels, not a bounding-box rectangle.
 *
 * On web the filter is animated directly on the DOM node via rAF (zero React
 * re-renders). On native (RN 0.83 / new architecture, Android 12+) the same
 * drop-shadow is applied as a static `filter` style — it is RenderEffect-backed
 * and still hugs the rendered alpha.
 *
 * IMPORTANT: Always renders a wrapping <View> regardless of `active`
 * so the layout tree stays stable and avoids re-mount flicker.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type LayoutChangeEvent,
} from 'react-native';
import { useAudio } from '../../contexts/AudioContext';

/** Apply the focus glow animation directly to an existing View ref. */
export function useFocusGlow(active: boolean) {
  const ref = useRef<View>(null);
  const animRef = useRef<number | null>(null);
  const { playSfx } = useAudio();
  const prevActiveRef = useRef(active);

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      playSfx('ui_hover');
    }
    prevActiveRef.current = active;
  }, [active, playSfx]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) {
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (ref.current) {
        const el = (ref.current as unknown) as HTMLElement;
        if (el?.style) el.style.filter = '';
      }
      return;
    }

    const el = (ref.current as unknown) as HTMLElement;
    if (!el) return;

    let start: number | null = null;
    const animate = (time: number) => {
      if (!start) start = time;
      const elapsed = (time - start) % 1600;
      const t = elapsed < 800 ? elapsed / 800 : 2 - elapsed / 800;
      const r1 = 10 + t * 14;
      const r2 = 5 + t * 8;
      const r3 = 2 + t * 4;
      const o = 0.7 + t * 0.3;
      el.style.filter =
        `drop-shadow(0 0 ${r1}px rgba(250, 188, 15, ${o})) ` +
        `drop-shadow(0 0 ${r2}px rgba(255, 200, 50, ${o})) ` +
        `drop-shadow(0 0 ${r3}px rgba(255, 220, 100, 1))`;
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (el?.style) el.style.filter = '';
    };
  }, [active]);

  return ref;
}

interface FocusGlowProps {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function FocusGlow({ active, children, style }: FocusGlowProps) {
  const ref = useRef<View>(null);
  const animRef = useRef<number | null>(null);
  const { playSfx } = useAudio();
  const prevActiveRef = useRef(active);
  const [glowSize, setGlowSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setGlowSize((prev) =>
      prev && prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, []);

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      playSfx('ui_hover');
    }
    prevActiveRef.current = active;
  }, [active, playSfx]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) {
      if (animRef.current != null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (ref.current) {
        const el = (ref.current as unknown) as HTMLElement;
        if (el?.style) el.style.filter = '';
      }
      return;
    }

    const el = (ref.current as unknown) as HTMLElement;
    if (!el) return;

    let start: number | null = null;
    const animate = (time: number) => {
      if (!start) start = time;
      const elapsed = (time - start) % 1600;
      const t = elapsed < 800 ? elapsed / 800 : 2 - elapsed / 800;
      const r1 = 10 + t * 14;
      const r2 = 5 + t * 8;
      const r3 = 2 + t * 4;
      const o = 0.7 + t * 0.3;
      el.style.filter =
        `drop-shadow(0 0 ${r1}px rgba(250, 188, 15, ${o})) ` +
        `drop-shadow(0 0 ${r2}px rgba(255, 200, 50, ${o})) ` +
        `drop-shadow(0 0 ${r3}px rgba(255, 220, 100, 1))`;
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (el?.style) el.style.filter = '';
    };
  }, [active]);

  // Native: `filter` (RenderEffect) collapses a view whose size comes from
  // flex (`flex: 1` / `align-items: stretch`) — so the focus glow can't sit on
  // a bare flex child (e.g. the POIModal item cards). Pin the measured size as
  // explicit width/height: explicit dimensions bypass flex entirely, so the
  // filter can no longer collapse the view. The filter is applied only once
  // the size is known, never before (measuring a collapsed view would pin 0).
  const nativeGlow = Platform.OS !== 'web' && active && glowSize !== null;

  return (
    <View
      ref={ref}
      onLayout={Platform.OS !== 'web' ? handleLayout : undefined}
      style={[style, nativeGlow ? glowSize : null, nativeGlow ? focusStyles.nativeGlow : null]}
    >
      {children}
    </View>
  );
}

/**
 * Native focus highlight — a layered golden `drop-shadow` filter (web animates
 * the equivalent filter on the DOM node instead). drop-shadow follows the
 * rendered alpha channel, so the glow hugs irregular images/components rather
 * than drawing a rectangle around the bounding box.
 */
const focusStyles = StyleSheet.create({
  nativeGlow: {
    filter: [
      {
        dropShadow: {
          offsetX: 0,
          offsetY: 0,
          standardDeviation: 20,
          color: 'rgba(250, 188, 15, 0.9)',
        },
      },
      {
        dropShadow: {
          offsetX: 0,
          offsetY: 0,
          standardDeviation: 11,
          color: 'rgba(255, 200, 50, 0.95)',
        },
      },
      {
        dropShadow: {
          offsetX: 0,
          offsetY: 0,
          standardDeviation: 5,
          color: 'rgba(255, 220, 100, 1)',
        },
      },
    ],
  },
});
