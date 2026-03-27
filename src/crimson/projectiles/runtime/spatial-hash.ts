// Port of crimson/projectiles/runtime/spatial_hash.py

import { Vec2 } from '@grim/geom.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';

const _SPATIAL_BUCKET_SIZE = 64.0;
const _NATIVE_FIND_SIZE_SCALE = 0.14285715;
const _NATIVE_FIND_BASE_MARGIN = 3.0;
const _NATIVE_FIND_RADIUS_MARGIN_EPS = 0.001;

export function nativeFindMarginForSize(size: number): number {
  return size * _NATIVE_FIND_SIZE_SCALE + _NATIVE_FIND_BASE_MARGIN;
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export class CreatureSpatialHash {
  creatures: readonly CreatureState[];
  isCollidable: (creature: CreatureState) => boolean;
  private _bucketSize: number;
  private _cells: Map<string, number[]>;
  private _cellByIndex: (string | null)[];
  private _maxFindMargin: number;

  constructor(
    creatures: readonly CreatureState[],
    isCollidable: (creature: CreatureState) => boolean,
    bucketSize: number = _SPATIAL_BUCKET_SIZE,
  ) {
    this.creatures = creatures;
    this.isCollidable = isCollidable;
    this._bucketSize = bucketSize > 0.0 ? bucketSize : _SPATIAL_BUCKET_SIZE;
    this._cells = new Map();
    this._cellByIndex = [];
    this._maxFindMargin = 0.0;
    this.rebuild();
  }

  rebuild(): void {
    const cells = new Map<string, number[]>();
    const cellByIndex: (string | null)[] = new Array(this.creatures.length).fill(null);
    let maxFindMargin = 0.0;

    for (let idx = 0; idx < this.creatures.length; idx++) {
      const creature = this.creatures[idx];
      if (!this.isCollidable(creature)) {
        continue;
      }
      const cell = this._cellForPos(creature.pos);
      let bucket = cells.get(cell);
      if (bucket === undefined) {
        bucket = [];
        cells.set(cell, bucket);
      }
      bucket.push(idx);
      cellByIndex[idx] = cell;
      const creatureFindMargin = nativeFindMarginForSize(creature.size);
      if (creatureFindMargin > maxFindMargin) {
        maxFindMargin = creatureFindMargin;
      }
    }

    this._cells = cells;
    this._cellByIndex = cellByIndex;
    this._maxFindMargin = maxFindMargin;
  }

  syncIndex(index: number): void {
    if (!(index >= 0 && index < this.creatures.length)) {
      return;
    }
    const idx = index;
    const creature = this.creatures[idx];
    const previousCell = this._cellByIndex[idx];
    if (!this.isCollidable(creature)) {
      if (previousCell !== null) {
        this._removeFromCell(idx, previousCell);
        this._cellByIndex[idx] = null;
      }
      return;
    }

    const nextCell = this._cellForPos(creature.pos);
    if (previousCell === nextCell) {
      return;
    }
    if (previousCell !== null) {
      this._removeFromCell(idx, previousCell);
    }
    let bucket = this._cells.get(nextCell);
    if (bucket === undefined) {
      bucket = [];
      this._cells.set(nextCell, bucket);
    }
    bucket.push(idx);
    this._cellByIndex[idx] = nextCell;

    const creatureFindMargin = nativeFindMarginForSize(creature.size);
    if (creatureFindMargin > this._maxFindMargin) {
      this._maxFindMargin = creatureFindMargin;
    }
  }

  candidateIndices(opts: { pos: Vec2; radius: number }): number[] {
    if (this._cells.size === 0) {
      return [];
    }
    const projCellX = int(Math.floor(opts.pos.x / this._bucketSize));
    const projCellY = int(Math.floor(opts.pos.y / this._bucketSize));
    const maxAxisDelta = opts.radius + this._maxFindMargin + _NATIVE_FIND_RADIUS_MARGIN_EPS;
    const cellSpan = int(Math.ceil(maxAxisDelta / this._bucketSize));

    const candidates: number[] = [];
    for (let cellY = projCellY - cellSpan; cellY <= projCellY + cellSpan; cellY++) {
      for (let cellX = projCellX - cellSpan; cellX <= projCellX + cellSpan; cellX++) {
        const bucket = this._cells.get(cellKey(cellX, cellY));
        if (bucket !== undefined) {
          for (let i = 0; i < bucket.length; i++) {
            candidates.push(bucket[i]);
          }
        }
      }
    }

    if (candidates.length > 1) {
      candidates.sort((a, b) => a - b);
    }
    return candidates;
  }

  private _cellForPos(pos: Vec2): string {
    const cellX = int(Math.floor(pos.x / this._bucketSize));
    const cellY = int(Math.floor(pos.y / this._bucketSize));
    return cellKey(cellX, cellY);
  }

  private _removeFromCell(index: number, cell: string): void {
    const bucket = this._cells.get(cell);
    if (bucket === undefined) {
      return;
    }
    const i = bucket.indexOf(index);
    if (i === -1) {
      return;
    }
    bucket.splice(i, 1);
    if (bucket.length === 0) {
      this._cells.delete(cell);
    }
  }
}
