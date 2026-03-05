/**
 * Controller button hints overlay.
 * Shown in the bottom-left corner when input mode is 'controller'.
 * Displays contextual button mappings so users know which controller
 * buttons perform which actions on the current screen.
 */
import React from 'react';
import { View, Image, Text, StyleSheet, type ImageSourcePropType } from 'react-native';
import { useInputMode } from '../../hooks/useInputMode';
import { useScreenVariant } from '../../contexts/ScreenVariantContext';

const ICON_A = require('../../../assets/ui/control-buttons/a.webp');
const ICON_B = require('../../../assets/ui/control-buttons/b.webp');
const ICON_X = require('../../../assets/ui/control-buttons/x.webp');
const ICON_Y = require('../../../assets/ui/control-buttons/y.webp');
const ICON_L1 = require('../../../assets/ui/control-buttons/l1.webp');
const ICON_R1 = require('../../../assets/ui/control-buttons/r1.webp');
const ICON_START = require('../../../assets/ui/control-buttons/start.webp');
const ICON_SELECT = require('../../../assets/ui/control-buttons/select.webp');
const ICON_DIRECTION = require('../../../assets/ui/control-buttons/direction.webp');
const ICON_DPAD = require('../../../assets/ui/control-buttons/d-pad.webp');

const FACE_ICONS: Record<string, ImageSourcePropType> = {
  A: ICON_A,
  B: ICON_B,
  X: ICON_X,
  Y: ICON_Y,
  L1: ICON_L1,
  R1: ICON_R1,
  Start: ICON_START,
  Select: ICON_SELECT,
};

const DIRECTION_ROTATIONS: Record<string, string> = {
  DPadUp: '0deg',
  DPadDown: '180deg',
  DPadLeft: '-90deg',
  DPadRight: '90deg',
};

export type HintButton =
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'L1'
  | 'R1'
  | 'L1R1'
  | 'Start'
  | 'Select'
  | 'DPadUp'
  | 'DPadDown'
  | 'DPadLeft'
  | 'DPadRight'
  | 'DPadLeftRight'
  | 'DPadUpDown'
  | 'DPad';

export interface ButtonHint {
  button: HintButton;
  label: string;
}

