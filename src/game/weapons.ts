// Port of crimson/weapons.py

import { SfxId } from '../engine/sfx-map.ts';
import { ProjectileTemplateId } from './projectiles/types.ts';

export enum WeaponId {
  NONE = 0,
  PISTOL = 1,
  ASSAULT_RIFLE = 2,
  SHOTGUN = 3,
  SAWED_OFF_SHOTGUN = 4,
  SUBMACHINE_GUN = 5,
  GAUSS_GUN = 6,
  MEAN_MINIGUN = 7,
  FLAMETHROWER = 8,
  PLASMA_RIFLE = 9,
  MULTI_PLASMA = 10,
  PLASMA_MINIGUN = 11,
  ROCKET_LAUNCHER = 12,
  SEEKER_ROCKETS = 13,
  PLASMA_SHOTGUN = 14,
  BLOW_TORCH = 15,
  HR_FLAMER = 16,
  MINI_ROCKET_SWARMERS = 17,
  ROCKET_MINIGUN = 18,
  PULSE_GUN = 19,
  JACKHAMMER = 20,
  ION_RIFLE = 21,
  ION_MINIGUN = 22,
  ION_CANNON = 23,
  SHRINKIFIER_5K = 24,
  BLADE_GUN = 25,
  SPIDER_PLASMA = 26,
  EVIL_SCYTHE = 27,
  PLASMA_CANNON = 28,
  SPLITTER_GUN = 29,
  GAUSS_SHOTGUN = 30,
  ION_SHOTGUN = 31,
  FLAMEBURST = 32,
  RAYGUN = 33,
  UNKNOWN_34 = 34,
  UNKNOWN_35 = 35,
  UNKNOWN_36 = 36,
  UNKNOWN_37 = 37,
  UNKNOWN_38 = 38,
  UNKNOWN_39 = 39,
  UNKNOWN_40 = 40,
  PLAGUE_SPREADER_GUN = 41,
  BUBBLEGUN = 42,
  RAINBOW_GUN = 43,
  GRIM_WEAPON = 44,
  FIRE_BULLETS = 45,
  UNKNOWN_46 = 46,
  UNKNOWN_47 = 47,
  UNKNOWN_48 = 48,
  UNKNOWN_49 = 49,
  TRANSMUTATOR = 50,
  BLASTER_R_300 = 51,
  LIGHTNING_RIFLE = 52,
  NUKE_LAUNCHER = 53,
}

export interface Weapon {
  readonly weaponId: WeaponId;
  readonly name: string;
  readonly ammoClass: number | null;
  readonly clipSize: number;
  readonly shotCooldown: number;
  readonly reloadTime: number;
  readonly spreadHeatInc: number;
  readonly fireSound: SfxId;
  readonly reloadSound: SfxId;
  readonly iconIndex: number;
  readonly flags: number | null;
  readonly travelBudget: number;
  readonly damageScale: number;
  readonly pelletCount: number;
}

function w(
  weaponId: WeaponId,
  name: string,
  ammoClass: number | null,
  clipSize: number,
  shotCooldown: number,
  reloadTime: number,
  spreadHeatInc: number,
  fireSound: SfxId,
  reloadSound: SfxId,
  iconIndex: number,
  flags: number | null,
  travelBudget: number,
  damageScale: number,
  pelletCount: number,
): Weapon {
  return {
    weaponId, name, ammoClass, clipSize, shotCooldown, reloadTime,
    spreadHeatInc, fireSound, reloadSound, iconIndex, flags,
    travelBudget, damageScale, pelletCount,
  };
}

