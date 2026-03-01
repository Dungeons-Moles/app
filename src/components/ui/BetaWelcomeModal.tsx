/**
 * BetaWelcomeModal - One-time modal shown on first game entry.
 * Informs the player the game is in Beta and how to report bugs.
 * Persists dismissal via AsyncStorage so it only shows once.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ImageBackground,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InlineModal } from '../InlineModal';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useAudio } from '../../contexts/AudioContext';
import { FocusGlow } from './FocusGlow';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.png');
const buttonBgSource = require('../../../assets/ui/buttons/button.png');
const iconASource = require('../../../assets/ui/control-buttons/a.png');

export const BETA_WELCOME_KEY = '@app:betaWelcome:shown';

export interface BetaWelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function BetaWelcomeModal({ visible, onClose }: BetaWelcomeModalProps) {
  const isCompact = useScreenVariant() === 'compact';
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const { playSfx } = useAudio();
  const handleClose = useCallback(async () => {
    playSfx('ui_back');
    await AsyncStorage.setItem(BETA_WELCOME_KEY, 'true');
    onClose();
  }, [onClose, playSfx]);

  useControllerAction(
    {
      onA: handleClose,
      onB: handleClose,
    },
    isController && visible
  );

  if (!visible) return null;

  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <ImageBackground
              source={paperPanelSource}
              style={[styles.modalContent, isCompact && compactStyles.modalContent]}
              resizeMode="stretch"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                  Welcome, Adventurer!
                </Text>
                {!isController && (
                  <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text
                      style={[
                        styles.closeButtonText,
                        isCompact && compactStyles.closeButtonText,
                      ]}
                    >
                      ✕
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.modalBody, isCompact && compactStyles.modalBody]}>
                <Text style={[styles.bodyText, isCompact && compactStyles.bodyText]}>
                  Dungeons & Moles is currently in{' '}
                  <Text style={styles.bold}>Early Beta</Text>.{'\n\n'}
                  You may encounter the occasional unruly bug lurking in the tunnels. If something
                  goes wrong, try <Text style={styles.bold}>reloading the game</Text> and{' '}
                  <Text style={styles.bold}>resuming your session</Text> — that usually clears
                  things up.{'\n\n'}
                  If a bug persists, we would love to hear about it on our{' '}
                  <Text style={styles.discord}>Discord</Text>. Your reports help us squash them
                  faster.
                </Text>

                <Text style={[styles.thanks, isCompact && compactStyles.thanks]}>
                  Thank you for joining us this early!
                </Text>

                <FocusGlow active={isController}>
                  <Pressable
                    style={[styles.buttonSlot, isCompact && compactStyles.buttonSlot]}
                    onPress={handleClose}
                  >
                    <ImageBackground
                      source={buttonBgSource}
                      style={styles.buttonImage}
                      resizeMode="contain"
                    >
                      <Text style={[styles.buttonText, isCompact && compactStyles.buttonText]}>
                        Got it!
                      </Text>
                    </ImageBackground>
                  </Pressable>
                </FocusGlow>
              </View>

              {isController && (
                <View style={[styles.hintBar, isCompact && compactStyles.hintBar]}>
                  <View style={styles.hintRow}>
                    <Image
                      source={iconASource}
                      style={[styles.hintIcon, isCompact && compactStyles.hintIcon]}
                      resizeMode="contain"
                    />
                    <Text style={[styles.hintText, isCompact && compactStyles.hintText]}>
                      Got it
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
    width: 360,
    height: 380,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  modalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  modalTitle: {
    fontFamily: Typography.header,
    fontSize: 24,
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
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyText: {
    fontFamily: Typography.body,
    fontSize: 11,
    lineHeight: 16,
    color: '#5c4033',
    textAlign: 'center',
  },
  bold: {
    fontFamily: Typography.stat,
    color: '#3d2b1f',
  },
  discord: {
    fontFamily: Typography.stat,
    color: '#5865F2',
  },
  thanks: {
    fontFamily: Typography.headerItalic,
    fontSize: 11,
    color: '#8b7355',
    textAlign: 'center',
    marginTop: 10,
  },
  buttonSlot: {
    width: 150,
    aspectRatio: 3.2,
    marginTop: 20,
  },
  buttonImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  hintBar: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hintIcon: {
    width: 18,
    height: 18,
  },
  hintText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#5c4033',
  },
});

const compactStyles = StyleSheet.create({
  modalContent: {
    width: 700,
    height: 740,
    padding: 70,
  },
  modalTitle: {
    fontSize: 40,
  },
  closeButtonText: {
    fontSize: 38,
  },
  modalBody: {
    justifyContent: 'center',
  },
  bodyText: {
    fontSize: 20,
    lineHeight: 28,
  },
  thanks: {
    fontSize: 18,
    marginTop: 16,
  },
  buttonSlot: {
    width: 280,
    marginTop: 32,
  },
  buttonText: {
    fontSize: 24,
  },
  hintBar: {
    bottom: 32,
    left: 32,
    gap: 24,
  },
  hintIcon: {
    width: 36,
    height: 36,
  },
  hintText: {
    fontSize: 22,
  },
});
