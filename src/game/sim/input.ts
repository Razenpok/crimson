import { Vec2 } from '../../engine/geom.ts';
import { AimScheme, MovementControlType } from '../../engine/config.ts';

export interface PlayerInputOpts {
  move?: Vec2;
  aim?: Vec2;
  moveMode?: MovementControlType | null;
  aimScheme?: AimScheme | null;
  fireDown?: boolean;
  firePressed?: boolean;
  reloadPressed?: boolean;
  reloadDown?: boolean;
  moveToCursorPressed?: boolean;
  moveForwardPressed?: boolean | null;
  moveBackwardPressed?: boolean | null;
  turnLeftPressed?: boolean | null;
  turnRightPressed?: boolean | null;
}

export class PlayerInput {
  readonly move: Vec2;
  readonly aim: Vec2;
  readonly moveMode: MovementControlType | null;
  readonly aimScheme: AimScheme | null;
  readonly fireDown: boolean;
  readonly firePressed: boolean;
  readonly reloadPressed: boolean;
  readonly reloadDown: boolean;
  readonly moveToCursorPressed: boolean;
  readonly moveForwardPressed: boolean | null;
  readonly moveBackwardPressed: boolean | null;
  readonly turnLeftPressed: boolean | null;
  readonly turnRightPressed: boolean | null;

  constructor(opts?: PlayerInputOpts) {
    this.move = opts?.move ?? new Vec2();
    this.aim = opts?.aim ?? new Vec2();
    this.moveMode = opts?.moveMode ?? null;
    this.aimScheme = opts?.aimScheme ?? null;
    this.fireDown = opts?.fireDown ?? false;
    this.firePressed = opts?.firePressed ?? false;
    this.reloadPressed = opts?.reloadPressed ?? false;
    this.reloadDown = opts?.reloadDown ?? false;
    this.moveToCursorPressed = opts?.moveToCursorPressed ?? false;
    this.moveForwardPressed = opts?.moveForwardPressed ?? null;
    this.moveBackwardPressed = opts?.moveBackwardPressed ?? null;
    this.turnLeftPressed = opts?.turnLeftPressed ?? null;
    this.turnRightPressed = opts?.turnRightPressed ?? null;
  }

  /** Return a new PlayerInput with selected fields replaced (equivalent to msgspec.structs.replace). */
  replace(overrides: PlayerInputOpts): PlayerInput {
    return new PlayerInput({
      move: overrides.move ?? this.move,
      aim: overrides.aim ?? this.aim,
      moveMode: overrides.moveMode !== undefined ? overrides.moveMode : this.moveMode,
      aimScheme: overrides.aimScheme !== undefined ? overrides.aimScheme : this.aimScheme,
      fireDown: overrides.fireDown ?? this.fireDown,
      firePressed: overrides.firePressed ?? this.firePressed,
      reloadPressed: overrides.reloadPressed ?? this.reloadPressed,
      reloadDown: overrides.reloadDown ?? this.reloadDown,
      moveToCursorPressed: overrides.moveToCursorPressed ?? this.moveToCursorPressed,
      moveForwardPressed: overrides.moveForwardPressed !== undefined ? overrides.moveForwardPressed : this.moveForwardPressed,
      moveBackwardPressed: overrides.moveBackwardPressed !== undefined ? overrides.moveBackwardPressed : this.moveBackwardPressed,
      turnLeftPressed: overrides.turnLeftPressed !== undefined ? overrides.turnLeftPressed : this.turnLeftPressed,
      turnRightPressed: overrides.turnRightPressed !== undefined ? overrides.turnRightPressed : this.turnRightPressed,
    });
  }
}
