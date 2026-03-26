// Port of crimson/perks/availability.py

import { GameMode } from '@crimson/game-modes.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import { perkCountGet } from './helpers.ts';
import { PERK_BY_ID, PerkFlags, PerkId } from './ids.ts';
import { PERK_COUNT_SIZE } from '@crimson/sim/state-types.ts';
import { QuestLevel } from "@crimson/quests/level.js";
import { allQuests } from "@crimson/quests/registry.js";
import { GameplayState, GameStatus } from "@crimson/gameplay.js";

const _PERK_BASE_AVAILABLE_MAX_ID = PerkId.BONUS_MAGNET as number;
const _PERK_ALWAYS_AVAILABLE: readonly PerkId[] = [
  PerkId.MAN_BOMB,
  PerkId.LIVING_FORTRESS,
  PerkId.FIRE_CAUGH,
  PerkId.TOUGH_RELOADER,
];

export function buildPerkAvailability(opts: { status: GameStatus | null }): boolean[] {
  const available: boolean[] = new Array(PERK_COUNT_SIZE).fill(false);
  let unlockIndex = 0;
  if (opts.status !== null) {
    unlockIndex = opts.status.questUnlockIndex;
  }

  for (let perkId = 1; perkId <= _PERK_BASE_AVAILABLE_MAX_ID; perkId++) {
    if (perkId >= 0 && perkId < available.length) {
      available[perkId] = true;
    }
  }

  for (const perkId of _PERK_ALWAYS_AVAILABLE) {
    const idx = perkId;
    if (idx >= 0 && idx < available.length) {
      available[idx] = true;
    }
  }

  if (unlockIndex > 0) {
    const quests = allQuests();
    for (let i = 0; i < Math.min(unlockIndex, quests.length); i++) {
      const quest = quests[i];
      const perkId = quest.unlockPerkId;
      if (perkId !== null && perkId > 0 && perkId < available.length) {
        available[perkId] = true;
      }
    }
  }

  available[PerkId.ANTIPERK] = false;
  return available;
}

export function preparePerkAvailability(state: GameplayState): void {
  const built = buildPerkAvailability({ status: state.status });
  for (let i = 0; i < built.length && i < state.perkAvailable.length; i++) {
    state.perkAvailable[i] = built[i];
  }
}

export function perkCanOffer(
  state: GameplayState,
  player: PlayerState,
  perkId: PerkId,
  opts: { gameMode: GameMode; playerCount: number },
): boolean {
  if (perkId === PerkId.ANTIPERK) {
    return false;
  }

  // Hardcore quest 2-10 blocks poison-related perks.
  if (
    opts.gameMode === GameMode.QUESTS &&
    state.hardcore &&
    state.questLevel !== null && state.questLevel.equal(new QuestLevel(2, 10)) &&
    (perkId === PerkId.POISON_BULLETS || perkId === PerkId.VEINS_OF_POISON || perkId === PerkId.PLAGUEBEARER)
  ) {
    return false;
  }

  const meta = PERK_BY_ID.get(perkId);
  if (meta === undefined) {
    return false;
  }

  const flags = meta.flags;
  // Native `perk_can_offer` treats these metadata bits as allow-lists for
  // specific runtime modes, not "only in this mode":
  // - in quest mode, offered perks must have bit 0x1 set
  // - in multiplayer, offered perks must have bit 0x2 set
  // The original game only had 1p/2p, but the port extends this gate to all
  // multiplayer counts for consistent 3p/4p behavior.
  if (opts.gameMode === GameMode.QUESTS && (flags & PerkFlags.QUEST_MODE_ALLOWED) === 0) {
    return false;
  }
  if (opts.playerCount > 1 && (flags & PerkFlags.MULTIPLAYER_ALLOWED) === 0) {
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
