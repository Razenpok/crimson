// Port of crimson/render/projectile_draw/primary_special.py

import { RGBA } from '../../../grim/color.ts';
import { Vec2 } from '../../../grim/geom.ts';
import { clamp } from '../../../grim/math.ts';
import { BlendMode } from '../../../grim/webgl.ts';
import { ProjectileTemplateId } from '../../projectiles/types.ts';
import { KNOWN_PROJ_FRAMES } from '../../sim/world-defs.ts';
import { projOrigin } from './common.ts';
import type { ProjectileDrawCtx } from './types.ts';

function beginDarkenSrcZeroBlend(gl: { setCustomBlendFactorsSeparate(srcRGB: number, dstRGB: number, eqRGB: number, srcA: number, dstA: number, eqA: number): void; setBlendMode(mode: BlendMode): void; readonly gl: WebGL2RenderingContext }): void {
  // Native projectile_render switches Plague Spreader to D3D8 SRC=ZERO / DST=INVSRCALPHA.
  // Alpha channel: SRC=ZERO, DST=ONE (preserve destination alpha).
  const rawGl = gl.gl;
  gl.setCustomBlendFactorsSeparate(
    rawGl.ZERO, rawGl.ONE_MINUS_SRC_ALPHA, rawGl.FUNC_ADD,
    rawGl.ZERO, rawGl.ONE, rawGl.FUNC_ADD,
  );
  gl.setBlendMode(BlendMode.CUSTOM);
}

export function drawPulseGun(ctx: ProjectileDrawCtx): boolean {
  const renderer = ctx.renderer;
  if (ctx.typeId !== ProjectileTemplateId.PULSE_GUN) return false;
  if (ctx.texture === null) return false;

  const mapping = KNOWN_PROJ_FRAMES.get(ctx.typeId);
  if (mapping === undefined) return true;
  const [grid, frame] = mapping;
  const cellW = ctx.texture.width / grid;

  const alpha = ctx.alpha;
  const life = ctx.life;
  const gl = renderer.gl;

  if (life >= 0.4) {
    const origin = projOrigin(ctx.proj, ctx.pos);
    const dist = origin.distanceTo(ctx.pos);

    const desiredSize = dist * 0.16 * ctx.scale;
    if (desiredSize <= 1e-3) return true;
    const spriteScale = cellW > 1e-6 ? desiredSize / cellW : 0.0;
    if (spriteScale <= 1e-6) return true;

    const tint = new RGBA(0.1, 0.6, 0.2, alpha * 0.7).toTuple();
    gl.setBlendMode(BlendMode.ADDITIVE);
    renderer.drawAtlasSprite(ctx.texture, grid, frame, ctx.screenPos, spriteScale, ctx.angle, tint);
    gl.setBlendMode(BlendMode.ALPHA);
    return true;
  }

  const fade = clamp(life * 2.5, 0.0, 1.0);
  const fadeAlpha = fade * alpha;
  if (fadeAlpha <= 1e-3) return true;

  const desiredSize = 56.0 * ctx.scale;
  const spriteScale = cellW > 1e-6 ? desiredSize / cellW : 0.0;
  if (spriteScale <= 1e-6) return true;

  const tint = new RGBA(1.0, 1.0, 1.0, fadeAlpha).toTuple();
  gl.setBlendMode(BlendMode.ADDITIVE);
  renderer.drawAtlasSprite(ctx.texture, grid, frame, ctx.screenPos, spriteScale, ctx.angle, tint);
  gl.setBlendMode(BlendMode.ALPHA);
  return true;
}

