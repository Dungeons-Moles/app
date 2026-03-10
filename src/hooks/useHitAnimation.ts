import { useRef, useEffect, useMemo } from 'react';
import { Animated } from 'react-native';
import type { CombatantState } from '../game/engine/types';

/**
 * Returns animated style values (translateX shake + opacity blink)
 * that trigger whenever `hp` or `arm` decreases.
 * Also returns a purple tint flash for armor hits.
 */
export function useHitAnimation(hp: number | undefined, arm?: number) {
  const prevHpRef = useRef(hp);
  const prevArmRef = useRef(arm);
  const shakeX = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(1)).current;
  const armorFlashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const prevHp = prevHpRef.current;
    const prevArm = prevArmRef.current;
    prevHpRef.current = hp;
    prevArmRef.current = arm;

    const hpHit = prevHp !== undefined && hp !== undefined && hp < prevHp;
    const armHit = prevArm !== undefined && arm !== undefined && arm < prevArm;

    if (!hpHit && !armHit) return;

    Animated.sequence([
      Animated.timing(shakeX, { toValue: 6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4, duration: 35, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -4, duration: 35, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 30, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.timing(flashOpacity, { toValue: 0.3, duration: 60, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 0.4, duration: 50, useNativeDriver: true }),
      Animated.timing(flashOpacity, { toValue: 1, duration: 50, useNativeDriver: true }),
    ]).start();

    if (armHit) {
      Animated.sequence([
        Animated.timing(armorFlashOpacity, { toValue: 0.45, duration: 120, useNativeDriver: true }),
        Animated.timing(armorFlashOpacity, { toValue: 0.15, duration: 100, useNativeDriver: true }),
        Animated.timing(armorFlashOpacity, { toValue: 0.35, duration: 100, useNativeDriver: true }),
        Animated.timing(armorFlashOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [hp, arm, shakeX, flashOpacity, armorFlashOpacity]);

  return { shakeX, flashOpacity, armorFlashOpacity };
}

/**
 * Returns an animated opacity value that pulses when `stacks` increases,
 * used to flash a colored overlay on a combatant (e.g. chill tint).
 */
export function useStatusFlash(stacks: number | undefined) {
  const prevRef = useRef(stacks);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = stacks;

    if (prev === undefined || stacks === undefined) return;
    if (stacks <= prev) return;

    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.45, duration: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.15, duration: 100, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.35, duration: 100, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [stacks, opacity]);

  return opacity;
}

const STATUS_TINT_COLORS = {
  chill: '#5CAEC8',
  shrapnel: '#6E7784',
  rust: '#A4542A',
  bleed: '#B33A3F',
} as const;

export type StatusFlashes = {
  color: string;
  opacity: Animated.Value;
}[];

/**
 * Returns an array of { color, opacity } for each status effect,
 * triggering a tint flash whenever stacks increase.
 */
export function useStatusFlashes(statusEffects: {
  chill: number;
  shrapnel: number;
  rust: number;
  bleed: number;
} | undefined): StatusFlashes {
  const chillFlash = useStatusFlash(statusEffects?.chill);
  const shrapnelFlash = useStatusFlash(statusEffects?.shrapnel);
  const rustFlash = useStatusFlash(statusEffects?.rust);
  const bleedFlash = useStatusFlash(statusEffects?.bleed);

  return [
    { color: STATUS_TINT_COLORS.chill, opacity: chillFlash },
    { color: STATUS_TINT_COLORS.shrapnel, opacity: shrapnelFlash },
    { color: STATUS_TINT_COLORS.rust, opacity: rustFlash },
    { color: STATUS_TINT_COLORS.bleed, opacity: bleedFlash },
  ];
}

/** Reuses the same pulse animation as useStatusFlash but triggers on value increase. */
function useGainFlash(value: number | undefined) {
  return useStatusFlash(value);
}

const STAT_GAIN_COLORS = {
  hp: '#22c55e',
  arm: '#a855f7',
  atk: '#111111',
  spd: '#d97706',
  dig: '#888888',
} as const;

/**
 * Flashes the combatant tint when they gain HP, ARM, ATK, SPD, or DIG.
 */
export function useStatGainFlashes(combatant: CombatantState | null | undefined): StatusFlashes {
  const hp = combatant?.hp;
  const arm = combatant != null ? combatant.arm + combatant.bonusArm : undefined;
  const atk = combatant != null ? combatant.atk + combatant.bonusAtk : undefined;
  const spd = combatant != null ? combatant.spd + combatant.bonusSpd : undefined;
  const dig = combatant?.dig;

  const hpFlash = useGainFlash(hp);
  const armFlash = useGainFlash(arm);
  const atkFlash = useGainFlash(atk);
  const spdFlash = useGainFlash(spd);
  const digFlash = useGainFlash(dig);

  return useMemo(() => [
    { color: STAT_GAIN_COLORS.hp, opacity: hpFlash },
    { color: STAT_GAIN_COLORS.arm, opacity: armFlash },
    { color: STAT_GAIN_COLORS.atk, opacity: atkFlash },
    { color: STAT_GAIN_COLORS.spd, opacity: spdFlash },
    { color: STAT_GAIN_COLORS.dig, opacity: digFlash },
  ], [hpFlash, armFlash, atkFlash, spdFlash, digFlash]);
}

/**
 * Ground selection ellipse that scales in when active and scales out when inactive.
 * Returns { scale, opacity } animated values.
 */
export function useActiveGlow(active: boolean) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [active, scale, opacity]);

  return { scale, opacity };
}

