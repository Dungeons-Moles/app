import { useSyncExternalStore } from 'react';

type StickState = { x: number; y: number };
type MotionSnapshot = {
  leftStick: StickState;
  rightStick: StickState;
  ts: number;
};

const listeners = new Set<() => void>();

let snapshot: MotionSnapshot = {
  leftStick: { x: 0, y: 0 },
  rightStick: { x: 0, y: 0 },
  ts: 0,
};

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): MotionSnapshot {
  return snapshot;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function setNativeGamepadMotion(next: {
  leftStickX: number;
  leftStickY: number;
  rightStickX?: number;
  rightStickY?: number;
}): void {
  const leftX = clamp(next.leftStickX);
  const leftY = clamp(next.leftStickY);
  const rightX = clamp(next.rightStickX ?? snapshot.rightStick.x);
  const rightY = clamp(next.rightStickY ?? snapshot.rightStick.y);

  if (
    snapshot.leftStick.x === leftX &&
    snapshot.leftStick.y === leftY &&
    snapshot.rightStick.x === rightX &&
    snapshot.rightStick.y === rightY
  ) {
    return;
  }

  snapshot = {
    leftStick: { x: leftX, y: leftY },
    rightStick: { x: rightX, y: rightY },
    ts: Date.now(),
  };
  listeners.forEach((cb) => cb());
}

export function useNativeGamepadMotion(): MotionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot);
}

