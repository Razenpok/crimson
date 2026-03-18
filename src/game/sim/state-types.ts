// Port of crimson/sim/state_types.py — shared types used across modules.

import { Vec2 } from '../../engine/geom.ts';
import { WeaponId } from '../weapons.ts';
import type { BonusId } from '../bonuses/ids.ts';

export const PERK_COUNT_SIZE = 0x80;

export class WeaponSlot {
  weaponId: WeaponId;
  clipSize = 0;
  ammo = 0.0;
  reloadActive = false;
  reloadTimer = 0.0;
  reloadTimerMax = 0.0;
  shotCooldown = 0.0;

  constructor(weaponId: WeaponId = WeaponId.PISTOL) {
    this.weaponId = weaponId;
  }
}

export class PlayerState {
  index: number;
  pos: Vec2;
  health = 100.0;
  size = 48.0;

  speedMultiplier = 2.0;
  moveSpeed = 0.0;
  movePhase = 0.0;
  heading = 0.0;
  turnSpeed = 1.0;
  deathTimer = 16.0;
  lowHealthTimer = 100.0;

  aim = new Vec2();
  aimHeading = 0.0;
  aimDir = new Vec2(1.0, 0.0);
  evilEyesTargetCreature = -1;
  autoTarget = -1;

  bonusAimHoverIndex = -1;
  bonusAimHoverTimerMs = 0.0;

  weapon: WeaponSlot;
  altWeapon: WeaponSlot | null = null;

  shotSeq = 0;
  weaponResetLatch = 0;
  auxTimer = 0.0;
  spreadHeat = 0.01;
  muzzleFlashAlpha = 0.0;

  experience = 0;
  level = 1;

  perkCounts: number[];
  plaguebearerActive = false;
  hotTemperedTimer = 0.0;
  manBombTimer = 0.0;
  livingFortressTimer = 0.0;
  fireCoughTimer = 0.0;

  speedBonusTimer = 0.0;
  shieldTimer = 0.0;
  fireBulletsTimer = 0.0;

  constructor(index: number, pos: Vec2 = new Vec2()) {
    this.index = index;
    this.pos = pos;
    this.weapon = new WeaponSlot(WeaponId.PISTOL);
    this.perkCounts = new Array(PERK_COUNT_SIZE).fill(0);
  }
}

export interface BonusPickupEvent {
  readonly playerIndex: number;
  readonly bonusId: BonusId;
  readonly amount: number;
  readonly pos: Vec2;
}

export interface QuestLevel {
  readonly major: number;
  readonly minor: number;
}

export interface BonusTimers {
  weaponPowerUp: number;
  reflexBoost: number;
  energizer: number;
  doubleExperience: number;
  freeze: number;
}

// Re-export the full GameplayState class so all existing import sites work.
export { GameplayState } from '../gameplay.ts';
