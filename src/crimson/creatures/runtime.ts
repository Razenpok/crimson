// Port of crimson/creatures/runtime.py

import { RGBA } from '@grim/color.ts';
import { Vec2 } from '@grim/geom.ts';
import type { CrandLike } from '@grim/rand.ts';
import { Crand } from '@grim/rand.ts';
import { SfxId } from '@grim/sfx-map.ts';

import type { BonusId } from '@crimson/bonuses/ids.ts';
import type { EffectPool, FxQueue, FxQueueRotated } from '@crimson/effects.ts';
import {
  NATIVE_HALF_PI,
  NATIVE_PI,
  NATIVE_TAU,
  NATIVE_TURN_RATE_SCALE,
  f32,
  f32Vec2,
  headingAddPiF32,
  headingToDirectionF32,
} from '@crimson/math-parity.ts';
import { OwnerRef } from '@crimson/owner-ref.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { playerTakeDamage } from '@crimson/player-damage.ts';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import {
  awardExperience,
  awardExperienceFromReward,
  survivalRecordRecentDeath as survivalRecordRecentDeath_,
} from '@crimson/gameplay.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import { ftolMsI32 } from '@crimson/sim/timing.ts';
import { weaponEntryForProjectileTypeId } from '@crimson/weapons.ts';
import { applyFinalRevengeOnPlayerDeath } from '@crimson/perks/impl/final-revenge.ts';
import { creatureAi7TickLinkTimer, creatureAiUpdateTarget } from './ai.ts';
import { CreatureDamageType } from './damage-types.ts';
import { creatureApplyDamageWithLethalFollowup } from './damage.ts';
import {
  CREATURE_LIFECYCLE_ALIVE,
  CreatureLifecyclePhase,
  classifyCreatureLifecycle,
  creatureLifecycleIsAlive,
} from './lifecycle.ts';
import {
  CreatureAiMode,
  CreatureFlags,
  CreatureTypeId,
  HAS_SPAWN_SLOT_FLAG,
  RANDOM_HEADING_SENTINEL,
  type SpawnId,
} from './spawn-ids.ts';
import { GameplayState } from "@crimson/gameplay.ts";

import {
  type SpawnEnv,
  type BurstEffect,
  CreatureInit,
  SpawnSlotInit,
  type SpawnPlan,
  buildSpawnPlan,
  resolveTint,
  tickSpawnSlot,
} from './spawn.ts';

export type { SpawnEnv, BurstEffect, CreatureInit, SpawnSlotInit, SpawnPlan };

export const CREATURE_POOL_SIZE = 0x180;
export const CONTACT_DAMAGE_PERIOD = 0.5;

// Native movement path multiplies by a fixed `30.0` factor (the original
// `creature_speed_scale` constant in the native simulation loop).
const CREATURE_SPEED_SCALE = 30.0;
// Base heading turn rate multiplier (mirrors native `creature_turn_rate_scale`).
const CREATURE_TURN_RATE_SCALE = NATIVE_TURN_RATE_SCALE;

const CREATURE_DEATH_TIMER_DECAY = 28.0;
const CREATURE_CORPSE_FADE_DECAY = 20.0;
const CREATURE_DEATH_SLIDE_SCALE = 9.0;
const _TARGET_REEVAL_PERIOD = 0x46;
const _FLAG_SELF_DAMAGE_TICK = CreatureFlags.SELF_DAMAGE_TICK;
const _FLAG_SELF_DAMAGE_TICK_STRONG = CreatureFlags.SELF_DAMAGE_TICK_STRONG;
const _FLAG_AI7_LINK_TIMER = CreatureFlags.AI7_LINK_TIMER;

const _CREATURE_CONTACT_SFX: Map<CreatureTypeId, [SfxId, SfxId]> = new Map([
  [CreatureTypeId.ZOMBIE, [SfxId.ZOMBIE_ATTACK_01, SfxId.ZOMBIE_ATTACK_02]],
  [CreatureTypeId.LIZARD, [SfxId.LIZARD_ATTACK_01, SfxId.LIZARD_ATTACK_02]],
  [CreatureTypeId.ALIEN, [SfxId.ALIEN_ATTACK_01, SfxId.ALIEN_ATTACK_02]],
  [CreatureTypeId.SPIDER_SP1, [SfxId.SPIDER_ATTACK_01, SfxId.SPIDER_ATTACK_02]],
  [CreatureTypeId.SPIDER_SP2, [SfxId.SPIDER_ATTACK_01, SfxId.SPIDER_ATTACK_02]],
]);

function _wrapAngle(angle: number): number {
  return f32((f32(angle) + NATIVE_PI) % NATIVE_TAU - NATIVE_PI);
}

/** Smoothly approach `target` angle from `current` at the given `rate`,
 *  choosing the shortest arc (direct vs. wrapped).  Mirrors the native
 *  `_angle_approach` helper used by the creature heading update. */
function _angleApproach(current: number, target: number, rate: number, dt: number): number {
  let angle: number = f32(current);
  const targetF: number = f32(target);
  const rateF: number = f32(rate);
  const dtF: number = f32(dt);
  const tau: number = NATIVE_TAU;

  while (angle < 0.0) {
    angle = f32(angle + tau);
  }
  while (tau < angle) {
    angle = f32(angle - tau);
  }

  const direct: number = f32(Math.abs(f32(targetF - angle)));

  let hi = angle;
  if (angle < targetF) hi = targetF;
  let lo = angle;
  if (targetF < angle) lo = targetF;
  const wrapped: number = f32(Math.abs(f32(f32(tau - hi) + lo)));

  let stepScale = wrapped;
  if (direct < wrapped) stepScale = direct;
  if (1.0 < stepScale) stepScale = 1.0;
  stepScale = f32(stepScale);

  const stepDelta: number = f32(f32(dtF * stepScale) * rateF);

  if (direct <= wrapped) {
    if (angle < targetF) {
      return f32(angle + stepDelta);
    }
  } else {
    if (targetF < angle) {
      return f32(angle + stepDelta);
    }
  }
  return f32(angle - stepDelta);
}

// Native movement path computes cos/sin in x87 precision, then multiplies
// dt * move_scale * move_speed * CREATURE_SPEED_SCALE sequentially (each
// intermediate result kept in float locals, not f32-flushed).
function _movementDeltaFromHeadingF32(
  heading: number,
  dt: number,
  moveScale: number,
  moveSpeed: number,
): Vec2 {
  // Native keeps these values in float locals (not f32-flushed between steps).
  const radians = f32(heading) - NATIVE_HALF_PI;

  let vx = Math.cos(radians);
  vx *= dt;
  vx *= moveScale;
  vx *= moveSpeed;
  vx *= CREATURE_SPEED_SCALE;

  let vy = Math.sin(radians);
  vy *= dt;
  vy *= moveScale;
  vy *= moveSpeed;
  vy *= CREATURE_SPEED_SCALE;

  return new Vec2(f32(vx), f32(vy));
}

