// Port of crimson/projectiles/runtime/primary_rules.py

import { Projectile, ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import {
  lingerDefault,
  lingerGaussGun,
  lingerIonCannon,
  lingerIonMinigun,
  lingerIonRifle,
  postHitIonCommon,
  postHitIonRifle,
  postHitPlagueSpreader,
  postHitPlasmaCannon,
  postHitPulseGun,
  postHitShrinkifier,
  preHitSplitter,
  type ProjectileHitInfo,
  type ProjectileUpdateCtx,
} from './behaviors.ts';

export type LingerHandler = (ctx: ProjectileUpdateCtx, proj: Projectile) => void;
export type PreHitHandler = (ctx: ProjectileUpdateCtx, proj: Projectile, hitIdx: number) => void;
export type PostHitHandler = (ctx: ProjectileUpdateCtx, hit: ProjectileHitInfo) => void;

function preHitNone(_ctx: ProjectileUpdateCtx, _proj: Projectile, _hitIdx: number): void {
  return;
}

function postHitNone(_ctx: ProjectileUpdateCtx, _hit: ProjectileHitInfo): void {
  return;
}

export interface PrimaryProjectileRule {
  readonly linger: LingerHandler;
  readonly preHit: PreHitHandler;
  readonly postHit: PostHitHandler;
  readonly stopOnHit: boolean;
  readonly emitDefaultFreezeShard: boolean;
  readonly resetShockChainOnLinger: boolean;
}

function rule(
  linger: LingerHandler,
  preHit: PreHitHandler = preHitNone,
  postHit: PostHitHandler = postHitNone,
  stopOnHit: boolean = true,
  emitDefaultFreezeShard: boolean = true,
  resetShockChainOnLinger: boolean = false,
): PrimaryProjectileRule {
  return { linger, preHit, postHit, stopOnHit, emitDefaultFreezeShard, resetShockChainOnLinger };
}

const _DEFAULT_RULE: PrimaryProjectileRule = rule(lingerDefault);

const PRIMARY_PROJECTILE_RULE_BY_TYPE_ID: Map<ProjectileTemplateId, PrimaryProjectileRule> = new Map([
  [ProjectileTemplateId.GAUSS_GUN, rule(
    lingerGaussGun,
    preHitNone,
    postHitNone,
    false,
    false,
  )],
  [ProjectileTemplateId.FIRE_BULLETS, rule(
    lingerDefault,
    preHitNone,
    postHitNone,
    false,
    false,
  )],
  [ProjectileTemplateId.BLADE_GUN, rule(
    lingerDefault,
    preHitNone,
    postHitNone,
    false,
  )],
  [ProjectileTemplateId.PULSE_GUN, rule(
    lingerDefault,
    preHitNone,
    postHitPulseGun,
  )],
  [ProjectileTemplateId.ION_RIFLE, rule(
    lingerIonRifle,
    preHitNone,
    postHitIonRifle,
    true,
    true,
    true,
  )],
  [ProjectileTemplateId.ION_MINIGUN, rule(
    lingerIonMinigun,
    preHitNone,
    postHitIonCommon,
    true,
    true,
    true,
  )],
  [ProjectileTemplateId.ION_CANNON, rule(
    lingerIonCannon,
    preHitNone,
    postHitIonCommon,
  )],
  [ProjectileTemplateId.SHRINKIFIER, rule(
    lingerDefault,
    preHitNone,
    postHitShrinkifier,
  )],
  [ProjectileTemplateId.PLASMA_CANNON, rule(
    lingerDefault,
    preHitNone,
    postHitPlasmaCannon,
  )],
  [ProjectileTemplateId.SPLITTER_GUN, rule(
    lingerDefault,
    preHitSplitter,
  )],
  [ProjectileTemplateId.PLAGUE_SPREADER, rule(
    lingerDefault,
    preHitNone,
    postHitPlagueSpreader,
  )],
]);

export function primaryRuleForTypeId(typeId: ProjectileTemplateId): PrimaryProjectileRule {
  return PRIMARY_PROJECTILE_RULE_BY_TYPE_ID.get(typeId) ?? _DEFAULT_RULE;
}
