/**
 * Animated focus glow wrapper for controller navigation.
 * Uses CSS `filter: drop-shadow()` on web — follows the alpha channel
 * of child images so the glow respects irregular button shapes.
 * Direct DOM animation via rAF for zero React re-renders.
 *
 * IMPORTANT: Always renders a wrapping <View> regardless of `active`
 * so the layout tree stays stable and avoids re-mount flicker.
 */
import React, { useRef, useEffect } from 'react';
import { View, Platform, type ViewStyle } from 'react-native';

interface FocusGlowProps {
  active: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function FocusGlow({ active, children, style }: FocusGlowProps) {
  const ref = useRef<View>(null);
  const animRef = useRef<number | null>(null);

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

  return <View ref={ref} style={style}>{children}</View>;
}
