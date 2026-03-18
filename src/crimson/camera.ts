// Port of crimson/camera.py — Camera shake logic

import { Vec2 } from '@grim/geom.ts';
import { type CrandLike } from '@grim/rand.ts';
import { RngCallerStatic } from './rng-caller-static.ts';

export interface CameraShakeState {
  cameraShakePulses: number;
  cameraShakeTimer: number;
  cameraShakeOffset: Vec2;
  rng: CrandLike;
  bonusReflexBoost: number;
}

export function cameraShakeStart(state: CameraShakeState, pulses: number, timer: number): void {
  state.cameraShakePulses = pulses;
  state.cameraShakeTimer = timer;
}

export function cameraShakeUpdate(state: CameraShakeState, dt: number): void {
  if (state.cameraShakeTimer <= 0.0) {
    state.cameraShakeOffset = new Vec2();
    return;
  }

  state.cameraShakeTimer -= dt * 3.0;
  if (state.cameraShakeTimer >= 0.0) return;

  state.cameraShakePulses -= 1;
  if (state.cameraShakePulses < 1) {
    state.cameraShakeTimer = 0.0;
    return;
  }

  const timeScaleActive = state.bonusReflexBoost > 0.0;
  state.cameraShakeTimer = timeScaleActive ? 0.06 : 0.1;

  const maxAmp = state.cameraShakePulses * 3;
  if (maxAmp <= 0) {
    state.cameraShakeOffset = new Vec2();
    state.cameraShakeTimer = 0.0;
    state.cameraShakePulses = 0;
    return;
  }

  let magX =
    state.rng.rand(RngCallerStatic.CAMERA_UPDATE_OFFSET_X_BASE) % maxAmp +
    state.rng.rand(RngCallerStatic.CAMERA_UPDATE_OFFSET_X_SPREAD) % 10;
  if ((state.rng.rand(RngCallerStatic.CAMERA_UPDATE_OFFSET_X_SIGN) & 1) === 0) magX = -magX;

  let magY =
    state.rng.rand(RngCallerStatic.CAMERA_UPDATE_OFFSET_Y_BASE) % maxAmp +
    state.rng.rand(RngCallerStatic.CAMERA_UPDATE_OFFSET_Y_SPREAD) % 10;
  if ((state.rng.rand(RngCallerStatic.CAMERA_UPDATE_OFFSET_Y_SIGN) & 1) === 0) magY = -magY;

  state.cameraShakeOffset = new Vec2(magX, magY);
}
