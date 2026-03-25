// Port of crimson/creatures/spawn.py

import { Vec2 } from '@grim/geom.ts';
import { CrandLike } from '@grim/rand.ts';
import { BonusId } from '@crimson/bonuses/ids.ts';
import { f32 } from '@crimson/math-parity.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import {
  HAS_SPAWN_SLOT_FLAG,
  RANDOM_HEADING_SENTINEL,
  CreatureAiMode,
  CreatureFlags,
  CreatureTypeId,
  SpawnId,
  type Tint,
  type TintRGBA,
} from './spawn-ids.ts';
import { SPAWN_ID_TO_TEMPLATE, SPAWN_TEMPLATES, TYPE_ID_TO_NAME, type SpawnTemplate } from './spawn-templates.ts';

export {
  CreatureAiMode,
  CreatureFlags,
  CreatureTypeId,
  HAS_SPAWN_SLOT_FLAG,
  RANDOM_HEADING_SENTINEL,
  SPAWN_ID_TO_TEMPLATE,
  SPAWN_TEMPLATES,
  SpawnId,
  TYPE_ID_TO_NAME,
  type SpawnTemplate,
};


export class UnsupportedSpawnTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedSpawnTemplateError';
  }
}


export interface AlienSpawnerSpec {
  readonly timer: number;
  readonly limit: number;
  readonly interval: number;
  readonly childTemplateId: SpawnId;
  readonly size: number;
  readonly health: number;
  readonly moveSpeed: number;
  readonly rewardValue: number;
  readonly tint: TintRGBA;
}


export const ALIEN_SPAWNER_TEMPLATES: Map<SpawnId, AlienSpawnerSpec> = new Map([
  [SpawnId.ALIEN_SPAWNER_CHILD_1D_FAST_07, {
    timer: 1.0,
    limit: 100,
    interval: 2.2,
    childTemplateId: SpawnId.ALIEN_RANDOM_1D,
    size: 50.0,
    health: 1000.0,
    moveSpeed: 2.0,
    rewardValue: 3000.0,
    tint: [1.0, 1.0, 1.0, 1.0] as TintRGBA,
  }],
  [SpawnId.ALIEN_SPAWNER_CHILD_1D_SLOW_08, {
    timer: 1.0,
    limit: 100,
    interval: 2.8,
    childTemplateId: SpawnId.ALIEN_RANDOM_1D,
    size: 50.0,
    health: 1000.0,
    moveSpeed: 2.0,
    rewardValue: 3000.0,
    tint: [1.0, 1.0, 1.0, 1.0] as TintRGBA,
  }],
  [SpawnId.ALIEN_SPAWNER_CHILD_1D_LIMITED_09, {
    timer: 1.0,
    limit: 16,
    interval: 2.0,
    childTemplateId: SpawnId.ALIEN_RANDOM_1D,
    size: 40.0,
    health: 450.0,
    moveSpeed: 2.0,
    rewardValue: 1000.0,
    tint: [1.0, 1.0, 1.0, 1.0] as TintRGBA,
  }],
  [SpawnId.ALIEN_SPAWNER_CHILD_32_SLOW_0A, {
    timer: 2.0,
    limit: 100,
    interval: 5.0,
    childTemplateId: SpawnId.SPIDER_SP1_RANDOM_32,
    size: 55.0,
    health: 1000.0,
    moveSpeed: 1.5,
    rewardValue: 3000.0,
    tint: [0.8, 0.7, 0.4, 1.0] as TintRGBA,
  }],
  [SpawnId.ALIEN_SPAWNER_CHILD_3C_SLOW_0B, {
    timer: 2.0,
    limit: 100,
    interval: 6.0,
    childTemplateId: SpawnId.SPIDER_SP1_CONST_RANGED_VARIANT_3C,
    size: 65.0,
    health: 3500.0,
    moveSpeed: 1.5,
    rewardValue: 5000.0,
    tint: [0.9, 0.1, 0.1, 1.0] as TintRGBA,
  }],
  [SpawnId.ALIEN_SPAWNER_CHILD_31_FAST_0C, {
    timer: 1.5,
    limit: 100,
    interval: 2.0,
    childTemplateId: SpawnId.LIZARD_RANDOM_31,
    size: 32.0,
    health: 50.0,
    moveSpeed: 2.8,
    rewardValue: 1000.0,
    tint: [0.9, 0.8, 0.4, 1.0] as TintRGBA,
  }],
  [SpawnId.ALIEN_SPAWNER_CHILD_31_SLOW_0D, {
    timer: 2.0,
    limit: 100,
    interval: 6.0,
    childTemplateId: SpawnId.LIZARD_RANDOM_31,
    size: 32.0,
    health: 50.0,
    moveSpeed: 1.3,
    rewardValue: 1000.0,
    tint: [0.9, 0.8, 0.4, 1.0] as TintRGBA,
  }],
  [SpawnId.ALIEN_SPAWNER_CHILD_32_FAST_10, {
    timer: 1.5,
    limit: 100,
    interval: 2.3,
    childTemplateId: SpawnId.SPIDER_SP1_RANDOM_32,
    size: 32.0,
    health: 50.0,
    moveSpeed: 2.8,
    rewardValue: 800.0,
    tint: [0.9, 0.8, 0.4, 1.0] as TintRGBA,
  }],
]);


export interface ConstantSpawnSpec {
  readonly typeId: CreatureTypeId;
  readonly health: number;
  readonly moveSpeed: number;
  readonly rewardValue: number;
  readonly tint: TintRGBA;
  readonly size: number;
  readonly contactDamage: number;
  readonly flags: CreatureFlags;
  readonly aiMode: number;
  readonly orbitAngle: number | null;
  readonly orbitRadius: number | null;
  readonly rangedProjectileType: number | null;
  readonly bonusId: BonusId | null;
  readonly bonusDurationOverride: number | null;
}

function constSpec(
  typeId: CreatureTypeId,
  health: number,
  moveSpeed: number,
  rewardValue: number,
  tint: TintRGBA,
  size: number,
  contactDamage: number,
  flags: CreatureFlags = 0 as CreatureFlags,
  aiMode: number = CreatureAiMode.ORBIT_PLAYER,
  orbitAngle: number | null = null,
  orbitRadius: number | null = null,
  rangedProjectileType: number | null = null,
  bonusId: BonusId | null = null,
  bonusDurationOverride: number | null = null,
): ConstantSpawnSpec {
  return {
    typeId, health, moveSpeed, rewardValue, tint, size, contactDamage,
    flags, aiMode, orbitAngle, orbitRadius, rangedProjectileType, bonusId, bonusDurationOverride,
  };
}


export interface FormationChildSpec {
  readonly typeId: CreatureTypeId;
  readonly health: number;
  readonly moveSpeed: number;
  readonly rewardValue: number;
  readonly size: number;
  readonly contactDamage: number;
  readonly tint: TintRGBA;
  readonly maxHealth: number | null;
  readonly orbitAngle: number | null;
  readonly orbitRadius: number | null;
}

function childSpec(
  typeId: CreatureTypeId,
  health: number,
  moveSpeed: number,
  rewardValue: number,
  size: number,
  contactDamage: number,
  tint: TintRGBA,
  maxHealth: number | null = null,
  orbitAngle: number | null = null,
  orbitRadius: number | null = null,
): FormationChildSpec {
  return { typeId, health, moveSpeed, rewardValue, size, contactDamage, tint, maxHealth, orbitAngle, orbitRadius };
}


export interface GridFormationSpec {
  readonly parent: ConstantSpawnSpec;
  readonly childAiMode: number;
  readonly childSpec: FormationChildSpec;
  readonly xRange: readonly number[];
  readonly yRange: readonly number[];
  readonly applyFallback: boolean;
  readonly setParentMaxHealth: boolean;
}


export interface RingFormationSpec {
  readonly parent: ConstantSpawnSpec;
  readonly childAiMode: number;
  readonly childSpec: FormationChildSpec;
  readonly count: number;
  readonly angleStep: number;
  readonly radius: number;
  readonly applyFallback: boolean;
  readonly setPosition: boolean;
  readonly setParentMaxHealth: boolean;
}


function rangeArray(start: number, stop: number, step: number): number[] {
  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < stop; i += step) result.push(i);
  } else if (step < 0) {
    for (let i = start; i > stop; i += step) result.push(i);
  }
  return result;
}


