// Port of crimson/perks/runtime/apply_context.py

import type { CreatureState } from '@crimson/creatures/runtime.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import type { PerkId } from '@crimson/perks/ids.ts';
import type { PerkSelectionState } from '@crimson/perks/state.ts';
import { GameplayState } from "@crimson/gameplay.js";

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
