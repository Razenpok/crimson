import { Vec2 } from '../../../grim/geom.ts';
import type { CrandLike } from '../../../grim/rand.ts';
import type { SfxId } from '../../../grim/sfx-map.ts';
import { creatureLifecycleIsAlive, creatureLifecycleIsCollidable } from '../../creatures/lifecycle.ts';
import type { EffectPool } from '../../effects.ts';
import type { CreatureStateLike } from '../../effects.ts';
import { f32, NATIVE_HALF_PI } from '../../math-parity.ts';
import { OwnerRef } from '../../owner-ref.ts';
import { PerkId } from '../../perks/ids.ts';
import { RngCallerStatic } from '../../rng-caller-static.ts';
import type { GameplayState } from '../../sim/state-types.ts';
import type { PlayerState } from '../../sim/state-types.ts';
import { weaponEntryForProjectileTypeId } from '../../weapons.ts';
import {
  MAIN_PROJECTILE_POOL_SIZE,
  type CreatureDamageApplier,
  Projectile,
  type ProjectileCollisionProfile,
  type ProjectileHit,
  ProjectileTemplateId,
} from '../types.ts';
import {
  PROJECTILE_HIT_PERK_HOOKS,
  ProjectileUpdateCtx,
  type ProjectileHitPerkCtx,
} from './behaviors.ts';
import { applyDamageToCreature, hitRadiusFor, withinNativeFindRadius } from './collision.ts';
import { primaryRuleForTypeId } from './primary-rules.ts';
import { CreatureSpatialHash } from './spatial-hash.ts';

export const enum CreatureDamageType {
  SELF_TICK = 0,
  BULLET = 1,
  MELEE = 2,
  FIRE = 4,
  ION = 7,
}

export interface ProjectileUpdateOptions {
  readonly worldSize: number;
  readonly damageScaleByType: Map<number, number>;
  readonly rng: CrandLike;
  readonly runtimeState: GameplayState;
  readonly players: readonly PlayerState[];
  readonly applyPlayerDamage: (playerIndex: number, damage: number) => void;
  readonly ionAoeScale?: number;
  readonly detailPreset?: number;
  readonly onHit?: ((hit: ProjectileHit) => unknown) | null;
  readonly onHitPost?: ((hit: ProjectileHit, ctx: unknown) => void) | null;
}

export interface PrimaryStepCtx {
  readonly dt: number;
  readonly creatures: readonly CreatureStateLike[];
  readonly options: ProjectileUpdateOptions;
}

const _DEFAULT_PROJECTILE_COLLISION_PROFILE: ProjectileCollisionProfile = {
  hitRadius: 1.0,
  initialDamagePool: 1.0,
};

const _PROJECTILE_COLLISION_PROFILE_BY_TYPE_ID: Map<ProjectileTemplateId, ProjectileCollisionProfile> = new Map([
  [ProjectileTemplateId.ION_MINIGUN, { hitRadius: 3.0, initialDamagePool: 1.0 }],
  [ProjectileTemplateId.ION_RIFLE, { hitRadius: 5.0, initialDamagePool: 1.0 }],
  [ProjectileTemplateId.ION_CANNON, { hitRadius: 10.0, initialDamagePool: 1.0 }],
  [ProjectileTemplateId.PLASMA_CANNON, { hitRadius: 10.0, initialDamagePool: 1.0 }],
  [ProjectileTemplateId.GAUSS_GUN, { hitRadius: 1.0, initialDamagePool: 300.0 }],
  [ProjectileTemplateId.FIRE_BULLETS, { hitRadius: 1.0, initialDamagePool: 240.0 }],
  [ProjectileTemplateId.BLADE_GUN, { hitRadius: 1.0, initialDamagePool: 50.0 }],
]);

export function projectileCollisionProfile(typeId: ProjectileTemplateId): ProjectileCollisionProfile {
  return _PROJECTILE_COLLISION_PROFILE_BY_TYPE_ID.get(typeId) ?? _DEFAULT_PROJECTILE_COLLISION_PROFILE;
}

export class ProjectilePool {
  private _entries: Projectile[];
  private _creatureDamageApplier: CreatureDamageApplier | null = null;