export const CONSTANT_SPAWN_TEMPLATES: Map<SpawnId, ConstantSpawnSpec> = new Map([
  [SpawnId.SPIDER_SP2_SPLITTER_01, constSpec(
    CreatureTypeId.SPIDER_SP2, 400.0, 2.0, 1000.0, [0.8, 0.7, 0.4, 1.0], 80.0, 17.0,
    CreatureFlags.SPLIT_ON_DEATH,
  )],
  [SpawnId.ALIEN_CONST_BROWN_TRANSPARENT_0F, constSpec(
    CreatureTypeId.ALIEN, 20.0, 2.9, 60.0, [0.665, 0.385, 0.259, 0.56], 50.0, 35.0,
  )],
  [SpawnId.ALIEN_CONST_PURPLE_GHOST_21, constSpec(
    CreatureTypeId.ALIEN, 53.0, 1.7, 120.0, [0.7, 0.1, 0.51, 0.5], 55.0, 8.0,
  )],
  [SpawnId.ALIEN_CONST_GREEN_GHOST_22, constSpec(
    CreatureTypeId.ALIEN, 25.0, 1.7, 150.0, [0.1, 0.7, 0.51, 0.05], 50.0, 8.0,
  )],
  [SpawnId.ALIEN_CONST_GREEN_GHOST_SMALL_23, constSpec(
    CreatureTypeId.ALIEN, 5.0, 1.7, 180.0, [0.1, 0.7, 0.51, 0.04], 45.0, 8.0,
  )],
  [SpawnId.ALIEN_CONST_GREEN_24, constSpec(
    CreatureTypeId.ALIEN, 20.0, 2.0, 110.0, [0.1, 0.7, 0.11, 1.0], 50.0, 4.0,
  )],
  [SpawnId.ALIEN_CONST_GREEN_SMALL_25, constSpec(
    CreatureTypeId.ALIEN, 25.0, 2.5, 125.0, [0.1, 0.8, 0.11, 1.0], 30.0, 3.0,
  )],
  [SpawnId.ALIEN_CONST_PALE_GREEN_26, constSpec(
    CreatureTypeId.ALIEN, 50.0, 2.2, 125.0, [0.6, 0.8, 0.6, 1.0], 45.0, 10.0,
  )],
  [SpawnId.ALIEN_CONST_WEAPON_BONUS_27, constSpec(
    CreatureTypeId.ALIEN, 50.0, 2.1, 125.0, [1.0, 0.8, 0.1, 1.0], 45.0, 10.0,
    CreatureFlags.BONUS_ON_DEATH,
    CreatureAiMode.ORBIT_PLAYER,
    null, null, null,
    BonusId.WEAPON, 5,
  )],
  [SpawnId.ALIEN_CONST_PURPLE_28, constSpec(
    CreatureTypeId.ALIEN, 50.0, 1.7, 150.0, [0.7, 0.1, 0.51, 1.0], 55.0, 8.0,
  )],
  [SpawnId.ALIEN_CONST_GREY_BRUTE_29, constSpec(
    CreatureTypeId.ALIEN, 800.0, 2.5, 450.0, [0.8, 0.8, 0.8, 1.0], 70.0, 20.0,
  )],
  [SpawnId.ALIEN_CONST_GREY_FAST_2A, constSpec(
    CreatureTypeId.ALIEN, 50.0, 3.1, 300.0, [0.3, 0.3, 0.3, 1.0], 60.0, 8.0,
  )],
  [SpawnId.ALIEN_CONST_RED_FAST_2B, constSpec(
    CreatureTypeId.ALIEN, 30.0, 3.6, 450.0, [1.0, 0.3, 0.3, 1.0], 35.0, 20.0,
  )],
  [SpawnId.ALIEN_CONST_RED_BOSS_2C, constSpec(
    CreatureTypeId.ALIEN, 3800.0, 2.0, 1500.0, [0.85, 0.2, 0.2, 1.0], 80.0, 40.0,
  )],
  [SpawnId.ALIEN_CONST_CYAN_AI2_2D, constSpec(
    CreatureTypeId.ALIEN, 45.0, 3.1, 200.0, [0.0, 0.9, 0.8, 1.0], 38.0, 3.0,
    0 as CreatureFlags, CreatureAiMode.CHASE_PLAYER,
  )],
  [SpawnId.LIZARD_CONST_GREY_2F, constSpec(
    CreatureTypeId.LIZARD, 20.0, 2.5, 150.0, [0.8, 0.8, 0.8, 1.0], 45.0, 4.0,
  )],
  [SpawnId.LIZARD_CONST_YELLOW_BOSS_30, constSpec(
    CreatureTypeId.LIZARD, 1000.0, 2.0, 400.0, [0.9, 0.8, 0.1, 1.0], 65.0, 10.0,
  )],
  [SpawnId.SPIDER_SP1_CONST_SHOCK_BOSS_3A, constSpec(
    CreatureTypeId.SPIDER_SP1, 4500.0, 2.0, 4500.0, [1.0, 1.0, 1.0, 1.0], 64.0, 50.0,
    CreatureFlags.RANGED_ATTACK_SHOCK,
    CreatureAiMode.ORBIT_PLAYER,
    0.9, null, 9,
  )],
  [SpawnId.SPIDER_SP1_CONST_RED_BOSS_3B, constSpec(
    CreatureTypeId.SPIDER_SP1, 1200.0, 2.0, 4000.0, [0.9, 0.0, 0.0, 1.0], 70.0, 20.0,
  )],
  [SpawnId.SPIDER_SP1_CONST_RANGED_VARIANT_3C, constSpec(
    CreatureTypeId.SPIDER_SP1, 200.0, 2.0, 200.0, [0.9, 0.1, 0.1, 1.0], 40.0, 20.0,
    CreatureFlags.RANGED_ATTACK_VARIANT,
    CreatureAiMode.CHASE_PLAYER,
    0.4, null, 26,
  )],
  [SpawnId.SPIDER_SP1_CONST_WHITE_FAST_3E, constSpec(
    CreatureTypeId.SPIDER_SP1, 1000.0, 2.8, 500.0, [1.0, 1.0, 1.0, 1.0], 64.0, 40.0,
  )],
  [SpawnId.SPIDER_SP1_CONST_BROWN_SMALL_3F, constSpec(
    CreatureTypeId.SPIDER_SP1, 200.0, 2.3, 210.0, [0.7, 0.4, 0.1, 1.0], 35.0, 20.0,
  )],
  [SpawnId.SPIDER_SP1_CONST_BLUE_40, constSpec(
    CreatureTypeId.SPIDER_SP1, 70.0, 2.2, 160.0, [0.5, 0.6, 0.9, 1.0], 45.0, 5.0,
  )],
  [SpawnId.ZOMBIE_CONST_GREY_42, constSpec(
    CreatureTypeId.ZOMBIE, 200.0, 1.7, 160.0, [0.9, 0.9, 0.9, 1.0], 45.0, 15.0,
  )],
  [SpawnId.ZOMBIE_CONST_GREEN_BRUTE_43, constSpec(
    CreatureTypeId.ZOMBIE, 2000.0, 2.1, 460.0, [0.2, 0.6, 0.1, 1.0], 70.0, 15.0,
  )],
]);


export const GRID_FORMATIONS: Map<SpawnId, GridFormationSpec> = new Map([
  [SpawnId.FORMATION_GRID_ALIEN_GREEN_14, {
    parent: constSpec(
      CreatureTypeId.ALIEN, 1500.0, 2.0, 600.0, [0.7, 0.8, 0.31, 1.0], 50.0, 40.0,
      0 as CreatureFlags, CreatureAiMode.CHASE_PLAYER,
    ),
    childAiMode: CreatureAiMode.FOLLOW_LINK_TETHERED,
    childSpec: childSpec(
      CreatureTypeId.ALIEN, 40.0, 2.0, 60.0, 50.0, 4.0, [0.4, 0.7, 0.11, 1.0],
    ),
    xRange: rangeArray(0, -576, -64),
    yRange: rangeArray(128, 257, 16),
    applyFallback: true,
    setParentMaxHealth: true,
  }],
  [SpawnId.FORMATION_GRID_ALIEN_WHITE_15, {
    parent: constSpec(
      CreatureTypeId.ALIEN, 1500.0, 2.0, 600.0, [1.0, 1.0, 1.0, 1.0], 60.0, 40.0,
      0 as CreatureFlags, CreatureAiMode.CHASE_PLAYER,
    ),
    childAiMode: CreatureAiMode.LINK_GUARD,
    childSpec: childSpec(
      CreatureTypeId.ALIEN, 40.0, 2.0, 60.0, 50.0, 4.0, [0.4, 0.7, 0.11, 1.0],
    ),
    xRange: rangeArray(0, -576, -64),
    yRange: rangeArray(128, 257, 16),
    applyFallback: true,
    setParentMaxHealth: true,
  }],
  [SpawnId.FORMATION_GRID_LIZARD_WHITE_16, {
    parent: constSpec(
      CreatureTypeId.LIZARD, 1500.0, 2.0, 600.0, [1.0, 1.0, 1.0, 1.0], 64.0, 40.0,
      0 as CreatureFlags, CreatureAiMode.CHASE_PLAYER,
    ),
    childAiMode: CreatureAiMode.LINK_GUARD,
    childSpec: childSpec(
      CreatureTypeId.LIZARD, 40.0, 2.0, 60.0, 60.0, 4.0, [0.4, 0.7, 0.11, 1.0],
    ),
    xRange: rangeArray(0, -576, -64),
    yRange: rangeArray(128, 257, 16),
    applyFallback: true,
    setParentMaxHealth: true,
  }],
  [SpawnId.FORMATION_GRID_SPIDER_SP1_WHITE_17, {
    parent: constSpec(
      CreatureTypeId.SPIDER_SP1, 1500.0, 2.0, 600.0, [1.0, 1.0, 1.0, 1.0], 60.0, 40.0,
      0 as CreatureFlags, CreatureAiMode.CHASE_PLAYER,
    ),
    childAiMode: CreatureAiMode.LINK_GUARD,
    childSpec: childSpec(
      CreatureTypeId.SPIDER_SP1, 40.0, 2.0, 60.0, 50.0, 4.0, [0.4, 0.7, 0.11, 1.0],
    ),
    xRange: rangeArray(0, -576, -64),
    yRange: rangeArray(128, 257, 16),
    applyFallback: true,
    setParentMaxHealth: true,
  }],
  [SpawnId.FORMATION_GRID_ALIEN_BRONZE_18, {
    parent: constSpec(
      CreatureTypeId.ALIEN, 500.0, 2.0, 600.0, [0.7, 0.8, 0.31, 1.0], 40.0, 40.0,
      0 as CreatureFlags, CreatureAiMode.CHASE_PLAYER,
    ),
    childAiMode: CreatureAiMode.FOLLOW_LINK,
    childSpec: childSpec(
      CreatureTypeId.ALIEN, 260.0, 3.8, 60.0, 50.0, 35.0, [0.7125, 0.4125, 0.2775, 0.6],
    ),
    xRange: rangeArray(0, -576, -64),
    yRange: rangeArray(128, 257, 16),
    applyFallback: false,
    setParentMaxHealth: true,
  }],
]);


export const RING_FORMATIONS: Map<SpawnId, RingFormationSpec> = new Map([
  [SpawnId.FORMATION_RING_ALIEN_8_12, {
    parent: constSpec(
      CreatureTypeId.ALIEN, 200.0, 2.2, 600.0, [0.65, 0.85, 0.97, 1.0], 55.0, 14.0,
    ),
    childAiMode: CreatureAiMode.FOLLOW_LINK,
    childSpec: childSpec(
      CreatureTypeId.ALIEN, 40.0, 2.4, 60.0, 50.0, 4.0, [0.32, 0.588, 0.426, 1.0],
    ),
    count: 8,
    angleStep: Math.PI / 4.0,
    radius: 100.0,
    applyFallback: false,
    setPosition: false,
    setParentMaxHealth: true,
  }],
  [SpawnId.FORMATION_RING_ALIEN_5_19, {
    parent: constSpec(
      CreatureTypeId.ALIEN, 50.0, 3.8, 300.0, [0.95, 0.55, 0.37, 1.0], 55.0, 40.0,
    ),
    childAiMode: CreatureAiMode.FOLLOW_LINK_TETHERED,
    childSpec: childSpec(
      CreatureTypeId.ALIEN, 220.0, 3.8, 60.0, 50.0, 35.0, [0.7125, 0.4125, 0.2775, 0.6],
    ),
    count: 5,
    angleStep: Math.PI * 2.0 / 5.0,
    radius: 110.0,
    applyFallback: false,
    setPosition: true,
    setParentMaxHealth: true,
  }],
]);


