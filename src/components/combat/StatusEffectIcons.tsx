/**
 * T120: Status Effect Icons Display
 * Displays status effect icons with stack counts for combatants
 * @see specs/001-pve-dungeon-crawler/spec.md FR-029
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { StatusEffects } from '../../game/engine/types';
import {
  STATUS_EFFECT_ICONS,
  getActiveStatusEffects,
  type StatusEffectType,
} from '../../game/combat/status-effects';
import type { CombatantState } from '../../game/engine/types';

interface StatusEffectIconProps {
  type: StatusEffectType;
  stacks: number;
  size?: 'small' | 'medium' | 'large';
}

/**
 * Single status effect icon with stack count
 */
export const StatusEffectIcon = React.memo(function StatusEffectIcon({
  type,
  stacks,
  size = 'medium',
}: StatusEffectIconProps) {
  const iconInfo = STATUS_EFFECT_ICONS[type];

  const sizeStyles = useMemo(() => {
    switch (size) {
      case 'small':
        return { container: styles.containerSmall, emoji: styles.emojiSmall, stacks: styles.stacksSmall };
      case 'large':
        return { container: styles.containerLarge, emoji: styles.emojiLarge, stacks: styles.stacksLarge };
      default:
        return { container: styles.containerMedium, emoji: styles.emojiMedium, stacks: styles.stacksMedium };
    }
  }, [size]);

  if (stacks <= 0) return null;

  return (
    <View style={[styles.iconContainer, sizeStyles.container, { borderColor: iconInfo.color }]}>
      <Text style={sizeStyles.emoji}>{iconInfo.emoji}</Text>
      <View style={[styles.stackBadge, { backgroundColor: iconInfo.color }]}>
        <Text style={sizeStyles.stacks}>{stacks}</Text>
      </View>
    </View>
  );
});

interface StatusEffectIconsProps {
  combatant: CombatantState;
  size?: 'small' | 'medium' | 'large';
  direction?: 'row' | 'column';
}

/**
 * Display all active status effects for a combatant
 */
export const StatusEffectIcons = React.memo(function StatusEffectIcons({
  combatant,
  size = 'medium',
  direction = 'row',
}: StatusEffectIconsProps) {
  const activeEffects = useMemo(() => getActiveStatusEffects(combatant), [combatant]);

  if (activeEffects.length === 0) {
    return null;
  }

  return (
    <View style={[styles.iconsContainer, direction === 'column' && styles.iconsContainerColumn]}>
      {activeEffects.map(({ type, stacks }) => (
        <StatusEffectIcon key={type} type={type} stacks={stacks} size={size} />
      ))}
    </View>
  );
});

interface StatusEffectsFromStateProps {
  statusEffects: StatusEffects;
  size?: 'small' | 'medium' | 'large';
  direction?: 'row' | 'column';
}

/**
 * Alternative: Display status effects from raw StatusEffects object
 */
export const StatusEffectsFromState = React.memo(function StatusEffectsFromState({
  statusEffects,
  size = 'medium',
  direction = 'row',
}: StatusEffectsFromStateProps) {
  const activeEffects = useMemo(() => {
    const effects: Array<{ type: StatusEffectType; stacks: number }> = [];
    const types: StatusEffectType[] = ['chill', 'shrapnel', 'rust', 'bleed', 'reflection'];

    for (const type of types) {
      const stacks = statusEffects[type] ?? 0;
      if (stacks > 0) {
        effects.push({ type, stacks });
      }
    }

    return effects;
  }, [statusEffects]);

  if (activeEffects.length === 0) {
    return null;
  }

  return (
    <View style={[styles.iconsContainer, direction === 'column' && styles.iconsContainerColumn]}>
      {activeEffects.map(({ type, stacks }) => (
        <StatusEffectIcon key={type} type={type} stacks={stacks} size={size} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  iconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconsContainerColumn: {
    flexDirection: 'column',
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    borderWidth: 2,
  },
  // Small size
  containerSmall: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
  },
  emojiSmall: {
    fontSize: 12,
  },
  stacksSmall: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  // Medium size
  containerMedium: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
  },
  emojiMedium: {
    fontSize: 16,
  },
  stacksMedium: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  // Large size
  containerLarge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
  },
  emojiLarge: {
    fontSize: 24,
  },
  stacksLarge: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  // Stack badge
  stackBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
