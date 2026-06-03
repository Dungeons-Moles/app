import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View, DeviceEventEmitter, NativeModules, Platform, useWindowDimensions } from 'react-native';
import {
  Psg1InputProvider,
  emitAndroidGamepadEvent,
  type AndroidGamepadNativeEvent,
} from 'psg1-sim';
import { ScreenVariantProvider } from '../contexts/ScreenVariantContext';
import { ScaledCanvas } from './ScaledCanvas';
import { setInputModeController, setInputModeTouch } from '../hooks/useInputMode';
import { setNativeGamepadMotion } from '../hooks/useNativeGamepadMotion';

type UnknownRecord = Record<string, unknown>;

const KEY_NAME_TO_CODE: Record<string, number> = {
  // D-pad
  dpad_up: 19,
  dpad_down: 20,
  dpad_left: 21,
  dpad_right: 22,
  arrow_up: 19,
  arrow_down: 20,
  arrow_left: 21,
  arrow_right: 22,
  // Face buttons
  button_a: 96,
  button_b: 97,
  button_x: 99,
  button_y: 100,
  // Shoulder / start/select
  button_l1: 102,
  button_r1: 103,
  button_start: 108,
  button_select: 109,
  enter: 108,
  back: 109,
};

function normalizeAction(value: unknown, evt: UnknownRecord): AndroidGamepadNativeEvent['action'] | null {
  if (value === 0 || value === 1) return value;

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\s+/g, '').replace(/^action_/, '');
    if (normalized === 'down' || normalized === 'buttondown' || normalized === 'keydown') {
      return 'down';
    }
    if (normalized === 'up' || normalized === 'buttonup' || normalized === 'keyup') {
      return 'up';
    }
  }

  if (typeof evt.pressed === 'boolean') {
    return evt.pressed ? 'down' : 'up';
  }

  if (typeof evt.isDown === 'boolean') {
    return evt.isDown ? 'down' : 'up';
  }

  return null;
}

