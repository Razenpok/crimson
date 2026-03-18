// Port of crimson/bonuses/fire_bullets.py

import { Vec2 } from '../../grim/geom.ts';
import type { CrandLike } from '../../grim/rand.ts';
import { f32 } from '../math-parity.ts';
import type { ProjectileHit } from '../projectiles/types.ts';
import type { FxQueue } from '../effects.ts';
import { RngCallerStatic } from '../rng-caller-static.ts';
import type { BonusApplyCtx } from './apply-context.ts';
import { bonusApplySeconds } from './apply-context.ts';

export function applyFireBullets(
  ctx: BonusApplyCtx,
): void {
  const applySeconds = bonusApplySeconds(ctx);
  let shouldRegister = ctx.player.fireBulletsTimer <= 0.0;
  if (ctx.players.length > 1) {
    shouldRegister =
      ctx.players[0].fireBulletsTimer <= 0.0 && ctx.players[1].fireBulletsTimer <= 0.0;
  }
  if (shouldRegister) {
    ctx.registerPlayer('fire_bullets_timer');
  }
  ctx.player.fireBulletsTimer = f32(
    ctx.player.fireBulletsTimer + applySeconds * ctx.economistMultiplier,
  );
  ctx.player.weaponResetLatch = 0;
  ctx.player.weapon.shotCooldown = 0.0;
  ctx.player.weapon.reloadActive = false;
  ctx.player.weapon.reloadTimer = 0.0;
  ctx.player.weapon.reloadTimerMax = 0.0;
  ctx.player.weapon.ammo = ctx.player.weapon.clipSize;
}

export function queueLargeHitDecalStreak(opts: {
  hit: ProjectileHit;
  baseAngle: number;
  fxQueue: FxQueue;
  rng: CrandLike;
  freezeOrigin?: Vec2 | null;
  spawnFreezeShard?: ((pos: Vec2, angle: number) => void) | null;
}): void {
  const { hit, baseAngle, fxQueue, rng } = opts;
  const freezeOrigin = opts.freezeOrigin ?? null;
  const spawnFreezeShard = opts.spawnFreezeShard ?? null;
  const direction = Vec2.fromAngle(baseAngle);
  for (let i = 0; i < 6; i++) {
    let dist = (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_LARGE_STREAK_DIST) % 100) * 0.1;
    if (dist > 4.0) {
      dist = (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_LARGE_STREAK_DIST_GT4) % 90 + 10) * 0.1;
    }
    if (dist > 7.0) {
      dist = (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_LARGE_STREAK_DIST_GT7) % 80 + 20) * 0.1;
    }
    rng.rand(RngCallerStatic.PROJECTILE_UPDATE_LARGE_STREAK_BURN);
    if (spawnFreezeShard !== null && freezeOrigin !== null) {
      const freezePos = freezeOrigin.add(direction.mul(dist * 20.0));
      const freezeAngle =
        baseAngle +
        (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_LARGE_STREAK_FREEZE_ANGLE) % 100) * 0.01;
      spawnFreezeShard(freezePos, freezeAngle);
    }
    fxQueue.addRandom(hit.target.add(direction.mul(dist * 20.0)), rng);
  }
}
