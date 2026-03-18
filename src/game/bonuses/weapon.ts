// Port of crimson/bonuses/weapon.py

import { PerkId } from '../perks/ids.ts';
import { perkActive } from '../perks/helpers.ts';
import { WeaponSlot } from '../sim/state-types.ts';
import { weaponAssignPlayer } from '../weapon-runtime/assign.ts';
import { WeaponId } from '../weapons.ts';
import type { BonusApplyCtx } from './apply-context.ts';

export function applyWeapon(ctx: BonusApplyCtx): void {
  const weaponId = ctx.amount as WeaponId;
  if (perkActive(ctx.player, PerkId.ALTERNATE_WEAPON) && ctx.player.altWeapon === null) {
    const primary = ctx.player.weapon;
    const alt = new WeaponSlot(primary.weaponId);
    alt.clipSize = primary.clipSize;
    alt.ammo = primary.ammo;
    alt.reloadActive = primary.reloadActive;
    alt.reloadTimer = primary.reloadTimer;
    alt.reloadTimerMax = primary.reloadTimerMax;
    alt.shotCooldown = primary.shotCooldown;
    ctx.player.altWeapon = alt;
  }
  weaponAssignPlayer(ctx.player, weaponId, ctx.state);
}
