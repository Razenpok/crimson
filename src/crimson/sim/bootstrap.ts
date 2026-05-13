// Port of crimson/sim/bootstrap.py

import type { CrandLike } from '@grim/rand';
import type { TerrainSlotTriplet } from '@crimson/terrain-slots';
import { chooseUnlockTerrainSlots } from '@crimson/terrain-slots';

// Terrain stamping RNG consumption mirrors `grim/terrain_render.py` + `docs/crimsonland-exe/terrain.md`.
const TERRAIN_RANDOM_PRELUDE_DRAWS = 3;
const TERRAIN_DENSITY_BASE = 800;
const TERRAIN_DENSITY_OVERLAY = 0x23;
const TERRAIN_DENSITY_DETAIL = 0x0F;
const TERRAIN_DENSITY_SHIFT = 19;
const TERRAIN_RAND_DRAWS_PER_STAMP = 3; // rotation, then position draws (see terrain renderer parity notes)

export function terrainStampingDraws(opts: { width: number; height: number }): number {
  // Return the number of `rand()` draws consumed by the procedural terrain stamps.
  const w = Math.max(0, opts.width);
  const h = Math.max(0, opts.height);
  const area = w * h;
  const stamps =
    ((area * TERRAIN_DENSITY_BASE) >> TERRAIN_DENSITY_SHIFT) +
    ((area * TERRAIN_DENSITY_OVERLAY) >> TERRAIN_DENSITY_SHIFT) +
    ((area * TERRAIN_DENSITY_DETAIL) >> TERRAIN_DENSITY_SHIFT);
  return stamps * TERRAIN_RAND_DRAWS_PER_STAMP;
}

export class TerrainSetup {
  constructor(
    public readonly terrainSlots: TerrainSlotTriplet,
    public readonly terrainSeed: number,
  ) {
    Object.freeze(this);
  }
}

function advanceRandomTerrainPreludeRng(rng: CrandLike): void {
  // Native `terrain_generate_random()` consumes three CRT draws before the
  // unlock-gated variant rolls. The values are not used by the rewrite, but
  // the state advance is required for parity.
  rng.advance(TERRAIN_RANDOM_PRELUDE_DRAWS);
}

function advanceTerrainStampingRng(rng: CrandLike, width: number, height: number): void {
  rng.advance(terrainStampingDraws({ width, height }));
}

export function advanceUnlockTerrain(
  rng: CrandLike,
  opts: { unlockIndex: number; width: number; height: number },
): TerrainSetup {
  // Advance RNG through the shared unlock-driven terrain startup window.
  //
  // Mutates the authoritative RNG to match native `terrain_generate_random()`
  // and returns the minimal render boundary data needed by the detached terrain
  // renderer.
  advanceRandomTerrainPreludeRng(rng);
  const terrainSlots = chooseUnlockTerrainSlots({ unlockIndex: opts.unlockIndex, rng });
  const terrainSeed = rng.state;
  advanceTerrainStampingRng(rng, opts.width, opts.height);
  return new TerrainSetup(terrainSlots, terrainSeed);
}

export function advanceExplicitTerrain(
  rng: CrandLike,
  opts: { terrainSlots: TerrainSlotTriplet; width: number; height: number },
): TerrainSetup {
  // Advance RNG through explicit terrain generation when slots are fixed.
  const terrainSeed = rng.state;
  advanceTerrainStampingRng(rng, opts.width, opts.height);
  return new TerrainSetup(opts.terrainSlots, terrainSeed);
}
