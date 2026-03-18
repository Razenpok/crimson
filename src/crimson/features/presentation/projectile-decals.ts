// Port of crimson/features/presentation/projectile_decals.py

import { Vec2 } from '@grim/geom.ts';
import type { CrandLike } from '@grim/rand.ts';
import type { FxQueue } from '@crimson/effects.ts';
import type { ProjectileHit } from '@crimson/projectiles/types.ts';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import { queueLargeHitDecalStreak } from '@crimson/bonuses/fire-bullets.ts';

export function queueProjectileLargeStreakDecal(
  hit: ProjectileHit,
  baseAngle: number,
  fxQueue: FxQueue,
  rng: CrandLike,
  freezeOrigin: Vec2 | null = null,
  spawnFreezeShard: ((pos: Vec2, angle: number) => void) | null = null,
): boolean {
  const typeId = hit.typeId;
  if (typeId !== ProjectileTemplateId.GAUSS_GUN && typeId !== ProjectileTemplateId.FIRE_BULLETS) {
    return false;
  }
  queueLargeHitDecalStreak({
    hit,
    baseAngle,
    fxQueue,
    rng,
    freezeOrigin,
    spawnFreezeShard,
  });
  return true;
}
