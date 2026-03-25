// Port of crimson/sim/bootstrap.py

import type { CrandLike } from '@grim/rand';
import type { TerrainSlotTriplet } from '@crimson/terrain-slots';
import { chooseUnlockTerrainSlots } from '@crimson/terrain-slots';

const TERRAIN_RANDOM_PRELUDE_DRAWS = 3;
const TERRAIN_DENSITY_BASE = 800;
const TERRAIN_DENSITY_OVERLAY = 0x23;
const TERRAIN_DENSITY_DETAIL = 0x0F;
const TERRAIN_DENSITY_SHIFT = 19;
const TERRAIN_RAND_DRAWS_PER_STAMP = 3;

export function terrainStampingDraws(opts: { width: number; height: number }): number {
  const w = Math.max(0, opts.width);
  const h = Math.max(0, opts.height);
  const area = w * h;
  const stamps =
    ((area * TERRAIN_DENSITY_BASE) >> TERRAIN_DENSITY_SHIFT) +
    ((area * TERRAIN_DENSITY_OVERLAY) >> TERRAIN_DENSITY_SHIFT) +
    ((area * TERRAIN_DENSITY_DETAIL) >> TERRAIN_DENSITY_SHIFT);
  return stamps * TERRAIN_RAND_DRAWS_PER_STAMP;
}

export interface TerrainSetup {
  readonly terrainSlots: TerrainSlotTriplet;
  readonly terrainSeed: number;
}

function advanceRandomTerrainPreludeRng(rng: CrandLike): void {
  rng.advance(TERRAIN_RANDOM_PRELUDE_DRAWS);
}

function advanceTerrainStampingRng(rng: CrandLike, width: number, height: number): void {
  rng.advance(terrainStampingDraws({ width, height }));
}

export function advanceUnlockTerrain(
  rng: CrandLike,
  opts: { unlockIndex: number; width: number; height: number },
): TerrainSetup {
  advanceRandomTerrainPreludeRng(rng);
  const terrainSlots = chooseUnlockTerrainSlots({ unlockIndex: opts.unlockIndex, rng });
  const terrainSeed = rng.state;
  advanceTerrainStampingRng(rng, opts.width, opts.height);
  return { terrainSlots, terrainSeed };
}

export function advanceExplicitTerrain(
  rng: CrandLike,
  opts: { terrainSlots: TerrainSlotTriplet; width: number; height: number },
): TerrainSetup {
  const terrainSeed = rng.state;
  advanceTerrainStampingRng(rng, opts.width, opts.height);
  return { terrainSlots: opts.terrainSlots, terrainSeed };
}
