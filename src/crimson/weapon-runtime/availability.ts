// Port of crimson/weapon_runtime/availability.py

import { GameMode } from '@crimson/game-modes.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import type { GameplayState } from '@crimson/sim/state-types.ts';
import { WEAPON_TABLE, WeaponId } from '@crimson/weapons.ts';
import { QuestLevel } from "@crimson/quests/level.js";
import { allQuests } from "@crimson/quests/registry.js";

export const WEAPON_DROP_ID_COUNT = 0x21; // weapon ids 1..33
export const WEAPON_AVAILABLE_COUNT = Math.max(...WEAPON_TABLE.map((e) => e.weaponId as number)) + 1;

export interface WeaponAvailabilityStatus {
  readonly questUnlockIndex: number;
  readonly questUnlockIndexFull: number;
  weaponUsageCountSlot(slot: number): number;
}

export function buildWeaponAvailability(
  status: WeaponAvailabilityStatus | null,
  gameMode: GameMode,
  demoModeActive: boolean,
): boolean[] {
  const available: boolean[] = new Array(WEAPON_AVAILABLE_COUNT).fill(false);
  let unlockIndex = 0;
  let unlockIndexFull = 0;
  if (status !== null) {
    unlockIndex = status.questUnlockIndex;
    unlockIndexFull = status.questUnlockIndexFull;
  }

  const pistolId = WeaponId.PISTOL as number;
  if (pistolId >= 0 && pistolId < available.length) {
    available[pistolId] = true;
  }

  if (unlockIndex > 0) {
    const quests = allQuests();
    for (let i = 0; i < Math.min(unlockIndex, quests.length); i++) {
      const quest = quests[i];
      const weaponId = quest.unlockWeaponId;
      if (weaponId !== null && (weaponId as number) > 0 && (weaponId as number) < available.length) {
        available[weaponId as number] = true;
      }
    }
  }

  if (gameMode === GameMode.SURVIVAL) {
    for (const weaponId of [WeaponId.ASSAULT_RIFLE, WeaponId.SHOTGUN, WeaponId.SUBMACHINE_GUN]) {
      const id = weaponId as number;
      if (id >= 0 && id < available.length) {
        available[id] = true;
      }
    }
  }

  if (!demoModeActive && unlockIndexFull >= 0x28) {
    const splitterId = WeaponId.SPLITTER_GUN as number;
    if (splitterId >= 0 && splitterId < available.length) {
      available[splitterId] = true;
    }
  }

  return available;
}

export function prepareWeaponAvailability(state: GameplayState, status: WeaponAvailabilityStatus | null): void {
  const built = buildWeaponAvailability(status, state.gameMode, state.demoModeActive);
  const weaponAvailable = state.weaponAvailable;
  for (let i = 0; i < built.length && i < weaponAvailable.length; i++) {
    weaponAvailable[i] = built[i];
  }
}

function questLevelEquals(a: QuestLevel | null, major: number, minor: number): boolean {
  if (a === null) return false;
  return a.major === major && a.minor === minor;
}

export function weaponPickRandomAvailable(
  state: GameplayState,
  status: WeaponAvailabilityStatus | null = null,
): WeaponId {
  const weaponAvailable = state.weaponAvailable;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const baseRand = state.rng.rand(RngCallerStatic.WEAPON_PICK_RANDOM_AVAILABLE_PICK);
    let weaponId: WeaponId = (baseRand % WEAPON_DROP_ID_COUNT + 1) as WeaponId;

    // Bias: used weapons have a 50% chance to reroll once.
    if (status !== null) {
      const usageSlot = weaponUsageSlotForWeaponId(weaponId as number);
      if (usageSlot !== null && status.weaponUsageCountSlot(usageSlot) !== 0) {
        if (
          (state.rng.rand(RngCallerStatic.WEAPON_PICK_RANDOM_AVAILABLE_REROLL_GATE) & 1) === 0
        ) {
          const rerollRand = state.rng.rand(RngCallerStatic.WEAPON_PICK_RANDOM_AVAILABLE_REROLL_PICK);
          weaponId = (rerollRand % WEAPON_DROP_ID_COUNT + 1) as WeaponId;
        }
      }
    }

    if (!((weaponId as number) >= 0 && (weaponId as number) < weaponAvailable.length)) {
      continue;
    }
    if (!weaponAvailable[weaponId as number]) {
      continue;
    }

    // Quest 5-10 special-case: suppress Ion Cannon.
    if (
      state.gameMode === GameMode.QUESTS &&
      questLevelEquals(state.questLevel, 5, 10) &&
      weaponId === WeaponId.ION_CANNON
    ) {
      continue;
    }

    return weaponId;
  }

  return WeaponId.PISTOL;
}

// Inline helper — mirrors weapon_usage_slot_for_weapon_id from weapon_usage.py
const WEAPON_USAGE_TRACKED_WEAPON_ID_MIN = WeaponId.PISTOL as number;
const WEAPON_USAGE_TRACKED_WEAPON_ID_MAX = 52;

function weaponUsageSlotForWeaponId(weaponId: number): number | null {
  const id = weaponId | 0;
  if (WEAPON_USAGE_TRACKED_WEAPON_ID_MIN <= id && id <= WEAPON_USAGE_TRACKED_WEAPON_ID_MAX) {
    return id;
  }
  return null;
}