function _velocityFromDeltaF32(delta: Vec2, dt: number): Vec2 {
  if (dt <= 0.0) return new Vec2();
  const invDt = 1.0 / dt;
  return new Vec2(f32(delta.x * invDt), f32(delta.y * invDt));
}

function _advancePosByDeltaF32(pos: Vec2, delta: Vec2): Vec2 {
  return new Vec2(f32(pos.x + delta.x), f32(pos.y + delta.y));
}

function _ownerToPlayerIndex(owner: OwnerRef): number | null {
  return owner.playerIndex();
}

function _travelBudgetForTypeId(typeId: ProjectileTemplateId): number {
  return weaponEntryForProjectileTypeId(typeId).travelBudget;
}

function survivalRecordRecentDeath(
  state: GameplayState,
  pos: Vec2,
): void {
  survivalRecordRecentDeath_(state, { pos });
}

export class CreatureState {
  active = false;
  typeId: CreatureTypeId = CreatureTypeId.ZOMBIE;

  pos: Vec2 = new Vec2();
  vel: Vec2 = new Vec2();
  heading = 0.0;
  targetHeading = 0.0;
  forceTarget = 0;
  target: Vec2 = new Vec2();
  targetPlayer = 0;
  aiMode: CreatureAiMode = CreatureAiMode.ORBIT_PLAYER;
  flags: CreatureFlags = 0 as CreatureFlags;

  linkIndex = -1;
  targetOffset: Vec2 | null = null;
  orbitAngle = 0.0;
  orbitRadius = 0.0;
  phaseSeed = 0.0;
  moveScale = 1.0;

  hp = 0.0;
  maxHp = 0.0;
  moveSpeed = 1.0;
  contactDamage = 0.0;
  attackCooldown = 0.0;
  rewardValue = 0.0;

  plagueInfected = false;
  collisionTimer: number = CONTACT_DAMAGE_PERIOD;
  // lifecycle_stage encodes the creature's alive/dying/dead phase as a float:
  // positive = alive (CREATURE_LIFECYCLE_ALIVE), decreasing toward zero = dying
  // animation, negative = corpse fade.  The native code uses a single float
  // field that transitions through these ranges.
  lifecycleStage: number = CREATURE_LIFECYCLE_ALIVE;

  size = 50.0;
  animPhase = 0.0;
  hitFlashTimer = 0.0;
  lastHitOwner: OwnerRef = OwnerRef.fromLocalPlayer(0);
  tint: RGBA = new RGBA();

  spawnSlotIndex: number | null = null;
  bonusId: BonusId | null = null;
  bonusDurationOverride: number | null = null;

  clone(): CreatureState {
    const c = new CreatureState();
    c.active = this.active;
    c.typeId = this.typeId;
    c.pos = this.pos;
    c.vel = this.vel;
    c.heading = this.heading;
    c.targetHeading = this.targetHeading;
    c.forceTarget = this.forceTarget;
    c.target = this.target;
    c.targetPlayer = this.targetPlayer;
    c.aiMode = this.aiMode;
    c.flags = this.flags;
    c.linkIndex = this.linkIndex;
    c.targetOffset = this.targetOffset;
    c.orbitAngle = this.orbitAngle;
    c.orbitRadius = this.orbitRadius;
    c.phaseSeed = this.phaseSeed;
    c.moveScale = this.moveScale;
    c.hp = this.hp;
    c.maxHp = this.maxHp;
    c.moveSpeed = this.moveSpeed;
    c.contactDamage = this.contactDamage;
    c.attackCooldown = this.attackCooldown;
    c.rewardValue = this.rewardValue;
    c.plagueInfected = this.plagueInfected;
    c.collisionTimer = this.collisionTimer;
    c.lifecycleStage = this.lifecycleStage;
    c.size = this.size;
    c.animPhase = this.animPhase;
    c.hitFlashTimer = this.hitFlashTimer;
    c.lastHitOwner = this.lastHitOwner;
    c.tint = this.tint;
    c.spawnSlotIndex = this.spawnSlotIndex;
    c.bonusId = this.bonusId;
    c.bonusDurationOverride = this.bonusDurationOverride;
    return c;
  }
}

export interface CreatureDeath {
  readonly index: number;
  readonly pos: Vec2;
  readonly typeId: CreatureTypeId;
  readonly rewardValue: number;
  readonly xpAwarded: number;
  readonly owner: OwnerRef;
}

export interface CreatureUpdateResult {
  readonly deaths: readonly CreatureDeath[];
  readonly spawned: readonly number[];
  readonly sfx: readonly SfxId[];
}

export interface CreatureUpdateOptions {
  readonly state: GameplayState;
  readonly players: PlayerState[];
  readonly rng: CrandLike;
  readonly env: SpawnEnv;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly fxQueue: FxQueue;
  readonly fxQueueRotated: FxQueueRotated;
  readonly detailPreset: number;
  readonly violenceDisabled: number;
}

interface _CreatureInteractionCtx {
  pool: CreaturePool;
  creatureIndex: number;
  creature: CreatureState;
  state: GameplayState;
  players: PlayerState[];
  player: PlayerState;
  dt: number;
  rng: CrandLike;
  detailPreset: number;
  violenceDisabled: number;
  worldWidth: number;
  worldHeight: number;
  fxQueue: FxQueue | null;
  fxQueueRotated: FxQueueRotated | null;
  deaths: CreatureDeath[];
  sfx: SfxId[];
  skipCreature: boolean;
  contactDistSq: number;
}

type _CreatureInteractionStep = (ctx: _CreatureInteractionCtx) => void;

function _creatureInteractionPlaguebearerSpread(ctx: _CreatureInteractionCtx): void {
  if (
    ctx.players.length > 0 &&
    perkActive(ctx.players[0], PerkId.PLAGUEBEARER) &&
    ctx.state.plaguebearerInfectionCount < 0x3C
  ) {
    ctx.pool._plaguebearerSpreadInfection(ctx.creatureIndex);
  }
}

function _creatureInteractionEnergizerEat(ctx: _CreatureInteractionCtx): void {
  const creature = ctx.creature;
  if (ctx.contactDistSq >= 20.0 * 20.0) return;

  creature.pos = creature.pos.sub(creature.vel).clampRect(
    0.0,
    0.0,
    ctx.worldWidth,
    ctx.worldHeight,
  );

  if (ctx.state.bonuses.energizer <= 0.0) return;
  if (creature.maxHp >= 380.0) return;

  ctx.state.effects.spawnBurst({
    pos: creature.pos,
    count: 6,
    rng: ctx.rng,
    detailPreset: ctx.detailPreset,
  });
  ctx.sfx.push(SfxId.UI_BONUS);

  const prevGuard = ctx.state.bonusSpawnGuard;
  ctx.state.bonusSpawnGuard = true;
  creature.lastHitOwner = OwnerRef.fromPlayer(ctx.player.index);
  ctx.deaths.push(
    ctx.pool.handleDeath(
      ctx.creatureIndex,
      {
        state: ctx.state,
        players: ctx.players,
        rng: ctx.rng,
        dt: ctx.dt,
        detailPreset: ctx.detailPreset,
        worldWidth: ctx.worldWidth,
        worldHeight: ctx.worldHeight,
        fxQueue: ctx.fxQueue,
        keepCorpse: false,
      },
    ),
  );
  ctx.state.bonusSpawnGuard = prevGuard;
  ctx.skipCreature = true;
}

