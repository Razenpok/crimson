// Port of crimson/sim/terrain_fx.py

import { RGBA } from '@grim/color.ts';
import { Vec2 } from '@grim/geom.ts';
import { FxQueue, FxQueueRotated } from '@crimson/effects.ts';

export interface TerrainDecalFx {
  readonly effectId: number;
  readonly rotation: number;
  readonly pos: Vec2;
  readonly width: number;
  readonly height: number;
  readonly color: RGBA;
}

export interface TerrainCorpseFx {
  readonly topLeft: Vec2;
  readonly color: RGBA;
  readonly rotation: number;
  readonly scale: number;
  readonly creatureTypeId: number;
}

export class TerrainFxBatch {
  readonly decals: readonly TerrainDecalFx[];
  readonly corpses: readonly TerrainCorpseFx[];

  constructor(opts: { decals?: readonly TerrainDecalFx[]; corpses?: readonly TerrainCorpseFx[] } = {}) {
    this.decals = opts.decals ?? [];
    this.corpses = opts.corpses ?? [];
  }

  isEmpty(): boolean {
    return this.decals.length === 0 && this.corpses.length === 0;
  }
}

export function terrainFxBatchIsEmpty(batch: TerrainFxBatch): boolean {
  return batch.isEmpty();
}

export const EMPTY_TERRAIN_FX_BATCH = new TerrainFxBatch();

export class TerrainFxScratch {
  decals = new FxQueue();
  corpses = new FxQueueRotated();

  clear(): void {
    this.decals.clear();
    this.corpses.clear();
  }

  takeBatch(): TerrainFxBatch {
    const decals: TerrainDecalFx[] = this.decals.iterActive().map((entry) => ({
      effectId: entry.effectId,
      rotation: entry.rotation,
      pos: entry.pos,
      width: entry.width,
      height: entry.height,
      color: entry.color,
    }));

    const corpses: TerrainCorpseFx[] = this.corpses.iterActive().map((entry) => ({
      topLeft: entry.topLeft,
      color: entry.color,
      rotation: entry.rotation,
      scale: entry.scale,
      creatureTypeId: entry.creatureTypeId,
    }));

    this.clear();

    return new TerrainFxBatch({ decals, corpses });
  }
}
