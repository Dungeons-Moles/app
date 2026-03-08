import {
  convertBackendLogToFrontend,
  LogAction,
  StatusId,
  type BackendCombatLogEntry,
} from './combat_events';

describe('combat replay conversion', () => {
  it('does not treat attack extra as an SPD stat gain', () => {
    const entries: BackendCombatLogEntry[] = [
      {
        turn: 1,
        isPlayer: false,
        action: LogAction.Attack,
        value: 2,
        extra: 1,
      },
    ];

    const converted = convertBackendLogToFrontend(entries);

    expect(converted).toHaveLength(1);
    expect(converted[0].action).toBe('ATTACK');
    expect(converted[0].result.damage).toBe(2);
    expect(converted[0].result.spdBonus).toBeUndefined();
  });

  it('preserves bleed status damage instead of decoding it as chill', () => {
    const entries: BackendCombatLogEntry[] = [
      {
        turn: 2,
        isPlayer: true,
        action: LogAction.StatusDamage,
        value: 3,
        extra: StatusId.Bleed,
      },
    ];

    const converted = convertBackendLogToFrontend(entries);

    expect(converted).toHaveLength(1);
    expect(converted[0].result.damage).toBe(3);
    expect(converted[0].result.effectName).toBe('bleed damage');
    expect(converted[0].result.source).toEqual({
      kind: 'status',
      id: 'bleed',
      name: 'bleed',
    });
  });

  it('preserves sources on armor, atk, and spd change entries', () => {
    const source = { kind: 'gear' as const, id: 'G-FR-02', name: 'Frostguard Buckler' };
    const entries: BackendCombatLogEntry[] = [
      {
        turn: 1,
        isPlayer: true,
        action: LogAction.ArmorChange,
        value: 8,
        extra: 0,
        source,
      },
      {
        turn: 1,
        isPlayer: true,
        action: LogAction.AtkChange,
        value: 1,
        extra: 0,
        source,
      },
      {
        turn: 1,
        isPlayer: true,
        action: LogAction.SpdChange,
        value: 1,
        extra: 0,
        source,
      },
    ];

    const converted = convertBackendLogToFrontend(entries);

    expect(converted[0].result.source).toEqual(source);
    expect(converted[1].result.source).toEqual(source);
    expect(converted[2].result.source).toEqual(source);
    expect(converted[2].result.spdBonus).toBe(1);
  });

  it('preserves aggregated attack contributions for on-chain split-hit replay', () => {
    const entries: BackendCombatLogEntry[] = [
      {
        turn: 1,
        isPlayer: true,
        action: LogAction.Attack,
        value: 2,
        extra: 0,
        contributions: [
          {
            source: { kind: 'tool', id: 'T3', name: 'Corrosive Pick' },
            value: 1,
          },
          {
            source: { kind: 'gear', id: 'I17', name: 'Leather Gloves' },
            value: 1,
          },
        ],
      },
    ];

    const converted = convertBackendLogToFrontend(entries);

    expect(converted).toHaveLength(1);
    expect(converted[0].action).toBe('ATTACK');
    expect(converted[0].result.damage).toBe(2);
    expect(converted[0].result.contributions).toEqual(entries[0].contributions);
  });

  it('does not invent chill, rust, or spd changes in the blood mosquito baseline sequence', () => {
    const entries: BackendCombatLogEntry[] = [
      { turn: 1, isPlayer: false, action: LogAction.ArmorChange, value: -2, extra: 0 },
      { turn: 1, isPlayer: true, action: LogAction.ApplyStatus, value: 1, extra: StatusId.Bleed },
      {
        turn: 1,
        isPlayer: true,
        action: LogAction.Attack,
        value: 2,
        extra: 0,
        contributions: [
          {
            source: { kind: 'tool', id: 'T3', name: 'Corrosive Pick' },
            value: 1,
          },
          {
            source: { kind: 'gear', id: 'I17', name: 'Leather Gloves' },
            value: 1,
          },
        ],
      },
      {
        turn: 1,
        isPlayer: false,
        action: LogAction.ApplyStatus,
        value: 1,
        extra: StatusId.Rust,
      },
    ];

    const converted = convertBackendLogToFrontend(entries);

    expect(converted.map((entry) => entry.result.spdBonus).filter(Boolean)).toHaveLength(0);
    expect(converted.map((entry) => entry.result.effectName)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(converted[1].result.statusApplied).toEqual({ type: 'bleed', stacks: 1 });
    expect(converted[3].result.statusApplied).toEqual({ type: 'rust', stacks: 1 });
  });
});
