// Port of crimson/sim/terrain_fx.py

import { RGBA } from '@grim/color.ts';
import { Vec2 } from '@grim/geom.ts';
import { FxQueue, FxQueueRotated } from '@crimson/effects.ts';

export class TerrainDecalFx {
  constructor(opts: {
    effectId?: number;
    rotation?: number;
    pos?: Vec2;
    width?: number;
    height?: number;
    color?: RGBA;
  } = {}) {
    this.effectId = opts.effectId ?? 0;
    this.rotation = opts.rotation ?? 0.0;
    this.pos = opts.pos ?? new Vec2();
    this.width = opts.width ?? 0.0;
    this.height = opts.height ?? 0.0;
    this.color = opts.color ?? new RGBA();
  }

  readonly effectId: number;
  readonly rotation: number;
  readonly pos: Vec2;
  readonly width: number;
  readonly height: number;
  readonly color: RGBA;
}

export class TerrainCorpseFx {
  constructor(opts: {
    topLeft?: Vec2;
    color?: RGBA;
    rotation?: number;
    scale?: number;
    creatureTypeId?: number;
  } = {}) {
    this.topLeft = opts.topLeft ?? new Vec2();
    this.color = opts.color ?? new RGBA();
    this.rotation = opts.rotation ?? 0.0;
    this.scale = opts.scale ?? 1.0;
    this.creatureTypeId = opts.creatureTypeId ?? 0;
  }

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
    this.decals = Array.from(opts.decals ?? []);
    this.corpses = Array.from(opts.corpses ?? []);
  }

  isEmpty(): boolean {
    return this.decals.length === 0 && this.corpses.length === 0;
  }
}

export class TerrainFxScratch {
  decals = new FxQueue();
  corpses = new FxQueueRotated();

  clear(): void {
    this.decals.clear();
    this.corpses.clear();
  }

  takeBatch(): TerrainFxBatch {
    const decals: TerrainDecalFx[] = this.decals.iterActive().map((entry) => new TerrainDecalFx({
      effectId: int(entry.effectId),
      rotation: entry.rotation,
      pos: entry.pos,
      width: entry.width,
      height: entry.height,
      color: entry.color,
    }));

    const corpses: TerrainCorpseFx[] = this.corpses.iterActive().map((entry) => new TerrainCorpseFx({
      topLeft: entry.topLeft,
      color: entry.color,
      rotation: entry.rotation,
      scale: entry.scale,
      creatureTypeId: int(entry.creatureTypeId),
    }));

    this.clear();

    return new TerrainFxBatch({ decals, corpses });
  }
}
