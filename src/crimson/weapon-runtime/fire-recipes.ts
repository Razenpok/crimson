// Port of crimson/weapon_runtime/fire_recipes.py

import { ParticleStyleId } from '@crimson/effects.ts';
import { ProjectileTemplateId, SecondaryProjectileTypeId } from '@crimson/projectiles/types.ts';
import { WeaponId, projectileTypeIdForWeaponId } from '@crimson/weapons.ts';

export class NoJitter {
  readonly tag = 'NoJitter';

  constructor() {
    Object.freeze(this);
  }
}

export class ModuloCenteredJitter {
  readonly tag = 'ModuloCenteredJitter';

  constructor(
    public readonly modulo: number,
    public readonly center: number,
    public readonly step: number,
  ) {
    Object.freeze(this);
  }
}

export class MaskCenteredJitter {
  readonly tag = 'MaskCenteredJitter';

  constructor(
    public readonly mask: number,
    public readonly center: number,
    public readonly step: number,
  ) {
    Object.freeze(this);
  }
}

export type PelletJitterRule = NoJitter | ModuloCenteredJitter | MaskCenteredJitter;

export class NoSpeedScale {
  readonly tag = 'NoSpeedScale';

  constructor() {
    Object.freeze(this);
  }
}

export class ModuloSpeedScale {
  readonly tag = 'ModuloSpeedScale';

  constructor(
    public readonly base: number,
    public readonly modulo: number,
    public readonly step: number,
  ) {
    Object.freeze(this);
  }
}

export type SpeedScaleRule = NoSpeedScale | ModuloSpeedScale;

export class NoTargetHint {
  readonly tag = 'NoTargetHint';

  constructor() {
    Object.freeze(this);
  }
}

export class UseAimTargetHint {
  readonly tag = 'UseAimTargetHint';

  constructor() {
    Object.freeze(this);
  }
}

export type SecondaryTargetingPolicy = NoTargetHint | UseAimTargetHint;

export class PrimaryPelletsMode {
  readonly tag = 'PrimaryPelletsMode';

  constructor(opts: {
    typeId?: ProjectileTemplateId | null;
    count?: number | null;
    jitter?: PelletJitterRule;
    speedScale?: SpeedScaleRule;
  } = {}) {
    this.typeId = opts.typeId ?? null;
    this.count = opts.count ?? null;
    this.jitter = opts.jitter ?? new NoJitter();
    this.speedScale = opts.speedScale ?? new NoSpeedScale();
    Object.freeze(this);
  }

  readonly typeId: ProjectileTemplateId | null;
  readonly count: number | null;
  readonly jitter: PelletJitterRule;
  readonly speedScale: SpeedScaleRule;
}

export class SecondaryShotMode {
  readonly tag = 'SecondaryShotMode';

  constructor(
    public readonly typeId: SecondaryProjectileTypeId,
    public readonly targeting: SecondaryTargetingPolicy = new NoTargetHint(),
  ) {
    Object.freeze(this);
  }
}

export class ParticleStreamMode {
  readonly tag = 'ParticleStreamMode';

  constructor(
    public readonly style: ParticleStyleId | null = null,
    public readonly slow = false,
  ) {
    Object.freeze(this);
  }
}

export class MultiPlasmaFanMode {
  readonly tag = 'MultiPlasmaFanMode';

  constructor() {
    Object.freeze(this);
  }
}

export class SwarmerDumpMode {
  readonly tag = 'SwarmerDumpMode';

  constructor() {
    Object.freeze(this);
  }
}

export type FireMode =
  | PrimaryPelletsMode
  | SecondaryShotMode
  | ParticleStreamMode
  | MultiPlasmaFanMode
  | SwarmerDumpMode;

