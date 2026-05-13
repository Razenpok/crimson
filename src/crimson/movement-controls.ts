// Port of crimson/movement_controls.py

export enum MovementControlType {
  UNKNOWN = 0,
  RELATIVE = 1,
  STATIC = 2,
  DUAL_ACTION_PAD = 3,
  MOUSE_POINT_CLICK = 4,
  COMPUTER = 5,
}

export function movementControlTypeFromValue(
  value: number,
): MovementControlType {
  switch (int(value)) {
    case MovementControlType.RELATIVE:
      return MovementControlType.RELATIVE;
    case MovementControlType.STATIC:
      return MovementControlType.STATIC;
    case MovementControlType.DUAL_ACTION_PAD:
      return MovementControlType.DUAL_ACTION_PAD;
    case MovementControlType.MOUSE_POINT_CLICK:
      return MovementControlType.MOUSE_POINT_CLICK;
    case MovementControlType.COMPUTER:
      return MovementControlType.COMPUTER;
    case MovementControlType.UNKNOWN:
      return MovementControlType.UNKNOWN;
    default:
      return MovementControlType.UNKNOWN;
  }
}
