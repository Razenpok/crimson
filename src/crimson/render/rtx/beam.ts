// Port of crimson/render/rtx/beam.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';

export const SHADER_STAMP_ANALYTIC_RADIUS_SCALE = 16.0;
export const SHADER_STAMP_VIRTUAL_PROFILE_A = 1.3;
export const SHADER_STAMP_VIRTUAL_PROFILE_LINEAR = -4.8;
export const SHADER_STAMP_VIRTUAL_PROFILE_QUAD = 1.0;
export const SHADER_STAMP_VIRTUAL_PROFILE_OFFSET = 0.01;
export const SHADER_STAMP_VIRTUAL_INTENSITY_GAIN = 0.92;
export const SHADER_STAMP_VIRTUAL_MAX_STAMPS = 128;
export const SHADER_STAMP_VIRTUAL_HEAD_RADIUS_MULTIPLIER = 1.05;
export const SHADER_STAMP_VIRTUAL_HEAD_FIRE_RADIUS_MULTIPLIER = 1.35;

const _BEAM_SHADER_VS_330 = `#version 300 es
precision highp float;

layout(location=0) in vec3 vertexPosition;
layout(location=1) in vec2 vertexTexCoord;
layout(location=2) in vec4 vertexColor;
out vec2 fragTexCoord;
out vec4 fragColor;
out float fragLen;

uniform mat4 mvp;

void main() {
    fragTexCoord = vertexTexCoord;
    fragColor = vertexColor;
    fragLen = vertexPosition.z;
    gl_Position = mvp * vec4(vertexPosition.x, vertexPosition.y, 0.0, 1.0);
}
`;

const _BEAM_FAST_STAMPED_FS_330 = `#version 300 es
precision highp float;

in vec2 fragTexCoord;
in vec4 fragColor;
in float fragLen;

uniform vec4 colDiffuse;
uniform float u_step_uv;
uniform float u_stamp_scale;
uniform float u_stamp_decay;
uniform float u_stamp_quad;
uniform float u_stamp_offset;
uniform float u_intensity_gain;

out vec4 finalColor;

void main() {
    float u_len = fragLen;
    float gain = max(u_intensity_gain, 0.0);

    if (u_len < 0.0) {
        float d = length(fragTexCoord);
        float profile = clamp(u_stamp_scale * exp(-u_stamp_decay * d - u_stamp_quad * d * d) - u_stamp_offset, 0.0, 1.0);
        float intensity = profile * fragColor.a * gain;
        vec3 rgb = fragColor.rgb * colDiffuse.rgb * intensity;
        finalColor = vec4(rgb, 1.0);
        return;
    }

    float step_uv = max(0.001, u_step_uv);
    float len_uv = max(0.0, u_len);
    float stamp_count = floor(len_uv / step_uv) + 1.0;
    stamp_count = clamp(stamp_count, 0.0, float(${SHADER_STAMP_VIRTUAL_MAX_STAMPS}));

    int start_i = 0;
    int end_i = int(stamp_count);

    // Profile support radius in UV-space where profile falls to zero.
    // For current params (offset > 0), this makes the loop O(local overlap).
    float reach_uv = 0.0;
    bool has_reach_uv = false;
    if (u_stamp_scale <= 0.0 || u_stamp_offset >= u_stamp_scale) {
        has_reach_uv = true;
    } else if (u_stamp_offset > 0.0) {
        float target = -log(u_stamp_offset / max(u_stamp_scale, 1e-6));
        float b = max(u_stamp_decay, 0.0);
        float q = max(u_stamp_quad, 0.0);
        if (q > 1e-6) {
            float disc = max(0.0, b * b + 4.0 * q * target);
            reach_uv = (-b + sqrt(disc)) / (2.0 * q);
            has_reach_uv = true;
        } else if (b > 1e-6) {
            reach_uv = target / b;
            has_reach_uv = true;
        }
    }

    if (has_reach_uv) {
        reach_uv = max(reach_uv, 0.0);
        float center_index = floor(fragTexCoord.x / step_uv);
        float index_reach = ceil(reach_uv / step_uv);
        start_i = max(0, int(center_index - index_reach));
        end_i = min(int(stamp_count), int(center_index + index_reach + 1.0));
    }

    float accum = 0.0;
    for (int i = start_i; i < end_i; i++) {
        float fi = float(i);
        float sx = fi * step_uv;
        if (sx >= len_uv) {
            break;
        }
        float t = clamp(sx / max(1e-6, len_uv), 0.0, 1.0);
        float d = length(vec2(fragTexCoord.x - sx, fragTexCoord.y));
        float profile = clamp(u_stamp_scale * exp(-u_stamp_decay * d - u_stamp_quad * d * d) - u_stamp_offset, 0.0, 1.0);
        accum += t * profile;
    }

    float intensity = accum * fragColor.a * gain;
    vec3 rgb = fragColor.rgb * colDiffuse.rgb * intensity;
    finalColor = vec4(rgb, 1.0);
}
`;

