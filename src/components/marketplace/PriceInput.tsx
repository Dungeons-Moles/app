import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Typography } from '@/theme/typography';
import { useInputMode } from '@/hooks/useInputMode';
import { useControllerAction } from '@/hooks/useControllerAction';
import { FocusGlow } from '@/components/ui/FocusGlow';
import { ControllerNumpad } from '@/components/ui/ControllerNumpad';

const iconASource = require('../../../assets/ui/control-buttons/a.png');
const iconBSource = require('../../../assets/ui/control-buttons/b.png');
const iconDirSource = require('../../../assets/ui/control-buttons/direction.png');

// Focus: 0 = input, 1 = cancel, 2 = confirm
type FocusIndex = 0 | 1 | 2;

interface PriceInputProps {
  onConfirm: (priceSol: number) => void;
  onCancel: () => void;
  isCompact?: boolean;
}

export function PriceInput({ onConfirm, onCancel, isCompact }: PriceInputProps) {
  const [priceText, setPriceText] = useState('');
  const [focusIdx, setFocusIdx] = useState<FocusIndex>(0);
  const [showNumpad, setShowNumpad] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const price = parseFloat(priceText) || 0;
  const sellerAmount = price * 0.95;
  const companyFee = price * 0.03;
  const poolFee = price * 0.02;
  const isValid = price > 0 && price <= 1000;

  const inputMode = useInputMode();
  const isController = inputMode === 'controller';

  // After user types a valid price, auto-focus Confirm
  const prevPriceValid = useRef(false);
  useEffect(() => {
    if (isValid && !prevPriceValid.current) {
      setFocusIdx(2);
    }
    prevPriceValid.current = isValid;
  }, [isValid]);

  const handleNumpadSubmit = useCallback((text: string) => {
    setPriceText(text);
    setShowNumpad(false);
  }, []);

  const handleNumpadCancel = useCallback(() => {
    setShowNumpad(false);
  }, []);

  const handleControllerA = useCallback(() => {
    if (focusIdx === 0) {
      setShowNumpad(true);
    } else if (focusIdx === 1) {
      onCancel();
    } else if (focusIdx === 2 && isValid) {
      onConfirm(price);
    }
  }, [focusIdx, isValid, onCancel, onConfirm, price]);

  const handleUp = useCallback(() => {
    if (focusIdx > 0) setFocusIdx(0);
  }, [focusIdx]);

  const handleDown = useCallback(() => {
    if (focusIdx === 0) setFocusIdx(2);
  }, [focusIdx]);

  const handleLeft = useCallback(() => {
    if (focusIdx === 2) setFocusIdx(1);
  }, [focusIdx]);

  const handleRight = useCallback(() => {
    if (focusIdx === 1) setFocusIdx(2);
  }, [focusIdx]);

  useControllerAction(
    showNumpad ? {} : {
      onA: handleControllerA,
      onB: onCancel,
      onDPadUp: handleUp,
      onDPadDown: handleDown,
      onDPadLeft: handleLeft,
      onDPadRight: handleRight,
    },
    isController
  );

  return (
    <View style={[styles.container, isCompact && compactStyles.container]}>
      <Text style={[styles.title, isCompact && compactStyles.title]}>
        List for Sale
      </Text>

      {/* Price Input */}
      <FocusGlow active={isController && focusIdx === 0} style={{ alignSelf: 'stretch' }}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            setFocusIdx(0);
            if (isController) {
              setShowNumpad(true);
            } else {
              inputRef.current?.focus();
            }
          }}
        >
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.input, isCompact && compactStyles.input]}
              value={priceText}
              onChangeText={setPriceText}
              placeholder="0.00"
              placeholderTextColor="#8a7a6a"
              keyboardType="decimal-pad"
              onFocus={() => setFocusIdx(0)}
            />
            <Text style={[styles.solLabel, isCompact && compactStyles.solLabel]}>SOL</Text>
          </View>
        </TouchableOpacity>
      </FocusGlow>

      {/* Fee breakdown */}
      {price > 0 && (
        <View style={styles.feeBreakdown}>
          <View style={styles.feeRow}>
            <Text style={[styles.feeLabel, isCompact && compactStyles.feeLabel]}>You receive (95%)</Text>
            <Text style={[styles.feeValue, isCompact && compactStyles.feeValue]}>{sellerAmount.toFixed(4)} SOL</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={[styles.feeLabel, isCompact && compactStyles.feeLabel]}>Company fee (3%)</Text>
            <Text style={[styles.feeValue, isCompact && compactStyles.feeValue]}>{companyFee.toFixed(4)} SOL</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={[styles.feeLabel, isCompact && compactStyles.feeLabel]}>Pool fee (2%)</Text>
            <Text style={[styles.feeValue, isCompact && compactStyles.feeValue]}>{poolFee.toFixed(4)} SOL</Text>
          </View>
        </View>
      )}

      {/* Cancel / Confirm buttons */}
      <View style={styles.buttons}>
        <FocusGlow active={isController && focusIdx === 1}>
          <TouchableOpacity
            style={[styles.cancelButton, isCompact && compactStyles.cancelButton]}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelButtonText, isCompact && compactStyles.cancelButtonText]}>Cancel</Text>
          </TouchableOpacity>
        </FocusGlow>
        <FocusGlow active={isController && focusIdx === 2}>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              isCompact && compactStyles.confirmButton,
              !isValid && styles.confirmButtonDisabled,
            ]}
            onPress={() => isValid && onConfirm(price)}
            disabled={!isValid}
            activeOpacity={0.7}
          >
            <Text style={[styles.confirmButtonText, isCompact && compactStyles.confirmButtonText]}>Confirm</Text>
          </TouchableOpacity>
        </FocusGlow>
      </View>

      {isController && !showNumpad && (
        <View style={styles.controllerHints}>
          <Image source={iconDirSource} style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18 }} resizeMode="contain" />
          <Text style={[styles.hintText, isCompact && compactStyles.hintText]}>Navigate</Text>
          <Image source={iconASource} style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18, marginLeft: 8 }} resizeMode="contain" />
          <Text style={[styles.hintText, isCompact && compactStyles.hintText]}>Select</Text>
          <Image source={iconBSource} style={{ width: isCompact ? 40 : 18, height: isCompact ? 40 : 18, marginLeft: 8 }} resizeMode="contain" />
          <Text style={[styles.hintText, isCompact && compactStyles.hintText]}>Cancel</Text>
        </View>
      )}

      {/* On-screen numpad for controller mode */}
      <ControllerNumpad
        visible={showNumpad}
        value={priceText}
        onSubmit={handleNumpadSubmit}
        onCancel={handleNumpadCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    width: '100%',
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 18,
    color: '#3d2b1f',
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#5c4033',
    padding: 10,
    fontSize: 18,
    fontFamily: Typography.number,
    color: '#3d2b1f',
    textAlign: 'right',
  },
  solLabel: {
    fontFamily: Typography.stat,
    fontSize: 16,
    color: '#5c4033',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  feeBreakdown: {
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(92, 64, 51, 0.2)',
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  feeLabel: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#8a7a6a',
  },
  feeValue: {
    fontFamily: Typography.number,
    fontSize: 11,
    color: '#5c4033',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5c4033',
  },
  cancelButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#5c4033',
  },
  confirmButton: {
    backgroundColor: '#3d2b1f',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    fontFamily: Typography.button,
    fontSize: 14,
    color: '#ffffff',
  },
  controllerHints: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  hintText: {
    fontFamily: Typography.stat,
    fontSize: 10,
    color: '#5c4033',
  },
});

const compactStyles = StyleSheet.create({
  container: {
    gap: 20,
  },
  title: {
    fontSize: 32,
  },
  input: {
    padding: 16,
    fontSize: 32,
  },
  solLabel: {
    fontSize: 28,
  },
  feeLabel: {
    fontSize: 20,
  },
  feeValue: {
    fontSize: 20,
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  cancelButtonText: {
    fontSize: 24,
  },
  confirmButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  confirmButtonText: {
    fontSize: 24,
  },
  hintText: {
    fontSize: 18,
  },
});