// Unused in WebGL port: debug/CLI display only
export function spawnIdLabel(spawnId: SpawnId): string {
  const entry = SPAWN_ID_TO_TEMPLATE.get(spawnId);
  if (entry === undefined || entry.creature === null) {
    return 'unknown';
  }
  return entry.creature;
}


export interface SpawnEnv {
  readonly terrainWidth: number;
  readonly terrainHeight: number;
  readonly demoModeActive: boolean;
  readonly hardcore: boolean;
  readonly questFailRetryCount: number;
}


export interface BurstEffect {
  readonly pos: Vec2;
  readonly count: number;
}


export class CreatureInit {
  originTemplateId: number;
  pos: Vec2;
  heading: number | null;
  phaseSeed: number;
  typeId: CreatureTypeId | null = null;
  flags: CreatureFlags = 0 as CreatureFlags;
  aiMode: number = CreatureAiMode.ORBIT_PLAYER;
  health: number | null = null;
  maxHealth: number | null = null;
  moveSpeed: number | null = null;
  rewardValue: number | null = null;
  size: number | null = null;
  contactDamage: number | null = null;
  tint: Tint | null = null;
  orbitAngle: number | null = null;
  orbitRadius: number | null = null;
  rangedProjectileType: number | null = null;
  aiLinkParent: number | null = null;
  aiTimer: number | null = null;
  targetOffset: Vec2 | null = null;
  spawnSlot: number | null = null;
  bonusId: BonusId | null = null;
  bonusDurationOverride: number | null = null;

  constructor(originTemplateId: number, pos: Vec2, heading: number | null, phaseSeed: number) {
    this.originTemplateId = originTemplateId;
    this.pos = pos;
    this.heading = heading;
    this.phaseSeed = phaseSeed;
  }
}


export class SpawnSlotInit {
  ownerCreature: number;
  timer: number;
  count: number;
  limit: number;
  interval: number;
  childTemplateId: SpawnId;

  constructor(
    ownerCreature: number,
    timer: number,
    count: number,
    limit: number,
    interval: number,
    childTemplateId: SpawnId,
  ) {
    this.ownerCreature = ownerCreature;
    this.timer = timer;
    this.count = count;
    this.limit = limit;
    this.interval = interval;
    this.childTemplateId = childTemplateId;
  }
}


export interface SpawnPlan {
  readonly creatures: readonly CreatureInit[];
  readonly spawnSlots: readonly SpawnSlotInit[];
  readonly effects: readonly BurstEffect[];
  readonly primary: number;
}


function addSpawnSlot(
  spawnSlots: SpawnSlotInit[],
  opts: {
    ownerCreature: number;
    timer: number;
    limit: number;
    interval: number;
    childTemplateId: SpawnId;
  },
): number {
  const slotIdx = spawnSlots.length;
  spawnSlots.push(new SpawnSlotInit(opts.ownerCreature, opts.timer, 0, opts.limit, opts.interval, opts.childTemplateId));
  return slotIdx;
}


function applyConstantTemplate(c: CreatureInit, spec: ConstantSpawnSpec): void {
  c.typeId = spec.typeId;
  c.flags = spec.flags;
  c.aiMode = spec.aiMode;
  c.health = spec.health;
  c.moveSpeed = spec.moveSpeed;
  c.rewardValue = spec.rewardValue;
  applyTint(c, spec.tint);
  c.size = spec.size;
  c.contactDamage = spec.contactDamage;
  if (spec.orbitAngle !== null) {
    c.orbitAngle = spec.orbitAngle;
  }
  if (spec.orbitRadius !== null) {
    c.orbitRadius = spec.orbitRadius;
  }
  if (spec.rangedProjectileType !== null) {
    c.rangedProjectileType = spec.rangedProjectileType;
  }
  if (spec.bonusId !== null) {
    c.bonusId = spec.bonusId;
  }
  if (spec.bonusDurationOverride !== null) {
    c.bonusDurationOverride = spec.bonusDurationOverride;
  }
}


function applyTint(c: CreatureInit, tint: TintRGBA): void {
  c.tint = tint;
}


export function resolveTint(tint: Tint | null): TintRGBA {
  if (tint === null) {
    return [1.0, 1.0, 1.0, 1.0];
  }
  const [tintR, tintG, tintB, tintA] = tint;
  return [
    tintR === null ? 1.0 : tintR,
    tintG === null ? 1.0 : tintG,
    tintB === null ? 1.0 : tintB,
    tintA === null ? 1.0 : tintA,
  ];
}


function applyChildSpec(child: CreatureInit, spec: FormationChildSpec): void {
  child.typeId = spec.typeId;
  child.health = spec.health;
  child.maxHealth = spec.maxHealth !== null ? spec.maxHealth : spec.health;
  child.moveSpeed = spec.moveSpeed;
  child.rewardValue = spec.rewardValue;
  child.size = spec.size;
  child.contactDamage = spec.contactDamage;
  applyTint(child, spec.tint);
  if (spec.orbitAngle !== null) {
    child.orbitAngle = spec.orbitAngle;
  }
  if (spec.orbitRadius !== null) {
    child.orbitRadius = spec.orbitRadius;
  }
}


function applySizeHealthReward(
  c: CreatureInit,
  size: number,
  opts: {
    healthScale: number;
    healthAdd: number;
    rewardAdd?: number;
  },
): void {
  const rewardAdd = opts.rewardAdd ?? 50.0;
  c.size = size;
  c.health = size * opts.healthScale + opts.healthAdd;
  c.rewardValue = size + size + rewardAdd;
}


function applySizeHealth(c: CreatureInit, size: number, opts: { healthScale: number; healthAdd: number }): void {
  c.size = size;
  c.health = size * opts.healthScale + opts.healthAdd;
}


function applySizeMoveSpeed(c: CreatureInit, size: number, scale: number, base: number): void {
  c.moveSpeed = size * scale + base;
}


function spawnRingChildren(
  creatures: CreatureInit[],
  templateId: SpawnId,
  pos: Vec2,
  rng: CrandLike,
  opts: {
    count: number;
    angleStep: number;
    radius: number;
    aiMode: number;
    childSpec: FormationChildSpec;
    linkParent?: number;
    setPosition?: boolean;
    headingOverride?: number | null;
  },
): number {
  const linkParent = opts.linkParent ?? 0;
  const setPosition = opts.setPosition ?? false;
  const headingOverride = opts.headingOverride ?? null;
  let lastIdx = -1;
  for (let i = 0; i < opts.count; i++) {
    const child = allocCreature(templateId, pos, rng);
    child.aiMode = opts.aiMode;
    child.aiLinkParent = linkParent;
    const angle = i * opts.angleStep;
    child.targetOffset = Vec2.fromAngle(angle).mul(opts.radius);
    if (setPosition) {
      child.pos = pos.add(child.targetOffset ?? new Vec2());
    }
    if (headingOverride !== null) {
      child.heading = headingOverride;
    }
    applyChildSpec(child, opts.childSpec);
    creatures.push(child);
    lastIdx = creatures.length - 1;
  }
  return lastIdx;
}


function spawnGridChildren(
  creatures: CreatureInit[],
  templateId: SpawnId,
  pos: Vec2,
  rng: CrandLike,
  opts: {
    xRange: readonly number[];
    yRange: readonly number[];
    aiMode: number;
    childSpec: FormationChildSpec;
    linkParent?: number;
  },
): number {
  const linkParent = opts.linkParent ?? 0;
  let lastIdx = -1;
  for (const xOffset of opts.xRange) {
    for (const yOffset of opts.yRange) {
      const child = allocCreature(templateId, pos, rng);
      child.aiMode = opts.aiMode;
      child.aiLinkParent = linkParent;
      child.targetOffset = new Vec2(xOffset, yOffset);
      child.pos = new Vec2(pos.x + xOffset, pos.y + yOffset);
      applyChildSpec(child, opts.childSpec);
      creatures.push(child);
      lastIdx = creatures.length - 1;
    }
  }
  return lastIdx;
}


function spawnChainChildren(
  creatures: CreatureInit[],
  templateId: SpawnId,
  pos: Vec2,
  rng: CrandLike,
  opts: {
    count: number;
    aiMode: number;
    childSpec: FormationChildSpec;
    setupChild: (child: CreatureInit, idx: number) => void;
    linkParentStart?: number;
  },
): number {
  const linkParentStart = opts.linkParentStart ?? 0;
  let chainPrev = linkParentStart;
  for (let idx = 0; idx < opts.count; idx++) {
    const child = allocCreature(templateId, pos, rng);
    child.aiMode = opts.aiMode;
    child.aiLinkParent = chainPrev;
    opts.setupChild(child, idx);
    applyChildSpec(child, opts.childSpec);
    creatures.push(child);
    chainPrev = creatures.length - 1;
  }
  return chainPrev;
}


class PlanBuilder {
  templateId: SpawnId;
  pos: Vec2;
  rng: CrandLike;
  env: SpawnEnv;
  creatures: CreatureInit[];
  spawnSlots: SpawnSlotInit[];
  effects: BurstEffect[];
  primary: number = 0;

  constructor(
    templateId: SpawnId,
    pos: Vec2,
    rng: CrandLike,
    env: SpawnEnv,
    creatures: CreatureInit[],
    spawnSlots: SpawnSlotInit[],
    effects: BurstEffect[],
    primary: number,
  ) {
    this.templateId = templateId;
    this.pos = pos;
    this.rng = rng;
    this.env = env;
    this.creatures = creatures;
    this.spawnSlots = spawnSlots;
    this.effects = effects;
    this.primary = primary;
  }

