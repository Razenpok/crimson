// Port of crimson/perks/impl/living_fortress.py

import { perkActive } from '../helpers.ts';
import { PerkId } from '../ids.ts';
import { PlayerPerkTickCtx } from "@game/perks/runtime/player-tick-context.js";

export function tickLivingFortress(ctx: PlayerPerkTickCtx): void {
  if (perkActive(ctx.player, PerkId.LIVING_FORTRESS)) {
    ctx.player.livingFortressTimer = Math.min(30.0, ctx.player.livingFortressTimer + ctx.dt);
  } else {
    ctx.player.livingFortressTimer = 0.0;
  }
}

export const LIVING_FORTRESS_HOOKS = {
  perkId: PerkId.LIVING_FORTRESS as const,
  playerTickSteps: [tickLivingFortress] as const,
};
