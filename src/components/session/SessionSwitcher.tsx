/**
 * SessionSwitcher - Quick session switch dropdown/selector
 * T062: Create SessionSwitcher component in src/components/session/SessionSwitcher.tsx (quick switch)
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { Typography } from '../../theme/typography';
import { formatPhaseLabel } from '../../utils/phase-labels';
import { useAudio } from '../../contexts/AudioContext';

interface SessionSummary {
  sessionPda: string;
  level: number;
  week: number;
  phase: number;
}

interface SessionSwitcherProps {
  /** Currently active level */
  currentLevel: number;
  /** List of active sessions */
  activeSessions: SessionSummary[];
  /** Called when user selects a different session */
  onSwitch: (sessionPda: string) => void;
  /** Whether switching is disabled */
  disabled?: boolean;
}

export function SessionSwitcher({
  currentLevel,
  activeSessions,
  onSwitch,
  disabled = false,
}: SessionSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { playSfx } = useAudio();

  const otherSessions = activeSessions.filter((s) => s.level !== currentLevel);

  if (otherSessions.length === 0) {
    return null; // No other sessions to switch to
  }

  const handleSelect = (sessionPda: string) => {
    playSfx('ui_click');
    setIsOpen(false);
    onSwitch(sessionPda);
  };

  return (
    <View style={styles.container}>
      {/* Current session badge */}
      <Pressable
        style={[styles.currentBadge, disabled && styles.disabled]}
        onPress={() => {
          if (!disabled) {
            playSfx('ui_click');
            setIsOpen(true);
          }
        }}
        disabled={disabled}
      >
        <Text style={styles.currentLabel}>Level</Text>
        <Text style={styles.currentLevel}>{currentLevel}</Text>
        <Text style={styles.switchIcon}>⇅</Text>
      </Pressable>

      {/* Session selector modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Switch Session</Text>

            <ScrollView style={styles.sessionList}>
              {/* Current session (highlighted) */}
              <View style={[styles.sessionItem, styles.currentSession]}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionLevel}>Level {currentLevel}</Text>
                  <Text style={styles.sessionStatus}>Current</Text>
                </View>
              </View>

              {/* Other sessions */}
              {otherSessions.map((session) => (
                <Pressable
                  key={session.sessionPda}
                  style={styles.sessionItem}
                  onPress={() => handleSelect(session.sessionPda)}
                >
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionLevel}>Level {session.level}</Text>
                    <Text style={styles.sessionPhase}>
                      Week {session.week} - {formatPhaseLabel(session.phase, session.week)}
                    </Text>
                  </View>
                  <Text style={styles.switchArrow}>→</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              style={styles.closeButton}
              onPress={() => {
                playSfx('ui_click');
                setIsOpen(false);
              }}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(60, 80, 100, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#556677',
    gap: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  currentLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#888888',
  },
  currentLevel: {
    fontFamily: Typography.number,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  switchIcon: {
    fontSize: 14,
    color: '#88AACC',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(30, 40, 50, 0.98)',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 320,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#445566',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  sessionList: {
    maxHeight: 300,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(50, 60, 70, 0.8)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#445566',
  },
  currentSession: {
    backgroundColor: 'rgba(68, 136, 68, 0.3)',
    borderColor: '#448844',
  },
  sessionInfo: {
    flex: 1,
  },
  sessionLevel: {
    fontFamily: Typography.header,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  sessionPhase: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 2,
  },
  sessionStatus: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#88CC88',
    marginTop: 2,
  },
  switchArrow: {
    fontSize: 18,
    color: '#88AACC',
  },
  closeButton: {
    backgroundColor: 'rgba(80, 80, 80, 0.8)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#CCCCCC',
  },
});
