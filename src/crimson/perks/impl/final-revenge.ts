import { Vec2 } from '@grim/geom.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { OwnerRef } from '@crimson/owner-ref.ts';
import { CreatureDamageType } from '@crimson/creatures/damage-types.ts';
import type { CreaturePool, CreatureDeath } from '@crimson/creatures/runtime.ts';
import type { FxQueue } from '@crimson/effects.ts';
import type { PlayerState, GameplayState } from '@crimson/sim/state-types.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { creatureApplyDamageWithLethalFollowup } from "@crimson/creatures/damage.js";

export interface ApplyFinalRevengeOpts {
  state: GameplayState;
  creatures: CreaturePool;
  players: PlayerState[];
  player: PlayerState;
  dt: number;
  worldSize: number;
  detailPreset: number;
  fxQueue: FxQueue | null;
  deaths: CreatureDeath[];
}

export function applyFinalRevengeOnPlayerDeath(opts: ApplyFinalRevengeOpts): void {
  const {
    state,
    creatures,
    players,
    player,
    dt,
    worldSize,
    detailPreset,
    fxQueue,
    deaths
  } = opts;

  if (!perkActive(player, PerkId.FINAL_REVENGE)) {
    return;
  }

  const playerPos = player.pos;
  state.effects.spawnExplosionBurst(
    playerPos,
    1.8,
    state.rng,
    detailPreset | 0,
  );

  const prevGuard = state.bonusSpawnGuard;
  state.bonusSpawnGuard = true;
  for (let creatureIdx = 0; creatureIdx < creatures.entries.length; creatureIdx++) {
    const creature = creatures.entries[creatureIdx];
    if (!creature.active) {
      continue;
    }

    const delta = creature.pos.sub(playerPos);
    if (Math.abs(delta.x) > 512.0 || Math.abs(delta.y) > 512.0) {
      continue;
    }

    const remaining = 512.0 - delta.length();
    if (remaining <= 0.0) {
      continue;
    }

    const damage = remaining * 5.0;
    const deathCreatureIdx = creatureIdx | 0;
    creatureApplyDamageWithLethalFollowup(
      creature,
      damage,
      CreatureDamageType.EXPLOSION,
      new Vec2(),
      OwnerRef.fromPlayer(player.index | 0),
      dt,
      players,
      state.rng,
      state.preserveBugs,
      state.effects,
      detailPreset | 0,
      (deathSfx: SfxId[]) => {
        deaths.push(
          creatures.handleDeath(
            deathCreatureIdx,
            state,
            players,
            state.rng,
            dt,
            detailPreset | 0,
            worldSize,
            worldSize,
            fxQueue,
          ),
        );
        state.sfxQueue.push(...deathSfx);
      },
    );
  }

  state.bonusSpawnGuard = prevGuard;
  state.sfxQueue.push(SfxId.EXPLOSION_LARGE);
  state.sfxQueue.push(SfxId.SHOCKWAVE);
}

export const FINAL_REVENGE_HOOKS = {
  perkId: PerkId.FINAL_REVENGE as const,
  playerDeathHook: applyFinalRevengeOnPlayerDeath,
};
