// Port of crimson/perks/impl/death_clock.py

import { perkActive, perkCountGet } from '../helpers.ts';
import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import { adjustPerkCount } from '../runtime/counts.ts';
import type { PerksUpdateEffectsCtx } from '../runtime/effects-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyDeathClock(ctx: PerkApplyCtx): void {
  adjustPerkCount(
    ctx.owner,
    PerkId.REGENERATION,
    -perkCountGet(ctx.owner, PerkId.REGENERATION),
  );
  adjustPerkCount(
    ctx.owner,
    PerkId.GREATER_REGENERATION,
    -perkCountGet(ctx.owner, PerkId.GREATER_REGENERATION),
  );
  for (const player of ctx.players) {
    if (player.health > 0.0) {
      player.health = 100.0;
    }
  }
}

function updateDeathClock(ctx: PerksUpdateEffectsCtx): void {
  if (ctx.players.length === 0) {
    return;
  }
  if (!perkActive(ctx.players[0], PerkId.DEATH_CLOCK)) {
    return;
  }

  // Native gates this effect on shared/player-0 perk state, then applies health
  // drain to every active local player.
  for (const player of ctx.players) {
    if (player.health <= 0.0) {
      player.health = 0.0;
    } else {
      player.health = player.health - ctx.dt * 3.3333333;
    }
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.DEATH_CLOCK,
  applyHandler: applyDeathClock,
  effectsSteps: [updateDeathClock],
};