function _creatureInteractionContactDamage(ctx: _CreatureInteractionCtx): void {
  const creature = ctx.creature;
  if (!creatureLifecycleIsAlive(creature.lifecycleStage)) return;
  if (creature.size <= 16.0) return;
  if (ctx.state.bonuses.energizer > 0.0) return;

  if (ctx.contactDistSq >= 30.0 * 30.0) return;
  if (ctx.player.health <= 0.0) return;
  if (creature.attackCooldown > 0.0) return;

  const options = _CREATURE_CONTACT_SFX.get(creature.typeId);
  if (options !== undefined) {
    ctx.sfx.push(
      options[ctx.rng.rand({ caller: RngCallerStatic.CREATURE_UPDATE_ALL_CONTACT_SFX }) & 1],
    );
  }

  let mrMeleeKilled = false;
  if (perkActive(ctx.player, PerkId.MR_MELEE)) {
    const onMrMeleeLethal = (deathSfx: SfxId[]): void => {
      ctx.deaths.push(
        ctx.pool.handleDeath(
          ctx.creatureIndex,
          {
            state: ctx.state,
            players: ctx.players,
            rng: ctx.rng,
            dt: ctx.dt,
            detailPreset: ctx.detailPreset,
            worldWidth: ctx.worldWidth,
            worldHeight: ctx.worldHeight,
            fxQueue: ctx.fxQueue,
          },
        ),
      );
      ctx.sfx.push(...deathSfx);
      if (creature.active) {
        ctx.pool._tickDead(
          creature,
          ctx.dt,
          ctx.worldWidth,
          ctx.worldHeight,
          ctx.fxQueueRotated,
          ctx.rng,
          ctx.detailPreset,
          ctx.violenceDisabled,
        );
      }
    };

    mrMeleeKilled = creatureApplyDamageWithLethalFollowup(
      creature,
      {
        damageAmount: 25.0,
        damageType: CreatureDamageType.MELEE,
        impulse: new Vec2(),
        owner: OwnerRef.fromPlayer(ctx.player.index),
        dt: ctx.dt,
        players: ctx.players,
        rng: ctx.rng,
        preserveBugs: ctx.state.preserveBugs,
        effects: ctx.state.effects,
        detailPreset: ctx.detailPreset,
        onLethal: onMrMeleeLethal,
      },
    );
  }

  if (ctx.player.shieldTimer <= 0.0) {
    if (perkActive(ctx.player, PerkId.TOXIC_AVENGER)) {
      creature.flags |=
        CreatureFlags.SELF_DAMAGE_TICK |
        CreatureFlags.SELF_DAMAGE_TICK_STRONG;
    } else if (perkActive(ctx.player, PerkId.VEINS_OF_POISON)) {
      creature.flags |= CreatureFlags.SELF_DAMAGE_TICK;
    }
  }

  const onPlayerLethalFinalRevenge = (): void => {
    applyFinalRevengeOnPlayerDeath({
      state: ctx.state,
      creatures: ctx.pool,
      players: ctx.players,
      player: ctx.player,
      dt: ctx.dt,
      worldSize: Math.max(ctx.worldWidth, ctx.worldHeight),
      detailPreset: ctx.detailPreset,
      fxQueue: ctx.fxQueue,
      deaths: ctx.deaths,
    });
  };

  playerTakeDamage(
    ctx.state,
    ctx.player,
    creature.contactDamage,
    { dt: ctx.dt, players: ctx.players, onLethal: onPlayerLethalFinalRevenge },
  );

  if (ctx.fxQueue !== null) {
    const pushDir = ctx.player.pos.sub(creature.pos).normalized();
    ctx.fxQueue.addRandom({ pos: ctx.player.pos.add(pushDir.mul(3.0)), rng: ctx.rng });
  }

  creature.attackCooldown = creature.attackCooldown + 1.0;

  if (mrMeleeKilled) {
    ctx.skipCreature = true;
  }
}

function _creatureInteractionPlaguebearerContactFlag(ctx: _CreatureInteractionCtx): void {
  if (ctx.state.bonuses.energizer > 0.0) return;

  const creature = ctx.creature;
  if (
    ctx.player.plaguebearerActive &&
    creature.hp < 150.0 &&
    ctx.state.plaguebearerInfectionCount < 0x32
  ) {
    if (ctx.contactDistSq < 30.0 * 30.0) {
      creature.plagueInfected = true;
    }
  }
}

function _creatureInteractionContactKillSmall(ctx: _CreatureInteractionCtx): void {
  const creature = ctx.creature;
  if (!creatureLifecycleIsAlive(creature.lifecycleStage)) return;
  if (ctx.contactDistSq >= 30.0 * 30.0) return;
  if (creature.size > 30.0) return;

  creature.hp = 0.0;
  creature.lifecycleStage = f32(creature.lifecycleStage - ctx.dt);
  ctx.skipCreature = true;
}

const _CREATURE_INTERACTION_STEPS: readonly _CreatureInteractionStep[] = [
  _creatureInteractionEnergizerEat,
  _creatureInteractionContactDamage,
  _creatureInteractionPlaguebearerContactFlag,
  _creatureInteractionContactKillSmall,
];

export class CreaturePool {
  private _entries: CreatureState[];
  spawnSlots: SpawnSlotInit[] = [];
  env: SpawnEnv | null = null;
  effects: EffectPool | null = null;
  captureSpawnEventsAuthoritative = false;
  killCount = 0;
  spawnedCount = 0;
  private _updateTick = 0;
  constructor(opts?: {
    size?: number;
    env?: SpawnEnv | null;
    effects?: EffectPool | null;
  }) {
    const size = opts?.size ?? CREATURE_POOL_SIZE;
    const env = opts?.env ?? null;
    const effects = opts?.effects ?? null;
    this._entries = Array.from({ length: size }, () => new CreatureState());
    this.env = env;
    this.effects = effects;
  }

  get entries(): CreatureState[] {
    return this._entries;
  }

  reset(): void {
    for (let i = 0; i < this._entries.length; i++) {
      this._entries[i] = new CreatureState();
    }
    this.spawnSlots.length = 0;
    this.killCount = 0;
    this.spawnedCount = 0;
    this._updateTick = 0;
  }

  iterActive(): CreatureState[] {
    return this._entries.filter((e) => e.active && e.hp > 0.0);
  }

