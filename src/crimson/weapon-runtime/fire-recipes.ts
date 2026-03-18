// Port of crimson/weapon_runtime/fire_recipes.py

import { ParticleStyleId } from '@crimson/effects.ts';
import { ProjectileTemplateId, SecondaryProjectileTypeId } from '@crimson/projectiles/types.ts';
import { WeaponId, projectileTypeIdForWeaponId } from '@crimson/weapons.ts';

// --- Pellet jitter rules ---

export interface NoJitter {
  readonly tag: 'NoJitter';
}

export interface ModuloCenteredJitter {
  readonly tag: 'ModuloCenteredJitter';
  readonly modulo: number;
  readonly center: number;
  readonly step: number;
}

export interface MaskCenteredJitter {
  readonly tag: 'MaskCenteredJitter';
  readonly mask: number;
  readonly center: number;
  readonly step: number;
}

export type PelletJitterRule = NoJitter | ModuloCenteredJitter | MaskCenteredJitter;

export function noJitter(): NoJitter {
  return { tag: 'NoJitter' };
}

export function moduloCenteredJitter(modulo: number, center: number, step: number): ModuloCenteredJitter {
  return { tag: 'ModuloCenteredJitter', modulo, center, step };
}

export function maskCenteredJitter(mask: number, center: number, step: number): MaskCenteredJitter {
  return { tag: 'MaskCenteredJitter', mask, center, step };
}

// --- Speed scale rules ---

export interface NoSpeedScale {
  readonly tag: 'NoSpeedScale';
}

export interface ModuloSpeedScale {
  readonly tag: 'ModuloSpeedScale';
  readonly base: number;
  readonly modulo: number;
  readonly step: number;
}

export type SpeedScaleRule = NoSpeedScale | ModuloSpeedScale;

export function noSpeedScale(): NoSpeedScale {
  return { tag: 'NoSpeedScale' };
}

export function moduloSpeedScale(base: number, modulo: number, step: number): ModuloSpeedScale {
  return { tag: 'ModuloSpeedScale', base, modulo, step };
}

// --- Secondary targeting policy ---

export interface NoTargetHint {
  readonly tag: 'NoTargetHint';
}

export interface UseAimTargetHint {
  readonly tag: 'UseAimTargetHint';
}

export type SecondaryTargetingPolicy = NoTargetHint | UseAimTargetHint;

export function noTargetHint(): NoTargetHint {
  return { tag: 'NoTargetHint' };
}

export function useAimTargetHint(): UseAimTargetHint {
  return { tag: 'UseAimTargetHint' };
}

// --- Fire modes ---

export interface PrimaryPelletsMode {
  readonly tag: 'PrimaryPelletsMode';
  readonly typeId: ProjectileTemplateId | null;
  readonly count: number | null;
  readonly jitter: PelletJitterRule;
  readonly speedScale: SpeedScaleRule;
}

export interface SecondaryShotMode {
  readonly tag: 'SecondaryShotMode';
  readonly typeId: SecondaryProjectileTypeId;
  readonly targeting: SecondaryTargetingPolicy;
}

export interface ParticleStreamMode {
  readonly tag: 'ParticleStreamMode';
  readonly style: ParticleStyleId | null;
  readonly slow: boolean;
}

export interface MultiPlasmaFanMode {
  readonly tag: 'MultiPlasmaFanMode';
}

export interface SwarmerDumpMode {
  readonly tag: 'SwarmerDumpMode';
}

export type FireMode =
  | PrimaryPelletsMode
  | SecondaryShotMode
  | ParticleStreamMode
  | MultiPlasmaFanMode
  | SwarmerDumpMode;

export interface FireRecipe {
  readonly mode: FireMode;
  readonly ammoCost: number;
}

function recipe(mode: FireMode, ammoCost: number = 1.0): FireRecipe {
  return { mode, ammoCost };
}

export function pelletJitterStepForWeapon(weaponId: WeaponId): number {
  if (weaponId === WeaponId.SHOTGUN) return 0.0013;
  if (weaponId === WeaponId.SAWED_OFF_SHOTGUN) return 0.004;
  if (weaponId === WeaponId.JACKHAMMER) return 0.0013;
  return 0.0015;
}

const _SHOTGUN_SPEED_RANDOMIZE_WEAPONS: ReadonlySet<WeaponId> = new Set([
  WeaponId.SHOTGUN,
  WeaponId.SAWED_OFF_SHOTGUN,
  WeaponId.JACKHAMMER,
]);