  static start(
    templateId: SpawnId,
    pos: Vec2,
    heading: number,
    rng: CrandLike,
    env: SpawnEnv,
  ): [PlanBuilder, number] {
    const creatures: CreatureInit[] = [allocCreature(templateId, pos, rng)];
    const spawnSlots: SpawnSlotInit[] = [];
    const effects: BurstEffect[] = [];

    let finalHeading = heading;
    if (finalHeading === RANDOM_HEADING_SENTINEL) {
      finalHeading = (rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_RANDOM_HEADING }) % 628) * 0.01;
    }

    creatures[0].heading = (rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_BASE_HEADING }) % 314) * 0.01;

    return [
      new PlanBuilder(templateId, pos, rng, env, creatures, spawnSlots, effects, 0),
      finalHeading,
    ];
  }

  get base(): CreatureInit {
    return this.creatures[0];
  }

  addSlot(opts: { owner: number; timer: number; limit: number; interval: number; child: SpawnId }): number {
    return addSpawnSlot(this.spawnSlots, { ownerCreature: opts.owner, timer: opts.timer, limit: opts.limit, interval: opts.interval, childTemplateId: opts.child });
  }

  ringChildren(
    count: number,
    angleStep: number,
    radius: number,
    aiMode: number,
    spec: FormationChildSpec,
    linkParent: number = 0,
    setPosition: boolean = false,
    headingOverride: number | null = null,
  ): number {
    return spawnRingChildren(
      this.creatures, this.templateId, this.pos, this.rng,
      { count, angleStep, radius, aiMode, childSpec: spec, linkParent, setPosition, headingOverride },
    );
  }

  gridChildren(
    xRange: readonly number[],
    yRange: readonly number[],
    aiMode: number,
    spec: FormationChildSpec,
    linkParent: number = 0,
  ): number {
    return spawnGridChildren(
      this.creatures, this.templateId, this.pos, this.rng,
      { xRange, yRange, aiMode, childSpec: spec, linkParent },
    );
  }

  chainChildren(
    count: number,
    aiMode: number,
    spec: FormationChildSpec,
    setupChild: (child: CreatureInit, idx: number) => void,
    linkParentStart: number = 0,
  ): number {
    return spawnChainChildren(
      this.creatures, this.templateId, this.pos, this.rng,
      { count, aiMode, childSpec: spec, setupChild, linkParentStart },
    );
  }

  finish(finalHeading: number): SpawnPlan {
    applyTail(
      this.templateId,
      this.creatures,
      this.spawnSlots,
      this.effects,
      this.primary,
      finalHeading,
      this.env,
    );
    return {
      creatures: this.creatures.slice(),
      spawnSlots: this.spawnSlots.slice(),
      effects: this.effects.slice(),
      primary: this.primary,
    };
  }
}


type TemplateFn = (ctx: PlanBuilder) => void;
const TEMPLATE_BUILDERS: Map<SpawnId, TemplateFn> = new Map();

function registerTemplate(templateIds: SpawnId[], fn: TemplateFn): void {
  for (const templateId of templateIds) {
    TEMPLATE_BUILDERS.set(templateId, fn);
  }
}


export function tickSpawnSlot(slot: SpawnSlotInit, frameDt: number): SpawnId | null {
  const timer = f32(f32(slot.timer));
  const interval = f32(f32(slot.interval));
  const dt = f32(f32(frameDt));
  const newTimer = f32(timer - dt);
  slot.timer = newTimer;
  if (slot.timer < 0.0) {
    slot.timer = f32(f32(slot.timer) + interval);
    if (slot.count < slot.limit) {
      slot.count += 1;
      return slot.childTemplateId;
    }
  }
  return null;
}


function allocCreature(
  templateId: number,
  pos: Vec2,
  rng: CrandLike,
): CreatureInit {
  const phaseSeed = rng.rand({ caller: RngCallerStatic.CREATURE_ALLOC_SLOT_PHASE_SEED }) & 0x17F;
  return new CreatureInit(templateId, pos, null, phaseSeed);
}


function clamp01(value: number): number {
  if (value < 0.0) return 0.0;
  if (1.0 < value) return 1.0;
  return value;
}


export interface SurvivalSpawnPosCallers {
  readonly edge: RngCallerStatic;
  readonly topX: RngCallerStatic;
  readonly bottomX: RngCallerStatic;
  readonly leftY: RngCallerStatic;
  readonly rightY: RngCallerStatic;
}


export const SURVIVAL_UPDATE_EXTRA_SPAWN_POS_CALLERS: SurvivalSpawnPosCallers = {
  edge: RngCallerStatic.SURVIVAL_UPDATE_EXTRA_SPAWN_EDGE,
  topX: RngCallerStatic.SURVIVAL_UPDATE_EXTRA_SPAWN_TOP_X,
  bottomX: RngCallerStatic.SURVIVAL_UPDATE_EXTRA_SPAWN_BOTTOM_X,
  leftY: RngCallerStatic.SURVIVAL_UPDATE_EXTRA_SPAWN_LEFT_Y,
  rightY: RngCallerStatic.SURVIVAL_UPDATE_EXTRA_SPAWN_RIGHT_Y,
};

export const SURVIVAL_UPDATE_MAIN_SPAWN_POS_CALLERS: SurvivalSpawnPosCallers = {
  edge: RngCallerStatic.SURVIVAL_UPDATE_MAIN_SPAWN_EDGE,
  topX: RngCallerStatic.SURVIVAL_UPDATE_MAIN_SPAWN_TOP_X,
  bottomX: RngCallerStatic.SURVIVAL_UPDATE_MAIN_SPAWN_BOTTOM_X,
  leftY: RngCallerStatic.SURVIVAL_UPDATE_MAIN_SPAWN_LEFT_Y,
  rightY: RngCallerStatic.SURVIVAL_UPDATE_MAIN_SPAWN_RIGHT_Y,
};


export function buildSurvivalSpawnCreature(pos: Vec2, rng: CrandLike, opts: { playerExperience: number }): CreatureInit {
  const xp = int(opts.playerExperience);

  const c = allocCreature(-1, pos, rng);
  c.aiMode = CreatureAiMode.ORBIT_PLAYER;

  const r10 = rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_TYPE_ROLL }) % 10;

  let typeId: number;
  if (xp < 12000) {
    typeId = r10 < 9 ? 2 : 3;
  } else if (xp < 25000) {
    typeId = r10 < 4 ? 0 : 3;
    if (8 < r10) {
      typeId = 2;
    }
  } else if (xp < 42000) {
    if (r10 < 5) {
      typeId = 2;
    } else {
      typeId = (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_PARITY_PICK }) & 1) + 3;
    }
  } else if (xp < 50000) {
    typeId = 2;
  } else if (xp < 90000) {
    typeId = 4;
  } else {
    if (109999 < xp) {
      if (r10 < 6) {
        typeId = 2;
      } else if (r10 < 9) {
        typeId = 4;
      } else {
        typeId = 0;
      }
    } else {
      typeId = 0;
    }
  }

  if ((rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_RARE_OVERRIDE }) & 0x1F) === 2) {
    typeId = 3;
  }

  c.typeId = typeId as CreatureTypeId;

  c.size = (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_SIZE }) % 20 + 44);

  c.heading = f32(f32(rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_HEADING }) % 314) * f32(0.01));

  let moveSpeed = f32(f32(f32((xp / 4000) | 0) * f32(0.045)) + f32(0.9));
  if (c.typeId === CreatureTypeId.SPIDER_SP1) {
    c.flags = (c.flags | CreatureFlags.AI7_LINK_TIMER) as CreatureFlags;
    moveSpeed = f32(f32(moveSpeed) * f32(1.3));
  }

  const rHealth = rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_HEALTH });
  const healthScaled = f32(f32(xp) * f32(0.00125));
  const healthRand = f32(rHealth & 0xF);
  let health = f32(f32(healthScaled + healthRand) + f32(52.0));

  if (c.typeId === CreatureTypeId.ZOMBIE) {
    moveSpeed = f32(f32(moveSpeed) * f32(0.6));
    if (moveSpeed < 1.3) {
      moveSpeed = f32(1.3);
    }
    health = f32(f32(health) * f32(1.5));
  }

  if (moveSpeed > 3.5) {
    moveSpeed = f32(3.5);
  }

  c.moveSpeed = moveSpeed;
  c.health = health;
  c.rewardValue = 0.0;

  let tintR: number;
  let tintG: number;
  let tintB: number;
  const tintA = 1.0;
  if (xp < 50_000) {
    tintR = 1.0 - 1.0 / (((xp / 1000) | 0) + 10.0);
    tintG = (
      (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_LOW_TINT_G }) % 10) * 0.01
      + 0.9
      - 1.0 / (((xp / 10000) | 0) + 10.0)
    );
    tintB = (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_LOW_TINT_B }) % 10) * 0.01 + 0.7;
  } else if (xp < 100_000) {
    tintR = 0.9 - 1.0 / (((xp / 1000) | 0) + 10.0);
    tintG = (
      (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_MID_TINT_G }) % 10) * 0.01
      + 0.8
      - 1.0 / (((xp / 10000) | 0) + 10.0)
    );
    tintB = (
      (xp - 50_000) * 6e-06
      + (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_MID_TINT_B }) % 10) * 0.01
      + 0.7
    );
  } else {
    tintR = 1.0 - 1.0 / (((xp / 1000) | 0) + 10.0);
    tintG = (
      (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_HIGH_TINT_G }) % 10) * 0.01
      + 0.9
      - 1.0 / (((xp / 10000) | 0) + 10.0)
    );
    tintB = (
      (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_HIGH_TINT_B }) % 10) * 0.01
      + 1.0
      - (xp - 100_000) * 3e-06
    );
    if (tintB < 0.5) {
      tintB = 0.5;
    }
  }

  c.tint = [tintR, tintG, tintB, tintA];

  c.contactDamage = (c.size ?? 0.0) * (2.0 / 21.0);

  c.rewardValue = (
    (c.health ?? 0.0) * 0.4
    + (c.contactDamage ?? 0.0) * 0.8
    + moveSpeed * 5.0
    + (rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_REWARD_BONUS }) % 10 + 10)
  );

  let r = rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_RARE_RED });
  if (r % 180 < 2) {
    applyTint(c, [0.9, 0.4, 0.4, 1.0]);
    c.health = 65.0;
    c.rewardValue = 320.0;
  } else {
    r = rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_RARE_GREEN });
    if (r % 240 < 2) {
      applyTint(c, [0.4, 0.9, 0.4, 1.0]);
      c.health = 85.0;
      c.rewardValue = 420.0;
    } else {
      r = rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_RARE_BLUE });
      if (r % 360 < 2) {
        applyTint(c, [0.4, 0.4, 0.9, 1.0]);
        c.health = 125.0;
        c.rewardValue = 520.0;
      }
    }
  }

  r = rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_RARE_PURPLE });
  if (r % 1320 < 4) {
    applyTint(c, [0.84, 0.24, 0.89, 1.0]);
    c.size = 80.0;
    c.rewardValue = 600.0;
    c.health = (c.health ?? 0.0) + 230.0;
  } else {
    r = rng.rand({ caller: RngCallerStatic.SURVIVAL_SPAWN_CREATURE_RARE_YELLOW });
    if (r % 1620 < 4) {
      applyTint(c, [0.94, 0.84, 0.29, 1.0]);
      c.size = 85.0;
      c.rewardValue = 900.0;
      c.health = (c.health ?? 0.0) + 2230.0;
    }
  }

  if (c.health !== null) {
    c.maxHealth = c.health;
  }
  if (c.rewardValue !== null) {
    c.rewardValue *= 0.8;
  }

  if (c.tint !== null) {
    const [tr, tg, tb, ta] = c.tint;
    c.tint = [
      tr !== null ? clamp01(tr) : null,
      tg !== null ? clamp01(tg) : null,
      tb !== null ? clamp01(tb) : null,
      ta !== null ? clamp01(ta) : null,
    ];
  }

  return c;
}