  _plaguebearerSpreadInfection(originIndex: number): void {
    if (!(originIndex >= 0 && originIndex < this._entries.length)) return;
    const origin = this._entries[originIndex];
    if (!origin.active) return;

    for (const creature of this._entries) {
      if (!creature.active) continue;

      if (Vec2.distanceSq(creature.pos, origin.pos) < 45.0 * 45.0) {
        if (creature.plagueInfected && origin.hp < 150.0) {
          origin.plagueInfected = true;
        }
        if (origin.plagueInfected && creature.hp < 150.0) {
          creature.plagueInfected = true;
        }
        return;
      }
    }
  }

  // Native `creature_alloc_slot` does not clear `link_index` -- the caller
  // is responsible for setting it after allocation.
  private _allocSlot(): number | null {
    for (let i = 0; i < this._entries.length; i++) {
      if (!this._entries[i].active) return i;
    }
    return null;
  }

  private _freeSlotCount(): number {
    let count = 0;
    for (const entry of this._entries) {
      if (!entry.active) count++;
    }
    return count;
  }

  private _resolveTargetPlayerIndex(creature: CreatureState, players: PlayerState[]): number {
    const playerCount = players.length;
    if (playerCount <= 1) {
      creature.targetPlayer = 0;
      return 0;
    }

    let targetPlayer = creature.targetPlayer;
    if (!(targetPlayer >= 0 && targetPlayer < playerCount)) {
      targetPlayer = 0;
    }

    if (playerCount === 2) {
      if ((this._updateTick % _TARGET_REEVAL_PERIOD) !== 0) {
        const other = 1 - targetPlayer;
        if (players[other].health > 0.0) {
          const curDistSq = Vec2.distanceSq(creature.pos, players[targetPlayer].pos);
          const otherDistSq = Vec2.distanceSq(creature.pos, players[other].pos);
          if (otherDistSq < curDistSq) {
            targetPlayer = other;
          }
        }
      }
      if (players[targetPlayer].health <= 0.0) {
        targetPlayer = 1 - targetPlayer;
      }
      creature.targetPlayer = targetPlayer;
      return targetPlayer;
    }

    const needsRefresh =
      (this._updateTick % _TARGET_REEVAL_PERIOD) !== 0 ||
      players[targetPlayer].health <= 0.0;
    if (needsRefresh) {
      let nearestIdx = -1;
      let nearestDistSq = 0.0;
      for (let idx = 0; idx < players.length; idx++) {
        if (players[idx].health <= 0.0) continue;
        const distSq = Vec2.distanceSq(creature.pos, players[idx].pos);
        if (nearestIdx < 0 || distSq < nearestDistSq) {
          nearestIdx = idx;
          nearestDistSq = distSq;
        }
      }
      if (nearestIdx >= 0) {
        targetPlayer = nearestIdx;
      }
    }

    creature.targetPlayer = targetPlayer;
    return targetPlayer;
  }

  private _updatePlayerAutoTarget(
    players: PlayerState[],
    preserveBugs: boolean,
    playerIndex: number,
    creatureIndex: number,
    creature: CreatureState,
  ): void {
    if (!(playerIndex >= 0 && playerIndex < players.length)) return;
    const player = players[playerIndex];
    if (player.health <= 0.0) return;

    const autoTarget = player.autoTarget;
    if (!(autoTarget >= 0 && autoTarget < this._entries.length)) {
      player.autoTarget = creatureIndex;
      return;
    }

    const current = this._entries[autoTarget];
    if (!current.active || current.hp <= 0.0) {
      player.autoTarget = creatureIndex;
      return;
    }

    const distNew = Vec2.distanceSq(player.pos, creature.pos);
    let currentOrigin = player.pos;
    if (preserveBugs && playerIndex !== 0 && players.length > 0) {
      currentOrigin = players[0].pos;
    }
    const distCurrent = Vec2.distanceSq(currentOrigin, current.pos);
    if (distNew < distCurrent) {
      player.autoTarget = creatureIndex;
    }
  }

  spawnInit(init: CreatureInit): number | null {
    const idx = this._allocSlot();
    if (idx === null) return null;
    const entry = this._entries[idx];
    this._applyInit(entry, init);

    if (init.aiTimer !== null) {
      entry.linkIndex = init.aiTimer;
    } else if (init.aiLinkParent !== null) {
      entry.linkIndex = init.aiLinkParent;
    }
    if (init.spawnSlot !== null) {
      entry.spawnSlotIndex = init.spawnSlot;
      entry.linkIndex = init.spawnSlot;
    }

    this._entries[idx] = entry;
    this.spawnedCount += 1;
    return idx;
  }

  spawnInits(inits: readonly CreatureInit[]): number[] {
    const mapping: number[] = [];
    for (const init of inits) {
      const idx = this.spawnInit(init);
      if (idx !== null) {
        mapping.push(idx);
      }
    }
    return mapping;
  }

  spawnPlan(plan: SpawnPlan, opts?: {
    rng?: CrandLike | null;
    detailPreset?: number;
    effects?: EffectPool | null;
  }): [number[], number | null] {
    const rng = opts?.rng ?? null;
    const detailPreset = opts?.detailPreset ?? 5;
    const effects = opts?.effects ?? null;
    if (this._freeSlotCount() < plan.creatures.length) {
      return [[], null];
    }

    const mapping: number[] = [];
    const pendingAiLinks: (number | null)[] = [];
    const pendingAiTimers: (number | null)[] = [];
    const pendingSpawnSlots: (number | null)[] = [];

    for (const init of plan.creatures) {
      const poolIdx = this._allocSlot();
      if (poolIdx === null) return [[], null];
      const entry = this._entries[poolIdx];
      this._applyInit(entry, init);
      this._entries[poolIdx] = entry;
      this.spawnedCount += 1;

      mapping.push(poolIdx);
      pendingAiLinks.push(init.aiLinkParent);
      pendingAiTimers.push(init.aiTimer);
      pendingSpawnSlots.push(init.spawnSlot);
    }

    const slotMapping: number[] = [];
    for (const slot of plan.spawnSlots) {
      const ownerPlan = slot.ownerCreature;
      const ownerPool =
        ownerPlan >= 0 && ownerPlan < mapping.length ? mapping[ownerPlan] : -1;
      this.spawnSlots.push({
        ownerCreature: ownerPool,
        timer: slot.timer,
        count: slot.count,
        limit: slot.limit,
        interval: slot.interval,
        childTemplateId: slot.childTemplateId,
      });
      slotMapping.push(this.spawnSlots.length - 1);
    }

    for (let planIdx = 0; planIdx < mapping.length; planIdx++) {
      const poolIdx = mapping[planIdx];
      const entry = this._entries[poolIdx];

      const slotPlan = pendingSpawnSlots[planIdx];
      if (slotPlan !== null) {
        const globalSlot = slotMapping[slotPlan];
        entry.spawnSlotIndex = globalSlot;
        entry.linkIndex = globalSlot;
        continue;
      }

      const timer = pendingAiTimers[planIdx];
      if (timer !== null) {
        entry.linkIndex = timer;
        continue;
      }

      const linkPlan = pendingAiLinks[planIdx];
      if (linkPlan !== null) {
        entry.linkIndex = mapping[linkPlan];
      }
    }

    let primaryPool: number | null = null;
    if (plan.primary >= 0 && plan.primary < mapping.length) {
      primaryPool = mapping[plan.primary];
    }

    const effectPool = effects ?? this.effects;
    if (effectPool !== null && plan.effects.length > 0) {
      const fxRng = rng ?? new Crand(0);
      for (const fx of plan.effects) {
        effectPool.spawnBurst({ pos: fx.pos, count: fx.count, rng: fxRng, detailPreset });
      }
    }
    return [mapping, primaryPool];
  }

