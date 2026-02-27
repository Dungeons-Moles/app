/**
 * Bridge between psg1-sim gamepad events and screen-level actions.
 *
 * Subscribes directly to the InputStore instead of going through React's
 * render cycle (useSyncExternalStore). This prevents a race condition where
 * a fast button tap produces buttonDown→buttonUp before React renders,
 * causing the store's lastEvent to be overwritten with buttonUp and the
 * buttonDown to be silently lost.
 */
import { useEffect, useRef, useContext } from 'react';
import { Psg1Button, Psg1InputContext } from 'psg1-sim';
import { useAudio } from '../contexts/AudioContext';

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
  const { playSfx } = useAudio();

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const playSfxRef = useRef(playSfx);
  playSfxRef.current = playSfx;

  const lastHandledTs = useRef(0);

  // Set initial timestamp to skip any pre-existing event in the store at mount
  useEffect(() => {
    if (!store) return;
    const snapshot = store.getSnapshot();
    lastHandledTs.current = snapshot.lastEvent?.ts ?? 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!store) return;

    const handleStoreChange = () => {
      if (!enabledRef.current) return;

      const event = store.getSnapshot().lastEvent;
      if (!event || event.type !== 'buttonDown') return;
      if (event.ts <= lastHandledTs.current) return;
      lastHandledTs.current = event.ts;

      const a = actionsRef.current;
      const btn = event.button;

      // Play hover SFX on navigation buttons (DPad + L1/R1)
      const isNavButton =
        btn === Psg1Button.DPadUp ||
        btn === Psg1Button.DPadDown ||
        btn === Psg1Button.DPadLeft ||
        btn === Psg1Button.DPadRight ||
        btn === Psg1Button.L1 ||
        btn === Psg1Button.R1;
      if (isNavButton) playSfxRef.current('ui_hover');

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
