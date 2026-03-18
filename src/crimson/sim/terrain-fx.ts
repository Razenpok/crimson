// Port of crimson/sim/terrain_fx.py

import { RGBA } from '../../grim/color.ts';
import { Vec2 } from '../../grim/geom.ts';
import { FxQueue, FxQueueRotated } from '../effects.ts';

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

export interface TerrainFxBatch {
  readonly decals: readonly TerrainDecalFx[];
  readonly corpses: readonly TerrainCorpseFx[];
}

export function terrainFxBatchIsEmpty(batch: TerrainFxBatch): boolean {
  return batch.decals.length === 0 && batch.corpses.length === 0;
}

export const EMPTY_TERRAIN_FX_BATCH: TerrainFxBatch = {
  decals: [],
  corpses: [],
};

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

    return { decals, corpses };
  }
}