  spawnTemplate(
    templateId: SpawnId,
    pos: Vec2,
    heading: number,
    rng: CrandLike,
    opts?: {
      env?: SpawnEnv | null;
      detailPreset?: number;
      effects?: EffectPool | null;
    },
  ): [number[], number | null] {
    const env = opts?.env ?? null;
    const detailPreset = opts?.detailPreset ?? 5;
    const effects = opts?.effects ?? null;
    const spawnEnv = env ?? this.env;
    if (spawnEnv === null) {
      throw new Error(
        'CreaturePool.spawnTemplate requires SpawnEnv (set CreaturePool.env or pass env=...)',
      );
    }
    const plan = buildSpawnPlan(templateId, pos, heading, rng, spawnEnv);
    return this.spawnPlan(plan, { rng, detailPreset, effects });
  }

  update(dt: number, opts: { options: CreatureUpdateOptions }): CreatureUpdateResult {
    dt = f32(dt);
    const options = opts.options;
    const state = options.state;
    const players = options.players;
    const rng = options.rng;
    const detailPreset = options.detailPreset;
    const violenceDisabled = options.violenceDisabled;
    const spawnEnv = options.env;
    const worldWidth = options.worldWidth;
    const worldHeight = options.worldHeight;
    const fxQueue = options.fxQueue;
    const fxQueueRotated = options.fxQueueRotated;

    const deaths: CreatureDeath[] = [];
    const spawned: number[] = [];
    const sfx: SfxId[] = [];
    this._updateTick = int(this._updateTick) + 1;
    let singlePlayerDeadTargetPos: Vec2 | null = null;
    if (players.length === 1) {
      singlePlayerDeadTargetPos = new Vec2(
        worldWidth * (27.0 / 64.0),
        worldHeight * (27.0 / 64.0),
      );
    }

    const evilTargets: Set<number> = new Set();
    if (players.length > 0) {
      if (state.preserveBugs) {
        if (perkActive(players[0], PerkId.EVIL_EYES)) {
          const evilTarget = players[0].evilEyesTargetCreature;
          if (evilTarget >= 0) evilTargets.add(evilTarget);
        }
      } else {
        for (const player of players) {
          if (player.health <= 0.0) continue;
          if (!perkActive(player, PerkId.EVIL_EYES)) continue;
          const evilTarget = player.evilEyesTargetCreature;
          if (evilTarget >= 0) evilTargets.add(evilTarget);
        }
      }
    }

    const dtMs = dt > 0.0 ? ftolMsI32(dt) : 0;

    const _applySelfDamageTick = (creatureIndex: number, creature: CreatureState): boolean => {
      if (dt <= 0.0 || state.bonuses.freeze > 0.0) return false;
      let damageAmount = 0.0;
      const creatureFlags = int(creature.flags);
      if ((creatureFlags & _FLAG_SELF_DAMAGE_TICK_STRONG) !== 0) {
        damageAmount = dt * 180.0;
      } else if ((creatureFlags & _FLAG_SELF_DAMAGE_TICK) !== 0) {
        damageAmount = dt * 60.0;
      }
      if (damageAmount <= 0.0) return false;

      const onLethal = (deathSfx: SfxId[]): void => {
        deaths.push(
          this.handleDeath(
            creatureIndex,
            {
              state,
              players,
              rng,
              dt,
              detailPreset,
              worldWidth,
              worldHeight,
              fxQueue,
            },
          ),
        );
        sfx.push(...deathSfx);
      };

      return creatureApplyDamageWithLethalFollowup(
        creature,
        {
          damageAmount,
          damageType: CreatureDamageType.SELF_TICK,
          impulse: new Vec2(),
          owner: creature.lastHitOwner,
          dt,
          players,
          rng,
          preserveBugs: state.preserveBugs,
          effects: state.effects,
          detailPreset,
          onLethal,
        },
      );
    };

    for (let idx = 0; idx < this._entries.length; idx++) {
      const creature = this._entries[idx];
      if (!creature.active) continue;

      if (creature.hitFlashTimer > 0.0) {
        creature.hitFlashTimer = f32(creature.hitFlashTimer - dt);
      }

      if (state.bonuses.freeze > 0.0) continue;

      if (!creatureLifecycleIsAlive(creature.lifecycleStage) || creature.hp <= 0.0) {
        _applySelfDamageTick(idx, creature);
        if (
          dt > 0.0 &&
          state.bonuses.freeze <= 0.0 &&
          ((int(creature.flags)) & _FLAG_AI7_LINK_TIMER) !== 0
        ) {
          creatureAi7TickLinkTimer(creature, { dtMs, rng });
        }
        if (creatureLifecycleIsAlive(creature.lifecycleStage)) {
          creature.lifecycleStage = f32(creature.lifecycleStage - dt);
        }
        if (dt > 0.0) {
          this._tickDead(
            creature,
            dt,
            worldWidth,
            worldHeight,
            fxQueueRotated,
            rng,
            detailPreset,
            violenceDisabled,
          );
        }
        continue;
      }

      if (dt <= 0.0 || players.length === 0) continue;

      const poisonKilled = _applySelfDamageTick(idx, creature);
      creatureAi7TickLinkTimer(creature, { dtMs, rng });
      if (poisonKilled) {
        if (creature.active) {
          this._tickDead(
            creature,
            dt,
            worldWidth,
            worldHeight,
            fxQueueRotated,
            rng,
            detailPreset,
            violenceDisabled,
          );
        }
        continue;
      }

      if (creature.plagueInfected) {
        creature.collisionTimer -= dt;
        if (creature.collisionTimer < 0.0) {
          creature.collisionTimer += CONTACT_DAMAGE_PERIOD;
          creature.hp -= 15.0;
          let plagueKilled = false;
          if (creature.hp < 0.0) {
            state.plaguebearerInfectionCount += 1;
            deaths.push(
              this.handleDeath(
                idx,
                {
                  state,
                  players,
                  rng,
                  dt,
                  detailPreset,
                  worldWidth,
                  worldHeight,
                  fxQueue,
                },
              ),
            );
            const contactSfxOptions = _CREATURE_CONTACT_SFX.get(creature.typeId);
            if (contactSfxOptions !== undefined) {
              const sfxIndex =
                rng.rand({ caller: RngCallerStatic.CREATURE_UPDATE_ALL_PLAGUE_KILL_SFX }) & 1;
              sfx.push(contactSfxOptions[sfxIndex]);
            }
            plagueKilled = true;
          }

          if (fxQueue !== null) {
            fxQueue.addRandom({ pos: creature.pos, rng });
          }
          if (plagueKilled) {
            // Native keeps executing the current live-branch body after
            // `creature_handle_death` in this timer-wrap kill path.
          }
        }
      }

      const targetPlayer = this._resolveTargetPlayerIndex(creature, players);
      if ((this._updateTick % _TARGET_REEVAL_PERIOD) !== 0) {
        this._updatePlayerAutoTarget(
          players,
          state.preserveBugs,
          targetPlayer,
          idx,
          creature,
        );
      }
      const player = players[targetPlayer];
      let playerPos = player.pos;
      if (singlePlayerDeadTargetPos !== null && players[0].health <= 0.0) {
        creature.targetPlayer = 1;
        playerPos = singlePlayerDeadTargetPos;
      }

      const frozenByEvilEyes = evilTargets.has(idx);
      if (frozenByEvilEyes) {
        creature.forceTarget = 0;
        continue;
      }

      const ai = creatureAiUpdateTarget(
        creature,
        { playerPos, creatures: this._entries, dt },
      );
      creature.moveScale = ai.moveScale;
      if (ai.selfDamage !== null && ai.selfDamage > 0.0) {
        creature.hp -= ai.selfDamage;
        if (creature.hp <= 0.0) {
          deaths.push(
            this.handleDeath(
              idx,
              {
                state,
                players,
                rng,
                dt,
                detailPreset,
                worldWidth,
                worldHeight,
                fxQueue,
              },
            ),
          );
          if (creature.active) {
            this._tickDead(
              creature,
              dt,
              worldWidth,
              worldHeight,
              fxQueueRotated,
              rng,
              detailPreset,
              violenceDisabled,
            );
          }
          continue;
        }
      }

      if (
        (state.bonuses.energizer > 0.0 && creature.maxHp < 500.0) ||
        creature.plagueInfected
      ) {
        creature.targetHeading = headingAddPiF32(creature.targetHeading);
      }

      const turnRate = f32(creature.moveSpeed * CREATURE_TURN_RATE_SCALE);
      if (((int(creature.flags)) & CreatureFlags.ANIM_PING_PONG) === 0) {
        if (creature.aiMode !== CreatureAiMode.HOLD_TIMER) {
          creature.heading = _angleApproach(
            creature.heading,
            creature.targetHeading,
            turnRate,
            dt,
          );
          const moveDelta = _movementDeltaFromHeadingF32(
            creature.heading,
            dt,
            creature.moveScale,
            creature.moveSpeed,
          );
          creature.vel = moveDelta;
          creature.pos = _advancePosByDeltaF32(creature.pos, moveDelta);
        }
      } else {
        const radius = Math.max(0.0, creature.size);
        const maxX = Math.max(radius, worldWidth - radius);
        const maxY = Math.max(radius, worldHeight - radius);
        creature.pos = f32Vec2(creature.pos.clampRect(radius, radius, maxX, maxY));
        if (((int(creature.flags)) & CreatureFlags.ANIM_LONG_STRIP) === 0) {
          creature.vel = new Vec2();
        } else {
          creature.heading = _angleApproach(
            creature.heading,
            creature.targetHeading,
            turnRate,
            dt,
          );
          const moveDelta = _movementDeltaFromHeadingF32(
            creature.heading,
            dt,
            creature.moveScale,
            creature.moveSpeed,
          );
          creature.vel = moveDelta;
          creature.pos = f32Vec2(
            _advancePosByDeltaF32(creature.pos, moveDelta).clampRect(
              radius,
              radius,
              maxX,
              maxY,
            ),
          );
        }
      }

      if (
        players.length > 0 &&
        perkActive(players[0], PerkId.PLAGUEBEARER) &&
        state.plaguebearerInfectionCount < 0x3C
      ) {
        this._plaguebearerSpreadInfection(idx);
      }

      if (creature.attackCooldown <= 0.0) {
        creature.attackCooldown = 0.0;
      } else {
        creature.attackCooldown -= dt;
      }

      if (players.length > 0 && perkActive(players[0], PerkId.RADIOACTIVE)) {
        const radioactivePlayer = players[0];
        const dist = creature.pos.sub(radioactivePlayer.pos).length();
        if (dist < 100.0) {
          creature.collisionTimer -= dt * 1.5;
          if (creature.collisionTimer < 0.0) {
            creature.collisionTimer = CONTACT_DAMAGE_PERIOD;
            creature.hp -= (100.0 - dist) * 0.3;
            if (fxQueue !== null) {
              fxQueue.addRandom({ pos: creature.pos, rng });
            }

            if (creature.hp < 0.0) {
              if (creature.typeId === CreatureTypeId.LIZARD) {
                creature.hp = 1.0;
              } else {
                radioactivePlayer.experience =
                  int(radioactivePlayer.experience + creature.rewardValue);
                creature.lifecycleStage -= dt;
              }
            }
          }
        }
      }

      const targetDistSq = Vec2.distanceSq(creature.pos, player.pos);
      const targetDist = Math.sqrt(targetDistSq);

      if (
        !frozenByEvilEyes &&
        ((int(creature.flags)) &
          (CreatureFlags.RANGED_ATTACK_SHOCK |
            CreatureFlags.RANGED_ATTACK_VARIANT)) !== 0
      ) {
        if (targetDist > 64.0 && creature.attackCooldown <= 0.0) {
          if ((int(creature.flags)) & CreatureFlags.RANGED_ATTACK_SHOCK) {
            const typeId = ProjectileTemplateId.PLASMA_RIFLE;
            state.projectiles.spawn({
              pos: creature.pos,
              angle: creature.heading,
              typeId,
              owner: OwnerRef.fromCreature(idx),
              travelBudget: _travelBudgetForTypeId(typeId),
              hitsPlayers: true,
            });
            sfx.push(SfxId.SHOCK_FIRE);
            creature.attackCooldown += 1.0;
          }

          if (
            ((int(creature.flags)) & CreatureFlags.RANGED_ATTACK_VARIANT) !== 0 &&
            creature.attackCooldown <= 0.0
          ) {
            const projectileType = creature.orbitRadius as ProjectileTemplateId;
            state.projectiles.spawn({
              pos: creature.pos,
              angle: creature.heading,
              typeId: projectileType,
              owner: OwnerRef.fromCreature(idx),
              travelBudget: _travelBudgetForTypeId(projectileType),
              hitsPlayers: true,
            });
            sfx.push(SfxId.PLASMAMINIGUN_FIRE);
            creature.attackCooldown =
              (rng.rand({ caller: RngCallerStatic.CREATURE_UPDATE_ALL_PLASMAMINIGUN_COOLDOWN }) & 3) *
                0.1 +
              creature.orbitAngle +
              creature.attackCooldown;
          }
        }
      }

      const interactionCtx: _CreatureInteractionCtx = {
        pool: this,
        creatureIndex: idx,
        creature,
        state,
        players,
        player,
        dt,
        rng,
        detailPreset,
        violenceDisabled,
        worldWidth,
        worldHeight,
        fxQueue,
        fxQueueRotated,
        deaths,
        sfx,
        skipCreature: false,
        contactDistSq: targetDistSq,
      };
      for (const step of _CREATURE_INTERACTION_STEPS) {
        step(interactionCtx);
        if (interactionCtx.skipCreature) break;
      }
      if (interactionCtx.skipCreature) continue;

      if (
        dt > 0.0 &&
        state.bonuses.freeze <= 0.0 &&
        !this.captureSpawnEventsAuthoritative &&
        ((int(creature.flags)) & (HAS_SPAWN_SLOT_FLAG as number)) !== 0
      ) {
        const slotIndex = creature.spawnSlotIndex;
        if (slotIndex !== null && slotIndex >= 0 && slotIndex < this.spawnSlots.length) {
          const slot = this.spawnSlots[slotIndex];
          if (slot.ownerCreature === idx) {
            const childTemplateId = tickSpawnSlot(slot, dt);
            if (childTemplateId !== null) {
              const plan = buildSpawnPlan(
                childTemplateId,
                creature.pos,
                RANDOM_HEADING_SENTINEL,
                rng,
                spawnEnv,
              );
              const [mapping] = this.spawnPlan(plan, { rng, detailPreset });
              spawned.push(...mapping);
            }
          }
        }
      }
    }

    return { deaths, spawned, sfx };
  }

