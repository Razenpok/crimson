// Port of crimson/bonuses/pickup_fx.py

import { RGBA } from '../../grim/color.ts';
import type { EffectPool } from '../effects.ts';
import type { BonusPickupEvent, GameplayState } from '../sim/state-types.ts';
import { applyFreezePickupFx } from './freeze.ts';
import { BonusId } from './ids.ts';
import { applyReflexBoostPickupFx } from './reflex-boost.ts';

export type BonusPickupFxHook = (state: GameplayState, pickup: BonusPickupEvent, detailPreset: number) => void;

function _applyDefaultPickupBurst(state: GameplayState, pickup: BonusPickupEvent, detailPreset: number): void {
  if (pickup.bonusId === BonusId.NUKE) {
    return;
  }
  (state.effects as EffectPool).spawnBurst(
    pickup.pos,
    12,
    state.rng,
    detailPreset | 0,
    0.4,
    0.1,
    new RGBA(0.4, 0.5, 1.0, 0.5),
  );
}

function _applyReflexBoostHook(state: GameplayState, pickup: BonusPickupEvent, detailPreset: number): void {
  applyReflexBoostPickupFx(state, pickup, detailPreset);
}

function _applyFreezeHook(state: GameplayState, pickup: BonusPickupEvent, detailPreset: number): void {
  applyFreezePickupFx(state, pickup, detailPreset);
}

const _BONUS_PICKUP_HOOKS: Map<BonusId, BonusPickupFxHook> = new Map([
  [BonusId.REFLEX_BOOST, _applyReflexBoostHook],
  [BonusId.FREEZE, _applyFreezeHook],
]);

export function emitBonusPickupEffects(state: GameplayState, pickups: BonusPickupEvent[], detailPreset: number): void {
  for (const pickup of pickups) {
    _applyDefaultPickupBurst(state, pickup, detailPreset | 0);
    const hook = _BONUS_PICKUP_HOOKS.get(pickup.bonusId);
    if (hook !== undefined) {
      hook(state, pickup, detailPreset | 0);
    }
  }
}
