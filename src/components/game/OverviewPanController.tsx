import { useEffect, useRef } from 'react';
import { usePsg1Input } from 'psg1-sim';
import { useNativeGamepadMotion } from '@/hooks/useNativeGamepadMotion';
import type { Position } from '@/game/engine/types';

type OverviewPanControllerProps = {
  isController: boolean;
  overviewActive: boolean;
  isFastTravelActive: boolean;
  panOverview: (delta: Position) => void;
};

export function OverviewPanController({
  isController,
  overviewActive,
  isFastTravelActive,
  panOverview,
}: OverviewPanControllerProps) {
  const psg1Input = usePsg1Input();
  const nativeMotion = useNativeGamepadMotion();
  const panIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isController || !overviewActive || isFastTravelActive) {
      if (panIntervalRef.current) {
        clearInterval(panIntervalRef.current);
        panIntervalRef.current = null;
      }
      return;
    }

    const usePsg1Stick =
      Math.abs(psg1Input.leftStick.x) > 0.01 || Math.abs(psg1Input.leftStick.y) > 0.01;
    const x = usePsg1Stick ? psg1Input.leftStick.x : nativeMotion.leftStick.x;
    const y = usePsg1Stick ? psg1Input.leftStick.y : nativeMotion.leftStick.y;
    const DEAD_ZONE = 0.15;
    const isIdle = Math.abs(x) < DEAD_ZONE && Math.abs(y) < DEAD_ZONE;

    if (isIdle) {
      if (panIntervalRef.current) {
        clearInterval(panIntervalRef.current);
        panIntervalRef.current = null;
      }
      return;
    }

    if (panIntervalRef.current) clearInterval(panIntervalRef.current);
    const PAN_SPEED = 8;
    panIntervalRef.current = setInterval(() => {
      const useLivePsg1Stick =
        Math.abs(psg1Input.leftStick.x) > 0.01 || Math.abs(psg1Input.leftStick.y) > 0.01;
      const sx = useLivePsg1Stick ? psg1Input.leftStick.x : nativeMotion.leftStick.x;
      const sy = useLivePsg1Stick ? psg1Input.leftStick.y : nativeMotion.leftStick.y;
      if (Math.abs(sx) >= DEAD_ZONE || Math.abs(sy) >= DEAD_ZONE) {
        panOverview({
          x: Math.round(sx * PAN_SPEED),
          y: Math.round(sy * PAN_SPEED),
        });
      }
    }, 50);

    return () => {
      if (panIntervalRef.current) {
        clearInterval(panIntervalRef.current);
        panIntervalRef.current = null;
      }
    };
  }, [
    isController,
    overviewActive,
    isFastTravelActive,
    psg1Input.leftStick.x,
    psg1Input.leftStick.y,
    nativeMotion.leftStick.x,
    nativeMotion.leftStick.y,
    panOverview,
  ]);

  return null;
}
