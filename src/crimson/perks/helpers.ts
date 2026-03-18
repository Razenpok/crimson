// Port of crimson/perks/helpers.py

import type { PlayerState } from '../sim/state-types.ts';
import { PerkId } from './ids.ts';

export function perkCountGet(player: PlayerState, perkId: PerkId): number {
  const idx = perkId as number;
  if (idx < 0) return 0;
  if (idx >= player.perkCounts.length) return 0;
  return player.perkCounts[idx];
}

export function perkActive(player: PlayerState, perkId: PerkId): boolean {
  return perkCountGet(player, perkId) > 0;
}
