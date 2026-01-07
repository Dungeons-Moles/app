/**
 * Input types for PvE Dungeon Crawler
 * @see specs/001-pve-dungeon-crawler/data-model.md
 */

import type { Position } from '../engine/types';

// ============================================================================
// Direction
// ============================================================================

export enum Direction {
  Up = 'UP',
  Down = 'DOWN',
  Left = 'LEFT',
  Right = 'RIGHT',
}

// ============================================================================
// Input Event
// ============================================================================

export interface InputEvent {
  type: 'DIRECTION' | 'CONFIRM' | 'CANCEL';
  direction?: Direction;
  source: 'dpad' | 'keyboard';
  timestamp: number;
}

// ============================================================================
// Direction to Position Delta
// ============================================================================

export const DIRECTION_DELTA: Record<Direction, Position> = {
  [Direction.Up]: { x: 0, y: -1 },
  [Direction.Down]: { x: 0, y: 1 },
  [Direction.Left]: { x: -1, y: 0 },
  [Direction.Right]: { x: 1, y: 0 },
};
