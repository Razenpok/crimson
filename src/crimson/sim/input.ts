// Port of crimson/sim/input.py

import { Vec2 } from '@grim/geom.ts';
import { AimScheme, MovementControlType } from '@grim/config.ts';

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

  constructor(opts?: Partial<PlayerInput>) {
    this.move = defined(opts?.move, new Vec2());
    this.aim = defined(opts?.aim, new Vec2());
    this.moveMode = defined(opts?.moveMode, null);
    this.aimScheme = defined(opts?.aimScheme, null);
    this.fireDown = defined(opts?.fireDown, false);
    this.firePressed = defined(opts?.firePressed, false);
    this.reloadPressed = defined(opts?.reloadPressed, false);
    this.reloadDown = defined(opts?.reloadDown, false);
    this.moveToCursorPressed = defined(opts?.moveToCursorPressed, false);
    this.moveForwardPressed = defined(opts?.moveForwardPressed, null);
    this.moveBackwardPressed = defined(opts?.moveBackwardPressed, null);
    this.turnLeftPressed = defined(opts?.turnLeftPressed, null);
    this.turnRightPressed = defined(opts?.turnRightPressed, null);
  }

  /** Return a new PlayerInput with selected fields replaced (equivalent to msgspec.structs.replace). */
  replace(overrides: Partial<PlayerInput>): PlayerInput {
    return new PlayerInput({
      move: defined(overrides.move, this.move),
      aim: defined(overrides.aim, this.aim),
      moveMode: defined(overrides.moveMode, this.moveMode),
      aimScheme: defined(overrides.aimScheme, this.aimScheme),
      fireDown: defined(overrides.fireDown, this.fireDown),
      firePressed: defined(overrides.firePressed, this.firePressed),
      reloadPressed: defined(overrides.reloadPressed, this.reloadPressed),
      reloadDown: defined(overrides.reloadDown, this.reloadDown),
      moveToCursorPressed: defined(overrides.moveToCursorPressed, this.moveToCursorPressed),
      moveForwardPressed: defined(overrides.moveForwardPressed, this.moveForwardPressed),
      moveBackwardPressed: defined(overrides.moveBackwardPressed, this.moveBackwardPressed),
      turnLeftPressed: defined(overrides.turnLeftPressed, this.turnLeftPressed),
      turnRightPressed: defined(overrides.turnRightPressed, this.turnRightPressed),
    });
  }
}

function defined<T>(value: T | undefined, fallback: T) {
  return value !== undefined ? value : fallback;
}
