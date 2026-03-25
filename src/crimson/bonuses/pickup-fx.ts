// Port of crimson/bonuses/pickup_fx.py

import { RGBA } from '@grim/color.ts';
import type { EffectPool } from '@crimson/effects.ts';
import type { BonusPickupEvent, GameplayState } from '@crimson/sim/state-types.ts';
import { applyFreezePickupFx } from './freeze.ts';
import { BonusId } from './ids.ts';
import { applyReflexBoostPickupFx } from './reflex-boost.ts';

export type BonusPickupFxHook = (state: GameplayState, pickup: BonusPickupEvent, detailPreset: number) => void;

function _applyDefaultPickupBurst(state: GameplayState, pickup: BonusPickupEvent, detailPreset: number): void {
  if (pickup.bonusId === BonusId.NUKE) {
    return;
  }
  state.effects.spawnBurst({
    pos: pickup.pos,
    count: 12,
    rng: state.rng,
    detailPreset: int(detailPreset),
    lifetime: 0.4,
    scaleStep: 0.1,
    color: new RGBA(0.4, 0.5, 1.0, 0.5),
  });
}

function _applyReflexBoostHook(state: GameplayState, pickup: BonusPickupEvent, detailPreset: number): void {
  applyReflexBoostPickupFx({ state, pickup, detailPreset });
}

function _applyFreezeHook(state: GameplayState, pickup: BonusPickupEvent, detailPreset: number): void {
  applyFreezePickupFx({ state, pickup, detailPreset });
}

const _BONUS_PICKUP_HOOKS: Map<BonusId, BonusPickupFxHook> = new Map([
  [BonusId.REFLEX_BOOST, _applyReflexBoostHook],
  [BonusId.FREEZE, _applyFreezeHook],
]);

export function emitBonusPickupEffects(opts: { state: GameplayState; pickups: BonusPickupEvent[]; detailPreset: number }): void {
  // Emit deterministic pickup FX for the provided pickup list.
  for (const pickup of opts.pickups) {
    _applyDefaultPickupBurst(opts.state, pickup, int(opts.detailPreset));
    const hook = _BONUS_PICKUP_HOOKS.get(pickup.bonusId);
    if (hook !== undefined) {
      hook(opts.state, pickup, int(opts.detailPreset));
    }
  }
}
