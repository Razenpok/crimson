// Port of crimson/quests/registry.py

import { terrainSlotsForQuest, TerrainSlotTriplet } from "@crimson/terrain-slots.ts";
import { WeaponId } from "@crimson/weapons.ts";
import type { QuestLevel } from "./level.ts";
import { questLevelGlobalIndex, questLevelKey, questLevelParse } from "./level.ts";
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
    const questLevel = questLevelParse(opts.level);
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
    const key = questLevelKey(quest.level);
    const existing = _QUESTS.get(key);
    if (existing !== undefined) {
      throw new Error(
        `duplicate quest level ${key}: ${existing.builder.name} vs ${builder.name}`,
      );
    }
    _QUESTS.set(key, quest);
    return builder;
  };
}

export function allQuests(): QuestDefinition[] {
  return Array.from(_QUESTS.values()).sort(
    (a, b) => questLevelGlobalIndex(a.level) - questLevelGlobalIndex(b.level),
  );
}

export function questByLevel(level: QuestLevel): QuestDefinition | null {
  return _QUESTS.get(questLevelKey(level)) ?? null;
}
