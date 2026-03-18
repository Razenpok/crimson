// Port of crimson/perks/runtime/effects.py

import type { CreatureState } from '../../creatures/runtime.ts';
import type { FxQueue } from '../../effects.ts';
import type { GameplayState, PlayerState } from '../../sim/state-types.ts';
import { creatureFindInRadius, PerksUpdateEffectsCtx } from './effects-context.ts';
import { PERKS_UPDATE_EFFECT_STEPS } from './manifest.ts';

// Backward-compatible re-export used by HUD target hover wiring.
export { creatureFindInRadius as _creatureFindInRadius };

const _PERKS_UPDATE_EFFECT_STEPS = PERKS_UPDATE_EFFECT_STEPS;

export function perksUpdateEffects(
  state: GameplayState,
  players: PlayerState[],
  dt: number,
  creatures: readonly CreatureState[] | null = null,
  fxQueue: FxQueue | null = null,
): void {
  dt = Number(dt);
  if (dt <= 0.0) {
    return;
  }
  const ctx = new PerksUpdateEffectsCtx(
    state,
    players,
    dt,
    creatures,
    fxQueue,
  );
  for (const step of _PERKS_UPDATE_EFFECT_STEPS) {
    step(ctx);
  }
}
