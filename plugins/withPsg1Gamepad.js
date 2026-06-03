/**
 * Expo config plugin — withPsg1Gamepad
 *
 * React Native does not forward hardware gamepad input to JS on its own, and
 * this project has no native module providing it (Psg1Wrapper.tsx listens for
 * "onGamepadEvent" / "onGamepadMotion" DeviceEventEmitter events that nothing
 * emits). Without this, the PSG1 controller does nothing — input mode never
 * leaves 'touch', so ControllerHints and controller navigation never activate.
 *
 * This plugin overrides MainActivity.dispatchKeyEvent() and
 * onGenericMotionEvent() to capture gamepad button + analog-stick input and
 * emit it to JS as the events Psg1Wrapper already consumes.
 *
 * The android/ directory is gitignored (Expo CNG), so this plugin is what makes
 * the change survive `expo prebuild` / clean builds. It needs no native module
 * registration — emitting via the Activity's React context is enough.
 */
const { withMainActivity } = require('@expo/config-plugins');

const MARKER = '@generated begin psg1-gamepad';

const IMPORTS = [
  'android.view.InputDevice',
  'android.view.KeyEvent',
  'android.view.MotionEvent',
  'com.facebook.react.ReactApplication',
  'com.facebook.react.bridge.Arguments',
  'com.facebook.react.bridge.ReactContext',
  'com.facebook.react.bridge.WritableMap',
  'com.facebook.react.modules.core.DeviceEventManagerModule',
];

const METHODS = `
  // @generated begin psg1-gamepad - withPsg1Gamepad config plugin (DO NOT MODIFY)
  /**
   * Hardware gamepad bridge. MainActivity receives the KeyEvent / MotionEvent
   * for the PSG1 controller; we forward them to JS as "onGamepadEvent" /
   * "onGamepadMotion" DeviceEventEmitter events, which Psg1Wrapper consumes.
   */
  private val psg1GamepadKeyCodes: Set<Int> = setOf(
    KeyEvent.KEYCODE_DPAD_UP,
    KeyEvent.KEYCODE_DPAD_DOWN,
    KeyEvent.KEYCODE_DPAD_LEFT,
    KeyEvent.KEYCODE_DPAD_RIGHT,
    KeyEvent.KEYCODE_BUTTON_A,
    KeyEvent.KEYCODE_BUTTON_B,
    KeyEvent.KEYCODE_BUTTON_X,
    KeyEvent.KEYCODE_BUTTON_Y,
    KeyEvent.KEYCODE_BUTTON_L1,
    KeyEvent.KEYCODE_BUTTON_R1,
    KeyEvent.KEYCODE_BUTTON_THUMBL,
    KeyEvent.KEYCODE_BUTTON_THUMBR,
    KeyEvent.KEYCODE_BUTTON_START,
    KeyEvent.KEYCODE_BUTTON_SELECT
  )

  private var psg1HatX: Int = 0
  private var psg1HatY: Int = 0

  private fun psg1EmitEvent(eventName: String, params: WritableMap) {
    try {
      val app = application as? ReactApplication ?: return
      val reactContext: ReactContext = app.reactHost?.currentReactContext ?: return
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
    } catch (e: Throwable) {
      // React context not ready yet — drop the event.
    }
  }

  private fun psg1EmitKey(keyCode: Int, action: Int) {
    val params = Arguments.createMap()
    params.putInt("keyCode", keyCode)
    params.putInt("action", action)
    params.putInt("repeatCount", 0)
    psg1EmitEvent("onGamepadEvent", params)
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val action = event.action
    if (psg1GamepadKeyCodes.contains(event.keyCode) &&
      (action == KeyEvent.ACTION_DOWN || action == KeyEvent.ACTION_UP)
    ) {
      val params = Arguments.createMap()
      params.putInt("keyCode", event.keyCode)
      params.putInt("action", action)
      params.putInt("repeatCount", event.repeatCount)
      params.putInt("deviceId", event.deviceId)
      params.putInt("source", event.source)
      psg1EmitEvent("onGamepadEvent", params)
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
    if (event.source and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK &&
      event.action == MotionEvent.ACTION_MOVE
    ) {
      // The PSG1 D-pad is a HAT axis (ABS_HAT0X/Y), not key events — translate
      // HAT axis changes into synthetic D-pad key-down / key-up events.
      val hatX = Math.round(event.getAxisValue(MotionEvent.AXIS_HAT_X))
      if (hatX != psg1HatX) {
        if (psg1HatX < 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_UP)
        if (psg1HatX > 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_UP)
        if (hatX < 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.ACTION_DOWN)
        if (hatX > 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.ACTION_DOWN)
        psg1HatX = hatX
      }
      val hatY = Math.round(event.getAxisValue(MotionEvent.AXIS_HAT_Y))
      if (hatY != psg1HatY) {
        if (psg1HatY < 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.ACTION_UP)
        if (psg1HatY > 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.ACTION_UP)
        if (hatY < 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.ACTION_DOWN)
        if (hatY > 0) psg1EmitKey(KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.ACTION_DOWN)
        psg1HatY = hatY
      }

      val params = Arguments.createMap()
      params.putDouble("leftStickX", event.getAxisValue(MotionEvent.AXIS_X).toDouble())
      params.putDouble("leftStickY", event.getAxisValue(MotionEvent.AXIS_Y).toDouble())
      params.putDouble("rightStickX", event.getAxisValue(MotionEvent.AXIS_Z).toDouble())
      params.putDouble("rightStickY", event.getAxisValue(MotionEvent.AXIS_RZ).toDouble())
      psg1EmitEvent("onGamepadMotion", params)
      return true
    }
    return super.dispatchGenericMotionEvent(event)
  }
  // @generated end psg1-gamepad
`;

/** Insert `import <importPath>` after the last existing import statement. */
function ensureImport(contents, importPath) {
  const stmt = `import ${importPath}`;
  if (contents.includes(stmt)) {
    return contents;
  }
  const lines = contents.split('\n');
  let insertAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      insertAt = i;
    } else if (insertAt === -1 && lines[i].startsWith('package ')) {
      insertAt = i;
    }
  }
  if (insertAt === -1) {
    throw new Error('withPsg1Gamepad: could not find an anchor to add imports');
  }
  lines.splice(insertAt + 1, 0, stmt);
  return lines.join('\n');
}

const withPsg1Gamepad = (config) => {
  return withMainActivity(config, (cfg) => {
    const { modResults } = cfg;
    if (modResults.language !== 'kt') {
      throw new Error(
        `withPsg1Gamepad: expected a Kotlin MainActivity, got "${modResults.language}"`
      );
    }
    if (modResults.contents.includes(MARKER)) {
      return cfg;
    }
    let contents = modResults.contents;
    for (const imp of IMPORTS) {
      contents = ensureImport(contents, imp);
    }
    // Insert the overrides just before the final closing brace of the class.
    contents = contents.replace(/\}\s*$/, `${METHODS}}\n`);
    modResults.contents = contents;
    return cfg;
  });
};

module.exports = withPsg1Gamepad;
