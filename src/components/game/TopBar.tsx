/**
 * TopBar Component (T068-T070)
 * Displays week progress timeline and boss preview
 * @see specs/001-pve-dungeon-crawler/spec.md - User Story 3, FR-046
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import type { TimeState } from '../../game/engine/types';
import { TimePhase } from '../../game/engine/types';
import { getBoss, type BossDefinition } from '../../data/bosses';
import { getWeekProgress, getTimeDescription } from '../../game/time/progression';

// ============================================================================
// Component Props
// ============================================================================

interface TopBarProps {
  time: TimeState;
}

// ============================================================================
// TopBar Component
// ============================================================================

/**
 * TopBar - Displays week progress and boss preview
 * Shows current Day/Night cycle progress and the week's boss
 */
export function TopBar({ time }: TopBarProps) {
  const [showBossTooltip, setShowBossTooltip] = useState(false);
  const boss = getBoss(time.weekBoss);
  const progress = getWeekProgress(time);

  return (
    <View style={styles.container}>
      {/* Week Progress Timeline (T069) */}
      <WeekProgressTimeline time={time} progress={progress} />

      {/* Boss Preview (T070) */}
      <BossPreview
        boss={boss}
        onPress={() => setShowBossTooltip(true)}
      />

      {/* Boss Tooltip Modal */}
      <BossTooltipModal
        visible={showBossTooltip}
        boss={boss}
        onClose={() => setShowBossTooltip(false)}
      />
    </View>
  );
}

// ============================================================================
// Week Progress Timeline (T069)
// ============================================================================

interface WeekProgressTimelineProps {
  time: TimeState;
  progress: number;
}

function WeekProgressTimeline({ time, progress }: WeekProgressTimelineProps) {
  return (
    <View style={styles.timelineContainer}>
      {/* Week indicator */}
      <Text style={styles.weekText}>Week {time.week}</Text>

      {/* Phase indicators */}
      <View style={styles.phasesRow}>
        {[1, 2, 3].map(cycle => (
          <React.Fragment key={cycle}>
            {/* Day indicator */}
            <PhaseIndicator
              label={`D${cycle}`}
              isActive={time.phase === TimePhase.Day && time.cycle === cycle}
              isCompleted={
                time.cycle > cycle ||
                (time.cycle === cycle && time.phase !== TimePhase.Day) ||
                time.phase === TimePhase.Boss
              }
              isDay={true}
            />
            {/* Night indicator */}
            <PhaseIndicator
              label={`N${cycle}`}
              isActive={time.phase === TimePhase.Night && time.cycle === cycle}
              isCompleted={
                time.cycle > cycle ||
                (time.cycle === cycle && time.phase === TimePhase.Boss) ||
                (time.phase === TimePhase.Boss)
              }
              isDay={false}
            />
          </React.Fragment>
        ))}
        {/* Boss indicator */}
        <PhaseIndicator
          label="BOSS"
          isActive={time.phase === TimePhase.Boss}
          isCompleted={false}
          isDay={true}
          isBoss={true}
        />
      </View>

      {/* Move counter */}
      {time.phase !== TimePhase.Boss && (
        <Text style={styles.movesText}>
          {time.movesRemaining} moves left
        </Text>
      )}

      {/* Progress bar */}
      <View style={styles.progressBarBackground}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

// ============================================================================
// Phase Indicator
// ============================================================================

interface PhaseIndicatorProps {
  label: string;
  isActive: boolean;
  isCompleted: boolean;
  isDay: boolean;
  isBoss?: boolean;
}

function PhaseIndicator({
  label,
  isActive,
  isCompleted,
  isDay,
  isBoss = false,
}: PhaseIndicatorProps) {
  const getBackgroundColor = () => {
    if (isActive) return isBoss ? '#dc2626' : isDay ? '#f59e0b' : '#3b82f6';
    if (isCompleted) return '#374151';
    return '#1f2937';
  };

  const getTextColor = () => {
    if (isActive) return '#ffffff';
    if (isCompleted) return '#6b7280';
    return '#9ca3af';
  };

  return (
    <View
      style={[
        styles.phaseIndicator,
        { backgroundColor: getBackgroundColor() },
        isActive && styles.phaseIndicatorActive,
      ]}
    >
      <Text style={[styles.phaseLabel, { color: getTextColor() }]}>
        {label}
      </Text>
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

          {/* Test Info */}
          <View style={styles.testInfoSection}>
            <Text style={styles.testInfoLabel}>What it tests:</Text>
            <Text style={styles.testInfoText}>{boss.testInfo.whatItTests}</Text>

            <Text style={styles.testInfoLabel}>Intended counters:</Text>
            <View style={styles.countersList}>
              {boss.testInfo.intendedCounters.map((counter, idx) => (
                <Text key={idx} style={styles.counterItem}>
                  • {counter}
                </Text>
              ))}
            </View>
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

  // Timeline styles
  timelineContainer: {
    flex: 1,
    marginRight: 12,
  },
  weekText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 4,
  },
  phasesRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 4,
  },
  phaseIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  phaseIndicatorActive: {
    borderWidth: 1,
    borderColor: '#ffffff40',
  },
  phaseLabel: {
    fontSize: 9,
    fontWeight: '600',
  },
  movesText: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 2,
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 2,
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

  // Test info section
  testInfoSection: {
    marginBottom: 8,
  },
  testInfoLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 8,
    marginBottom: 2,
  },
  testInfoText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  countersList: {
    marginTop: 4,
  },
  counterItem: {
    fontSize: 10,
    color: '#10b981',
    marginLeft: 4,
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
