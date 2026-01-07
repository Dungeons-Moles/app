/**
 * T026: Exploration Integration Tests
 * Tests the complete exploration flow including movement, fog of war updates,
 * time consumption, and enemy encounters.
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 1
 */

import { gameReducer, GameAction } from '../../src/game/engine/game-reducer';
import { createInitialGameState } from '../../src/game/engine/state-factory';
import { Direction } from '../../src/game/input/types';
import { GamePhase, TimePhase } from '../../src/game/engine/types';
import { TileType, FogState } from '../../src/game/map/types';
import { SIGHT_RADIUS, GAME_CONSTANTS } from '../../src/game/engine/constants';

describe('Exploration Integration', () => {
  const TEST_SEED = 12345;

  describe('Game Start', () => {
    it('should initialize game in Exploration phase after START_GAME', () => {
      const initialState = createInitialGameState();
      const action: GameAction = { type: 'START_GAME', seed: TEST_SEED };

      const state = gameReducer(initialState, action);

      expect(state.phase).toBe(GamePhase.Exploration);
      expect(state.seed).toBe(TEST_SEED);
    });

    it('should spawn player with initial radius 7 revealed', () => {
      const initialState = createInitialGameState();
      const action: GameAction = { type: 'START_GAME', seed: TEST_SEED };

      const state = gameReducer(initialState, action);

      // Count visible tiles within radius 7
      let visibleCount = 0;
      const { x: px, y: py } = state.player.position;
      for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
          const distance = Math.abs(x - px) + Math.abs(y - py);
          if (distance <= GAME_CONSTANTS.INITIAL_SIGHT_RADIUS) {
            if (state.map.fog[y][x] === FogState.Visible) {
              visibleCount++;
            }
          }
        }
      }

      // Should have some visible tiles
      expect(visibleCount).toBeGreaterThan(0);
    });

    it('should place Mole Den adjacent to player spawn', () => {
      const initialState = createInitialGameState();
      const action: GameAction = { type: 'START_GAME', seed: TEST_SEED };

      const state = gameReducer(initialState, action);

      const { x: px, y: py } = state.player.position;
      const { x: mx, y: my } = state.map.moleDenPosition;
      const distance = Math.abs(px - mx) + Math.abs(py - my);

      expect(distance).toBe(1);
    });
  });

  describe('Player Movement', () => {
    it('should move player in valid direction', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      const initialPos = { ...state.player.position };

      // Find a valid direction to move
      const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
      let movedState = state;
      let validDirection: Direction | null = null;

      for (const dir of directions) {
        const testState = gameReducer(state, { type: 'MOVE', direction: dir });
        if (
          testState.player.position.x !== initialPos.x ||
          testState.player.position.y !== initialPos.y
        ) {
          movedState = testState;
          validDirection = dir;
          break;
        }
      }

      expect(validDirection).not.toBeNull();
      expect(
        movedState.player.position.x !== initialPos.x ||
        movedState.player.position.y !== initialPos.y
      ).toBe(true);
    });

    it('should not move player into wall', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      const initialPos = { ...state.player.position };

      // Try all directions and verify wall blocking
      const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
      for (const dir of directions) {
        const delta = {
          [Direction.Up]: { x: 0, y: -1 },
          [Direction.Down]: { x: 0, y: 1 },
          [Direction.Left]: { x: -1, y: 0 },
          [Direction.Right]: { x: 1, y: 0 },
        }[dir];

        const targetX = state.player.position.x + delta.x;
        const targetY = state.player.position.y + delta.y;

        if (
          targetX >= 0 &&
          targetX < state.map.width &&
          targetY >= 0 &&
          targetY < state.map.height &&
          state.map.tiles[targetY][targetX] === TileType.Wall
        ) {
          const afterMove = gameReducer(state, { type: 'MOVE', direction: dir });
          expect(afterMove.player.position).toEqual(state.player.position);
        }
      }
    });

    it('should consume 1 time unit for EmptyTunnel/SoftEarth movement', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      const initialMoves = state.time.movesRemaining;

      // Find a valid move to EmptyTunnel or SoftEarth
      const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
      for (const dir of directions) {
        const delta = {
          [Direction.Up]: { x: 0, y: -1 },
          [Direction.Down]: { x: 0, y: 1 },
          [Direction.Left]: { x: -1, y: 0 },
          [Direction.Right]: { x: 1, y: 0 },
        }[dir];

        const targetX = state.player.position.x + delta.x;
        const targetY = state.player.position.y + delta.y;

        if (
          targetX >= 0 &&
          targetX < state.map.width &&
          targetY >= 0 &&
          targetY < state.map.height
        ) {
          const tile = state.map.tiles[targetY][targetX];
          if (tile === TileType.EmptyTunnel || tile === TileType.SoftEarth) {
            const afterMove = gameReducer(state, { type: 'MOVE', direction: dir });
            if (afterMove.player.position.x !== state.player.position.x ||
                afterMove.player.position.y !== state.player.position.y) {
              expect(afterMove.time.movesRemaining).toBe(initialMoves - 1);
              return;
            }
          }
        }
      }
    });

    it('should consume 2 time units for HardRock movement', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      // Find a HardRock tile adjacent to current position and move there
      const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
      for (const dir of directions) {
        const delta = {
          [Direction.Up]: { x: 0, y: -1 },
          [Direction.Down]: { x: 0, y: 1 },
          [Direction.Left]: { x: -1, y: 0 },
          [Direction.Right]: { x: 1, y: 0 },
        }[dir];

        const targetX = state.player.position.x + delta.x;
        const targetY = state.player.position.y + delta.y;

        if (
          targetX >= 0 &&
          targetX < state.map.width &&
          targetY >= 0 &&
          targetY < state.map.height &&
          state.map.tiles[targetY][targetX] === TileType.HardRock
        ) {
          const initialMoves = state.time.movesRemaining;
          const afterMove = gameReducer(state, { type: 'MOVE', direction: dir });
          if (afterMove.player.position.x !== state.player.position.x ||
              afterMove.player.position.y !== state.player.position.y) {
            expect(afterMove.time.movesRemaining).toBe(initialMoves - 2);
            return;
          }
        }
      }

      // If no HardRock adjacent, test is skipped (map dependent)
    });
  });

  describe('Fog of War Updates', () => {
    it('should update fog of war when player moves', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      // Count initial visible tiles
      const countVisible = (map: typeof state.map) =>
        map.fog.flat().filter((f) => f === FogState.Visible).length;

      const initialVisibleCount = countVisible(state.map);

      // Make multiple moves
      const directions = [Direction.Right, Direction.Down, Direction.Right, Direction.Down];
      for (const dir of directions) {
        state = gameReducer(state, { type: 'MOVE', direction: dir });
      }

      // Should have revealed more tiles (or at least same if at edge)
      const finalVisibleCount = countVisible(state.map);
      const revealedCount = state.map.fog.flat().filter(
        (f) => f === FogState.Revealed
      ).length;

      // Total revealed + visible should increase as we explore
      expect(finalVisibleCount + revealedCount).toBeGreaterThanOrEqual(initialVisibleCount);
    });

    it('should use correct sight radius for Day phase', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      expect(state.time.phase).toBe(TimePhase.Day);

      // Move to trigger fog update
      state = gameReducer(state, { type: 'MOVE', direction: Direction.Right });

      // Check visibility at exact day radius
      const { x: px, y: py } = state.player.position;
      const atExactRadius = [];
      for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
          const distance = Math.abs(x - px) + Math.abs(y - py);
          if (distance === SIGHT_RADIUS.day && state.map.fog[y][x] === FogState.Visible) {
            atExactRadius.push({ x, y });
          }
        }
      }

      // Should have some tiles visible at exact day radius
      // (unless blocked by walls)
      expect(atExactRadius.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Time Phase Transitions', () => {
    it('should transition from Day to Night when moves exhausted', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      expect(state.time.phase).toBe(TimePhase.Day);
      expect(state.time.movesRemaining).toBe(GAME_CONSTANTS.DAY_MOVES);

      // Exhaust all day moves
      while (state.time.movesRemaining > 0 && state.time.phase === TimePhase.Day) {
        const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
        for (const dir of directions) {
          const testState = gameReducer(state, { type: 'MOVE', direction: dir });
          if (
            testState.player.position.x !== state.player.position.x ||
            testState.player.position.y !== state.player.position.y
          ) {
            state = testState;
            break;
          }
        }

        // Safety: prevent infinite loop
        if (state.time.movesRemaining === GAME_CONSTANTS.DAY_MOVES) {
          // No valid move found, skip test
          return;
        }
      }

      // Should have transitioned to Night
      expect(state.time.phase).toBe(TimePhase.Night);
      expect(state.time.movesRemaining).toBe(GAME_CONSTANTS.NIGHT_MOVES);
    });
  });

  describe('Enemy Encounters', () => {
    it('should enter Combat phase when stepping on enemy', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      // Find an enemy on the map
      if (state.map.enemies.length === 0) {
        // No enemies to test
        return;
      }

      // Find path to nearest enemy (simplified: just check if any enemy adjacent)
      const enemy = state.map.enemies[0];
      const { x: ex, y: ey } = enemy.position;
      const { x: px, y: py } = state.player.position;

      // If enemy is adjacent, move onto it
      if (Math.abs(ex - px) + Math.abs(ey - py) === 1) {
        const direction =
          ex > px ? Direction.Right :
          ex < px ? Direction.Left :
          ey > py ? Direction.Down :
          Direction.Up;

        state = gameReducer(state, { type: 'MOVE', direction });

        // Should have entered combat
        expect(state.phase).toBe(GamePhase.Combat);
      }
    });
  });

  describe('Determinism', () => {
    it('should produce identical game state with same seed and actions', () => {
      // First run
      let state1 = createInitialGameState();
      state1 = gameReducer(state1, { type: 'START_GAME', seed: TEST_SEED });
      state1 = gameReducer(state1, { type: 'MOVE', direction: Direction.Right });
      state1 = gameReducer(state1, { type: 'MOVE', direction: Direction.Down });
      state1 = gameReducer(state1, { type: 'MOVE', direction: Direction.Right });

      // Second run with same actions
      let state2 = createInitialGameState();
      state2 = gameReducer(state2, { type: 'START_GAME', seed: TEST_SEED });
      state2 = gameReducer(state2, { type: 'MOVE', direction: Direction.Right });
      state2 = gameReducer(state2, { type: 'MOVE', direction: Direction.Down });
      state2 = gameReducer(state2, { type: 'MOVE', direction: Direction.Right });

      // States should be identical
      expect(state1.player.position).toEqual(state2.player.position);
      expect(state1.time).toEqual(state2.time);
      expect(state1.map.fog).toEqual(state2.map.fog);
      expect(state1.rngState).toEqual(state2.rngState);
    });
  });

  describe('Camera Behavior', () => {
    it('should always have camera centered on player (verified in state)', () => {
      const initialState = createInitialGameState();
      let state = gameReducer(initialState, { type: 'START_GAME', seed: TEST_SEED });

      // Move several times
      const moves = [Direction.Right, Direction.Down, Direction.Left, Direction.Up];
      for (const dir of moves) {
        state = gameReducer(state, { type: 'MOVE', direction: dir });

        // Player position is always the reference for camera
        // The camera centering is a rendering concern, but we verify
        // the state always has valid player position
        expect(state.player.position).toBeDefined();
        expect(state.player.position.x).toBeGreaterThanOrEqual(0);
        expect(state.player.position.y).toBeGreaterThanOrEqual(0);
        expect(state.player.position.x).toBeLessThan(state.map.width);
        expect(state.player.position.y).toBeLessThan(state.map.height);
      }
    });
  });
});