function normalizeKeyCode(value: unknown, evt: UnknownRecord): number | null {
  const readNumeric = (candidate: unknown): number | null => {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  const direct = readNumeric(value);
  if (direct != null) return direct;

  if (typeof value === 'string') {
    const normalized = value
      .toLowerCase()
      .replace(/^keycode_/, '')
      .replace(/^button_/, 'button_')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (KEY_NAME_TO_CODE[normalized] != null) return KEY_NAME_TO_CODE[normalized];
  }

  // Some native bridges send button as index; map common indices used by web gamepad.
  const buttonIndex = readNumeric(evt.button);
  if (buttonIndex != null) {
    if (buttonIndex === 0) return 96; // A -> Cross
    if (buttonIndex === 1) return 97; // B -> Circle
    if (buttonIndex === 2) return 99; // X -> Square
    if (buttonIndex === 3) return 100; // Y -> Triangle
    if (buttonIndex === 4) return 102; // L1
    if (buttonIndex === 5) return 103; // R1
    if (buttonIndex === 8) return 109; // Select
    if (buttonIndex === 9) return 108; // Start
    if (buttonIndex === 12) return 19; // DPad Up
    if (buttonIndex === 13) return 20; // DPad Down
    if (buttonIndex === 14) return 21; // DPad Left
    if (buttonIndex === 15) return 22; // DPad Right
  }

  return null;
}

function normalizeAndroidEvent(rawEvt: UnknownRecord): AndroidGamepadNativeEvent | null {
  const evt =
    rawEvt && typeof rawEvt.nativeEvent === 'object'
      ? (rawEvt.nativeEvent as UnknownRecord)
      : rawEvt;

  const action = normalizeAction(evt.action ?? evt.eventType ?? evt.type ?? evt.keyAction, evt);
  if (action == null) return null;

  const keyCode = normalizeKeyCode(
    evt.keyCode ?? evt.keycode ?? evt.code ?? evt.androidKeyCode ?? evt.key,
    evt
  );
  if (keyCode == null) return null;

  const repeatCount =
    typeof evt.repeatCount === 'number'
      ? evt.repeatCount
      : typeof evt.repeat === 'number'
        ? evt.repeat
        : undefined;
  const deviceId = typeof evt.deviceId === 'number' ? evt.deviceId : undefined;
  const source = typeof evt.source === 'number' ? evt.source : undefined;

  return { keyCode, action, repeatCount, deviceId, source };
}

function normalizeMotionEvent(
  rawEvt: UnknownRecord
): { leftStickX: number; leftStickY: number; rightStickX?: number; rightStickY?: number } | null {
  const evt =
    rawEvt && typeof rawEvt.nativeEvent === 'object'
      ? (rawEvt.nativeEvent as UnknownRecord)
      : rawEvt;

  const readNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  const leftX = readNumber(evt.leftStickX ?? evt.leftX ?? evt.x);
  const leftY = readNumber(evt.leftStickY ?? evt.leftY ?? evt.y);
  if (leftX == null || leftY == null) return null;

  const rightX = readNumber(evt.rightStickX ?? evt.rightX);
  const rightY = readNumber(evt.rightStickY ?? evt.rightY);
  return {
    leftStickX: leftX,
    leftStickY: leftY,
    rightStickX: rightX ?? undefined,
    rightStickY: rightY ?? undefined,
  };
}

/**
 * Native fallback — no simulator shell, derives variant from actual screen dimensions.
 * Wraps with Psg1InputProvider so usePsg1Gamepad() has a valid context.
 *
 * On Android, the GamepadBridgeModule (registered as a ReactPackage NativeModule)
 * emits "onGamepadEvent" via RCTDeviceEventEmitter using the ReactApplicationContext
 * from the module loading system. This context has the bridge interop layer that
 * properly delivers events to JS DeviceEventEmitter in bridgeless mode.
 *
 * Events are forwarded into psg1-sim's InputStore via `emitAndroidGamepadEvent()`.
 *
 * The outer View uses onStartShouldSetResponderCapture to detect any touch on
 * the screen and switch the input mode back to 'touch' (from 'controller').
 * Returning false means we never actually claim the responder, so child touch
 * handling is completely unaffected.
 */
export function Psg1Wrapper({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const variant = width / height < 1.4 ? 'compact' : 'wide';

  // Console (compact) devices like the PSG1 are controller-first — start in
  // controller mode so button hints and focus highlights show immediately,
  // without needing an initial button press. A screen touch still switches
  // back to touch mode via the responder capture below.
  useEffect(() => {
    if (variant === 'compact') {
      setInputModeController();
    }
  }, [variant]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Touch the native module so it is initialized in lazy module setups.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    NativeModules.GamepadBridge;

    const subscription = DeviceEventEmitter.addListener(
      'onGamepadEvent',
      (evt: Record<string, unknown>) => {
        const normalized = normalizeAndroidEvent(evt);
        if (!normalized) return;
        emitAndroidGamepadEvent(normalized);
      }
    );
    const motionSubscription = DeviceEventEmitter.addListener(
      'onGamepadMotion',
      (evt: Record<string, unknown>) => {
        const motion = normalizeMotionEvent(evt);
        if (!motion) return;
        setNativeGamepadMotion(motion);

        const active = Math.abs(motion.leftStickX) > 0.12 || Math.abs(motion.leftStickY) > 0.12;
        if (active) setInputModeController();
      }
    );

    return () => {
      subscription.remove();
      motionSubscription.remove();
    };
  }, []);

  return (
    <Psg1InputProvider>
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={() => {
          setInputModeTouch();
          return false;
        }}
      >
        <ScreenVariantProvider variant={variant}>
          <ScaledCanvas>{children}</ScaledCanvas>
        </ScreenVariantProvider>
      </View>
    </Psg1InputProvider>
  );
}
