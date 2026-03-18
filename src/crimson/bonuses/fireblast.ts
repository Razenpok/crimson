// Port of crimson/bonuses/fireblast.py

import { SfxId } from '../../grim/sfx-map.ts';
import { OwnerRef } from '../owner-ref.ts';
import { ProjectileTemplateId } from '../projectiles/types.ts';
import { ownerRefForPlayer, spawnProjectileRing } from '../weapon-runtime/spawn.ts';
import type { BonusApplyCtx } from "./apply-context.js";

export function applyFireblast(ctx: BonusApplyCtx): void {
  const origin = ctx.originPos;
  const owner = ctx.state.friendlyFireEnabled
    ? ownerRefForPlayer(ctx.player.index)
    : OwnerRef.fromLocalPlayer(0);
  ctx.state.bonusSpawnGuard = true;
  spawnProjectileRing(
    ctx.state,
    origin,
    16,
    0.0,
    ProjectileTemplateId.PLASMA_RIFLE,
    owner,
    ctx.player.index,
    ctx.players,
  );
  ctx.state.bonusSpawnGuard = false;
  ctx.state.sfxQueue.push(SfxId.EXPLOSION_MEDIUM);
}
