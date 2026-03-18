// Port of crimson/projectiles/runtime/behaviors.py

import { Vec2 } from '../../../grim/geom.ts';
import type { CrandLike } from '../../../grim/rand.ts';
import type { SfxId } from '../../../grim/sfx-map.ts';
import { CreatureDamageType } from '../../creatures/damage-types.ts';
import { creatureLifecycleIsCollidable } from '../../creatures/lifecycle.ts';
import { CreatureFlags } from '../../creatures/spawn-ids.ts';
import type { EffectPool, CreatureStateLike } from '../../effects.ts';
import { f32 } from '../../math-parity.ts';
import { OwnerRef } from '../../owner-ref.ts';
import { RngCallerStatic } from '../../rng-caller-static.ts';
import { weaponEntryForProjectileTypeId } from '../../weapons.ts';
import {
  spawnIonHitEffects,
  spawnPlasmaCannonHitEffects,
  spawnShrinkifierHitEffects,
  spawnSplitterHitEffects,
} from '../effects.ts';
import {
  Projectile,
  ProjectileTemplateId,
} from '../types.ts';
import { applyDamageToCreature, hitRadiusFor } from './collision.ts';

export type CreatureStateForBehavior = CreatureStateLike;

export interface ProjectilePoolLike {
  creatureDamageApplier: ((
    creatureIndex: number,
    damage: number,
    damageType: number,
    knockback: Vec2,
    owner: OwnerRef,
  ) => void) | null;
  spawn(
    pos: Vec2,
    angle: number,
    typeId: ProjectileTemplateId,
    owner: OwnerRef,
    travelBudget: number,
    hitsPlayers?: boolean,
  ): number;
}

export interface GameplayStateLike {
  shockChainProjectileId: number;
  shockChainLinksLeft: number;
  preserveBugs: boolean;
  bonusSpawnGuard: boolean;
}

export class ProjectileUpdateCtx {
  pool: ProjectilePoolLike;
  creatures: readonly CreatureStateLike[];
  dt: number;
  ionScale: number;
  detailPreset: number;
  rng: CrandLike;
  runtimeState: GameplayStateLike | null;
  effects: EffectPool | null;
  sfxQueue: SfxId[] | null;

  constructor(
    pool: ProjectilePoolLike,
    creatures: readonly CreatureStateLike[],
    dt: number,
    ionScale: number,
    detailPreset: number,
    rng: CrandLike,
    runtimeState: GameplayStateLike | null,
    effects: EffectPool | null,
    sfxQueue: SfxId[] | null,
  ) {
    this.pool = pool;
    this.creatures = creatures;
    this.dt = dt;
    this.ionScale = ionScale;
    this.detailPreset = detailPreset;
    this.rng = rng;
    this.runtimeState = runtimeState;
    this.effects = effects;
    this.sfxQueue = sfxQueue;
  }
}

export class ProjectileHitInfo {
  projIndex: number;
  proj: Projectile;
  hitIdx: number;
  move: Vec2;
  target: Vec2;

  constructor(
    projIndex: number,
    proj: Projectile,
    hitIdx: number,
    move: Vec2,
    target: Vec2,
  ) {
    this.projIndex = projIndex;
    this.proj = proj;
    this.hitIdx = hitIdx;
    this.move = move;
    this.target = target;
  }
}

export class ProjectileHitPerkCtx {
  proj: Projectile;
  creature: CreatureStateForBehavior;
  rng: CrandLike;
  ownerPerkActive: (owner: OwnerRef, perkIdx: number) => boolean;
  poisonIdx: number;

  constructor(
    proj: Projectile,
    creature: CreatureStateForBehavior,
    rng: CrandLike,
    ownerPerkActive: (owner: OwnerRef, perkIdx: number) => boolean,
    poisonIdx: number,
  ) {
    this.proj = proj;
    this.creature = creature;
    this.rng = rng;
    this.ownerPerkActive = ownerPerkActive;
    this.poisonIdx = poisonIdx;
  }
}

export type ProjectileHitPerkHook = (ctx: ProjectileHitPerkCtx) => void;

const CREATURE_FLAGS_SELF_DAMAGE_TICK = CreatureFlags.SELF_DAMAGE_TICK as number;

