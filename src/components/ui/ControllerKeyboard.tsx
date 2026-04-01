/**
 * On-screen keyboard for controller mode.
 * Console-game style QWERTY grid navigated entirely with D-pad and face buttons.
 * Used when psg1-sim intercepts physical keys (j→A, k→B, arrows→DPad).
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { InlineModal } from '../InlineModal';
import { useControllerAction } from '../../hooks/useControllerAction';
import { useInputMode } from '../../hooks/useInputMode';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';
import { Typography } from '../../theme/typography';
import { CachedImage as Image } from '../common/CachedImage';

const ICON_A = require('../../../assets/ui/control-buttons/a.webp');
const ICON_B = require('../../../assets/ui/control-buttons/b.webp');
const ICON_START = require('../../../assets/ui/control-buttons/start.webp');
const ICON_SELECT = require('../../../assets/ui/control-buttons/select.webp');

const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ['CASE', 'SPACE', '←', 'OK'],
];

// Split layout for mobile landscape (Samsung-style)
const SPLIT_LEFT = [
  ['Q', 'W', 'E', 'R', 'T'],
  ['A', 'S', 'D', 'F', 'G'],
  ['Z', 'X', 'C', 'V'],
  ['CASE', 'SPACE'],
];
const SPLIT_RIGHT = [
  ['Y', 'U', 'I', 'O', 'P'],
  ['H', 'J', 'K', 'L'],
  ['B', 'N', 'M'],
  ['←', 'OK'],
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
  const isController = useInputMode() === 'controller';
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

  const handleTouchKey = useCallback(
    (key: string) => {
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
    },
    [isUpper, maxLength, onSubmit]
  );

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
  const mobileSpecialWidths: Record<string, number> = {
    CASE: 44,
    SPACE: 80,
    '←': 44,
    OK: 54,
  };
  const iconSize = isCompact ? 24 : 16;

  const renderKey = (key: string, rowIdx: number, colIdx: number, isMobileSplit: boolean) => {
    const isSelected = cursor.row === rowIdx && cursor.col === colIdx;
    const isSpecial = key === 'CASE' || key === 'SPACE' || key === '←' || key === 'OK';
    const widths = isMobileSplit ? mobileSpecialWidths : specialWidths;
    const w = isSpecial ? (widths[key] ?? keyW) : keyW;

    let label: string;
    if (key === 'CASE') {
      label = isUpper ? 'abc' : 'ABC';
    } else if (key.length === 1 && key >= 'A' && key <= 'Z') {
      label = isUpper ? key : key.toLowerCase();
    } else {
      label = key;
    }

    const selected = isSelected && isController;
    const svgSize = isCompact ? 22 : 14;
    const svgColor = selected ? '#f4e4bc' : '#3d2b1f';

    return (
      <Pressable
        key={key}
        style={[
          styles.key,
          { width: w, height: keyH },
          isSpecial && styles.specialKey,
          selected && styles.keySelected,
        ]}
        onPress={() => handleTouchKey(key)}
      >
        {key === '←' ? (
          <Svg width={svgSize} height={svgSize} viewBox="0 0 24 24" fill="none">
            <Path
              d="M9.707 4.293a1 1 0 0 0-1.497.083L2.293 11.293a1 1 0 0 0 0 1.414l5.917 6.917a1 1 0 0 0 1.497.083L10.414 19H20a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-9.586l-.707-.707Z"
              stroke={svgColor}
              strokeWidth={1.8}
            />
            <Path
              d="M16 9l-5 6M11 9l5 6"
              stroke={svgColor}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
        ) : (
          <Text
            style={[
              styles.keyText,
              isCompact && styles.keyTextCompact,
              isSpecial && styles.specialKeyText,
              isCompact && isSpecial && styles.specialKeyTextCompact,
              selected && styles.keyTextSelected,
            ]}
          >
            {label}
          </Text>
        )}
      </Pressable>
    );
  };

  const renderUnifiedKeyboard = () => (
    <View style={[styles.keyboard, { gap }]}>
      {ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={[styles.keyRow, { gap }]}>
          {row.map((key, colIdx) => renderKey(key, rowIdx, colIdx, false))}
        </View>
      ))}
    </View>
  );

  const renderSplitHalf = (rows: string[][]) => (
    <View style={[styles.keyboard, { gap }]}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={[styles.keyRow, { gap }]}>
          {row.map((key, colIdx) => renderKey(key, rowIdx, colIdx, true))}
        </View>
      ))}
    </View>
  );

  // Mobile: cancel top-right, centered input above split keyboard docked to bottom
  if (!isCompact) {
    return (
      <InlineModal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
        <Pressable style={styles.mobileOverlay} onPress={onCancel}>
          {/* Spacer — tap to cancel */}
          <View style={styles.mobileSpacer} />

          {/* Input + split keyboard docked to bottom */}
          <Pressable style={styles.mobileBottom} onPress={() => {}}>
            {/* Input bar with centered input and cancel top-right */}
            <View style={styles.mobileInputBar}>
              {/* Left spacer to balance cancel button */}
              <View style={styles.mobileCancelSpacer} />
              <View style={styles.mobileInputInner}>
                <Text
                  style={[styles.previewText, !text && styles.previewPlaceholder]}
                  numberOfLines={1}
                >
                  {text || placeholder}
                  <Text style={styles.previewCursor}>_</Text>
                </Text>
                <Text style={styles.charCount}>{text.length}/{maxLength}</Text>
              </View>
              <Pressable onPress={onCancel} style={styles.mobileCancelBtn}>
                <Text style={styles.mobileCancelText}>Cancel</Text>
              </Pressable>
            </View>

            {/* Split keyboard */}
            <View style={styles.splitKeyboard}>
              {renderSplitHalf(SPLIT_LEFT)}
              <View style={styles.splitGap} />
              {renderSplitHalf(SPLIT_RIGHT)}
            </View>
          </Pressable>
        </Pressable>
      </InlineModal>
    );
  }

  // Compact / controller: single centered panel
  return (
    <InlineModal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={[styles.panel, styles.panelCompact]} onPress={() => {}}>
          <Text style={[styles.title, styles.titleCompact]}>ENTER NAME</Text>

          <View style={[styles.previewRow, styles.previewRowCompact]}>
            <Text
              style={[
                styles.previewText,
                styles.previewTextCompact,
                !text && styles.previewPlaceholder,
              ]}
              numberOfLines={1}
            >
              {text || placeholder}
              <Text style={styles.previewCursor}>_</Text>
            </Text>
            <Text style={[styles.charCount, styles.charCountCompact]}>
              {text.length}/{maxLength}
            </Text>
          </View>

          {renderUnifiedKeyboard()}

          {isController && (
            <View style={[styles.hints, styles.hintsCompact]}>
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
                  <Text style={[styles.hintLabel, styles.hintLabelCompact]}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
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
    maxWidth: 460,
    width: '90%',
  },
  // --- Mobile split layout ---
  mobileOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  mobileCancelBtn: {
    width: 60,
    alignItems: 'flex-end',
    paddingVertical: 6,
  },
  mobileCancelText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: '#8b7355',
  },
  mobileSpacer: {
    flex: 1,
  },
  mobileBottom: {
    backgroundColor: '#EFE9D6',
    borderTopWidth: 1,
    borderTopColor: '#c8b99a',
    width: '85%',
    alignSelf: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8b99a',
    marginBottom: 6,
  },
  mobileInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#d4c49c',
  },
  mobileCancelSpacer: {
    width: 60,
  },
  mobileInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4e4bc',
    borderWidth: 1,
    borderColor: '#c8b99a',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 320,
    maxWidth: '80%',
  },
  splitKeyboard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  splitGap: {
    width: 24,
  },
  panelCompact: {
    maxWidth: 700,
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
    flex: 1,
    textAlign: 'center',
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
