// Port of crimson/render/projectile_draw/secondary_detonation.py

import * as wgl from '@wgl';
import { TextureId, getTexture } from '@grim/assets.ts';
import { RGBA } from '@grim/color.ts';
import { clamp } from '@grim/math.ts';
import { BlendMode } from '@grim/webgl.ts';
import { EFFECT_ID_ATLAS_TABLE_BY_ID, SIZE_CODE_GRID, EffectId } from '@crimson/effects-atlas.ts';
import type { SecondaryProjectileDrawCtx } from './types.ts';

export function drawSecondaryDetonation(ctx: SecondaryProjectileDrawCtx): boolean {
  const renderer = ctx.renderer;
  if (ctx.projType !== 3) return false;

  // Secondary projectile detonation visuals (secondary_projectile_update + render).
  const t = clamp(ctx.proj.detonationT, 0.0, 1.0);
  const detScale = ctx.proj.detonationScale;
  const fade = (1.0 - t) * ctx.alpha;
  if (fade <= 1e-3 || detScale <= 1e-6) return true;

  const scale = ctx.scale;
  const gl = renderer.gl;

  const particlesTexture = getTexture(renderer.frame.resources, TextureId.PARTICLES);
  if (particlesTexture === null) {
    // Fallback: approximate circle outline with a white-texture quad
    const radius = Math.max(1.0, detScale * t * 80.0);
    const size = radius * 2.0;
    const whTex = gl.whiteTexture;
    const sp = ctx.screenPos;
    const tint = wgl.makeColor(1.0, 180 / 255, 100 / 255, fade * (180.0 / 255.0));
    gl.drawTexturePro(whTex, wgl.makeRectangle(0, 0, 1, 1), wgl.makeRectangle(sp.x, sp.y, size, size), wgl.makeVector2(size * 0.5, size * 0.5), 0, tint);
    return true;
  }

  const atlas = EFFECT_ID_ATLAS_TABLE_BY_ID.get(EffectId.GLOW);
  if (atlas === undefined) return true;
  const grid = SIZE_CODE_GRID[atlas.sizeCode];
  if (!grid) return true;
  const frame = atlas.frame;
  const col = frame % grid;
  const row = (frame / grid) | 0;
  const cellW = particlesTexture.width / grid;
  const cellH = particlesTexture.height / grid;
  const src = wgl.makeRectangle(
    cellW * col,
    cellH * row,
    Math.max(0.0, cellW - 2.0),
    Math.max(0.0, cellH - 2.0),
  );

  const drawDetonationQuad = (size: number, alphaMul: number): void => {
    const a = fade * alphaMul;
    if (a <= 1e-3) return;
    const dstSize = size * scale;
    if (dstSize <= 1e-3) return;
    const tint = new RGBA(1.0, 0.6, 0.1, a).toTuple();
    const dst = wgl.makeRectangle(ctx.screenPos.x, ctx.screenPos.y, dstSize, dstSize);
    const origin = wgl.makeVector2(dstSize * 0.5, dstSize * 0.5);
    gl.drawTexturePro(particlesTexture!, src, dst, origin, 0.0, tint);
  };

  gl.setBlendMode(BlendMode.ADDITIVE);
  drawDetonationQuad(detScale * t * 64.0, 1.0);
  drawDetonationQuad(detScale * t * 200.0, 0.3);
  gl.setBlendMode(BlendMode.ALPHA);
  return true;
}
