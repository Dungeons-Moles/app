/**
 * T058: CombatScreen with combat resolution and navigation
 * Container for combat gameplay with arena, panels, and result display
 * @see specs/001-pve-dungeon-crawler/spec.md User Story 2
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { useGame, GamePhase } from '../contexts/GameContext';
import { CombatProvider, useCombat } from '../contexts/CombatContext';
import { CombatArena, VictoryDefeatDisplay } from '../components/combat';
import type { CombatLogEntry } from '../game/engine/types';
import { CombatPhase } from '../game/engine/types';

type CombatScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Combat'>;
};

const SAFE_AREA_EDGES = ['left', 'right'] as const;

/**
 * CombatScreen - Container for combat gameplay
 * Displays the combat arena, player/enemy panels, and combat log in landscape orientation
 */
export function CombatScreen({ navigation }: CombatScreenProps) {
  return (
    <CombatProvider>
      <CombatScreenContent navigation={navigation} />
    </CombatProvider>
  );
}

function CombatScreenContent({ navigation }: CombatScreenProps) {
  const { state: gameState, dispatch: gameDispatch } = useGame();
  const { state: combatState, dispatch: combatDispatch, startCombat, getDisplayStates, getResult, getCurrentLog } = useCombat();

  // Start combat when screen loads
  useEffect(() => {
    if (gameState?.combat && !combatState.combat) {
      // Use combat state from game context
      startCombat({
        player: gameState.combat.player,
        enemy: gameState.combat.enemy,
        seed: gameState.rngState,
      });
    }
  }, [gameState?.combat, combatState.combat, startCombat, gameState?.rngState]);

  // Auto-advance through combat log for animation
  useEffect(() => {
    if (!combatState.resolvedCombat || combatState.isComplete) return;

    const logLength = combatState.resolvedCombat.log.length;
    if (combatState.currentLogIndex >= logLength - 1) {
      // Combat animation complete
      combatDispatch({ type: 'COMPLETE_ANIMATION' });
      return;
    }

    // Advance log every 500ms for animation effect
    const timer = setTimeout(() => {
      combatDispatch({ type: 'ADVANCE_LOG', index: combatState.currentLogIndex + 1 });
    }, 300);

    return () => clearTimeout(timer);
  }, [combatState.currentLogIndex, combatState.resolvedCombat, combatState.isComplete, combatDispatch]);

  // Handle combat completion
  const handleCombatComplete = useCallback(() => {
    const result = getResult();
    if (!result) return;

    // Dispatch result to game state
    gameDispatch({ type: 'RESOLVE_COMBAT', result });

    // Navigate based on result
    if (result === 'DEFEAT') {
      navigation.replace('Hub');
    } else {
      navigation.goBack();
    }
  }, [getResult, gameDispatch, navigation]);

  const { player, enemy } = getDisplayStates();
  const currentLog = getCurrentLog();
  const result = getResult();

  // Show loading if no combat state
  if (!player || !enemy) {
    return (
      <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Preparing combat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={SAFE_AREA_EDGES}>
      <View style={styles.content}>
        {/* Enemy Panel (LEFT) */}
        <View style={styles.sidePanel}>
          <CombatantPanel
            combatant={enemy}
            isPlayer={false}
          />
        </View>

        {/* Combat Arena (CENTER) */}
        <View style={styles.arenaArea}>
          <CombatArena
            player={player}
            enemy={enemy}
            damageNumbers={combatState.damageNumbers}
            isAnimating={combatState.isAnimating}
          />

          {/* Combat Log */}
          <View style={styles.logContainer}>
            <CombatLog entries={currentLog} />
          </View>
        </View>

        {/* Player Panel (RIGHT) */}
        <View style={styles.sidePanel}>
          <CombatantPanel
            combatant={player}
            isPlayer={true}
          />
        </View>
      </View>

      {/* Victory/Defeat Overlay */}
      {combatState.isComplete && result && (
        <VictoryDefeatDisplay
          result={result}
          onComplete={handleCombatComplete}
        />
      )}
    </SafeAreaView>
  );
}

// Combatant panel component
interface CombatantPanelProps {
  combatant: {
    name: string;
    emoji: string;
    hp: number;
    maxHp: number;
    atk: number;
    arm: number;
    spd: number;
    statusEffects: {
      chill: number;
      shrapnel: number;
      rust: number;
    };
  };
  isPlayer: boolean;
}

function CombatantPanel({ combatant, isPlayer }: CombatantPanelProps) {
  const hpPercent = (combatant.hp / combatant.maxHp) * 100;

  return (
    <View style={styles.panelContent}>
      {/* Header */}
      <View style={styles.panelHeader}>
        <Text style={styles.panelEmoji}>{combatant.emoji}</Text>
        <Text style={styles.panelName}>{combatant.name}</Text>
      </View>

      {/* HP Bar */}
      <View style={styles.hpBarContainer}>
        <View style={styles.hpBarBackground}>
          <View
            style={[
              styles.hpBarFill,
              {
                width: `${hpPercent}%`,
                backgroundColor: hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#eab308' : '#dc2626',
              },
            ]}
          />
        </View>
        <Text style={styles.hpText}>
          {combatant.hp}/{combatant.maxHp}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <StatRow label="ATK" value={combatant.atk} icon="⚔️" />
        <StatRow label="ARM" value={combatant.arm} icon="🛡️" />
        <StatRow label="SPD" value={combatant.spd} icon="⚡" />
      </View>

      {/* Status Effects */}
      <View style={styles.statusContainer}>
        {combatant.statusEffects.chill > 0 && (
          <StatusBadge type="chill" stacks={combatant.statusEffects.chill} />
        )}
        {combatant.statusEffects.shrapnel > 0 && (
          <StatusBadge type="shrapnel" stacks={combatant.statusEffects.shrapnel} />
        )}
        {combatant.statusEffects.rust > 0 && (
          <StatusBadge type="rust" stacks={combatant.statusEffects.rust} />
        )}
      </View>
    </View>
  );
}

function StatRow({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function StatusBadge({ type, stacks }: { type: 'chill' | 'shrapnel' | 'rust'; stacks: number }) {
  const config = {
    chill: { emoji: '❄️', color: '#60a5fa' },
    shrapnel: { emoji: '💥', color: '#f97316' },
    rust: { emoji: '🦠', color: '#a16207' },
  };

  const { emoji, color } = config[type];

  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={styles.statusEmoji}>{emoji}</Text>
      <Text style={[styles.statusStacks, { color }]}>{stacks}</Text>
    </View>
  );
}

// Combat log component
function CombatLog({ entries }: { entries: CombatLogEntry[] }) {
  // Show last 5 entries
  const recentEntries = entries.slice(-5);

  const formatEntry = (entry: CombatLogEntry): string => {
    const actorName = entry.actor === 'player' ? 'Player' : entry.actor === 'enemy' ? 'Enemy' : 'System';

    switch (entry.action) {
      case 'ATTACK':
        return `${actorName} attacks for ${entry.result.damage ?? 0} damage`;
      case 'APPLY_STATUS':
        const statusApplied = entry.result.statusApplied;
        return `${actorName} applies ${statusApplied?.stacks ?? 0} ${statusApplied?.type ?? 'status'}`;
      case 'REMOVE_STATUS':
        const statusRemoved = entry.result.statusRemoved;
        return `${statusRemoved?.type ?? 'Status'} decayed by ${statusRemoved?.stacks ?? 0}`;
      case 'TRIGGER_TRAIT':
        return `${entry.result.effectName ?? 'Effect'} triggered`;
      case 'HEAL':
        return `${actorName} heals for ${entry.result.healing ?? 0}`;
      default:
        return `${actorName}: ${entry.action}`;
    }
  };

  return (
    <ScrollView style={styles.logScroll}>
      {recentEntries.map((entry, index) => (
        <Text
          key={`${entry.turn}-${index}`}
          style={styles.logEntry}
        >
          [{entry.turn}] {formatEntry(entry)}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#888888',
  },
  sidePanel: {
    flex: 1,
    backgroundColor: '#151518',
    borderColor: '#2a2a30',
    borderWidth: 1,
    padding: 12,
  },
  arenaArea: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  logContainer: {
    width: '100%',
    maxHeight: 80,
    marginTop: 12,
    backgroundColor: '#151518',
    borderRadius: 8,
    padding: 8,
  },
  logScroll: {
    flex: 1,
  },
  logEntry: {
    fontSize: 10,
    color: '#888888',
    marginVertical: 2,
  },
  panelContent: {
    flex: 1,
  },
  panelHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  panelEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  panelName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  hpBarContainer: {
    marginBottom: 12,
  },
  hpBarBackground: {
    height: 12,
    backgroundColor: '#2a2a3a',
    borderRadius: 6,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  hpText: {
    fontSize: 10,
    color: '#888888',
    textAlign: 'center',
    marginTop: 4,
  },
  statsContainer: {
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  statIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  statLabel: {
    fontSize: 10,
    color: '#888888',
    flex: 1,
  },
  statValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  statusContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: '#1a1a2e',
  },
  statusEmoji: {
    fontSize: 12,
    marginRight: 2,
  },
  statusStacks: {
    fontSize: 10,
    fontWeight: 'bold',
  },
});
