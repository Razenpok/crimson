// Port of crimson/creatures/damage.py

import { RGBA } from '../../grim/color.ts';
import { Vec2 } from '../../grim/geom.ts';
import type { CrandLike } from '../../grim/rand.ts';
import { SfxId } from '../../grim/sfx-map.ts';
import type { EffectPool } from '../effects.ts';
import { EffectId } from '../effects-atlas.ts';
import { f32 } from '../math-parity.ts';
import { OwnerRef } from '../owner-ref.ts';
import { PerkId } from '../perks/ids.ts';
import { perkActive } from '../perks/helpers.ts';
import { RngCallerStatic } from '../rng-caller-static.ts';
import type { PlayerState } from '../sim/state-types.ts';
import { CreatureDamageType } from './damage-types.ts';
import { CREATURE_LIFECYCLE_ALIVE } from './lifecycle.ts';
import { CreatureFlags, CreatureTypeId } from './spawn-ids.ts';

export interface CreatureState {
  pos: Vec2;
  vel: Vec2;
  heading: number;
  hp: number;
  size: number;
  flags: number;
  lifecycleStage: number;
  typeId: CreatureTypeId;
  lastHitOwner: OwnerRef;
  hitFlashTimer: number;
}

function anyPlayerHasPerk(players: readonly PlayerState[], perkId: PerkId): boolean {
  for (const player of players) {
    if (perkActive(player, perkId)) return true;
  }
  return false;
}

interface CreatureDamageCtx {
  creature: CreatureState;
  damage: number;
  damageType: number;
  impulse: Vec2;
  owner: OwnerRef;
  dt: number;
  players: readonly PlayerState[];
  rng: CrandLike;
}

type CreatureDamageStep = (ctx: CreatureDamageCtx) => void;

const CREATURE_DEATH_SFX: Map<CreatureTypeId, readonly SfxId[]> = new Map([
  [CreatureTypeId.ZOMBIE, [
    SfxId.ZOMBIE_DIE_01,
    SfxId.ZOMBIE_DIE_02,
    SfxId.ZOMBIE_DIE_03,
    SfxId.ZOMBIE_DIE_04,
  ]],
  [CreatureTypeId.LIZARD, [
    SfxId.LIZARD_DIE_01,
    SfxId.LIZARD_DIE_02,
    SfxId.LIZARD_DIE_03,
    SfxId.LIZARD_DIE_04,
  ]],
  [CreatureTypeId.ALIEN, [
    SfxId.ALIEN_DIE_01,
    SfxId.ALIEN_DIE_02,
    SfxId.ALIEN_DIE_03,
    SfxId.ALIEN_DIE_04,
  ]],
  [CreatureTypeId.SPIDER_SP1, [
    SfxId.SPIDER_DIE_01,
    SfxId.SPIDER_DIE_02,
    SfxId.SPIDER_DIE_03,
    SfxId.SPIDER_DIE_04,
  ]],
  [CreatureTypeId.SPIDER_SP2, [
    SfxId.SPIDER_DIE_01,
    SfxId.SPIDER_DIE_02,
    SfxId.SPIDER_DIE_03,
    SfxId.SPIDER_DIE_04,
  ]],
]);

const TROOPER_DEATH_SFX: readonly SfxId[] = [
  SfxId.TROOPER_DIE_01,
  SfxId.TROOPER_DIE_02,
  SfxId.TROOPER_DIE_03,
];

// Native `gameplay_reset_state` writes trooper death-bank slots 0..2 only, but
// `creature_apply_damage` still indexes the bank with `rand & 3`. The unwritten
// slot remains BSS-zeroed and resolves to native SFX id 0:
// `sfx_trooper_inpain_01`.
const TROOPER_DEATH_SFX_PRESERVE_BUGS: readonly SfxId[] = [
  ...TROOPER_DEATH_SFX,
  SfxId.TROOPER_INPAIN_01,
];


function damageType1UraniumFilledBullets(ctx: CreatureDamageCtx): void {
  if (!anyPlayerHasPerk(ctx.players, PerkId.URANIUM_FILLED_BULLETS)) return;
  ctx.damage *= 2.0;
}

