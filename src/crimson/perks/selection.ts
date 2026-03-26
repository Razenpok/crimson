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
import { QuestLevel } from "@crimson/quests/level.js";

export const PERK_ID_MAX: number = (() => {
  let maxId = 0;
  for (const perkId of PERK_BY_ID.keys()) {
    if (perkId > maxId) {
      maxId = perkId;
    }
  }
  return maxId;
})();

const DEATH_CLOCK_BLOCKED: ReadonlySet<PerkId> = new Set([
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

const PERK_RARITY_GATE: ReadonlySet<PerkId> = new Set([
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
  opts: { gameMode: GameMode; playerCount: number },
): PerkId {
  for (let i = 0; i < 1000; i++) {
    const perkId = state.rng.rand({ caller: RngCallerStatic.PERK_SELECT_RANDOM }) % PERK_ID_MAX + 1;
    if (!(perkId >= 0 && perkId < state.perkAvailable.length)) {
      continue;
    }
    if (!state.perkAvailable[perkId]) {
      continue;
    }
    if (perkCanOffer(state, player, perkId, { gameMode: opts.gameMode, playerCount: opts.playerCount })) {
      return perkId;
    }
  }

  return PerkId.INSTANT_WINNER;
}

function perkOfferableMask(
  state: GameplayState,
  player: PlayerState,
  opts: { gameMode: GameMode; playerCount: number },
): boolean[] {
  // Build a cached `perk_select_random` eligibility mask for `1..PERK_ID_MAX`.
  const offerable: boolean[] = new Array(PERK_ID_MAX + 1).fill(false);
  const maxPerkIndex = Math.min(PERK_ID_MAX, state.perkAvailable.length - 1);
  for (let perkIndex = 1; perkIndex <= maxPerkIndex; perkIndex++) {
    if (!state.perkAvailable[perkIndex]) {
      continue;
    }
    if (perkCanOffer(state, player, perkIndex, { gameMode: opts.gameMode, playerCount: opts.playerCount })) {
      offerable[perkIndex] = true;
    }
  }
  return offerable;
}

export function perkGenerateChoices(
  state: GameplayState,
  player: PlayerState,
  opts: {
    players?: PlayerState[] | null;
    gameMode: GameMode;
    playerCount: number;
    count?: number | null
  },
): PerkId[] {
  // Generate a unique list of perk choices for the current selection.

  const players = opts.players ?? null;
  const gameMode = opts.gameMode;
  const playerCount = opts.playerCount;
  let count = opts.count ?? null;
  if (count === null) {
    count = perkChoiceCount(player);
  }

  const offerableMask = perkOfferableMask(state, player, { gameMode, playerCount });
  const playerPerkCounts = player.perkCounts;
  const playerWeaponId = player.weapon.weaponId;
  const deathClockActive = playerPerkCounts[PerkId.DEATH_CLOCK] > 0;
  const flamethrowerId = WeaponId.FLAMETHROWER;

  let pyromaniacAllowed = playerWeaponId === flamethrowerId;
  if (!state.preserveBugs && int(playerCount) > 1) {
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
      const perkIndex = state.rng.rand({ caller: RngCallerStatic.PERK_SELECT_RANDOM }) % PERK_ID_MAX + 1;
      if (offerableMask[perkIndex]) {
        return perkIndex;
      }
    }
    return PerkId.INSTANT_WINNER;
  }

  // `perks_generate_choices` always fills a fixed array of 7 entries, even if the UI
  // only shows 5/6 (Perk Expert/Master). Preserve RNG consumption by generating the
  // full list, then slicing.
  let choices: PerkId[] = new Array(7).fill(PerkId.ANTIPERK);
  let choiceIndex = 0;

  // Native `quest_monster_vision_meta` points to quest 3-4 (Hidden Evil):
  // force Monster Vision as the first choice if not owned.
  if (
    state.questLevel !== null &&
    state.questLevel.equal(new QuestLevel(3, 4)) &&
    int(playerPerkCounts[PerkId.MONSTER_VISION]) === 0
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

      // Native gates this on player-1 weapon only. In default mode, allow
      // it in co-op when any alive player has Flamethrower equipped.
      if (perkId === PerkId.PYROMANIAC && !pyromaniacAllowed) {
        continue;
      }

      if (deathClockActive && DEATH_CLOCK_BLOCKED.has(perkId)) {
        continue;
      }

      // Global rarity gate: certain perks have a 25% chance to be rejected.
      if (
        PERK_RARITY_GATE.has(perkId) &&
        (state.rng.rand({ caller: RngCallerStatic.PERKS_GENERATE_CHOICES_RARITY_GATE }) & 3) === 1
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

      if (stackable || int(playerPerkCounts[perkId]) < 1 || attempts > 29_999) {
        break;
      }
    }

    choices[choiceIndex] = perkId;
    choiceIndex += 1;
  }

  if (gameMode === GameMode.TUTORIAL) {
    choices = [
      PerkId.SHARPSHOOTER,
      PerkId.LONG_DISTANCE_RUNNER,
      PerkId.EVIL_EYES,
      PerkId.RADIOACTIVE,
      PerkId.FASTSHOT,
      PerkId.FASTSHOT,
      PerkId.FASTSHOT,
    ];
  }

  return choices.slice(0, count);
}

function perkSelectionPrepareIfNeeded(
  state: GameplayState,
  players: PlayerState[],
  perkState: PerkSelectionState,
  opts: {
    gameMode: GameMode;
    playerCount?: number | null
  },
): PerkId[] {
  if (players.length === 0) {
    return [];
  }
  const gameMode = opts.gameMode;
  let playerCount = opts.playerCount ?? null;
  if (playerCount === null) {
    playerCount = players.length;
  }
  if (perkState.choicesDirty || perkState.choices.length === 0) {
    perkState.choices = perkGenerateChoices(
      state,
      players[0],
      { players, gameMode, playerCount, count: 7 },
    );
    perkState.choicesDirty = false;
  }
  return perkState.choices;
}

export function perkSelectionPreparedChoices(
  players: PlayerState[],
  perkState: PerkSelectionState,
): PerkId[] {
  // Return already-prepared visible choices without mutating state.
  if (players.length === 0) {
    return [];
  }
  if (perkState.choicesDirty || perkState.choices.length === 0) {
    return [];
  }
  const visibleCount = Math.max(1, int(perkChoiceCount(players[0])));
  return perkState.choices.slice(0, visibleCount);
}

export function perkSelectionOpenChoices(
  state: GameplayState,
  players: PlayerState[],
  perkState: PerkSelectionState,
  opts: { gameMode: GameMode; playerCount?: number | null },
): PerkId[] {
  // Prepare current perk choices for the selection UI and return the visible list.
  // Mirrors `perk_choices_dirty` + `perks_generate_choices` before entering the
  // perk selection screen (state 6).
  const playerCount = opts.playerCount ?? null;
  perkSelectionPrepareIfNeeded(
    state,
    players,
    perkState,
    {
      gameMode: opts.gameMode,
      playerCount,
    }
  );
  return perkSelectionPreparedChoices(players, perkState);
}

export function perkSelectionPick(
  state: GameplayState,
  players: PlayerState[],
  perkState: PerkSelectionState,
  choiceIndex: number,
  opts: {
    gameMode: GameMode;
    playerCount?: number | null;
    dt?: number | null;
    creatures?: readonly CreatureState[] | null;
    refreshChoices?: boolean
  },
): PerkId | null {
  // Pick a perk from the current choice list and apply it.
  // On success, decrements `pending_count` (one perk resolved) and marks the
  // choice list dirty, matching `perk_selection_screen_update`.
  const gameMode = opts.gameMode;
  const playerCount = opts.playerCount ?? null;
  const dt = opts.dt ?? null;
  const creatures = opts.creatures ?? null;
  const refreshChoices = opts.refreshChoices ?? false;
  if (perkState.pendingCount <= 0) {
    return null;
  }
  perkSelectionPrepareIfNeeded(
    state,
    players,
    perkState,
    {
      gameMode,
      playerCount,
    },
  );
  const choices = perkSelectionPreparedChoices(players, perkState);
  if (choices.length === 0) {
    return null;
  }
  const idx = int(choiceIndex);
  if (idx < 0 || idx >= choices.length) {
    return null;
  }
  const perkId = choices[idx];
  perkApply(state, players, perkId, { perkState, dt, creatures });
  console.assert(int(perkState.pendingCount) > 0, 'pendingCount must be > 0 after perkApply');
  perkState.pendingCount -= 1;
  perkState.choicesDirty = true;
  if (refreshChoices) {
    perkSelectionPrepareIfNeeded(
      state,
      players,
      perkState,
      {
        gameMode,
        playerCount,
      }
    );
  }
  return perkId;
}
