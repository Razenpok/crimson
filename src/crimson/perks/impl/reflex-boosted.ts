// Port of crimson/perks/impl/reflex_boosted.py

import type { PlayerState } from '@crimson/sim/state-types.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { PerkHooks } from '@crimson/perks/runtime/hook-types.ts';

export function applyReflexBoostedDt(opts: { dt: number; players: PlayerState[] }): number {
  // Apply Reflex Boosted dt scaling from perk effects.
  if (opts.dt <= 0.0) {
    return opts.dt;
  }
  if (!opts.players.length) {
    return opts.dt;
  }
  if (!perkActive(opts.players[0], PerkId.REFLEX_BOOSTED)) {
    return opts.dt;
  }
  return opts.dt * 0.9;
}

export const HOOKS = new PerkHooks({
  perkId: PerkId.REFLEX_BOOSTED,
  worldDtStep: applyReflexBoostedDt,
});