function damageType1LivingFortress(ctx: CreatureDamageCtx): void {
  if (!anyPlayerHasPerk(ctx.players, PerkId.LIVING_FORTRESS)) return;
  for (const player of ctx.players) {
    if (player.health <= 0.0) continue;
    const timer = player.livingFortressTimer;
    if (timer > 0.0) {
      ctx.damage *= timer * 0.05 + 1.0;
    }
  }
}

function damageType1BarrelGreaser(ctx: CreatureDamageCtx): void {
  if (!anyPlayerHasPerk(ctx.players, PerkId.BARREL_GREASER)) return;
  ctx.damage *= 1.4;
}

function damageType1Doctor(ctx: CreatureDamageCtx): void {
  if (!anyPlayerHasPerk(ctx.players, PerkId.DOCTOR)) return;
  ctx.damage *= 1.2;
}

function damageType1HeadingJitter(ctx: CreatureDamageCtx): void {
  const creature = ctx.creature;
  if ((creature.flags & CreatureFlags.ANIM_PING_PONG) !== 0) return;
  const jitter = ((ctx.rng.rand(RngCallerStatic.CREATURE_APPLY_DAMAGE_HEADING_JITTER) & 0x7F) - 0x40) * 0.002;
  const size = Math.max(1e-6, creature.size);
  let turn = jitter / (size * 0.025);
  turn = Math.min(Math.PI / 2.0, turn);
  creature.heading += turn;
}

function damageType7IonGunMaster(ctx: CreatureDamageCtx): void {
  for (const player of ctx.players) {
    if (perkActive(player, PerkId.ION_GUN_MASTER)) {
      ctx.damage *= 1.2;
      return;
    }
  }
}

function damageType4Pyromaniac(ctx: CreatureDamageCtx): void {
  if (!anyPlayerHasPerk(ctx.players, PerkId.PYROMANIAC)) return;
  ctx.damage *= 1.5;
  ctx.rng.rand(RngCallerStatic.CREATURE_APPLY_DAMAGE_PYROMANIAC);
}

function damageLethalRangedShockBurst(
  creature: CreatureState,
  rng: CrandLike,
  effects: EffectPool | null,
  detailPreset: number,
): void {
  if ((creature.flags & CreatureFlags.RANGED_ATTACK_SHOCK) === 0) return;
  for (let i = 0; i < 5; i++) {
    const rotation = (rng.rand(RngCallerStatic.CREATURE_APPLY_DAMAGE_SHOCK_BURST_ROTATION) & 0x7F) * 0.049087387;
    const vel = new Vec2(
      (rng.rand(RngCallerStatic.CREATURE_APPLY_DAMAGE_SHOCK_BURST_VEL_X) & 0x7F) - 0x40,
      (rng.rand(RngCallerStatic.CREATURE_APPLY_DAMAGE_SHOCK_BURST_VEL_Y) & 0x7F) - 0x40,
    );
    const scaleStep = (rng.rand(RngCallerStatic.CREATURE_APPLY_DAMAGE_SHOCK_BURST_SCALE_STEP) % 140) * 0.01 + 0.3;
    if (effects === null) continue;
    effects.spawn(
      EffectId.BURST,
      creature.pos,
      vel,
      rotation,
      1.0,
      36.0,
      36.0,
      0.0,
      0.7,
      0x1D,
      new RGBA(0.8, 0.8, 0.3, 0.5),
      0.0,
      scaleStep,
      detailPreset | 0,
    );
  }
}

export function resolveNativeDeathSfx(
  creature: CreatureState,
  rng: CrandLike,
  preserveBugs: boolean = false,
): SfxId[] {
  if ((creature.flags & CreatureFlags.RANGED_ATTACK_SHOCK) !== 0) return [];
  const roll = rng.rand(RngCallerStatic.CREATURE_APPLY_DAMAGE_DEATH_SFX);
  if (creature.typeId === CreatureTypeId.TROOPER) {
    if (preserveBugs) {
      return [TROOPER_DEATH_SFX_PRESERVE_BUGS[roll & 3]];
    }
    return [TROOPER_DEATH_SFX[roll % TROOPER_DEATH_SFX.length]];
  }
  const options = CREATURE_DEATH_SFX.get(creature.typeId);
  if (options === undefined) return [];
  return [options[roll & 3]];
}

