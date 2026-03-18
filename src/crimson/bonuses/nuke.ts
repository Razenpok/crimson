// Port of crimson/bonuses/nuke.py

import { Vec2 } from '@grim/geom.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { OwnerRef } from '@crimson/owner-ref.ts';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import { ownerRefForPlayer, projectileSpawn } from '@crimson/weapon-runtime/spawn.ts';
import type { BonusApplyCtx } from "./apply-context.js";

export function applyNuke(
  ctx: BonusApplyCtx,
): void {
  ctx.state.cameraShakePulses = 0x14;
  ctx.state.cameraShakeTimer = 0.2;

  const origin = ctx.originPos;
  const rng = ctx.state.rng;

  let bulletCount = rng.rand(RngCallerStatic.BONUS_APPLY_NUKE_BULLET_COUNT) & 3;
  bulletCount += 4;
  for (let i = 0; i < bulletCount; i++) {
    const angle = ((rng.rand(RngCallerStatic.BONUS_APPLY_NUKE_PISTOL_ANGLE) | 0) % 628) * 0.01;
    const projId = projectileSpawn(
      ctx.state,
      ctx.players,
      origin,
      angle,
      ProjectileTemplateId.PISTOL,
      OwnerRef.fromLocalPlayer(0),
      ctx.player.index,
    );
    if (projId !== -1) {
      const speedScale =
        ((rng.rand(RngCallerStatic.BONUS_APPLY_NUKE_PISTOL_SPEED_SCALE) | 0) % 50) * 0.01 + 0.5;
      ctx.state.projectiles.entries[projId].speedScale *= speedScale;
    }
  }

  const gaussAngle1 = ((rng.rand(RngCallerStatic.BONUS_APPLY_NUKE_GAUSS_ANGLE_1) | 0) % 628) * 0.01;
  projectileSpawn(
    ctx.state,
    ctx.players,
    origin,
    gaussAngle1,
    ProjectileTemplateId.GAUSS_GUN,
    OwnerRef.fromLocalPlayer(0),
    ctx.player.index,
  );
  const gaussAngle2 = ((rng.rand(RngCallerStatic.BONUS_APPLY_NUKE_GAUSS_ANGLE_2) | 0) % 628) * 0.01;
  projectileSpawn(
    ctx.state,
    ctx.players,
    origin,
    gaussAngle2,
    ProjectileTemplateId.GAUSS_GUN,
    OwnerRef.fromLocalPlayer(0),
    ctx.player.index,
  );

  ctx.state.effects.spawnExplosionBurst(
    origin,
    1.0,
    ctx.state.rng,
    ctx.detailPreset | 0,
  );

  const creatures = ctx.creatures;
  if (creatures && creatures.length > 0) {
    const applyCreatureDamage = ctx.state.bonusPool.creatureDamageApplier;
    const prevGuard = ctx.state.bonusSpawnGuard;
    ctx.state.bonusSpawnGuard = true;
    for (let idx = 0; idx < creatures.length; idx++) {
      const creature = creatures[idx];
      if (!creature.active) {
        continue;
      }
      const delta = creature.pos.sub(origin);
      if (Math.abs(delta.x) > 256.0 || Math.abs(delta.y) > 256.0) {
        continue;
      }
      const dist = delta.length();
      if (dist < 256.0) {
        const damage = (256.0 - dist) * 5.0;
        if (applyCreatureDamage !== null) {
          applyCreatureDamage(
            idx | 0,
            damage,
            3,
            new Vec2(),
            ownerRefForPlayer(ctx.player.index),
          );
        } else {
          creature.hp -= damage;
        }
      }
    }
    ctx.state.bonusSpawnGuard = prevGuard;
  }

  ctx.state.sfxQueue.push(SfxId.EXPLOSION_LARGE);
  ctx.state.sfxQueue.push(SfxId.SHOCKWAVE);
}