  handleDeath(idx: number, opts: {
    state: GameplayState;
    players: PlayerState[];
    rng: CrandLike;
    dt?: number;
    detailPreset?: number;
    worldWidth: number;
    worldHeight: number;
    fxQueue: FxQueue | null;
    keepCorpse?: boolean;
  }): CreatureDeath {
    const state = opts.state;
    const players = opts.players;
    const rng = opts.rng;
    const dt = opts.dt ?? 0.0;
    const detailPreset = opts.detailPreset ?? 5;
    const worldWidth = opts.worldWidth;
    const worldHeight = opts.worldHeight;
    const fxQueue = opts.fxQueue;
    const keepCorpse = opts.keepCorpse ?? true;
    const creature = this._entries[int(idx)];
    survivalRecordRecentDeath(state, creature.pos);
    if (
      ((int(creature.flags)) & CreatureFlags.BONUS_ON_DEATH) !== 0 &&
      creature.bonusId !== null
    ) {
      state.bonusPool.spawnAt(
        creature.pos,
        creature.bonusId,
        creature.bonusDurationOverride !== null ? creature.bonusDurationOverride : -1,
        { state, worldWidth, worldHeight },
      );
      if (!state.preserveBugs) {
        creature.bonusId = null;
        creature.bonusDurationOverride = null;
      }
    }
    if (!creature.active) {
      return {
        index: idx,
        pos: creature.pos,
        typeId: creature.typeId,
        rewardValue: creature.rewardValue,
        xpAwarded: 0,
        owner: creature.lastHitOwner,
      };
    }
    const death = this._startDeath(
      idx,
      creature,
      state,
      players,
      rng,
      detailPreset,
      worldWidth,
      worldHeight,
    );

    if (keepCorpse) {
      creature.lifecycleStage = creature.lifecycleStage - dt;
    } else {
      creature.active = false;
    }

    if (state.bonuses.freeze > 0.0) {
      const creaturePos = creature.pos;
      for (let i = 0; i < 8; i++) {
        const angle =
          (rng.rand({ caller: RngCallerStatic.CREATURE_HANDLE_DEATH_FREEZE_SHARD_ANGLE }) % 612) * 0.01;
        state.effects.spawnFreezeShard({ pos: creaturePos, angle, rng, detailPreset });
      }
      const shatterAngle =
        (rng.rand({ caller: RngCallerStatic.CREATURE_HANDLE_DEATH_FREEZE_SHATTER_ANGLE }) % 612) * 0.01;
      state.effects.spawnFreezeShatter({ pos: creaturePos, angle: shatterAngle, rng, detailPreset });
      if (fxQueue !== null) {
        fxQueue.addRandom({ pos: creaturePos, rng });
      }
      this.killCount += 1;
      creature.active = false;
    }

    return death;
  }

