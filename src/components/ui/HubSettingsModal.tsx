import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import { CachedImageBackground } from '../common/CachedImageBackground';
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

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.webp');
const buttonV1Source = require('../../../assets/ui/buttons/button-v1.webp');
const iconASource = require('../../../assets/ui/control-buttons/a.webp');
const iconBSource = require('../../../assets/ui/control-buttons/b.webp');
const iconDirSource = require('../../../assets/ui/control-buttons/direction.webp');

export interface HubSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onDisconnect: () => void;
  onResetProfile?: () => void;
  controllerEnabled?: boolean;
}

export function HubSettingsModal({
  visible,
  onClose,
  onDisconnect,
  onResetProfile,
  controllerEnabled = true,
}: HubSettingsModalProps) {
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isCompact = useScreenVariant() === 'compact';
  const { height } = useWindowDimensions();
  const { musicVolume, setMusicVolume, sfxVolume, setSfxVolume, playSfx } = useAudio();
  const { autoOpenPOI, setAutoOpenPOI, autoResolveCombat, setAutoResolveCombat } = useSettings();
  const { defaultCombatSpeed, updateDefaultCombatSpeed } = useProfile();
  const [settingsFocus, setSettingsFocus] = useState(0);
  const hasResetProfileAction = typeof onResetProfile === 'function';
  const maxSettingsFocus = hasResetProfileAction ? 6 : 5;
  const baseModalHeight = isCompact ? 960 : 420;
  const maxModalHeight = Math.max(320, height * 0.95);
  const modalScale = Math.min(1, maxModalHeight / baseModalHeight);
  const isTightFit = !isCompact && height < 420;

  useEffect(() => {
    if (visible) setSettingsFocus(0);
  }, [visible]);

  const SPEED_ORDER: CombatSpeed[] = ['paused', 'normal', 'fast', 'super-fast'];
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

  const toggleAutoResolveCombat = useCallback(() => {
    playSfx('ui_click');
    setAutoResolveCombat(!autoResolveCombat);
  }, [autoResolveCombat, playSfx, setAutoResolveCombat]);

  useControllerAction(
    {
      onA:
        settingsFocus === 3
          ? toggleAutoOpenPOI
          : settingsFocus === 4
            ? toggleAutoResolveCombat
            : settingsFocus === 5
              ? onDisconnect
              : settingsFocus === 6 && hasResetProfileAction
                ? onResetProfile
                : undefined,
      onB: () => {
        playSfx('ui_back');
        onClose();
      },
      onDPadUp: () => setSettingsFocus((p) => Math.max(0, p - 1)),
      onDPadDown: () => setSettingsFocus((p) => Math.min(maxSettingsFocus, p + 1)),
      onDPadLeft:
        settingsFocus === 0
          ? () => setMusicVolume(Math.round(Math.max(0, musicVolume - 0.1) * 10) / 10)
          : settingsFocus === 1
            ? () => setSfxVolume(Math.round(Math.max(0, sfxVolume - 0.1) * 10) / 10)
            : settingsFocus === 2
              ? () => cycleSpeed(-1)
              : settingsFocus === 3
                ? toggleAutoOpenPOI
                : settingsFocus === 4
                  ? toggleAutoResolveCombat
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
                : settingsFocus === 4
                  ? toggleAutoResolveCombat
                  : undefined,
    },
    isController && visible && controllerEnabled
  );

  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalScaleWrapper}>
              <CachedImageBackground
                source={paperPanelSource}
                style={[
                  styles.modalContent,
                  isCompact && compactStyles.settingsModalContent,
                  isCompact && modalScale < 1 && { transform: [{ scale: modalScale }] },
                  isTightFit && { height: maxModalHeight, padding: 24, paddingTop: 16 },
                ]}
                resizeMode="stretch"
              >
                <View style={[styles.modalHeader, isTightFit && { marginBottom: 12 }]}>
                  <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                    Settings
                  </Text>
                  {!isController && (
                    <TouchableOpacity
                      onPress={() => {
                        playSfx('ui_back');
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

                <View
                  style={[
                    styles.modalBody,
                    !isCompact && styles.mobileModalBody,
                    isCompact && compactStyles.settingsModalBody,
                    !isCompact && { gap: Math.min(14, (maxModalHeight - 200) / 12) },
                  ]}
                >
                  <FocusGlow
                    active={isController && settingsFocus === 0}
                    style={styles.settingGlow}
                  >
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                        Music volume
                      </Text>
                      <VolumeControls
                        currentVolume={musicVolume}
                        onVolumeChange={setMusicVolume}
                        scale={isCompact ? 2 : 0.8}
                      />
                    </View>
                  </FocusGlow>

                  <FocusGlow
                    active={isController && settingsFocus === 1}
                    style={styles.settingGlow}
                  >
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                        SFX volume
                      </Text>
                      <VolumeControls
                        currentVolume={sfxVolume}
                        onVolumeChange={setSfxVolume}
                        scale={isCompact ? 2 : 0.8}
                      />
                    </View>
                  </FocusGlow>

                  <FocusGlow
                    active={isController && settingsFocus === 2}
                    style={styles.settingGlow}
                  >
                    <View style={styles.settingRow}>
                      <Text style={[styles.settingLabel, isCompact && compactStyles.settingLabel]}>
                        Combat speed
                      </Text>
                      <SpeedControls
                        currentSpeed={defaultCombatSpeed}
                        onSpeedChange={updateDefaultCombatSpeed}
                        scale={isCompact ? 1.4 : 0.55}
                        onPress={() => playSfx('ui_click')}
                      />
                    </View>
                  </FocusGlow>

                  <FocusGlow
                    active={isController && settingsFocus === 3}
                    style={styles.settingGlow}
                  >
                    <Checkbox
                      label="Auto-open POI"
                      checked={autoOpenPOI}
                      onToggle={toggleAutoOpenPOI}
                      size={isCompact ? 44 : 20}
                      labelStyle={isCompact ? { fontSize: 26 } : undefined}
                    />
                  </FocusGlow>

                  <FocusGlow
                    active={isController && settingsFocus === 4}
                    style={styles.settingGlow}
                  >
                    <Checkbox
                      label="Auto-resolve combat"
                      checked={autoResolveCombat}
                      onToggle={toggleAutoResolveCombat}
                      size={isCompact ? 44 : 20}
                      labelStyle={isCompact ? { fontSize: 26 } : undefined}
                    />
                  </FocusGlow>

                  <View
                    style={[
                      !isCompact && styles.mobileButtonRow,
                      !isCompact && !hasResetProfileAction && { marginTop: 20 },
                      !isCompact && hasResetProfileAction && { marginTop: -2 },
                    ]}
                  >
                    <FocusGlow
                      active={isController && settingsFocus === 5}
                      style={!isCompact && hasResetProfileAction ? styles.mobileButtonRowItem : undefined}
                    >
                      <TouchableOpacity
                        style={[
                          styles.resetButton,
                          !isCompact && styles.mobileResetButton,
                          isCompact && compactStyles.resetButton,
                        ]}
                        onPress={() => {
                          playSfx('ui_click');
                          onDisconnect();
                        }}
                        activeOpacity={0.7}
                      >
                        <CachedImageBackground
                          source={buttonV1Source}
                          style={styles.buttonImage}
                          resizeMode="stretch"
                        >
                          <Text
                            style={[styles.disconnectText, isCompact && compactStyles.disconnectText]}
                          >
                            Disconnect
                          </Text>
                        </CachedImageBackground>
                      </TouchableOpacity>
                    </FocusGlow>

                    {hasResetProfileAction && (
                      <FocusGlow
                        active={isController && settingsFocus === 6}
                        style={!isCompact ? styles.mobileButtonRowItem : undefined}
                      >
                        <TouchableOpacity
                          style={[
                            styles.resetButton,
                            !isCompact && styles.mobileResetButton,
                            isCompact && compactStyles.resetButton,
                          ]}
                          onPress={() => {
                            playSfx('ui_click');
                            onResetProfile?.();
                          }}
                          activeOpacity={0.7}
                        >
                          <CachedImageBackground
                            source={buttonV1Source}
                            style={styles.buttonImage}
                            resizeMode="stretch"
                          >
                            <Text
                              style={[
                                styles.disconnectText,
                                isCompact && compactStyles.disconnectText,
                              ]}
                            >
                              Reset Profile
                            </Text>
                          </CachedImageBackground>
                        </TouchableOpacity>
                      </FocusGlow>
                    )}
                  </View>
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
                          {settingsFocus === 3 || settingsFocus === 4 ? 'Toggle' : 'Confirm'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.settingsHintRow}>
                      <Image
                        source={iconBSource}
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
                        Close
                      </Text>
                    </View>
                  </View>
                )}
              </CachedImageBackground>
            </View>
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
  modalScaleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
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
  mobileModalBody: {
    marginTop: -10,
    gap: 14,
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
  mobileResetButton: {
    width: 140,
    marginTop: 0,
  },
  mobileButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  mobileButtonRowItem: {
    flex: 1,
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
  tapToCloseText: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#8b7355',
    letterSpacing: 0.3,
  },
});

const compactStyles = StyleSheet.create({
  settingsModalContent: {
    width: 760,
    height: 960,
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
  tapToCloseText: {
    bottom: 36,
    fontSize: 22,
  },
});
