// Port of crimson/perks/impl/grim_deal.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyGrimDeal(ctx: PerkApplyCtx): void {
  ctx.owner.health = -1.0;
  ctx.owner.experience += (ctx.owner.experience * 0.18) | 0;
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.GRIM_DEAL,
  applyHandler: applyGrimDeal,
};
