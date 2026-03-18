// Port of crimson/projectiles/runtime/secondary_pool.py

import { RGBA } from '../../../engine/color.ts';
import { Vec2 } from '../../../engine/geom.ts';
import type { CrandLike } from '../../../engine/rand.ts';
import { Crand } from '../../../engine/rand.ts';
import { SfxId } from '../../../engine/sfx-map.ts';
import { nativeFindSizeMargin } from '../../collision-math.ts';
import { creatureLifecycleIsAlive, creatureLifecycleIsCollidable } from '../../creatures/lifecycle.ts';
import type { EffectPool, FxQueue, SpriteEffectPool } from '../../effects.ts';
import type { CreatureStateLike } from '../../effects.ts';
import { EffectId } from '../../effects-atlas.ts';
import { f32 } from '../../math-parity.ts';
import { OwnerRef } from '../../owner-ref.ts';
import { RngCallerStatic } from '../../rng-caller-static.ts';
import type { GameplayState } from '../../sim/state-types.ts';
import {
  SECONDARY_PROJECTILE_POOL_SIZE,
  SecondaryProjectileTypeId,
  SecondaryProjectile,
} from '../types.ts';
import type {
  CreatureDamageApplier,
  SecondaryDetonationKillHandler,
} from '../types.ts';

const _SECONDARY_PRE_HIT_DECAL_CALLERS: readonly [number, number][] = [
  [
    RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_PRE_HIT_DECAL_DX_1,
    RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_PRE_HIT_DECAL_DY_1,
  ],
  [
    RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_PRE_HIT_DECAL_DX_2,
    RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_PRE_HIT_DECAL_DY_2,
  ],
  [
    RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_PRE_HIT_DECAL_DX_3,
    RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_PRE_HIT_DECAL_DY_3,
  ],
];

interface CreatureState extends CreatureStateLike {
  pos: Vec2;
  active: boolean;
  hp: number;
  size: number;
  lifecycleStage: number;
}

export interface SecondarySpawnSpec {
  readonly pos: Vec2;
  readonly angle: number;
  readonly typeId: SecondaryProjectileTypeId;
  readonly owner?: OwnerRef;
  readonly timeToLive?: number;
  readonly targetHint?: Vec2 | null;
  readonly creatures?: CreatureState[] | null;
  readonly preserveBugs?: boolean;
}

export interface SecondaryStepCtx {
  readonly dt: number;
  readonly creatures: CreatureState[];
  readonly runtimeState?: GameplayState | null;
  readonly fxQueue?: FxQueue | null;
  readonly detailPreset?: number;
  readonly onDetonationKill?: SecondaryDetonationKillHandler | null;
}

interface DetonationRule {
  readonly tag: 'detonation';
}

interface RocketRule {
  readonly tag: 'rocket';
  readonly baseSpeed: number;
  readonly accelFactorScale: number;
  readonly speedCap: number;
  readonly ttlDecayScale: number;
  readonly detonationScale: number;
  readonly damageSpeedMul: number;
  readonly damageBase: number;
  readonly extraDecals: number;
  readonly extraRadius: number;
  readonly burstScale: number | null;
  readonly burstMinDetail: number;
  readonly freezeShardTargetPos: boolean;
}

interface HomingRocketRule {
  readonly tag: 'homing_rocket';
  readonly baseSpeed: number;
  readonly targetAccel: number;
  readonly maxVelocity: number;
  readonly ttlDecayScale: number;
  readonly detonationScale: number;
  readonly damageSpeedMul: number;
  readonly damageBase: number;
  readonly extraDecals: number;
  readonly extraRadius: number;
  readonly freezeShardTargetPos: boolean;
}

interface RocketMinigunRule {
  readonly tag: 'rocket_minigun';
  readonly baseSpeed: number;
  readonly accelFactorScale: number;
  readonly speedCap: number;
  readonly ttlDecayScale: number;
  readonly detonationScale: number;
  readonly damageSpeedMul: number;
  readonly damageBase: number;
  readonly extraDecals: number;
  readonly extraRadius: number;
  readonly freezeShardTargetPos: boolean;
}

type SecondaryProjectileRule = DetonationRule | RocketRule | HomingRocketRule | RocketMinigunRule;

