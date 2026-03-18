// Port of crimson/render/projectile_draw/secondary_rocket.py

import { TextureId, getTexture } from '../../../engine/assets.ts';
import { RGBA } from '../../../engine/color.ts';
import { Vec2 } from '../../../engine/geom.ts';
import { clamp } from '../../../engine/math.ts';
import { BlendMode } from '../../../engine/webgl.ts';
import { EFFECT_ID_ATLAS_TABLE_BY_ID, SIZE_CODE_GRID, EffectId } from '../../effects-atlas.ts';
import { SecondaryProjectileTypeId } from '../../projectiles/types.ts';
import type { SecondaryProjectileDrawCtx } from './types.ts';

export interface SecondaryRocketStyle {
  readonly baseSize: number;
  readonly glowSize: number;
  readonly glowRgb: [number, number, number];
  readonly glowAlphaMul: number;
}

const ROCKET_STYLE_BY_TYPE: Map<number, SecondaryRocketStyle> = new Map([
  [SecondaryProjectileTypeId.ROCKET, {
    baseSize: 14.0,
    glowSize: 60.0,
    glowRgb: [1.0, 1.0, 1.0] as [number, number, number],
    glowAlphaMul: 0.68,
  }],
  [SecondaryProjectileTypeId.HOMING_ROCKET, {
    baseSize: 10.0,
    glowSize: 40.0,
    glowRgb: [1.0, 1.0, 1.0] as [number, number, number],
    glowAlphaMul: 0.58,
  }],
  [SecondaryProjectileTypeId.ROCKET_MINIGUN, {
    baseSize: 8.0,
    glowSize: 30.0,
    glowRgb: [0.7, 0.7, 1.0] as [number, number, number],
    glowAlphaMul: 0.158,
  }],
]);

function drawSecondaryRocketGlow(ctx: SecondaryProjectileDrawCtx, style: SecondaryRocketStyle): void {
  const renderer = ctx.renderer;
  const renderFrame = renderer.frame;
  const fxDetail1 = renderFrame.config !== null
    ? (renderFrame.config.display.fxDetail[1] ?? true)
    : true;

  let particlesTexture;
  try {
    particlesTexture = getTexture(renderFrame.resources, TextureId.PARTICLES);
  } catch {
    particlesTexture = null;
  }
  if (!fxDetail1 || particlesTexture === null) return;

  const atlas = EFFECT_ID_ATLAS_TABLE_BY_ID.get(EffectId.GLOW);
  if (atlas === undefined) return;
  const grid = SIZE_CODE_GRID[atlas.sizeCode];
  if (!grid) return;

  const frame = atlas.frame;
  const col = frame % grid;
  const row = (frame / grid) | 0;
  const particleCellW = particlesTexture.width / grid;
  const particleCellH = particlesTexture.height / grid;
  const src: [number, number, number, number] = [
    particleCellW * col,
    particleCellH * row,
    Math.max(0.0, particleCellW - 2.0),
    Math.max(0.0, particleCellH - 2.0),
  ];

  const direction = Vec2.fromHeading(ctx.angle);
  const scale = ctx.scale;
  const alpha = ctx.alpha;
  const gl = renderer.gl;

  const drawRocketFx = (size: number, offset: number, rgba: RGBA): void => {
    const fxAlpha = rgba.a;
    if (fxAlpha <= 1e-3) return;
    const tint = rgba.toTuple();
    const fxPos = ctx.screenPos.sub(direction.mul(offset * scale));
    const dstSize = size * scale;
    const dst: [number, number, number, number] = [fxPos.x, fxPos.y, dstSize, dstSize];
    const origin: [number, number] = [dstSize * 0.5, dstSize * 0.5];
    gl.drawTexturePro(particlesTexture!, src, dst, origin, 0.0, tint);
  };

  gl.setBlendMode(BlendMode.ADDITIVE);
  // Large bloom around the rocket.
  drawRocketFx(140.0, 5.0, new RGBA(1.0, 1.0, 1.0, alpha * 0.48));

  const [glowR, glowG, glowB] = style.glowRgb;
  drawRocketFx(style.glowSize, 9.0, new RGBA(glowR, glowG, glowB, alpha * style.glowAlphaMul));
  gl.setBlendMode(BlendMode.ALPHA);
}

export function drawSecondaryRocket(ctx: SecondaryProjectileDrawCtx): boolean {
  const style = ROCKET_STYLE_BY_TYPE.get(ctx.projType);
  if (style === undefined) return false;

  const renderer = ctx.renderer;
  let texture;
  try {
    texture = getTexture(renderer.frame.resources, TextureId.PROJS);
  } catch {
    return false;
  }

  const cellW = texture.width / 4.0;
  if (cellW <= 1e-6) return true;

  const alpha = ctx.alpha;
  const spriteScale = (style.baseSize * ctx.scale) / cellW;
  const baseAlpha = clamp(alpha * 0.9, 0.0, 1.0);
  const baseTint = new RGBA(0.8, 0.8, 0.8, baseAlpha).toTuple();

  drawSecondaryRocketGlow(ctx, style);

  renderer.drawAtlasSprite(texture, 4, 3, ctx.screenPos, spriteScale, ctx.angle, baseTint);
  return true;
}

export function drawSecondaryType4Fallback(ctx: SecondaryProjectileDrawCtx): boolean {
  if (ctx.projType !== SecondaryProjectileTypeId.ROCKET_MINIGUN) return false;
  // Native draws a filled purple circle. Approximate with a white-texture quad.
  const gl = ctx.renderer.gl;
  const scale = ctx.scale;
  const radius = Math.max(1.0, 12.0 * scale);
  const size = radius * 2.0;
  const sp = ctx.screenPos;
  const tint: [number, number, number, number] = [200 / 255, 120 / 255, 1.0, ctx.alpha];
  gl.drawTexturePro(gl.whiteTexture, [0, 0, 1, 1], [sp.x, sp.y, size, size], [size * 0.5, size * 0.5], 0, tint);
  return true;
}
