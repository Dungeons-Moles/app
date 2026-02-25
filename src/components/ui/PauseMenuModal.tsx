/**
 * PauseMenuModal - In-game pause menu opened with the Start button.
 * Uses the same paper-panel background as POI modals.
 * Supports controller navigation (D-Pad Up/Down, A to select, B to close).
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from './ControllerHints';
import { FocusGlow } from './FocusGlow';
import { Typography } from '../../theme/typography';
import { useAudio } from '../../contexts/AudioContext';
import { VolumeControls } from './VolumeControls';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.png');

export interface PauseMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onReturnToHub: () => void;
  onAbandonSession?: () => void;
  isAbandoning?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  onPress: () => void;
  loading?: boolean;
  danger?: boolean;
}

export function PauseMenuModal({
  visible,
  onClose,
  onReturnToHub,
  onAbandonSession,
  isAbandoning = false,
}: PauseMenuModalProps) {
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const { musicVolume, setMusicVolume, sfxVolume, setSfxVolume, playSfx } = useAudio();
  const [focusIndex, setFocusIndex] = useState(0);

  // Build menu items dynamically
  const menuItems: MenuItem[] = [];

  menuItems.push({
    id: 'hub',
    label: 'Return to Hub',
    onPress: onReturnToHub,
  });

  if (onAbandonSession) {
    menuItems.push({
      id: 'abandon',
      label: 'Abandon Session',
      onPress: onAbandonSession,
      loading: isAbandoning,
      danger: true,
    });
  }

  // Reset focus when opening
  useEffect(() => {
    if (visible) setFocusIndex(0);
  }, [visible]);

  // Clamp focus index if items change
  const totalItems = menuItems.length + 2; // 2 volume controls
  useEffect(() => {
    if (focusIndex >= totalItems) {
      setFocusIndex(Math.max(0, totalItems - 1));
    }
  }, [totalItems, focusIndex]);

  const handleSelect = useCallback(() => {
    // Menu items start at focusIndex 2
    if (focusIndex >= 2) {
      const item = menuItems[focusIndex - 2];
      if (item && !item.loading) {
        playSfx('ui_click');
        item.onPress();
      }
    }
  }, [focusIndex, menuItems, playSfx]);

  useControllerAction(
    {
      onDPadUp: () => setFocusIndex((i) => Math.max(0, i - 1)),
      onDPadDown: () => setFocusIndex((i) => Math.min(totalItems - 1, i + 1)),
      onDPadLeft:
        focusIndex === 0
          ? () => setMusicVolume(Math.round(Math.max(0, musicVolume - 0.1) * 10) / 10)
          : focusIndex === 1
            ? () => setSfxVolume(Math.round(Math.max(0, sfxVolume - 0.1) * 10) / 10)
            : undefined,
      onDPadRight:
        focusIndex === 0
          ? () => setMusicVolume(Math.round(Math.min(1, musicVolume + 0.1) * 10) / 10)
          : focusIndex === 1
            ? () => setSfxVolume(Math.round(Math.min(1, sfxVolume + 0.1) * 10) / 10)
            : undefined,
      onA: handleSelect,
      onB: () => {
        playSfx('ui_click');
        onClose();
      },
    },
    isController && visible
  );

  if (!visible) return null;

  const controllerHints: ButtonHint[] = [
    { button: 'A', label: 'Select' },
    { button: 'B', label: 'Resume' },
  ];

  return (
    <View style={styles.overlay}>
      <View style={styles.scaleWrapper}>
        <View style={styles.container}>
          <Image source={paperPanelSource} style={styles.paperBg} resizeMode="stretch" />
          <View style={styles.content}>
            <Text style={styles.title}>PAUSED</Text>

            <View style={styles.volumeSection}>
              <FocusGlow active={isController && focusIndex === 0}>
                <View style={styles.volumeRow}>
                  <Text style={styles.volumeLabel}>Music</Text>
                  <VolumeControls
                    currentVolume={musicVolume}
                    onVolumeChange={setMusicVolume}
                    scale={0.8}
                  />
                </View>
              </FocusGlow>
              <FocusGlow active={isController && focusIndex === 1}>
                <View style={styles.volumeRow}>
                  <Text style={styles.volumeLabel}>SFX</Text>
                  <VolumeControls
                    currentVolume={sfxVolume}
                    onVolumeChange={setSfxVolume}
                    scale={0.8}
                  />
                </View>
              </FocusGlow>
            </View>

            <View style={styles.menuList}>
              {menuItems.map((item, index) => (
                <FocusGlow key={item.id} active={isController && focusIndex === index + 2}>
                  <TouchableOpacity
                    style={[styles.menuButton, item.danger && styles.menuButtonDanger]}
                    onPress={item.onPress}
                    disabled={item.loading}
                    activeOpacity={0.7}
                  >
                    {item.loading ? (
                      <ActivityIndicator size="small" color="#5c4033" />
                    ) : (
                      <Text
                        style={[styles.menuButtonText, item.danger && styles.menuButtonTextDanger]}
                      >
                        {item.label}
                      </Text>
                    )}
                  </TouchableOpacity>
                </FocusGlow>
              ))}
            </View>

            {!isController && (
              <TouchableOpacity
                style={styles.resumeButton}
                onPress={() => {
                  playSfx('ui_click');
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.resumeButtonText}>Resume</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
      {isController && <ControllerHints hints={controllerHints} horizontal />}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  scaleWrapper: {
    transform: [{ scale: 1.4 }],
  },
  container: {
    width: 220,
    alignItems: 'center',
  },
  paperBg: {
    position: 'absolute',
    width: '115%',
    height: '115%',
    top: '-7.5%',
    left: '-7.5%',
    zIndex: -1,
  },
  content: {
    padding: 16,
    paddingTop: 20,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#3d2b1f',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  volumeSection: {
    width: '100%',
    marginBottom: 16,
    gap: 8,
  },
  volumeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  volumeLabel: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#3d2b1f',
  },
  menuList: {
    width: '100%',
    gap: 10,
  },
  menuButton: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(92, 64, 51, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c8b99a',
    alignItems: 'center',
  },
  menuButtonDanger: {
    borderColor: '#a94442',
    backgroundColor: 'rgba(169, 68, 66, 0.1)',
  },
  menuButtonText: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#3d2b1f',
    letterSpacing: 0.3,
  },
  menuButtonTextDanger: {
    color: '#a94442',
  },
  resumeButton: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 20,
  },
  resumeButtonText: {
    fontFamily: Typography.header,
    fontSize: 11,
    color: '#8b7355',
    letterSpacing: 0.3,
  },
});