class _BeamFastStampedShader {
  readonly shader: WebGLProgram;
  readonly mvpLoc: WebGLUniformLocation | null;
  readonly colorLoc: WebGLUniformLocation | null;
  readonly stepUvLoc: WebGLUniformLocation | null;
  readonly stampScaleLoc: WebGLUniformLocation | null;
  readonly stampDecayLoc: WebGLUniformLocation | null;
  readonly stampQuadLoc: WebGLUniformLocation | null;
  readonly stampOffsetLoc: WebGLUniformLocation | null;
  readonly intensityGainLoc: WebGLUniformLocation | null;

  constructor(opts: {
    shader: WebGLProgram;
    mvpLoc: WebGLUniformLocation | null;
    colorLoc: WebGLUniformLocation | null;
    stepUvLoc: WebGLUniformLocation | null;
    stampScaleLoc: WebGLUniformLocation | null;
    stampDecayLoc: WebGLUniformLocation | null;
    stampQuadLoc: WebGLUniformLocation | null;
    stampOffsetLoc: WebGLUniformLocation | null;
    intensityGainLoc: WebGLUniformLocation | null;
  }) {
    this.shader = opts.shader;
    this.mvpLoc = opts.mvpLoc;
    this.colorLoc = opts.colorLoc;
    this.stepUvLoc = opts.stepUvLoc;
    this.stampScaleLoc = opts.stampScaleLoc;
    this.stampDecayLoc = opts.stampDecayLoc;
    this.stampQuadLoc = opts.stampQuadLoc;
    this.stampOffsetLoc = opts.stampOffsetLoc;
    this.intensityGainLoc = opts.intensityGainLoc;
  }
}

let _BEAM_FAST_STAMPED_SHADER_TRIED = false;
let _BEAM_FAST_STAMPED_SHADER: _BeamFastStampedShader | null = null;

function _setShaderFloat(shader: WebGLProgram, location: WebGLUniformLocation | null, value: number): void {
  if (location === null) {
    return;
  }
  wgl.setShaderFloat(shader, location, value);
}

function _setShaderVec4(
  shader: WebGLProgram,
  location: WebGLUniformLocation | null,
  x: number,
  y: number,
  z: number,
  w: number,
): void {
  if (location === null) {
    return;
  }
  wgl.setShaderVec4(shader, location, x, y, z, w);
}

