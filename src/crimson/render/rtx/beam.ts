// Port of crimson/render/rtx/beam.py
// Stubbed for WebGL2 — RTX beam shader functions return false (classic mode fallback).
// The actual shader compilation can be implemented later.

import { Vec2 } from '@grim/geom.ts';

// Shader constants (kept for future shader implementation)
export const SHADER_STAMP_ANALYTIC_RADIUS_SCALE = 16.0;
export const SHADER_STAMP_VIRTUAL_PROFILE_A = 1.3;
export const SHADER_STAMP_VIRTUAL_PROFILE_LINEAR = -4.8;
export const SHADER_STAMP_VIRTUAL_PROFILE_QUAD = 1.0;
export const SHADER_STAMP_VIRTUAL_PROFILE_OFFSET = 0.01;
export const SHADER_STAMP_VIRTUAL_INTENSITY_GAIN = 0.92;
export const SHADER_STAMP_VIRTUAL_MAX_STAMPS = 128;
export const SHADER_STAMP_VIRTUAL_HEAD_RADIUS_MULTIPLIER = 1.05;
export const SHADER_STAMP_VIRTUAL_HEAD_FIRE_RADIUS_MULTIPLIER = 1.35;

// TODO: Implement WebGL2 beam shader (convert GLSL #version 330 to #version 300 es).
// The vertex shader passes fragLen via vertexPosition.z and the fragment shader
// accumulates stamped gaussian profiles along the beam body for a smooth glow effect.

/**
 * Draw the beam body using the RTX fast-stamped shader.
 * Currently stubbed — returns false so the caller falls back to classic sprite mode.
 */
export function drawBeamFastStampedBody(_opts: {
  originScreen: Vec2;
  headScreen: Vec2;
  startDistUnits: number;
  spanDistUnits: number;
  stepUnits: number;
  effectScale: number;
  scale: number;
  baseAlpha: number;
  streakRgb: [number, number, number];
}): boolean {
  // TODO: Compile and use WebGL2 beam shader for RTX mode body rendering.
  return false;
}

/**
 * Draw the beam head glow using the RTX fast-stamped shader.
 * Currently stubbed — returns false so the caller falls back to classic sprite mode.
 */
export function drawBeamFastStampedHead(_opts: {
  centerScreen: Vec2;
  rotationRad: number;
  effectScale: number;
  scale: number;
  baseAlpha: number;
  headRgb: [number, number, number];
  isFire: boolean;
}): boolean {
  // TODO: Compile and use WebGL2 beam shader for RTX mode head rendering.
  return false;
}
