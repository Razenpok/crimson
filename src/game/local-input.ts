// Port of crimson/local_input.py — local input interpretation for players

import { Vec2 } from '../engine/geom.ts';
import {
  AimScheme,
  MovementControlType,
  type CrimsonConfig,
  type CrimsonPlayerControls,
} from '../engine/config.ts';
import {
  inputCodeIsDown,
  inputCodeIsPressed,
  inputAxisValue,
} from './input-codes.ts';
import { PlayerInput } from './sim/input.ts';
import type { PlayerState } from './sim/state-types.ts';
import { AIM_KEYBOARD_TURN_RATE, AIM_JOYSTICK_TURN_RATE } from './aim-constants';

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------
const _AIM_RADIUS_KEYBOARD = 60.0;
const _AIM_RADIUS_PAD_BASE = 42.0;
const _AIM_RADIUS_PAD_SCALE = 96.0;
const _POINT_CLICK_STOP_RADIUS = 20.0;
const _COMPUTER_TARGET_SWITCH_HYSTERESIS = 64.0;
const _COMPUTER_ARENA_CENTER = new Vec2(512.0, 512.0);
const _COMPUTER_MOVE_TARGET_RADIUS = 300.0;
const _COMPUTER_AIM_SNAP_DISTANCE = 4.0;
const _COMPUTER_AIM_TRACK_GAIN = 6.0;
const _COMPUTER_AUTO_FIRE_DISTANCE = 128.0;

const _ALT_MOVE_KEY_UP = 0xc8;
const _ALT_MOVE_KEY_DOWN = 0xd0;
const _ALT_MOVE_KEY_LEFT = 0xcb;
const _ALT_MOVE_KEY_RIGHT = 0xcd;
const _AIM_POV_LEFT_CODE = 0x133;
const _AIM_POV_RIGHT_CODE = 0x134;

// ---------------------------------------------------------------------------
// Per-player state (mutable across frames)
// ---------------------------------------------------------------------------
class PerPlayerInputState {
  aimHeading = 0.0;
  moveTarget = new Vec2(-1.0, -1.0);
  computerTargetCreatureIndex = -1;
}

// ---------------------------------------------------------------------------
// Protocol-like interface for computer-aim creatures
// ---------------------------------------------------------------------------
export interface ComputerAimCreature {
  active: boolean;
  hp: number;
  pos: Vec2;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFiniteNum(v: number): boolean {
  return Number.isFinite(v);
}

function clampUnit(v: number): number {
  if (v < -1.0) return -1.0;
  if (v > 1.0) return 1.0;
  return v;
}

function aimPointFromHeading(
  pos: Vec2,
  heading: number,
  radius: number = _AIM_RADIUS_KEYBOARD,
): Vec2 {
  return pos.add(Vec2.fromHeading(heading).mul(radius));
}

function resolveStaticMoveVector(
  moveUp: boolean,
  moveDown: boolean,
  moveLeft: boolean,
  moveRight: boolean,
): Vec2 {
  /** Mirror native move-mode 2 key precedence from player_update. */
  let move = new Vec2();
  if (moveLeft) move = new Vec2(-1.0, 0.0);
  if (moveRight) move = new Vec2(1.0, 0.0);

  if (moveUp) {
    if (moveLeft) move = new Vec2(-1.0, -1.0);
    else if (moveRight) move = new Vec2(1.0, -1.0);
    else move = new Vec2(0.0, -1.0);
  }

  // Native checks backward after forward, so it overrides on conflicts.
  if (moveDown) {
    if (moveLeft) move = new Vec2(-1.0, 1.0);
    else if (moveRight) move = new Vec2(1.0, 1.0);
    else move = new Vec2(0.0, 1.0);
  }

  return move;
}

function configPlayerCount(config: CrimsonConfig): number {
  return Math.max(1, config.gameplay.playerCount | 0);
}

function singlePlayerAltKeysEnabled(
  config: CrimsonConfig,
  playerIndex: number,
): boolean {
  return playerIndex === 0 && configPlayerCount(config) === 1;
}

function keyDownWithSinglePlayerAlt(
  primaryKey: number,
  altKey: number,
  config: CrimsonConfig,
  playerIndex: number,
): boolean {
  if (inputCodeIsDown(primaryKey, playerIndex)) return true;
  if (singlePlayerAltKeysEnabled(config, playerIndex)) {
    return inputCodeIsDown(altKey, playerIndex);
  }
  return false;
}

function aimPovLeftActive(
  playerIndex: number,
  preserveBugs: boolean,
): boolean {
  // Native input_aim_pov_left_active always reads joystick POV index 0.
  const povIndex = preserveBugs ? 0 : playerIndex;
  return inputCodeIsDown(_AIM_POV_LEFT_CODE, povIndex);
}

function aimPovRightActive(
  playerIndex: number,
  preserveBugs: boolean,
): boolean {
  // Native input_aim_pov_right_active always reads joystick POV index 0.
  const povIndex = preserveBugs ? 0 : playerIndex;
  return inputCodeIsDown(_AIM_POV_RIGHT_CODE, povIndex);
}

// ---------------------------------------------------------------------------
// Public helper: clear edge-triggered flags between frames
// ---------------------------------------------------------------------------
export function clearInputEdges(inputs: readonly PlayerInput[]): PlayerInput[] {
  return inputs.map(
    (inp) =>
      new PlayerInput({
        move: inp.move,
        aim: inp.aim,
        fireDown: inp.fireDown,
        firePressed: false,
        reloadPressed: false,
        moveToCursorPressed: false,
        moveForwardPressed: inp.moveForwardPressed,
        moveBackwardPressed: inp.moveBackwardPressed,
        turnLeftPressed: inp.turnLeftPressed,
        turnRightPressed: inp.turnRightPressed,
      }),
  );
}

// ---------------------------------------------------------------------------
// LocalInputInterpreter
// ---------------------------------------------------------------------------
export class LocalInputInterpreter {
  private _states: PerPlayerInputState[];
  private _preserveBugs: boolean;