export function randSurvivalSpawnPos(
  rng: CrandLike,
  opts: {
    terrainWidth: number;
    terrainHeight: number;
    callers: SurvivalSpawnPosCallers;
  },
): Vec2 {
  switch (rng.rand({ caller: opts.callers.edge }) & 3) {
    case 0:
      return new Vec2(rng.rand({ caller: opts.callers.topX }) % opts.terrainWidth, -40.0);
    case 1:
      return new Vec2(rng.rand({ caller: opts.callers.bottomX }) % opts.terrainWidth, opts.terrainHeight + 40.0);
    case 2:
      return new Vec2(-40.0, rng.rand({ caller: opts.callers.leftY }) % opts.terrainHeight);
    default:
      return new Vec2(opts.terrainWidth + 40.0, rng.rand({ caller: opts.callers.rightY }) % opts.terrainHeight);
  }
}


export function tickSurvivalWaveSpawns(
  spawnCooldown: number,
  frameDtMs: number,
  rng: CrandLike,
  opts: {
    playerCount: number;
    survivalElapsedMs: number;
    playerExperience: number;
    terrainWidth: number;
    terrainHeight: number;
  },
): [number, CreatureInit[]] {
  let cooldown = f32(f32(spawnCooldown) - f32(f32(opts.playerCount) * f32(frameDtMs)));
  if (cooldown >= 0.0) {
    return [cooldown, []];
  }

  const spawns: CreatureInit[] = [];
  while (cooldown < 0.0) {
    let intervalMs = 500 - (int(f32(opts.survivalElapsedMs)) / 1800 | 0);
    if (intervalMs < 0) {
      const extra = (1 - intervalMs) >> 1;
      intervalMs += int(extra) * 2;
      for (let i = 0; i < int(extra); i++) {
        const pos = randSurvivalSpawnPos(
          rng, { terrainWidth: opts.terrainWidth, terrainHeight: opts.terrainHeight, callers: SURVIVAL_UPDATE_EXTRA_SPAWN_POS_CALLERS },
        );
        spawns.push(buildSurvivalSpawnCreature(pos, rng, { playerExperience: opts.playerExperience }));
      }
    }

    if (intervalMs < 1) {
      intervalMs = 1;
    }
    cooldown = f32(cooldown + f32(intervalMs));

    const pos = randSurvivalSpawnPos(
      rng, { terrainWidth: opts.terrainWidth, terrainHeight: opts.terrainHeight, callers: SURVIVAL_UPDATE_MAIN_SPAWN_POS_CALLERS },
    );
    spawns.push(buildSurvivalSpawnCreature(pos, rng, { playerExperience: opts.playerExperience }));
  }

  return [cooldown, spawns];
}


export interface SpawnTemplateCall {
  readonly templateId: SpawnId;
  readonly pos: Vec2;
  readonly heading: number;
}


export function advanceSurvivalSpawnStage(stage: number, opts: { playerLevel: number }): [number, SpawnTemplateCall[]] {
  stage = int(stage);
  const level = int(opts.playerLevel);

  const spawns: SpawnTemplateCall[] = [];
  const heading = Math.PI;

  while (true) {
    if (stage === 0) {
      if (level < 5) break;
      stage = 1;
      spawns.push({ templateId: SpawnId.FORMATION_RING_ALIEN_8_12, pos: new Vec2(-164.0, 512.0), heading });
      spawns.push({ templateId: SpawnId.FORMATION_RING_ALIEN_8_12, pos: new Vec2(1188.0, 512.0), heading });
      continue;
    }

    if (stage === 1) {
      if (level < 9) break;
      stage = 2;
      spawns.push({ templateId: SpawnId.ALIEN_CONST_RED_BOSS_2C, pos: new Vec2(1088.0, 512.0), heading });
      continue;
    }

    if (stage === 2) {
      if (level < 11) break;
      stage = 3;
      const step = f32(42.666668);
      for (let i = 0; i < 12; i++) {
        spawns.push({
          templateId: SpawnId.SPIDER_SP2_RANDOM_35,
          pos: new Vec2(1088.0, f32(f32(i) * f32(step) + f32(256.0))),
          heading,
        });
      }
      continue;
    }

    if (stage === 3) {
      if (level < 13) break;
      stage = 4;
      for (let i = 0; i < 4; i++) {
        spawns.push({
          templateId: SpawnId.ALIEN_CONST_RED_FAST_2B,
          pos: new Vec2(1088.0, i * 64.0 + 384.0),
          heading,
        });
      }
      continue;
    }

    if (stage === 4) {
      if (level < 15) break;
      stage = 5;
      for (let i = 0; i < 4; i++) {
        spawns.push({
          templateId: SpawnId.SPIDER_SP1_AI7_TIMER_38,
          pos: new Vec2(1088.0, i * 64.0 + 384.0),
          heading,
        });
      }
      for (let i = 0; i < 4; i++) {
        spawns.push({
          templateId: SpawnId.SPIDER_SP1_AI7_TIMER_38,
          pos: new Vec2(-64.0, i * 64.0 + 384.0),
          heading,
        });
      }
      continue;
    }

    if (stage === 5) {
      if (level < 17) break;
      stage = 6;
      spawns.push({ templateId: SpawnId.SPIDER_SP1_CONST_SHOCK_BOSS_3A, pos: new Vec2(1088.0, 512.0), heading });
      continue;
    }

    if (stage === 6) {
      if (level < 19) break;
      stage = 7;
      spawns.push({ templateId: SpawnId.SPIDER_SP2_SPLITTER_01, pos: new Vec2(640.0, 512.0), heading });
      continue;
    }

    if (stage === 7) {
      if (level < 21) break;
      stage = 8;
      spawns.push({ templateId: SpawnId.SPIDER_SP2_SPLITTER_01, pos: new Vec2(384.0, 256.0), heading });
      spawns.push({ templateId: SpawnId.SPIDER_SP2_SPLITTER_01, pos: new Vec2(640.0, 768.0), heading });
      continue;
    }

    if (stage === 8) {
      if (level < 26) break;
      stage = 9;
      for (let i = 0; i < 4; i++) {
        spawns.push({
          templateId: SpawnId.SPIDER_SP1_CONST_RANGED_VARIANT_3C,
          pos: new Vec2(1088.0, i * 64.0 + 384.0),
          heading,
        });
      }
      for (let i = 0; i < 4; i++) {
        spawns.push({
          templateId: SpawnId.SPIDER_SP1_CONST_RANGED_VARIANT_3C,
          pos: new Vec2(-64.0, i * 64.0 + 384.0),
          heading,
        });
      }
      continue;
    }

    if (stage === 9) {
      if (level <= 31) break;
      stage = 10;
      spawns.push({ templateId: SpawnId.SPIDER_SP1_CONST_SHOCK_BOSS_3A, pos: new Vec2(1088.0, 512.0), heading });
      spawns.push({ templateId: SpawnId.SPIDER_SP1_CONST_SHOCK_BOSS_3A, pos: new Vec2(-64.0, 512.0), heading });
      for (let i = 0; i < 4; i++) {
        spawns.push({
          templateId: SpawnId.SPIDER_SP1_CONST_RANGED_VARIANT_3C,
          pos: new Vec2(i * 64.0 + 384.0, -64.0),
          heading,
        });
      }
      for (let i = 0; i < 4; i++) {
        spawns.push({
          templateId: SpawnId.SPIDER_SP1_CONST_RANGED_VARIANT_3C,
          pos: new Vec2(i * 64.0 + 384.0, 1088.0),
          heading,
        });
      }
      continue;
    }

    break;
  }

  return [stage, spawns];
}


export function buildRushModeSpawnCreature(
  pos: Vec2,
  tintRgba: TintRGBA,
  rng: CrandLike,
  opts: {
    typeId: number;
    survivalElapsedMs: number;
  },
): CreatureInit {
  const elapsedMs = int(opts.survivalElapsedMs);
  const typeId = opts.typeId;

  const c = allocCreature(-1, pos, rng);
  c.typeId = typeId as CreatureTypeId;
  c.aiMode = CreatureAiMode.ORBIT_PLAYER;

  const elapsedF32 = f32(elapsedMs);
  c.health = f32(elapsedF32 * f32(1e-4) + 10.0);
  c.heading = f32(f32(rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_HEADING }) % 314) * f32(0.01));
  c.moveSpeed = f32(elapsedF32 * f32(1e-5) + 2.5);
  c.rewardValue = rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_REWARD }) % 30 + 140;

  c.tint = tintRgba;
  c.contactDamage = 4.0;

  if (c.health !== null) {
    c.maxHealth = c.health;
  }
  c.size = f32(elapsedF32 * f32(1e-5) + 47.0);

  return c;
}


export function tickRushModeSpawns(
  spawnCooldown: number,
  frameDtMs: number,
  rng: CrandLike,
  opts: {
    playerCount: number;
    survivalElapsedMs: number;
    terrainWidth: number;
    terrainHeight: number;
  },
): [number, CreatureInit[]] {
  let cooldown = f32(f32(spawnCooldown) - f32(f32(opts.playerCount) * f32(frameDtMs)));

  const spawns: CreatureInit[] = [];
  while (cooldown < 0.0) {
    cooldown = f32(cooldown + 250.0);

    const t = f32(int(opts.survivalElapsedMs + 1.0));
    const tintR = clamp01(f32(t * f32(1.0 / 120000.0) + 0.3));
    const tintG = clamp01(f32(t * 10000.0 + 0.3));
    const tintB = clamp01(f32(Math.sin(f32(t * f32(1e-4))) + 0.3));
    const tintA = 1.0;
    const tint: TintRGBA = [tintR, tintG, tintB, tintA];

    const elapsedMs = int(opts.survivalElapsedMs);
    const theta = f32(f32(elapsedMs) * f32(0.001));
    const terrainWidthF = f32(opts.terrainWidth);
    const terrainHeightF = f32(opts.terrainHeight);
    const spawnRight = new Vec2(
      f32(terrainWidthF + 64.0),
      f32(terrainHeightF * 0.5 + Math.cos(theta) * 256.0),
    );
    const spawnLeft = new Vec2(
      -64.0,
      f32(terrainHeightF * 0.5 + Math.sin(theta) * 256.0),
    );

    let c = buildRushModeSpawnCreature(spawnRight, tint, rng, { typeId: 2, survivalElapsedMs: elapsedMs });
    c.aiMode = CreatureAiMode.ORBIT_PLAYER_WIDE;
    spawns.push(c);

    c = buildRushModeSpawnCreature(spawnLeft, tint, rng, { typeId: 3, survivalElapsedMs: elapsedMs });
    c.aiMode = CreatureAiMode.ORBIT_PLAYER_WIDE;
    c.flags = (c.flags | CreatureFlags.AI7_LINK_TIMER) as CreatureFlags;
    if (c.moveSpeed !== null) {
      c.moveSpeed = f32(c.moveSpeed * 1.4);
    }
    spawns.push(c);
  }

  return [cooldown, spawns];
}