function _getBeamFastStampedShader(): _BeamFastStampedShader | null {
  if (_BEAM_FAST_STAMPED_SHADER_TRIED) {
    return _BEAM_FAST_STAMPED_SHADER;
  }

  _BEAM_FAST_STAMPED_SHADER_TRIED = true;
  let shader: WebGLProgram;
  try {
    shader = wgl.createShaderProgram(_BEAM_SHADER_VS_330, _BEAM_FAST_STAMPED_FS_330);
  } catch {
    _BEAM_FAST_STAMPED_SHADER = null;
    return null;
  }

  _BEAM_FAST_STAMPED_SHADER = new _BeamFastStampedShader({
    shader,
    mvpLoc: wgl.getShaderLocation(shader, 'mvp'),
    colorLoc: wgl.getShaderLocation(shader, 'colDiffuse'),
    stepUvLoc: wgl.getShaderLocation(shader, 'u_step_uv'),
    stampScaleLoc: wgl.getShaderLocation(shader, 'u_stamp_scale'),
    stampDecayLoc: wgl.getShaderLocation(shader, 'u_stamp_decay'),
    stampQuadLoc: wgl.getShaderLocation(shader, 'u_stamp_quad'),
    stampOffsetLoc: wgl.getShaderLocation(shader, 'u_stamp_offset'),
    intensityGainLoc: wgl.getShaderLocation(shader, 'u_intensity_gain'),
  });
  return _BEAM_FAST_STAMPED_SHADER;
}

function _requireBeamFastStampedShader(): _BeamFastStampedShader {
  const shaderData = _getBeamFastStampedShader();
  if (shaderData === null) {
    throw new Error('rtx mode requires beam virtual shader, but it failed to load/compile');
  }
  return shaderData;
}

function _applyVirtualBeamUniforms(opts: {
  shaderData: _BeamFastStampedShader;
  stepUv: number;
  intensityGain: number;
}): void {
  const shader = opts.shaderData.shader;
  _setShaderVec4(shader, opts.shaderData.colorLoc, 1.0, 1.0, 1.0, 1.0);
  _setShaderFloat(shader, opts.shaderData.stepUvLoc, opts.stepUv);
  _setShaderFloat(shader, opts.shaderData.stampScaleLoc, SHADER_STAMP_VIRTUAL_PROFILE_A);
  _setShaderFloat(shader, opts.shaderData.stampDecayLoc, -SHADER_STAMP_VIRTUAL_PROFILE_LINEAR);
  _setShaderFloat(shader, opts.shaderData.stampQuadLoc, SHADER_STAMP_VIRTUAL_PROFILE_QUAD);
  _setShaderFloat(shader, opts.shaderData.stampOffsetLoc, SHADER_STAMP_VIRTUAL_PROFILE_OFFSET);
  _setShaderFloat(shader, opts.shaderData.intensityGainLoc, opts.intensityGain);
}

