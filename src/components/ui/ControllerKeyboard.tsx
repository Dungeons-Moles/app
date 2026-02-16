/**
 * On-screen keyboard for controller mode.
 * Console-game style QWERTY grid navigated entirely with D-pad and face buttons.
 * Used when psg1-sim intercepts physical keys (j→A, k→B, arrows→DPad).
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { InlineModal } from '../InlineModal';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { Typography } from '../../theme/typography';

const ICON_A = require('../../../assets/ui/control-buttons/a.png');
const ICON_B = require('../../../assets/ui/control-buttons/b.png');
const ICON_START = require('../../../assets/ui/control-buttons/start.png');
const ICON_SELECT = require('../../../assets/ui/control-buttons/select.png');

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['CASE', 'SPACE', '←', 'OK'],
];

interface ControllerKeyboardProps {
  visible: boolean;
  value: string;
  maxLength?: number;
  placeholder?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function ControllerKeyboard({
  visible,
  value,
  maxLength = 32,
  placeholder = '',
  onSubmit,
  onCancel,
}: ControllerKeyboardProps) {
  const isCompact = useScreenVariant() === 'compact';
  const [text, setText] = useState(value);
  const [cursor, setCursor] = useState({ row: 0, col: 0 });
  const [isUpper, setIsUpper] = useState(true);

  // Keep a ref so confirm/pressKey always read latest text
  const textRef = useRef(text);
  textRef.current = text;

  // Reset state when opening
  useEffect(() => {
    if (visible) {
      setText(value);
      setCursor({ row: 0, col: 0 });
      setIsUpper(true);
    }
  }, [visible, value]);

  const pressKey = useCallback(() => {
    const row = ROWS[cursor.row];
    const key = row[cursor.col];

    if (key === 'CASE') {
      setIsUpper((prev) => !prev);
    } else if (key === 'SPACE') {
      setText((prev) => (prev.length < maxLength ? prev + ' ' : prev));
    } else if (key === '←') {
      setText((prev) => prev.slice(0, -1));
    } else if (key === 'OK') {
      onSubmit(textRef.current);
    } else {
      const char = isUpper ? key : key.toLowerCase();
      setText((prev) => (prev.length < maxLength ? prev + char : prev));
    }
  }, [cursor, isUpper, maxLength, onSubmit]);

  const backspace = useCallback(() => {
    setText((prev) => prev.slice(0, -1));
  }, []);

  const confirm = useCallback(() => {
    onSubmit(textRef.current);
  }, [onSubmit]);

  const moveUp = useCallback(() => {
    setCursor((prev) => {
      if (prev.row === 0) return prev;
      const newRow = prev.row - 1;
      return { row: newRow, col: Math.min(prev.col, ROWS[newRow].length - 1) };
    });
  }, []);

  const moveDown = useCallback(() => {
    setCursor((prev) => {
      if (prev.row === ROWS.length - 1) return prev;
      const newRow = prev.row + 1;
      return { row: newRow, col: Math.min(prev.col, ROWS[newRow].length - 1) };
    });
  }, []);

  const moveLeft = useCallback(() => {
    setCursor((prev) => (prev.col > 0 ? { ...prev, col: prev.col - 1 } : prev));
  }, []);

  const moveRight = useCallback(() => {
    setCursor((prev) => {
      const maxCol = ROWS[prev.row].length - 1;
      return prev.col < maxCol ? { ...prev, col: prev.col + 1 } : prev;
    });
  }, []);

  useControllerAction(
    {
      onA: pressKey,
      onB: backspace,
      onStart: confirm,
      onSelect: onCancel,
      onDPadUp: moveUp,
      onDPadDown: moveDown,
      onDPadLeft: moveLeft,
      onDPadRight: moveRight,
    },
    visible
  );

  if (!visible) return null;

  // Sizing — compact is the 1240×1080 simulator (primary use case)
  const keyW = isCompact ? 56 : 38;
  const keyH = isCompact ? 50 : 34;
  const gap = isCompact ? 6 : 4;
  const specialWidths: Record<string, number> = {
    CASE: isCompact ? 80 : 54,
    SPACE: isCompact ? 140 : 96,
    '←': keyW,
    OK: isCompact ? 80 : 54,
  };
  const iconSize = isCompact ? 24 : 16;

  return (
    <InlineModal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.panel, isCompact && styles.panelCompact]}>
          {/* Title */}
          <Text style={[styles.title, isCompact && styles.titleCompact]}>ENTER NAME</Text>

          {/* Text preview */}
          <View style={[styles.previewRow, isCompact && styles.previewRowCompact]}>
            <Text
              style={[
                styles.previewText,
                isCompact && styles.previewTextCompact,
                !text && styles.previewPlaceholder,
              ]}
              numberOfLines={1}
            >
              {text || placeholder}
              <Text style={styles.previewCursor}>_</Text>
            </Text>
            <Text style={[styles.charCount, isCompact && styles.charCountCompact]}>
              {text.length}/{maxLength}
            </Text>
          </View>

          {/* Keyboard rows */}
          <View style={[styles.keyboard, { gap }]}>
            {ROWS.map((row, rowIdx) => (
              <View key={rowIdx} style={[styles.keyRow, { gap }]}>
                {row.map((key, colIdx) => {
                  const isSelected = cursor.row === rowIdx && cursor.col === colIdx;
                  const isSpecial = rowIdx === 3;
                  const w = isSpecial ? (specialWidths[key] ?? keyW) : keyW;

                  let label: string;
                  if (key === 'CASE') {
                    label = isUpper ? 'abc' : 'ABC';
                  } else if (key.length === 1 && key >= 'A' && key <= 'Z') {
                    label = isUpper ? key : key.toLowerCase();
                  } else {
                    label = key;
                  }

                  return (
                    <View
                      key={key}
                      style={[
                        styles.key,
                        { width: w, height: keyH },
                        isSpecial && styles.specialKey,
                        isSelected && styles.keySelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.keyText,
                          isCompact && styles.keyTextCompact,
                          isSpecial && styles.specialKeyText,
                          isCompact && isSpecial && styles.specialKeyTextCompact,
                          isSelected && styles.keyTextSelected,
                        ]}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Inline hints */}
          <View style={[styles.hints, isCompact && styles.hintsCompact]}>
            {(
              [
                [ICON_A, 'Select'],
                [ICON_B, 'Delete'],
                [ICON_START, 'Confirm'],
                [ICON_SELECT, 'Cancel'],
              ] as const
            ).map(([icon, label]) => (
              <View key={label} style={styles.hintItem}>
                <Image
                  source={icon}
                  style={{ width: iconSize, height: iconSize }}
                  resizeMode="contain"
                />
                <Text style={[styles.hintLabel, isCompact && styles.hintLabelCompact]}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </InlineModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    backgroundColor: '#EFE9D6',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#c8b99a',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  panelCompact: {
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 16,
    borderWidth: 3,
  },
  title: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#3d2b1f',
    letterSpacing: 2,
    marginBottom: 8,
  },
  titleCompact: {
    fontSize: 22,
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#f4e4bc',
    borderWidth: 1,
    borderColor: '#c8b99a',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  previewRowCompact: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
    borderRadius: 8,
  },
  previewText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#3d2b1f',
    flex: 1,
  },
  previewTextCompact: {
    fontSize: 20,
  },
  previewPlaceholder: {
    color: '#999',
  },
  previewCursor: {
    color: '#8b7355',
  },
  charCount: {
    fontFamily: Typography.number,
    fontSize: 10,
    color: '#8b7355',
    marginLeft: 8,
  },
  charCountCompact: {
    fontSize: 16,
  },
  keyboard: {
    alignItems: 'center',
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  key: {
    backgroundColor: '#f4e4bc',
    borderWidth: 1,
    borderColor: '#c8b99a',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialKey: {
    backgroundColor: '#e8d8b0',
  },
  keySelected: {
    backgroundColor: '#8b7355',
    borderColor: '#6b5535',
  },
  keyText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: '#3d2b1f',
  },
  keyTextCompact: {
    fontSize: 18,
  },
  specialKeyText: {
    fontSize: 9,
    fontFamily: Typography.stat,
  },
  specialKeyTextCompact: {
    fontSize: 14,
  },
  keyTextSelected: {
    color: '#f4e4bc',
  },
  hints: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 12,
  },
  hintsCompact: {
    gap: 20,
    marginTop: 18,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hintLabel: {
    fontFamily: Typography.body,
    fontSize: 9,
    color: '#3d2b1f',
  },
  hintLabelCompact: {
    fontSize: 14,
  },
});
