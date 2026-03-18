// Port of crimson/perks/impl/infernal_contract.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyInfernalContract(ctx: PerkApplyCtx): void {
  ctx.owner.level += 3;
  if (ctx.perkState !== null) {
    ctx.perkState.pendingCount += 3;
    ctx.perkState.choicesDirty = true;
  }
  for (const player of ctx.players) {
    if (player.health > 0.0) {
      player.health = 0.1;
    }
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.INFERNAL_CONTRACT,
  applyHandler: applyInfernalContract,
};
