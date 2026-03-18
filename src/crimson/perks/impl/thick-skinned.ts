// crimson/perks/impl/thick_skinned.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from "../runtime/apply-context.js";

export function applyThickSkinned(ctx: PerkApplyCtx): void {
  for (const player of ctx.players) {
    if (player.health > 0.0) {
      player.health = Math.max(1.0, player.health * (2.0 / 3.0));
    }
  }
}

export const THICK_SKINNED_HOOKS = {
  perkId: PerkId.THICK_SKINNED as const,
  applyHandler: applyThickSkinned,
};