const DETONATION_RULE: DetonationRule = { tag: 'detonation' };

const ROCKET_RULE: RocketRule = {
  tag: 'rocket',
  baseSpeed: 90.0,
  accelFactorScale: 3.0,
  speedCap: 500.0,
  ttlDecayScale: 1.0,
  detonationScale: 1.0,
  damageSpeedMul: 50.0,
  damageBase: 500.0,
  extraDecals: 0x14,
  extraRadius: 90.0,
  burstScale: 0.4,
  burstMinDetail: 2,
  freezeShardTargetPos: false,
};

const HOMING_ROCKET_RULE: HomingRocketRule = {
  tag: 'homing_rocket',
  baseSpeed: 190.0,
  targetAccel: 800.0,
  maxVelocity: 350.0,
  ttlDecayScale: 0.5,
  detonationScale: 0.35,
  damageSpeedMul: 20.0,
  damageBase: 80.0,
  extraDecals: 10,
  extraRadius: 64.0,
  freezeShardTargetPos: false,
};

const ROCKET_MINIGUN_RULE: RocketMinigunRule = {
  tag: 'rocket_minigun',
  baseSpeed: 90.0,
  accelFactorScale: 4.0,
  speedCap: 600.0,
  ttlDecayScale: 1.0,
  detonationScale: 0.25,
  damageSpeedMul: 20.0,
  damageBase: 40.0,
  extraDecals: 3,
  extraRadius: 44.0,
  freezeShardTargetPos: true,
};

const _DEFAULT_ROCKET_RULE: RocketRule = {
  tag: 'rocket',
  baseSpeed: 90.0,
  accelFactorScale: 3.0,
  speedCap: 500.0,
  ttlDecayScale: 1.0,
  detonationScale: 0.5,
  damageSpeedMul: 0.0,
  damageBase: 150.0,
  extraDecals: 0,
  extraRadius: 0.0,
  burstScale: null,
  burstMinDetail: 2,
  freezeShardTargetPos: false,
};

const SECONDARY_RULE_BY_TYPE_ID = new Map<SecondaryProjectileTypeId, SecondaryProjectileRule>([
  [SecondaryProjectileTypeId.DETONATION, DETONATION_RULE],
  [SecondaryProjectileTypeId.ROCKET, ROCKET_RULE],
  [SecondaryProjectileTypeId.HOMING_ROCKET, HOMING_ROCKET_RULE],
  [SecondaryProjectileTypeId.ROCKET_MINIGUN, ROCKET_MINIGUN_RULE],
]);

function secondaryRuleForTypeId(typeId: SecondaryProjectileTypeId): SecondaryProjectileRule {
  return SECONDARY_RULE_BY_TYPE_ID.get(typeId) ?? _DEFAULT_ROCKET_RULE;
}

const _SPATIAL_BUCKET_SIZE = 64.0;
const _NATIVE_FIND_SIZE_SCALE = 0.14285715;
const _NATIVE_FIND_BASE_MARGIN = 3.0;
const _NATIVE_FIND_RADIUS_MARGIN_EPS = 0.001;

function _nativeFindMarginForSize(size: number): number {
  return size * _NATIVE_FIND_SIZE_SCALE + _NATIVE_FIND_BASE_MARGIN;
}

class CreatureSpatialHash {
  private _creatures: CreatureState[];
  private _isCollidable: (c: CreatureState) => boolean;
  private _bucketSize: number;
  private _cells: Map<string, number[]>;
  private _cellByIndex: (string | null)[];
  private _maxFindMargin: number;

  constructor(creatures: CreatureState[], isCollidable: (c: CreatureState) => boolean) {
    this._creatures = creatures;
    this._isCollidable = isCollidable;
    this._bucketSize = _SPATIAL_BUCKET_SIZE;
    this._cells = new Map();
    this._cellByIndex = new Array(creatures.length).fill(null);
    this._maxFindMargin = 0.0;
    this._rebuild();
  }

