/**
 * Module-level promise signal for coordinating session setup
 * between calling screens (Gauntlet/Duels/Campaign) and SessionLoadingScreen.
 *
 * Flow:
 * 1. Calling screen calls createSessionSetup() + navigates to SessionLoading
 * 2. Async work continues in the calling screen's callback
 * 3. On success: resolveSessionSetup() → Loading screen navigates to Game
 * 4. On failure: rejectSessionSetup(error) → Loading screen shows Alert + goBack
 */

let _resolve: (() => void) | null = null;
let _reject: ((error: string) => void) | null = null;
let _promise: Promise<void> | null = null;

/** Create a new session setup promise. Call before navigating to SessionLoading. */
export function createSessionSetup(): void {
  _promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = (error: string) => reject(new Error(error));
  });
}

/** Signal that session setup succeeded. */
export function resolveSessionSetup(): void {
  _resolve?.();
  _resolve = null;
  _reject = null;
}

/** Signal that session setup failed with an error message. */
export function rejectSessionSetup(error: string): void {
  _reject?.(error);
  _resolve = null;
  _reject = null;
}

/** Get the current session setup promise (awaited by SessionLoadingScreen). */
export function getSessionSetupPromise(): Promise<void> | null {
  return _promise;
}

/** Clean up references. */
export function clearSessionSetup(): void {
  _resolve = null;
  _reject = null;
  _promise = null;
}
