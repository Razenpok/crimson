// Port of crimson/perks/impl/breathing_room.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyBreathingRoom(ctx: PerkApplyCtx): void {
  for (const player of ctx.players) {
    player.health -= player.health * (2.0 / 3.0);
  }

  const frameDt = ctx.frameDt();
  const creatures = ctx.creatures;
  if (creatures !== null) {
    for (const creature of creatures) {
      if (creature.active) {
        creature.lifecycleStage = creature.lifecycleStage - frameDt;
      }
    }
  }

  ctx.state.bonusSpawnGuard = false;
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.BREATHING_ROOM,
  applyHandler: applyBreathingRoom,
};
