// Port of crimson/quests/registry.py

import { terrainSlotsForQuest, TerrainSlotTriplet } from "@crimson/terrain-slots.ts";
import { WeaponId } from "@crimson/weapons.ts";
import { QuestLevel } from "./level.ts";
import type { QuestBuilder, QuestDefinition } from "./types.ts";

const _QUESTS: Map<string, QuestDefinition> = new Map();

export function registerQuest(opts: {
  level: string;
  title: string;
  timeLimitMs: number;
  startWeaponId: WeaponId;
  unlockPerkId?: number | null;
  unlockWeaponId?: WeaponId | null;
  terrainSlots?: TerrainSlotTriplet | null;
}): (builder: QuestBuilder) => QuestBuilder {
  return (builder: QuestBuilder): QuestBuilder => {
    const questLevel = QuestLevel.parse(opts.level);
    const quest: QuestDefinition = {
      level: questLevel,
      title: opts.title,
      builder,
      timeLimitMs: opts.timeLimitMs,
      startWeaponId: opts.startWeaponId,
      unlockPerkId: opts.unlockPerkId ?? null,
      unlockWeaponId: opts.unlockWeaponId ?? null,
      terrainSlots: opts.terrainSlots ?? terrainSlotsForQuest(questLevel),
    };
    const key = quest.level.key;
    const existing = _QUESTS.get(key);
    if (existing !== undefined) {
      throw new Error(
        `duplicate quest level ${key}: ${existing.builder.name} vs ${builder.name}`,
      );
    }
    _QUESTS.set(key, quest);
    allQuestsCached = undefined;
    return builder;
  };
}

let allQuestsCached: QuestDefinition[] | undefined;

export function allQuests() {
  if (allQuestsCached === undefined) {
    allQuestsCached = Array.from(_QUESTS.values()).sort(
      (a, b) => a.level.globalIndex - b.level.globalIndex,
    );
  }
  return allQuestsCached;
}

export function questByLevel(level: QuestLevel): QuestDefinition | null {
  return _QUESTS.get(level.key) ?? null;
}
