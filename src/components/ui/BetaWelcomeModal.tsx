/**
 * BetaWelcomeModal - One-time season pass modal shown on first game entry.
 * Explains the refundable deposit, derives the game wallet, and funds it.
 * Persists dismissal via AsyncStorage so it only shows once.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CachedImageBackground } from '../common/CachedImageBackground';
import { InlineModal } from '../InlineModal';
import { Typography } from '../../theme/typography';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { useInputMode } from '../../hooks/useInputMode';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useAudio } from '../../contexts/AudioContext';
import { FocusGlow } from './FocusGlow';
import { useWallet } from '../../contexts/WalletContext';
import { useSessionSigner } from '../../hooks/useSessionSigner';
import {
  buildGameWalletDerivationMessage,
  deriveSessionSignerFromSignature,
  storeSessionSignerWallet,
  SESSION_COST_CAMPAIGN,
} from '../../services/solana/sessionSigner';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.webp');
const buttonBgSource = require('../../../assets/ui/buttons/button.webp');
const iconASource = require('../../../assets/ui/control-buttons/a.webp');
const iconBSource = require('../../../assets/ui/control-buttons/b.webp');
const lockIconSource = require('../../../assets/icons/ui/lock.webp');

export const BETA_WELCOME_KEY = '@app:betaWelcome:shown';

export interface BetaWelcomeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function BetaWelcomeModal({ visible, onClose }: BetaWelcomeModalProps) {
  const isCompact = useScreenVariant() === 'compact';
  const { height: windowHeight } = useWindowDimensions();
  const baseHeight = isCompact ? 920 : 500;
  const maxHeight = windowHeight * 0.95;
  const modalScale = maxHeight < baseHeight ? maxHeight / baseHeight : 1;
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const { playSfx } = useAudio();
  const { wallet, signMessage } = useWallet();
  const sessionSigner = useSessionSigner();
  const [isMinting, setIsMinting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const depositSol = (SESSION_COST_CAMPAIGN / 1e9).toFixed(2);

  const handleMintSeasonPass = useCallback(async () => {
    if (isMinting) return;
    setIsMinting(true);
    setError(null);
    playSfx('ui_click');

    try {
      if (!wallet.publicKey) {
        setError('Wallet not connected');
        setIsMinting(false);
        return;
      }

      let keypair = sessionSigner.keypair;
      if (!keypair) {
        const sig = await signMessage(buildGameWalletDerivationMessage());
        keypair = deriveSessionSignerFromSignature(sig);
        const walletAddress = wallet.address ?? wallet.publicKey.toBase58();
        await storeSessionSignerWallet(walletAddress, keypair);
        await sessionSigner.markAsActive(keypair);
      }

      const success = await sessionSigner.topUp(SESSION_COST_CAMPAIGN);
      if (!success) {
        setError('Failed to fund game wallet. Please try again.');
        setIsMinting(false);
        return;
      }

      await AsyncStorage.setItem(BETA_WELCOME_KEY, 'true');
      setIsMinting(false);
      setShowSuccess(true);
    } catch (err) {
      console.error('[BetaWelcomeModal] Mint season pass failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to unlock season pass';
      if (message.toLowerCase().includes('rejected') || message.toLowerCase().includes('denied')) {
        setError('Wallet signature was cancelled.');
      } else {
        setError(message);
      }
      setIsMinting(false);
    }
  }, [isMinting, playSfx, wallet, signMessage, sessionSigner, onClose]);

  const handleSkip = useCallback(async () => {
    playSfx('ui_back');
    await AsyncStorage.setItem(BETA_WELCOME_KEY, 'true');
    onClose();
  }, [onClose, playSfx]);

  const handleSuccessDismiss = useCallback(() => {
    playSfx('ui_click');
    setShowSuccess(false);
    onClose();
  }, [onClose, playSfx]);

  useControllerAction(
    {
      onA: showSuccess ? handleSuccessDismiss : handleMintSeasonPass,
      onB: showSuccess ? handleSuccessDismiss : handleSkip,
    },
    isController && visible && !isMinting
  );

  if (!visible) return null;

  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <TouchableWithoutFeedback onPress={handleSkip}>
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
              {showSuccess ? (
                /* ── Success confirmation ── */
                <View style={styles.successContainer}>
                  <Text style={[styles.successCheck, isCompact && compactStyles.successCheck]}>
                    ✓
                  </Text>
                  <Text style={[styles.title, isCompact && compactStyles.title]}>
                    Season Pass Unlocked!
                  </Text>
                  <View style={[styles.divider, isCompact && compactStyles.divider]} />
                  <Text style={[styles.bodyText, isCompact && compactStyles.bodyText]}>
                    Your game wallet has been funded with{' '}
                    <Text style={[styles.solAmount, isCompact && compactStyles.solAmount]}>
                      {depositSol} SOL
                    </Text>.{'\n\n'}
                    You're all set to start your first dungeon run!
                  </Text>
                  <FocusGlow active={isController}>
                    <Pressable
                      style={[styles.buttonSlot, isCompact && compactStyles.buttonSlot]}
                      onPress={handleSuccessDismiss}
                    >
                      <CachedImageBackground
                        source={buttonBgSource}
                        style={styles.buttonImage}
                        resizeMode="contain"
                      >
                        <Text style={[styles.buttonText, isCompact && compactStyles.buttonText]}>
                          Let's Go!
                        </Text>
                      </CachedImageBackground>
                    </Pressable>
                  </FocusGlow>
                </View>
              ) : (
              /* ── Main content ── */
              <>
              {/* Header */}
              <Text style={[styles.title, isCompact && compactStyles.title]}>
                Welcome, Adventurer!
              </Text>
              <Text style={[styles.subtitle, isCompact && compactStyles.subtitle]}>
                Dungeons & Moles is currently in <Text style={styles.boldSubtitle}>Early Alpha</Text>
              </Text>

              {/* Divider */}
              <View style={[styles.divider, isCompact && compactStyles.divider]} />

              {/* Season pass description */}
              <Text style={[styles.bodyText, isCompact && compactStyles.bodyText]}>
                Unlock your <Text style={styles.bold}>Season Pass</Text> by depositing a refundable{'\n'}
                <Text style={[styles.solAmount, isCompact && compactStyles.solAmount]}>{depositSol} SOL</Text> to begin your adventure.
              </Text>

              {/* Perks row */}
              <View style={[styles.perksRow, isCompact && compactStyles.perksRow]}>
                <View style={styles.perkItem}>
                  <Text style={[styles.perkIcon, isCompact && compactStyles.perkIcon]}>⚒</Text>
                  <Text style={[styles.perkText, isCompact && compactStyles.perkText]}>
                    20 Campaign Sessions
                  </Text>
                </View>
                <View style={styles.perkItem}>
                  <Text style={[styles.perkIcon, isCompact && compactStyles.perkIcon]}>★</Text>
                  <Text style={[styles.perkText, isCompact && compactStyles.perkText]}>
                    Early Alpha Access
                  </Text>
                </View>
              </View>

              {/* Info box */}
              <View style={[styles.infoBox, isCompact && compactStyles.infoBox]}>
                <View style={styles.infoTitleRow}>
                  <Image
                    source={lockIconSource}
                    style={[styles.lockIcon, isCompact && compactStyles.lockIcon]}
                    resizeMode="contain"
                  />
                  <Text style={[styles.infoTitle, isCompact && compactStyles.infoTitle]}>
                    This is NOT a fee.
                  </Text>
                </View>
                <Text style={[styles.infoBody, isCompact && compactStyles.infoBody]}>
                  Your SOL is returned when your session ends.{'\n'}
                  Withdraw anytime from your <Text style={styles.bold}>Profile</Text> page.
                </Text>
              </View>

              {/* Error */}
              {error && (
                <Text style={[styles.errorText, isCompact && compactStyles.errorText]}>
                  {error}
                </Text>
              )}

              {/* Unlock button */}
              <FocusGlow active={isController}>
                <Pressable
                  style={[styles.buttonSlot, isCompact && compactStyles.buttonSlot]}
                  onPress={handleMintSeasonPass}
                  disabled={isMinting}
                >
                  <CachedImageBackground
                    source={buttonBgSource}
                    style={styles.buttonImage}
                    resizeMode="contain"
                  >
                    {isMinting ? (
                      <ActivityIndicator size={isCompact ? 'large' : 'small'} color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.buttonText, isCompact && compactStyles.buttonText]}>
                        Unlock Season Pass
                      </Text>
                    )}
                  </CachedImageBackground>
                </Pressable>
              </FocusGlow>

              {/* Skip for now (touch/mouse only — controller uses B hint below) */}
              {!isController && !isMinting && (
                <Pressable onPress={handleSkip} style={styles.skipButton}>
                  <Text style={[styles.skipText, isCompact && compactStyles.skipText]}>
                    Skip for now
                  </Text>
                </Pressable>
              )}

              {/* Thank you */}
              <Text style={[styles.thanks, isCompact && compactStyles.thanks]}>
                Thank you for being an early adventurer!
              </Text>

              </>
              )}

              {/* Controller hints — shared by both views, outside the ternary */}
              {isController && (
                <View style={[styles.hintBar, isCompact && compactStyles.hintBar]}>
                  <View style={styles.hintRow}>
                    <Image
                      source={iconASource}
                      style={[styles.hintIcon, isCompact && compactStyles.hintIcon]}
                      resizeMode="contain"
                    />
                    <Text style={[styles.hintText, isCompact && compactStyles.hintText]}>
                      {showSuccess ? 'Continue' : 'Unlock'}
                    </Text>
                  </View>
                  {!showSuccess && (
                    <View style={styles.hintRow}>
                      <Image
                        source={iconBSource}
                        style={[styles.hintIcon, isCompact && compactStyles.hintIcon]}
                        resizeMode="contain"
                      />
                      <Text style={[styles.hintText, isCompact && compactStyles.hintText]}>
                        Skip for now
                      </Text>
                    </View>
                  )}
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
    width: 400,
    padding: 34,
    paddingTop: 28,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 26,
    color: '#3d2b1f',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Typography.headerItalic,
    fontSize: 11,
    color: '#8b7355',
    textAlign: 'center',
  },
  boldSubtitle: {
    fontFamily: Typography.stat,
    color: '#3d2b1f',
  },
  divider: {
    width: '80%',
    height: 1,
    backgroundColor: '#c4a882',
    marginVertical: 14,
    opacity: 0.6,
  },
  bodyText: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    color: '#5c4033',
    textAlign: 'center',
  },
  bold: {
    fontFamily: Typography.stat,
    color: '#3d2b1f',
  },
  solAmount: {
    fontFamily: Typography.stat,
    fontSize: 16,
    color: '#2e7d32',
  },
  perksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginTop: 14,
  },
  perkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  perkIcon: {
    fontSize: 18,
    color: '#3d2b1f',
  },
  perkText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#3d2b1f',
  },
  infoBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    width: '92%',
    alignItems: 'center',
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 4,
  },
  lockIcon: {
    width: 14,
    height: 14,
    marginTop: -2,
  },
  infoTitle: {
    fontFamily: Typography.stat,
    fontSize: 12,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  infoBody: {
    fontFamily: Typography.body,
    fontSize: 10,
    lineHeight: 15,
    color: '#5c4033',
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#c62828',
    textAlign: 'center',
    marginTop: 6,
  },
  buttonSlot: {
    width: 200,
    aspectRatio: 3.2,
    marginTop: 14,
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
  skipButton: {
    marginTop: 8,
    padding: 4,
  },
  skipText: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#8b7355',
    textDecorationLine: 'underline',
  },
  successContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCheck: {
    fontSize: 36,
    color: '#2e7d32',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  thanks: {
    fontFamily: Typography.headerItalic,
    fontSize: 10,
    color: '#8b7355',
    textAlign: 'center',
    marginTop: 14,
  },
  hintBar: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
    fontSize: 10,
    color: '#5c4033',
  },
});

