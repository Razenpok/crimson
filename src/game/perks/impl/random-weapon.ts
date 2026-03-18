// Port of crimson/perks/impl/random_weapon.py

import { WeaponId } from '../../weapons.ts';
import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import { weaponPickRandomAvailable } from '../../weapon-runtime/availability.ts';
import { weaponAssignPlayer } from '../../weapon-runtime/assign.ts';

export function applyRandomWeapon(ctx: PerkApplyCtx): void {
  const current = ctx.owner.weapon.weaponId;
  let weaponId = current;
  for (let i = 0; i < 100; i++) {
    const candidate = weaponPickRandomAvailable(ctx.state);
    weaponId = candidate;
    if (candidate !== WeaponId.PISTOL && candidate !== current) {
      break;
    }
  }
  weaponAssignPlayer(ctx.owner, weaponId, ctx.state);
}

export const RANDOM_WEAPON_HOOKS = {
  perkId: PerkId.RANDOM_WEAPON as const,
  applyHandler: applyRandomWeapon,
};
