// Port of crimson/perks/impl/reflex_boosted.py

import type { PlayerState } from '@crimson/sim/state-types.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { PerkId } from '@crimson/perks/ids.ts';

export function applyReflexBoostedDt(dt: number, players: PlayerState[]): number {
  // Apply Reflex Boosted dt scaling from perk effects.
  if (dt <= 0.0) {
    return dt;
  }
  if (!players.length) {
    return dt;
  }
  if (!perkActive(players[0], PerkId.REFLEX_BOOSTED)) {
    return dt;
  }
  return dt * 0.9;
}

export const HOOKS = {
  perkId: PerkId.REFLEX_BOOSTED as const,
  worldDtStep: applyReflexBoostedDt,
};
