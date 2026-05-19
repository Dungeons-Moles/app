/**
 * GameWalletInfoModal - Explains the game wallet (session signer) to players.
 *
 * Three modes:
 * 1. "onboarding" - First-time explanation after profile creation.
 *    Frames the deposit as a "Season Pass" that's refundable.
 * 2. "insufficient" - Shown when the game wallet doesn't have enough SOL.
 *    Prompts the player to deposit more.
 * 3. "extraDeposit" - Shown when switching game modes with an active session.
 *    Warns that extra rent may be needed.
 *
 * Persists onboarding dismissal via AsyncStorage so it only shows once.
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
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CachedImageBackground } from '../common/CachedImageBackground';
import { InlineModal } from '../InlineModal';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { CANVAS_HEIGHT } from '../ScaledCanvas';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useAudio } from '../../contexts/AudioContext';
import { FocusGlow } from './FocusGlow';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.webp');
const buttonBgSource = require('../../../assets/ui/buttons/button.webp');
const iconASource = require('../../../assets/ui/control-buttons/a.webp');

export const GAME_WALLET_ONBOARDING_KEY = '@app:gameWalletOnboarding:shown';

export type GameWalletInfoMode = 'onboarding' | 'insufficient' | 'extraDeposit';

export interface GameWalletInfoModalProps {
  visible: boolean;
  mode: GameWalletInfoMode;
  onClose: () => void;
  /** Current game wallet balance in SOL (for display) */
  currentBalance?: number;
  /** Required deposit in SOL (for display) */
  requiredDeposit?: number;
}

type GameWalletBodyProps = GameWalletInfoModalProps & { isCompact: boolean };

const CONTENT: Record<
  GameWalletInfoMode,
  { title: string; body: (props: GameWalletBodyProps) => React.ReactNode; button: string }
> = {
  onboarding: {
    title: 'Game Wallet Setup',
    body: (props) => (
      <Text style={[styles.bodyText, props.isCompact && compactStyles.bodyText]}>
        To play, a small <Text style={styles.bold}>refundable deposit</Text> of{' '}
        <Text style={styles.highlight}>0.12 SOL</Text> is transferred to your game wallet. This
        covers the cost of creating temporary game accounts on the blockchain.{'\n\n'}
        <Text style={styles.bold}>This is NOT a fee</Text> — the SOL is returned to your game
        wallet when your session ends. You can withdraw it anytime from your{' '}
        <Text style={styles.bold}>Profile</Text> page.{'\n\n'}
        Think of it as a refundable security deposit that lets you play unlimited sessions.
      </Text>
    ),
    button: 'Got it!',
  },
  insufficient: {
    title: 'Deposit Required',
    body: (props) => (
      <Text style={[styles.bodyText, props.isCompact && compactStyles.bodyText]}>
        Your game wallet needs more SOL to start a session.{'\n\n'}
        <Text style={styles.bold}>Current balance:</Text>{' '}
        <Text style={styles.highlight}>{(props.currentBalance ?? 0).toFixed(4)} SOL</Text>
        {'\n'}
        <Text style={styles.bold}>Required:</Text>{' '}
        <Text style={styles.highlight}>{(props.requiredDeposit ?? 0.12).toFixed(2)} SOL</Text>
        {'\n\n'}
        The missing amount will be added to your next session start transaction. This deposit is{' '}
        <Text style={styles.bold}>refundable</Text> — it returns to your game wallet when the
        session ends.
      </Text>
    ),
    button: 'Continue',
  },
  extraDeposit: {
    title: 'Additional Deposit',
    body: (props) => (
      <Text style={[styles.bodyText, props.isCompact && compactStyles.bodyText]}>
        You have an active session in another game mode. Starting a new session requires an{' '}
        <Text style={styles.bold}>additional deposit</Text> for the extra game accounts.{'\n\n'}
        This extra deposit is also <Text style={styles.bold}>refundable</Text> — it will return to
        your game wallet when the session ends.{'\n\n'}
        You can also end your current session first to free up the existing deposit.
      </Text>
    ),
    button: 'Continue',
  },
};

export function GameWalletInfoModal({
  visible,
  mode,
  onClose,
  currentBalance,
  requiredDeposit,
}: GameWalletInfoModalProps) {
  const isCompact = useScreenVariant() === 'compact';
  const { height: windowHeight } = useWindowDimensions();
  const baseHeight = isCompact ? 780 : 420;
  // On compact the modal renders inside the fixed 1240x1080 ScaledCanvas;
  // useWindowDimensions() reports the smaller real device size (~635dp on
  // the PSG1) and would shrink the modal needlessly. Fit to the virtual
  // canvas height instead.
  const layoutHeight = isCompact ? CANVAS_HEIGHT : windowHeight;
  const maxHeight = layoutHeight * 0.95;
  const modalScale = maxHeight < baseHeight ? maxHeight / baseHeight : 1;
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const { playSfx } = useAudio();

  const handleClose = useCallback(async () => {
    playSfx('ui_back');
    if (mode === 'onboarding') {
      await AsyncStorage.setItem(GAME_WALLET_ONBOARDING_KEY, 'true');
    }
    onClose();
  }, [onClose, playSfx, mode]);

  useControllerAction(
    {
      onA: handleClose,
      onB: handleClose,
    },
    isController && visible
  );

  if (!visible) return null;

  const content = CONTENT[mode];
  const props = { visible, mode, onClose, currentBalance, requiredDeposit, isCompact };

  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <CachedImageBackground
              source={paperPanelSource}
              style={[
                styles.modalContent,
                isCompact && compactStyles.modalContent,
                modalScale < 1 && { transform: [{ scale: modalScale }] },
              ]}
              resizeMode="stretch"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, isCompact && compactStyles.modalTitle]}>
                  {content.title}
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
                {content.body(props)}

                <FocusGlow active={isController}>
                  <Pressable
                    style={[styles.buttonSlot, isCompact && compactStyles.buttonSlot]}
                    onPress={handleClose}
                  >
                    <CachedImageBackground
                      source={buttonBgSource}
                      style={styles.buttonImage}
                      resizeMode="contain"
                    >
                      <Text style={[styles.buttonText, isCompact && compactStyles.buttonText]}>
                        {content.button}
                      </Text>
                    </CachedImageBackground>
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
                      {content.button}
                    </Text>
                  </View>
                </View>
              )}
            </CachedImageBackground>
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
    fontSize: 22,
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
  highlight: {
    fontFamily: Typography.stat,
    color: '#2e7d32',
  },
  buttonSlot: {
    width: 150,
    aspectRatio: 3.2,
    marginTop: 16,
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
    width: 740,
    height: 780,
    padding: 70,
  },
  modalTitle: {
    fontSize: 38,
  },
  closeButtonText: {
    fontSize: 38,
  },
  modalBody: {
    justifyContent: 'center',
  },
  bodyText: {
    fontSize: 28,
    lineHeight: 38,
  },
  buttonSlot: {
    width: 360,
    marginTop: 28,
  },
  buttonText: {
    fontSize: 32,
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
    fontSize: 24,
  },
});