export function drawBeamFastStampedBody(opts: {
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
  const shaderData = _requireBeamFastStampedShader();

  const spanUnits = Math.max(0.0, opts.spanDistUnits);
  if (spanUnits <= 1e-6) {
    return true;
  }

  const ray = opts.headScreen.sub(opts.originScreen);
  const [directionScreen, rayLen] = ray.normalizedWithLength();
  if (rayLen <= 1e-6) {
    return true;
  }

  const totalUnits = Math.max(1e-6, opts.startDistUnits + spanUnits);
  const startT = clamp(opts.startDistUnits / totalUnits, 0.0, 1.0);
  const p0 = opts.originScreen.add(ray.mul(startT));
  const p1 = opts.headScreen;
  const [direction, length] = p1.sub(p0).normalizedWithLength();
  if (length <= 1e-6) {
    return true;
  }

  const radius = Math.max(0.001, SHADER_STAMP_ANALYTIC_RADIUS_SCALE * opts.effectScale * opts.scale);
  const screenPerUnit = length / Math.max(1e-6, spanUnits);
  const stepScreen = Math.max(1e-6, opts.stepUnits * screenPerUnit);
  const stepUv = Math.max(1e-4, stepScreen / radius);
  const uLen = length / radius;

  const side = direction.perpLeft().mul(radius);
  const tailEnd = p0.sub(direction.mul(radius));
  const headEnd = p1.add(direction.mul(radius));

  const alphaU8 = int(clamp(opts.baseAlpha * 255.0, 0.0, 255.0) + 0.5);
  if (alphaU8 <= 0) {
    return true;
  }

  const r = int(clamp(opts.streakRgb[0] * 255.0, 0.0, 255.0) + 0.5);
  const g = int(clamp(opts.streakRgb[1] * 255.0, 0.0, 255.0) + 0.5);
  const b = int(clamp(opts.streakRgb[2] * 255.0, 0.0, 255.0) + 0.5);

  const shader = shaderData.shader;
  _applyVirtualBeamUniforms({
    shaderData,
    stepUv,
    intensityGain: SHADER_STAMP_VIRTUAL_INTENSITY_GAIN,
  });

  let pos = tailEnd.sub(side);
  const vertices: wgl.ShaderQuadVertex[] = [{
    x: pos.x,
    y: pos.y,
    z: uLen,
    u: -1.0,
    v: -1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  }];

  pos = tailEnd.add(side);
  vertices.push({
    x: pos.x,
    y: pos.y,
    z: uLen,
    u: -1.0,
    v: 1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  });

  pos = headEnd.add(side);
  vertices.push({
    x: pos.x,
    y: pos.y,
    z: uLen,
    u: uLen + 1.0,
    v: 1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  });

  pos = headEnd.sub(side);
  vertices.push({
    x: pos.x,
    y: pos.y,
    z: uLen,
    u: uLen + 1.0,
    v: -1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  });

  wgl.drawShaderQuad(shader, shaderData.mvpLoc, vertices);
  return true;
}

export function drawBeamFastStampedHead(opts: {
  centerScreen: Vec2;
  rotationRad: number;
  effectScale: number;
  scale: number;
  baseAlpha: number;
  headRgb: [number, number, number];
  isFire: boolean;
}): boolean {
  const shaderData = _requireBeamFastStampedShader();

  const alphaU8 = int(clamp(opts.baseAlpha * 255.0, 0.0, 255.0) + 0.5);
  if (alphaU8 <= 0) {
    return true;
  }

  const radiusMultiplier = opts.isFire
    ? SHADER_STAMP_VIRTUAL_HEAD_FIRE_RADIUS_MULTIPLIER
    : SHADER_STAMP_VIRTUAL_HEAD_RADIUS_MULTIPLIER;
  const radius = Math.max(
    0.001,
    SHADER_STAMP_ANALYTIC_RADIUS_SCALE * opts.effectScale * opts.scale * radiusMultiplier,
  );
  const direction = Vec2.fromAngle(opts.rotationRad);
  const side = direction.perpLeft().mul(radius);
  const forward = direction.mul(radius);

  const r = int(clamp(opts.headRgb[0] * 255.0, 0.0, 255.0) + 0.5);
  const g = int(clamp(opts.headRgb[1] * 255.0, 0.0, 255.0) + 0.5);
  const b = int(clamp(opts.headRgb[2] * 255.0, 0.0, 255.0) + 0.5);

  const shader = shaderData.shader;
  _applyVirtualBeamUniforms({
    shaderData,
    stepUv: 1.0,
    intensityGain: SHADER_STAMP_VIRTUAL_INTENSITY_GAIN,
  });

  let pos = opts.centerScreen.sub(forward).sub(side);
  const vertices: wgl.ShaderQuadVertex[] = [{
    x: pos.x,
    y: pos.y,
    z: -1.0,
    u: -1.0,
    v: -1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  }];

  pos = opts.centerScreen.sub(forward).add(side);
  vertices.push({
    x: pos.x,
    y: pos.y,
    z: -1.0,
    u: -1.0,
    v: 1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  });

  pos = opts.centerScreen.add(forward).add(side);
  vertices.push({
    x: pos.x,
    y: pos.y,
    z: -1.0,
    u: 1.0,
    v: 1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  });

  pos = opts.centerScreen.add(forward).sub(side);
  vertices.push({
    x: pos.x,
    y: pos.y,
    z: -1.0,
    u: 1.0,
    v: -1.0,
    r: r / 255,
    g: g / 255,
    b: b / 255,
    a: alphaU8 / 255,
  });

  wgl.drawShaderQuad(shader, shaderData.mvpLoc, vertices);
  return true;
}
