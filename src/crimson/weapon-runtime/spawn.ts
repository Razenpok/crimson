// Port of crimson/weapon_runtime/spawn.py

import { Vec2 } from '../../grim/geom.ts';
import { OwnerRef } from '../owner-ref.ts';
import { ProjectileTemplateId } from '../projectiles/types.ts';
import type { GameplayState, PlayerState } from '../sim/state-types.ts';
import { weaponEntryForProjectileTypeId } from '../weapons.ts';

export function ownerRefForPlayer(playerIndex: number): OwnerRef {
  return OwnerRef.fromPlayer(playerIndex | 0);
}

export function ownerRefForPlayerProjectiles(state: GameplayState, playerIndex: number): OwnerRef {
  if (!state.friendlyFireEnabled) {
    return OwnerRef.fromLocalPlayer(0);
  }
  return ownerRefForPlayer(playerIndex);
}

export function travelBudgetForTypeId(typeId: ProjectileTemplateId): number {
  return weaponEntryForProjectileTypeId(typeId).travelBudget;
}

function resolvePlayerSlot(players: readonly PlayerState[], playerIndex: number): number | null {
  const targetIndex = playerIndex | 0;
  if (targetIndex >= 0 && targetIndex < players.length) {
    const direct = players[targetIndex];
    if ((direct.index | 0) === targetIndex) {
      return targetIndex;
    }
  }
  for (let slot = 0; slot < players.length; slot++) {
    if ((players[slot].index | 0) === targetIndex) {
      return slot;
    }
  }
  return null;
}

function shotsFiredPlayerIndex(
  state: GameplayState,
  players: readonly PlayerState[] | null,
  owner: OwnerRef,
  ownerPlayerIndex: number | null,
): number | null {
  const shotsFired = state.shotsFired as number[];
  if (ownerPlayerIndex !== null) {
    const playerIndex = ownerPlayerIndex | 0;
    if (playerIndex >= 0 && playerIndex < shotsFired.length) {
      return playerIndex;
    }
  }

  if (owner.isPlayer() && !(owner.localHost && owner.index === 0)) {
    const playerIndex = owner.index | 0;
    if (playerIndex >= 0 && playerIndex < shotsFired.length) {
      return playerIndex;
    }
  }

  if (owner.localHost && owner.index === 0 && players && players.length === 1) {
    const playerIndex = players[0].index | 0;
    if (playerIndex >= 0 && playerIndex < shotsFired.length) {
      return playerIndex;
    }
  }

  return null;
}

function fireBulletsActive(
  players: readonly PlayerState[] | null,
  state: GameplayState,
  owner: OwnerRef,
  ownerPlayerIndex: number | null,
): boolean {
  if (!players || players.length === 0) {
    return false;
  }

  // Native `projectile_spawn` checks player-1/player-2 Fire Bullets timers
  // globally, regardless of projectile ownership.
  if (state.preserveBugs) {
    for (let i = 0; i < Math.min(2, players.length); i++) {
      if (players[i].fireBulletsTimer > 0.0) return true;
    }
    return false;
  }

  let resolvedOwnerSlot: number | null = null;
  if (ownerPlayerIndex !== null) {
    resolvedOwnerSlot = resolvePlayerSlot(players, ownerPlayerIndex | 0);
  } else if (owner.isPlayer() && !(owner.localHost && owner.index === 0)) {
    resolvedOwnerSlot = resolvePlayerSlot(players, owner.index | 0);
  } else if (owner.localHost && owner.index === 0 && players.length === 1) {
    // Callers that only pass one player are explicitly indicating the owner
    // context (for example OwnerRef.from_local_player(0) with friendly fire disabled).
    resolvedOwnerSlot = 0;
  }

  if (resolvedOwnerSlot === null) {
    return false;
  }
  if (!(resolvedOwnerSlot >= 0 && resolvedOwnerSlot < players.length)) {
    return false;
  }
  return players[resolvedOwnerSlot].fireBulletsTimer > 0.0;
}

export function projectileSpawn(
  state: GameplayState,
  players: readonly PlayerState[] | null,
  pos: Vec2,
  angle: number,
  typeId: ProjectileTemplateId,
  owner: OwnerRef,
  ownerPlayerIndex: number | null = null,
  hitsPlayers: boolean = false,
): number {
  const shotsFired = state.shotsFired as number[];
  let currentTypeId = typeId;

  // Mirror `projectile_spawn` (0x00420440) Fire Bullets override.
  if (!state.bonusSpawnGuard && owner.isPlayer()) {
    while (true) {
      const playerIndex = shotsFiredPlayerIndex(
        state,
        players,
        owner,
        ownerPlayerIndex,
      );
      state.shotsFiredTotal = (state.shotsFiredTotal as number) + 1;
      if (playerIndex !== null) {
        shotsFired[playerIndex] += 1;
      }
      if (currentTypeId === ProjectileTemplateId.FIRE_BULLETS) {
        break;
      }
      if (!fireBulletsActive(players, state, owner, ownerPlayerIndex)) {
        break;
      }
      currentTypeId = ProjectileTemplateId.FIRE_BULLETS;
    }
  }

  const meta = travelBudgetForTypeId(currentTypeId);
  return state.projectiles.spawn(
    pos,
    angle,
    currentTypeId,
    owner,
    meta,
    hitsPlayers,
  );
}

export function spawnProjectileRing(
  state: GameplayState,
  originPos: Vec2,
  count: number,
  angleOffset: number,
  typeId: ProjectileTemplateId,
  owner: OwnerRef,
  ownerPlayerIndex: number | null = null,
  players: readonly PlayerState[] | null = null,
): void {
  if (count <= 0) {
    return;
  }
  const step = Math.PI * 2.0 / count;
  for (let idx = 0; idx < count; idx++) {
    projectileSpawn(
      state,
      players,
      originPos,
      idx * step + angleOffset,
      typeId,
      owner,
      ownerPlayerIndex,
    );
  }
}
