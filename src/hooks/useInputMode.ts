/**
 * Input mode detection — native fallback.
 * On native, defaults to 'touch'. Controller detection via Android backend
 * can be added later when physical gamepads need to be supported.
 */
export type InputMode = 'touch' | 'controller';

export function useInputMode(): InputMode {
  return 'touch';
}
