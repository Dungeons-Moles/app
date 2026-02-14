import React from 'react';
import { View, StyleSheet, type ModalProps } from 'react-native';

/**
 * Web — renders an absolutely-positioned overlay inline instead of a portal,
 * so it stays contained within the PSG1 simulator's viewport.
 */
export function InlineModal({ visible, transparent, animationType, children, onRequestClose }: ModalProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});
