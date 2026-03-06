import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, TextStyle } from 'react-native';
import { CachedImage as Image } from '../common/CachedImage';
import { Typography } from '../../theme/typography';

const squareFrameSource = require('../../../assets/ui/frames/square.webp');

interface CheckboxProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  size?: number;
  labelStyle?: TextStyle;
}

export function Checkbox({ label, checked, onToggle, size = 20, labelStyle }: CheckboxProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onToggle} activeOpacity={0.7}>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
      <View style={[styles.box, { width: size, height: size }]}>
        <Image source={squareFrameSource} style={styles.frame} resizeMode="stretch" />
        {checked && <Text style={[styles.x, { fontSize: size * 0.7 }]}>x</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  label: {
    fontFamily: Typography.header,
    fontSize: 14,
    color: '#3d2b1f',
  },
  box: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  x: {
    fontFamily: Typography.header,
    color: '#3d2b1f',
    lineHeight: undefined,
    textAlign: 'center',
  },
});
