// Port of crimson/input_codes.py

import { InputState } from '@grim/input.ts';

export const INPUT_CODE_UNBOUND = 0x17E;
const AXIS_DEADZONE = 0.2;
const _AXIS_DOWN_THRESHOLD = 0.5;

// DirectInput key code → DOM keyCode mapping
// These map the original game's DirectInput scan codes to browser keyCode values
const DIK_TO_DOM_KEY: Record<number, number> = {
  0x01: 27,   // Escape
  0x02: 49,   // 1
  0x03: 50,   // 2
  0x04: 51,   // 3
  0x05: 52,   // 4
  0x06: 53,   // 5
  0x07: 54,   // 6
  0x08: 55,   // 7
  0x09: 56,   // 8
  0x0A: 57,   // 9
  0x0B: 48,   // 0
  0x0C: 189,  // -
  0x0D: 187,  // =
  0x0E: 8,    // Backspace
  0x0F: 9,    // Tab
  0x10: 81,   // Q
  0x11: 87,   // W
  0x12: 69,   // E
  0x13: 82,   // R
  0x14: 84,   // T
  0x15: 89,   // Y
  0x16: 85,   // U
  0x17: 73,   // I
  0x18: 79,   // O
  0x19: 80,   // P
  0x1A: 219,  // [
  0x1B: 221,  // ]
  0x1C: 13,   // Enter
  0x1D: 17,   // Left Control
  0x1E: 65,   // A
  0x1F: 83,   // S
  0x20: 68,   // D
  0x21: 70,   // F
  0x22: 71,   // G
  0x23: 72,   // H
  0x24: 74,   // J
  0x25: 75,   // K
  0x26: 76,   // L
  0x27: 186,  // ;
  0x28: 222,  // '
  0x29: 192,  // `
  0x2A: 16,   // Left Shift
  0x2B: 220,  // backslash
  0x2C: 90,   // Z
  0x2D: 88,   // X
  0x2E: 67,   // C
  0x2F: 86,   // V
  0x30: 66,   // B
  0x31: 78,   // N
  0x32: 77,   // M
  0x33: 188,  // ,
  0x34: 190,  // .
  0x35: 191,  // /
  0x36: 16,   // Right Shift (same keyCode as left)
  0x38: 18,   // Left Alt
  0x39: 32,   // Space
  0x3B: 112,  // F1
  0x3C: 113,  // F2
  0x3D: 114,  // F3
  0x3E: 115,  // F4
  0x3F: 116,  // F5
  0x40: 117,  // F6
  0x41: 118,  // F7
  0x42: 119,  // F8
  0x43: 120,  // F9
  0x44: 121,  // F10
  0x57: 122,  // F11
  0x58: 123,  // F12
  0x9D: 17,   // Right Control
  0xC8: 38,   // Up
  0xC9: 33,   // PageUp
  0xCB: 37,   // Left
  0xCD: 39,   // Right
  0xD0: 40,   // Down
  0xD1: 34,   // PageDown
  0xD2: 45,   // Insert
  0xD3: 46,   // Delete
  0xCF: 35,   // End
  0xC7: 36,   // Home
};

// Reverse map: DOM keyCode → DIK code (for capture_first_pressed_input_code)
const DOM_KEY_TO_DIK: Record<number, number> = {};
for (const [dik, dom] of Object.entries(DIK_TO_DOM_KEY)) {
  DOM_KEY_TO_DIK[dom] = Number(dik);
}

// Mouse button codes
const MOUSE_CODE_TO_BUTTON: Record<number, number> = {
  0x100: 0,  // Left
  0x101: 2,  // Right
  0x102: 1,  // Middle
  0x103: 3,  // Side
  0x104: 4,  // Extra
};

const JOYS_BUTTON_CODES: Record<number, number> = {
  0x11F: 0,
  0x120: 1,
  0x121: 2,
  0x122: 3,
  0x123: 12,
  0x124: 15,
  0x125: 13,
  0x126: 14,
  0x127: 4,
  0x128: 5,
  0x129: 6,
  0x12A: 7,
  0x131: 12,
  0x132: 13,
  0x133: 14,
  0x134: 15,
};

const AXIS_CODE_TO_AXIS: Record<number, number> = {
  0x13F: 0,
  0x140: 1,
  // Native Grim maps 0x141 and 0x153 to distinct joystick state fields
  // (lZ vs lRx in grim_get_config_float @ 0x100071b0), so keep them distinct.
  // On raylib backends this is approximated with separate right-stick axes.
  0x141: 3,
  0x153: 2,
  0x154: 3,
  0x155: 5,
};