  constructor(preserveBugs = false) {
    this._states = [
      new PerPlayerInputState(),
      new PerPlayerInputState(),
      new PerPlayerInputState(),
      new PerPlayerInputState(),
    ];
    this._preserveBugs = preserveBugs;
  }

  setPreserveBugs(enabled: boolean): void {
    this._preserveBugs = enabled;
  }

  private static _stateSlotForPlayer(
    playerIndex: number,
    player?: PlayerState | null,
  ): number {
    let slot = playerIndex | 0;
    if (player != null) slot = player.index | 0;
    return Math.max(0, Math.min(3, slot));
  }

  reset(players?: readonly PlayerState[] | null): void {
    for (let idx = 0; idx < 4; idx++) {
      const state = this._states[idx];
      state.moveTarget = new Vec2(-1.0, -1.0);
      state.computerTargetCreatureIndex = -1;
      state.aimHeading = 0.0;
    }
    if (players == null) return;
    for (let idx = 0; idx < players.length; idx++) {
      const player = players[idx];
      const slot = LocalInputInterpreter._stateSlotForPlayer(idx, player);
      const candidate = player.aimHeading;
      if (isFiniteNum(candidate)) {
        this._states[slot].aimHeading = candidate;
      }
    }
  }

  private static _nearestLivingCreatureIndex(
    pos: Vec2,
    creatures: readonly ComputerAimCreature[],
  ): number | null {
    let bestIdx: number | null = null;
    let bestDistSq = 0.0;
    for (let idx = 0; idx < creatures.length; idx++) {
      const creature = creatures[idx];
      if (!creature.active) continue;
      if (creature.hp <= 0.0) continue;
      const distSq = Vec2.distanceSq(pos, creature.pos);
      if (bestIdx === null || distSq < bestDistSq) {
        bestIdx = idx;
        bestDistSq = distSq;
      }
    }
    return bestIdx;
  }

  private _selectComputerTarget(
    playerIndex: number,
    player: PlayerState,
    creatures: readonly ComputerAimCreature[],
  ): number | null {
    const slot = LocalInputInterpreter._stateSlotForPlayer(playerIndex, player);
    const state = this._states[slot];
    const candidate = LocalInputInterpreter._nearestLivingCreatureIndex(
      player.pos,
      creatures,
    );
    const current = state.computerTargetCreatureIndex | 0;

    if (candidate === null) {
      state.computerTargetCreatureIndex = -1;
      return null;
    }
    if (current < 0 || current >= creatures.length) {
      state.computerTargetCreatureIndex = candidate;
      return candidate;
    }

    const currentCreature = creatures[current];
    if (!currentCreature.active || currentCreature.hp <= 0.0) {
      state.computerTargetCreatureIndex = candidate;
      return candidate;
    }
    if (candidate === current) return current;

    const candidateCreature = creatures[candidate];
    if (!candidateCreature.active || candidateCreature.hp <= 0.0) {
      return current;
    }

    const currentDist = currentCreature.pos.sub(player.pos).length();
    const candidateDist = candidateCreature.pos.sub(player.pos).length();
    if (
      candidateDist + _COMPUTER_TARGET_SWITCH_HYSTERESIS <
      currentDist
    ) {
      state.computerTargetCreatureIndex = candidate;
      return candidate;
    }
    return current;
  }

