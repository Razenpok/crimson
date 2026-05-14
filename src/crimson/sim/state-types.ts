// Port of crimson/sim/state_types.py

import { Vec2 } from '@grim/geom.ts';
import { WeaponId } from '@crimson/weapons.ts';
import type { BonusId } from '@crimson/bonuses/ids.ts';
import type { GameplayState as GameplayStateType } from '@crimson/gameplay.ts';

export const PERK_COUNT_SIZE = 0x80;

export class WeaponSlot {
  weaponId: WeaponId;
  clipSize: number;
  ammo: number;
  reloadActive: boolean;
  reloadTimer: number;
  reloadTimerMax: number;
  shotCooldown: number;

  constructor(opts: {
    weaponId: WeaponId;
    clipSize?: number;
    ammo?: number;
    reloadActive?: boolean;
    reloadTimer?: number;
    reloadTimerMax?: number;
    shotCooldown?: number;
  }) {
    this.weaponId = opts.weaponId;
    this.clipSize = opts.clipSize ?? 0;
    this.ammo = opts.ammo ?? 0.0;
    this.reloadActive = opts.reloadActive ?? false;
    this.reloadTimer = opts.reloadTimer ?? 0.0;
    this.reloadTimerMax = opts.reloadTimerMax ?? 0.0;
    this.shotCooldown = opts.shotCooldown ?? 0.0;
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

  constructor(opts: {
    index: number;
    pos: Vec2;
    health?: number;
    size?: number;
    speedMultiplier?: number;
    moveSpeed?: number;
    movePhase?: number;
    heading?: number;
    turnSpeed?: number;
    deathTimer?: number;
    lowHealthTimer?: number;
    aim?: Vec2;
    aimHeading?: number;
    aimDir?: Vec2;
    evilEyesTargetCreature?: number;
    autoTarget?: number;
    bonusAimHoverIndex?: number;
    bonusAimHoverTimerMs?: number;
    weapon?: WeaponSlot;
    altWeapon?: WeaponSlot | null;
    shotSeq?: number;
    weaponResetLatch?: number;
    auxTimer?: number;
    spreadHeat?: number;
    muzzleFlashAlpha?: number;
    experience?: number;
    level?: number;
    perkCounts?: number[];
    plaguebearerActive?: boolean;
    hotTemperedTimer?: number;
    manBombTimer?: number;
    livingFortressTimer?: number;
    fireCoughTimer?: number;
    speedBonusTimer?: number;
    shieldTimer?: number;
    fireBulletsTimer?: number;
  }) {
    this.index = opts.index;
    this.pos = opts.pos;
    this.health = opts.health ?? this.health;
    this.size = opts.size ?? this.size;
    this.speedMultiplier = opts.speedMultiplier ?? this.speedMultiplier;
    this.moveSpeed = opts.moveSpeed ?? this.moveSpeed;
    this.movePhase = opts.movePhase ?? this.movePhase;
    this.heading = opts.heading ?? this.heading;
    this.turnSpeed = opts.turnSpeed ?? this.turnSpeed;
    this.deathTimer = opts.deathTimer ?? this.deathTimer;
    this.lowHealthTimer = opts.lowHealthTimer ?? this.lowHealthTimer;
    this.aim = opts.aim ?? this.aim;
    this.aimHeading = opts.aimHeading ?? this.aimHeading;
    this.aimDir = opts.aimDir ?? this.aimDir;
    this.evilEyesTargetCreature = opts.evilEyesTargetCreature ?? this.evilEyesTargetCreature;
    this.autoTarget = opts.autoTarget ?? this.autoTarget;
    this.bonusAimHoverIndex = opts.bonusAimHoverIndex ?? this.bonusAimHoverIndex;
    this.bonusAimHoverTimerMs = opts.bonusAimHoverTimerMs ?? this.bonusAimHoverTimerMs;
    this.weapon = opts.weapon ?? new WeaponSlot({ weaponId: WeaponId.PISTOL });
    this.altWeapon = opts.altWeapon ?? this.altWeapon;
    this.shotSeq = opts.shotSeq ?? this.shotSeq;
    this.weaponResetLatch = opts.weaponResetLatch ?? this.weaponResetLatch;
    this.auxTimer = opts.auxTimer ?? this.auxTimer;
    this.spreadHeat = opts.spreadHeat ?? this.spreadHeat;
    this.muzzleFlashAlpha = opts.muzzleFlashAlpha ?? this.muzzleFlashAlpha;
    this.experience = opts.experience ?? this.experience;
    this.level = opts.level ?? this.level;
    this.perkCounts = opts.perkCounts ?? new Array(PERK_COUNT_SIZE).fill(0);
    this.plaguebearerActive = opts.plaguebearerActive ?? this.plaguebearerActive;
    this.hotTemperedTimer = opts.hotTemperedTimer ?? this.hotTemperedTimer;
    this.manBombTimer = opts.manBombTimer ?? this.manBombTimer;
    this.livingFortressTimer = opts.livingFortressTimer ?? this.livingFortressTimer;
    this.fireCoughTimer = opts.fireCoughTimer ?? this.fireCoughTimer;
    this.speedBonusTimer = opts.speedBonusTimer ?? this.speedBonusTimer;
    this.shieldTimer = opts.shieldTimer ?? this.shieldTimer;
    this.fireBulletsTimer = opts.fireBulletsTimer ?? this.fireBulletsTimer;
  }
}

export class BonusPickupEvent {
  readonly playerIndex: number;
  readonly bonusId: BonusId;
  readonly amount: number;
  readonly pos: Vec2;

  constructor(opts: { playerIndex: number; bonusId: BonusId; amount: number; pos: Vec2 }) {
    this.playerIndex = opts.playerIndex;
    this.bonusId = opts.bonusId;
    this.amount = opts.amount;
    this.pos = opts.pos;
  }
}

export type GameplayState = GameplayStateType;