  constructor(size: number = MAIN_PROJECTILE_POOL_SIZE) {
    this._entries = Array.from({ length: size }, () => new Projectile());
  }

  get entries(): Projectile[] {
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

  spawn(
    pos: Vec2,
    angle: number,
    typeId: ProjectileTemplateId,
    owner: OwnerRef,
    travelBudget: number = 0.0,
    hitsPlayers: boolean = false,
  ): number {
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
    const angleF32 = f32(angle);
    const posF32 = new Vec2(f32(pos.x), f32(pos.y));
    entry.angle = angleF32;
    entry.pos = posF32;
    entry.origin = posF32;
    entry.vel = new Vec2(
      f32(Math.cos(angleF32) * 1.5),
      f32(Math.sin(angleF32) * 1.5),
    );
    entry.typeId = typeId;
    entry.lifeTimer = 0.4;
    entry.reserved = 0.0;
    entry.speedScale = 1.0;
    entry.travelBudget = travelBudget;
    const weaponEntry = weaponEntryForProjectileTypeId(typeId);
    entry.travelBudget = weaponEntry.travelBudget;
    entry.owner = owner;
    entry.hitsPlayers = hitsPlayers;

    const collisionProfile = projectileCollisionProfile(typeId);
    entry.hitRadius = collisionProfile.hitRadius;
    entry.damagePool = collisionProfile.initialDamagePool;
    return index;
  }

  iterActive(): Projectile[] {
    return this._entries.filter((entry) => entry.active);
  }

  step(ctx: PrimaryStepCtx): ProjectileHit[] {
    const dt = f32(ctx.dt);
    const creatures = ctx.creatures;
    const options = ctx.options;
    const worldSize = f32(options.worldSize);
    const damageScaleByType = options.damageScaleByType;
    const ionAoeScale = options.ionAoeScale ?? 1.0;
    const detailPreset = options.detailPreset ?? 5;
    const rng = options.rng;
    const runtimeState = options.runtimeState;
    const players = options.players;
    const applyPlayerDamage = options.applyPlayerDamage;
    const applyCreatureDamage = this._creatureDamageApplier;
    const onHit = options.onHit ?? null;
    const onHitPost = options.onHitPost ?? null;

    if (dt <= 0.0) {
      return [];
    }

    let barrelGreaserActive = false;
    let ionGunMasterActive = false;
    let ionScale = ionAoeScale;
    const poisonIdx = PerkId.POISON_BULLETS as number;
    const barrelIdx = PerkId.BARREL_GREASER as number;
    const ionIdx = PerkId.ION_GUN_MASTER as number;
    for (const player of players) {
      const perkCounts = player.perkCounts;

      if (barrelIdx >= 0 && barrelIdx < perkCounts.length && perkCounts[barrelIdx] > 0) {
        barrelGreaserActive = true;
      }
      if (ionIdx >= 0 && ionIdx < perkCounts.length && perkCounts[ionIdx] > 0) {
        ionGunMasterActive = true;
      }
      if (barrelGreaserActive && ionGunMasterActive) {
        break;
      }
    }

    if (ionScale === 1.0 && ionGunMasterActive) {
      ionScale = 1.2;
    }

    const _ownerPerkActive = (owner: OwnerRef, perkIdx: number): boolean => {
      const playerIndex = owner.playerIndexInBounds(players.length);
      if (playerIndex === null) {
        return false;
      }
      const perkCounts = players[playerIndex].perkCounts;
      return perkIdx >= 0 && perkIdx < perkCounts.length && perkCounts[perkIdx] > 0;
    };

    const effects: EffectPool | null = runtimeState.effects ?? null;
    const sfxQueue: SfxId[] | null = runtimeState.sfxQueue ?? null;

    const hits: ProjectileHit[] = [];
    const margin = 64.0;

    const _creatureIsCollidable = (creature: CreatureStateLike): boolean => {
      if (!creature.active) {
        return false;
      }
      if (!creatureLifecycleIsCollidable(creature.lifecycleStage)) {
        return false;
      }
      return true;
    };

    const creatureSpatial = new CreatureSpatialHash(creatures, _creatureIsCollidable);

    const _damageScale = (typeId: number): number => {
      const value = damageScaleByType.get(typeId);
      if (value !== undefined) {
        return value;
      }
      return weaponEntryForProjectileTypeId(typeId as ProjectileTemplateId).damageScale;
    };

    const _damageDistanceF32 = (origin: Vec2, pos: Vec2): number => {
      const dx = f32(origin.x - pos.x);
      const dy = f32(origin.y - pos.y);
      const distSq = f32(f32(dx * dx) + f32(dy * dy));
      return f32(Math.sqrt(distSq));
    };

    const _projectileDamageAmountF32 = (dist: number, damageScale: number): number => {
      let distF32 = f32(dist);
      if (distF32 < 50.0) {
        distF32 = 50.0;
      }
      const damageScaleF32 = f32(damageScale);
      return f32(((100.0 / distF32) * damageScaleF32 * 30.0 + 10.0) * 0.95);
    };

    const _damageTypeFor = (): number => {
      return CreatureDamageType.BULLET;
    };

    const updateCtx = new ProjectileUpdateCtx(
      this,
      creatures,
      dt,
      ionScale,
      detailPreset,
      rng,
      runtimeState,
      effects,
      sfxQueue,
    );

    const _resetShockChainIfOwner = (index: number): void => {
      if (runtimeState.shockChainProjectileId !== index) {
        return;
      }
      runtimeState.shockChainProjectileId = -1;
      runtimeState.shockChainLinksLeft = 0;
    };

    for (let projIndex = 0; projIndex < this._entries.length; projIndex++) {
      const proj = this._entries[projIndex];
      if (!proj.active) {
        continue;
      }
      const rule = primaryRuleForTypeId(proj.typeId as ProjectileTemplateId);

      if (proj.lifeTimer <= 0.0) {
        proj.active = false;
      }

      if (proj.lifeTimer < 0.4) {
        if (rule.resetShockChainOnLinger) {
          _resetShockChainIfOwner(projIndex);
        }
        rule.linger(updateCtx, proj);
        continue;
      }

      if (
        proj.pos.x < -margin ||
        proj.pos.y < -margin ||
        proj.pos.x > worldSize + margin ||
        proj.pos.y > worldSize + margin
      ) {
        proj.lifeTimer = f32(proj.lifeTimer - dt);
        continue;
      }

      let steps = proj.travelBudget | 0;
      if (barrelGreaserActive && proj.owner.isPlayer()) {
        steps *= 2;
      }

      const headingRadians = proj.angle - NATIVE_HALF_PI;
      const dirX = Math.cos(headingRadians);
      const dirY = Math.sin(headingRadians);
      let acc = new Vec2();
      let step = 0;
      while (step < steps) {
        acc = new Vec2(
          f32(
            acc.x +
            f32(dirX * dt * 20.0) * proj.speedScale * 3.0,
          ),
          f32(
            acc.y +
            f32(dirY * dt * 20.0) * proj.speedScale * 3.0,
          ),
        );

        if (acc.length() >= 4.0 || steps <= step + 3) {
          const move = acc;
          proj.pos = new Vec2(
            f32(proj.pos.x + move.x),
            f32(proj.pos.y + move.y),
          );
          acc = new Vec2();

          let hitIdx: number | null = null;
          const ownerCreatureIdx = proj.owner.creatureIndexInBounds(creatures.length);
          for (const idx of creatureSpatial.candidateIndices(proj.pos, proj.hitRadius)) {
            const creature = creatures[idx];
            if (!_creatureIsCollidable(creature)) {
              continue;
            }
            if (withinNativeFindRadius(
              proj.pos,
              creature.pos,
              proj.hitRadius,
              creature.size,
            )) {
              hitIdx = idx;
              break;
            }
          }

          const ownerCollision =
            hitIdx !== null && ownerCreatureIdx !== null && hitIdx === ownerCreatureIdx;
          if (ownerCollision) {
            hitIdx = null;
          }

          if (hitIdx === null) {
            let canHitPlayers = true;
            if (projIndex === runtimeState.shockChainProjectileId) {
              canHitPlayers = false;
            }

            if (proj.hitsPlayers && canHitPlayers) {
              let hitPlayerIdx: number | null = null;
              const ownerPlayerIndex = proj.owner.playerIndexInBounds(players.length);
              for (let idx = 0; idx < players.length; idx++) {
                const player = players[idx];
                if (ownerPlayerIndex !== null && idx === ownerPlayerIndex) {
                  continue;
                }
                if (player.health <= 0.0) {
                  continue;
                }
                if (withinNativeFindRadius(
                  proj.pos,
                  player.pos,
                  proj.hitRadius,
                  player.size,
                )) {
                  hitPlayerIdx = idx;
                  break;
                }
              }

              if (hitPlayerIdx === null) {
                step += 3;
                continue;
              }

              proj.lifeTimer = 0.25;
              applyPlayerDamage(hitPlayerIdx, 10.0);

              step += 3;
              continue;
            }

            step += 3;
            continue;
          }

          const typeId = proj.typeId;
          const creature = creatures[hitIdx];

          const perkCtx: ProjectileHitPerkCtx = {
            proj,
            creature,
            rng,
            ownerPerkActive: _ownerPerkActive,
            poisonIdx,
          };
          for (const hook of PROJECTILE_HIT_PERK_HOOKS) {
            hook(perkCtx);
          }

          rule.preHit(updateCtx, proj, hitIdx);

          const ownerPlayerIndex = proj.owner.playerIndexInBounds(
            (runtimeState.shotsHit ?? []).length,
          );
          if (ownerPlayerIndex !== null && creatureLifecycleIsAlive(creature.lifecycleStage)) {
            const shotsHit: number[] = runtimeState.shotsHit;
            shotsHit[ownerPlayerIndex] += 1;
          }

          const target = creature.pos;
          const hit: ProjectileHit = {
            typeId,
            origin: proj.origin,
            hit: proj.pos,
            target,
          };
          hits.push(hit);
          const hitCtx = onHit !== null ? onHit(hit) : null;

          if (proj.lifeTimer !== 0.25 && rule.stopOnHit) {
            proj.lifeTimer = 0.25;
            const jitter = rng.rand(RngCallerStatic.PROJECTILE_UPDATE_STOP_ON_HIT_JITTER) & 3;
            const jitterDx = f32(dirX * jitter);
            const jitterDy = f32(dirY * jitter);
            proj.pos = new Vec2(
              f32(proj.pos.x + jitterDx),
              f32(proj.pos.y + jitterDy),
            );
          }

          const dist = _damageDistanceF32(proj.origin, proj.pos);

          rule.postHit(
            updateCtx,
            {
              projIndex,
              proj,
              hitIdx,
              move,
              target,
            },
          );

          const damageScale = _damageScale(typeId);
          const damageAmount = _projectileDamageAmountF32(dist, damageScale);

          if (damageAmount > 0.0 && creature.hp > 0.0) {
            const remaining = proj.damagePool - 1.0;
            proj.damagePool = remaining;
            const impulseAxis = f32(Math.cos(proj.angle - NATIVE_HALF_PI) * proj.speedScale);
            const impulse = new Vec2(impulseAxis, impulseAxis);
            const damageType = _damageTypeFor();
            if (remaining <= 0.0) {
              applyDamageToCreature(
                creatures,
                hitIdx,
                damageAmount,
                damageType,
                impulse,
                proj.owner,
                applyCreatureDamage,
              );
              creatureSpatial.syncIndex(hitIdx);
              if (proj.lifeTimer !== 0.25) {
                proj.lifeTimer = 0.25;
              }
            } else {
              applyDamageToCreature(
                creatures,
                hitIdx,
                remaining,
                damageType,
                impulse,
                proj.owner,
                applyCreatureDamage,
              );
              creatureSpatial.syncIndex(hitIdx);
              proj.damagePool -= creature.hp;
            }
          }

          if (
            runtimeState.bonuses?.freeze > 0.0 &&
            effects !== null &&
            rule.emitDefaultFreezeShard
          ) {
            let shardAngle = proj.angle - NATIVE_HALF_PI;
            shardAngle +=
              (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_DEFAULT_FREEZE_SHARD_ANGLE) % 100) * 0.01;
            effects.spawnFreezeShard(
              proj.pos,
              shardAngle,
              rng,
              detailPreset,
            );
          }

          if (proj.damagePool === 1.0) {
            const lifeBefore = proj.lifeTimer;
            proj.damagePool = 0.0;
            if (lifeBefore !== 0.25) {
              proj.lifeTimer = 0.25;
            }
          }

          if (proj.lifeTimer === 0.25 && rule.stopOnHit) {
            if (onHitPost !== null && hitCtx !== null) {
              onHitPost(hit, hitCtx);
            }
            break;
          }

          if (proj.damagePool <= 0.0) {
            if (onHitPost !== null && hitCtx !== null) {
              onHitPost(hit, hitCtx);
            }
            break;
          }

          if (onHitPost !== null && hitCtx !== null) {
            onHitPost(hit, hitCtx);
          }
        }

        step += 3;
      }
    }

    return hits;
  }

