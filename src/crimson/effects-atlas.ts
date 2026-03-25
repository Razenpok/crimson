// Port of crimson/effects_atlas.py
import * as wgl from '@wgl';

export const SIZE_CODE_GRID: Record<number, number> = {
  0x10: 16,
  0x20: 8,
  0x40: 4,
  0x80: 2,
};

export interface EffectAtlasEntry {
  readonly effectId: number;
  readonly sizeCode: number;
  readonly frame: number;
}

function entry(effectId: number, sizeCode: number, frame: number): EffectAtlasEntry {
  return { effectId, sizeCode, frame };
}

export const EFFECT_ID_ATLAS_TABLE: readonly EffectAtlasEntry[] = [
  entry(0x00, 0x80, 0x02),
  entry(0x01, 0x80, 0x03),
  entry(0x02, 0x20, 0x00),
  entry(0x03, 0x20, 0x01),
  entry(0x04, 0x20, 0x02),
  entry(0x05, 0x20, 0x03),
  entry(0x06, 0x20, 0x04),
  entry(0x07, 0x20, 0x05),
  entry(0x08, 0x20, 0x08),
  entry(0x09, 0x20, 0x09),
  entry(0x0a, 0x20, 0x0a),
  entry(0x0b, 0x20, 0x0b),
  entry(0x0c, 0x40, 0x05),
  entry(0x0d, 0x40, 0x03),
  entry(0x0e, 0x40, 0x04),
  entry(0x0f, 0x40, 0x05),
  entry(0x10, 0x40, 0x06),
  entry(0x11, 0x40, 0x07),
  entry(0x12, 0x10, 0x26),
];

export const EFFECT_ID_ATLAS_TABLE_BY_ID: Map<number, EffectAtlasEntry> = new Map(
  EFFECT_ID_ATLAS_TABLE.map((e) => [e.effectId, e]),
);

export enum EffectId {
  BURST = 0x00,
  RING = 0x01,
  SHIELD_RING = 0x02,
  EFFECT_03 = 0x03,
  EFFECT_04 = 0x04,
  EFFECT_05 = 0x05,
  EFFECT_06 = 0x06,
  BLOOD_SPLATTER = 0x07,
  FREEZE_SHARD_0 = 0x08,
  FREEZE_SHARD_1 = 0x09,
  FREEZE_SHARD_2 = 0x0a,
  EFFECT_0B = 0x0b,
  EXPLOSION_BURST = 0x0c,
  GLOW = 0x0d,
  FREEZE_SHATTER = 0x0e,
  EFFECT_0F = 0x0f,
  AURA = 0x10,
  EXPLOSION_PUFF = 0x11,
  CASING = 0x12,
}

export function effectSrcRect(
  effectId: number,
  opts: {
    textureWidth: number;
    textureHeight: number;
  },
): wgl.Rectangle | null {
  const textureWidth = opts.textureWidth;
  const textureHeight = opts.textureHeight;

  const e = EFFECT_ID_ATLAS_TABLE_BY_ID.get(effectId);
  if (e === undefined) return null;

  const grid = SIZE_CODE_GRID[e.sizeCode];
  if (!grid) return null;

  const frame = e.frame;
  const col = frame % grid;
  const row = (frame / grid) | 0;
  const cellW = textureWidth / grid;
  const cellH = textureHeight / grid;
  return wgl.makeRectangle(cellW * col, cellH * row, cellW, cellH);
}
