import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { CombatProvider, useCombat } from '../../src/contexts/CombatContext';
import type { CombatResolverInput } from '../../src/game/combat/types';
import { createGearInstance, createToolInstance } from '../../src/game/entities/items';
import type { CombatantState } from '../../src/game/engine/types';

type Snapshot = {
  currentLogIndex: number;
  activeActorLogIndex: number;
  currentAction: string | null;
  currentActor: string | null;
  currentTiming: string | null;
  currentSourceId: string | null;
  playerHp: number | null;
  enemyHp: number | null;
  playerShrapnel: number | null;
  enemyShrapnel: number | null;
};

function buildCombatant(
  name: string,
  isPlayer: boolean,
  definitionId: string,
  hp: number,
  atk: number
): CombatantState {
  return {
    name,
    emoji: '',
    definitionId,
    isPlayer,
    maxHp: hp,
    hp,
    atk,
    arm: 0,
    spd: 0,
    dig: 0,
    bonusAtk: 0,
    bonusArm: 0,
    bonusSpd: 0,
    statusEffects: { chill: 0, shrapnel: 0, rust: 0, bleed: 0 },
    strikesPerTurn: 1,
    ignoresArmor: false,
  };
}

function CombatProbe({
  input,
  onSnapshot,
}: {
  input: CombatResolverInput;
  onSnapshot: (snapshot: Snapshot) => void;
}) {
  const { state, displayStates, startCombat } = useCombat();
  const currentEntry =
    state.currentLogIndex >= 0 ? state.resolvedCombat?.log[state.currentLogIndex] : undefined;

  useEffect(() => {
    startCombat(input);
  }, [input, startCombat]);

  useEffect(() => {
    onSnapshot({
      currentLogIndex: state.currentLogIndex,
      activeActorLogIndex: state.activeActorLogIndex,
      currentAction: currentEntry?.action ?? null,
      currentActor: currentEntry?.actor ?? null,
      currentTiming: currentEntry?.timing ?? null,
      currentSourceId: currentEntry?.result.source?.id ?? null,
      playerHp: displayStates.player?.hp ?? null,
      enemyHp: displayStates.enemy?.hp ?? null,
      playerShrapnel: displayStates.player?.statusEffects.shrapnel ?? null,
      enemyShrapnel: displayStates.enemy?.statusEffects.shrapnel ?? null,
    });
  }, [currentEntry, displayStates, onSnapshot, state.activeActorLogIndex, state.currentLogIndex]);

  return null;
}

describe('Combat replay', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message?: unknown) => {
      if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) {
        return;
      }
    });
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('replays both Twin Picks strikes against Spiked Bracers in the battle simulator flow', () => {
    const snapshots: Snapshot[] = [];
    let renderer: { unmount: () => void } | null = null;
    const input: CombatResolverInput = {
      player: buildCombatant('Player', true, 'player', 20, 1),
      enemy: buildCombatant('Opponent', false, 'pvpOpponent', 20, 1),
      seed: 1337,
      enemyDefinitionId: 'pvpOpponent',
      playerTool: createToolInstance('T0'),
      playerGear: [createGearInstance('I3', 'COMMON')],
      playerGold: 0,
      enemyGold: 0,
      enemyTool: createToolInstance('T3'),
      enemyGear: [],
      enemyActiveItemSets: [],
      preserveArmor: true,
    };

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          CombatProvider,
          {
            initialSpeed: 'normal',
            children: React.createElement(CombatProbe, {
              input,
              onSnapshot: (snapshot: Snapshot) => snapshots.push(snapshot),
            }),
          },
        )
      );
    });

    const advance = (ms: number) => {
      act(() => {
        jest.advanceTimersByTime(ms);
      });
    };

    const uniqueProgress: Snapshot[] = [];
    let lastLogIndex = Number.NaN;

    for (let step = 0; step < 60; step += 1) {
      advance(500);
      const current = snapshots.at(-1);
      if (!current) continue;
      if (current.currentLogIndex !== lastLogIndex) {
        uniqueProgress.push(current);
        lastLogIndex = current.currentLogIndex;
      }
      if (
        current.currentAction === 'ATTACK' &&
        current.currentActor === 'player' &&
        current.currentTiming === 'PLAYER_ATTACK'
      ) {
        break;
      }
    }

    const firstPlayerAttackIndex = uniqueProgress.findIndex(
      (snapshot) =>
        snapshot.currentAction === 'ATTACK' &&
        snapshot.currentActor === 'player' &&
        snapshot.currentTiming === 'PLAYER_ATTACK'
    );
    expect(firstPlayerAttackIndex).toBeGreaterThan(0);

    const entriesBeforePlayerAttack = uniqueProgress.slice(0, firstPlayerAttackIndex);
    const enemyAttackEntries = entriesBeforePlayerAttack.filter(
      (snapshot) =>
        snapshot.currentAction === 'ATTACK' &&
        snapshot.currentActor === 'enemy' &&
        snapshot.currentTiming === 'ENEMY_ATTACK'
    );
    const shrapnelEntries = entriesBeforePlayerAttack.filter(
      (snapshot) =>
        snapshot.currentSourceId === 'shrapnel' &&
        snapshot.currentTiming === 'ENEMY_ATTACK' &&
        snapshot.currentActor === 'player'
    );

    expect(enemyAttackEntries).toHaveLength(2);
    expect(shrapnelEntries).toHaveLength(2);
    expect(enemyAttackEntries[1]).toMatchObject({
      playerHp: 18,
      playerShrapnel: 2,
    });
    expect(shrapnelEntries[1]).toMatchObject({
      enemyHp: 18,
      playerShrapnel: 1,
    });

    act(() => {
      renderer?.unmount();
    });
  });
});
