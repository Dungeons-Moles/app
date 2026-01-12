/**
 * TopBar Component (T068-T070)
 * Displays week progress timeline and boss preview
 * @see specs/001-pve-dungeon-crawler/spec.md - User Story 3, FR-046
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import type { TimeState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import { getBoss, type BossDefinition } from '../../data/bosses';
import { getWeekProgress } from '../../game/time/progression';

// ============================================================================
// Component Props
// ============================================================================

interface TopBarProps {
  time: TimeState;
  overviewActive: boolean;
  onToggleOverview: () => void;
}

// ============================================================================
// TopBar Component
// ============================================================================

/**
 * TopBar - Displays week progress and boss preview
 * Shows current Day/Night cycle progress and the week's boss
 */
export function TopBar({ time, overviewActive, onToggleOverview }: TopBarProps) {
  const [showBossTooltip, setShowBossTooltip] = useState(false);
  const boss = getBoss(time.weekBoss);
  const progress = getWeekProgress(time);

  const handleBossPress = useCallback(() => setShowBossTooltip(true), []);
  const handleTooltipClose = useCallback(() => setShowBossTooltip(false), []);

  return (
    <View style={styles.container}>
      <View style={styles.leftCluster}>
        <Pressable
          style={[styles.mapToggle, overviewActive && styles.mapToggleActive]}
          onPress={onToggleOverview}
          accessibilityLabel="Toggle map overview"
          accessibilityRole="button"
        >
          <Text style={styles.mapToggleIcon}>🗺️</Text>
        </Pressable>

        {/* Week Progress Timeline (T069) - Left side */}
        <WeekProgressTimeline time={time} progress={progress} />
      </View>

      {/* Boss Preview (T070) - Right side */}
      <BossPreview
        boss={boss}
        onPress={handleBossPress}
      />

      {/* Boss Tooltip Modal */}
      <BossTooltipModal
        visible={showBossTooltip}
        boss={boss}
        onClose={handleTooltipClose}
      />
    </View>
  );
}

// ============================================================================
// Week Progress Timeline (T069)
// ============================================================================

// Constants for tick calculation
const DAY_TICKS = 10;   // 50 moves / 5 moves per tick
const NIGHT_TICKS = 6;  // 30 moves / 5 moves per tick
const TOTAL_TICKS = 3 * (DAY_TICKS + NIGHT_TICKS); // 48 ticks total
const MOVES_PER_TICK = 5;

interface WeekProgressTimelineProps {
  time: TimeState;
  progress: number;
}

