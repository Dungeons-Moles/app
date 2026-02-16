/**
 * Bridge between psg1-sim gamepad events and screen-level actions.
 * Reacts to buttonDown events and dispatches to the appropriate callback.
 */
import { useEffect, useRef } from 'react';
import { usePsg1Gamepad, Psg1Button } from 'psg1-sim';

export interface ControllerActions {
  onA?: () => void;
  onB?: () => void;
  onX?: () => void;
  onY?: () => void;
  onDPadUp?: () => void;
  onDPadDown?: () => void;
  onDPadLeft?: () => void;
  onDPadRight?: () => void;
  onL1?: () => void;
  onR1?: () => void;
  onStart?: () => void;
  onSelect?: () => void;
}

export function useControllerAction(actions: ControllerActions, enabled = true) {
  const { lastEvent } = usePsg1Gamepad();
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // Initialize to current event ts so we skip events that occurred before mount
  const lastHandledTs = useRef(lastEvent?.ts ?? 0);
  const wasEnabled = useRef(enabled);

  useEffect(() => {
    // When re-enabled, skip any events that fired while disabled
    if (enabled && !wasEnabled.current) {
      lastHandledTs.current = lastEvent?.ts ?? 0;
    }
    wasEnabled.current = enabled;

    if (!enabled || !lastEvent) return;
    if (lastEvent.type !== 'buttonDown') return;
    if (lastEvent.ts <= lastHandledTs.current) return;
    lastHandledTs.current = lastEvent.ts;

    const a = actionsRef.current;
    switch (lastEvent.button) {
      case Psg1Button.Cross:
        a.onA?.();
        break;
      case Psg1Button.Circle:
        a.onB?.();
        break;
      case Psg1Button.Square:
        a.onX?.();
        break;
      case Psg1Button.Triangle:
        a.onY?.();
        break;
      case Psg1Button.DPadUp:
        a.onDPadUp?.();
        break;
      case Psg1Button.DPadDown:
        a.onDPadDown?.();
        break;
      case Psg1Button.DPadLeft:
        a.onDPadLeft?.();
        break;
      case Psg1Button.DPadRight:
        a.onDPadRight?.();
        break;
      case Psg1Button.L1:
        a.onL1?.();
        break;
      case Psg1Button.R1:
        a.onR1?.();
        break;
      case Psg1Button.Options:
        a.onStart?.();
        break;
      case Psg1Button.Share:
        a.onSelect?.();
        break;
    }
  }, [enabled, lastEvent]);
}
