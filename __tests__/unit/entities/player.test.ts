/**
 * Player Entity Tests
 * Verifies player state management and stat calculation.
 */

import {
  createPlayer,
  calculatePlayerStats,
  equipTool,
  addGearToInventory,
} from '../../../src/game/entities/player';
import { createToolInstance } from '../../../src/game/entities/items';
import { createGearInstance } from '../../../src/data/gear';
import { GAME_CONSTANTS } from '../../../src/game/engine/constants';

describe('Player Entity', () => {
  // ============================================================================
  // T119, T121: DIG stat calculation
  // ============================================================================
  describe('DIG Stat Calculation', () => {
    it('starts with initial DIG', () => {
      const player = createPlayer({ x: 0, y: 0 });
      expect(player.stats.dig).toBe(GAME_CONSTANTS.INITIAL_DIG); // Should be 1
    });

    it('starts with 1 ATK from Rusty Pickaxe', () => {
      const player = createPlayer({ x: 0, y: 0 });
      expect(player.stats.atk).toBe(1);
    });

    it('increases DIG when equipping a tool with DIG bonus', () => {
      let player = createPlayer({ x: 0, y: 0 });
      // T6: Gemfinder Staff has { atk: 1, arm: 1, dig: 1 }
      const tool = createToolInstance('T6');
      player = equipTool(player, tool);

      // Check if stats updated
      const expectedDig = GAME_CONSTANTS.INITIAL_DIG + (player.equippedTool?.stats.dig ?? 0);
      expect(player.stats.dig).toBe(expectedDig);
      // Base DIG 1 + T6 DIG 1 = 2
      expect(player.stats.dig).toBe(2);
    });

    it('increases DIG when adding gear with DIG bonus', () => {
      let player = createPlayer({ x: 0, y: 0 });
      // I9: Miner Boots has { dig: 2 }
      const gear = createGearInstance('I9');
      player = addGearToInventory(player, gear) || player;

      const expectedDig = GAME_CONSTANTS.INITIAL_DIG + 2;
      expect(player.stats.dig).toBe(expectedDig);
      expect(player.stats.dig).toBe(3);
    });
  });
});
