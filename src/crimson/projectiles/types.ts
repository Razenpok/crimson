// Port of crimson/projectiles/types.py

import { Vec2 } from '../../grim/geom.ts';
import { OwnerRef } from '../owner-ref.ts';

export const MAIN_PROJECTILE_POOL_SIZE = 0x60;
export const SECONDARY_PROJECTILE_POOL_SIZE = 0x40;

export enum ProjectileTemplateId {
  PISTOL = 0x01,
  ASSAULT_RIFLE = 0x02,
  SHOTGUN = 0x03,
  SUBMACHINE_GUN = 0x05,
  GAUSS_GUN = 0x06,
  PLASMA_RIFLE = 0x09,
  PLASMA_MINIGUN = 0x0b,
  PULSE_GUN = 0x13,
  ION_RIFLE = 0x15,
  ION_MINIGUN = 0x16,
  ION_CANNON = 0x17,
  SHRINKIFIER = 0x18,
  BLADE_GUN = 0x19,
  SPIDER_PLASMA = 0x1a,
  PLASMA_CANNON = 0x1c,
  SPLITTER_GUN = 0x1d,
  PLAGUE_SPREADER = 0x29,
  RAINBOW_GUN = 0x2b,
  FIRE_BULLETS = 0x2d,
}

export enum SecondaryProjectileTypeId {
  NONE = 0,
  ROCKET = 1,
  HOMING_ROCKET = 2,
  DETONATION = 3,
  ROCKET_MINIGUN = 4,
}

export type CreatureDamageApplier = (
  creatureIndex: number,
  damage: number,
  damageType: number,
  knockback: Vec2,
  owner: OwnerRef,
) => void;

export type SecondaryDetonationKillHandler = (creatureIndex: number) => void;

export interface ProjectileCollisionProfile {
  readonly hitRadius: number;
  readonly initialDamagePool: number;
}

export interface ProjectileHit {
  readonly typeId: ProjectileTemplateId;
  readonly origin: Vec2;
  readonly hit: Vec2;
  readonly target: Vec2;
}

export class Projectile {
  active = false;
  angle = 0.0;
  pos = new Vec2();
  origin = new Vec2();
  vel = new Vec2();
  typeId: ProjectileTemplateId = ProjectileTemplateId.PISTOL;
  lifeTimer = 0.0;
  reserved = 0.0;
  speedScale = 1.0;
  damagePool = 1.0;
  hitRadius = 1.0;
  travelBudget = 0.0;
  owner: OwnerRef = OwnerRef.none();
  hitsPlayers = false;
}

export class SecondaryProjectile {
  active = false;
  angle = 0.0;
  speed = 0.0;
  pos = new Vec2();
  vel = new Vec2();
  detonationT = 0.0;
  detonationScale = 1.0;
  typeId: SecondaryProjectileTypeId = SecondaryProjectileTypeId.NONE;
  owner: OwnerRef = OwnerRef.fromLocalPlayer(0);
  trailTimer = 0.0;
  targetId = -1;
}
