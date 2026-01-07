/**
 * Keyboard input bindings for web development builds
 * @see specs/001-pve-dungeon-crawler/research.md R6
 */

import { Direction } from './types';
import { InputHandler, getInputHandler } from './handler';

// ============================================================================
// Keyboard Mappings
// ============================================================================

/**
 * Mapping from keyboard keys to directions.
 * Supports arrow keys and WASD.
 */
export const KEYBOARD_MAP: Record<string, Direction> = {
  // Arrow keys
  'ArrowUp': Direction.Up,
  'ArrowDown': Direction.Down,
  'ArrowLeft': Direction.Left,
  'ArrowRight': Direction.Right,
  // WASD (lowercase)
  'w': Direction.Up,
  's': Direction.Down,
  'a': Direction.Left,
  'd': Direction.Right,
  // WASD (uppercase)
  'W': Direction.Up,
  'S': Direction.Down,
  'A': Direction.Left,
  'D': Direction.Right,
};

/**
 * Keys that trigger confirm action.
 */
export const CONFIRM_KEYS = ['Enter', ' ', 'e', 'E'];

/**
 * Keys that trigger cancel action.
 */
export const CANCEL_KEYS = ['Escape', 'q', 'Q'];

// ============================================================================
// Keyboard Setup
// ============================================================================

/**
 * Set up keyboard input handling.
 * Returns cleanup function to remove event listeners.
 */
export function setupKeyboardInput(handler?: InputHandler): () => void {
  const inputHandler = handler ?? getInputHandler();

  const onKeyDown = (e: KeyboardEvent) => {
    // Check for direction keys
    const direction = KEYBOARD_MAP[e.key];
    if (direction !== undefined) {
      e.preventDefault();
      inputHandler.emitKeyboardDirection(direction);
      return;
    }

    // Check for confirm keys
    if (CONFIRM_KEYS.includes(e.key)) {
      e.preventDefault();
      inputHandler.emitConfirm('keyboard');
      return;
    }

    // Check for cancel keys
    if (CANCEL_KEYS.includes(e.key)) {
      e.preventDefault();
      inputHandler.emitCancel('keyboard');
      return;
    }
  };

  // Add event listener
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
  }

  // Return cleanup function
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown);
    }
  };
}

/**
 * Check if a key is a game input key (for preventing default behavior).
 */
export function isGameInputKey(key: string): boolean {
  return (
    key in KEYBOARD_MAP ||
    CONFIRM_KEYS.includes(key) ||
    CANCEL_KEYS.includes(key)
  );
}

/**
 * Get direction from key, or null if not a direction key.
 */
export function getDirectionFromKey(key: string): Direction | null {
  return KEYBOARD_MAP[key] ?? null;
}
