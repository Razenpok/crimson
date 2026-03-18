// Port of crimson/perks/impl/fatal_lottery.py

import { RngCallerStatic } from '../../rng-caller-static.ts';
import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyFatalLottery(ctx: PerkApplyCtx): void {
  if (ctx.state.rng.rand(RngCallerStatic.PERK_APPLY_FATAL_LOTTERY) & 1) {
    ctx.owner.health = -1.0;
  } else {
    ctx.owner.experience += 10000;
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.FATAL_LOTTERY,
  applyHandler: applyFatalLottery,
};