export function drawSplitterOrBlade(ctx: ProjectileDrawCtx): boolean {
  const renderer = ctx.renderer;
  const typeId = ctx.typeId;
  if (typeId !== ProjectileTemplateId.SPLITTER_GUN && typeId !== ProjectileTemplateId.BLADE_GUN) {
    return false;
  }
  if (ctx.texture === null) return false;

  const mapping = KNOWN_PROJ_FRAMES.get(typeId);
  if (mapping === undefined) return true;
  const [grid, frame] = mapping;
  const cellW = ctx.texture.width / grid;

  if (ctx.life < 0.4) return true;

  const origin = projOrigin(ctx.proj, ctx.pos);
  const dist = origin.distanceTo(ctx.pos);

  const desiredSize = Math.min(dist, 20.0) * ctx.scale;
  if (desiredSize <= 1e-3) return true;

  const spriteScale = cellW > 1e-6 ? desiredSize / cellW : 0.0;
  if (spriteScale <= 1e-6) return true;

  let rotationRad = ctx.angle;
  let rgb: [number, number, number] = [1.0, 1.0, 1.0];
  if (typeId === ProjectileTemplateId.BLADE_GUN) {
    rotationRad = ctx.projIndex * 0.1 - renderer.frame.elapsedMs * 0.1;
    rgb = [0.8, 0.8, 0.8];
  }

  const tint = new RGBA(rgb[0], rgb[1], rgb[2], ctx.alpha).toTuple();
  renderer.drawAtlasSprite(ctx.texture, grid, frame, ctx.screenPos, spriteScale, rotationRad, tint);
  return true;
}

export function drawPlagueSpreader(ctx: ProjectileDrawCtx): boolean {
  const renderer = ctx.renderer;
  if (ctx.typeId !== ProjectileTemplateId.PLAGUE_SPREADER) return false;
  const texture = ctx.texture;
  if (texture === null) return false;

  const grid = 4;
  const frame = 2;
  const cellW = texture.width / grid;

  const alpha = ctx.alpha;
  const life = ctx.life;
  const gl = renderer.gl;

  if (life >= 0.4) {
    const tint = new RGBA(1.0, 1.0, 1.0, alpha).toTuple();

    const drawPlagueQuad = (pos: Vec2, size: number): void => {
      if (size <= 1e-3) return;
      const desiredSize = size * ctx.scale;
      const spriteScale = cellW > 1e-6 ? desiredSize / cellW : 0.0;
      if (spriteScale <= 1e-6) return;
      const posScreen = renderer.worldToScreen(pos);
      renderer.drawAtlasSprite(texture, grid, frame, posScreen, spriteScale, 0.0, tint);
    };

    beginDarkenSrcZeroBlend(gl);
    try {
      drawPlagueQuad(ctx.pos, 60.0);

      const offset = Vec2.fromHeading(ctx.angle + Math.PI).mul(15.0);
      drawPlagueQuad(ctx.pos.add(offset), 60.0);

      const phase = ctx.projIndex + renderer.frame.elapsedMs * 0.01;
      const cosPhase = Math.cos(phase);
      const sinPhase = Math.sin(phase);
      drawPlagueQuad(
        ctx.pos.offset(cosPhase * cosPhase - 5.0, sinPhase * 11.0 - 5.0),
        52.0,
      );

      const phase120 = phase + 2.0943952;
      const sinPhase120 = Math.sin(phase120);
      drawPlagueQuad(
        ctx.pos.add(Vec2.fromPolar(phase120, 10.0)),
        62.0,
      );

      const phase240 = phase + 4.1887903;
      drawPlagueQuad(
        ctx.pos.add(new Vec2(Math.cos(phase240) * 10.0, Math.sin(phase240) * sinPhase120)),
        62.0,
      );
    } finally {
      gl.setBlendMode(BlendMode.ALPHA);
    }
    return true;
  }

  const fade = clamp(life * 2.5, 0.0, 1.0);
  const fadeAlpha = fade * alpha;
  if (fadeAlpha <= 1e-3) return true;

  const desiredSize = (fade * 40.0 + 32.0) * ctx.scale;
  const spriteScale = cellW > 1e-6 ? desiredSize / cellW : 0.0;
  if (spriteScale <= 1e-6) return true;

  const tint = new RGBA(1.0, 1.0, 1.0, fadeAlpha).toTuple();
  beginDarkenSrcZeroBlend(gl);
  try {
    renderer.drawAtlasSprite(texture, grid, frame, ctx.screenPos, spriteScale, 0.0, tint);
  } finally {
    gl.setBlendMode(BlendMode.ALPHA);
  }
  return true;
}
