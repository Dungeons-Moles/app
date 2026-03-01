/**
 * Bridge between psg1-sim gamepad events and screen-level actions.
 *
 * Subscribes directly to the InputStore instead of going through React's
 * render cycle (useSyncExternalStore). This prevents a race condition where
 * a fast button tap produces buttonDown→buttonUp before React renders,
 * causing the store's lastEvent to be overwritten with buttonUp and the
 * buttonDown to be silently lost.
 *
 * Uses event-reference deduplication instead of timestamps to avoid the
 * Date.now() collision bug: when the gamepad polling loop emits multiple
 * buttonDown events in the same millisecond (e.g. two buttons change state
 * in the same frame), timestamp-based dedup would silently drop the second
 * event. Comparing object references is immune to this.
 */
import { useEffect, useRef, useContext } from 'react';
import { Psg1Button, Psg1InputContext, type GamepadEvent } from 'psg1-sim';

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
  const store = useContext(Psg1InputContext);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Track the last event we processed by object reference.
  // Each store.emit() creates a unique event object, so reference equality
  // correctly deduplicates without relying on Date.now() precision.
  const lastHandledEventRef = useRef<GamepadEvent | undefined>(undefined);

  // Capture the pre-existing event at mount so we don't replay it
  useEffect(() => {
    if (!store) return;
    const snapshot = store.getSnapshot();
    lastHandledEventRef.current = snapshot.lastEvent;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!store) return;

    const handleStoreChange = () => {
      if (!enabledRef.current) return;

      const event = store.getSnapshot().lastEvent;
      if (!event || event.type !== 'buttonDown') return;
      if (event === lastHandledEventRef.current) return;
      lastHandledEventRef.current = event;

      const a = actionsRef.current;
      const btn = event.button;

      // No global SFX on any buttons. Each screen plays its own
      // contextual sound (e.g. move_floor/move_dig, ui_hover, ui_page_turn, ui_back).

      switch (btn) {
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
    };

    return store.subscribe(handleStoreChange);
  }, [store]);
}
