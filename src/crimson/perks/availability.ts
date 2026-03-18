// Port of crimson/perks/availability.py

import { GameMode } from '../game-modes.ts';
import type { GameplayState, PlayerState, QuestLevel } from '../sim/state-types.ts';
import { perkCountGet } from './helpers.ts';
import { PERK_BY_ID, PerkFlags, PerkId } from './ids.ts';
import { PERK_COUNT_SIZE } from '../sim/state-types.ts';

const _PERK_BASE_AVAILABLE_MAX_ID = PerkId.BONUS_MAGNET as number;
const _PERK_ALWAYS_AVAILABLE: readonly PerkId[] = [
  PerkId.MAN_BOMB,
  PerkId.LIVING_FORTRESS,
  PerkId.FIRE_CAUGH,
  PerkId.TOUGH_RELOADER,
];

export interface GameStatus {
  readonly questUnlockIndex: number;
}

export interface QuestDefinition {
  readonly unlockPerkId: PerkId | null;
}

export function buildPerkAvailability(status: GameStatus | null, allQuests: readonly QuestDefinition[]): boolean[] {
  const available: boolean[] = new Array(PERK_COUNT_SIZE).fill(false);
  let unlockIndex = 0;
  if (status !== null) {
    unlockIndex = status.questUnlockIndex;
  }

  for (let perkId = 1; perkId <= _PERK_BASE_AVAILABLE_MAX_ID; perkId++) {
    if (perkId >= 0 && perkId < available.length) {
      available[perkId] = true;
    }
  }

  for (const perkId of _PERK_ALWAYS_AVAILABLE) {
    const idx = perkId as number;
    if (idx >= 0 && idx < available.length) {
      available[idx] = true;
    }
  }

  if (unlockIndex > 0) {
    const quests = allQuests;
    for (let i = 0; i < Math.min(unlockIndex, quests.length); i++) {
      const quest = quests[i];
      const perkId = quest.unlockPerkId;
      if (perkId !== null && (perkId as number) > 0 && (perkId as number) < available.length) {
        available[perkId as number] = true;
      }
    }
  }

  available[PerkId.ANTIPERK as number] = false;
  return available;
}

export function preparePerkAvailability(
  state: GameplayState,
  status: GameStatus | null,
  allQuests: readonly QuestDefinition[],
): void {
  const built = buildPerkAvailability(status, allQuests);
  for (let i = 0; i < built.length && i < state.perkAvailable.length; i++) {
    state.perkAvailable[i] = built[i];
  }
}

function questLevelEquals(a: QuestLevel | null, major: number, minor: number): boolean {
  if (a === null) return false;
  return a.major === major && a.minor === minor;
}

export function perkCanOffer(
  state: GameplayState,
  player: PlayerState,
  perkId: PerkId,
  gameMode: GameMode,
  playerCount: number,
): boolean {
  if (perkId === PerkId.ANTIPERK) {
    return false;
  }

  if (
    gameMode === GameMode.QUESTS &&
    state.hardcore &&
    questLevelEquals(state.questLevel, 2, 10) &&
    (perkId === PerkId.POISON_BULLETS || perkId === PerkId.VEINS_OF_POISON || perkId === PerkId.PLAGUEBEARER)
  ) {
    return false;
  }

  const meta = PERK_BY_ID.get(perkId);
  if (meta === undefined) {
    return false;
  }

  const flags = meta.flags;
  if (gameMode === GameMode.QUESTS && (flags & PerkFlags.QUEST_MODE_ALLOWED) === 0) {
    return false;
  }
  if (playerCount > 1 && (flags & PerkFlags.MULTIPLAYER_ALLOWED) === 0) {
    return false;
  }

  if (meta.prereq.length > 0) {
    for (const req of meta.prereq) {
      if (perkCountGet(player, req) <= 0) {
        return false;
      }
    }
  }

  return true;
}
