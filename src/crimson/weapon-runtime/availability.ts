// Port of crimson/weapon_runtime/availability.py

import { GameMode } from '@crimson/game-modes.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import { WEAPON_TABLE, WeaponId } from '@crimson/weapons.ts';
import { weaponUsageSlotForWeaponId } from '@crimson/weapon-usage.ts';
import { allQuests } from '@crimson/quests/index.ts';
import type { GameStatus } from '@crimson/persistence/save-status.ts';
import type { GameplayState } from '@crimson/sim/state-types.ts';

export const WEAPON_DROP_ID_COUNT = 0x21; // weapon ids 1..33
export const WEAPON_AVAILABLE_COUNT = Math.max(...WEAPON_TABLE.map((e) => e.weaponId)) + 1;

export function buildWeaponAvailability(
  opts: {
    status: GameStatus | null;
    gameMode: GameMode;
    demoModeActive: boolean;
  },
): boolean[] {
  const available: boolean[] = new Array(WEAPON_AVAILABLE_COUNT).fill(false);
  let unlockIndex = 0;
  let unlockIndexFull = 0;
  if (opts.status !== null) {
    unlockIndex = opts.status.questUnlockIndex;
    unlockIndexFull = opts.status.questUnlockIndexFull;
  }

  const pistolId = WeaponId.PISTOL;
  if (pistolId >= 0 && pistolId < available.length) {
    available[pistolId] = true;
  }

  if (unlockIndex > 0) {
    const quests = allQuests();
    for (let i = 0; i < Math.min(unlockIndex, quests.length); i++) {
      const quest = quests[i];
      const weaponId = quest.unlockWeaponId;
      if (weaponId !== null && weaponId > 0 && weaponId < available.length) {
        available[weaponId] = true;
      }
    }
  }

  if (opts.gameMode === GameMode.SURVIVAL) {
    for (const weaponId of [WeaponId.ASSAULT_RIFLE, WeaponId.SHOTGUN, WeaponId.SUBMACHINE_GUN]) {
      if (weaponId >= 0 && weaponId < available.length) {
        available[weaponId] = true;
      }
    }
  }

  if (!opts.demoModeActive && unlockIndexFull >= 0x28) {
    const splitterId = WeaponId.SPLITTER_GUN;
    if (splitterId >= 0 && splitterId < available.length) {
      available[splitterId] = true;
    }
  }

  return available;
}

export function prepareWeaponAvailability(state: GameplayState): void {
  const status = state.status;
  const built = buildWeaponAvailability({ status, gameMode: state.gameMode, demoModeActive: state.demoModeActive });
  const weaponAvailable = state.weaponAvailable;
  weaponAvailable.splice(0, weaponAvailable.length, ...built);
}

export function weaponPickRandomAvailable(
  state: GameplayState,
): WeaponId {
  // Select a random available weapon id.
  //
  // Port of `weapon_pick_random_available` (0x00452cd0).
  const status = state.status;
  const weaponAvailable = state.weaponAvailable;

  for (let attempt = 0; attempt < 1000; attempt++) {
    const baseRand = state.rng.rand({ caller: RngCallerStatic.WEAPON_PICK_RANDOM_AVAILABLE_PICK });
    let weaponId: WeaponId = (baseRand % WEAPON_DROP_ID_COUNT + 1) as WeaponId;

    // Bias: used weapons have a 50% chance to reroll once.
    if (status !== null) {
      const usageSlot = weaponUsageSlotForWeaponId(weaponId);
      if (usageSlot !== null && status.weaponUsageCountSlot(usageSlot) !== 0) {
        if (
          (state.rng.rand({ caller: RngCallerStatic.WEAPON_PICK_RANDOM_AVAILABLE_REROLL_GATE }) & 1) === 0
        ) {
          const rerollRand = state.rng.rand({ caller: RngCallerStatic.WEAPON_PICK_RANDOM_AVAILABLE_REROLL_PICK });
          weaponId = (rerollRand % WEAPON_DROP_ID_COUNT + 1) as WeaponId;
        }
      }
    }

    if (!(weaponId >= 0 && weaponId < weaponAvailable.length)) {
      continue;
    }
    if (!weaponAvailable[weaponId]) {
      continue;
    }

    // Quest 5-10 special-case: suppress Ion Cannon.
    if (
      state.gameMode === GameMode.QUESTS &&
      state.questLevel !== null &&
      state.questLevel.major === 5 &&
      state.questLevel.minor === 10 &&
      weaponId === WeaponId.ION_CANNON
    ) {
      continue;
    }

    return weaponId;
  }

  return WeaponId.PISTOL;
}