export const WEAPON_TABLE: readonly Weapon[] = [
  w(WeaponId.PISTOL, 'Pistol', 0, 12, 0.7117, 1.2, 0.22, SfxId.PISTOL_FIRE, SfxId.PISTOL_RELOAD, 0, 5, 55, 4.1, 1),
  w(WeaponId.ASSAULT_RIFLE, 'Assault Rifle', 0, 25, 0.117, 1.2, 0.09, SfxId.AUTORIFLE_FIRE, SfxId.AUTORIFLE_RELOAD, 1, 1, 50, 1.0, 1),
  w(WeaponId.SHOTGUN, 'Shotgun', 0, 12, 0.85, 1.9, 0.27, SfxId.SHOTGUN_FIRE, SfxId.SHOTGUN_RELOAD, 2, 1, 60, 1.2, 12),
  w(WeaponId.SAWED_OFF_SHOTGUN, 'Sawed-off Shotgun', 0, 12, 0.87, 1.9, 0.13, SfxId.SHOTGUN_FIRE, SfxId.SHOTGUN_RELOAD, 3, 1, 45, 1.0, 12),
  w(WeaponId.SUBMACHINE_GUN, 'Submachine Gun', 0, 30, 0.088117, 1.2, 0.082, SfxId.HRPM_FIRE, SfxId.AUTORIFLE_RELOAD, 4, 5, 45, 1.0, 1),
  w(WeaponId.GAUSS_GUN, 'Gauss Gun', 0, 6, 0.6, 1.6, 0.42, SfxId.GAUSS_FIRE, SfxId.SHOTGUN_RELOAD, 5, 1, 215, 1.0, 1),
  w(WeaponId.MEAN_MINIGUN, 'Mean Minigun', 0, 120, 0.09, 4.0, 0.062, SfxId.AUTORIFLE_FIRE, SfxId.AUTORIFLE_RELOAD, 6, 3, 45, 1.0, 1),
  w(WeaponId.FLAMETHROWER, 'Flamethrower', 1, 30, 0.008113, 2.0, 0.015, SfxId.FLAMER_FIRE_01, SfxId.AUTORIFLE_RELOAD, 7, 8, 45, 1.0, 1),
  w(WeaponId.PLASMA_RIFLE, 'Plasma Rifle', 0, 20, 0.2908117, 1.2, 0.182, SfxId.SHOCK_FIRE, SfxId.AUTORIFLE_RELOAD, 8, null, 30, 5.0, 1),
  w(WeaponId.MULTI_PLASMA, 'Multi-Plasma', 0, 8, 0.6208117, 1.4, 0.32, SfxId.SHOCK_FIRE, SfxId.AUTORIFLE_RELOAD, 9, null, 45, 1.0, 3),
  w(WeaponId.PLASMA_MINIGUN, 'Plasma Minigun', 0, 30, 0.11, 1.3, 0.097, SfxId.PLASMAMINIGUN_FIRE, SfxId.AUTORIFLE_RELOAD, 10, null, 35, 2.1, 1),
  w(WeaponId.ROCKET_LAUNCHER, 'Rocket Launcher', 2, 5, 0.7408117, 1.2, 0.42, SfxId.ROCKET_FIRE, SfxId.AUTORIFLE_RELOAD_ALT, 11, 8, 45, 1.0, 1),
  w(WeaponId.SEEKER_ROCKETS, 'Seeker Rockets', 2, 8, 0.3108117, 1.2, 0.32, SfxId.ROCKET_FIRE, SfxId.AUTORIFLE_RELOAD_ALT, 12, 8, 45, 1.0, 1),
  w(WeaponId.PLASMA_SHOTGUN, 'Plasma Shotgun', 0, 8, 0.48, 3.1, 0.11, SfxId.PLASMASHOTGUN_FIRE, SfxId.SHOTGUN_RELOAD, 13, null, 45, 1.0, 14),
  w(WeaponId.BLOW_TORCH, 'Blow Torch', 1, 30, 0.006113, 1.5, 0.01, SfxId.FLAMER_FIRE_01, SfxId.AUTORIFLE_RELOAD, 14, 8, 45, 1.0, 1),
  w(WeaponId.HR_FLAMER, 'HR Flamer', 1, 30, 0.0085, 1.8, 0.01, SfxId.FLAMER_FIRE_01, SfxId.AUTORIFLE_RELOAD, 15, 8, 45, 1.0, 1),
  w(WeaponId.MINI_ROCKET_SWARMERS, 'Mini-Rocket Swarmers', 2, 5, 1.8, 1.8, 0.12, SfxId.ROCKET_FIRE, SfxId.AUTORIFLE_RELOAD_ALT, 16, 8, 45, 1.0, 1),
  w(WeaponId.ROCKET_MINIGUN, 'Rocket Minigun', 2, 16, 0.12, 1.8, 0.12, SfxId.ROCKETMINI_FIRE, SfxId.AUTORIFLE_RELOAD_ALT, 17, 8, 45, 1.0, 1),
  w(WeaponId.PULSE_GUN, 'Pulse Gun', 3, 16, 0.1, 0.1, 0.0, SfxId.PULSE_FIRE, SfxId.AUTORIFLE_RELOAD, 18, 8, 20, 1.0, 1),
  w(WeaponId.JACKHAMMER, 'Jackhammer', 0, 16, 0.14, 3.0, 0.16, SfxId.SHOTGUN_FIRE, SfxId.SHOTGUN_RELOAD, 19, 1, 45, 1.0, 4),
  w(WeaponId.ION_RIFLE, 'Ion Rifle', 4, 8, 0.4, 1.35, 0.112, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 20, 8, 15, 3.0, 1),
  w(WeaponId.ION_MINIGUN, 'Ion Minigun', 4, 20, 0.1, 1.8, 0.09, SfxId.SHOCKMINIGUN_FIRE, SfxId.SHOCK_RELOAD, 21, 8, 20, 1.4, 1),
  w(WeaponId.ION_CANNON, 'Ion Cannon', 4, 3, 1.0, 3.0, 0.68, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 22, null, 10, 16.7, 1),
  w(WeaponId.SHRINKIFIER_5K, 'Shrinkifier 5k', 0, 8, 0.21, 1.22, 0.04, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 23, 8, 45, 0.0, 1),
  w(WeaponId.BLADE_GUN, 'Blade Gun', 0, 6, 0.35, 3.5, 0.04, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 24, 8, 20, 11.0, 1),
  w(WeaponId.SPIDER_PLASMA, 'Spider Plasma', 0, 5, 0.2, 1.2, 0.04, SfxId.BLOODSPILL_01, SfxId.SHOTGUN_RELOAD, 25, 8, 10, 0.5, 1),
  w(WeaponId.EVIL_SCYTHE, 'Evil Scythe', 4, 3, 1.0, 3.0, 0.68, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 25, null, 45, 1.0, 1),
  w(WeaponId.PLASMA_CANNON, 'Plasma Cannon', 0, 3, 0.9, 2.7, 0.6, SfxId.SHOCK_FIRE, SfxId.SHOCK_RELOAD, 25, null, 10, 28.0, 1),
  w(WeaponId.SPLITTER_GUN, 'Splitter Gun', 0, 6, 0.7, 2.2, 0.28, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 28, null, 30, 6.0, 1),
  w(WeaponId.GAUSS_SHOTGUN, 'Gauss Shotgun', 0, 4, 1.05, 2.1, 0.27, SfxId.GAUSS_FIRE, SfxId.SHOTGUN_RELOAD, 30, 1, 45, 1.0, 1),
  w(WeaponId.ION_SHOTGUN, 'Ion Shotgun', 4, 10, 0.85, 1.9, 0.27, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 31, 1, 45, 1.0, 8),
  w(WeaponId.FLAMEBURST, 'Flameburst', 4, 60, 0.02, 3.0, 0.18, SfxId.FLAMER_FIRE_01, SfxId.SHOCK_RELOAD, 29, null, 45, 1.0, 1),
  w(WeaponId.RAYGUN, 'RayGun', 4, 12, 0.7, 2.0, 0.38, SfxId.SHOCK_FIRE_ALT, SfxId.SHOCK_RELOAD, 30, null, 45, 1.0, 1),
  w(WeaponId.PLAGUE_SPREADER_GUN, 'Plague Sphreader Gun', null, 5, 0.2, 1.2, 0.04, SfxId.BLOODSPILL_01, SfxId.SHOTGUN_RELOAD, 40, 8, 15, 0.0, 1),
  w(WeaponId.BUBBLEGUN, 'Bubblegun', null, 15, 0.1613, 1.2, 0.05, SfxId.BLOODSPILL_01, SfxId.SHOTGUN_RELOAD, 41, 8, 45, 1.0, 1),
  w(WeaponId.RAINBOW_GUN, 'Rainbow Gun', null, 10, 0.2, 1.2, 0.09, SfxId.BLOODSPILL_01, SfxId.SHOTGUN_RELOAD, 42, 8, 10, 1.0, 1),
  w(WeaponId.GRIM_WEAPON, 'Grim Weapon', null, 3, 0.5, 1.2, 0.4, SfxId.BLOODSPILL_01, SfxId.SHOTGUN_RELOAD, 43, null, 45, 1.0, 1),
  w(WeaponId.FIRE_BULLETS, 'Fire bullets', null, 112, 0.14, 1.2, 0.22, SfxId.AUTORIFLE_FIRE, SfxId.PISTOL_RELOAD, 44, 1, 60, 0.25, 1),
  w(WeaponId.TRANSMUTATOR, 'Transmutator', null, 50, 0.04, 5.0, 0.04, SfxId.BLOODSPILL_01, SfxId.SHOTGUN_RELOAD, 49, 9, 45, 1.0, 1),
  w(WeaponId.BLASTER_R_300, 'Blaster R-300', null, 20, 0.08, 2.0, 0.05, SfxId.SHOCK_FIRE, SfxId.SHOTGUN_RELOAD, 50, 9, 45, 1.0, 1),
  w(WeaponId.LIGHTNING_RIFLE, 'Lighting Rifle', null, 500, 4.0, 8.0, 1.0, SfxId.EXPLOSION_LARGE, SfxId.SHOTGUN_RELOAD, 51, 8, 45, 1.0, 1),
  w(WeaponId.NUKE_LAUNCHER, 'Nuke Launcher', null, 1, 4.0, 8.0, 1.0, SfxId.EXPLOSION_LARGE, SfxId.SHOTGUN_RELOAD, 52, 8, 45, 1.0, 1),
];

