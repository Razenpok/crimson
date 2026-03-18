import { Vec2 } from '@grim/geom.ts';
import type { SpawnId } from '@crimson/creatures/spawn-ids.ts';
import type { SpawnEntry } from './types.ts';

export interface EdgePoints {
  readonly left: Vec2;
  readonly right: Vec2;
  readonly top: Vec2;
  readonly bottom: Vec2;
}

export function centerPoint(width: number, height?: number): Vec2 {
  if (height === undefined) {
    height = width;
  }
  return new Vec2(width * 0.5, height * 0.5);
}

export function edgeMidpoints(width: number, height?: number, offset: number = 64.0): EdgePoints {
  if (height === undefined) {
    height = width;
  }
  const center = centerPoint(width, height);
  return {
    left: new Vec2(-offset, center.y),
    right: new Vec2(width + offset, center.y),
    top: new Vec2(center.x, -offset),
    bottom: new Vec2(center.x, height + offset),
  };
}

export function cornerPoints(width: number, height?: number, offset: number = 64.0): [Vec2, Vec2, Vec2, Vec2] {
  if (height === undefined) {
    height = width;
  }
  return [
    new Vec2(-offset, -offset),
    new Vec2(width + offset, -offset),
    new Vec2(-offset, height + offset),
    new Vec2(width + offset, height + offset),
  ];
}

export function* iterAngles(count: number, opts?: { step?: number; start?: number }): IterableIterator<number> {
  if (count <= 0) {
    return;
  }
  const step = opts?.step ?? (Math.PI * 2.0) / count;
  const start = opts?.start ?? 0.0;
  for (let idx = 0; idx < count; idx++) {
    yield start + idx * step;
  }
}

export function* ringPoints(
  center: Vec2,
  radius: number,
  count: number,
  opts?: { step?: number; start?: number },
): IterableIterator<[Vec2, number]> {
  for (const angle of iterAngles(count, opts)) {
    yield [center.add(Vec2.fromAngle(angle).mul(radius)), angle];
  }
}

export function* radialPoints(
  center: Vec2,
  angle: number,
  radiusStart: number,
  radiusEnd: number,
  radiusStep: number,
): IterableIterator<Vec2> {
  const direction = Vec2.fromAngle(angle);
  let radius = radiusStart;
  while (radius < radiusEnd) {
    yield center.add(direction.mul(radius));
    radius += radiusStep;
  }
}

export function headingFromCenter(point: Vec2, center: Vec2): number {
  return point.sub(center).toAngle() - (Math.PI / 2.0);
}

export function* linePoints(start: Vec2, step: Vec2, count: number): IterableIterator<Vec2> {
  for (let idx = 0; idx < count; idx++) {
    yield start.add(step.mul(idx));
  }
}

export function spawnEntry(
  point: Vec2,
  opts: {
    heading?: number;
    spawnId: SpawnId;
    triggerMs: number;
    count: number;
  },
): SpawnEntry {
  return {
    pos: point,
    heading: opts.heading ?? 0.0,
    spawnId: opts.spawnId,
    triggerMs: opts.triggerMs,
    count: opts.count,
  };
}

export function spawnAt(
  point: Vec2,
  opts: {
    heading?: number;
    spawnId: SpawnId;
    triggerMs: number;
    count: number;
  },
): SpawnEntry {
  return spawnEntry(point, opts);
}
