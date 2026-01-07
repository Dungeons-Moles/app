/**
 * Centralized Input Handler for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/research.md R6
 */

import { Direction, InputEvent } from './types';

// ============================================================================
// Types
// ============================================================================

export type InputListener = (event: InputEvent) => void;

// ============================================================================
// Input Handler Class
// ============================================================================

/**
 * Centralized input handler that manages all game input.
 * Implements debouncing to prevent accidental double-inputs.
 */
export class InputHandler {
  private listeners: InputListener[] = [];
  private lastInputTime: number = 0;
  private debounceMs: number;
  private enabled: boolean = true;

  constructor(debounceMs: number = 100) {
    this.debounceMs = debounceMs;
  }

  /**
   * Enable or disable input handling.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if input is currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set debounce delay in milliseconds.
   */
  setDebounceMs(ms: number): void {
    this.debounceMs = ms;
  }

  /**
   * Emit an input event to all listeners.
   */
  emit(event: InputEvent): void {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    if (now - this.lastInputTime < this.debounceMs) {
      return; // Debounce rapid inputs
    }
    this.lastInputTime = now;

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Subscribe to input events.
   * Returns unsubscribe function.
   */
  subscribe(listener: InputListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Remove all listeners.
   */
  clearListeners(): void {
    this.listeners = [];
  }

  /**
   * Emit a direction input from D-pad.
   */
  emitDpadDirection(direction: Direction): void {
    this.emit({
      type: 'DIRECTION',
      direction,
      source: 'dpad',
      timestamp: Date.now(),
    });
  }

  /**
   * Emit a direction input from keyboard.
   */
  emitKeyboardDirection(direction: Direction): void {
    this.emit({
      type: 'DIRECTION',
      direction,
      source: 'keyboard',
      timestamp: Date.now(),
    });
  }

  /**
   * Emit confirm action.
   */
  emitConfirm(source: 'dpad' | 'keyboard'): void {
    this.emit({
      type: 'CONFIRM',
      source,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit cancel action.
   */
  emitCancel(source: 'dpad' | 'keyboard'): void {
    this.emit({
      type: 'CANCEL',
      source,
      timestamp: Date.now(),
    });
  }

  /**
   * Inject a synthetic input (for testing).
   */
  injectInput(direction: Direction): void {
    this.emit({
      type: 'DIRECTION',
      direction,
      source: 'keyboard',
      timestamp: Date.now(),
    });
  }

  /**
   * Get the number of registered listeners.
   */
  getListenerCount(): number {
    return this.listeners.length;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalHandler: InputHandler | null = null;

/**
 * Get the global input handler instance.
 */
export function getInputHandler(): InputHandler {
  if (!globalHandler) {
    globalHandler = new InputHandler();
  }
  return globalHandler;
}

/**
 * Create a new input handler (for testing or isolated contexts).
 */
export function createInputHandler(debounceMs?: number): InputHandler {
  return new InputHandler(debounceMs);
}

/**
 * Reset the global input handler (for testing).
 */
export function resetGlobalHandler(): void {
  if (globalHandler) {
    globalHandler.clearListeners();
  }
  globalHandler = null;
}
