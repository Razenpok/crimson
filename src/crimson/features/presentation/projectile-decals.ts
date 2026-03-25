// Port of crimson/features/presentation/projectile_decals.py

import { Vec2 } from '@grim/geom.ts';
import type { CrandLike } from '@grim/rand.ts';
import type { FxQueue } from '@crimson/effects.ts';
import type { ProjectileHit } from '@crimson/projectiles/types.ts';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import { queueLargeHitDecalStreak } from '@crimson/bonuses/fire-bullets.ts';

export function queueProjectileLargeStreakDecal(
  opts: { hit: ProjectileHit; baseAngle: number; fxQueue: FxQueue; rng: CrandLike; freezeOrigin?: Vec2 | null; spawnFreezeShard?: ((pos: Vec2, angle: number) => void) | null },
): boolean {
  const freezeOrigin = opts.freezeOrigin ?? null;
  const spawnFreezeShard = opts.spawnFreezeShard ?? null;
  const typeId = opts.hit.typeId;
  if (typeId !== ProjectileTemplateId.GAUSS_GUN && typeId !== ProjectileTemplateId.FIRE_BULLETS) {
    return false;
  }
  queueLargeHitDecalStreak({
    hit: opts.hit,
    baseAngle: opts.baseAngle,
    fxQueue: opts.fxQueue,
    rng: opts.rng,
    freezeOrigin,
    spawnFreezeShard,
  });
  return true;
}