function WeekProgressTimeline({ time }: WeekProgressTimelineProps) {
  // Calculate which tick we're on (0-indexed position across all ticks)
  const currentTickPosition = useMemo(() => {
    const ticksPerCycle = DAY_TICKS + NIGHT_TICKS; // 16 ticks per cycle

    if (time.phase === TimePhase.Boss) {
      // At the boss (end of timeline)
      return TOTAL_TICKS;
    }

    // Completed cycles before current one
    const completedCycles = time.cycle - 1;
    let position = completedCycles * ticksPerCycle;

    if (time.phase === TimePhase.Day) {
      // In day phase: calculate how many day ticks we've consumed
      const movesUsed = 50 - time.movesRemaining;
      const ticksUsed = Math.floor(movesUsed / MOVES_PER_TICK);
      position += ticksUsed;
    } else if (time.phase === TimePhase.Night) {
      // In night phase: all day ticks + night ticks consumed
      position += DAY_TICKS;
      const movesUsed = 30 - time.movesRemaining;
      const ticksUsed = Math.floor(movesUsed / MOVES_PER_TICK);
      position += ticksUsed;
    }

    return position;
  }, [time]);

  // Build the timeline structure (without boss)
  const timelineSegments = useMemo(() => {
    const segments: Array<{
      type: 'day' | 'night';
      cycle: number;
      ticks: number;
      startTick: number;
    }> = [];

    let tickIndex = 0;
    for (let cycle = 1; cycle <= 3; cycle++) {
      segments.push({ type: 'day', cycle, ticks: DAY_TICKS, startTick: tickIndex });
      tickIndex += DAY_TICKS;
      segments.push({ type: 'night', cycle, ticks: NIGHT_TICKS, startTick: tickIndex });
      tickIndex += NIGHT_TICKS;
    }

    return segments;
  }, []);

  return (
    <View style={styles.timelineContainer}>
      {/* Week indicator */}
      <Text style={styles.weekText}>Week {time.week}</Text>

      {/* Tick marks progress bar with icons above each segment */}
      <View style={styles.tickBarContainer}>
        {/* Icons row - each icon centered above its segment */}
        <View style={styles.iconsRow}>
          {timelineSegments.map((segment, index) => {
            const isActive = segment.type === 'day'
              ? time.phase === TimePhase.Day && time.cycle === segment.cycle
              : time.phase === TimePhase.Night && time.cycle === segment.cycle;

            const isCompleted = segment.type === 'day'
              ? time.cycle > segment.cycle ||
                (time.cycle === segment.cycle && time.phase !== TimePhase.Day) ||
                time.phase === TimePhase.Boss
              : time.cycle > segment.cycle || time.phase === TimePhase.Boss;

            const icon = segment.type === 'day' ? '☀️' : '🌙';

            const iconStyle = isActive
              ? styles.iconActive
              : isCompleted
                ? styles.iconCompleted
                : styles.iconPending;

            // Each icon container is sized proportionally to its tick count
            return (
              <View
                key={index}
                style={[styles.iconContainer, { flex: segment.ticks }]}
              >
                <Text style={[styles.phaseIcon, iconStyle]}>
                  {icon}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Tick marks bar with marker below */}
        <View style={styles.tickBarWrapper}>
          <View style={styles.tickBarBackground}>
            {/* Render all ticks with equal spacing */}
            {timelineSegments.map((segment) => (
              Array.from({ length: segment.ticks }).map((_, tickIdx) => {
                const globalTick = segment.startTick + tickIdx;
                const isConsumed = globalTick < currentTickPosition;

                return (
                  <View
                    key={globalTick}
                    style={[
                      styles.tick,
                      segment.type === 'day' ? styles.tickDay : styles.tickNight,
                      isConsumed && styles.tickConsumed,
                    ]}
                  />
                );
              })
            )).flat()}
          </View>

          {/* Marker row - same padding as tick bar for alignment */}
          <View style={styles.markerRow}>
            <View
              style={[
                styles.positionMarker,
                {
                  // With space-between: first tick at 0%, last at 100%
                  // Tick n is at n/(TOTAL_TICKS-1) * 100%
                  left: `${(currentTickPosition / (TOTAL_TICKS - 1)) * 100}%`,
                }
              ]}
            >
              <Text style={styles.markerTriangle}>▲</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}


// ============================================================================
// Boss Preview (T070)
// ============================================================================

interface BossPreviewProps {
  boss: BossDefinition;
  onPress: () => void;
}

function BossPreview({ boss, onPress }: BossPreviewProps) {
  return (
    <Pressable
      style={styles.bossPreview}
      onPress={onPress}
      accessibilityLabel={`View ${boss.name} details`}
      accessibilityRole="button"
    >
      <Text style={styles.bossEmoji}>{boss.emoji}</Text>
      <View style={styles.bossInfo}>
        <Text style={styles.bossName} numberOfLines={1}>
          {boss.name}
        </Text>
        <Text style={styles.bossSubtext}>Tap for details</Text>
      </View>
    </Pressable>
  );
}

// ============================================================================
// Boss Tooltip Modal
// ============================================================================

interface BossTooltipModalProps {
  visible: boolean;
  boss: BossDefinition;
  onClose: () => void;
}

function BossTooltipModal({ visible, boss, onClose }: BossTooltipModalProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <View style={styles.tooltipContainer}>
          {/* Header */}
          <View style={styles.tooltipHeader}>
            <Text style={styles.tooltipEmoji}>{boss.emoji}</Text>
            <Text style={styles.tooltipName}>{boss.name}</Text>
          </View>

          {/* Stats */}
          <View style={styles.statsGrid}>
            <StatBox label="HP" value={boss.stats.hp} color="#ef4444" />
            <StatBox label="ATK" value={boss.stats.atk} color="#f59e0b" />
            <StatBox label="ARM" value={boss.stats.arm} color="#3b82f6" />
            <StatBox label="SPD" value={boss.stats.spd} color="#10b981" />
          </View>

          {/* Trait */}
          <View style={styles.traitSection}>
            <Text style={styles.traitName}>{boss.trait.name}</Text>
            <Text style={styles.traitDescription}>{boss.trait.description}</Text>
          </View>

          {/* Close hint */}
          <Text style={styles.closeHint}>Tap anywhere to close</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

// ============================================================================
// Stat Box Component
// ============================================================================

interface StatBoxProps {
  label: string;
  value: number;
  color: string;
}

function StatBox({ label, value, color }: StatBoxProps) {
  return (
    <View style={[styles.statBox, { borderColor: color }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f0f14',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a30',
  },
  leftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  mapToggle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a22',
    borderWidth: 1,
    borderColor: '#2a2a35',
    marginRight: 10,
  },
  mapToggleActive: {
    backgroundColor: '#1f2a37',
    borderColor: '#60a5fa',
  },
  mapToggleIcon: {
    fontSize: 16,
  },

  // Timeline styles
  timelineContainer: {
    flex: 1,
  },
  weekText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 2,
  },
  tickBarContainer: {
    marginTop: 2,
  },
  iconsRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseIcon: {
    fontSize: 12,
  },
  iconActive: {
    opacity: 1,
  },
  iconCompleted: {
    opacity: 0.4,
  },
  iconPending: {
    opacity: 0.6,
  },
  tickBarWrapper: {
    // Wrapper to contain tick bar and marker row
  },
  tickBarBackground: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 8,
    backgroundColor: '#1a1a22',
    borderRadius: 2,
    paddingHorizontal: 4,
  },
  tick: {
    width: 2,
    height: 6,
    borderRadius: 1,
  },
  tickDay: {
    backgroundColor: '#f59e0b',
  },
  tickNight: {
    backgroundColor: '#6366f1',
  },
  tickConsumed: {
    backgroundColor: '#4b5563',
  },
  markerRow: {
    position: 'relative',
    height: 12,
    marginHorizontal: 4, // Match tick bar padding
  },
  positionMarker: {
    position: 'absolute',
    top: 0,
    marginLeft: -6, // Center the triangle on the tick
  },
  markerTriangle: {
    fontSize: 10,
    color: '#e5e5e5',
  },

  // Boss preview styles
  bossPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a22',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  bossEmoji: {
    fontSize: 24,
    marginRight: 8,
  },
  bossInfo: {
    alignItems: 'flex-start',
  },
  bossName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e5e5e5',
    maxWidth: 80,
  },
  bossSubtext: {
    fontSize: 9,
    color: '#6b7280',
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipContainer: {
    backgroundColor: '#1a1a22',
    borderRadius: 12,
    padding: 16,
    width: 280,
    borderWidth: 1,
    borderColor: '#3a3a45',
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tooltipEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  tooltipName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statBox: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 50,
    backgroundColor: '#0f0f14',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 2,
  },

  // Trait section
  traitSection: {
    backgroundColor: '#0f0f14',
    padding: 10,
    borderRadius: 6,
    marginBottom: 12,
  },
  traitName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 4,
  },
  traitDescription: {
    fontSize: 11,
    color: '#d1d5db',
    lineHeight: 16,
  },

  // Close hint
  closeHint: {
    textAlign: 'center',
    fontSize: 10,
    color: '#4b5563',
    marginTop: 8,
  },
});

export default TopBar;
