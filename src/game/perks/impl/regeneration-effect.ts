import type { CrandLike } from '../../../engine/rand.ts';
import type { PlayerState } from '../../sim/state-types.ts';
import { perkActive } from '../helpers.ts';
import { PerkId } from '../ids.ts';
import { RngCallerStatic } from '../../rng-caller-static.ts';

export interface RegenerationStateLike {
  preserveBugs: boolean;
  rng: CrandLike;
}

export interface RegenerationCtx {
  readonly state: RegenerationStateLike;
  readonly players: PlayerState[];
  readonly dt: number;
}

export function updateRegeneration(ctx: RegenerationCtx): void {
  if (!ctx.players.length) {
    return;
  }
  if (!perkActive(ctx.players[0], PerkId.REGENERATION)) {
    return;
  }
  if (
    (ctx.state.rng.rand(
      RngCallerStatic.PERKS_UPDATE_EFFECTS_REGENERATION_GATE,
    ) & 1) === 0
  ) {
    return;
  }

  if (ctx.state.preserveBugs) {
    const player0 = ctx.players[0];
    for (let i = 0; i < ctx.players.length; i++) {
      if (!(0.0 < player0.health && player0.health < 100.0)) {
        continue;
      }
      player0.health = player0.health + ctx.dt;
      if (player0.health > 100.0) {
        player0.health = 100.0;
      }
    }
    return;
  }

  let healAmount = ctx.dt;
  if (
    !ctx.state.preserveBugs &&
    perkActive(ctx.players[0], PerkId.GREATER_REGENERATION)
  ) {
    healAmount = ctx.dt * 2.0;
  }

  for (const player of ctx.players) {
    if (!(0.0 < player.health && player.health < 100.0)) {
      continue;
    }
    player.health = player.health + healAmount;
    if (player.health > 100.0) {
      player.health = 100.0;
    }
  }
}

export const REGENERATION_HOOKS = {
  perkId: PerkId.REGENERATION as const,
  effectsSteps: [updateRegeneration] as const,
};
