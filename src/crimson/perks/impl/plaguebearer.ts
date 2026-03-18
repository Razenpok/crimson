// Port of crimson/perks/impl/plaguebearer.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyPlaguebearer(ctx: PerkApplyCtx): void {
  for (const player of ctx.players) {
    player.plaguebearerActive = true;
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.PLAGUEBEARER,
  applyHandler: applyPlaguebearer,
};