  private _applyInit(entry: CreatureState, init: CreatureInit): void {
    entry.active = true;
    entry.typeId = init.typeId !== null ? init.typeId : CreatureTypeId.ZOMBIE;
    entry.pos = f32Vec2(init.pos);
    if (init.heading !== null) {
      entry.heading = f32(init.heading);
    }
    entry.target = f32Vec2(init.pos);
    entry.phaseSeed = f32(init.phaseSeed);
    entry.vel = new Vec2();
    entry.forceTarget = 0;

    entry.flags = init.flags || 0;
    entry.aiMode = init.aiMode as CreatureAiMode;

    let hp = init.health ?? 0.0;
    if (hp <= 0.0) hp = 1.0;
    entry.hp = f32(hp);
    entry.maxHp = f32(init.maxHealth ?? hp);

    entry.moveSpeed = f32(init.moveSpeed ?? 1.0);
    entry.rewardValue = f32(init.rewardValue ?? 0.0);
    entry.size = f32(init.size ?? 50.0);
    entry.contactDamage = f32(init.contactDamage ?? 0.0);

    entry.targetOffset = init.targetOffset !== null ? f32Vec2(init.targetOffset) : null;
    entry.orbitAngle = f32(init.orbitAngle ?? 0.0);
    let orbitRadius: number;
    if (init.orbitRadius !== null) {
      orbitRadius = init.orbitRadius;
    } else if (init.rangedProjectileType !== null) {
      orbitRadius = init.rangedProjectileType;
    } else {
      orbitRadius = 0.0;
    }
    entry.orbitRadius = f32(orbitRadius);

    entry.spawnSlotIndex = null;
    entry.attackCooldown = 0.0;

    entry.bonusId = init.bonusId;
    entry.bonusDurationOverride =
      init.bonusDurationOverride !== null ? init.bonusDurationOverride : null;

    const resolved = resolveTint(init.tint);
    entry.tint = new RGBA(resolved[0], resolved[1], resolved[2], resolved[3]);

    entry.plagueInfected = false;
    entry.collisionTimer = 0.0;
    entry.lifecycleStage = CREATURE_LIFECYCLE_ALIVE;
    entry.hitFlashTimer = 0.0;
    entry.animPhase = 0.0;
    entry.lastHitOwner = OwnerRef.fromLocalPlayer(0);
  }

