import React, { useEffect } from 'react';
import { View, StyleSheet, BackHandler, type ModalProps } from 'react-native';

/**
 * Native — renders an absolutely-positioned in-tree overlay instead of RN's
 * <Modal>.
 *
 * RN's <Modal> renders its content in a separate native window. That window
 * takes hardware key / joystick focus away from MainActivity, and the PSG1
 * gamepad bridge (dispatchKeyEvent / dispatchGenericMotionEvent) lives only on
 * MainActivity. So while a <Modal> is open the bridge never sees D-pad / button
 * events — `onGamepadEvent` stops emitting and controller navigation silently
 * dies for the whole app until the modal closes.
 *
 * Rendering inline keeps modal content in the same window (and inside the root
 * ScaledCanvas), so gamepad events keep flowing and useControllerAction works
 * exactly as it does on a regular screen. This mirrors InlineModal.web.tsx.
 *
 * `onRequestClose` is wired to the Android hardware back button so that phone
 * (wide-variant) users keep the back-to-dismiss behaviour <Modal> gave them.
 */
export function InlineModal({ visible, children, onRequestClose }: ModalProps) {
  useEffect(() => {
    if (!visible || !onRequestClose) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose({
        nativeEvent: {},
      } as Parameters<NonNullable<ModalProps['onRequestClose']>>[0]);
      return true;
    });
    return () => sub.remove();
  }, [visible, onRequestClose]);

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
