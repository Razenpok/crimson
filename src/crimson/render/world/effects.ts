// Port of crimson/render/world/effects.py

import { TextureId, getTexture } from '../../../grim/assets.ts';
import { Vec2 } from '../../../grim/geom.ts';
import { clamp } from '../../../grim/math.ts';
import { BlendMode } from '../../../grim/webgl.ts';
import { type EffectEntry, ParticleStyleId } from '../../effects.ts';
import { EFFECT_ID_ATLAS_TABLE_BY_ID, SIZE_CODE_GRID, EffectId } from '../../effects-atlas.ts';
import { RAD_TO_DEG } from './constants.ts';
import { WorldRenderCtx } from './context.ts';
import { fxDetailEnabled } from '../../../grim/config.ts';

function srcRectForEffect(
  effectId: number,
  texWidth: number,
  texHeight: number,
): [number, number, number, number] | null {
  const atlas = EFFECT_ID_ATLAS_TABLE_BY_ID.get(effectId);
  if (atlas === undefined) return null;
  const grid = SIZE_CODE_GRID[atlas.sizeCode];
  if (!grid) return null;
  const frame = atlas.frame;
  const col = frame % grid;
  const row = (frame / grid) | 0;
  const cellW = texWidth / grid;
  const cellH = texHeight / grid;
  return [cellW * col, cellH * row, Math.max(0.0, cellW - 2.0), Math.max(0.0, cellH - 2.0)];
}

export function drawParticlePool(
  renderCtx: WorldRenderCtx,
  camera: Vec2,
  viewScale: Vec2,
  alpha: number = 1.0,
): void {
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const frame = renderCtx.frame;
  const texture = getTexture(frame.resources, TextureId.PARTICLES);
  const particles = frame.state.particles.entries;
  if (!particles.some((e) => e.active)) return;

  const scale = WorldRenderCtx.viewScaleAvg(viewScale);

  const srcLarge = srcRectForEffect(13, texture.width, texture.height);
  const srcNormal = srcRectForEffect(12, texture.width, texture.height);
  const srcStyle8 = srcRectForEffect(2, texture.width, texture.height);
  if (srcNormal === null || srcStyle8 === null) return;

  const config = frame.config;
  const fxDetail1 = config !== null ? fxDetailEnabled(config.display, 1) : true;

  const ctx = renderCtx.gl;
  ctx.setBlendMode(BlendMode.ADDITIVE);

  if (fxDetail1 && srcLarge !== null) {
    const alphaByte = clamp(alpha * 0.065, 0.0, 1.0);
    const tint: [number, number, number, number] = [1, 1, 1, alphaByte];
    for (let idx = 0; idx < particles.length; idx++) {
      const entry = particles[idx];
      if (!entry.active || (idx % 2) || entry.styleId === ParticleStyleId.BUBBLEGUN) continue;
      let radius = (Math.sin((1.0 - entry.intensity) * 1.5707964) + 0.1) * 55.0 + 4.0;
      radius = Math.max(radius, 16.0);
      const size = Math.max(0.0, radius * 2.0 * scale);
      if (size <= 0.0) continue;
      const screen = WorldRenderCtx.worldToScreenWith(entry.pos, camera, viewScale);
      const dst: [number, number, number, number] = [screen.x, screen.y, size, size];
      const origin: [number, number] = [size * 0.5, size * 0.5];
      ctx.drawTexturePro(texture, srcLarge, dst, origin, 0.0, tint);
    }
  }

  for (const entry of particles) {
    if (!entry.active || entry.styleId === ParticleStyleId.BUBBLEGUN) continue;
    let radius = Math.sin((1.0 - entry.intensity) * 1.5707964) * 24.0;
    if (entry.styleId === ParticleStyleId.BLOW_TORCH) radius *= 0.8;
    radius = Math.max(radius, 2.0);
    const size = Math.max(0.0, radius * 2.0 * scale);
    if (size <= 0.0) continue;
    const screen = WorldRenderCtx.worldToScreenWith(entry.pos, camera, viewScale);
    const dst: [number, number, number, number] = [screen.x, screen.y, size, size];
    const origin: [number, number] = [size * 0.5, size * 0.5];
    const rotationDeg = entry.spin * RAD_TO_DEG;
    const tint: [number, number, number, number] = [
      entry.scaleX, entry.scaleY, entry.scaleZ, entry.age * alpha,
    ];
    ctx.drawTexturePro(texture, srcNormal, dst, origin, rotationDeg, tint);
  }

  const alphaClamped = clamp(alpha, 0.0, 1.0);
  for (const entry of particles) {
    if (!entry.active || entry.styleId !== ParticleStyleId.BUBBLEGUN) continue;
    const wobble = Math.sin(entry.spin) * 3.0;
    const halfH = (wobble + 15.0) * entry.scaleX * 7.0;
    const halfW = (15.0 - wobble) * entry.scaleX * 7.0;
    const w = Math.max(0.0, halfW * 2.0 * scale);
    const h = Math.max(0.0, halfH * 2.0 * scale);
    if (w <= 0.0 || h <= 0.0) continue;
    const screen = WorldRenderCtx.worldToScreenWith(entry.pos, camera, viewScale);
    const dst: [number, number, number, number] = [screen.x, screen.y, w, h];
    const origin: [number, number] = [w * 0.5, h * 0.5];
    const tint: [number, number, number, number] = [1, 1, 1, entry.age * alphaClamped];
    ctx.drawTexturePro(texture, srcStyle8, dst, origin, 0.0, tint);
  }

  ctx.setBlendMode(BlendMode.ALPHA);
}

