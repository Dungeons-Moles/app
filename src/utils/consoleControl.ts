const disableConsoleLogs = process.env.EXPO_PUBLIC_DISABLE_CONSOLE_LOGS === 'true';
const keepConsoleErrors = process.env.EXPO_PUBLIC_KEEP_CONSOLE_ERRORS !== 'false';

let applied = false;

/**
 * Silences noisy console output for local performance profiling without
 * deleting existing debug logs from the codebase.
 */
export function applyConsoleControl(): void {
  if (applied || !disableConsoleLogs) {
    return;
  }
  applied = true;

  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};

  if (!keepConsoleErrors) {
    console.error = () => {};
  }
}

