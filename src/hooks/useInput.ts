/**
 * useInput hook for handling game input in React components
 * @see specs/001-pve-dungeon-crawler/research.md R6
 */

import { useEffect, useCallback, useRef } from 'react';
import { Direction, InputEvent } from '../game/input/types';
import { InputHandler, getInputHandler, createInputHandler } from '../game/input/handler';
import { setupKeyboardInput } from '../game/input/keyboard';

// ============================================================================
// Types
// ============================================================================

export interface UseInputOptions {
  /**
   * Whether to set up keyboard bindings.
   * Default: true on web, false on native.
   */
  enableKeyboard?: boolean;

  /**
   * Whether input is currently enabled.
   */
  enabled?: boolean;

  /**
   * Debounce delay in milliseconds.
   */
  debounceMs?: number;

  /**
   * Use a custom input handler instead of the global one.
   */
  customHandler?: InputHandler;
}

export interface UseInputResult {
  /**
   * Emit a direction input (for D-pad controls).
   */
  emitDirection: (direction: Direction) => void;

  /**
   * Emit confirm action.
   */
  emitConfirm: () => void;

  /**
   * Emit cancel action.
   */
  emitCancel: () => void;

  /**
   * The input handler instance.
   */
  handler: InputHandler;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing game input.
 *
 * @param onInput - Callback for input events
 * @param options - Configuration options
 */
export function useInput(
  onInput: (event: InputEvent) => void,
  options: UseInputOptions = {}
): UseInputResult {
  const {
    enableKeyboard = typeof window !== 'undefined',
    enabled = true,
    debounceMs,
    customHandler,
  } = options;

  // Use ref to maintain stable handler reference
  const handlerRef = useRef<InputHandler>(customHandler ?? getInputHandler());

  // Update handler settings
  useEffect(() => {
    handlerRef.current.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    if (debounceMs !== undefined) {
      handlerRef.current.setDebounceMs(debounceMs);
    }
  }, [debounceMs]);

  // Subscribe to input events
  useEffect(() => {
    const handler = handlerRef.current;
    const unsubscribe = handler.subscribe(onInput);

    return () => {
      unsubscribe();
    };
  }, [onInput]);

  // Set up keyboard input
  useEffect(() => {
    if (!enableKeyboard) {
      return;
    }

    const cleanup = setupKeyboardInput(handlerRef.current);
    return cleanup;
  }, [enableKeyboard]);

  // Create stable callback references
  const emitDirection = useCallback((direction: Direction) => {
    handlerRef.current.emitDpadDirection(direction);
  }, []);

  const emitConfirm = useCallback(() => {
    handlerRef.current.emitConfirm('dpad');
  }, []);

  const emitCancel = useCallback(() => {
    handlerRef.current.emitCancel('dpad');
  }, []);

  return {
    emitDirection,
    emitConfirm,
    emitCancel,
    handler: handlerRef.current,
  };
}

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for direction input only (simpler interface).
 */
export function useDirectionInput(
  onDirection: (direction: Direction) => void,
  options: UseInputOptions = {}
): UseInputResult {
  const handleInput = useCallback(
    (event: InputEvent) => {
      if (event.type === 'DIRECTION' && event.direction) {
        onDirection(event.direction);
      }
    },
    [onDirection]
  );

  return useInput(handleInput, options);
}

/**
 * Create isolated input context for testing.
 */
export function useIsolatedInput(
  onInput: (event: InputEvent) => void,
  options: Omit<UseInputOptions, 'customHandler'> = {}
): UseInputResult {
  const handlerRef = useRef(createInputHandler(options.debounceMs));

  return useInput(onInput, {
    ...options,
    customHandler: handlerRef.current,
  });
}
