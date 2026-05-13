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
  function _builderName(builderFn: QuestBuilder): string {
    return builderFn.name || String(builderFn);
  }

  return (builder: QuestBuilder): QuestBuilder => {
    const questLevel = QuestLevel.parse(opts.level);
    const resolvedTerrainSlots = opts.terrainSlots !== undefined && opts.terrainSlots !== null
      ? opts.terrainSlots
      : terrainSlotsForQuest(questLevel);
    const normalizedUnlockWeaponId = opts.unlockWeaponId !== undefined && opts.unlockWeaponId !== null
      ? opts.unlockWeaponId
      : null;
    const quest: QuestDefinition = {
      level: questLevel,
      title: opts.title,
      builder,
      timeLimitMs: opts.timeLimitMs,
      startWeaponId: opts.startWeaponId,
      unlockPerkId: opts.unlockPerkId ?? null,
      unlockWeaponId: normalizedUnlockWeaponId,
      terrainSlots: resolvedTerrainSlots,
    };
    const key = quest.level.text;
    const existing = _QUESTS.get(key);
    if (existing !== undefined) {
      throw new Error(
        `duplicate quest level ${quest.level.text}: ${_builderName(existing.builder)} vs ${_builderName(builder)}`,
      );
    }
    _QUESTS.set(key, quest);
    return builder;
  };
}

export function allQuests(): QuestDefinition[] {
  return Array.from(_QUESTS.values()).sort((a, b) => a.level.globalIndex - b.level.globalIndex);
}

export function questByLevel(level: QuestLevel): QuestDefinition | null {
  return _QUESTS.get(level.text) ?? null;
}