export function buildTutorialStage3FireSpawns(): SpawnTemplateCall[] {
  const heading = Math.PI;
  return [
    { templateId: SpawnId.ALIEN_CONST_GREEN_24, pos: new Vec2(-164.0, 412.0), heading },
    { templateId: SpawnId.ALIEN_CONST_PALE_GREEN_26, pos: new Vec2(-184.0, 512.0), heading },
    { templateId: SpawnId.ALIEN_CONST_GREEN_24, pos: new Vec2(-154.0, 612.0), heading },
  ];
}


export function buildTutorialStage4ClearSpawns(): SpawnTemplateCall[] {
  const heading = Math.PI;
  return [
    { templateId: SpawnId.ALIEN_CONST_GREEN_24, pos: new Vec2(1188.0, 412.0), heading },
    { templateId: SpawnId.ALIEN_CONST_PALE_GREEN_26, pos: new Vec2(1208.0, 512.0), heading },
    { templateId: SpawnId.ALIEN_CONST_GREEN_24, pos: new Vec2(1178.0, 612.0), heading },
  ];
}


export function buildTutorialStage5RepeatSpawns(repeatSpawnCount: number): SpawnTemplateCall[] {
  const n = int(repeatSpawnCount);
  if (n < 1 || 8 <= n) {
    return [];
  }

  const heading = Math.PI;
  const spawns: SpawnTemplateCall[] = [];

  if ((n & 1) === 0) {
    if (n < 6) {
      spawns.push({ templateId: SpawnId.ALIEN_CONST_WEAPON_BONUS_27, pos: new Vec2(1056.0, 1056.0), heading });
    }
    spawns.push({ templateId: SpawnId.ALIEN_CONST_GREEN_24, pos: new Vec2(1188.0, 1136.0), heading });
    spawns.push({ templateId: SpawnId.ALIEN_CONST_PALE_GREEN_26, pos: new Vec2(1208.0, 512.0), heading });
    spawns.push({ templateId: SpawnId.ALIEN_CONST_GREEN_24, pos: new Vec2(1178.0, 612.0), heading });
    if (n === 4) {
      spawns.push({ templateId: SpawnId.SPIDER_SP1_CONST_BLUE_40, pos: new Vec2(512.0, 1056.0), heading });
    }
    return spawns;
  }

  if (n < 6) {
    spawns.push({ templateId: SpawnId.ALIEN_CONST_WEAPON_BONUS_27, pos: new Vec2(-32.0, 1056.0), heading });
  }
  spawns.push(...buildTutorialStage3FireSpawns());
  return spawns;
}


export function buildTutorialStage6PerksDoneSpawns(): SpawnTemplateCall[] {
  const heading = Math.PI;
  return [
    ...buildTutorialStage3FireSpawns(),
    { templateId: SpawnId.ALIEN_CONST_PURPLE_28, pos: new Vec2(-32.0, -32.0), heading },
    ...buildTutorialStage4ClearSpawns(),
  ];
}


function applyTail(
  templateId: SpawnId,
  planCreatures: CreatureInit[],
  planSpawnSlots: SpawnSlotInit[],
  planEffects: BurstEffect[],
  primaryIdx: number,
  finalHeading: number,
  env: SpawnEnv,
): void {
  const c = planCreatures[primaryIdx];

  if (!env.demoModeActive && 0.0 < c.pos.x && c.pos.x < env.terrainWidth && 0.0 < c.pos.y && c.pos.y < env.terrainHeight) {
    planEffects.push({ pos: c.pos, count: 8 });
  }

  if (c.health !== null) {
    c.maxHealth = c.health;
  }

  if (c.typeId === CreatureTypeId.SPIDER_SP1 && !(
    c.flags & (CreatureFlags.RANGED_ATTACK_SHOCK | CreatureFlags.AI7_LINK_TIMER)
  )) {
    c.flags = (c.flags | CreatureFlags.AI7_LINK_TIMER) as CreatureFlags;
    c.aiLinkParent = null;
    c.spawnSlot = null;
    c.aiTimer = 0;
    if (c.moveSpeed !== null) {
      c.moveSpeed *= 1.2;
    }
  }

  if (templateId === SpawnId.SPIDER_SP1_AI7_TIMER_38 && env.hardcore && c.moveSpeed !== null) {
    c.moveSpeed *= 0.7;
  }

  c.heading = finalHeading;

  const slotIdx = c.spawnSlot;
  const hasSpawnSlot = slotIdx !== null && slotIdx >= 0 && slotIdx < planSpawnSlots.length;

  if (!env.hardcore) {
    if ((c.flags & HAS_SPAWN_SLOT_FLAG) && hasSpawnSlot && slotIdx !== null) {
      planSpawnSlots[slotIdx].interval += 0.2;
    }

    if (env.questFailRetryCount > 0) {
      const d = env.questFailRetryCount;
      if (
        c.rewardValue !== null
        && c.moveSpeed !== null
        && c.contactDamage !== null
        && c.health !== null
      ) {
        if (d === 1) {
          c.rewardValue *= 0.9;
          c.moveSpeed *= 0.95;
          c.contactDamage *= 0.95;
          c.health *= 0.95;
        } else if (d === 2) {
          c.rewardValue *= 0.85;
          c.moveSpeed *= 0.9;
          c.contactDamage *= 0.9;
          c.health *= 0.9;
        } else if (d === 3) {
          c.rewardValue *= 0.85;
          c.moveSpeed *= 0.8;
          c.contactDamage *= 0.8;
          c.health *= 0.8;
        } else if (d === 4) {
          c.rewardValue *= 0.8;
          c.moveSpeed *= 0.7;
          c.contactDamage *= 0.7;
          c.health *= 0.7;
        } else {
          c.rewardValue *= 0.8;
          c.moveSpeed *= 0.6;
          c.contactDamage *= 0.5;
          c.health *= 0.5;
        }
      }

      if (hasSpawnSlot && (c.flags & HAS_SPAWN_SLOT_FLAG) && slotIdx !== null) {
        planSpawnSlots[slotIdx].interval += Math.min(3.0, d * 0.35);
      }
    }
  } else {
    if (c.moveSpeed !== null) {
      c.moveSpeed *= 1.05;
    }
    if (c.contactDamage !== null) {
      c.contactDamage *= 1.4;
    }
    if (c.health !== null) {
      c.health *= 1.2;
    }

    if (hasSpawnSlot && (c.flags & HAS_SPAWN_SLOT_FLAG) && slotIdx !== null) {
      planSpawnSlots[slotIdx].interval = Math.max(
        0.1,
        planSpawnSlots[slotIdx].interval - 0.2,
      );
    }
  }
}


function applyUnhandledCreatureTypeFallback(planCreatures: CreatureInit[], primaryIdx: number): void {
  const c = planCreatures[primaryIdx];
  c.typeId = CreatureTypeId.ALIEN;
  c.health = 20.0;
}


function applyAlienSpawner(ctx: PlanBuilder, spec: AlienSpawnerSpec): void {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ALIEN;
  c.flags = CreatureFlags.ANIM_PING_PONG;
  c.spawnSlot = ctx.addSlot({ owner: 0, timer: spec.timer, limit: spec.limit, interval: spec.interval, child: spec.childTemplateId });
  c.size = spec.size;
  c.health = spec.health;
  c.moveSpeed = spec.moveSpeed;
  c.rewardValue = spec.rewardValue;
  applyTint(c, spec.tint);
  c.contactDamage = 0.0;
}


function applyConstantSpawn(ctx: PlanBuilder, spec: ConstantSpawnSpec): void {
  const c = ctx.base;
  applyConstantTemplate(c, spec);
}


function applyGridFormation(ctx: PlanBuilder, spec: GridFormationSpec): void {
  const parent = ctx.base;
  applyConstantTemplate(parent, spec.parent);
  if (spec.setParentMaxHealth && parent.health !== null) {
    parent.maxHealth = parent.health;
  }
  ctx.primary = ctx.gridChildren(
    spec.xRange,
    spec.yRange,
    spec.childAiMode,
    spec.childSpec,
  );
  if (spec.applyFallback) {
    applyUnhandledCreatureTypeFallback(ctx.creatures, ctx.primary);
  }
}


function applyRingFormation(ctx: PlanBuilder, spec: RingFormationSpec): void {
  const parent = ctx.base;
  applyConstantTemplate(parent, spec.parent);
  if (spec.setParentMaxHealth && parent.health !== null) {
    parent.maxHealth = parent.health;
  }
  ctx.primary = ctx.ringChildren(
    spec.count,
    spec.angleStep,
    spec.radius,
    spec.childAiMode,
    spec.childSpec,
    0,
    spec.setPosition,
  );
  if (spec.applyFallback) {
    applyUnhandledCreatureTypeFallback(ctx.creatures, ctx.primary);
  }
}


// --- Template builders ---

registerTemplate([SpawnId.ZOMBIE_BOSS_SPAWNER_00], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ZOMBIE;
  c.flags = (CreatureFlags.ANIM_PING_PONG | CreatureFlags.ANIM_LONG_STRIP) as CreatureFlags;
  c.spawnSlot = ctx.addSlot({ owner: 0, timer: 1.0, limit: 812, interval: 0.7, child: SpawnId.ZOMBIE_RANDOM_41 });
  c.size = 64.0;
  c.health = 8500.0;
  c.moveSpeed = 1.3;
  c.rewardValue = 6600.0;
  applyTint(c, [0.6, 0.6, 1.0, 0.8]);
  c.contactDamage = 50.0;
});