  updateDemo(
    dt: number,
    creatures: readonly CreatureStateLike[],
    worldSize: number,
    speedByType: Map<number, number>,
    damageByType: Map<number, number>,
  ): ProjectileHit[] {
    if (dt <= 0.0) {
      return [];
    }

    const hits: ProjectileHit[] = [];
    const margin = 64.0;

    for (const proj of this._entries) {
      if (!proj.active) {
        continue;
      }

      if (proj.lifeTimer <= 0.0) {
        proj.active = false;
        continue;
      }

      if (proj.lifeTimer < 0.4) {
        if (proj.typeId === ProjectileTemplateId.ION_RIFLE) {
          const damage = dt * 100.0;
          const radius = 88.0;
          for (const creature of creatures) {
            if (creature.hp <= 0.0) {
              continue;
            }
            const creatureRadius = hitRadiusFor(creature);
            const hitR = radius + creatureRadius;
            if (Vec2.distanceSq(proj.pos, creature.pos) <= hitR * hitR) {
              creature.hp -= damage;
            }
          }
        } else if (proj.typeId === ProjectileTemplateId.ION_MINIGUN) {
          const damage = dt * 40.0;
          const radius = 60.0;
          for (const creature of creatures) {
            if (creature.hp <= 0.0) {
              continue;
            }
            const creatureRadius = hitRadiusFor(creature);
            const hitR = radius + creatureRadius;
            if (Vec2.distanceSq(proj.pos, creature.pos) <= hitR * hitR) {
              creature.hp -= damage;
            }
          }
        }
        proj.lifeTimer = f32(proj.lifeTimer - dt);
        continue;
      }

      if (
        proj.pos.x < -margin ||
        proj.pos.y < -margin ||
        proj.pos.x > worldSize + margin ||
        proj.pos.y > worldSize + margin
      ) {
        proj.lifeTimer = f32(proj.lifeTimer - dt);
        continue;
      }

      const speed = (speedByType.get(proj.typeId) ?? 650.0) * proj.speedScale;
      const direction = Vec2.fromHeading(proj.angle);
      proj.pos = proj.pos.add(direction.mul(speed * dt));

      let hitIdx: number | null = null;
      for (let idx = 0; idx < creatures.length; idx++) {
        const creature = creatures[idx];
        if (creature.hp <= 0.0) {
          continue;
        }
        const creatureRadius = hitRadiusFor(creature);
        const hitR = proj.hitRadius + creatureRadius;
        if (Vec2.distanceSq(proj.pos, creature.pos) <= hitR * hitR) {
          hitIdx = idx;
          break;
        }
      }
      if (hitIdx === null) {
        continue;
      }

      const creature = creatures[hitIdx];
      hits.push({
        typeId: proj.typeId,
        origin: proj.origin,
        hit: proj.pos,
        target: creature.pos,
      });

      creatures[hitIdx].hp -= damageByType.get(proj.typeId) ?? 10.0;

      proj.lifeTimer = 0.25;
    }

    return hits;
  }
}
