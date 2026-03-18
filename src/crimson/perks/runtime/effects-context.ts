// Port of crimson/perks/runtime/effects_context.py

import { Vec2 } from '../../../grim/geom.ts';
import { nativeFindSizeMargin } from '../../collision-math.ts';
import type { CreatureState } from '../../creatures/runtime.ts';
import { creatureLifecycleIsCollidable } from '../../creatures/lifecycle.ts';
import type { FxQueue } from '../../effects.ts';
import type { GameplayState, PlayerState } from '../../sim/state-types.ts';

export function creatureFindInRadius(
  creatures: readonly CreatureState[],
  pos: Vec2,
  radius: number,
  startIndex: number,
): number {
  startIndex = Math.max(0, startIndex | 0);
  const maxIndex = Math.min(creatures.length, 0x180);
  if (startIndex >= maxIndex) {
    return -1;
  }

  radius = Number(radius);

  for (let idx = startIndex; idx < maxIndex; idx++) {
    const creature = creatures[idx];
    if (!creature.active) {
      continue;
    }

    const dx = creature.pos.x - pos.x;
    const dy = creature.pos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy) - radius;
    const threshold = nativeFindSizeMargin(Number(creature.size));
    if (threshold < dist) {
      continue;
    }
    if (!creatureLifecycleIsCollidable(creature.lifecycleStage)) {
      continue;
    }
    return idx;
  }
  return -1;
}

export class PerksUpdateEffectsCtx {
  state: GameplayState;
  players: PlayerState[];
  dt: number;
  creatures: readonly CreatureState[] | null;
  fxQueue: FxQueue | null;
  private _aimTargetByPlayerIndex: Map<number, number> = new Map();

  constructor(
    state: GameplayState,
    players: PlayerState[],
    dt: number,
    creatures: readonly CreatureState[] | null,
    fxQueue: FxQueue | null,
  ) {
    this.state = state;
    this.players = players;
    this.dt = dt;
    this.creatures = creatures;
    this.fxQueue = fxQueue;
  }

  aimTargetForPlayer(playerIndex: number): number {
    playerIndex = playerIndex | 0;
    const cached = this._aimTargetByPlayerIndex.get(playerIndex);
    if (cached !== undefined) {
      return cached;
    }

    let target = -1;
    if (this.creatures === null) {
      this._aimTargetByPlayerIndex.set(playerIndex, target);
      return target;
    }

    if (this.state.preserveBugs && playerIndex !== 0) {
      this._aimTargetByPlayerIndex.set(playerIndex, target);
      return target;
    }

    if (!(playerIndex >= 0 && playerIndex < this.players.length)) {
      this._aimTargetByPlayerIndex.set(playerIndex, target);
      return target;
    }

    const player = this.players[playerIndex];
    if (!this.state.preserveBugs && Number(player.health) <= 0.0) {
      this._aimTargetByPlayerIndex.set(playerIndex, target);
      return target;
    }

    target = creatureFindInRadius(
      this.creatures,
      player.aim,
      12.0,
      0,
    );
    this._aimTargetByPlayerIndex.set(playerIndex, target);
    return target;
  }
}

export type PerksUpdateEffectsStep = (ctx: PerksUpdateEffectsCtx) => void;
