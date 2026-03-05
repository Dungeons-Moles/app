/**
 * On-screen numeric keypad for controller mode.
 * Same pattern as ControllerKeyboard but only numbers + decimal point.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { InlineModal } from '../InlineModal';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { Typography } from '../../theme/typography';

const ICON_A = require('../../../assets/ui/control-buttons/a.webp');
const ICON_B = require('../../../assets/ui/control-buttons/b.webp');
const ICON_START = require('../../../assets/ui/control-buttons/start.webp');
const ICON_SELECT = require('../../../assets/ui/control-buttons/select.webp');

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '←'],
];

interface ControllerNumpadProps {
  visible: boolean;
  value: string;
  title?: string;
  placeholder?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function ControllerNumpad({
  visible,
  value,
  title = 'ENTER PRICE',
  placeholder = '0.00',
  onSubmit,
  onCancel,
}: ControllerNumpadProps) {
  const isCompact = useScreenVariant() === 'compact';
  const [text, setText] = useState(value);
  const [cursor, setCursor] = useState({ row: 0, col: 0 });

  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    if (visible) {
      setText(value);
      setCursor({ row: 0, col: 0 });
    }
  }, [visible, value]);

  const pressKey = useCallback(() => {
    const row = ROWS[cursor.row];
    const key = row[cursor.col];

    if (key === '←') {
      setText((prev) => prev.slice(0, -1));
    } else if (key === '.') {
      setText((prev) => {
        if (prev.includes('.')) return prev;
        return prev.length === 0 ? '0.' : prev + '.';
      });
    } else {
      setText((prev) => {
        if (prev === '0' && key !== '.') return key;
        if (prev.includes('.') && prev.split('.')[1].length >= 4) return prev;
        return prev + key;
      });
    }
  }, [cursor]);

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

  const keyW = isCompact ? 64 : 44;
  const keyH = isCompact ? 56 : 38;
  const gap = isCompact ? 8 : 5;
  const iconSize = isCompact ? 24 : 16;

  return (
    <InlineModal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.panel, isCompact && styles.panelCompact]}>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>{title}</Text>

          {/* Value preview */}
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
            <Text style={[styles.solSuffix, isCompact && styles.solSuffixCompact]}>SOL</Text>
          </View>

          {/* Numpad grid */}
          <View style={[styles.keyboard, { gap }]}>
            {ROWS.map((row, rowIdx) => (
              <View key={rowIdx} style={[styles.keyRow, { gap }]}>
                {row.map((key, colIdx) => {
                  const isSelected = cursor.row === rowIdx && cursor.col === colIdx;

                  return (
                    <View
                      key={key}
                      style={[
                        styles.key,
                        { width: keyW, height: keyH },
                        isSelected && styles.keySelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.keyText,
                          isCompact && styles.keyTextCompact,
                          isSelected && styles.keyTextSelected,
                        ]}
                      >
                        {key}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Hints */}
          <View style={[styles.hints, isCompact && styles.hintsCompact]}>
            {(
              [
                [ICON_A, 'Type'],
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
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  panelCompact: {
    paddingVertical: 24,
    paddingHorizontal: 36,
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
    fontFamily: Typography.number,
    fontSize: 16,
    color: '#3d2b1f',
    flex: 1,
    textAlign: 'right',
  },
  previewTextCompact: {
    fontSize: 24,
  },
  previewPlaceholder: {
    color: '#999',
  },
  previewCursor: {
    color: '#8b7355',
  },
  solSuffix: {
    fontFamily: Typography.stat,
    fontSize: 14,
    color: '#5c4033',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  solSuffixCompact: {
    fontSize: 22,
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
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySelected: {
    backgroundColor: '#8b7355',
    borderColor: '#6b5535',
  },
  keyText: {
    fontFamily: Typography.number,
    fontSize: 16,
    color: '#3d2b1f',
  },
  keyTextCompact: {
    fontSize: 24,
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