const compactStyles = StyleSheet.create({
  modalContent: {
    width: 760,
    height: 820,
    padding: 60,
    paddingTop: 46,
    paddingBottom: 70,
  },
  successCheck: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 50,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 22,
  },
  divider: {
    marginVertical: 20,
  },
  bodyText: {
    fontSize: 24,
    lineHeight: 34,
  },
  solAmount: {
    fontSize: 26,
  },
  perksRow: {
    gap: 44,
    marginTop: 20,
  },
  perkIcon: {
    fontSize: 32,
  },
  perkText: {
    fontSize: 22,
  },
  infoBox: {
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  lockIcon: {
    width: 24,
    height: 24,
    marginTop: -3,
  },
  infoTitle: {
    fontSize: 24,
    marginBottom: 6,
  },
  infoBody: {
    fontSize: 20,
    lineHeight: 28,
  },
  errorText: {
    fontSize: 18,
    marginTop: 10,
  },
  buttonSlot: {
    width: 380,
    marginTop: 20,
  },
  buttonText: {
    fontSize: 26,
  },
  skipText: {
    fontSize: 18,
  },
  thanks: {
    fontSize: 20,
    marginTop: 28,
  },
  hintBar: {
    bottom: 28,
    left: 28,
    gap: 28,
  },
  hintIcon: {
    width: 36,
    height: 36,
  },
  hintText: {
    fontSize: 20,
  },
});