const RIM_AXIS_CODES: Record<number, [number, number]> = {
  0x163: [0, 0],
  0x164: [1, 0],
  0x165: [2, 0],
  0x168: [0, 1],
  0x169: [1, 1],
  0x16A: [2, 1],
};

const RIM_BUTTON_CODES: Record<number, [number, number]> = {
  0x16D: [0, 0],
  0x16E: [0, 1],
  0x16F: [0, 2],
  0x170: [0, 3],
  0x171: [0, 4],
  0x172: [1, 0],
  0x173: [1, 1],
  0x174: [1, 2],
  0x175: [1, 3],
  0x176: [1, 4],
  0x177: [2, 0],
  0x178: [2, 1],
  0x179: [2, 2],
  0x17A: [2, 3],
  0x17B: [2, 4],
};

class PressedState {
  prevDown = new Map<string, boolean>();
  down = new Map<string, boolean>();
  pressedCache = new Map<string, boolean>();
  wheelUp = false;
  wheelDown = false;

  private _key(playerIndex: number, keyCode: number): string {
    return `${playerIndex},${keyCode}`;
  }

  beginFrame(): void {
    this.prevDown = new Map(this.down);
    this.pressedCache.clear();
    const wheelDelta = InputState.mouseWheelDelta();
    this.wheelUp = wheelDelta > 0;
    this.wheelDown = wheelDelta < 0;
  }

  markDown(opts: { playerIndex: number; keyCode: number; isDown: boolean }): boolean {
    this.down.set(this._key(opts.playerIndex, opts.keyCode), opts.isDown);
    return opts.isDown;
  }

  isPressed(opts: { playerIndex: number; keyCode: number; isDown: boolean }): boolean {
    const key = this._key(opts.playerIndex, opts.keyCode);
    const cached = this.pressedCache.get(key);
    if (cached !== undefined) return cached;
    const prev = this.prevDown.get(key) ?? false;
    const pressed = opts.isDown && !prev;
    this.down.set(key, opts.isDown);
    this.pressedCache.set(key, pressed);
    return pressed;
  }
}

const _pressedState = new PressedState();
const PRIMARY_EDGE_SENTINEL_PLAYER = -1;
const PRIMARY_EDGE_SENTINEL_KEY = -1;

export function inputBeginFrame(): void {
  _pressedState.beginFrame();
}

function _playerGamepadIndex(playerIndex: number): number {
  return Math.max(0, Math.min(3, int(playerIndex)));
}

function _gamepadForIndex(gamepadIndex: number): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return null;
  }
  return navigator.getGamepads()[int(gamepadIndex)] ?? null;
}

function _isGamepadAvailable(gamepadIndex: number): boolean {
  return _gamepadForIndex(int(gamepadIndex)) !== null;
}

function _axisValueForGamepad(gamepadIndex: number, axis: number): number {
  const gamepad = _gamepadForIndex(int(gamepadIndex));
  if (gamepad === null) return 0.0;
  const value = gamepad.axes[int(axis)] ?? 0.0;
  if (Math.abs(value) < AXIS_DEADZONE) return 0.0;
  return Math.max(-1.0, Math.min(1.0, value));
}

function _axisValueFromCode(keyCode: number, playerIndex: number): number {
  const code = int(keyCode);
  const axis = AXIS_CODE_TO_AXIS[code];
  if (axis !== undefined) {
    return _axisValueForGamepad(_playerGamepadIndex(playerIndex), axis);
  }
  const rimAxis = RIM_AXIS_CODES[code];
  if (rimAxis !== undefined) {
    const [rimPlayer, rimAxisId] = rimAxis;
    return _axisValueForGamepad(rimPlayer, rimAxisId);
  }
  return 0.0;
}

function _gamepadButtonDown(gamepadIndex: number, button: number): boolean {
  const gamepad = _gamepadForIndex(int(gamepadIndex));
  if (gamepad === null) return false;
  return gamepad.buttons[int(button)]?.pressed ?? false;
}

