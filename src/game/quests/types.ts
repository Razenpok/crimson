import { Vec2 } from '../../engine/geom.ts';
import type { CrandLike } from '../../engine/rand.ts';
import type { SpawnId } from '../creatures/spawn-ids.ts';
import type { WeaponId } from '../weapons.ts';
import type { QuestLevel } from './level.ts';

export interface QuestContext {
  readonly width: number;
  readonly height: number;
  readonly playerCount: number;
}

export interface SpawnEntry {
  readonly pos: Vec2;
  readonly heading: number;
  readonly spawnId: SpawnId;
  readonly triggerMs: number;
  readonly count: number;
}

export type QuestBuilder = (
  ctx: QuestContext,
  opts: { rng: CrandLike; fullVersion?: boolean },
) => SpawnEntry[];

export type TerrainSlotTriplet = readonly [number, number, number];

export interface QuestDefinition {
  readonly level: QuestLevel;
  readonly title: string;
  readonly builder: QuestBuilder;
  readonly timeLimitMs: number;
  readonly startWeaponId: WeaponId;
  readonly terrainSlots: TerrainSlotTriplet;
  readonly unlockPerkId: number | null;
  readonly unlockWeaponId: WeaponId | null;
}

export function questDefinitionMajor(quest: QuestDefinition): number {
  return quest.level.major;
}

export function questDefinitionMinor(quest: QuestDefinition): number {
  return quest.level.minor;
}
