// Port of crimson/perks/impl/lifeline_50_50.py

import { PerkId } from '../ids.ts';
import type { PerkApplyCtx } from '../runtime/apply-context.ts';
import type { PerkHooks } from '../runtime/hook-types.ts';

function applyLifeline5050(ctx: PerkApplyCtx): void {
  const creatures = ctx.creatures;
  if (creatures === null) {
    return;
  }

  let killToggle = false;
  for (const creature of creatures) {
    if (killToggle && creature.active && creature.hp <= 500.0 && (creature.flags & 0x04) === 0) {
      creature.active = false;
      ctx.state.effects.spawnBurst(
        creature.pos,
        4,
        ctx.state.rng,
        5,
      );
    }
    killToggle = !killToggle;
  }
}

export const HOOKS: PerkHooks = {
  perkId: PerkId.LIFELINE_50_50,
  applyHandler: applyLifeline5050,
};
