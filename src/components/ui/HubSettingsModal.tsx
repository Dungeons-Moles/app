import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ImageBackground,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { InlineModal } from '../InlineModal';
import { Typography } from '../../theme/typography';
import { useInputMode } from '../../hooks/useInputMode';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useAudio } from '../../contexts/AudioContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useProfile } from '../../contexts/ProfileContext';
import { useControllerAction } from '../../hooks/useControllerAction';
import { FocusGlow } from './FocusGlow';
import { VolumeControls } from './VolumeControls';
import { Checkbox } from './Checkbox';
import { SpeedControls } from '../combat';
import type { CombatSpeed } from '../../types';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.png');
const buttonV1Source = require('../../../assets/ui/buttons/button-v1.png');
const iconASource = require('../../../assets/ui/control-buttons/a.png');
const iconBSource = require('../../../assets/ui/control-buttons/b.png');
const iconDirSource = require('../../../assets/ui/control-buttons/direction.png');

export interface HubSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onDisconnect: () => void;
}

export function HubSettingsModal({ visible, onClose, onDisconnect }: HubSettingsModalProps) {
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isCompact = useScreenVariant() === 'compact';
  const { musicVolume, setMusicVolume, sfxVolume, setSfxVolume, playSfx } = useAudio();
  const { autoOpenPOI, setAutoOpenPOI } = useSettings();
  const { defaultCombatSpeed, updateDefaultCombatSpeed } = useProfile();
  const [settingsFocus, setSettingsFocus] = useState(0);

  useEffect(() => {
    if (visible) setSettingsFocus(0);
  }, [visible]);

  const SPEED_ORDER: CombatSpeed[] = ['paused', 'normal', 'fast'];
  const cycleSpeed = useCallback(
    (dir: -1 | 1) => {
      const idx = SPEED_ORDER.indexOf(defaultCombatSpeed);
      const next = SPEED_ORDER[Math.max(0, Math.min(SPEED_ORDER.length - 1, idx + dir))];
      if (next) updateDefaultCombatSpeed(next);
    },
    [defaultCombatSpeed, updateDefaultCombatSpeed]
  );

  const toggleAutoOpenPOI = useCallback(() => {
    playSfx('ui_click');
    setAutoOpenPOI(!autoOpenPOI);
  }, [autoOpenPOI, playSfx, setAutoOpenPOI]);

  useControllerAction(
    {
      onA: settingsFocus === 3 ? toggleAutoOpenPOI : settingsFocus === 4 ? onDisconnect : undefined,
      onB: onClose,
      onDPadUp: () => setSettingsFocus((p) => Math.max(0, p - 1)),
      onDPadDown: () => setSettingsFocus((p) => Math.min(4, p + 1)),
      onDPadLeft:
        settingsFocus === 0
          ? () => setMusicVolume(Math.round(Math.max(0, musicVolume - 0.1) * 10) / 10)
          : settingsFocus === 1
            ? () => setSfxVolume(Math.round(Math.max(0, sfxVolume - 0.1) * 10) / 10)
            : settingsFocus === 2
              ? () => cycleSpeed(-1)
              : settingsFocus === 3
                ? toggleAutoOpenPOI
                : undefined,
      onDPadRight:
        settingsFocus === 0
          ? () => setMusicVolume(Math.round(Math.min(1, musicVolume + 0.1) * 10) / 10)
          : settingsFocus === 1
            ? () => setSfxVolume(Math.round(Math.min(1, sfxVolume + 0.1) * 10) / 10)
            : settingsFocus === 2
              ? () => cycleSpeed(1)
              : settingsFocus === 3
                ? toggleAutoOpenPOI
                : undefined,
    },
    isController && visible
  );

  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <ImageBackground
              source={paperPanelSource}
              style={[styles.modalContent, isCompact && compactStyles.settingsModalContent]}
              resizeMode="stretch"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                  Settings
                </Text>
                {!isController && (
                  <TouchableOpacity
                    onPress={() => {
                      playSfx('ui_click');
                      onClose();
                    }}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text
                      style={[styles.closeButtonText, isCompact && compactStyles.closeButtonText]}
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.modalBody, isCompact && compactStyles.settingsModalBody]}>
                <FocusGlow active={isController && settingsFocus === 0} style={styles.settingGlow}>
                  <View style={styles.settingRow}>
                    <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                      Music volume
                    </Text>
                    <VolumeControls
                      currentVolume={musicVolume}
                      onVolumeChange={setMusicVolume}
                      scale={isCompact ? 2 : 1}
                    />
                  </View>
                </FocusGlow>

                <FocusGlow active={isController && settingsFocus === 1} style={styles.settingGlow}>
                  <View style={styles.settingRow}>
                    <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                      SFX volume
                    </Text>
                    <VolumeControls
                      currentVolume={sfxVolume}
                      onVolumeChange={setSfxVolume}
                      scale={isCompact ? 2 : 1}
                    />
                  </View>
                </FocusGlow>

                <FocusGlow active={isController && settingsFocus === 2} style={styles.settingGlow}>
                  <View style={styles.settingRow}>
                    <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                      Combat speed
                    </Text>
                    <SpeedControls
                      currentSpeed={defaultCombatSpeed}
                      onSpeedChange={updateDefaultCombatSpeed}
                      scale={isCompact ? 1.4 : 0.7}
                    />
                  </View>
                </FocusGlow>

                <FocusGlow active={isController && settingsFocus === 3} style={styles.settingGlow}>
                  <Checkbox
                    label="Auto-open POI"
                    checked={autoOpenPOI}
                    onToggle={toggleAutoOpenPOI}
                    size={isCompact ? 44 : 20}
                    labelStyle={isCompact ? { fontSize: 26 } : undefined}
                  />
                </FocusGlow>

                <FocusGlow active={isController && settingsFocus === 4}>
                  <TouchableOpacity
                    style={[styles.resetButton, isCompact && compactStyles.resetButton]}
                    onPress={onDisconnect}
                    activeOpacity={0.7}
                  >
                    <ImageBackground
                      source={buttonV1Source}
                      style={styles.buttonImage}
                      resizeMode="stretch"
                    >
                      <Text
                        style={[styles.disconnectText, isCompact && compactStyles.disconnectText]}
                      >
                        Disconnect
                      </Text>
                    </ImageBackground>
                  </TouchableOpacity>
                </FocusGlow>
              </View>

              {isController && (
                <View style={[styles.settingsHints, isCompact && compactStyles.settingsHints]}>
                  {settingsFocus <= 2 ? (
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconDirSource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                          { transform: [{ rotate: '-90deg' }] },
                        ]}
                        resizeMode="contain"
                      />
                      <Image
                        source={iconDirSource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                          { transform: [{ rotate: '90deg' }] },
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        {settingsFocus === 2 ? 'Change speed' : 'Change volume'}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconASource}
                        style={[
                          styles.settingsHintIcon,
                          isCompact && compactStyles.settingsHintIcon,
                        ]}
                        resizeMode="contain"
                      />
                      <Text
                        style={[
                          styles.settingsHintText,
                          isCompact && compactStyles.settingsHintText,
                        ]}
                      >
                        {settingsFocus === 3 ? 'Toggle' : 'Confirm'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.settingsHintRow}>
                    <Image
                      source={iconBSource}
                      style={[styles.settingsHintIcon, isCompact && compactStyles.settingsHintIcon]}
                      resizeMode="contain"
                    />
                    <Text
                      style={[styles.settingsHintText, isCompact && compactStyles.settingsHintText]}
                    >
                      Close
                    </Text>
                  </View>
                </View>
              )}
            </ImageBackground>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </InlineModal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: 380,
    height: 420,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 28,
    marginTop: 8,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: -10,
    top: -5,
    padding: 10,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#5c4033',
  },
  modalBody: {
    width: '100%',
    alignItems: 'center',
    gap: 20,
  },
  settingGlow: {
    width: '100%',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  settingLabel: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#3d2b1f',
    width: 90,
    flexShrink: 0,
  },
  resetButton: {
    width: 180,
    height: 48,
    marginTop: 10,
  },
  buttonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectText: {
    fontFamily: Typography.button,
    fontSize: 18,
    color: '#a33a3a',
  },
  settingsHints: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  settingsHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingsHintIcon: {
    width: 18,
    height: 18,
  },
  settingsHintText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5c4033',
  },
});

const compactStyles = StyleSheet.create({
  settingsModalContent: {
    width: 760,
    height: 840,
    padding: 80,
  },
  settingsModalBody: {
    flex: 1,
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 54,
  },
  closeButtonText: {
    fontSize: 44,
  },
  settingLabel: {
    fontSize: 26,
    width: 180,
  },
  resetButton: {
    width: 360,
    height: 96,
  },
  disconnectText: {
    fontSize: 32,
  },
  settingsHints: {
    bottom: 32,
    left: 32,
    gap: 24,
    borderRadius: 0,
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  settingsHintIcon: {
    width: 36,
    height: 36,
  },
  settingsHintText: {
    fontSize: 22,
  },
});
