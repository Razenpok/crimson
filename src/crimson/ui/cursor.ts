// Port of crimson/ui/cursor.py

import * as wgl from '@wgl';
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
  particles: wgl.Texture | null,
  opts: {
    pos: Vec2;
    pulseTime?: number | null;
    effectId?: number;
  },
): void {
  if (particles === null) return;

  const pos = opts.pos;
  const pulseTime = opts.pulseTime ?? null;
  const effectId = opts.effectId ?? CURSOR_EFFECT_ID;

  const src = effectSrcRect(
    effectId,
    { textureWidth: particles.width, textureHeight: particles.height },
  );
  if (src === null) return;

  const srcRect = wgl.makeRectangle(src[0], src[1], src[2], src[3]);

  wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);

  if (pulseTime === null) {
    const dst = wgl.makeRectangle(pos.x - 32.0, pos.y - 32.0, 64.0, 64.0);
    wgl.drawTexturePro(particles, srcRect, dst, ORIGIN, 0.0, WHITE);
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
      wgl.drawTexturePro(particles, srcRect, dst, ORIGIN, 0.0, tint);
    }
  }

  wgl.endBlendMode();
}

export function drawAimCursor(
  particles: wgl.Texture | null,
  aim: wgl.Texture | null,
  opts: {
    pos: Vec2;
  },
): void {
  const pos = opts.pos;
  drawCursorGlow(particles, { pos });

  if (aim === null) {
    const r = 235 / 255;
    const g = 235 / 255;
    const b = 235 / 255;
    const a = 220 / 255;
    const color = wgl.makeColor(r, g, b, a);

    const cx = int(pos.x);
    const cy = int(pos.y);
    const radius = 10;
    const segments = 36;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      wgl.drawRectangle(x, y, 1, 1, color);
    }

    wgl.drawRectangle(int(pos.x - 14), int(pos.y), 8, 1, color);
    wgl.drawRectangle(int(pos.x + 6), int(pos.y), 8, 1, color);
    wgl.drawRectangle(int(pos.x), int(pos.y - 14), 1, 8, color);
    wgl.drawRectangle(int(pos.x), int(pos.y + 6), 1, 8, color);
    return;
  }

  const src = wgl.makeRectangle(0, 0, aim.width, aim.height);
  const dst = wgl.makeRectangle(pos.x - 10.0, pos.y - 10.0, 20.0, 20.0);
  wgl.drawTexturePro(aim, src, dst, ORIGIN, 0.0, WHITE);
}

export function drawMenuCursor(
  particles: wgl.Texture | null,
  cursor: wgl.Texture | null,
  opts: {
    pos: Vec2;
    pulseTime: number;
  },
): void {
  const pos = opts.pos;
  const pulseTime = opts.pulseTime;
  drawCursorGlow(particles, { pos, pulseTime });

  if (cursor === null) return;

  const src = wgl.makeRectangle(0, 0, cursor.width, cursor.height);
  const dst = wgl.makeRectangle(pos.x - 2.0, pos.y - 2.0, 32.0, 32.0);
  wgl.drawTexturePro(cursor, src, dst, ORIGIN, 0.0, WHITE);
}