export const WEAPON_BY_ID: Map<WeaponId, Weapon> = new Map(
  WEAPON_TABLE.map((e) => [e.weaponId, e]),
);

const _WEAPON_FIXED_NAMES: Map<WeaponId, string> = new Map([
  [WeaponId.PLAGUE_SPREADER_GUN, 'Plague Spreader Gun'],
  [WeaponId.LIGHTNING_RIFLE, 'Lightning Rifle'],
  [WeaponId.FIRE_BULLETS, 'Fire Bullets'],
]);

export function weaponDisplayName(weaponId: WeaponId, preserveBugs = false): string {
  const entry = WEAPON_BY_ID.get(weaponId);
  if (!entry) return `weapon_${weaponId}`;
  if (preserveBugs) return entry.name;
  const fixed = _WEAPON_FIXED_NAMES.get(weaponId);
  if (fixed !== undefined) return fixed;
  return entry.name;
}

export const PROJECTILE_TEMPLATE_OVERRIDES: Map<WeaponId, readonly ProjectileTemplateId[]> = new Map([
  [WeaponId.SAWED_OFF_SHOTGUN, [ProjectileTemplateId.SHOTGUN]],
  [WeaponId.MEAN_MINIGUN, [ProjectileTemplateId.PISTOL]],
  [WeaponId.FLAMETHROWER, []],
  [WeaponId.MULTI_PLASMA, [ProjectileTemplateId.PLASMA_RIFLE, ProjectileTemplateId.PLASMA_MINIGUN]],
  [WeaponId.ROCKET_LAUNCHER, []],
  [WeaponId.SEEKER_ROCKETS, []],
  [WeaponId.PLASMA_SHOTGUN, [ProjectileTemplateId.PLASMA_MINIGUN]],
  [WeaponId.BLOW_TORCH, []],
  [WeaponId.HR_FLAMER, []],
  [WeaponId.MINI_ROCKET_SWARMERS, []],
  [WeaponId.ROCKET_MINIGUN, []],
  [WeaponId.JACKHAMMER, [ProjectileTemplateId.SHOTGUN]],
  [WeaponId.GAUSS_SHOTGUN, [ProjectileTemplateId.GAUSS_GUN]],
  [WeaponId.ION_SHOTGUN, [ProjectileTemplateId.ION_MINIGUN]],
  [WeaponId.BUBBLEGUN, []],
]);

export function weaponEntryForProjectileTypeId(typeId: ProjectileTemplateId): Weapon {
  const entry = WEAPON_BY_ID.get(typeId as number as WeaponId);
  if (!entry) throw new Error(`No weapon entry for projectile type id: ${typeId}`);
  return entry;
}

export function projectileTypeIdForWeaponId(weaponId: WeaponId): ProjectileTemplateId {
  const typeIds = PROJECTILE_TEMPLATE_OVERRIDES.get(weaponId);
  if (typeIds !== undefined) {
    if (typeIds.length === 0) {
      throw new Error(`weapon has no primary projectile type: ${weaponId}`);
    }
    return typeIds[0];
  }
  // Check if the weapon id is a valid ProjectileTemplateId.
  if (ProjectileTemplateId[weaponId as number] !== undefined) {
    return weaponId as number as ProjectileTemplateId;
  }
  throw new Error(`weapon has no primary projectile type: ${weaponId}`);
}
