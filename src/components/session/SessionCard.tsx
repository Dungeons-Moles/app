/**
 * SessionCard - Individual session preview card
 * T061: Create SessionCard component in src/components/session/SessionCard.tsx (level, week, phase)
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Typography } from '../../theme/typography';
import { formatPhaseLabel } from '../../utils/phase-labels';
import type { ActiveSession } from '../../services/solana/sessionList';

interface SessionCardProps {
  /** The session to display */
  session: ActiveSession;
  /** Called when user wants to continue this session */
  onContinue: () => void;
  /** Called when user wants to abandon this session */
  onAbandon: () => void;
  /** Whether actions are disabled (e.g., during loading) */
  disabled?: boolean;
}

export function SessionCard({ session, onContinue, onAbandon, disabled = false }: SessionCardProps) {
  const phaseLabel = formatPhaseLabel(session.phase, session.week);

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelNumber}>{session.level}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.levelLabel}>Level {session.level}</Text>
          <Text style={styles.weekLabel}>Week {session.week}</Text>
        </View>
      </View>

      {/* Status info */}
      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Phase</Text>
          <Text style={styles.statusValue}>{phaseLabel}</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Moves Left</Text>
          <Text style={styles.statusValue}>{session.movesRemaining}</Text>
        </View>
      </View>

      {/* Position info */}
      <View style={styles.positionRow}>
        <Text style={styles.positionText}>
          Position: ({session.positionX}, {session.positionY})
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, styles.abandonButton, disabled && styles.buttonDisabled]}
          onPress={onAbandon}
          disabled={disabled}
        >
          <Text style={styles.abandonButtonText}>Abandon</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.continueButton, disabled && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={disabled}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(40, 50, 60, 0.95)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#445566',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  levelBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4488AA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#66AACC',
  },
  levelNumber: {
    fontFamily: Typography.number,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerInfo: {
    flex: 1,
  },
  levelLabel: {
    fontFamily: Typography.header,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  weekLabel: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: '#AAAAAA',
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statusItem: {
    flex: 1,
  },
  statusLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#888888',
    marginBottom: 2,
  },
  statusValue: {
    fontFamily: Typography.number,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  positionRow: {
    marginBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333344',
  },
  positionText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#666666',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  abandonButton: {
    backgroundColor: 'rgba(100, 60, 60, 0.8)',
    borderWidth: 1,
    borderColor: '#884444',
  },
  continueButton: {
    backgroundColor: '#448844',
    borderWidth: 1,
    borderColor: '#66AA66',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  abandonButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFAAAA',
  },
  continueButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
