// Port of crimson/bonuses/weapon.py

import { PerkId } from '@crimson/perks/ids.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { WeaponSlot } from '@crimson/sim/state-types.ts';
import { weaponAssignPlayer } from '@crimson/weapon-runtime/assign.ts';
import { WeaponId } from '@crimson/weapons.ts';
import type { BonusApplyCtx } from './apply-context.ts';

export function applyWeapon(ctx: BonusApplyCtx): void {
  const weaponId = ctx.amount;
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
  weaponAssignPlayer(ctx.player, weaponId, { state: ctx.state });
}
