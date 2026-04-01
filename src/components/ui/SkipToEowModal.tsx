/**
 * SkipToEowModal - Confirmation modal for skipping to end of week.
 * Warns the player they will lose all remaining moves.
 *
 * Compact (TV/controller): shows A/B button icons inline instead of touchable buttons.
 * Non-compact (mobile/touch): shows regular button images.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { CachedImage as Image } from '../common/CachedImage';
import { CachedImageBackground } from '../common/CachedImageBackground';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { ControllerHints, type ButtonHint } from './ControllerHints';
import { FocusGlow } from './FocusGlow';
import { Typography } from '../../theme/typography';
import { useAudio } from '../../contexts/AudioContext';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.webp');
const buttonV1Source = require('../../../assets/ui/buttons/button-v1.webp');
const buttonV2Source = require('../../../assets/ui/buttons/button-v2.webp');
const ICON_A = require('../../../assets/ui/control-buttons/a.webp');
const ICON_B = require('../../../assets/ui/control-buttons/b.webp');

export interface SkipToEowModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSkipping?: boolean;
}

export function SkipToEowModal({
  visible,
  onClose,
  onConfirm,
  isSkipping = false,
}: SkipToEowModalProps) {
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const isCompact = useScreenVariant() === 'compact';
  const { height: screenHeight } = useWindowDimensions();
  const { playSfx } = useAudio();
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    if (visible) setFocusIndex(0);
  }, [visible]);

  const handleConfirm = useCallback(() => {
    if (isSkipping) return;
    playSfx('ui_click');
    onConfirm();
  }, [isSkipping, playSfx, onConfirm]);

  const handleCancel = useCallback(() => {
    playSfx('ui_back');
    onClose();
  }, [playSfx, onClose]);

  useControllerAction(
    {
      onDPadLeft: () => setFocusIndex(0),
      onDPadRight: () => setFocusIndex(1),
      onA: () => (focusIndex === 0 ? handleConfirm() : handleCancel()),
      onB: handleCancel,
    },
    isController && visible
  );

  if (!visible) return null;

  const controllerHints: ButtonHint[] = [
    { button: 'A', label: 'Select' },
    { button: 'B', label: 'Cancel' },
  ];

  return (
    <Pressable style={styles.overlay} onPress={handleCancel}>
      <Pressable style={styles.innerContainer} onPress={() => {}}>
        <View
          style={[
            styles.scaleWrapper,
            isCompact && compactStyles.scaleWrapper,
            !isCompact && {
              transform: [{ scale: Math.min(1, (screenHeight * 0.9) / 260) }],
            },
          ]}
        >
          <View style={[styles.container, isCompact && compactStyles.container]}>
            <Image source={paperPanelSource} style={styles.paperBg} resizeMode="stretch" />
            <View style={[styles.content, isCompact && compactStyles.content]}>
              <Text style={[styles.title, isCompact && compactStyles.title]}>
                SKIP TO BOSS
              </Text>

              <Text style={[styles.description, isCompact && compactStyles.description]}>
                You will lose all remaining moves for this week. No HP, gold, or items will be
                gained for skipped phases.
              </Text>

              {isCompact ? (
                /* Compact: inline A/B controller icons */
                isSkipping ? (
                  <ActivityIndicator size="large" color="#5c4033" />
                ) : (
                  <View style={compactStyles.controllerRow}>
                    <View style={compactStyles.controllerHint}>
                      <Image source={ICON_A} style={compactStyles.controllerIcon} resizeMode="contain" />
                      <Text style={compactStyles.controllerLabel}>Skip Week</Text>
                    </View>
                    <View style={compactStyles.controllerHint}>
                      <Image source={ICON_B} style={compactStyles.controllerIcon} resizeMode="contain" />
                      <Text style={compactStyles.controllerLabel}>Cancel</Text>
                    </View>
                  </View>
                )
              ) : (
                /* Non-compact: regular touch buttons */
                <View style={styles.buttonRow}>
                  <FocusGlow active={isController && focusIndex === 0}>
                    <TouchableOpacity
                      onPress={handleConfirm}
                      disabled={isSkipping}
                      activeOpacity={0.7}
                    >
                      <CachedImageBackground
                        source={buttonV2Source}
                        style={styles.buttonImage}
                        resizeMode="stretch"
                      >
                        {isSkipping ? (
                          <ActivityIndicator size="small" color="#5c4033" />
                        ) : (
                          <Text style={[styles.buttonText, styles.confirmText]}>
                            Skip Week
                          </Text>
                        )}
                      </CachedImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>

                  <FocusGlow active={isController && focusIndex === 1}>
                    <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
                      <CachedImageBackground
                        source={buttonV1Source}
                        style={styles.buttonImage}
                        resizeMode="stretch"
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </CachedImageBackground>
                    </TouchableOpacity>
                  </FocusGlow>
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
      {/* Only show bottom-left hints on non-compact controller mode */}
      {isController && !isCompact && <ControllerHints hints={controllerHints} horizontal />}
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
    marginBottom: 12,
  },
  description: {
    fontFamily: Typography.header,
    fontSize: 12,
    color: '#5c4033',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  buttonImage: {
    width: 120,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: Typography.header,
    fontSize: 13,
    color: '#3d2b1f',
    letterSpacing: 0.3,
  },
  confirmText: {
    color: '#a94442',
  },
});

const compactStyles = StyleSheet.create({
  scaleWrapper: {
    transform: [{ scale: 1.4 }],
  },
  container: {
    width: 340,
  },
  content: {
    padding: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 22,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  controllerRow: {
    flexDirection: 'row',
    gap: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controllerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controllerIcon: {
    width: 32,
    height: 32,
  },
  controllerLabel: {
    fontFamily: Typography.header,
    fontSize: 16,
    color: '#3d2b1f',
    letterSpacing: 0.3,
  },
});
