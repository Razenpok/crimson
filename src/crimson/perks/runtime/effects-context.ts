// Port of crimson/perks/runtime/effects_context.py

import type { Vec2 } from '@grim/geom.ts';
import { nativeFindSizeMargin } from '@crimson/collision-math.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';
import { creatureLifecycleIsCollidable } from '@crimson/creatures/lifecycle.ts';
import type { FxQueue } from '@crimson/effects.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';

export function creatureFindInRadius(
  creatures: readonly CreatureState[],
  opts: { pos: Vec2; radius: number; startIndex: number },
): number {
  // Find the first active creature intersecting an aim radius.
  //
  // Port of `creature_find_in_radius` (0x004206a0).

  let startIndex = Math.max(0, int(opts.startIndex));
  const maxIndex = Math.min(creatures.length, 0x180);
  if (startIndex >= maxIndex) {
    return -1;
  }

  const radius = opts.radius;

  for (let idx = startIndex; idx < maxIndex; idx++) {
    const creature = creatures[idx];
    if (!creature.active) {
      continue;
    }

    const dist = creature.pos.sub(opts.pos).length() - radius;
    const threshold = nativeFindSizeMargin(creature.size);
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

  constructor(opts: {
    state: GameplayState;
    players: PlayerState[];
    dt: number;
    creatures: readonly CreatureState[] | null;
    fxQueue: FxQueue | null;
  }) {
    this.state = opts.state;
    this.players = opts.players;
    this.dt = opts.dt;
    this.creatures = opts.creatures;
    this.fxQueue = opts.fxQueue;
  }

  aimTargetForPlayer(playerIndex: number): number {
    playerIndex = int(playerIndex);
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
    if (!this.state.preserveBugs && player.health <= 0.0) {
      this._aimTargetByPlayerIndex.set(playerIndex, target);
      return target;
    }

    target = creatureFindInRadius(
      this.creatures,
      { pos: player.aim, radius: 12.0, startIndex: 0 },
    );
    this._aimTargetByPlayerIndex.set(playerIndex, target);
    return target;
  }
}