export class FireRecipe {
  constructor(
    public readonly mode: FireMode,
    public readonly ammoCost = 1.0,
  ) {
    Object.freeze(this);
  }
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

const _DEFAULT_SPREAD_JITTER = new ModuloCenteredJitter(200, 100, 0.0015);
const _DEFAULT_SPEED_SCALE = new ModuloSpeedScale(1.0, 100, 0.01);
const _GAUSS_ION_SPEED_SCALE = new ModuloSpeedScale(1.4, 0x50, 0.01);

export const FIRE_RECIPE_BY_WEAPON: ReadonlyMap<WeaponId, FireRecipe> = new Map<WeaponId, FireRecipe>([
  [WeaponId.ROCKET_LAUNCHER, new FireRecipe(new SecondaryShotMode(SecondaryProjectileTypeId.ROCKET))],
  [WeaponId.SEEKER_ROCKETS, new FireRecipe(new SecondaryShotMode(
    SecondaryProjectileTypeId.HOMING_ROCKET,
    new UseAimTargetHint(),
  ))],
  [WeaponId.ROCKET_MINIGUN, new FireRecipe(new SecondaryShotMode(SecondaryProjectileTypeId.ROCKET_MINIGUN))],
  [WeaponId.FLAMETHROWER, new FireRecipe(new ParticleStreamMode(null, false), 0.1)],
  [WeaponId.BLOW_TORCH, new FireRecipe(new ParticleStreamMode(ParticleStyleId.BLOW_TORCH, false), 0.05)],
  [WeaponId.HR_FLAMER, new FireRecipe(new ParticleStreamMode(ParticleStyleId.HR_FLAMER, false), 0.1)],
  [WeaponId.BUBBLEGUN, new FireRecipe(new ParticleStreamMode(null, true), 0.15)],
  [WeaponId.MULTI_PLASMA, new FireRecipe(new MultiPlasmaFanMode())],
  [WeaponId.MINI_ROCKET_SWARMERS, new FireRecipe(new SwarmerDumpMode())],
  [WeaponId.PLASMA_SHOTGUN, new FireRecipe(new PrimaryPelletsMode({
    typeId: ProjectileTemplateId.PLASMA_MINIGUN,
    count: 14,
    jitter: new MaskCenteredJitter(0xFF, 0x80, 0.002),
    speedScale: _DEFAULT_SPEED_SCALE,
  }))],
  [WeaponId.GAUSS_SHOTGUN, new FireRecipe(new PrimaryPelletsMode({
    typeId: ProjectileTemplateId.GAUSS_GUN,
    count: 6,
    jitter: new ModuloCenteredJitter(200, 100, 0.002),
    speedScale: _GAUSS_ION_SPEED_SCALE,
  }))],
  [WeaponId.ION_SHOTGUN, new FireRecipe(new PrimaryPelletsMode({
    typeId: ProjectileTemplateId.ION_MINIGUN,
    count: 8,
    jitter: new ModuloCenteredJitter(200, 100, 0.0026),
    speedScale: _GAUSS_ION_SPEED_SCALE,
  }))],
]);

export function resolveFireRecipe(
  weaponId: WeaponId,
  opts: { pelletCount: number; fireBulletsActive: boolean },
): FireRecipe {
  if (opts.fireBulletsActive) {
    return new FireRecipe(new PrimaryPelletsMode({
      typeId: ProjectileTemplateId.FIRE_BULLETS,
      count: Math.max(0, int(opts.pelletCount)),
      jitter: _DEFAULT_SPREAD_JITTER,
      speedScale: new NoSpeedScale(),
    }));
  }

  const existing = FIRE_RECIPE_BY_WEAPON.get(weaponId);
  if (existing !== undefined) {
    return existing;
  }

  const pellets = Math.max(1, int(opts.pelletCount));
  let jitter: PelletJitterRule = new NoJitter();
  if (pellets > 1) {
    jitter = new ModuloCenteredJitter(
      200,
      100,
      pelletJitterStepForWeapon(weaponId),
    );
  }

  let speedScale: SpeedScaleRule = new NoSpeedScale();
  if (pellets > 1 && _SHOTGUN_SPEED_RANDOMIZE_WEAPONS.has(weaponId)) {
    speedScale = _DEFAULT_SPEED_SCALE;
  }

  return new FireRecipe(new PrimaryPelletsMode({
    typeId: projectileTypeIdForWeaponId(weaponId),
    count: pellets,
    jitter,
    speedScale,
  }));
}
