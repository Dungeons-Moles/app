import { useContext, useSyncExternalStore } from 'react';
import { Psg1InputContext, type GamepadEvent } from 'psg1-sim';

export function usePsg1LastEvent(): GamepadEvent | undefined {
  const store = useContext(Psg1InputContext);
  if (!store) {
    throw new Error(
      'usePsg1LastEvent must be used within a <Psg1Simulator> or <Psg1InputProvider>'
    );
  }

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().lastEvent,
    () => store.getSnapshot().lastEvent
  );
}
