import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Typography } from '@/theme/typography';
import { useAudio } from '@/contexts/AudioContext';

interface QuestCardProps {
  objectiveText: string;
  questType: string;
  progress: number;
  target: number;
  rewardText: string;
  isCompleted: boolean;
  isClaimed: boolean;
  isAccepted: boolean;
  onAccept?: () => void;
  onClaim?: () => void;
  disabled?: boolean;
  isCompact?: boolean;
}

const QUEST_TYPE_COLORS: Record<string, string> = {
  Daily: '#3B82F6',
  Weekly: '#8B5CF6',
  Seasonal: '#F59E0B',
};

export function QuestCard({
  objectiveText,
  questType,
  progress,
  target,
  rewardText,
  isCompleted,
  isClaimed,
  isAccepted,
  onAccept,
  onClaim,
  disabled,
  isCompact,
}: QuestCardProps) {
  const { playSfx } = useAudio();
  const progressPercent = target > 0 ? Math.min((progress / target) * 100, 100) : 0;
  const typeColor = QUEST_TYPE_COLORS[questType] ?? '#6B7280';

  return (
    <View style={[styles.container, isCompact && compactStyles.container]}>
      {/* Header: type badge + objective */}
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
          <Text style={[styles.typeText, isCompact && compactStyles.typeText]}>{questType}</Text>
        </View>
        <Text style={[styles.objective, isCompact && compactStyles.objective]} numberOfLines={2}>
          {objectiveText}
        </Text>
      </View>

      {/* Progress bar */}
      {isAccepted && !isClaimed && (
        <View style={styles.progressSection}>
          <View style={[styles.progressBar, isCompact && compactStyles.progressBar]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPercent}%` },
                isCompleted && styles.progressFillComplete,
              ]}
            />
          </View>
          <Text style={[styles.progressText, isCompact && compactStyles.progressText]}>
            {progress}/{target}
          </Text>
        </View>
      )}

      {/* Reward + action */}
      <View style={styles.footer}>
        <Text style={[styles.rewardText, isCompact && compactStyles.rewardText]}>{rewardText}</Text>

        {isClaimed ? (
          <Text style={[styles.claimedText, isCompact && compactStyles.claimedText]}>Claimed</Text>
        ) : isCompleted && isAccepted ? (
          <TouchableOpacity
            style={[styles.claimButton, isCompact && compactStyles.claimButton]}
            onPress={() => {
              playSfx('ui_click');
              onClaim?.();
            }}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.claimButtonText, isCompact && compactStyles.claimButtonText]}>
              Claim
            </Text>
          </TouchableOpacity>
        ) : isAccepted ? (
          <Text style={[styles.inProgressText, isCompact && compactStyles.inProgressText]}>
            In Progress
          </Text>
        ) : (
          <TouchableOpacity
            style={[styles.acceptButton, isCompact && compactStyles.acceptButton]}
            onPress={() => {
              playSfx('ui_click');
              onAccept?.();
            }}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text style={[styles.acceptButtonText, isCompact && compactStyles.acceptButtonText]}>
              Accept
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(92, 64, 51, 0.2)',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontFamily: Typography.stat,
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  objective: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: '#3d2b1f',
    flex: 1,
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(92, 64, 51, 0.15)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  progressFillComplete: {
    backgroundColor: '#10B981',
  },
  progressText: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#5c4033',
    minWidth: 40,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardText: {
    fontFamily: Typography.stat,
    fontSize: 11,
    color: '#5c4033',
  },
  claimedText: {
    fontFamily: Typography.stat,
    fontSize: 11,
    color: '#10B981',
    fontWeight: 'bold',
  },
  inProgressText: {
    fontFamily: Typography.stat,
    fontSize: 11,
    color: '#8a7a6a',
  },
  acceptButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  acceptButtonText: {
    fontFamily: Typography.button,
    fontSize: 11,
    color: '#ffffff',
  },
  claimButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  claimButtonText: {
    fontFamily: Typography.button,
    fontSize: 11,
    color: '#ffffff',
  },
});

const compactStyles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 14,
  },
  typeText: {
    fontSize: 18,
  },
  objective: {
    fontSize: 24,
  },
  progressBar: {
    height: 14,
  },
  progressText: {
    fontSize: 20,
  },
  rewardText: {
    fontSize: 20,
  },
  claimedText: {
    fontSize: 20,
  },
  inProgressText: {
    fontSize: 20,
  },
  acceptButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  acceptButtonText: {
    fontSize: 20,
  },
  claimButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  claimButtonText: {
    fontSize: 20,
  },
});
