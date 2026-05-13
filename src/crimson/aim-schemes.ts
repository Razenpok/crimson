// Port of crimson/aim_schemes.py

// Aiming scheme ids from `config_aim_scheme`.
export enum AimScheme {
  UNKNOWN = -1,
  MOUSE = 0,
  KEYBOARD = 1,
  JOYSTICK = 2,
  MOUSE_RELATIVE = 3,
  DUAL_ACTION_PAD = 4,
  COMPUTER = 5,
}

export function aimSchemeFromValue(
  value: number,
): AimScheme {
  if (!Number.isFinite(value)) {
    return AimScheme.UNKNOWN;
  }
  switch (int(value)) {
    case AimScheme.MOUSE:
      return AimScheme.MOUSE;
    case AimScheme.KEYBOARD:
      return AimScheme.KEYBOARD;
    case AimScheme.JOYSTICK:
      return AimScheme.JOYSTICK;
    case AimScheme.MOUSE_RELATIVE:
      return AimScheme.MOUSE_RELATIVE;
    case AimScheme.DUAL_ACTION_PAD:
      return AimScheme.DUAL_ACTION_PAD;
    case AimScheme.COMPUTER:
      return AimScheme.COMPUTER;
    case AimScheme.UNKNOWN:
      return AimScheme.UNKNOWN;
    default:
      return AimScheme.UNKNOWN;
  }
}