export function projectileHitPerkPoisonBullets(ctx: ProjectileHitPerkCtx): void {
  if (
    ctx.ownerPerkActive(ctx.proj.owner, ctx.poisonIdx) &&
    (ctx.rng.rand(RngCallerStatic.PROJECTILE_UPDATE_POISON_BULLETS_GATE) & 7) === 1
  ) {
    ctx.creature.flags |= CREATURE_FLAGS_SELF_DAMAGE_TICK;
  }
}

export const PROJECTILE_HIT_PERK_HOOKS: readonly ProjectileHitPerkHook[] = [projectileHitPerkPoisonBullets];

function lifeTimerSubF32(lifeTimer: number, amount: number): number {
  return f32(lifeTimer - amount);
}

export function lingerDefault(ctx: ProjectileUpdateCtx, proj: Projectile): void {
  proj.lifeTimer = lifeTimerSubF32(proj.lifeTimer, ctx.dt);
}

export function lingerGaussGun(ctx: ProjectileUpdateCtx, proj: Projectile): void {
  proj.lifeTimer = lifeTimerSubF32(proj.lifeTimer, ctx.dt * 0.1);
}

const CREATURE_DAMAGE_TYPE_ION = CreatureDamageType.ION as number;
const CREATURE_DAMAGE_TYPE_BULLET = CreatureDamageType.BULLET as number;

function lingerIonAoe(
  ctx: ProjectileUpdateCtx,
  proj: Projectile,
  lifeDecayScale: number,
  damagePerSecond: number,
  baseRadius: number,
): void {
  proj.lifeTimer = lifeTimerSubF32(proj.lifeTimer, ctx.dt * lifeDecayScale);
  const damage = ctx.dt * damagePerSecond;
  const radius = ctx.ionScale * baseRadius;
  for (let creatureIdx = 0; creatureIdx < ctx.creatures.length; creatureIdx++) {
    const creature = ctx.creatures[creatureIdx];
    if (!creature.active) {
      continue;
    }
    if (!creatureLifecycleIsCollidable(creature.lifecycleStage)) {
      continue;
    }
    const creatureRadius = hitRadiusFor(creature);
    const hitR = radius + creatureRadius;
    if (Vec2.distanceSq(proj.pos, creature.pos) <= hitR * hitR) {
      applyDamageToCreature(
        ctx.creatures,
        creatureIdx,
        damage,
        CREATURE_DAMAGE_TYPE_ION,
        new Vec2(),
        proj.owner,
        ctx.pool.creatureDamageApplier,
      );
    }
  }
}

export function lingerIonMinigun(ctx: ProjectileUpdateCtx, proj: Projectile): void {
  lingerIonAoe(ctx, proj, 1.0, 40.0, 60.0);
}

export function lingerIonRifle(ctx: ProjectileUpdateCtx, proj: Projectile): void {
  lingerIonAoe(ctx, proj, 1.0, 100.0, 88.0);
}

export function lingerIonCannon(ctx: ProjectileUpdateCtx, proj: Projectile): void {
  lingerIonAoe(ctx, proj, 0.7, 300.0, 128.0);
}

export function preHitSplitter(ctx: ProjectileUpdateCtx, proj: Projectile, hitIdx: number): void {
  spawnSplitterHitEffects(
    ctx.effects,
    proj.pos,
    ctx.rng,
    ctx.detailPreset,
  );
  const splitHitsPlayers = true;
  ctx.pool.spawn(
    proj.pos,
    proj.angle - 1.0471976,
    ProjectileTemplateId.SPLITTER_GUN,
    OwnerRef.fromCreature(hitIdx | 0),
    proj.travelBudget,
    splitHitsPlayers,
  );
  ctx.pool.spawn(
    proj.pos,
    proj.angle + 1.0471976,
    ProjectileTemplateId.SPLITTER_GUN,
    OwnerRef.fromCreature(hitIdx | 0),
    proj.travelBudget,
    splitHitsPlayers,
  );
}

export function postHitIonCommon(ctx: ProjectileUpdateCtx, hit: ProjectileHitInfo): void {
  spawnIonHitEffects(
    ctx.effects,
    ctx.sfxQueue,
    hit.proj.typeId as ProjectileTemplateId,
    hit.proj.pos,
    ctx.rng,
    ctx.detailPreset,
  );
}