const BASIC_RANDOM_TYPE_IDS: Map<SpawnId, CreatureTypeId> = new Map([
  [SpawnId.SPIDER_SP1_RANDOM_03, CreatureTypeId.SPIDER_SP1],
  [SpawnId.SPIDER_SP2_RANDOM_05, CreatureTypeId.SPIDER_SP2],
  [SpawnId.ALIEN_RANDOM_06, CreatureTypeId.ALIEN],
]);

const BASIC_RANDOM_SIZE_CALLERS: Map<SpawnId, RngCallerStatic> = new Map([
  [SpawnId.SPIDER_SP1_RANDOM_03, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_03_SIZE],
  [SpawnId.SPIDER_SP2_RANDOM_05, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_05_SIZE],
  [SpawnId.ALIEN_RANDOM_06, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_06_SIZE],
]);

const BASIC_RANDOM_MOVE_SPEED_CALLERS: Map<SpawnId, RngCallerStatic> = new Map([
  [SpawnId.SPIDER_SP1_RANDOM_03, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_03_MOVE_SPEED],
  [SpawnId.SPIDER_SP2_RANDOM_05, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_05_MOVE_SPEED],
  [SpawnId.ALIEN_RANDOM_06, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_06_MOVE_SPEED],
]);

const BASIC_RANDOM_TINT_B_CALLERS: Map<SpawnId, RngCallerStatic> = new Map([
  [SpawnId.SPIDER_SP1_RANDOM_03, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_03_TINT_B],
  [SpawnId.SPIDER_SP2_RANDOM_05, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_05_TINT_B],
  [SpawnId.ALIEN_RANDOM_06, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_06_TINT_B],
]);

const BASIC_RANDOM_CONTACT_DAMAGE_CALLERS: Map<SpawnId, RngCallerStatic> = new Map([
  [SpawnId.SPIDER_SP1_RANDOM_03, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_03_CONTACT_DAMAGE],
  [SpawnId.SPIDER_SP2_RANDOM_05, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_05_CONTACT_DAMAGE],
  [SpawnId.ALIEN_RANDOM_06, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_06_CONTACT_DAMAGE],
]);


registerTemplate(
  [SpawnId.SPIDER_SP1_RANDOM_03, SpawnId.SPIDER_SP2_RANDOM_05, SpawnId.ALIEN_RANDOM_06],
  (ctx: PlanBuilder): void => {
    const c = ctx.base;
    c.typeId = BASIC_RANDOM_TYPE_IDS.get(ctx.templateId)!;
    const size = (ctx.rng.rand({ caller: BASIC_RANDOM_SIZE_CALLERS.get(ctx.templateId)! }) % 15) + 38.0;
    applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 20.0 });
    c.moveSpeed = (ctx.rng.rand({ caller: BASIC_RANDOM_MOVE_SPEED_CALLERS.get(ctx.templateId)! }) % 18) * 0.1 + 1.1;
    const tintB = (ctx.rng.rand({ caller: BASIC_RANDOM_TINT_B_CALLERS.get(ctx.templateId)! }) % 25) * 0.01 + 0.8;
    applyTint(c, [0.6, 0.6, clamp01(tintB), 1.0]);
    c.contactDamage = (ctx.rng.rand({ caller: BASIC_RANDOM_CONTACT_DAMAGE_CALLERS.get(ctx.templateId)! }) % 10) + 4.0;
  },
);


registerTemplate([SpawnId.LIZARD_RANDOM_04], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.LIZARD;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_04_SIZE }) % 15) + 38.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 20.0 });
  applyTint(c, [0.67, 0.67, 1.0, 1.0]);
  c.moveSpeed = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_04_MOVE_SPEED }) % 18)
    * 0.1
    + 1.1
  );
  c.contactDamage = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_04_CONTACT_DAMAGE }) % 10)
    + 4.0
  );
});


registerTemplate([SpawnId.ALIEN_SPAWNER_RING_24_0E], (ctx: PlanBuilder): void => {
  const parent = ctx.base;
  parent.typeId = CreatureTypeId.ALIEN;
  parent.flags = CreatureFlags.ANIM_PING_PONG;
  parent.spawnSlot = ctx.addSlot({ owner: 0, timer: 1.5, limit: 64, interval: 1.05, child: SpawnId.AI1_LIZARD_BLUE_TINT_1C });
  parent.size = 32.0;
  parent.health = 50.0;
  parent.moveSpeed = 2.8;
  parent.rewardValue = 5000.0;
  applyTint(parent, [0.9, 0.8, 0.4, 1.0]);
  parent.contactDamage = 0.0;

  const cSpec = childSpec(
    CreatureTypeId.ALIEN, 40.0, 4.0, 350.0, 35.0, 30.0, [1.0, 0.3, 0.3, 1.0],
  );
  ctx.primary = ctx.ringChildren(
    24,
    Math.PI / 12.0,
    100.0,
    CreatureAiMode.FOLLOW_LINK,
    cSpec,
    0,
    false,
    0.0,
  );
});


registerTemplate([SpawnId.FORMATION_CHAIN_LIZARD_4_11], (ctx: PlanBuilder): void => {
  const parent = ctx.base;
  parent.typeId = CreatureTypeId.LIZARD;
  parent.aiMode = CreatureAiMode.ORBIT_PLAYER_TIGHT;
  applyTint(parent, [0.99, 0.99, 0.21, 1.0]);
  parent.health = 1500.0;
  parent.maxHealth = 1500.0;
  parent.moveSpeed = 2.1;
  parent.rewardValue = 1000.0;
  parent.size = 69.0;
  parent.contactDamage = 150.0;

  const cSpec = childSpec(
    CreatureTypeId.LIZARD, 60.0, 2.4, 60.0, 50.0, 14.0, [0.6, 0.6, 0.31, 1.0],
  );

  const setupChild = (child: CreatureInit, idx: number): void => {
    child.targetOffset = new Vec2(-256.0 + idx * 64.0, -256.0);
    const angle = (2 + idx * 2) * (Math.PI / 8.0);
    child.pos = Vec2.fromAngle(angle).mul(256.0).add(ctx.pos);
  };

  const chainPrev = ctx.chainChildren(4, CreatureAiMode.FOLLOW_LINK, cSpec, setupChild);

  parent.aiLinkParent = chainPrev;
  ctx.primary = chainPrev;
  applyUnhandledCreatureTypeFallback(ctx.creatures, ctx.primary);
});


registerTemplate([SpawnId.FORMATION_CHAIN_ALIEN_10_13], (ctx: PlanBuilder): void => {
  const parent = ctx.base;
  parent.typeId = CreatureTypeId.ALIEN;
  parent.aiMode = CreatureAiMode.ORBIT_LINK;
  parent.pos = ctx.pos.offset({ dx: 256.0 });
  applyTint(parent, [0.6, 0.8, 0.91, 1.0]);
  parent.health = 200.0;
  parent.maxHealth = 200.0;
  parent.moveSpeed = 2.0;
  parent.rewardValue = 600.0;
  parent.size = 40.0;
  parent.contactDamage = 20.0;

  const cSpec = childSpec(
    CreatureTypeId.ALIEN, 60.0, 2.0, 60.0, 50.0, 4.0, [0.4, 0.7, 0.11, 1.0],
    null, Math.PI, 10.0,
  );

  const degreesToRadians = 20.0 * Math.PI / 180.0;
  const setupChild = (child: CreatureInit, idx: number): void => {
    const angleIdx = 2 + idx * 2;
    const angle = angleIdx * degreesToRadians;
    child.pos = Vec2.fromAngle(angle).mul(256.0).add(ctx.pos);
  };

  const chainPrev = ctx.chainChildren(10, CreatureAiMode.ORBIT_LINK, cSpec, setupChild);

  parent.aiLinkParent = chainPrev;
  ctx.primary = chainPrev;
  applyUnhandledCreatureTypeFallback(ctx.creatures, ctx.primary);
});


const AI1_BLUE_TINT_TEMPLATES: Map<SpawnId, [CreatureTypeId, number]> = new Map([
  [SpawnId.AI1_ALIEN_BLUE_TINT_1A, [CreatureTypeId.ALIEN, 50.0]],
  [SpawnId.AI1_SPIDER_SP1_BLUE_TINT_1B, [CreatureTypeId.SPIDER_SP1, 40.0]],
  [SpawnId.AI1_LIZARD_BLUE_TINT_1C, [CreatureTypeId.LIZARD, 50.0]],
]);

const AI1_BLUE_TINT_CALLERS: Map<SpawnId, RngCallerStatic> = new Map([
  [SpawnId.AI1_ALIEN_BLUE_TINT_1A, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_AI1_BLUE_TINT_1A],
  [SpawnId.AI1_SPIDER_SP1_BLUE_TINT_1B, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_AI1_BLUE_TINT_1B],
  [SpawnId.AI1_LIZARD_BLUE_TINT_1C, RngCallerStatic.CREATURE_SPAWN_TEMPLATE_AI1_BLUE_TINT_1C],
]);


registerTemplate(
  [SpawnId.AI1_ALIEN_BLUE_TINT_1A, SpawnId.AI1_SPIDER_SP1_BLUE_TINT_1B, SpawnId.AI1_LIZARD_BLUE_TINT_1C],
  (ctx: PlanBuilder): void => {
    const c = ctx.base;
    c.aiMode = CreatureAiMode.ORBIT_PLAYER_TIGHT;
    c.size = 50.0;
    c.moveSpeed = 2.4;
    c.rewardValue = 125.0;

    const [tid, hp] = AI1_BLUE_TINT_TEMPLATES.get(ctx.templateId)!;
    c.typeId = tid;
    c.health = hp;

    const tint = (ctx.rng.rand({ caller: AI1_BLUE_TINT_CALLERS.get(ctx.templateId)! }) % 40) * 0.01 + 0.5;
    applyTint(c, [tint, tint, 1.0, 1.0]);
    c.contactDamage = 5.0;
  },
);


registerTemplate([SpawnId.ALIEN_RANDOM_1D], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ALIEN;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1D_SIZE }) % 20) + 35.0;
  applySizeHealth(c, size, { healthScale: 8.0 / 7.0, healthAdd: 10.0 });
  c.moveSpeed = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1D_MOVE_SPEED }) % 15) * 0.1 + 1.1;
  c.rewardValue = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1D_REWARD }) % 100) + 50.0;
  applyTint(c, [
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1D_TINT_R }) % 50) * 0.001 + 0.6,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1D_TINT_G }) % 50) * 0.01 + 0.5,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1D_TINT_B }) % 50) * 0.001 + 0.6,
    1.0,
  ]);
  c.contactDamage = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1D_CONTACT_DAMAGE }) % 10) + 4.0;
});


