// Port of crimson/ui/cursor.py

import * as wgl from '@wgl';
import { WebGLContext, GlTexture, BlendMode } from "@grim/webgl.ts";
import { Vec2 } from "@grim/geom.ts";
import { effectSrcRect, EffectId } from "@crimson/effects-atlas.ts";

const CURSOR_EFFECT_ID: number = EffectId.GLOW;
const WHITE = wgl.makeColor(1, 1, 1, 1);
const ORIGIN = wgl.makeVector2(0, 0);

function clamp01(value: number): number {
  if (value < 0.0) return 0.0;
  if (value > 1.0) return 1.0;
  return value;
}

export function drawCursorGlow(
  ctx: WebGLContext,
  particles: GlTexture | null,
  pos: Vec2,
  pulseTime: number | null = null,
  effectId: number = CURSOR_EFFECT_ID,
): void {
  if (particles === null) return;

  const src = effectSrcRect(
    effectId,
    particles.width,
    particles.height,
  );
  if (src === null) return;

  const srcRect = wgl.makeRectangle(src[0], src[1], src[2], src[3]);

  ctx.setBlendMode(BlendMode.ADDITIVE);

  if (pulseTime === null) {
    const dst = wgl.makeRectangle(pos.x - 32.0, pos.y - 32.0, 64.0, 64.0);
    ctx.drawTexturePro(particles, srcRect, dst, ORIGIN, 0.0, WHITE);
  } else {
    let alpha = (Math.pow(2.0, Math.sin(pulseTime)) + 2.0) * 0.32;
    alpha = clamp01(alpha);
    const tint = wgl.makeColor(1, 1, 1, alpha);

    const offsets: [number, number, number][] = [
      [-28.0, -28.0, 64.0],
      [-10.0, -18.0, 64.0],
      [-18.0, -10.0, 64.0],
      [-48.0, -48.0, 128.0],
    ];

    for (const [dx, dy, size] of offsets) {
      const dst = wgl.makeRectangle(pos.x + dx, pos.y + dy, size, size);
      ctx.drawTexturePro(particles, srcRect, dst, ORIGIN, 0.0, tint);
    }
  }

  ctx.setBlendMode(BlendMode.ALPHA);
}

export function drawAimCursor(
  ctx: WebGLContext,
  particles: GlTexture | null,
  aim: GlTexture | null,
  pos: Vec2,
): void {
  drawCursorGlow(ctx, particles, pos);

  if (aim === null) {
    // Fallback crosshair using thin rectangles (no circle)
    const r = 235 / 255;
    const g = 235 / 255;
    const b = 235 / 255;
    const a = 220 / 255;

    // Horizontal left line
    ctx.drawRectangle(pos.x - 14, pos.y, 8, 1, r, g, b, a);
    // Horizontal right line
    ctx.drawRectangle(pos.x + 6, pos.y, 8, 1, r, g, b, a);
    // Vertical top line
    ctx.drawRectangle(pos.x, pos.y - 14, 1, 8, r, g, b, a);
    // Vertical bottom line
    ctx.drawRectangle(pos.x, pos.y + 6, 1, 8, r, g, b, a);
    return;
  }

  const src = wgl.makeRectangle(0, 0, aim.width, aim.height);
  const dst = wgl.makeRectangle(pos.x - 10.0, pos.y - 10.0, 20.0, 20.0);
  ctx.drawTexturePro(aim, src, dst, ORIGIN, 0.0, WHITE);
}

export function drawMenuCursor(
  ctx: WebGLContext,
  particles: GlTexture | null,
  cursor: GlTexture | null,
  pos: Vec2,
  pulseTime: number,
): void {
  drawCursorGlow(ctx, particles, pos, pulseTime);

  if (cursor === null) return;

  const src = wgl.makeRectangle(0, 0, cursor.width, cursor.height);
  const dst = wgl.makeRectangle(pos.x - 2.0, pos.y - 2.0, 32.0, 32.0);
  ctx.drawTexturePro(cursor, src, dst, ORIGIN, 0.0, WHITE);
}
