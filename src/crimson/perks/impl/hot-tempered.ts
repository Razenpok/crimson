// Port of crimson/perks/impl/hot_tempered.py

import { SfxId } from '@grim/sfx-map.ts';
import { OwnerRef } from '@crimson/owner-ref.ts';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import { PlayerPerkTickCtx } from "@crimson/perks/runtime/player-tick-context.js";

export function tickHotTempered(ctx: PlayerPerkTickCtx): void {
  if (!perkActive(ctx.player, PerkId.HOT_TEMPERED)) {
    ctx.player.hotTemperedTimer = 0.0;
    return;
  }

  ctx.player.hotTemperedTimer += ctx.dt;
  if (ctx.player.hotTemperedTimer <= ctx.state.perkIntervals.hotTempered) {
    return;
  }

  const owner = ctx.state.friendlyFireEnabled
    ? ctx.ownerRefForPlayer(ctx.player.index)
    : OwnerRef.fromLocalPlayer(0);
  for (let idx = 0; idx < 8; idx++) {
    const typeId = ((idx & 1) === 0)
      ? ProjectileTemplateId.PLASMA_MINIGUN
      : ProjectileTemplateId.PLASMA_RIFLE;
    const angle = idx * (Math.PI / 4.0);
    ctx.projectileSpawn(
      ctx.state,
      ctx.players,
      ctx.playerPosBeforeMove,
      angle,
      typeId,
      owner,
      ctx.player.index,
    );
  }
  ctx.state.sfxQueue.push(SfxId.EXPLOSION_SMALL);

  ctx.player.hotTemperedTimer -= ctx.state.perkIntervals.hotTempered;
  const intervalRoll = ctx.state.rng.rand(
    RngCallerStatic.PLAYER_UPDATE_HOT_TEMPERED_INTERVAL_RESET,
  );
  ctx.state.perkIntervals.hotTempered = (intervalRoll % 8) + 2.0;
}

export const HOT_TEMPERED_HOOKS = {
  perkId: PerkId.HOT_TEMPERED as const,
  playerTickSteps: [tickHotTempered] as const,
};
