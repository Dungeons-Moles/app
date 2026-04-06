import { EventEmitter, type EventSubscription } from 'expo-modules-core';
import FastAccountWatcherModule from './src/FastAccountWatcherModule';

export interface AccountChangeEvent {
  watcherId: number;
  /** Base64-encoded account data (present on success). */
  data?: string;
  /** Slot at which the account was read. */
  slot?: number;
  /** Error message (present on failure). */
  error?: string;
}

type FastAccountWatcherEvents = {
  onAccountChange: (event: AccountChangeEvent) => void;
};

const emitter = new EventEmitter<FastAccountWatcherEvents>(FastAccountWatcherModule);

/**
 * Subscribe to account changes via a native WebSocket (bypasses RN bridge).
 * Returns a numeric watcher ID used for unsubscribing.
 */
export async function subscribe(
  wsEndpoint: string,
  accountPubkey: string,
  commitment: string = 'processed'
): Promise<number> {
  return FastAccountWatcherModule.subscribe(wsEndpoint, accountPubkey, commitment);
}

/**
 * Unsubscribe a specific watcher.
 */
export async function unsubscribe(watcherId: number): Promise<void> {
  return FastAccountWatcherModule.unsubscribe(watcherId);
}

/**
 * Unsubscribe all watchers and close all native WebSocket connections.
 */
export async function unsubscribeAll(): Promise<void> {
  return FastAccountWatcherModule.unsubscribeAll();
}

/**
 * Add a listener for native account change events.
 * The callback receives the base64-encoded account data directly
 * from the native WebSocket — no RN bridge hop.
 */
export function addAccountChangeListener(
  callback: (event: AccountChangeEvent) => void
): EventSubscription {
  return emitter.addListener('onAccountChange', callback);
}
