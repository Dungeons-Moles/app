/**
 * Input mode detection — native.
 * Automatically switches to 'controller' when a gamepad button is pressed,
 * and back to 'touch' when the user touches the screen.
 *
 * Uses a module-level emitter so Psg1Wrapper's touch interceptor can signal
 * "touch" without needing a React context wrapper (avoids full-tree re-renders).
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePsg1Gamepad } from 'psg1-sim';

export type InputMode = 'touch' | 'controller';

/* ── Module-level shared state ─────────────────────────────────── */

let currentMode: InputMode = 'touch';
const listeners = new Set<() => void>();

function getSnapshot(): InputMode {
  return currentMode;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Call from outside React (e.g. touch interceptor) to switch back to touch. */
export function setInputModeTouch(): void {
  if (currentMode === 'touch') return;
  currentMode = 'touch';
  listeners.forEach((cb) => cb());
}

/** Call from outside React (e.g. controller motion bridge) to switch to controller. */
export function setInputModeController(): void {
  if (currentMode === 'controller') return;
  currentMode = 'controller';
  listeners.forEach((cb) => cb());
}

/* ── Hook ──────────────────────────────────────────────────────── */

export function useInputMode(): InputMode {
  const mode = useSyncExternalStore(subscribe, getSnapshot);
  const { lastEvent } = usePsg1Gamepad();
  const lastSeenTs = useRef(lastEvent?.ts ?? 0);

  // Switch to 'controller' when a gamepad button is pressed
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.ts <= lastSeenTs.current) return;
    lastSeenTs.current = lastEvent.ts;

    if (lastEvent.type === 'buttonDown') setInputModeController();
  }, [lastEvent]);

  return mode;
}
