import type { Vec2 } from '../../../grim/geom.ts';
import { SfxId } from '../../../grim/sfx-map.ts';
import { OwnerRef } from '../../owner-ref.ts';
import { ProjectileTemplateId } from '../../projectiles/types.ts';
import type { GameplayState, PlayerState } from "../../sim/state-types.ts";
import { perkActive } from '../helpers.ts';
import { PerkId } from '../ids.ts';
import { RngCallerStatic } from '../../rng-caller-static.ts';
import { ProjectileSpawnFn } from "../runtime/player-tick-context.js";

export interface HotTemperedCtx {
  readonly state: GameplayState;
  readonly player: PlayerState;
  readonly players: PlayerState[] | null;
  readonly dt: number;
  readonly playerPosBeforeMove: Vec2;
  ownerRefForPlayer(playerIndex: number): OwnerRef;
  projectileSpawn: ProjectileSpawnFn;
}

export function tickHotTempered(ctx: HotTemperedCtx): void {
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
