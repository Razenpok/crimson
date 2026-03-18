// Port of crimson/bonuses/reflex_boost.py

import { RGBA } from '../../engine/color.ts';
import { f32 } from '../math-parity.ts';
import type { BonusPickupEvent, GameplayState } from '../sim/state-types.ts';
import type { BonusApplyCtx } from './apply-context.ts';

export function applyReflexBoost(ctx: BonusApplyCtx): void {
  const old = ctx.state.bonuses.reflexBoost as number;
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
  state: GameplayState,
  pickup: BonusPickupEvent,
  detailPreset: number,
): void {
  state.effects.spawnRing(
    pickup.pos,
    detailPreset | 0,
    new RGBA(0.6, 0.6, 1.0, 1.0),
  );
}