  private _stateForPlayer(
    playerIndex: number,
    player?: PlayerState | null,
  ): PerPlayerInputState {
    const slot = LocalInputInterpreter._stateSlotForPlayer(playerIndex, player);
    const state = this._states[slot];
    if (player != null && !isFiniteNum(state.aimHeading)) {
      state.aimHeading = player.aimHeading;
    }
    return state;
  }

  buildPlayerInput(opts: {
    playerIndex: number;
    player: PlayerState;
    config: CrimsonConfig;
    mouseScreen: Vec2;
    mouseWorld: Vec2;
    screenCenter: Vec2;
    dt: number;
    creatures?: readonly ComputerAimCreature[] | null;
  }): PlayerInput {
    const {
      player,
      config,
      mouseScreen,
      mouseWorld,
      screenCenter,
      creatures = null,
    } = opts;
    const dt = opts.dt;
    const idx = Math.max(0, Math.min(3, opts.playerIndex | 0));
    const state = this._stateForPlayer(idx, player);
    const binds: CrimsonPlayerControls = config.controls.players[idx];
    const aimScheme = binds.aimScheme;
    const moveModeType = binds.movement;
    const reloadKey = config.controls.reloadCode;

    const [moveForwardKey, moveBackwardKey, turnLeftKey, turnRightKey] =
      binds.moveCodes;
    const fireKey = binds.fireCode;
    const [aimLeftKey, aimRightKey] = binds.keyboardAimCodes;
    const [aimAxisY, aimAxisX] = binds.aimAxisCodes;
    const [moveAxisY, moveAxisX] = binds.moveAxisCodes;

    let moveVec = new Vec2();
    let moveForwardPressed: boolean | null = null;
    let moveBackwardPressed: boolean | null = null;
    let turnLeftPressed: boolean | null = null;
    let turnRightPressed: boolean | null = null;
    let moveToCursorPressed = false;
    let computerTargetIndex: number | null = null;
    const computerMoveActive =
      moveModeType === MovementControlType.COMPUTER ||
      aimScheme === AimScheme.COMPUTER;

    // -----------------------------------------------------------------------
    // Movement
    // -----------------------------------------------------------------------
    if (computerMoveActive) {
      if (creatures && creatures.length > 0) {
        computerTargetIndex = this._selectComputerTarget(
          idx,
          player,
          creatures,
        );
      }
      const centerDelta = _COMPUTER_ARENA_CENTER.sub(player.pos);
      const centerDist = centerDelta.length();
      let targetPos: Vec2;
      if (
        creatures != null &&
        computerTargetIndex != null &&
        computerTargetIndex >= 0 &&
        computerTargetIndex < creatures.length &&
        centerDist <= _COMPUTER_MOVE_TARGET_RADIUS
      ) {
        const c = creatures[computerTargetIndex];
        targetPos = new Vec2(c.pos.x, c.pos.y);
      } else {
        targetPos = _COMPUTER_ARENA_CENTER;
      }

      const [moveDir, moveDist] = targetPos
        .sub(player.pos)
        .normalizedWithLength();
      if (moveDist > 1e-6) {
        moveVec = moveDir;
      }
    } else if (moveModeType === MovementControlType.RELATIVE) {
      moveForwardPressed = keyDownWithSinglePlayerAlt(
        moveForwardKey,
        _ALT_MOVE_KEY_UP,
        config,
        idx,
      );
      moveBackwardPressed = keyDownWithSinglePlayerAlt(
        moveBackwardKey,
        _ALT_MOVE_KEY_DOWN,
        config,
        idx,
      );
      turnLeftPressed = keyDownWithSinglePlayerAlt(
        turnLeftKey,
        _ALT_MOVE_KEY_LEFT,
        config,
        idx,
      );
      turnRightPressed = keyDownWithSinglePlayerAlt(
        turnRightKey,
        _ALT_MOVE_KEY_RIGHT,
        config,
        idx,
      );
      moveVec = new Vec2(
        (turnRightPressed ? 1.0 : 0.0) - (turnLeftPressed ? 1.0 : 0.0),
        (moveBackwardPressed ? 1.0 : 0.0) - (moveForwardPressed ? 1.0 : 0.0),
      );
    } else if (moveModeType === MovementControlType.DUAL_ACTION_PAD) {
      const axisY = -inputAxisValue(moveAxisY, idx);
      const axisX = -inputAxisValue(moveAxisX, idx);
      moveVec = new Vec2(clampUnit(axisX), clampUnit(axisY));
    } else if (moveModeType === MovementControlType.MOUSE_POINT_CLICK) {
      moveToCursorPressed = inputCodeIsDown(reloadKey, idx);
      if (moveToCursorPressed) {
        state.moveTarget = mouseWorld;
      }
      if (state.moveTarget.x >= 0.0 && state.moveTarget.y >= 0.0) {
        const delta = state.moveTarget.sub(player.pos);
        const [dir, dist] = delta.normalizedWithLength();
        if (dist > _POINT_CLICK_STOP_RADIUS) {
          moveVec = dir;
        }
      }
    } else if (moveModeType === MovementControlType.STATIC) {
      const moveUpPressed = keyDownWithSinglePlayerAlt(
        moveForwardKey,
        _ALT_MOVE_KEY_UP,
        config,
        idx,
      );
      const moveDownPressed = keyDownWithSinglePlayerAlt(
        moveBackwardKey,
        _ALT_MOVE_KEY_DOWN,
        config,
        idx,
      );
      const moveLeftPressed = keyDownWithSinglePlayerAlt(
        turnLeftKey,
        _ALT_MOVE_KEY_LEFT,
        config,
        idx,
      );
      const moveRightPressed = keyDownWithSinglePlayerAlt(
        turnRightKey,
        _ALT_MOVE_KEY_RIGHT,
        config,
        idx,
      );
      moveForwardPressed = moveUpPressed;
      moveBackwardPressed = moveDownPressed;
      turnLeftPressed = moveLeftPressed;
      turnRightPressed = moveRightPressed;
      moveVec = resolveStaticMoveVector(
        moveUpPressed,
        moveDownPressed,
        moveLeftPressed,
        moveRightPressed,
      );
    } else {
      // Default / unknown movement type
      moveVec = new Vec2(
        (inputCodeIsDown(turnRightKey, idx) ? 1.0 : 0.0) -
          (inputCodeIsDown(turnLeftKey, idx) ? 1.0 : 0.0),
        (inputCodeIsDown(moveBackwardKey, idx) ? 1.0 : 0.0) -
          (inputCodeIsDown(moveForwardKey, idx) ? 1.0 : 0.0),
      );
    }

    // -----------------------------------------------------------------------
    // Aim
    // -----------------------------------------------------------------------
    let heading = state.aimHeading;
    if (!isFiniteNum(heading)) {
      heading = player.aimHeading;
    }
    let aim = new Vec2(player.aim.x, player.aim.y);
    let computerAutoFire = false;

    if (aimScheme === AimScheme.MOUSE) {
      aim = mouseWorld;
      const delta = aim.sub(player.pos);
      if (delta.lengthSq() > 1e-9) {
        heading = delta.toHeading();
      }
    } else if (aimScheme === AimScheme.KEYBOARD) {
      if (
        moveModeType === MovementControlType.RELATIVE ||
        moveModeType === MovementControlType.STATIC
      ) {
        if (inputCodeIsDown(aimRightKey, idx)) {
          heading = heading + dt * AIM_KEYBOARD_TURN_RATE;
        }
        if (inputCodeIsDown(aimLeftKey, idx)) {
          heading = heading - dt * AIM_KEYBOARD_TURN_RATE;
        }
        aim = aimPointFromHeading(player.pos, heading);
      }
    } else if (aimScheme === AimScheme.MOUSE_RELATIVE) {
      const rel = mouseScreen.sub(screenCenter);
      if (rel.lengthSq() > 1.0) {
        heading = rel.toHeading();
        aim = aimPointFromHeading(player.pos, heading);
      }
    } else if (aimScheme === AimScheme.DUAL_ACTION_PAD) {
      const axisY = inputAxisValue(aimAxisY, idx);
      const axisX = inputAxisValue(aimAxisX, idx);
      const axisVec = new Vec2(axisX, axisY);
      const magSq = axisVec.lengthSq();
      if (magSq > 1e-9) {
        const [axisDir, mag] = axisVec.normalizedWithLength();
        heading = axisDir.toHeading();
        const radius = _AIM_RADIUS_PAD_BASE + mag * _AIM_RADIUS_PAD_SCALE;
        aim = player.pos.add(axisDir.mul(radius));
      } else {
        aim = aimPointFromHeading(player.pos, heading);
      }
    } else if (aimScheme === AimScheme.JOYSTICK) {
      if (aimPovRightActive(idx, this._preserveBugs)) {
        heading = heading + dt * AIM_JOYSTICK_TURN_RATE;
      }
      if (aimPovLeftActive(idx, this._preserveBugs)) {
        heading = heading - dt * AIM_JOYSTICK_TURN_RATE;
      }
      aim = aimPointFromHeading(player.pos, heading);
    } else if (aimScheme === AimScheme.COMPUTER) {
      let targetIndex = computerTargetIndex;
      if (targetIndex === null && creatures && creatures.length > 0) {
        targetIndex = this._selectComputerTarget(idx, player, creatures);
      }
      if (
        creatures != null &&
        targetIndex != null &&
        targetIndex >= 0 &&
        targetIndex < creatures.length
      ) {
        const target = creatures[targetIndex];
        aim = new Vec2(player.aim.x, player.aim.y);
        const toTarget = new Vec2(target.pos.x, target.pos.y).sub(
          aim,
        );
        const [targetDir, targetDist] = toTarget.normalizedWithLength();
        if (targetDist >= _COMPUTER_AIM_SNAP_DISTANCE) {
          aim = aim.add(
            targetDir.mul(targetDist * _COMPUTER_AIM_TRACK_GAIN * dt),
          );
        } else {
          aim = new Vec2(target.pos.x, target.pos.y);
        }
        const delta = aim.sub(player.pos);
        if (delta.lengthSq() > 1e-9) {
          heading = delta.toHeading();
        }
        computerAutoFire = targetDist < _COMPUTER_AUTO_FIRE_DISTANCE;
      } else {
        const [away, awayMag] = player.pos
          .sub(_COMPUTER_ARENA_CENTER)
          .normalizedWithLength();
        const awayDir = awayMag <= 1e-6 ? new Vec2(0.0, -1.0) : away;
        aim = player.pos.add(awayDir.mul(_AIM_RADIUS_KEYBOARD));
        heading = awayDir.toHeading();
      }
    }

    // Final heading from aim delta
    const finalDelta = aim.sub(player.pos);
    if (finalDelta.lengthSq() > 1e-9) {
      heading = finalDelta.toHeading();
    }
    state.aimHeading = heading;

    // -----------------------------------------------------------------------
    // Fire / reload
    // -----------------------------------------------------------------------
    let fireDown = inputCodeIsDown(fireKey, idx);
    const firePressed = inputCodeIsPressed(fireKey, idx);
    if (aimScheme === AimScheme.COMPUTER && computerAutoFire) {
      fireDown = true;
    }
    const reloadPressed = inputCodeIsPressed(reloadKey, idx);
    const _reloadDown = inputCodeIsDown(reloadKey, idx);

    return new PlayerInput({
      move: moveVec,
      aim,
      moveMode: moveModeType,
      aimScheme,
      fireDown,
      firePressed,
      reloadPressed,
      reloadDown: _reloadDown,
      moveToCursorPressed,
      moveForwardPressed,
      moveBackwardPressed,
      turnLeftPressed,
      turnRightPressed,
    });
  }

  buildFrameInputs(opts: {
    players: readonly PlayerState[];
    config: CrimsonConfig;
    mouseScreen: Vec2;
    screenToWorld: (v: Vec2) => Vec2;
    screenCenter: Vec2;
    dt: number;
    creatures?: readonly ComputerAimCreature[] | null;
  }): PlayerInput[] {
    const {
      players,
      config,
      mouseScreen,
      screenToWorld,
      screenCenter,
      dt,
      creatures = null,
    } = opts;
    const mouseWorld = screenToWorld(mouseScreen);
    const out: PlayerInput[] = [];
    for (let idx = 0; idx < players.length; idx++) {
      out.push(
        this.buildPlayerInput({
          playerIndex: idx,
          player: players[idx],
          config,
          mouseScreen,
          mouseWorld,
          screenCenter,
          dt,
          creatures,
        }),
      );
    }
    return out;
  }
}
