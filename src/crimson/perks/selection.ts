// Port of crimson/perks/selection.py

import { GameMode } from '@crimson/game-modes.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import { WeaponId } from '@crimson/weapons.ts';
import { perkCanOffer } from './availability.ts';
import { perkActive } from './helpers.ts';
import { PERK_BY_ID, PerkFlags, PerkId } from './ids.ts';
import { perkApply } from './runtime/apply.ts';
import type { PerkSelectionState } from './state.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';

export const PERK_ID_MAX: number = (() => {
  let maxId = 0;
  for (const perkId of PERK_BY_ID.keys()) {
    if ((perkId as number) > maxId) {
      maxId = perkId as number;
    }
  }
  return maxId;
})();

const _DEATH_CLOCK_BLOCKED: ReadonlySet<PerkId> = new Set([
  PerkId.JINXED,
  PerkId.BREATHING_ROOM,
  PerkId.GRIM_DEAL,
  PerkId.HIGHLANDER,
  PerkId.FATAL_LOTTERY,
  PerkId.AMMUNITION_WITHIN,
  PerkId.INFERNAL_CONTRACT,
  PerkId.REGENERATION,
  PerkId.GREATER_REGENERATION,
  PerkId.THICK_SKINNED,
  PerkId.BANDAGE,
]);

const _PERK_RARITY_GATE: ReadonlySet<PerkId> = new Set([
  PerkId.JINXED,
  PerkId.AMMUNITION_WITHIN,
  PerkId.ANXIOUS_LOADER,
  PerkId.MONSTER_VISION,
]);

export function perkChoiceCount(player: PlayerState): number {
  if (perkActive(player, PerkId.PERK_MASTER)) {
    return 7;
  }
  if (perkActive(player, PerkId.PERK_EXPERT)) {
    return 6;
  }
  return 5;
}

export function perkSelectRandom(
  state: GameplayState,
  player: PlayerState,
  gameMode: GameMode,
  playerCount: number,
): PerkId {
  for (let i = 0; i < 1000; i++) {
    const perkIdNum = state.rng.rand(RngCallerStatic.PERK_SELECT_RANDOM) % PERK_ID_MAX + 1;
    const perkId = perkIdNum as PerkId;
    if (!(perkIdNum >= 0 && perkIdNum < state.perkAvailable.length)) {
      continue;
    }
    if (!state.perkAvailable[perkIdNum]) {
      continue;
    }
    if (perkCanOffer(state, player, perkId, gameMode, playerCount)) {
      return perkId;
    }
  }

  return PerkId.INSTANT_WINNER;
}

function perkOfferableMask(
  state: GameplayState,
  player: PlayerState,
  gameMode: GameMode,
  playerCount: number,
): boolean[] {
  const offerable: boolean[] = new Array(PERK_ID_MAX + 1).fill(false);
  const maxPerkIndex = Math.min(PERK_ID_MAX, state.perkAvailable.length - 1);
  for (let perkIndex = 1; perkIndex <= maxPerkIndex; perkIndex++) {
    if (!state.perkAvailable[perkIndex]) {
      continue;
    }
    const perkId = perkIndex as PerkId;
    if (perkCanOffer(state, player, perkId, gameMode, playerCount)) {
      offerable[perkIndex] = true;
    }
  }
  return offerable;
}

