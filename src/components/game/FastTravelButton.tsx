import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface FastTravelButtonProps {
  available: boolean;
  waypointCount: number;
  onPress: () => void;
}

export function FastTravelButton({
  available,
  waypointCount,
  onPress,
}: FastTravelButtonProps) {
  const countLabel = useMemo(() => {
    if (available) {
      return `${waypointCount}`;
    }
    return `${waypointCount}/2`;
  }, [available, waypointCount]);

  return (
    <TouchableOpacity
      style={[styles.button, available ? styles.buttonActive : styles.buttonDisabled]}
      onPress={onPress}
      disabled={!available}
      activeOpacity={0.8}
    >
      <Text style={[styles.emoji, !available && styles.emojiDisabled]}>🚃</Text>
      <View style={styles.textGroup}>
        <Text style={[styles.label, !available && styles.labelDisabled]}>Fast Travel</Text>
        <Text style={[styles.count, !available && styles.labelDisabled]}>{countLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  buttonActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22c55e',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(55, 65, 81, 0.4)',
    borderColor: '#4b5563',
  },
  emoji: {
    fontSize: 16,
  },
  emojiDisabled: {
    opacity: 0.5,
  },
  textGroup: {
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#e5e7eb',
    textTransform: 'uppercase',
  },
  labelDisabled: {
    color: '#9ca3af',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fefce8',
  },
});
