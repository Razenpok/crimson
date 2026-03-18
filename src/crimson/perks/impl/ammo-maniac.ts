// Port of crimson/perks/impl/ammo_maniac.py

import { weaponAssignPlayer } from '../../weapon-runtime/assign.ts';
import { WeaponId } from '../../weapons.ts';
import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

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
