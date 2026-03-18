// Port of crimson/perks/runtime/apply_context.py

import type { CreatureState } from '../../creatures/runtime.ts';
import type { GameplayState, PlayerState } from '../../sim/state-types.ts';
import type { PerkId } from '../ids.ts';
import type { PerkSelectionState } from '../state.ts';

export class PerkApplyCtx {
  constructor(
    public state: GameplayState,
    public players: PlayerState[],
    public owner: PlayerState,
    public perkId: PerkId,
    public perkState: PerkSelectionState | null,
    public dt: number | null,
    public creatures: readonly CreatureState[] | null,
  ) {
  }

  frameDt(): number {
    return this.dt ?? 0.0;
  }
}

export type PerkApplyHandler = (ctx: PerkApplyCtx) => void;
