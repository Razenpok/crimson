// Port of crimson/projectiles/runtime/secondary_rules.py

import { SecondaryProjectileTypeId } from '@crimson/projectiles/types.ts';

export interface DetonationRule {
  readonly tag: 'detonation';
}

export interface RocketRule {
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

export interface HomingRocketRule {
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

export interface RocketMinigunRule {
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

export type SecondaryProjectileRule = DetonationRule | RocketRule | HomingRocketRule | RocketMinigunRule;

export const DETONATION_RULE: DetonationRule = { tag: 'detonation' };

export const ROCKET_RULE: RocketRule = {
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

export const HOMING_ROCKET_RULE: HomingRocketRule = {
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

export const ROCKET_MINIGUN_RULE: RocketMinigunRule = {
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

export const SECONDARY_RULE_BY_TYPE_ID = new Map<SecondaryProjectileTypeId, SecondaryProjectileRule>([
  [SecondaryProjectileTypeId.DETONATION, DETONATION_RULE],
  [SecondaryProjectileTypeId.ROCKET, ROCKET_RULE],
  [SecondaryProjectileTypeId.HOMING_ROCKET, HOMING_ROCKET_RULE],
  [SecondaryProjectileTypeId.ROCKET_MINIGUN, ROCKET_MINIGUN_RULE],
]);

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

export function secondaryRuleForTypeId(typeId: SecondaryProjectileTypeId): SecondaryProjectileRule {
  return SECONDARY_RULE_BY_TYPE_ID.get(typeId) ?? _DEFAULT_ROCKET_RULE;
}
