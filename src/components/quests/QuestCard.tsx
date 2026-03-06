import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageSourcePropType } from 'react-native';
import { Typography } from '@/theme/typography';
import { useAudio } from '@/contexts/AudioContext';
import { CachedImage as Image } from '@/components/common/CachedImage';

interface QuestCardProps {
  objectiveText: string;
  questType: string;
  progress: number;
  target: number;
  rewardText: string;
  rewardIcon?: ImageSourcePropType;
  isCompleted: boolean;
  isClaimed: boolean;
  isAccepted: boolean;
  onAccept?: () => void;
  onClaim?: () => void;
  disabled?: boolean;
  isCompact?: boolean;
}

const QUEST_TYPE_CONFIG: Record<string, { color: string; bgTint: string; icon: string }> = {
  Daily: { color: '#C67B30', bgTint: 'rgba(198, 123, 48, 0.08)', icon: '☀' },
  Weekly: { color: '#7B5EA7', bgTint: 'rgba(123, 94, 167, 0.08)', icon: '⏳' },
  Seasonal: { color: '#B8860B', bgTint: 'rgba(184, 134, 11, 0.08)', icon: '★' },
};

export function QuestCard({
  objectiveText,
  questType,
  progress,
  target,
  rewardText,
  rewardIcon,
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
  const config = QUEST_TYPE_CONFIG[questType] ?? QUEST_TYPE_CONFIG.Daily;

  return (
    <View
      style={[
        styles.container,
        isCompact && compactStyles.container,
        { borderLeftColor: config.color, backgroundColor: config.bgTint },
        isClaimed && styles.containerClaimed,
      ]}
    >
      {/* Top row: type badge + objective */}
      <View style={styles.topRow}>
        <View style={[styles.typeBadge, { backgroundColor: config.color }]}>
          <Text style={[styles.typeIcon, isCompact && compactStyles.typeIcon]}>
            {config.icon}
          </Text>
          <Text style={[styles.typeText, isCompact && compactStyles.typeText]}>{questType}</Text>
        </View>
        {isClaimed && (
          <View style={styles.claimedBadge}>
            <Text style={[styles.claimedBadgeText, isCompact && compactStyles.claimedBadgeText]}>
              ✓ CLAIMED
            </Text>
          </View>
        )}
      </View>

      {/* Objective text */}
      <Text
        style={[
          styles.objective,
          isCompact && compactStyles.objective,
          isClaimed && styles.objectiveClaimed,
        ]}
        numberOfLines={2}
      >
        {objectiveText}
      </Text>

      {/* Progress bar */}
      {isAccepted && !isClaimed && (
        <View style={styles.progressSection}>
          <View style={[styles.progressTrack, isCompact && compactStyles.progressTrack]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: isCompleted ? '#5A8F4A' : config.color,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, isCompact && compactStyles.progressText]}>
            {progress}/{target}
          </Text>
        </View>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Reward row */}
      <View style={styles.rewardRow}>
        <View style={styles.rewardInfo}>
          {rewardIcon && (
            <Image
              source={rewardIcon}
              style={[styles.rewardImage, isCompact && compactStyles.rewardImage]}
              resizeMode="contain"
            />
          )}
          <View style={styles.rewardTextContainer}>
            <Text style={[styles.rewardLabel, isCompact && compactStyles.rewardLabel]}>
              REWARD
            </Text>
            <Text
              style={[
                styles.rewardText,
                isCompact && compactStyles.rewardText,
                isClaimed && styles.rewardTextClaimed,
              ]}
              numberOfLines={1}
            >
              {rewardText}
            </Text>
          </View>
        </View>

        {/* Action */}
        {isClaimed ? null : isCompleted && isAccepted ? (
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
          <View style={[styles.inProgressBadge, isCompact && compactStyles.inProgressBadge]}>
            <Text
              style={[styles.inProgressText, isCompact && compactStyles.inProgressText]}
            >
              In Progress
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.acceptButton,
              isCompact && compactStyles.acceptButton,
              { borderColor: config.color },
            ]}
            onPress={() => {
              playSfx('ui_click');
              onAccept?.();
            }}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.acceptButtonText,
                isCompact && compactStyles.acceptButtonText,
                { color: config.color },
              ]}
            >
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
    borderRadius: 6,
    padding: 10,
    paddingLeft: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(92, 64, 51, 0.15)',
    borderLeftWidth: 3,
    width: '100%',
  },
  containerClaimed: {
    opacity: 0.55,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 3,
  },
  typeIcon: {
    fontSize: 9,
    color: '#ffffff',
  },
  typeText: {
    fontFamily: Typography.stat,
    fontSize: 9,
    color: '#ffffff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  claimedBadge: {
    backgroundColor: 'rgba(90, 143, 74, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
  },
  claimedBadgeText: {
    fontFamily: Typography.stat,
    fontSize: 8,
    color: '#5A8F4A',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  objective: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#3d2b1f',
    lineHeight: 18,
  },
  objectiveClaimed: {
    color: '#8a7a6a',
  },
  progressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(92, 64, 51, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontFamily: Typography.number,
    fontSize: 10,
    color: '#5c4033',
    minWidth: 30,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(92, 64, 51, 0.1)',
    marginVertical: 1,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rewardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rewardImage: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  rewardTextContainer: {
    flex: 1,
  },
  rewardLabel: {
    fontFamily: Typography.stat,
    fontSize: 7,
    color: '#8a7a6a',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  rewardText: {
    fontFamily: Typography.stat,
    fontSize: 11,
    color: '#3d2b1f',
  },
  rewardTextClaimed: {
    color: '#8a7a6a',
  },
  claimButton: {
    backgroundColor: '#5A8F4A',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4A7A3A',
  },
  claimButtonText: {
    fontFamily: Typography.button,
    fontSize: 11,
    color: '#ffffff',
  },
  acceptButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  acceptButtonText: {
    fontFamily: Typography.button,
    fontSize: 11,
  },
  inProgressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(92, 64, 51, 0.06)',
  },
  inProgressText: {
    fontFamily: Typography.stat,
    fontSize: 9,
    color: '#8a7a6a',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});

const compactStyles = StyleSheet.create({
  container: {
    padding: 18,
    paddingLeft: 22,
    gap: 10,
    borderLeftWidth: 5,
  },
  typeIcon: {
    fontSize: 16,
  },
  typeText: {
    fontSize: 16,
  },
  claimedBadgeText: {
    fontSize: 14,
  },
  objective: {
    fontSize: 22,
    lineHeight: 30,
  },
  progressTrack: {
    height: 10,
  },
  progressText: {
    fontSize: 18,
  },
  rewardImage: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  rewardLabel: {
    fontSize: 12,
  },
  rewardText: {
    fontSize: 18,
  },
  claimButton: {
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  claimButtonText: {
    fontSize: 20,
  },
  acceptButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 2,
  },
  acceptButtonText: {
    fontSize: 20,
  },
  inProgressBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inProgressText: {
    fontSize: 16,
  },
});
