// Port of crimson/terrain_slots.py

import type { CrandLike } from '../engine/rand';
import { TextureId } from '../engine/assets.ts';
import { RngCallerStatic } from './rng-caller-static';

export type TerrainSlotTriplet = readonly [number, number, number];

export const Q1_TERRAIN_SLOTS: TerrainSlotTriplet = [0, 1, 0] as const;
export const Q2_TERRAIN_SLOTS: TerrainSlotTriplet = [2, 3, 2] as const;
export const Q3_TERRAIN_SLOTS: TerrainSlotTriplet = [4, 5, 4] as const;
export const Q4_TERRAIN_SLOTS: TerrainSlotTriplet = [6, 7, 6] as const;
export const DEFAULT_TERRAIN_SLOTS: TerrainSlotTriplet = Q1_TERRAIN_SLOTS;

// Thresholds kept descending to preserve the native chained 1/8 roll order.
const UNLOCK_TERRAIN_SLOTS: ReadonlyArray<readonly [number, TerrainSlotTriplet, RngCallerStatic]> = [
  [40, Q4_TERRAIN_SLOTS, RngCallerStatic.UNLOCK_TERRAIN_Q4],
  [30, Q3_TERRAIN_SLOTS, RngCallerStatic.UNLOCK_TERRAIN_Q3],
  [20, Q2_TERRAIN_SLOTS, RngCallerStatic.UNLOCK_TERRAIN_Q2],
];

const _TEXTURE_ID_BY_TERRAIN_SLOT: Record<number, TextureId> = {
  0: TextureId.TER_Q1_BASE,
  1: TextureId.TER_Q1_OVERLAY,
  2: TextureId.TER_Q2_BASE,
  3: TextureId.TER_Q2_OVERLAY,
  4: TextureId.TER_Q3_BASE,
  5: TextureId.TER_Q3_OVERLAY,
  6: TextureId.TER_Q4_BASE,
  7: TextureId.TER_Q4_OVERLAY,
};

export interface QuestLevel {
  major: number;
  minor: number;
}

export function terrainSlotsForQuest(level: QuestLevel): TerrainSlotTriplet {
  if (level.major <= 4) {
    const base = (level.major - 1) * 2;
    const alt = base + 1;
    if (level.minor < 6) return [base, alt, base];
    return [base, base, alt];
  }
  return [level.minor & 3, 1, 3];
}

export function terrainSlotsToTextureIds(
  slots: TerrainSlotTriplet,
): [TextureId, TextureId, TextureId] {
  return [
    _TEXTURE_ID_BY_TERRAIN_SLOT[slots[0]],
    _TEXTURE_ID_BY_TERRAIN_SLOT[slots[1]],
    _TEXTURE_ID_BY_TERRAIN_SLOT[slots[2]],
  ];
}

export function resolveTerrainSlots<T>(
  slots: TerrainSlotTriplet,
  lookup: (id: TextureId) => T,
): [T, T, T] {
  const [baseId, overlayId, detailId] = terrainSlotsToTextureIds(slots);
  return [lookup(baseId), lookup(overlayId), lookup(detailId)];
}

export function chooseUnlockTerrainSlots(unlockIndex: number, rng: CrandLike): TerrainSlotTriplet {
  for (const [threshold, slots, caller] of UNLOCK_TERRAIN_SLOTS) {
    if (unlockIndex >= threshold && (rng.rand(caller) & 7) === 3) {
      return slots;
    }
  }
  return DEFAULT_TERRAIN_SLOTS;
}
