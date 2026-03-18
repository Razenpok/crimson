import type { PlayerState } from '../../sim/state-types.ts';
import { perkActive } from '../helpers.ts';
import { PerkId } from '../ids.ts';

export function applyReflexBoostedDt(opts: { dt: number; players: PlayerState[] }): number {
  const { dt, players } = opts;
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

export const REFLEX_BOOSTED_HOOKS = {
  perkId: PerkId.REFLEX_BOOSTED as const,
  worldDtStep: applyReflexBoostedDt,
};