function _digitalDownForPlayer(keyCode: number, playerIndex: number): boolean {
  const code = int(keyCode);
  if (code === INPUT_CODE_UNBOUND) return false;

  const mouseButton = MOUSE_CODE_TO_BUTTON[code];
  if (mouseButton !== undefined) return InputState.isMouseButtonDown(mouseButton);

  if (code < 0x100) {
    const domKey = DIK_TO_DOM_KEY[code];
    if (domKey === undefined) return false;
    return InputState.isKeyDown(domKey);
  }

  const joyButton = JOYS_BUTTON_CODES[code];
  if (joyButton !== undefined) {
    const gamepad = _playerGamepadIndex(playerIndex);
    return _isGamepadAvailable(gamepad) && _gamepadButtonDown(gamepad, joyButton);
  }
  const rimButton = RIM_BUTTON_CODES[code];
  if (rimButton !== undefined) {
    const [gamepad, button] = rimButton;
    return _isGamepadAvailable(gamepad) && _gamepadButtonDown(gamepad, button);
  }
  if (AXIS_CODE_TO_AXIS[code] !== undefined || RIM_AXIS_CODES[code] !== undefined) {
    return Math.abs(_axisValueFromCode(code, playerIndex)) >= _AXIS_DOWN_THRESHOLD;
  }
  return false;
}

export function inputCodeIsDown(keyCode: number, opts: { playerIndex?: number } = {}): boolean {
  const code = int(keyCode);
  const playerIndex = int(opts.playerIndex ?? 0);
  const down = _digitalDownForPlayer(code, playerIndex);
  return _pressedState.markDown({ playerIndex, keyCode: code, isDown: down });
}

export function inputCodeIsPressed(keyCode: number, opts: { playerIndex?: number } = {}): boolean {
  const code = int(keyCode);
  const playerIndex = int(opts.playerIndex ?? 0);

  if (code === 0x109) return _pressedState.wheelUp;
  if (code === 0x10A) return _pressedState.wheelDown;

  const down = _digitalDownForPlayer(code, playerIndex);
  return _pressedState.isPressed({ playerIndex, keyCode: code, isDown: down });
}

export function inputAxisValue(keyCode: number, opts: { playerIndex?: number } = {}): number {
  const playerIndex = opts.playerIndex ?? 0;
  return _axisValueFromCode(int(keyCode), int(playerIndex));
}

export function captureFirstPressedInputCode(
  opts: { playerIndex: number; includeKeyboard?: boolean; includeMouse?: boolean; includeGamepad?: boolean; includeAxes?: boolean; axisThreshold?: number },
): number | null {
  const includeKeyboard = opts.includeKeyboard ?? true;
  const includeMouse = opts.includeMouse ?? true;
  const includeGamepad = opts.includeGamepad ?? true;
  const includeAxes = opts.includeAxes ?? true;
  const axisThreshold = opts.axisThreshold ?? 0.5;
  const playerIdx = int(opts.playerIndex);
  if (includeKeyboard) {
    let key: number;
    while ((key = InputState.getKeyPressed()) > 0) {
      const code = DOM_KEY_TO_DIK[key];
      if (code !== undefined && code !== INPUT_CODE_UNBOUND) {
        return code;
      }
    }
  }

  if (includeMouse) {
    for (const [codeStr, button] of Object.entries(MOUSE_CODE_TO_BUTTON)) {
      if (InputState.wasMouseButtonPressed(button)) {
        return Number(codeStr);
      }
    }
    const wheel = InputState.mouseWheelDelta();
    if (wheel > 0) return 0x109;
    if (wheel < 0) return 0x10A;
  }

  if (includeGamepad) {
    const gamepad = _playerGamepadIndex(playerIdx);
    if (_isGamepadAvailable(gamepad)) {
      for (const [codeStr, button] of Object.entries(JOYS_BUTTON_CODES)) {
        const code = Number(codeStr);
        const down = _gamepadButtonDown(gamepad, button);
        if (_pressedState.isPressed({ playerIndex: gamepad, keyCode: code, isDown: down })) {
          return code;
        }
      }
    }
  }

  if (includeAxes) {
    const gamepad = _playerGamepadIndex(playerIdx);
    if (_isGamepadAvailable(gamepad)) {
      for (const [codeStr, axis] of Object.entries(AXIS_CODE_TO_AXIS)) {
        const value = _axisValueForGamepad(gamepad, axis);
        if (Math.abs(value) >= axisThreshold) {
          return Number(codeStr);
        }
      }
    }
  }

  return null;
}