  private _rebuild(): void {
    const cells = new Map<string, number[]>();
    const cellByIndex: (string | null)[] = new Array(this._creatures.length).fill(null);
    let maxFindMargin = 0.0;

    for (let idx = 0; idx < this._creatures.length; idx++) {
      const creature = this._creatures[idx];
      if (!this._isCollidable(creature)) continue;
      const cell = this._cellForPos(creature.pos);
      let bucket = cells.get(cell);
      if (bucket === undefined) {
        bucket = [];
        cells.set(cell, bucket);
      }
      bucket.push(idx);
      cellByIndex[idx] = cell;
      const creatureFindMargin = _nativeFindMarginForSize(creature.size);
      if (creatureFindMargin > maxFindMargin) {
        maxFindMargin = creatureFindMargin;
      }
    }

    this._cells = cells;
    this._cellByIndex = cellByIndex;
    this._maxFindMargin = maxFindMargin;
  }

  syncIndex(index: number): void {
    if (!(index >= 0 && index < this._creatures.length)) return;
    const creature = this._creatures[index];
    const previousCell = this._cellByIndex[index];
    if (!this._isCollidable(creature)) {
      if (previousCell !== null) {
        this._removeFromCell(index, previousCell);
        this._cellByIndex[index] = null;
      }
      return;
    }

    const nextCell = this._cellForPos(creature.pos);
    if (previousCell === nextCell) return;
    if (previousCell !== null) {
      this._removeFromCell(index, previousCell);
    }
    let bucket = this._cells.get(nextCell);
    if (bucket === undefined) {
      bucket = [];
      this._cells.set(nextCell, bucket);
    }
    bucket.push(index);
    this._cellByIndex[index] = nextCell;

    const creatureFindMargin = _nativeFindMarginForSize(creature.size);
    if (creatureFindMargin > this._maxFindMargin) {
      this._maxFindMargin = creatureFindMargin;
    }
  }

  candidateIndices(pos: Vec2, radius: number): number[] {
    if (this._cells.size === 0) return [];
    const projCellX = Math.floor(pos.x / this._bucketSize);
    const projCellY = Math.floor(pos.y / this._bucketSize);
    const maxAxisDelta = radius + this._maxFindMargin + _NATIVE_FIND_RADIUS_MARGIN_EPS;
    const cellSpan = Math.ceil(maxAxisDelta / this._bucketSize);

    const candidates: number[] = [];
    for (let cellY = projCellY - cellSpan; cellY <= projCellY + cellSpan; cellY++) {
      for (let cellX = projCellX - cellSpan; cellX <= projCellX + cellSpan; cellX++) {
        const key = `${cellX},${cellY}`;
        const bucket = this._cells.get(key);
        if (bucket !== undefined) {
          for (let i = 0; i < bucket.length; i++) {
            candidates.push(bucket[i]);
          }
        }
      }
    }

    if (candidates.length > 1) {
      candidates.sort((a, b) => a - b);
    }
    return candidates;
  }

  private _cellForPos(pos: Vec2): string {
    const cellX = Math.floor(pos.x / this._bucketSize);
    const cellY = Math.floor(pos.y / this._bucketSize);
    return `${cellX},${cellY}`;
  }

  private _removeFromCell(index: number, cell: string): void {
    const bucket = this._cells.get(cell);
    if (bucket === undefined) return;
    const i = bucket.indexOf(index);
    if (i === -1) return;
    bucket.splice(i, 1);
    if (bucket.length === 0) {
      this._cells.delete(cell);
    }
  }
}

const _COLLISION_NATIVE_FIND_RADIUS_MARGIN_EPS = 0.0;

function _withinNativeFindRadius(origin: Vec2, target: Vec2, radius: number, targetSize: number): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const radiusF = radius;
  const sizeMargin = nativeFindSizeMargin(targetSize);
  const maxAxisDelta = radiusF + sizeMargin + _COLLISION_NATIVE_FIND_RADIUS_MARGIN_EPS;
  if (Math.abs(dx) > maxAxisDelta || Math.abs(dy) > maxAxisDelta) {
    return false;
  }
  const margin = Math.sqrt(dx * dx + dy * dy) - radiusF - sizeMargin;
  return margin < _COLLISION_NATIVE_FIND_RADIUS_MARGIN_EPS;
}

