// Port of crimson/perks/impl/instant_winner.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyInstantWinner(ctx: PerkApplyCtx): void {
  ctx.owner.experience += 2500;
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.INSTANT_WINNER,
  applyHandler: applyInstantWinner,
};