export function postHitIonRifle(ctx: ProjectileUpdateCtx, hit: ProjectileHitInfo): void {
  const runtimeState = ctx.runtimeState;
  const creatures = ctx.creatures;
  const hitCreature = hit.hitIdx | 0;
  if (
    runtimeState !== null &&
    runtimeState.shockChainProjectileId === hit.projIndex &&
    0 <= hitCreature && hitCreature < creatures.length
  ) {
    let linksLeft = runtimeState.shockChainLinksLeft | 0;
    if (linksLeft > 0 && creatures.length > 0) {
      runtimeState.shockChainLinksLeft = linksLeft - 1;

      const originPos = hit.proj.pos;
      const minDistSq = 100.0 * 100.0;

      let bestIdx = runtimeState.preserveBugs ? 0 : -1;
      let bestDistSq = 1e12;
      for (let creatureId = 0; creatureId < creatures.length; creatureId++) {
        if (creatureId === hitCreature) {
          continue;
        }
        const creature = creatures[creatureId];
        if (!creature.active) {
          continue;
        }
        const dSq = Vec2.distanceSq(originPos, creature.pos);
        if (dSq <= minDistSq) {
          continue;
        }
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = creatureId;
        }
      }

      if (bestIdx < 0) {
        postHitIonCommon(ctx, hit);
        return;
      }

      const origin = creatures[hitCreature];
      const target = creatures[bestIdx];
      const angle = target.pos.sub(origin.pos).toHeading();

      const prevGuard = runtimeState.bonusSpawnGuard;
      runtimeState.bonusSpawnGuard = true;
      let projId: number;
      try {
        projId = ctx.pool.spawn(
          originPos,
          angle,
          hit.proj.typeId as ProjectileTemplateId,
          OwnerRef.fromCreature(hitCreature),
          hit.proj.travelBudget,
        );
      } finally {
        runtimeState.bonusSpawnGuard = prevGuard;
      }
      runtimeState.shockChainProjectileId = projId;
    }
  }
  postHitIonCommon(ctx, hit);
}

export function postHitPlasmaCannon(ctx: ProjectileUpdateCtx, hit: ProjectileHitInfo): void {
  const creature = ctx.creatures[hit.hitIdx | 0];
  const size = creature.size;
  const ringRadius = size * 0.5 + 1.0;

  const plasmaEntry = weaponEntryForProjectileTypeId(ProjectileTemplateId.PLASMA_RIFLE);
  const plasmaMeta = plasmaEntry.travelBudget;

  const runtimeState = ctx.runtimeState;
  let prevGuard = false;
  if (runtimeState !== null) {
    prevGuard = runtimeState.bonusSpawnGuard;
    runtimeState.bonusSpawnGuard = true;
  }
  try {
    for (let ringIdx = 0; ringIdx < 12; ringIdx++) {
      const ringAngle = ringIdx * (Math.PI / 6.0);
      const ringOffset = Vec2.fromAngle(ringAngle).mul(ringRadius);
      ctx.pool.spawn(
        hit.proj.pos.add(ringOffset),
        ringAngle,
        ProjectileTemplateId.PLASMA_RIFLE,
        OwnerRef.fromLocalPlayer(0),
        plasmaMeta,
      );
    }
  } finally {
    if (runtimeState !== null) {
      runtimeState.bonusSpawnGuard = prevGuard;
    }
  }

  spawnPlasmaCannonHitEffects(
    ctx.effects,
    ctx.sfxQueue,
    hit.proj.pos,
    ctx.detailPreset,
  );
}

export function postHitShrinkifier(ctx: ProjectileUpdateCtx, hit: ProjectileHitInfo): void {
  spawnShrinkifierHitEffects(
    ctx.effects,
    hit.proj.pos,
    ctx.rng,
    ctx.detailPreset,
  );

  const creature = ctx.creatures[hit.hitIdx | 0];
  const newSize = creature.size * 0.65;
  creature.size = newSize;
  if (newSize < 16.0) {
    applyDamageToCreature(
      ctx.creatures,
      hit.hitIdx | 0,
      creature.hp + 1.0,
      CREATURE_DAMAGE_TYPE_BULLET,
      new Vec2(),
      hit.proj.owner,
      ctx.pool.creatureDamageApplier,
    );
  }
  hit.proj.lifeTimer = 0.25;
}

export function postHitPulseGun(ctx: ProjectileUpdateCtx, hit: ProjectileHitInfo): void {
  const creature = ctx.creatures[hit.hitIdx | 0];
  creature.pos = creature.pos.add(hit.move.mul(3.0));
}

export function postHitPlagueSpreader(ctx: ProjectileUpdateCtx, hit: ProjectileHitInfo): void {
  const creature = ctx.creatures[hit.hitIdx | 0];
  creature.plagueInfected = true;
}