function ButtonIcon({ button, size }: { button: HintButton; size: number }) {
  if (button === 'L1R1') {
    return (
      <View style={iconStyles.compound}>
        <Image source={ICON_L1} style={{ width: size, height: size }} resizeMode="contain" />
        <Image source={ICON_R1} style={{ width: size, height: size }} resizeMode="contain" />
      </View>
    );
  }

  if (button === 'DPadLeftRight') {
    return (
      <View style={iconStyles.compound}>
        <Image
          source={ICON_DIRECTION}
          style={{ width: size, height: size, transform: [{ rotate: '-90deg' }] }}
          resizeMode="contain"
        />
        <Image
          source={ICON_DIRECTION}
          style={{ width: size, height: size, transform: [{ rotate: '90deg' }] }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (button === 'DPadUpDown') {
    return (
      <View style={iconStyles.compound}>
        <Image source={ICON_DIRECTION} style={{ width: size, height: size }} resizeMode="contain" />
        <Image
          source={ICON_DIRECTION}
          style={{ width: size, height: size, transform: [{ rotate: '180deg' }] }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const rotation = DIRECTION_ROTATIONS[button];
  if (rotation) {
    return (
      <Image
        source={ICON_DIRECTION}
        style={{ width: size, height: size, transform: [{ rotate: rotation }] }}
        resizeMode="contain"
      />
    );
  }

  if (button === 'DPad') {
    return <Image source={ICON_DPAD} style={{ width: size, height: size }} resizeMode="contain" />;
  }

  const source = FACE_ICONS[button];
  if (!source) return null;

  return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
}

interface ControllerHintsProps {
  hints: ButtonHint[];
  /** Render hints in a horizontal row instead of vertical stack */
  horizontal?: boolean;
  /** Render hints in a grid with this many columns */
  columns?: number;
  /** Position the hints on the right side instead of the default left */
  align?: 'left' | 'right';
  noBackground?: boolean;
  size?: 'normal' | 'large';
}

export function ControllerHints({
  hints,
  horizontal,
  columns,
  align = 'left',
  noBackground,
  size = 'normal',
}: ControllerHintsProps) {
  const inputMode = useInputMode();
  const isCompact = useScreenVariant() === 'compact';

  if (inputMode !== 'controller' || hints.length === 0) return null;

  const baseIconSize = isCompact ? 30 : 20;
  const iconSize = size === 'large' ? baseIconSize * 1.3 : baseIconSize;
  const isRight = align === 'right';
  const dpadHint = !horizontal ? hints.find((h) => h.button === 'DPad') : undefined;
  const regularHints = dpadHint ? hints.filter((h) => h.button !== 'DPad') : hints;

  const hintRows = regularHints.map((hint, i) => (
    <View key={i} style={styles.hintRow}>
      <View style={[styles.iconWrap, { minWidth: iconSize + 8 }]}>
        <ButtonIcon button={hint.button} size={iconSize} />
      </View>
      <Text
        style={[
          styles.label,
          isCompact && styles.labelCompact,
          size === 'large' && { fontSize: isCompact ? 22 : 14 },
        ]}
      >
        {hint.label}
      </Text>
    </View>
  ));

  const positionStyle = isRight
    ? isCompact
      ? styles.containerRight
      : styles.containerRightBase
    : undefined;

  if (dpadHint) {
    const dpadSize = isCompact ? 60 : 40;
    return (
      <View
        style={[
          styles.container,
          isCompact && styles.containerCompact,
          styles.containerRow,
          isCompact && styles.containerRowCompact,
          positionStyle,
          noBackground && styles.noBackground,
        ]}
      >
        <View style={{ gap: isCompact ? 10 : 6 }}>{hintRows}</View>
        <View style={styles.dpadColumn}>
          <Image
            source={ICON_DPAD}
            style={{ width: dpadSize, height: dpadSize }}
            resizeMode="contain"
          />
          <Text style={[styles.dpadLabel, isCompact && styles.dpadLabelCompact]}>
            {dpadHint.label}
          </Text>
        </View>
      </View>
    );
  }

  if (columns && columns > 1) {
    const rows: React.ReactNode[][] = [];
    for (let i = 0; i < hintRows.length; i += columns) {
      rows.push(hintRows.slice(i, i + columns));
    }
    return (
      <View
        style={[
          styles.container,
          isCompact && styles.containerCompact,
          positionStyle,
          noBackground && styles.noBackground,
        ]}
      >
        {rows.map((row, ri) => (
          <View key={ri} style={[styles.containerRow, isCompact && styles.containerRowCompact]}>
            {row}
          </View>
        ))}
      </View>
    );
  }

  if (horizontal) {
    return (
      <View
        style={[
          styles.container,
          isCompact && styles.containerCompact,
          styles.containerRow,
          isCompact && styles.containerRowCompact,
          positionStyle,
          noBackground && styles.noBackground,
        ]}
      >
        {hintRows}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        isCompact && styles.containerCompact,
        positionStyle,
        noBackground && styles.noBackground,
      ]}
    >
      {hintRows}
    </View>
  );
}

const iconStyles = StyleSheet.create({
  compound: {
    flexDirection: 'row',
    gap: 1,
  },
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: '#EFE9D6',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#c8b99a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    zIndex: 100,
  },
  containerCompact: {
    bottom: 24,
    left: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    borderRadius: 12,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#3d2b1f',
    fontSize: 11,
    fontFamily: 'IMFellEnglish-Regular',
    letterSpacing: 0.3,
  },
  labelCompact: {
    fontSize: 18,
  },
  containerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  containerRowCompact: {
    gap: 24,
  },
  noBackground: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  dpadColumn: {
    alignItems: 'center',
  },
  dpadLabel: {
    color: '#3d2b1f',
    fontSize: 9,
    fontFamily: 'IMFellEnglish-Regular',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  dpadLabelCompact: {
    fontSize: 14,
    marginTop: 6,
  },
  containerRightBase: {
    left: 'auto' as any,
    right: 14,
  },
  containerRight: {
    left: 'auto' as any,
    right: 24,
  },
});
