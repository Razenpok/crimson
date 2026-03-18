import { SfxId } from '../../../grim/sfx-map.ts';
import type { CrandLike } from '../../../grim/rand.ts';
import type { OwnerRef } from '../../owner-ref.ts';
import { ProjectileTemplateId } from '../../projectiles/types.ts';
import type { GameplayState, PlayerState } from "../../sim/state-types.ts";
import { perkActive } from '../helpers.ts';
import { PerkId } from '../ids.ts';
import { RngCallerStatic } from '../../rng-caller-static.ts';
import { ProjectileSpawnFn } from "../runtime/player-tick-context.js";

export interface PerkIntervalsLike {
  manBomb: number;
}

export interface ManBombStateLike {
  perkIntervals: PerkIntervalsLike;
  rng: CrandLike;
  sfxQueue: SfxId[];
}

export interface ManBombCtx {
  readonly state: GameplayState;
  readonly player: PlayerState;
  readonly players: PlayerState[] | null;
  readonly dt: number;
  ownerRefForPlayerProjectiles(state: ManBombStateLike, playerIndex: number): OwnerRef;
  projectileSpawn: ProjectileSpawnFn;
}

export function tickManBomb(ctx: ManBombCtx): void {
  if (!perkActive(ctx.player, PerkId.MAN_BOMB)) {
    ctx.player.manBombTimer = 0.0;
    return;
  }

  ctx.player.manBombTimer += ctx.dt;
  if (ctx.player.manBombTimer > ctx.state.perkIntervals.manBomb) {
    const owner = ctx.ownerRefForPlayerProjectiles(ctx.state, ctx.player.index);
    for (let idx = 0; idx < 8; idx++) {
      const typeId = ((idx & 1) === 0)
        ? ProjectileTemplateId.ION_MINIGUN
        : ProjectileTemplateId.ION_RIFLE;
      const caller = typeId === ProjectileTemplateId.ION_MINIGUN
        ? RngCallerStatic.PLAYER_UPDATE_MAN_BOMB_ION_MINIGUN_ANGLE
        : RngCallerStatic.PLAYER_UPDATE_MAN_BOMB_ION_RIFLE_ANGLE;
      const angle =
        (ctx.state.rng.rand(caller) % 50) * 0.01
        + idx * (Math.PI / 4.0)
        - 0.25;
      ctx.projectileSpawn(
        ctx.state,
        ctx.players,
        ctx.player.pos,
        angle,
        typeId,
        owner,
        ctx.player.index,
      );
    }
    ctx.state.sfxQueue.push(SfxId.EXPLOSION_SMALL);

    ctx.player.manBombTimer -= ctx.state.perkIntervals.manBomb;
    ctx.state.perkIntervals.manBomb = 4.0;
  }
}

export const MAN_BOMB_HOOKS = {
  perkId: PerkId.MAN_BOMB as const,
  playerTickSteps: [tickManBomb] as const,
};
