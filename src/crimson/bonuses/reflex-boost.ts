// Port of crimson/bonuses/reflex_boost.py

import { RGBA } from '@grim/color.ts';
import { f32 } from '@crimson/math-parity.ts';
import type { BonusPickupEvent } from '@crimson/sim/state-types.ts';
import type { BonusApplyCtx } from './apply-context.ts';
import { GameplayState } from "@crimson/gameplay.js";

export function applyReflexBoost(ctx: BonusApplyCtx): void {
  const old = ctx.state.bonuses.reflexBoost;
  if (old <= 0.0) {
    ctx.registerGlobal('reflex_boost');
  }
  ctx.state.bonuses.reflexBoost = f32(old + ctx.amount * ctx.economistMultiplier);

  for (const target of ctx.players) {
    target.weapon.ammo = target.weapon.clipSize;
    target.weapon.reloadActive = false;
    target.weapon.reloadTimer = 0.0;
    target.weapon.reloadTimerMax = 0.0;
  }
}

export function applyReflexBoostPickupFx(
  opts: { state: GameplayState; pickup: BonusPickupEvent; detailPreset: number },
): void {
  // Spawn the blue ring used by Reflex Boost bonus pickups.
  opts.state.effects.spawnRing({
    pos: opts.pickup.pos,
    detailPreset: int(opts.detailPreset),
    color: new RGBA(0.6, 0.6, 1.0, 1.0),
  });
}