registerTemplate([SpawnId.ALIEN_RANDOM_1E], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ALIEN;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1E_SIZE }) % 30) + 35.0;
  applySizeHealth(c, size, { healthScale: 16.0 / 7.0, healthAdd: 10.0 });
  c.moveSpeed = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1E_MOVE_SPEED }) % 17) * 0.1 + 1.5;
  c.rewardValue = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1E_REWARD }) % 200) + 50.0;
  applyTint(c, [
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1E_TINT_R }) % 50) * 0.001 + 0.6,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1E_TINT_G }) % 50) * 0.001 + 0.6,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1E_TINT_B }) % 50) * 0.01 + 0.5,
    1.0,
  ]);
  c.contactDamage = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1E_CONTACT_DAMAGE }) % 30) + 4.0;
});


registerTemplate([SpawnId.ALIEN_RANDOM_1F], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ALIEN;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1F_SIZE }) % 30) + 45.0;
  applySizeHealth(c, size, { healthScale: 26.0 / 7.0, healthAdd: 30.0 });
  c.moveSpeed = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1F_MOVE_SPEED }) % 21) * 0.1 + 1.6;
  c.rewardValue = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1F_REWARD }) % 200) + 80.0;
  applyTint(c, [
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1F_TINT_R }) % 50) * 0.01 + 0.5,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1F_TINT_G }) % 50) * 0.001 + 0.6,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1F_TINT_B }) % 50) * 0.001 + 0.6,
    1.0,
  ]);
  c.contactDamage = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_1F_CONTACT_DAMAGE }) % 35) + 8.0;
});


registerTemplate([SpawnId.ALIEN_RANDOM_GREEN_20], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ALIEN;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_GREEN_20_SIZE }) % 30) + 40.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 20.0 });
  c.moveSpeed = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_GREEN_20_MOVE_SPEED }) % 18)
    * 0.1 + 1.1
  );
  const tintG = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_GREEN_20_TINT_G }) % 40) * 0.01
    + 0.6
  );
  applyTint(c, [0.3, tintG, 0.3, 1.0]);
  c.contactDamage = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ALIEN_RANDOM_GREEN_20_CONTACT_DAMAGE }) % 10)
    + 4.0
  );
});


registerTemplate([SpawnId.LIZARD_RANDOM_2E], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.LIZARD;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_2E_SIZE }) % 30) + 40.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 20.0 });
  c.moveSpeed = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_2E_MOVE_SPEED }) % 18)
    * 0.1
    + 1.1
  );
  applyTint(c, [
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_2E_TINT_R }) % 40) * 0.01 + 0.6,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_2E_TINT_G }) % 40) * 0.01 + 0.6,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_2E_TINT_B }) % 40) * 0.01 + 0.6,
    1.0,
  ]);
  c.contactDamage = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_2E_CONTACT_DAMAGE }) % 10)
    + 4.0
  );
});


registerTemplate([SpawnId.LIZARD_RANDOM_31], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.LIZARD;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_31_SIZE }) % 30) + 40.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 10.0 });
  c.moveSpeed = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_31_MOVE_SPEED }) % 18) * 0.1 + 1.1;
  const tint = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_LIZARD_RANDOM_31_TINT }) % 30) * 0.01 + 0.6;
  applyTint(c, [tint, tint, 0.38, 1.0]);
  c.contactDamage = size * 0.14 + 4.0;
});


registerTemplate([SpawnId.SPIDER_SP1_RANDOM_32], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP1;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_32_SIZE }) % 25) + 40.0;
  applySizeHealthReward(c, size, { healthScale: 1.0, healthAdd: 10.0 });
  c.moveSpeed = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_32_MOVE_SPEED }) % 17)
    * 0.1 + 1.1
  );
  const tint = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_32_TINT }) % 40) * 0.01 + 0.6;
  applyTint(c, [tint, tint, tint, 1.0]);
  c.contactDamage = size * 0.14 + 4.0;
});


registerTemplate([SpawnId.SPIDER_SP1_RANDOM_RED_33], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP1;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_RED_33_SIZE }) % 15) + 45.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 20.0 });
  c.moveSpeed = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_RED_33_MOVE_SPEED }) % 18)
    * 0.1 + 1.1
  );
  applyTint(c, [
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_RED_33_TINT_R }) % 40) * 0.01 + 0.6,
    0.5,
    0.5,
    1.0,
  ]);
  c.contactDamage = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_RED_33_CONTACT_DAMAGE }) % 10)
    + 4.0
  );
});


registerTemplate([SpawnId.SPIDER_SP1_RANDOM_GREEN_34], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP1;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_GREEN_34_SIZE }) % 20) + 40.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 20.0 });
  c.moveSpeed = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_GREEN_34_MOVE_SPEED }) % 18)
    * 0.1 + 1.1
  );
  applyTint(c, [
    0.5,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_GREEN_34_TINT_G }) % 40) * 0.01 + 0.6,
    0.5,
    1.0,
  ]);
  c.contactDamage = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_GREEN_34_CONTACT_DAMAGE }) % 10)
    + 4.0
  );
});


registerTemplate([SpawnId.SPIDER_SP2_RANDOM_35], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP2;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_35_SIZE }) % 10) + 30.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 20.0 });
  c.moveSpeed = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_35_MOVE_SPEED }) % 18)
    * 0.1 + 1.1
  );
  applyTint(c, [
    0.8,
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_35_TINT_G }) % 20) * 0.01 + 0.8,
    0.8,
    1.0,
  ]);
  c.contactDamage = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANDOM_35_CONTACT_DAMAGE }) % 10)
    + 4.0
  );
});


registerTemplate([SpawnId.ALIEN_AI7_ORBITER_36], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ALIEN;
  c.size = 50.0;
  c.aiMode = CreatureAiMode.HOLD_TIMER;
  c.orbitRadius = 1.5;
  c.health = 10.0;
  c.moveSpeed = 1.8;
  c.rewardValue = 150.0;
  const tintG = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_AI7_ORBITER_TINT_G }) % 5) * 0.01 + 0.65;
  applyTint(c, [0.65, tintG, 0.95, 1.0]);
  c.contactDamage = 40.0;
});


registerTemplate([SpawnId.SPIDER_SP2_RANGED_VARIANT_37], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP2;
  c.flags = CreatureFlags.RANGED_ATTACK_VARIANT;
  c.health = 50.0;
  c.moveSpeed = 3.2;
  c.rewardValue = 433.0;
  applyTint(c, [1.0, 0.75, 0.1, 1.0]);
  c.size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP2_RANGED_VARIANT_37_SIZE }) & 3) + 41;
  c.contactDamage = 10.0;
});


registerTemplate([SpawnId.SPIDER_SP1_AI7_TIMER_38], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP1;
  c.flags = CreatureFlags.AI7_LINK_TIMER;
  c.aiTimer = 0;
  c.health = 50.0;
  c.moveSpeed = 4.8;
  c.rewardValue = 433.0;
  applyTint(c, [1.0, 0.75, 0.1, 1.0]);
  c.size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_AI7_TIMER_38_SIZE }) & 3) + 41;
  c.contactDamage = 10.0;
});


registerTemplate([SpawnId.SPIDER_SP1_AI7_TIMER_WEAK_39], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP1;
  c.flags = CreatureFlags.AI7_LINK_TIMER;
  c.aiTimer = 0;
  c.health = 4.0;
  c.moveSpeed = 4.8;
  c.rewardValue = 50.0;
  applyTint(c, [0.8, 0.65, 0.1, 1.0]);
  c.size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_AI7_TIMER_WEAK_39_SIZE }) % 4) + 26;
  c.contactDamage = 10.0;
});


registerTemplate([SpawnId.SPIDER_SP1_RANDOM_3D], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.SPIDER_SP1;
  c.health = 70.0;
  c.moveSpeed = 2.6;
  c.rewardValue = 120.0;
  const tint = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_3D_TINT }) % 20) * 0.01 + 0.8;
  applyTint(c, [tint, tint, tint, 1.0]);
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_SPIDER_SP1_RANDOM_3D_SIZE }) % 7) + 45;
  c.size = size;
  c.contactDamage = size * 0.22;
});


registerTemplate([SpawnId.ZOMBIE_RANDOM_41], (ctx: PlanBuilder): void => {
  const c = ctx.base;
  c.typeId = CreatureTypeId.ZOMBIE;
  const size = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ZOMBIE_RANDOM_41_SIZE }) % 30) + 40.0;
  applySizeHealthReward(c, size, { healthScale: 8.0 / 7.0, healthAdd: 10.0 });
  applySizeMoveSpeed(c, size, 0.0025, 0.9);
  const tint = (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ZOMBIE_RANDOM_41_TINT }) % 40) * 0.01 + 0.6;
  applyTint(c, [tint, tint, tint, 1.0]);
  c.contactDamage = (
    (ctx.rng.rand({ caller: RngCallerStatic.CREATURE_SPAWN_TEMPLATE_ZOMBIE_RANDOM_41_CONTACT_DAMAGE }) % 10)
    + 4.0
  );
});


export function buildSpawnPlan(
  templateId: SpawnId,
  pos: Vec2,
  heading: number,
  rng: CrandLike,
  env: SpawnEnv,
): SpawnPlan {
  const [ctx, finalHeading] = PlanBuilder.start(templateId, pos, heading, rng, env);

  const builder = TEMPLATE_BUILDERS.get(templateId);
  if (builder) {
    builder(ctx);
  } else {
    const alienSpec = ALIEN_SPAWNER_TEMPLATES.get(templateId);
    if (alienSpec) {
      applyAlienSpawner(ctx, alienSpec);
    } else {
      const gridSpec = GRID_FORMATIONS.get(templateId);
      if (gridSpec) {
        applyGridFormation(ctx, gridSpec);
      } else {
        const ringSpec = RING_FORMATIONS.get(templateId);
        if (ringSpec) {
          applyRingFormation(ctx, ringSpec);
        } else {
          const constSpawnSpec = CONSTANT_SPAWN_TEMPLATES.get(templateId);
          if (constSpawnSpec) {
            applyConstantSpawn(ctx, constSpawnSpec);
          } else {
            throw new UnsupportedSpawnTemplateError(`unsupported spawn template id: 0x${(templateId as number).toString(16)}`);
          }
        }
      }
    }
  }

  return ctx.finish(finalHeading);
}
