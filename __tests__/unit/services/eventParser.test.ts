/**
 * Unit Tests for Event Parser
 *
 * Tests for parsing combat and gameplay events from Solana transaction logs.
 *
 * @see src/services/solana/eventParser.ts
 */

import { PublicKey } from '@solana/web3.js';
import { parseEventsFromLogs } from '@/services/solana/eventParser';
import {
  EVENT_NAMES,
  StatusEffect,
  type CombatStartedEvent,
  type TurnExecutedEvent,
  type CombatEndedEvent,
} from '@/services/solana/types/combat_events';

// Mock Program with event coder
const mockEventCoder = {
  decode: jest.fn(),
};

const mockProgram = {
  coder: {
    events: mockEventCoder,
  },
} as unknown as Parameters<typeof parseEventsFromLogs>[0];

describe('Event Parser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseEventsFromLogs', () => {
    it('should return empty array for logs without Program data', () => {
      const logs = ['Program log: Instruction: MoveWithCombat', 'Program log: Some other log'];

      const events = parseEventsFromLogs(mockProgram, logs);
      expect(events).toEqual([]);
    });

    it('should parse combat events from Program data logs', () => {
      // Mock a CombatStarted event
      mockEventCoder.decode.mockReturnValueOnce({
        name: 'CombatStarted',
        data: {
          player: new PublicKey('11111111111111111111111111111111'),
          player_hp: 10,
          player_atk: 5,
          enemy_archetype: 2,
          enemy_hp: 8,
          enemy_atk: 3,
        },
      });

      const logs = ['Program data: SGVsbG8gV29ybGQ='];

      const events = parseEventsFromLogs(mockProgram, logs);

      expect(events.length).toBe(1);
      expect(events[0].name).toBe('CombatStarted');
    });

    it('should handle decoding failures gracefully', () => {
      mockEventCoder.decode.mockImplementation(() => {
        throw new Error('Invalid event data');
      });

      const logs = ['Program data: InvalidBase64Data=='];

      const events = parseEventsFromLogs(mockProgram, logs);
      expect(events).toEqual([]);
    });

    it('should parse multiple events from a single transaction', () => {
      // First call: CombatStarted
      mockEventCoder.decode
        .mockReturnValueOnce({
          name: 'CombatStarted',
          data: {
            player: new PublicKey('11111111111111111111111111111111'),
            player_hp: 10,
            player_atk: 5,
            enemy_archetype: 2,
            enemy_hp: 8,
            enemy_atk: 3,
          },
        })
        // Second call: TurnExecuted
        .mockReturnValueOnce({
          name: 'TurnExecuted',
          data: {
            turn: 1,
            player_hp: 8,
            enemy_hp: 5,
            player_damage: 3,
            enemy_damage: 2,
          },
        })
        // Third call: CombatEnded
        .mockReturnValueOnce({
          name: 'CombatEnded',
          data: {
            player: new PublicKey('11111111111111111111111111111111'),
            player_won: true,
            final_player_hp: 6,
            final_enemy_hp: 0,
            gold_earned: 10,
            turns_taken: 3,
          },
        });

      const logs = [
        'Program data: Event1Base64==',
        'Program log: Some other log',
        'Program data: Event2Base64==',
        'Program data: Event3Base64==',
      ];

      const events = parseEventsFromLogs(mockProgram, logs);

      expect(events.length).toBe(3);
      expect(events[0].name).toBe('CombatStarted');
      expect(events[1].name).toBe('TurnExecuted');
      expect(events[2].name).toBe('CombatEnded');
    });
  });

  describe('Event data conversion', () => {
    it('should convert snake_case to camelCase for CombatStarted', () => {
      mockEventCoder.decode.mockReturnValueOnce({
        name: 'CombatStarted',
        data: {
          player: new PublicKey('11111111111111111111111111111111'),
          player_hp: 10,
          player_atk: 5,
          enemy_archetype: 2,
          enemy_hp: 8,
          enemy_atk: 3,
        },
      });

      const logs = ['Program data: SGVsbG8='];
      const events = parseEventsFromLogs(mockProgram, logs);

      const event = events[0].data as CombatStartedEvent;
      expect(event.playerHp).toBe(10);
      expect(event.playerAtk).toBe(5);
      expect(event.enemyArchetype).toBe(2);
      expect(event.enemyHp).toBe(8);
      expect(event.enemyAtk).toBe(3);
    });

    it('should convert TurnExecuted data correctly', () => {
      mockEventCoder.decode.mockReturnValueOnce({
        name: 'TurnExecuted',
        data: {
          turn: 2,
          player_hp: 7,
          enemy_hp: 3,
          player_damage: 4,
          enemy_damage: 3,
        },
      });

      const logs = ['Program data: SGVsbG8='];
      const events = parseEventsFromLogs(mockProgram, logs);

      const event = events[0].data as TurnExecutedEvent;
      expect(event.turn).toBe(2);
      expect(event.playerHp).toBe(7);
      expect(event.enemyHp).toBe(3);
      expect(event.playerDamage).toBe(4);
      expect(event.enemyDamage).toBe(3);
    });

    it('should convert CombatEnded data correctly', () => {
      mockEventCoder.decode.mockReturnValueOnce({
        name: 'CombatEnded',
        data: {
          player: new PublicKey('11111111111111111111111111111111'),
          player_won: true,
          final_player_hp: 5,
          final_enemy_hp: 0,
          gold_earned: 25,
          turns_taken: 4,
        },
      });

      const logs = ['Program data: SGVsbG8='];
      const events = parseEventsFromLogs(mockProgram, logs);

      const event = events[0].data as CombatEndedEvent;
      expect(event.playerWon).toBe(true);
      expect(event.finalPlayerHp).toBe(5);
      expect(event.finalEnemyHp).toBe(0);
      expect(event.goldEarned).toBe(25);
      expect(event.turnsTaken).toBe(4);
    });
  });
});

describe('Event Name Constants', () => {
  it('should have all expected event names', () => {
    expect(EVENT_NAMES.COMBAT_STARTED).toBe('CombatStarted');
    expect(EVENT_NAMES.TURN_EXECUTED).toBe('TurnExecuted');
    expect(EVENT_NAMES.STATUS_APPLIED).toBe('StatusApplied');
    expect(EVENT_NAMES.COMBAT_ENDED).toBe('CombatEnded');
    expect(EVENT_NAMES.BOSS_COMBAT_STARTED).toBe('BossCombatStarted');
    expect(EVENT_NAMES.ENEMY_MOVED).toBe('EnemyMoved');
    expect(EVENT_NAMES.PLAYER_DEFEATED).toBe('PlayerDefeated');
    expect(EVENT_NAMES.LEVEL_COMPLETED).toBe('LevelCompleted');
    expect(EVENT_NAMES.ITEM_UNLOCKED).toBe('ItemUnlocked');
  });
});

describe('StatusEffect enum', () => {
  it('should have correct values', () => {
    expect(StatusEffect.Chill).toBe(0);
    expect(StatusEffect.Shrapnel).toBe(1);
    expect(StatusEffect.Rust).toBe(2);
  });
});