const CREATURE_DAMAGE_PRE_STEPS: Map<number, readonly CreatureDamageStep[]> = new Map([
  [CreatureDamageType.BULLET, [
    damageType1UraniumFilledBullets,
    damageType1LivingFortress,
    damageType1BarrelGreaser,
    damageType1Doctor,
  ]],
]);

const CREATURE_DAMAGE_GLOBAL_PRE_STEPS: Map<number, readonly CreatureDamageStep[]> = new Map([
  [CreatureDamageType.ION, [damageType7IonGunMaster]],
]);

const CREATURE_DAMAGE_ALIVE_STEPS: Map<number, readonly CreatureDamageStep[]> = new Map([
  [CreatureDamageType.FIRE, [damageType4Pyromaniac]],
]);

export function creatureApplyDamage(
  creature: CreatureState,
  damageAmount: number,
  damageType: number,
  impulse: Vec2,
  owner: OwnerRef,
  dt: number,
  players: readonly PlayerState[],
  rng: CrandLike,
  effects: EffectPool | null = null,
  detailPreset: number = 5,
): boolean {
  creature.lastHitOwner = owner;
  creature.hitFlashTimer = 0.2;

  const ctx: CreatureDamageCtx = {
    creature,
    damage: damageAmount,
    damageType: damageType | 0,
    impulse,
    owner,
    dt,
    players,
    rng,
  };

  const globalPreSteps = CREATURE_DAMAGE_GLOBAL_PRE_STEPS.get(ctx.damageType);
  if (globalPreSteps !== undefined) {
    for (const step of globalPreSteps) step(ctx);
  }

  const preSteps = CREATURE_DAMAGE_PRE_STEPS.get(ctx.damageType);
  if (preSteps !== undefined) {
    for (const step of preSteps) step(ctx);
  }
  if (ctx.damageType === CreatureDamageType.BULLET) {
    damageType1HeadingJitter(ctx);
  }

  if (creature.hp <= 0.0) {
    if (dt > 0.0) {
      creature.lifecycleStage = f32(creature.lifecycleStage - f32(dt * 15.0));
    }
    return true;
  }

  const aliveSteps = CREATURE_DAMAGE_ALIVE_STEPS.get(ctx.damageType);
  if (aliveSteps !== undefined) {
    for (const step of aliveSteps) step(ctx);
  }

  creature.hp -= ctx.damage;
  creature.vel = creature.vel.sub(ctx.impulse);

  if (creature.hp <= 0.0) {
    if (dt > 0.0) {
      creature.lifecycleStage = f32(creature.lifecycleStage - f32(dt));
    } else {
      creature.lifecycleStage = f32(creature.lifecycleStage - 0.001);
    }
    creature.vel = creature.vel.sub(impulse.mul(2.0));
    damageLethalRangedShockBurst(
      creature,
      rng,
      effects,
      detailPreset | 0,
    );
    return true;
  }

  return false;
}

export function creatureApplyDamageWithLethalFollowup(
  creature: CreatureState,
  damageAmount: number,
  damageType: number,
  impulse: Vec2,
  owner: OwnerRef,
  dt: number,
  players: readonly PlayerState[],
  rng: CrandLike,
  preserveBugs: boolean = false,
  effects: EffectPool | null = null,
  detailPreset: number = 5,
  onLethal: (sfx: SfxId[]) => void,
): boolean {
  const deathStartNeeded = creature.hp > 0.0 && creature.lifecycleStage === CREATURE_LIFECYCLE_ALIVE;
  const killed = creatureApplyDamage(
    creature,
    damageAmount,
    damageType | 0,
    impulse,
    owner,
    dt,
    players,
    rng,
    effects,
    detailPreset | 0,
  );
  if (killed && deathStartNeeded) {
    onLethal(resolveNativeDeathSfx(creature, rng, preserveBugs));
    return true;
  }
  return false;
}