  private _disableSpawnSlot(slotIndex: number): void {
    if (!(slotIndex >= 0 && slotIndex < this.spawnSlots.length)) return;
    const slot = this.spawnSlots[slotIndex];
    slot.ownerCreature = -1;
    slot.limit = 0;
  }

  _tickDead(
    creature: CreatureState,
    dt: number,
    worldWidth: number,
    worldHeight: number,
    fxQueueRotated: FxQueueRotated | null,
    rng: CrandLike | null = null,
    detailPreset: number = 5,
    violenceDisabled: number = 0,
  ): void {
    if (dt <= 0.0) return;

    const dtF32 = f32(dt);
    const hitbox = f32(creature.lifecycleStage);
    if (hitbox <= 0.0) {
      creature.lifecycleStage = f32(hitbox - f32(dtF32 * CREATURE_CORPSE_FADE_DECAY));
      return;
    }

    const longStrip =
      ((int(creature.flags)) & CreatureFlags.ANIM_PING_PONG) === 0 ||
      ((int(creature.flags)) & CreatureFlags.ANIM_LONG_STRIP) !== 0;

    const newHitbox = f32(hitbox - f32(dtF32 * CREATURE_DEATH_TIMER_DECAY));
    creature.lifecycleStage = f32(newHitbox);
    if (newHitbox > 0.0) {
      if (longStrip) {
        const slide = f32(f32(newHitbox * dtF32) * f32(CREATURE_DEATH_SLIDE_SCALE));
        const direction = headingToDirectionF32(creature.heading);
        creature.vel = new Vec2(
          f32(direction.x * slide),
          f32(direction.y * slide),
        );
        creature.pos = new Vec2(
          f32(creature.pos.x - creature.vel.x),
          f32(creature.pos.y - creature.vel.y),
        );
      } else {
        creature.vel = new Vec2();
      }
      return;
    }

    if (violenceDisabled === 0 && fxQueueRotated !== null) {
      const corpseSize = Math.max(1.0, creature.size);
      const corpseTypeId = longStrip ? (creature.typeId as number) : 7;
      const ok = fxQueueRotated.add({
        topLeft: new Vec2(creature.pos.x - corpseSize * 0.5, creature.pos.y - corpseSize * 0.5),
        rgba: creature.tint,
        rotation: creature.heading,
        scale: corpseSize,
        creatureTypeId: corpseTypeId,
      });
      if (!ok) {
        creature.lifecycleStage = 0.001;
        return;
      }
    }

    this.killCount += 1;

    if (
      violenceDisabled === 0 &&
      ((int(creature.flags)) & CreatureFlags.ANIM_PING_PONG) !== 0 &&
      rng !== null &&
      this.effects !== null
    ) {
      const batches: [number, number, number][] = [
        [8, 0.0, RngCallerStatic.CREATURE_UPDATE_ALL_PING_PONG_BLOOD_8_ANGLE],
        [6, -0.07, RngCallerStatic.CREATURE_UPDATE_ALL_PING_PONG_BLOOD_6_ANGLE],
        [5, -0.12, RngCallerStatic.CREATURE_UPDATE_ALL_PING_PONG_BLOOD_5_ANGLE],
      ];
      for (const [count, age, angleCaller] of batches) {
        for (let i = 0; i < count; i++) {
          const angle = (rng.rand({ caller: angleCaller }) % 612) * 0.01;
          this.effects.spawnBloodSplatter({
            pos: creature.pos,
            angle,
            age,
            rng,
            detailPreset,
            violenceDisabled,
          });
        }
      }
    }
  }

  finalizePostRenderLifecycle(): void {
    for (const creature of this._entries) {
      if (!creature.active) continue;
      if (classifyCreatureLifecycle(creature.lifecycleStage) !== CreatureLifecyclePhase.DESPAWNED) {
        continue;
      }
      if (creature.spawnSlotIndex !== null) {
        this._disableSpawnSlot(creature.spawnSlotIndex);
      }
      creature.active = false;
    }
  }

  private _startDeath(
    idx: number,
    creature: CreatureState,
    state: GameplayState,
    players: PlayerState[],
    rng: CrandLike,
    detailPreset: number = 5,
    worldWidth: number,
    worldHeight: number,
  ): CreatureDeath {
    if (creature.spawnSlotIndex !== null) {
      this._disableSpawnSlot(creature.spawnSlotIndex);
    }

    if (
      ((int(creature.flags)) & CreatureFlags.SPLIT_ON_DEATH) !== 0 &&
      creature.size > 35.0
    ) {
      const splits: [number, number][] = [
        [-Math.PI / 2.0, RngCallerStatic.CREATURE_HANDLE_DEATH_SPLIT_CHILD_1_PHASE_SEED],
        [Math.PI / 2.0, RngCallerStatic.CREATURE_HANDLE_DEATH_SPLIT_CHILD_2_PHASE_SEED],
      ];
      for (const [headingOffset, phaseSeedCaller] of splits) {
        const childIdx = this._allocSlot();
        if (childIdx === null) continue;
        const child = creature.clone();
        child.phaseSeed = rng.rand({ caller: phaseSeedCaller }) & 0xFF;
        child.heading = _wrapAngle(creature.heading + headingOffset);
        child.targetHeading = child.heading;
        child.hp = creature.maxHp * 0.25;
        child.rewardValue = child.rewardValue * (2.0 / 3.0);
        child.size = child.size - 8.0;
        child.moveSpeed = child.moveSpeed + 0.1;
        child.contactDamage = child.contactDamage * 0.7;
        child.lifecycleStage = CREATURE_LIFECYCLE_ALIVE;
        this._entries[childIdx] = child;
        this.spawnedCount += 1;
      }

      state.effects.spawnBurst({ pos: creature.pos, count: 8, rng, detailPreset });
    }

    let killer: PlayerState | null = null;
    if (players.length > 0) {
      let playerIndex = _ownerToPlayerIndex(creature.lastHitOwner);
      if (playerIndex === null || !(playerIndex >= 0 && playerIndex < players.length)) {
        playerIndex = 0;
      }
      killer = players[playerIndex];
    }

    let xpAwarded = 0;
    if (killer !== null) {
      if (perkActive(killer, PerkId.BLOODY_MESS_QUICK_LEARNER)) {
        xpAwarded = awardExperience(state, killer, int(creature.rewardValue * 1.3));
      } else {
        xpAwarded = awardExperienceFromReward(state, killer, creature.rewardValue);
      }
    }

    if (players.length > 0) {
      state.bonusPool.trySpawnOnKill(
        creature.pos,
        { state, players, detailPreset, worldWidth, worldHeight },
      );
    }

    return {
      index: idx,
      pos: creature.pos,
      typeId: creature.typeId,
      rewardValue: creature.rewardValue,
      xpAwarded,
      owner: creature.lastHitOwner,
    };
  }
}