function _creatureFindNearestForSecondary(
  creatures: CreatureState[],
  origin: Vec2,
  preserveBugs: boolean,
): number {
  let bestIdx = preserveBugs ? 0 : -1;
  let bestDistSq = 1_000_000.0;
  const maxIndex = Math.min(creatures.length, 0x180);
  for (let idx = 0; idx < maxIndex; idx++) {
    const creature = creatures[idx];
    if (!creature.active) continue;
    if (!creatureLifecycleIsAlive(creature.lifecycleStage)) continue;
    const distSq = Vec2.distanceSq(origin, creature.pos);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function _applyDamageToCreature(
  creatures: CreatureState[],
  creatureIndex: number,
  damage: number,
  damageType: number,
  impulse: Vec2,
  owner: OwnerRef,
  applyCreatureDamage: CreatureDamageApplier | null,
): void {
  if (damage <= 0.0) return;
  const idx = creatureIndex | 0;
  if (!(idx >= 0 && idx < creatures.length)) return;
  if (applyCreatureDamage !== null) {
    applyCreatureDamage(idx, damage, damageType, impulse, owner);
  } else {
    creatures[idx].hp -= damage;
  }
}

const CREATURE_DAMAGE_TYPE_EXPLOSION = 3;

export class SecondaryProjectilePool {
  private _entries: SecondaryProjectile[];
  private _creatureDamageApplier: CreatureDamageApplier | null;

  constructor(size: number = SECONDARY_PROJECTILE_POOL_SIZE) {
    this._entries = Array.from({ length: size }, () => new SecondaryProjectile());
    this._creatureDamageApplier = null;
  }

  get entries(): SecondaryProjectile[] {
    return this._entries;
  }

  get creatureDamageApplier(): CreatureDamageApplier | null {
    return this._creatureDamageApplier;
  }

  set creatureDamageApplier(value: CreatureDamageApplier | null) {
    this._creatureDamageApplier = value;
  }

  reset(): void {
    for (const entry of this._entries) {
      entry.active = false;
    }
  }

  spawnFromSpec(spec: SecondarySpawnSpec): number {
    const pos = spec.pos;
    const angle = spec.angle;
    const typeId = spec.typeId as SecondaryProjectileTypeId;
    const owner = spec.owner ?? OwnerRef.fromLocalPlayer(0);
    const timeToLive = spec.timeToLive ?? 2.0;
    const targetHint = spec.targetHint ?? null;
    const creatures = spec.creatures ?? null;
    const preserveBugs = spec.preserveBugs ?? false;

    let index: number | null = null;
    for (let i = 0; i < this._entries.length; i++) {
      if (!this._entries[i].active) {
        index = i;
        break;
      }
    }
    if (index === null) {
      index = this._entries.length - 1;
    }

    const entry = this._entries[index];
    entry.active = true;
    entry.angle = angle;
    entry.typeId = typeId;
    entry.pos = pos;
    entry.owner = owner;
    entry.targetId = -1;
    entry.trailTimer = 0.0;
    entry.vel = new Vec2();
    entry.detonationT = 0.0;
    entry.detonationScale = 1.0;

    const rule = secondaryRuleForTypeId(typeId);
    if (rule.tag === 'detonation') {
      entry.detonationT = 0.0;
      entry.detonationScale = timeToLive;
      entry.speed = f32(timeToLive);
      return index;
    }

    if (rule.tag === 'rocket' || rule.tag === 'homing_rocket' || rule.tag === 'rocket_minigun') {
      entry.vel = Vec2.fromHeading(angle).mul(rule.baseSpeed);
      entry.speed = f32(timeToLive);
    }

    if (rule.tag === 'homing_rocket') {
      if (creatures !== null) {
        const origin = targetHint !== null ? targetHint : pos;
        entry.targetId = _creatureFindNearestForSecondary(
          creatures,
          origin,
          preserveBugs,
        );
      }
    }

    return index;
  }

  iterActive(): SecondaryProjectile[] {
    return this._entries.filter((entry) => entry.active);
  }

  step(ctx: SecondaryStepCtx): void {
    const dt = ctx.dt;
    const creatures = ctx.creatures;
    const runtimeState = ctx.runtimeState ?? null;
    const fxQueue = ctx.fxQueue ?? null;
    const detailPreset = ctx.detailPreset ?? 5;
    const onDetonationKill = ctx.onDetonationKill ?? null;

    if (dt <= 0.0) return;

    const _applySecondaryDamage = (
      creatureIndex: number,
      damage: number,
      owner: OwnerRef,
      impulse: Vec2 = new Vec2(),
    ): void => {
      _applyDamageToCreature(
        creatures,
        creatureIndex | 0,
        damage,
        CREATURE_DAMAGE_TYPE_EXPLOSION,
        impulse,
        owner,
        this._creatureDamageApplier,
      );
    };

    let rng: CrandLike = new Crand(0);
    let freezeActive = false;
    let effects: EffectPool | null = null;
    let spriteEffects: SpriteEffectPool | null = null;
    let sfxQueue: SfxId[] | null = null;
    if (runtimeState !== null) {
      rng = runtimeState.rng;
      freezeActive = runtimeState.bonuses.freeze > 0.0;
      effects = (runtimeState.effects as EffectPool | null) ?? null;
      spriteEffects = runtimeState.spriteEffects ?? null;
      sfxQueue = runtimeState.sfxQueue;
    }

    const _creatureIsCollidable = (creature: CreatureState): boolean => {
      if (!creature.active) return false;
      return creatureLifecycleIsCollidable(creature.lifecycleStage);
    };

    const creatureSpatial = new CreatureSpatialHash(creatures, _creatureIsCollidable);

    for (const entry of this._entries) {
      if (!entry.active) continue;

      const rule = secondaryRuleForTypeId(entry.typeId as SecondaryProjectileTypeId);

      if (rule.tag === 'detonation') {
        if (runtimeState !== null) {
          runtimeState.cameraShakePulses = 4;
        }

        entry.detonationT += dt * 3.0;
        const t = entry.detonationT;
        const scale = entry.detonationScale;
        if (t > 1.0) {
          if (fxQueue !== null) {
            fxQueue.add(
              EffectId.AURA,
              entry.pos,
              scale * 256.0,
              scale * 256.0,
              0.0,
              new RGBA(0.0, 0.0, 0.0, 0.25),
            );
          }
          entry.active = false;
        }

        const radius = scale * t * 80.0;
        const radiusSq = radius * radius;
        const damage = dt * scale * 700.0;
        for (const creatureIdx of creatureSpatial.candidateIndices(entry.pos, radius)) {
          const creature = creatures[creatureIdx | 0];
          if (!_creatureIsCollidable(creature)) continue;
          if (creature.hp <= 0.0) continue;
          const dSq = Vec2.distanceSq(entry.pos, creature.pos);
          if (dSq < radiusSq) {
            const hpBefore = creature.hp;
            const impulseDir = entry.pos.directionTo(creature.pos);
            const impulse = impulseDir.mul(0.1);
            _applySecondaryDamage(
              creatureIdx,
              damage,
              entry.owner,
              impulse,
            );
            creatureSpatial.syncIndex(creatureIdx | 0);
            if (onDetonationKill !== null && hpBefore > 0.0 && creature.hp <= 0.0) {
              if (fxQueue !== null) {
                fxQueue.addRandom(creature.pos, rng);
                fxQueue.addRandom(creature.pos, rng);
              }
              onDetonationKill(creatureIdx | 0);
            }
          }
        }
        continue;
      }

      if (rule.tag !== 'rocket' && rule.tag !== 'homing_rocket' && rule.tag !== 'rocket_minigun') {
        continue;
      }

      entry.pos = entry.pos.add(entry.vel.mul(dt));

      const speedMag = entry.vel.length();
      if (rule.tag === 'rocket') {
        if (speedMag < rule.speedCap) {
          const factor = 1.0 + dt * rule.accelFactorScale;
          entry.vel = entry.vel.mul(factor);
        }
        entry.speed = f32(entry.speed - dt * rule.ttlDecayScale);
      } else if (rule.tag === 'rocket_minigun') {
        if (speedMag < rule.speedCap) {
          const factor = 1.0 + dt * rule.accelFactorScale;
          entry.vel = entry.vel.mul(factor);
        }
        entry.speed = f32(entry.speed - dt * rule.ttlDecayScale);
      } else if (rule.tag === 'homing_rocket') {
        let targetId = entry.targetId;
        if (!(targetId >= 0 && targetId < creatures.length) || !creatures[targetId].active) {
          entry.targetId = _creatureFindNearestForSecondary(
            creatures,
            entry.pos,
            runtimeState !== null ? runtimeState.preserveBugs : false,
          );
          targetId = entry.targetId;
        }

        if (targetId >= 0 && targetId < creatures.length) {
          const target = creatures[targetId];
          const toTarget = target.pos.sub(entry.pos);
          const [targetDir, dist] = toTarget.normalizedWithLength();
          if (dist > 1e-6) {
            entry.angle = toTarget.toHeading();
            const accel = targetDir.mul(dt * rule.targetAccel);
            const nextVelocity = entry.vel.add(accel);
            if (nextVelocity.length() <= rule.maxVelocity) {
              entry.vel = nextVelocity;
            }
          }
        }

        entry.speed = f32(entry.speed - dt * rule.ttlDecayScale);
      }

      const trailDecay = f32((Math.abs(entry.vel.x) + Math.abs(entry.vel.y)) * dt * 0.01);
      entry.trailTimer = f32(entry.trailTimer - trailDecay);
      if (entry.trailTimer < 0.0) {
        const direction = Vec2.fromHeading(entry.angle);
        const spawnPos = entry.pos.sub(direction.mul(9.0));
        const trailVelocity = Vec2.fromHeading(entry.angle + Math.PI).mul(90.0);
        if (spriteEffects !== null) {
          spriteEffects.spawn(
            spawnPos,
            trailVelocity,
            14.0,
            new RGBA(1.0, 1.0, 1.0, 0.25),
          );
        }
        entry.trailTimer = f32(0.06);
      }

      let hitIdx: number | null = null;
      for (const idx of creatureSpatial.candidateIndices(entry.pos, 8.0)) {
        const creature = creatures[idx | 0];
        if (!_creatureIsCollidable(creature)) continue;
        if (_withinNativeFindRadius(
          entry.pos,
          creature.pos,
          8.0,
          creature.size,
        )) {
          hitIdx = idx;
          break;
        }
      }
      if (hitIdx !== null) {
        if (runtimeState !== null) {
          const ownerPlayerIndex = entry.owner.playerIndexInBounds(
            runtimeState.shotsHit.length,
          );
          if (ownerPlayerIndex !== null && creatureLifecycleIsAlive(
            creatures[hitIdx | 0].lifecycleStage,
          )) {
            const shotsHit: number[] = runtimeState.shotsHit;
            shotsHit[ownerPlayerIndex] += 1;
          }
        }

        if (sfxQueue !== null) {
          sfxQueue.push(SfxId.EXPLOSION_MEDIUM);
        }

        let detScale = 0.5;
        let damageSpeedMul = 0.0;
        let damageBase = 150.0;
        let burstScale: number | null = null;
        let burstMinDetail = 0;
        let extraDecals = 0;
        let extraRadius = 0.0;
        let freezeShardTargetPos = false;
        if (rule.tag === 'rocket') {
          detScale = rule.detonationScale;
          damageSpeedMul = rule.damageSpeedMul;
          damageBase = rule.damageBase;
          burstScale = rule.burstScale;
          burstMinDetail = rule.burstMinDetail;
          extraDecals = rule.extraDecals;
          extraRadius = rule.extraRadius;
          freezeShardTargetPos = rule.freezeShardTargetPos;
        } else if (rule.tag === 'homing_rocket') {
          detScale = rule.detonationScale;
          damageSpeedMul = rule.damageSpeedMul;
          damageBase = rule.damageBase;
          extraDecals = rule.extraDecals;
          extraRadius = rule.extraRadius;
          freezeShardTargetPos = rule.freezeShardTargetPos;
        } else if (rule.tag === 'rocket_minigun') {
          detScale = rule.detonationScale;
          damageSpeedMul = rule.damageSpeedMul;
          damageBase = rule.damageBase;
          extraDecals = rule.extraDecals;
          extraRadius = rule.extraRadius;
          freezeShardTargetPos = rule.freezeShardTargetPos;
        }

        if (freezeActive) {
          if (effects !== null) {
            for (let i = 0; i < 4; i++) {
              const shardAngle = (rng.rand(RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_PRE_HIT_FREEZE_SHARD_ANGLE) % 612) * 0.01;
              effects.spawnFreezeShard(
                entry.pos,
                shardAngle,
                rng,
                detailPreset | 0,
              );
            }
          }
        } else if (fxQueue !== null) {
          for (const [dxCaller, dyCaller] of _SECONDARY_PRE_HIT_DECAL_CALLERS) {
            const offset = new Vec2(
              (rng.rand(dxCaller) % 20 - 10),
              (rng.rand(dyCaller) % 20 - 10),
            );
            fxQueue.addRandom(
              creatures[hitIdx].pos.add(offset),
              rng,
            );
          }
        }

        if (burstScale !== null && effects !== null && (detailPreset | 0) > (burstMinDetail | 0)) {
          effects.spawnExplosionBurst(
            entry.pos,
            burstScale,
            rng,
            detailPreset | 0,
          );
        }

        const damage = entry.speed * damageSpeedMul + damageBase;
        _applySecondaryDamage(
          hitIdx,
          damage,
          entry.owner,
          entry.vel.div(dt),
        );
        creatureSpatial.syncIndex(hitIdx | 0);

        entry.typeId = SecondaryProjectileTypeId.DETONATION;
        entry.vel = new Vec2();
        entry.detonationT = 0.0;
        entry.detonationScale = detScale;
        entry.trailTimer = 0.0;

        if (freezeActive) {
          if (effects !== null) {
            let shardPos = entry.pos;
            let freezeAngleCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_ROCKET_FREEZE_SHARD_ANGLE;
            if (rule.tag === 'homing_rocket') {
              freezeAngleCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_SEEKER_ROCKET_FREEZE_SHARD_ANGLE;
            } else if (rule.tag === 'rocket_minigun') {
              freezeAngleCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_ROCKET_MINIGUN_FREEZE_SHARD_ANGLE;
            }
            if (freezeShardTargetPos) {
              shardPos = creatures[hitIdx].pos;
            }
            for (let i = 0; i < 8; i++) {
              const shardAngle = (rng.rand(freezeAngleCaller) % 612) * 0.01;
              effects.spawnFreezeShard(
                shardPos,
                shardAngle,
                rng,
                detailPreset | 0,
              );
            }
          }
        } else {
          if (fxQueue !== null && extraDecals > 0) {
            const center = creatures[hitIdx].pos;
            let angleCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_ROCKET_DECAL_ANGLE;
            let radiusCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_ROCKET_DECAL_RADIUS;
            if (rule.tag === 'homing_rocket') {
              angleCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_SEEKER_ROCKET_DECAL_ANGLE;
              radiusCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_SEEKER_ROCKET_DECAL_RADIUS;
            } else if (rule.tag === 'rocket_minigun') {
              angleCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_ROCKET_MINIGUN_DECAL_ANGLE;
              radiusCaller = RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_ROCKET_MINIGUN_DECAL_RADIUS;
            }
            for (let i = 0; i < (extraDecals | 0); i++) {
              const angle = (rng.rand(angleCaller) % 628) * 0.01;
              let radius: number;
              if (rule.tag === 'homing_rocket') {
                radius = rng.rand(radiusCaller) & 0x3F;
              } else {
                radius = rng.rand(radiusCaller) % Math.max(1, extraRadius | 0);
              }
              fxQueue.addRandom(
                center.add(Vec2.fromAngle(angle).mul(radius)),
                rng,
              );
            }
          }
        }

        if (spriteEffects !== null) {
          const step = Math.PI * 2.0 / 10.0;
          for (let idx = 0; idx < 10; idx++) {
            const mag = (rng.rand(RngCallerStatic.SECONDARY_PROJECTILE_UPDATE_DETONATION_SPRITE_MAG) % 800) * 0.1;
            const ang = idx * step;
            const velocity = Vec2.fromAngle(ang).mul(mag);
            spriteEffects.spawn(
              entry.pos,
              velocity,
              14.0,
              new RGBA(1.0, 1.0, 1.0, 0.37),
            );
          }
        }

        continue;
      }

      if (entry.speed < 0.0) {
        entry.typeId = SecondaryProjectileTypeId.DETONATION;
        entry.vel = new Vec2();
        entry.detonationT = 0.0;
        entry.detonationScale = 0.5;
        entry.trailTimer = 0.0;
      }
    }
  }
}
