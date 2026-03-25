// Port of crimson/perks/runtime/effects_context.py

import { Vec2 } from '@grim/geom.ts';
import { nativeFindSizeMargin } from '@crimson/collision-math.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';
import { creatureLifecycleIsCollidable } from '@crimson/creatures/lifecycle.ts';
import type { FxQueue } from '@crimson/effects.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';

export function creatureFindInRadius(
  creatures: readonly CreatureState[],
  opts: { pos: Vec2; radius: number; startIndex: number },
): number {
  let startIndex = Math.max(0, opts.startIndex | 0);
  const maxIndex = Math.min(creatures.length, 0x180);
  if (startIndex >= maxIndex) {
    return -1;
  }

  for (let idx = startIndex; idx < maxIndex; idx++) {
    const creature = creatures[idx];
    if (!creature.active) {
      continue;
    }

    const dist = creature.pos.sub(opts.pos).length() - opts.radius;
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
  private _aimTargetByPlayerIndex: Map<number, number> = new Map();

  constructor(
    public state: GameplayState,
    public players: PlayerState[],
    public dt: number,
    public creatures: readonly CreatureState[] | null,
    public fxQueue: FxQueue | null,
  ) {
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
