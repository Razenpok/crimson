// Port of crimson/bonuses/shock_chain.py

import { Vec2 } from '../../engine/geom.ts';
import { SfxId } from '../../engine/sfx-map.ts';
import { creatureLifecycleIsAlive } from '../creatures/lifecycle.ts';
import { OwnerRef } from '../owner-ref.ts';
import { ProjectileTemplateId } from '../projectiles/types.ts';
import { ownerRefForPlayer, projectileSpawn } from '../weapon-runtime/spawn.ts';
import type { BonusApplyCtx } from "@game/bonuses/apply-context.js";

export function applyShockChain(
  ctx: BonusApplyCtx,
): void {
  const creatures = ctx.creatures;
  if (!creatures || creatures.length === 0) {
    return;
  }

  const origin = ctx.originPos;
  let bestIdx = ctx.state.preserveBugs ? 0 : -1;
  let bestDistSq = 1e12;
  for (let idx = 0; idx < creatures.length; idx++) {
    const creature = creatures[idx];
    if (!creature.active) {
      continue;
    }
    if (!creatureLifecycleIsAlive(creature.lifecycleStage)) {
      continue;
    }
    const dSq = Vec2.distanceSq(origin, creature.pos);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestIdx = idx;
    }
  }

  if (bestIdx < 0) {
    return;
  }

  const target = creatures[bestIdx];
  const angle = target.pos.sub(origin).toHeading();
  const owner = ctx.state.friendlyFireEnabled
    ? ownerRefForPlayer(ctx.player.index)
    : OwnerRef.fromLocalPlayer(0);

  ctx.state.bonusSpawnGuard = true;
  ctx.state.shockChainLinksLeft = 0x20;
  ctx.state.shockChainProjectileId = projectileSpawn(
    ctx.state,
    ctx.players,
    origin,
    angle,
    ProjectileTemplateId.ION_RIFLE,
    owner,
    ctx.player.index,
  );
  ctx.state.bonusSpawnGuard = false;
  ctx.state.sfxQueue.push(SfxId.SHOCK_HIT_01);
}
