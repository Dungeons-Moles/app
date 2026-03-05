/**
 * PauseMenuModal - In-game pause menu opened with the Start button.
 * Uses the same paper-panel background as POI modals.
 * Supports controller navigation (D-Pad Up/Down, A to select, B to close).
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from './ControllerHints';
import { FocusGlow } from './FocusGlow';
import { Typography } from '../../theme/typography';
import { useAudio } from '../../contexts/AudioContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { VolumeControls } from './VolumeControls';
import { Checkbox } from './Checkbox';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.webp');
const buttonV1Source = require('../../../assets/ui/buttons/button-v1.webp');
const buttonV2Source = require('../../../assets/ui/buttons/button-v2.webp');
const buttonV3Source = require('../../../assets/ui/buttons/button-v3.webp');

export interface PauseMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onReturnToHub: () => void;
  onAbandonSession?: () => void;
  isAbandoning?: boolean;
  onOpenTutorial?: () => void;
}

export function PauseMenuModal({
  visible,
  onClose,
  onReturnToHub,
  onAbandonSession,
  isAbandoning = false,
  onOpenTutorial,
}: PauseMenuModalProps) {
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isCompact = useScreenVariant() === 'compact';
  const { musicVolume, setMusicVolume, sfxVolume, setSfxVolume, playSfx } = useAudio();
  const { autoOpenPOI, setAutoOpenPOI } = useSettings();
  const [focusIndex, setFocusIndex] = useState(0);

  // focusIndex layout: 0=music, 1=sfx, 2=checkbox, 3=return to hub, 4=abandon (if present) | touch: tutorial shown above return to hub
  const totalItems = 3 + 1 + (onAbandonSession ? 1 : 0);

  // Reset focus when opening
  useEffect(() => {
    if (visible) setFocusIndex(0);
  }, [visible]);

  // Clamp focus index if items change
  useEffect(() => {
    if (focusIndex >= totalItems) {
      setFocusIndex(Math.max(0, totalItems - 1));
    }
  }, [totalItems, focusIndex]);

  const handleSelect = useCallback(() => {
    if (focusIndex === 2) {
      playSfx('ui_click');
      setAutoOpenPOI(!autoOpenPOI);
      return;
    }
    if (focusIndex === 3) {
      playSfx('ui_click');
      onReturnToHub();
      return;
    }
    if (focusIndex === 4 && onAbandonSession && !isAbandoning) {
      playSfx('ui_click');
      onAbandonSession();
    }
  }, [focusIndex, playSfx, autoOpenPOI, setAutoOpenPOI, onReturnToHub, onAbandonSession, isAbandoning]);

  useControllerAction(
    {
      onDPadUp: () => setFocusIndex((i) => Math.max(0, i - 1)),
      onDPadDown: () => setFocusIndex((i) => Math.min(totalItems - 1, i + 1)),
      onDPadLeft:
        focusIndex === 0
          ? () => setMusicVolume(Math.round(Math.max(0, musicVolume - 0.1) * 10) / 10)
          : focusIndex === 1
            ? () => setSfxVolume(Math.round(Math.max(0, sfxVolume - 0.1) * 10) / 10)
            : focusIndex === 2
              ? () => { playSfx('ui_click'); setAutoOpenPOI(!autoOpenPOI); }
              : undefined,
      onDPadRight:
        focusIndex === 0
          ? () => setMusicVolume(Math.round(Math.min(1, musicVolume + 0.1) * 10) / 10)
          : focusIndex === 1
            ? () => setSfxVolume(Math.round(Math.min(1, sfxVolume + 0.1) * 10) / 10)
            : focusIndex === 2
              ? () => { playSfx('ui_click'); setAutoOpenPOI(!autoOpenPOI); }
              : undefined,
      onA: handleSelect,
      onB: () => { playSfx('ui_back'); onClose(); },
    },
    isController && visible
  );

  if (!visible) return null;

  const controllerHints: ButtonHint[] = [
    { button: 'A', label: 'Select' },
    { button: 'B', label: 'Resume' },
  ];

  return (
    <Pressable style={styles.overlay} onPress={() => { playSfx('ui_back'); onClose(); }}>
      <Pressable style={styles.innerContainer} onPress={() => {}}>
        <View style={[styles.scaleWrapper, isCompact && compactStyles.scaleWrapper]}>
          <View style={[styles.container, isCompact && compactStyles.container]}>
            <Image source={paperPanelSource} style={styles.paperBg} resizeMode="stretch" />
            <View style={[styles.content, isCompact && compactStyles.content]}>
              <Text style={[styles.title, isCompact && compactStyles.title]}>PAUSED</Text>

              <View style={[styles.volumeSection, isCompact && compactStyles.volumeSection]}>
                <FocusGlow active={isController && focusIndex === 0}>
                  <View style={styles.volumeRow}>
                    <Text style={[styles.volumeLabel, isCompact && compactStyles.volumeLabel]}>
                      Music
                    </Text>
                    <VolumeControls
                      currentVolume={musicVolume}
                      onVolumeChange={setMusicVolume}
                      scale={isCompact ? 1 : 0.8}
                    />
                  </View>
                </FocusGlow>
                <FocusGlow active={isController && focusIndex === 1}>
                  <View style={styles.volumeRow}>
                    <Text style={[styles.volumeLabel, isCompact && compactStyles.volumeLabel]}>
                      SFX
                    </Text>
                    <VolumeControls
                      currentVolume={sfxVolume}
                      onVolumeChange={setSfxVolume}
                      scale={isCompact ? 1 : 0.8}
                    />
                  </View>
                </FocusGlow>
              </View>

              <View style={[styles.checkboxRow, isCompact && compactStyles.checkboxRow]}>
                <FocusGlow active={isController && focusIndex === 2}>
                  <Checkbox
                    label="Auto-open POI"
                    checked={autoOpenPOI}
                    onToggle={() => {
                      playSfx('ui_click');
                      setAutoOpenPOI(!autoOpenPOI);
                    }}
                    size={isCompact ? 32 : 20}
                    labelStyle={isCompact ? compactStyles.volumeLabel : undefined}
                  />
                </FocusGlow>
              </View>

              <View style={[styles.menuList, isCompact && compactStyles.menuList]}>
                <View style={styles.menuRow}>
                  {!isController && onOpenTutorial && (
                    <TouchableOpacity
                      onPress={() => {
                        playSfx('ui_click');
                        onOpenTutorial();
                      }}
                      activeOpacity={0.7}
                    >
                      <CachedImageBackground
                        source={buttonV3Source}
                        style={[
                          styles.menuButtonImageSmall,
                          isCompact && compactStyles.menuButtonImageSmall,
                        ]}
                        resizeMode="stretch"
                      >
                        <Text style={[styles.menuButtonText, isCompact && compactStyles.menuButtonText]}>
                          Tutorial
                        </Text>
                      </CachedImageBackground>
                    </TouchableOpacity>
                  )}

                  <FocusGlow active={isController && focusIndex === 3}>
                    <TouchableOpacity
                      onPress={() => {
                        playSfx('ui_click');
                        onReturnToHub();
                      }}
                      activeOpacity={0.7}
                    >
                      <CachedImageBackground
                        source={buttonV1Source}
                        style={[
                          styles.menuButtonImageSmall,
                          isCompact && compactStyles.menuButtonImage,
                        ]}
                        resizeMode="stretch"
                      >
                        <Text style={[styles.menuButtonText, isCompact && compactStyles.menuButtonText]}>
                          Return to Hub
                        </Text>
                      </CachedImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>
                </View>

                {onAbandonSession && (
                  <FocusGlow active={isController && focusIndex === 4}>
                    <TouchableOpacity
                      onPress={() => {
                        playSfx('ui_click');
                        onAbandonSession();
                      }}
                      disabled={isAbandoning}
                      activeOpacity={0.7}
                    >
                      <CachedImageBackground
                        source={buttonV2Source}
                        style={[styles.menuButtonImage, isCompact && compactStyles.menuButtonImage]}
                        resizeMode="stretch"
                      >
                        {isAbandoning ? (
                          <ActivityIndicator size="small" color="#5c4033" />
                        ) : (
                          <Text
                            style={[
                              styles.menuButtonText,
                              styles.menuButtonTextDanger,
                              isCompact && compactStyles.menuButtonText,
                            ]}
                          >
                            Abandon Session
                          </Text>
                        )}
                      </CachedImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>
                )}
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
                  <Text style={[styles.resumeButtonText, isCompact && compactStyles.resumeButtonText]}>
                    Tap anywhere to close
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Pressable>
      {isController && <ControllerHints hints={controllerHints} horizontal />}
    </Pressable>
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
  innerContainer: {
    alignItems: 'center',
  },
  scaleWrapper: {
    transform: [{ scale: 1 }],
  },
  container: {
    width: 280,
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
  checkboxRow: {
    width: '100%',
    marginBottom: 16,
  },
  menuList: {
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  menuButtonImage: {
    width: 180,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonImageSmall: {
    width: 126,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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

const compactStyles = StyleSheet.create({
  scaleWrapper: {
    transform: [{ scale: 1.4 }],
  },
  container: {
    width: 320,
  },
  content: {
    padding: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 22,
    marginBottom: 12,
  },
  volumeSection: {
    marginBottom: 20,
    gap: 12,
  },
  volumeLabel: {
    fontSize: 16,
  },
  checkboxRow: {
    marginBottom: 20,
  },
  menuList: {
    gap: 12,
  },
  menuButtonImage: {
    width: 210,
    height: 50,
  },
  menuButtonImageSmall: {
    width: 146,
    height: 50,
  },
  menuButtonText: {
    fontSize: 15,
  },
  resumeButtonText: {
    fontSize: 13,
  },
});
