// Port of crimson/perks/runtime/apply_context.py

import type { CreatureState } from '../../creatures/runtime.ts';
import type { GameplayState, PlayerState } from '../../sim/state-types.ts';
import type { PerkId } from '../ids.ts';
import type { PerkSelectionState } from '../state.ts';

export class PerkApplyCtx {
  state: GameplayState;
  players: PlayerState[];
  owner: PlayerState;
  perkId: PerkId;
  perkState: PerkSelectionState | null;
  dt: number | null;
  creatures: readonly CreatureState[] | null;

  constructor(
    state: GameplayState,
    players: PlayerState[],
    owner: PlayerState,
    perkId: PerkId,
    perkState: PerkSelectionState | null,
    dt: number | null,
    creatures: readonly CreatureState[] | null,
  ) {
    this.state = state;
    this.players = players;
    this.owner = owner;
    this.perkId = perkId;
    this.perkState = perkState;
    this.dt = dt;
    this.creatures = creatures;
  }

  frameDt(): number {
    return this.dt !== null ? Number(this.dt) : 0.0;
  }
}

export type PerkApplyHandler = (ctx: PerkApplyCtx) => void;