export function perkGenerateChoices(
  state: GameplayState,
  player: PlayerState,
  players: PlayerState[] | null,
  gameMode: GameMode,
  playerCount: number,
  count: number | null = null,
): PerkId[] {
  if (count === null) {
    count = perkChoiceCount(player);
  }

  const offerableMask = perkOfferableMask(state, player, gameMode, playerCount);
  const playerPerkCounts = player.perkCounts;
  const playerWeaponId = player.weapon.weaponId;
  const deathClockActive = playerPerkCounts[PerkId.DEATH_CLOCK as number] > 0;
  const flamethrowerId = WeaponId.FLAMETHROWER;

  let pyromaniacAllowed = playerWeaponId === flamethrowerId;
  if (!state.preserveBugs && playerCount > 1) {
    pyromaniacAllowed = false;
    const sourcePlayers = players !== null ? players : [player];
    for (const sourcePlayer of sourcePlayers) {
      if (sourcePlayer.health <= 0.0) {
        continue;
      }
      if (sourcePlayer.weapon.weaponId === flamethrowerId) {
        pyromaniacAllowed = true;
        break;
      }
    }
  }

  function selectRandomOffer(): PerkId {
    for (let i = 0; i < 1000; i++) {
      const perkIndex = state.rng.rand(RngCallerStatic.PERK_SELECT_RANDOM) % PERK_ID_MAX + 1;
      if (offerableMask[perkIndex]) {
        return perkIndex as PerkId;
      }
    }
    return PerkId.INSTANT_WINNER;
  }

  const choices: PerkId[] = new Array(7).fill(PerkId.ANTIPERK);
  let choiceIndex = 0;

  if (
    state.questLevel !== null &&
    state.questLevel.major === 3 &&
    state.questLevel.minor === 4 &&
    playerPerkCounts[PerkId.MONSTER_VISION as number] === 0
  ) {
    choices[0] = PerkId.MONSTER_VISION;
    choiceIndex = 1;
  }

  while (choiceIndex < 7) {
    let attempts = 0;
    let perkId: PerkId = PerkId.ANTIPERK;
    while (true) {
      attempts += 1;
      perkId = selectRandomOffer();

      if (perkId === PerkId.PYROMANIAC && !pyromaniacAllowed) {
        continue;
      }

      if (deathClockActive && _DEATH_CLOCK_BLOCKED.has(perkId)) {
        continue;
      }

      if (
        _PERK_RARITY_GATE.has(perkId) &&
        (state.rng.rand(RngCallerStatic.PERKS_GENERATE_CHOICES_RARITY_GATE) & 3) === 1
      ) {
        continue;
      }

      const meta = PERK_BY_ID.get(perkId);
      const flags = meta !== undefined ? meta.flags : 0;
      const stackable = (flags & PerkFlags.STACKABLE) !== 0;

      if (attempts > 10_000 && stackable) {
        break;
      }

      let alreadyChosen = false;
      for (let j = 0; j < choiceIndex; j++) {
        if (choices[j] === perkId) {
          alreadyChosen = true;
          break;
        }
      }
      if (alreadyChosen) {
        continue;
      }

      if (stackable || playerPerkCounts[perkId as number] < 1 || attempts > 29_999) {
        break;
      }
    }

    choices[choiceIndex] = perkId;
    choiceIndex += 1;
  }

  if (gameMode === GameMode.TUTORIAL) {
    return [
      PerkId.SHARPSHOOTER,
      PerkId.LONG_DISTANCE_RUNNER,
      PerkId.EVIL_EYES,
      PerkId.RADIOACTIVE,
      PerkId.FASTSHOT,
      PerkId.FASTSHOT,
      PerkId.FASTSHOT,
    ].slice(0, count);
  }

  return choices.slice(0, count);
}

function perkSelectionPrepareIfNeeded(
  state: GameplayState,
  players: PlayerState[],
  perkState: PerkSelectionState,
  gameMode: GameMode,
  playerCount: number | null = null,
): PerkId[] {
  if (players.length === 0) {
    return [];
  }
  if (playerCount === null) {
    playerCount = players.length;
  }
  if (perkState.choicesDirty || perkState.choices.length === 0) {
    perkState.choices = perkGenerateChoices(
      state,
      players[0],
      players,
      gameMode,
      playerCount,
      7,
    );
    perkState.choicesDirty = false;
  }
  return perkState.choices;
}

export function perkSelectionPreparedChoices(
  players: PlayerState[],
  perkState: PerkSelectionState,
): PerkId[] {
  if (players.length === 0) {
    return [];
  }
  if (perkState.choicesDirty || perkState.choices.length === 0) {
    return [];
  }
  const visibleCount = Math.max(1, perkChoiceCount(players[0]));
  return perkState.choices.slice(0, visibleCount);
}

export function perkSelectionOpenChoices(
  state: GameplayState,
  players: PlayerState[],
  perkState: PerkSelectionState,
  gameMode: GameMode,
  playerCount: number | null = null,
): PerkId[] {
  perkSelectionPrepareIfNeeded(
    state,
    players,
    perkState,
    gameMode,
    playerCount,
  );
  return perkSelectionPreparedChoices(players, perkState);
}

export function perkSelectionPick(
  state: GameplayState,
  players: PlayerState[],
  perkState: PerkSelectionState,
  choiceIndex: number,
  gameMode: GameMode,
  playerCount: number | null = null,
  dt: number | null = null,
  creatures: readonly CreatureState[] | null = null,
  refreshChoices = false,
): PerkId | null {
  if (perkState.pendingCount <= 0) {
    return null;
  }
  perkSelectionPrepareIfNeeded(
    state,
    players,
    perkState,
    gameMode,
    playerCount,
  );
  const choices = perkSelectionPreparedChoices(players, perkState);
  if (choices.length === 0) {
    return null;
  }
  const idx = choiceIndex | 0;
  if (idx < 0 || idx >= choices.length) {
    return null;
  }
  const perkId = choices[idx];
  perkApply(state, players, perkId, perkState, dt, creatures);
  console.assert((perkState.pendingCount | 0) > 0, 'pendingCount must be > 0 after perkApply');
  perkState.pendingCount -= 1;
  perkState.choicesDirty = true;
  if (refreshChoices) {
    perkSelectionPrepareIfNeeded(
      state,
      players,
      perkState,
      gameMode,
      playerCount,
    );
  }
  return perkId;
}