const _DEFAULT_SPREAD_JITTER: ModuloCenteredJitter = moduloCenteredJitter(200, 100, 0.0015);
const _DEFAULT_SPEED_SCALE: ModuloSpeedScale = moduloSpeedScale(1.0, 100, 0.01);
const _GAUSS_ION_SPEED_SCALE: ModuloSpeedScale = moduloSpeedScale(1.4, 0x50, 0.01);

export const FIRE_RECIPE_BY_WEAPON: ReadonlyMap<WeaponId, FireRecipe> = new Map<WeaponId, FireRecipe>([
  [WeaponId.ROCKET_LAUNCHER, recipe({
    tag: 'SecondaryShotMode',
    typeId: SecondaryProjectileTypeId.ROCKET,
    targeting: noTargetHint(),
  })],
  [WeaponId.SEEKER_ROCKETS, recipe({
    tag: 'SecondaryShotMode',
    typeId: SecondaryProjectileTypeId.HOMING_ROCKET,
    targeting: useAimTargetHint(),
  })],
  [WeaponId.ROCKET_MINIGUN, recipe({
    tag: 'SecondaryShotMode',
    typeId: SecondaryProjectileTypeId.ROCKET_MINIGUN,
    targeting: noTargetHint(),
  })],
  [WeaponId.FLAMETHROWER, recipe({
    tag: 'ParticleStreamMode',
    style: null,
    slow: false,
  }, 0.1)],
  [WeaponId.BLOW_TORCH, recipe({
    tag: 'ParticleStreamMode',
    style: ParticleStyleId.BLOW_TORCH,
    slow: false,
  }, 0.05)],
  [WeaponId.HR_FLAMER, recipe({
    tag: 'ParticleStreamMode',
    style: ParticleStyleId.HR_FLAMER,
    slow: false,
  }, 0.1)],
  [WeaponId.BUBBLEGUN, recipe({
    tag: 'ParticleStreamMode',
    style: null,
    slow: true,
  }, 0.15)],
  [WeaponId.MULTI_PLASMA, recipe({ tag: 'MultiPlasmaFanMode' })],
  [WeaponId.MINI_ROCKET_SWARMERS, recipe({ tag: 'SwarmerDumpMode' })],
  [WeaponId.PLASMA_SHOTGUN, recipe({
    tag: 'PrimaryPelletsMode',
    typeId: ProjectileTemplateId.PLASMA_MINIGUN,
    count: 14,
    jitter: maskCenteredJitter(0xFF, 0x80, 0.002),
    speedScale: _DEFAULT_SPEED_SCALE,
  })],
  [WeaponId.GAUSS_SHOTGUN, recipe({
    tag: 'PrimaryPelletsMode',
    typeId: ProjectileTemplateId.GAUSS_GUN,
    count: 6,
    jitter: moduloCenteredJitter(200, 100, 0.002),
    speedScale: _GAUSS_ION_SPEED_SCALE,
  })],
  [WeaponId.ION_SHOTGUN, recipe({
    tag: 'PrimaryPelletsMode',
    typeId: ProjectileTemplateId.ION_MINIGUN,
    count: 8,
    jitter: moduloCenteredJitter(200, 100, 0.0026),
    speedScale: _GAUSS_ION_SPEED_SCALE,
  })],
]);

export function resolveFireRecipe(
  weaponId: WeaponId,
  pelletCount: number,
  fireBulletsActive: boolean,
): FireRecipe {
  if (fireBulletsActive) {
    return recipe({
      tag: 'PrimaryPelletsMode',
      typeId: ProjectileTemplateId.FIRE_BULLETS,
      count: Math.max(0, pelletCount | 0),
      jitter: _DEFAULT_SPREAD_JITTER,
      speedScale: noSpeedScale(),
    });
  }

  const existing = FIRE_RECIPE_BY_WEAPON.get(weaponId);
  if (existing !== undefined) {
    return existing;
  }

  const pellets = Math.max(1, pelletCount | 0);
  let jitter: PelletJitterRule = noJitter();
  if (pellets > 1) {
    jitter = moduloCenteredJitter(
      200,
      100,
      pelletJitterStepForWeapon(weaponId),
    );
  }

  let speedScale: SpeedScaleRule = noSpeedScale();
  if (pellets > 1 && _SHOTGUN_SPEED_RANDOMIZE_WEAPONS.has(weaponId)) {
    speedScale = _DEFAULT_SPEED_SCALE;
  }

  return recipe({
    tag: 'PrimaryPelletsMode',
    typeId: projectileTypeIdForWeaponId(weaponId),
    count: pellets,
    jitter,
    speedScale,
  });
}
