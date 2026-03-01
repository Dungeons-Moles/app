/**
 * Payment confirmation modal for non-SOL token payments.
 * Shows swap quote details, devnet banner, and confirm/cancel buttons.
 * PSG1 navigable: D-pad Left/Right between buttons, A confirms, B cancels.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { Typography } from '@/theme/typography';
import { InlineModal } from '@/components/InlineModal';
import { FocusGlow } from '@/components/ui/FocusGlow';
import { useControllerAction } from '@/hooks/useControllerAction';
import { useInputMode } from '@/hooks/useInputMode';
import { useAudio } from '@/contexts/AudioContext';
import type { SwapQuote } from '@/services/solana/jupiter';

const paperPanelSource = require('../../../assets/ui/panels/paper-panel.png');

interface PaymentConfirmationModalProps {
  visible: boolean;
  quote: SwapQuote;
  isDevnet: boolean;
  isCompact?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PaymentConfirmationModal({
  visible,
  quote,
  isDevnet,
  isCompact = false,
  onConfirm,
  onCancel,
}: PaymentConfirmationModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [buttonFocus, setButtonFocus] = useState(0); // 0 = Confirm, 1 = Cancel
  const inputMode = useInputMode();
  const isController = inputMode === 'controller';
  const { playSfx } = useAudio();

  const handleConfirm = useCallback(async () => {
    setIsProcessing(true);
    try {
      onConfirm();
    } finally {
      setIsProcessing(false);
    }
  }, [onConfirm]);

  useControllerAction(
    {
      onA: buttonFocus === 0 ? (!isProcessing ? handleConfirm : undefined) : onCancel,
      onB: () => { playSfx('ui_back'); onCancel(); },
      onDPadLeft: () => setButtonFocus(0),
      onDPadRight: () => setButtonFocus(1),
    },
    isController && visible
  );

  const formatAmount = (amount: number, symbol: string) => {
    if (amount < 1) return `${amount.toFixed(4)} ${symbol}`;
    if (amount < 1000) return `${amount.toFixed(2)} ${symbol}`;
    return `${Math.ceil(amount).toLocaleString()} ${symbol}`;
  };

  return (
    <InlineModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <ImageBackground
              source={paperPanelSource}
              style={[styles.panel, isCompact && compactStyles.panel]}
              resizeMode="stretch"
            >
              <Text style={[styles.title, isCompact && compactStyles.title]}>
                Confirm Payment
              </Text>

              {/* Quote details */}
              <View style={styles.detailsContainer}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, isCompact && compactStyles.detailLabel]}>
                    You pay:
                  </Text>
                  <Text style={[styles.detailValue, isCompact && compactStyles.detailValue]}>
                    {formatAmount(quote.inputAmount, quote.inputToken.symbol)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, isCompact && compactStyles.detailLabel]}>
                    SOL equivalent:
                  </Text>
                  <Text style={[styles.detailValue, isCompact && compactStyles.detailValue]}>
                    {quote.outputSol.toFixed(4)} SOL
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, isCompact && compactStyles.detailLabel]}>
                    USD value:
                  </Text>
                  <Text style={[styles.detailValue, isCompact && compactStyles.detailValue]}>
                    ~${quote.outputUsdValue.toFixed(2)}
                  </Text>
                </View>

                {quote.priceImpactPct > 0.1 && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, isCompact && compactStyles.detailLabel]}>
                      Price impact:
                    </Text>
                    <Text
                      style={[
                        styles.detailValue,
                        isCompact && compactStyles.detailValue,
                        styles.impactWarning,
                      ]}
                    >
                      {quote.priceImpactPct.toFixed(2)}%
                    </Text>
                  </View>
                )}
              </View>

              {/* Devnet banner */}
              {isDevnet && (
                <View style={[styles.devnetBanner, isCompact && compactStyles.devnetBanner]}>
                  <Text style={[styles.devnetText, isCompact && compactStyles.devnetText]}>
                    On mainnet, Jupiter swaps {quote.inputToken.symbol} to SOL automatically.
                    {'\n'}Paying with SOL on devnet.
                  </Text>
                </View>
              )}

              {/* Jupiter attribution */}
              <Text style={[styles.attribution, isCompact && compactStyles.attribution]}>
                Powered by Jupiter
              </Text>

              {/* Buttons */}
              <View style={styles.buttonRow}>
                <FocusGlow active={isController && buttonFocus === 0}>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.confirmButton,
                      isCompact && compactStyles.button,
                    ]}
                    onPress={handleConfirm}
                    disabled={isProcessing}
                    activeOpacity={0.7}
                  >
                    {isProcessing ? (
                      <ActivityIndicator
                        color="#1a1a1a"
                        size={isCompact ? 'large' : 'small'}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.buttonText,
                          isCompact && compactStyles.buttonText,
                        ]}
                      >
                        Confirm
                      </Text>
                    )}
                  </TouchableOpacity>
                </FocusGlow>

                <FocusGlow active={isController && buttonFocus === 1}>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.cancelButton,
                      isCompact && compactStyles.button,
                    ]}
                    onPress={onCancel}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        styles.cancelButtonText,
                        isCompact && compactStyles.buttonText,
                      ]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </FocusGlow>
              </View>
            </ImageBackground>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </InlineModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  panel: {
    width: 320,
    minHeight: 340,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 20,
    color: '#3d2b1f',
    marginBottom: 16,
  },
  detailsContainer: {
    width: '100%',
    gap: 6,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#8a7a6a',
  },
  detailValue: {
    fontFamily: Typography.number,
    fontSize: 13,
    color: '#3d2b1f',
    fontWeight: 'bold',
  },
  impactWarning: {
    color: '#a33a3a',
  },
  devnetBanner: {
    backgroundColor: 'rgba(41, 98, 255, 0.08)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(41, 98, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    width: '100%',
  },
  devnetText: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: '#2962FF',
    textAlign: 'center',
    lineHeight: 14,
  },
  attribution: {
    fontFamily: Typography.body,
    fontSize: 9,
    color: '#8a7a6a',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1.5,
    borderColor: '#D4A017',
  },
  cancelButton: {
    backgroundColor: 'rgba(92, 64, 51, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(92, 64, 51, 0.3)',
  },
  buttonText: {
    fontFamily: Typography.button,
    fontSize: 16,
    color: '#3d2b1f',
  },
  cancelButtonText: {
    color: '#8a7a6a',
  },
});

const compactStyles = StyleSheet.create({
  panel: {
    width: 600,
    minHeight: 520,
    paddingVertical: 56,
    paddingHorizontal: 72,
  },
  title: {
    fontSize: 36,
    marginBottom: 28,
  },
  detailLabel: {
    fontSize: 20,
  },
  detailValue: {
    fontSize: 22,
  },
  devnetBanner: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginBottom: 16,
  },
  devnetText: {
    fontSize: 16,
    lineHeight: 22,
  },
  attribution: {
    fontSize: 14,
    marginBottom: 20,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 160,
  },
  buttonText: {
    fontSize: 28,
  },
});
