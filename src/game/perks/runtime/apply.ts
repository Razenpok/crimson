// Port of crimson/perks/runtime/apply.py

import type { CreatureState } from '../../creatures/runtime.ts';
import type { GameplayState, PlayerState } from '../../sim/state-types.ts';
import type { PerkId } from '../ids.ts';
import type { PerkSelectionState } from '../state.ts';
import { PerkApplyCtx } from './apply-context.ts';
import { adjustPerkCount } from './counts.ts';
import { PERK_APPLY_HANDLERS } from './manifest.ts';

export function perkApply(
  state: GameplayState,
  players: PlayerState[],
  perkId: PerkId,
  perkState: PerkSelectionState | null = null,
  dt: number | null = null,
  creatures: readonly CreatureState[] | null = null,
): void {
  if (players.length === 0) {
    return;
  }
  const owner = players[0];
  try {
    adjustPerkCount(owner, perkId);
    const handler = PERK_APPLY_HANDLERS.get(perkId);
    if (handler != null) {
      handler(
        new PerkApplyCtx(
          state,
          players,
          owner,
          perkId,
          perkState,
          dt,
          creatures,
        ),
      );
    }
  } finally {
    if (players.length > 1) {
      for (let i = 1; i < players.length; i++) {
        const src = owner.perkCounts;
        const dst = players[i].perkCounts;
        for (let j = 0; j < src.length; j++) {
          dst[j] = src[j];
        }
      }
    }
  }
}