const EXTENDED_NAMES: Record<number, string> = {
  0x109: 'MWheelUp',
  0x10A: 'MWheelDown',
  0x11F: 'Joys1',
  0x120: 'Joys2',
  0x121: 'Joys3',
  0x122: 'Joys4',
  0x123: 'Joys5',
  0x124: 'Joys6',
  0x125: 'Joys7',
  0x126: 'Joys8',
  0x127: 'Joys9',
  0x128: 'Joys10',
  0x129: 'Joys11',
  0x12A: 'Joys12',
  0x131: 'JoysUp',
  0x132: 'JoysDown',
  0x133: 'JoysLeft',
  0x134: 'JoysRight',
  0x13F: 'JoyAxisX',
  0x140: 'JoyAxisY',
  0x141: 'JoyAxisZ',
  0x153: 'JoyRotX',
  0x154: 'JoyRotY',
  0x155: 'JoyRotZ',
  0x163: 'RIM0XAxis',
  0x164: 'RIM1XAxis',
  0x165: 'RIM2XAxis',
  0x168: 'RIM0YAxis',
  0x169: 'RIM1YAxis',
  0x16A: 'RIM2YAxis',
  0x16D: 'RIM0Btn1',
  0x16E: 'RIM0Btn2',
  0x16F: 'RIM0Btn3',
  0x170: 'RIM0Btn4',
  0x171: 'RIM0Btn5',
  0x172: 'RIM1Btn1',
  0x173: 'RIM1Btn2',
  0x174: 'RIM1Btn3',
  0x175: 'RIM1Btn4',
  0x176: 'RIM1Btn5',
  0x177: 'RIM2Btn1',
  0x178: 'RIM2Btn2',
  0x179: 'RIM2Btn3',
  0x17A: 'RIM2Btn4',
  0x17B: 'RIM2Btn5',
};

const KEY_NAMES: Record<number, string> = {
  0x01: 'Escape', 0x0F: 'Tab', 0x10: 'Q', 0x11: 'W', 0x12: 'E',
  0x13: 'R', 0x1C: 'Enter', 0x1D: 'LControl', 0x1E: 'A', 0x1F: 'S',
  0x20: 'D', 0x2A: 'LShift', 0x36: 'RShift', 0x38: 'LAlt', 0x39: 'Space',
  0x9D: 'RControl', 0xC8: 'Up', 0xC9: 'PageUp', 0xCB: 'Left', 0xCD: 'Right',
  0xD0: 'Down', 0xD1: 'PageDown', 0xD3: 'Delete',
};

export function inputCodeName(keyCode: number): string {
  const code = int(keyCode);
  if (code === INPUT_CODE_UNBOUND) return 'unbound';
  if (code === 0x100) return 'Mouse1';
  if (code === 0x101) return 'Mouse2';
  if (code === 0x102) return 'Mouse3';
  if (code === 0x103) return 'Mouse4';
  if (code === 0x104) return 'Mouse5';

  const extName = EXTENDED_NAMES[code];
  if (extName) return extName;
  if (code > 0x163) return 'RawInput ?';

  if (code < 0x100) {
    const name = KEY_NAMES[code];
    if (name) return name;
    return `DIK_${code.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return `KEY_${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

function _inputPrimaryAnyDown(fireCodes: number[], playerCount: number): boolean {
  if (inputCodeIsDown(0x100, { playerIndex: 0 })) return true;
  const count = Math.max(1, Math.min(4, int(playerCount)));
  if (fireCodes.length < count) {
    throw new Error(`fire_codes must provide at least ${count} entries, got ${fireCodes.length}`);
  }
  for (let playerIndex = 0; playerIndex < count; playerIndex++) {
    const fireKey = int(fireCodes[playerIndex]);
    if (inputCodeIsDown(fireKey, { playerIndex })) return true;
  }
  return false;
}

export function inputPrimaryIsDown(opts: { fireCodes: number[]; playerCount: number }): boolean {
  const down = _inputPrimaryAnyDown(opts.fireCodes, opts.playerCount);
  _pressedState.markDown({ playerIndex: PRIMARY_EDGE_SENTINEL_PLAYER, keyCode: PRIMARY_EDGE_SENTINEL_KEY, isDown: down });
  return down;
}

export function inputPrimaryJustPressed(opts: { fireCodes: number[]; playerCount: number }): boolean {
  const down = _inputPrimaryAnyDown(opts.fireCodes, opts.playerCount);
  return _pressedState.isPressed({ playerIndex: PRIMARY_EDGE_SENTINEL_PLAYER, keyCode: PRIMARY_EDGE_SENTINEL_KEY, isDown: down });
}
