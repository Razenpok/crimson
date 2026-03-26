// Port of crimson/perks/runtime/apply.py

import type { CreatureState } from '@crimson/creatures/runtime.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import type { PerkId } from '@crimson/perks/ids.ts';
import type { PerkSelectionState } from '@crimson/perks/state.ts';
import { PerkApplyCtx } from './apply-context.ts';
import { adjustPerkCount } from './counts.ts';
import { PERK_APPLY_HANDLERS } from './manifest.ts';
import { GameplayState } from "@crimson/gameplay.js";

export function perkApply(
  state: GameplayState,
  players: PlayerState[],
  perkId: PerkId,
  opts: { perkState?: PerkSelectionState | null; dt?: number | null; creatures?: readonly CreatureState[] | null } = {},
): void {
  const perkState = opts.perkState ?? null;
  const dt = opts.dt ?? null;
  const creatures = opts.creatures ?? null;
  if (players.length === 0) {
    return;
  }
  const owner = players[0];
  try {
    adjustPerkCount(owner, perkId, {});
    const handler = PERK_APPLY_HANDLERS.get(perkId);
    if (handler !== undefined) {
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
