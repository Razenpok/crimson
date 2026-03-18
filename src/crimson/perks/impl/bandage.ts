// Port of crimson/perks/impl/bandage.py

import { RngCallerStatic } from '../../rng-caller-static.ts';
import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyBandage(ctx: PerkApplyCtx): void {
  for (const player of ctx.players) {
    if (player.health > 0.0) {
      const amount = (ctx.state.rng.rand(RngCallerStatic.PERK_APPLY_BANDAGE_HEAL) % 50) + 1;
      if (ctx.state.preserveBugs) {
        // Original exe behavior (likely bug): health multiplier.
        player.health = Math.min(100.0, player.health * amount);
      } else {
        // Intended behavior from in-game text: restore up to 50% HP.
        player.health = Math.min(100.0, player.health + amount);
      }
      ctx.state.effects.spawnBurst(
        player.pos,
        8,
        ctx.state.rng,
        5,
      );
    }
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.BANDAGE,
  applyHandler: applyBandage,
};
