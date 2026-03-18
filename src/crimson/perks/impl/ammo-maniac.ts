// Port of crimson/perks/impl/ammo_maniac.py

import { weaponAssignPlayer } from '@crimson/weapon-runtime/assign.ts';
import { WeaponId } from '@crimson/weapons.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import type { PerkApplyCtx } from '@crimson/perks/runtime/apply-context.ts';
import type { PerkHooks } from '@crimson/perks/runtime/hook-types.ts';

function applyAmmoManiac(ctx: PerkApplyCtx): void {
  if (ctx.players.length > 1) {
    for (let i = 1; i < ctx.players.length; i++) {
      const player = ctx.players[i];
      for (let j = 0; j < ctx.owner.perkCounts.length; j++) {
        player.perkCounts[j] = ctx.owner.perkCounts[j];
      }
    }
  }
  for (const player of ctx.players) {
    weaponAssignPlayer(player, player.weapon.weaponId as WeaponId, ctx.state);
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.AMMO_MANIAC,
  applyHandler: applyAmmoManiac,
};
