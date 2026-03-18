// Port of crimson/perks/impl/my_favourite_weapon.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyMyFavouriteWeapon(ctx: PerkApplyCtx): void {
  for (const player of ctx.players) {
    player.weapon.clipSize += 2;
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.MY_FAVOURITE_WEAPON,
  applyHandler: applyMyFavouriteWeapon,
};
