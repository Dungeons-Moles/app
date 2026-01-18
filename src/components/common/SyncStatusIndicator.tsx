/**
 * SyncStatusIndicator Component
 *
 * Displays the current synchronization status between local and on-chain state.
 * Shows synced, syncing, offline, or error states with appropriate visual feedback.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

// ============================================================================
// Types
// ============================================================================

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

interface SyncStatusIndicatorProps {
  /** Current sync status */
  status: SyncStatus;
  /** Optional custom styles */
  style?: object;
  /** Whether to show the status text label */
  showLabel?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function SyncStatusIndicator({
  status,
  style,
  showLabel = true,
}: SyncStatusIndicatorProps): React.JSX.Element {
  const { color, label, showSpinner } = getStatusConfig(status);

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.indicator, { backgroundColor: color }]}>
        {showSpinner ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <View style={styles.dot} />
        )}
      </View>
      {showLabel && <Text style={[styles.label, { color }]}>{label}</Text>}
    </View>
  );
}

// ============================================================================
// Helpers
// ============================================================================

interface StatusConfig {
  color: string;
  label: string;
  showSpinner: boolean;
}

function getStatusConfig(status: SyncStatus): StatusConfig {
  switch (status) {
    case 'synced':
      return {
        color: '#22c55e', // green-500
        label: 'Synced',
        showSpinner: false,
      };
    case 'syncing':
      return {
        color: '#3b82f6', // blue-500
        label: 'Syncing',
        showSpinner: true,
      };
    case 'offline':
      return {
        color: '#f59e0b', // amber-500
        label: 'Offline',
        showSpinner: false,
      };
    case 'error':
      return {
        color: '#ef4444', // red-500
        label: 'Error',
        showSpinner: false,
      };
    default:
      return {
        color: '#6b7280', // gray-500
        label: 'Unknown',
        showSpinner: false,
      };
  }
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  indicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default SyncStatusIndicator;