export function drawSpriteEffectPool(
  renderCtx: WorldRenderCtx,
  camera: Vec2,
  viewScale: Vec2,
  alpha: number = 1.0,
): void {
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const frame = renderCtx.frame;
  const config = frame.config;
  if (config !== null && !fxDetailEnabled(config.display, 2)) return;

  const texture = getTexture(frame.resources, TextureId.PARTICLES);
  const effects = frame.state.spriteEffects.entries;
  if (!effects.some((e) => e.active)) return;

  const atlas = EFFECT_ID_ATLAS_TABLE_BY_ID.get(EffectId.EXPLOSION_PUFF);
  if (atlas === undefined) return;
  const grid = SIZE_CODE_GRID[atlas.sizeCode];
  if (!grid) return;
  const atlasFrame = atlas.frame;
  const col = atlasFrame % grid;
  const row = (atlasFrame / grid) | 0;
  const cellW = texture.width / grid;
  const cellH = texture.height / grid;
  const src: [number, number, number, number] = [cellW * col, cellH * row, cellW, cellH];
  const scale = WorldRenderCtx.viewScaleAvg(viewScale);

  const ctx = renderCtx.gl;
  ctx.setBlendMode(BlendMode.ALPHA);
  for (const entry of effects) {
    if (!entry.active) continue;
    const size = entry.scale * scale;
    if (size <= 0.0) continue;
    const screen = WorldRenderCtx.worldToScreenWith(entry.pos, camera, viewScale);
    const dst: [number, number, number, number] = [screen.x, screen.y, size, size];
    const origin: [number, number] = [size * 0.5, size * 0.5];
    const rotationDeg = entry.rotation * RAD_TO_DEG;
    const c = entry.color.scaledAlpha(alpha);
    const tint: [number, number, number, number] = [c.r, c.g, c.b, c.a];
    ctx.drawTexturePro(texture, src, dst, origin, rotationDeg, tint);
  }
  ctx.setBlendMode(BlendMode.ALPHA);
}

export function drawEffectPool(
  renderCtx: WorldRenderCtx,
  camera: Vec2,
  viewScale: Vec2,
  alpha: number = 1.0,
): void {
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const frame = renderCtx.frame;
  const texture = getTexture(frame.resources, TextureId.PARTICLES);
  const effects = frame.state.effects.entries;
  if (!effects.some((e) => e.flags && e.age >= 0.0)) return;

  const scale = WorldRenderCtx.viewScaleAvg(viewScale);

  const srcCache = new Map<number, [number, number, number, number]>();

  function srcRect(effectId: number): [number, number, number, number] | null {
    const cached = srcCache.get(effectId);
    if (cached !== undefined) return cached;

    const atlas = EFFECT_ID_ATLAS_TABLE_BY_ID.get(effectId);
    if (atlas === undefined) return null;
    const grid = SIZE_CODE_GRID[atlas.sizeCode];
    if (!grid) return null;
    const f = atlas.frame;
    const col = f % grid;
    const row = (f / grid) | 0;
    const cellW = texture.width / grid;
    const cellH = texture.height / grid;
    const src: [number, number, number, number] = [
      cellW * col, cellH * row,
      Math.max(0.0, cellW - 2.0), Math.max(0.0, cellH - 2.0),
    ];
    srcCache.set(effectId, src);
    return src;
  }

  function drawEntry(entry: EffectEntry): void {
    const effectId = entry.effectId;
    const src = srcRect(effectId);
    if (src === null) return;

    const screen = WorldRenderCtx.worldToScreenWith(entry.pos, camera, viewScale);
    const halfW = entry.halfWidth;
    const halfH = entry.halfHeight;
    const localScale = entry.scale;
    const w = Math.max(0.0, halfW * 2.0 * localScale * scale);
    const h = Math.max(0.0, halfH * 2.0 * localScale * scale);
    if (w <= 0.0 || h <= 0.0) return;

    const rotationDeg = entry.rotation * RAD_TO_DEG;
    const c = entry.color.scaledAlpha(alpha);
    const tint: [number, number, number, number] = [c.r, c.g, c.b, c.a];

    const dst: [number, number, number, number] = [screen.x, screen.y, w, h];
    const origin: [number, number] = [w * 0.5, h * 0.5];
    renderCtx.gl.drawTexturePro(texture, src, dst, origin, rotationDeg, tint);
  }

  const ctx = renderCtx.gl;
  ctx.setBlendMode(BlendMode.ALPHA);
  for (const entry of effects) {
    if (!entry.flags || entry.age < 0.0) continue;
    if (entry.flags & 0x40) drawEntry(entry);
  }

  ctx.setBlendMode(BlendMode.ADDITIVE);
  for (const entry of effects) {
    if (!entry.flags || entry.age < 0.0) continue;
    if (!(entry.flags & 0x40)) drawEntry(entry);
  }

  ctx.setBlendMode(BlendMode.ALPHA);
}
