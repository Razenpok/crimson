// Port of crimson/weapon_runtime/fire.py

import { RGBA } from '../../grim/color.ts';
import { Vec2 } from '../../grim/geom.ts';
import type { CrandLike } from '../../grim/rand.ts';
import { f32, NATIVE_TAU, headingFromDeltaF32 } from '../math-parity.ts';
import { PerkId } from '../perks/ids.ts';
import { perkActive } from '../perks/helpers.ts';
import { playerTakeDamage } from '../player-damage.ts';
import { ProjectileTemplateId, SecondaryProjectileTypeId } from '../projectiles/types.ts';
import { RngCallerStatic } from '../rng-caller-static.ts';
import type { CreatureState } from '../creatures/runtime.ts';
import type { GameplayState, PlayerState } from '../sim/state-types.ts';
import { WEAPON_TABLE, WeaponId, weaponEntryForProjectileTypeId } from '../weapons.ts';
import { playerStartReload, weaponEntry } from './assign.ts';
import type {
  MaskCenteredJitter,
  ModuloCenteredJitter,
  ModuloSpeedScale,
  NoJitter,
  NoSpeedScale,
} from './fire-recipes.ts';
import { resolveFireRecipe } from './fire-recipes.ts';
import { ownerRefForPlayer, ownerRefForPlayerProjectiles, travelBudgetForTypeId } from './spawn.ts';

export const WEAPON_COUNT_SIZE = Math.max(...WEAPON_TABLE.map((e) => e.weaponId as number)) + 1;

const _NATIVE_FIRE_MUZZLE_SPRITES: Map<number, readonly (readonly [number, number, number])[]> = new Map([
  [WeaponId.PISTOL, [[25.0, 1.0, 0.23], [15.0, 2.0, 0.213]]],
  [WeaponId.ASSAULT_RIFLE, [[25.0, 1.0, 0.23], [15.0, 2.0, 0.213]]],
  [WeaponId.SHOTGUN, [[25.0, 1.0, 0.25], [15.0, 2.0, 0.223]]],
  [WeaponId.SAWED_OFF_SHOTGUN, [[25.0, 1.0, 0.26], [15.0, 2.0, 0.233]]],
  [WeaponId.SUBMACHINE_GUN, [[25.0, 1.0, 0.23], [15.0, 2.0, 0.213]]],
  [WeaponId.GAUSS_GUN, [[25.0, 1.0, 0.33], [15.0, 2.0, 0.263]]],
  [WeaponId.ROCKET_LAUNCHER, [[25.0, 1.0, 0.34], [15.0, 2.0, 0.283]]],
  [WeaponId.SEEKER_ROCKETS, [[25.0, 1.0, 0.31], [15.0, 2.0, 0.243]]],
  [WeaponId.MINI_ROCKET_SWARMERS, [[25.0, 1.0, 0.34], [15.0, 2.0, 0.283]]],
  [WeaponId.ROCKET_MINIGUN, [[25.0, 1.0, 0.34]]],
  [WeaponId.JACKHAMMER, [[15.0, 2.0, 0.223]]],
  [WeaponId.SHRINKIFIER_5K, [[25.0, 1.0, 0.23], [15.0, 2.0, 0.213]]],
  [WeaponId.GAUSS_SHOTGUN, [[25.0, 1.0, 0.33], [15.0, 2.0, 0.263]]],
]);

const _NATIVE_FIRE_MUZZLE_AFTER_PROJECTILE: ReadonlySet<number> = new Set([
  WeaponId.PISTOL,
  WeaponId.SHRINKIFIER_5K,
]);

const _PELLET_JITTER_CALLER_BY_WEAPON: ReadonlyMap<WeaponId, number> = new Map([
  [WeaponId.SHOTGUN, RngCallerStatic.PLAYER_UPDATE_SHOTGUN_PELLET_JITTER],
  [WeaponId.SAWED_OFF_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_SAWED_OFF_SHOTGUN_PELLET_JITTER],
  [WeaponId.JACKHAMMER, RngCallerStatic.PLAYER_UPDATE_JACKHAMMER_PELLET_JITTER],
  [WeaponId.ION_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_ION_SHOTGUN_PELLET_JITTER],
  [WeaponId.GAUSS_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_GAUSS_SHOTGUN_PELLET_JITTER],
  [WeaponId.PLASMA_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_PLASMA_SHOTGUN_PELLET_JITTER],
]);

const _PELLET_SPEED_SCALE_CALLER_BY_WEAPON: ReadonlyMap<WeaponId, number> = new Map([
  [WeaponId.SHOTGUN, RngCallerStatic.PLAYER_UPDATE_SHOTGUN_PELLET_SPEED_SCALE],
  [WeaponId.SAWED_OFF_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_SAWED_OFF_SHOTGUN_PELLET_SPEED_SCALE],
  [WeaponId.JACKHAMMER, RngCallerStatic.PLAYER_UPDATE_JACKHAMMER_PELLET_SPEED_SCALE],
  [WeaponId.ION_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_ION_SHOTGUN_PELLET_SPEED_SCALE],
  [WeaponId.GAUSS_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_GAUSS_SHOTGUN_PELLET_SPEED_SCALE],
  [WeaponId.PLASMA_SHOTGUN, RngCallerStatic.PLAYER_UPDATE_PLASMA_SHOTGUN_PELLET_SPEED_SCALE],
]);

// Minimal creature interface for fire.ts — full type in creatures/runtime.ts
export interface CreatureStateLike {
  active: boolean;
  pos: Vec2;
  size: number;
}

export interface PlayerInputLike {
  readonly fireDown: boolean;
  readonly aim: Vec2;
}

export interface WeaponFireCtx {
  player: PlayerState;
  inputState: PlayerInputLike;
  dt: number;
  state: GameplayState;
  detailPreset?: number;
  creatures?: readonly CreatureStateLike[] | null;
  players?: readonly PlayerState[] | null;
  forcePreSwapFireGate?: boolean;
  onPlayerLethal?: ((player: PlayerState) => void) | null;
}

export interface WeaponFireResult {
  readonly fired: boolean;
  readonly shotCount: number;
  readonly ammoCost: number;
}

function spawnNativeFireMuzzleSprites(
  state: GameplayState,
  weaponId: number,
  muzzle: Vec2,
  aimHeading: number,
  fireBulletsActiveFlag: boolean,
): void {
  let specs: readonly (readonly [number, number, number])[];
  if (fireBulletsActiveFlag) {
    specs = [[25.0, 1.0, 0.413]];
  } else {
    specs = _NATIVE_FIRE_MUZZLE_SPRITES.get(weaponId | 0) ?? [];
  }
  if (specs.length === 0) {
    return;
  }

  for (const [speed, scale, alpha] of specs) {
    state.spriteEffects.spawn(
      muzzle,
      Vec2.fromHeading(aimHeading).mul(speed),
      scale,
      new RGBA(0.5, 0.5, 0.5, alpha),
    );
  }
}

function nativeShotAngleWithJitter(
  aim: Vec2,
  playerPos: Vec2,
  spreadHeat: number,
  rng: CrandLike,
): number {
  const aimDx = f32(aim.x - playerPos.x);
  const aimDy = f32(aim.y - playerPos.y);
  const distSq = f32(f32(aimDx * aimDx) + f32(aimDy * aimDy));
  const dist = f32(Math.sqrt(distSq));
  const maxOffset = f32(f32(dist * spreadHeat) * 0.5);

  const dirAngle = f32(
    (rng.rand(RngCallerStatic.PLAYER_UPDATE_SHOT_JITTER_DIR) & 0x1FF) *
      (NATIVE_TAU / 512.0),
  );
  const mag = f32(
    (rng.rand(RngCallerStatic.PLAYER_UPDATE_SHOT_JITTER_MAG) & 0x1FF) *
      (1.0 / 512.0),
  );
  const offset = f32(maxOffset * mag);

  const dirX = f32(Math.cos(dirAngle));
  const dirY = f32(Math.sin(dirAngle));
  const aimJitterX = f32(aim.x + f32(dirX * offset));
  const aimJitterY = f32(aim.y + f32(dirY * offset));

  const shotDx = f32(aimJitterX - playerPos.x);
  const shotDy = f32(aimJitterY - playerPos.y);
  return headingFromDeltaF32(shotDx, shotDy);
}

function applyPelletJitter(
  shotAngle: number,
  rng: CrandLike,
  jitterRule: NoJitter | ModuloCenteredJitter | MaskCenteredJitter,
  caller: number | null = null,
): number {
  switch (jitterRule.tag) {
    case 'NoJitter':
      return shotAngle;
    case 'ModuloCenteredJitter':
      return shotAngle + (rng.rand(caller) % (jitterRule.modulo | 0) - (jitterRule.center | 0)) * jitterRule.step;
    case 'MaskCenteredJitter':
      return shotAngle + ((rng.rand(caller) & (jitterRule.mask | 0)) - (jitterRule.center | 0)) * jitterRule.step;
  }
}

function applySpeedScaleRule(
  state: GameplayState,
  projId: number,
  speedRule: NoSpeedScale | ModuloSpeedScale,
  caller: number | null = null,
): void {
  switch (speedRule.tag) {
    case 'NoSpeedScale':
      return;
    case 'ModuloSpeedScale':
      state.projectiles.entries[projId | 0].speedScale =
        speedRule.base + (state.rng.rand(caller) % (speedRule.modulo | 0)) * speedRule.step;
      return;
  }
}

export function fireWeapon(ctx: WeaponFireCtx): WeaponFireResult {
  const player = ctx.player;
  const inputState = ctx.inputState;
  const dt = ctx.dt;
  const state = ctx.state;
  const creatures = ctx.creatures ?? null;
  const players = ctx.players ?? null;
  const forcePreSwapFireGate = ctx.forcePreSwapFireGate ?? false;
  const onPlayerLethal = ctx.onPlayerLethal ?? null;

  const weaponId = player.weapon.weaponId;
  const weapon = weaponEntry(weaponId);

  if (!forcePreSwapFireGate && player.weapon.shotCooldown > 0.0) {
    return { fired: false, shotCount: 0, ammoCost: 0.0 };
  }
  if (!inputState.fireDown) {
    return { fired: false, shotCount: 0, ammoCost: 0.0 };
  }

  let ammoCost = 1.0;
  const isFireBullets = player.fireBulletsTimer > 0.0;
  if (!forcePreSwapFireGate && player.weapon.reloadTimer > 0.0) {
    if (player.experience <= 0) {
      return { fired: false, shotCount: 0, ammoCost: 0.0 };
    }
    if (perkActive(player, PerkId.REGRESSION_BULLETS)) {
      const ammoClass = weapon.ammoClass !== null ? (weapon.ammoClass | 0) : 0;

      const reloadTime = weapon.reloadTime;
      const factor = ammoClass === 1 ? 4.0 : 200.0;
      player.experience = (player.experience - reloadTime * factor) | 0;
      if (player.experience < 0) {
        player.experience = 0;
      }
    } else if (perkActive(player, PerkId.AMMUNITION_WITHIN)) {
      const ammoClass = weapon.ammoClass !== null ? (weapon.ammoClass | 0) : 0;

      const cost = ammoClass === 1 ? 0.15 : 1.0;
      playerTakeDamage(
        state,
        player,
        cost,
        dt,
        players,
        onPlayerLethal !== null ? (() => onPlayerLethal(player)) : null,
      );
    } else {
      return { fired: false, shotCount: 0, ammoCost: 0.0 };
    }
  }

  const pelletCount = weapon.pelletCount | 0;
  const fireBulletsWeapon = weaponEntryForProjectileTypeId(ProjectileTemplateId.FIRE_BULLETS);

  let shotCooldown = f32(weapon.shotCooldown);
  const weaponSpreadHeat = weapon.spreadHeatInc;
  const fireBulletsSpreadHeat = fireBulletsWeapon.spreadHeatInc;

  if (isFireBullets && pelletCount === 1) {
    shotCooldown = f32(fireBulletsWeapon.shotCooldown);
  }

  const spreadHeatBase = isFireBullets ? fireBulletsSpreadHeat : weaponSpreadHeat;
  const spreadInc = spreadHeatBase * 1.3;

  if (perkActive(player, PerkId.FASTSHOT)) {
    shotCooldown = f32(shotCooldown * 0.88);
  }
  if (perkActive(player, PerkId.SHARPSHOOTER)) {
    shotCooldown = f32(shotCooldown * 1.05);
  }
  player.weapon.shotCooldown = Math.max(0.0, f32(shotCooldown));

  const aim = inputState.aim;
  const aimDelta = aim.sub(player.pos);
  const aimHeading = headingFromDeltaF32(aimDelta.x, aimDelta.y);

  const muzzle = player.pos.add(Vec2.fromHeading(aimHeading).rotated(-0.150915).mul(16.0));
  const weaponFlags = (weapon.flags ?? 0) | 0;
  if (weaponFlags & 0x1) {
    const shellCasingDraws: [number, number, number, number] = [
      state.rng.rand(RngCallerStatic.PLAYER_UPDATE_CASING_ANGLE),
      state.rng.rand(RngCallerStatic.PLAYER_UPDATE_CASING_SPEED),
      state.rng.rand(RngCallerStatic.PLAYER_UPDATE_CASING_ROTATION),
      state.rng.rand(RngCallerStatic.PLAYER_UPDATE_CASING_ROTATION_STEP),
    ];
    state.effects.spawnShellCasing(
      muzzle,
      aimHeading,
      shellCasingDraws,
      (ctx.detailPreset ?? 5) | 0,
    );
  }

  const shotAngle = nativeShotAngleWithJitter(
    aim,
    player.pos,
    player.spreadHeat,
    state.rng,
  );
  let particleAngle = Vec2.fromHeading(shotAngle).toAngle();
  if (weaponId === WeaponId.FLAMETHROWER || weaponId === WeaponId.BLOW_TORCH || weaponId === WeaponId.HR_FLAMER) {
    particleAngle = Vec2.fromHeading(aimHeading).toAngle();
  }

  // Native gameplay fire consumes one exact `player_update` RNG draw for shot
  // SFX variant selection on every non-Fire-Bullets shot.
  if (!isFireBullets) {
    state.rng.rand(RngCallerStatic.PLAYER_UPDATE_SHOT_SFX);
  }

  const owner = ownerRefForPlayer(player.index);
  const projectileOwner = ownerRefForPlayerProjectiles(state, player.index);
  let shotCount = 1;
  const spawnMuzzleAfterProjectile = isFireBullets || _NATIVE_FIRE_MUZZLE_AFTER_PROJECTILE.has(weaponId as number);
  if (!spawnMuzzleAfterProjectile) {
    spawnNativeFireMuzzleSprites(
      state,
      weaponId as number,
      muzzle,
      aimHeading,
      isFireBullets,
    );
  }

  const recipe = resolveFireRecipe(
    weaponId,
    pelletCount,
    isFireBullets,
  );
  ammoCost = recipe.ammoCost;

  const mode = recipe.mode;
  switch (mode.tag) {
    case 'PrimaryPelletsMode': {
      const typeId = mode.typeId;
      if (typeId === null) {
        throw new Error(`missing projectile type in recipe for weapon ${weaponId as number}`);
      }
      const pellets = Math.max(0, (mode.count ?? 0) | 0);
      shotCount = pellets;
      const meta = travelBudgetForTypeId(typeId);
      const pelletJitterCaller = isFireBullets ? null : (_PELLET_JITTER_CALLER_BY_WEAPON.get(weaponId) ?? null);
      const pelletSpeedCaller = isFireBullets ? null : (_PELLET_SPEED_SCALE_CALLER_BY_WEAPON.get(weaponId) ?? null);
      for (let i = 0; i < pellets; i++) {
        const angle = applyPelletJitter(
          shotAngle,
          state.rng,
          mode.jitter,
          pelletJitterCaller,
        );
        const projId = state.projectiles.spawn(
          muzzle,
          angle,
          typeId,
          projectileOwner,
          meta,
        );
        applySpeedScaleRule(
          state,
          projId | 0,
          mode.speedScale,
          pelletSpeedCaller,
        );
      }
      break;
    }
    case 'SecondaryShotMode': {
      let targetHint: Vec2 | null = null;
      let spawnCreatures: readonly CreatureStateLike[] | null = null;
      if (mode.targeting.tag === 'UseAimTargetHint') {
        targetHint = aim;
        spawnCreatures = creatures;
      }
      state.secondaryProjectiles.spawnFromSpec({
        pos: muzzle,
        angle: shotAngle,
        typeId: mode.typeId,
        owner,
        targetHint,
        creatures: spawnCreatures as CreatureState[] | null,
        preserveBugs: state.preserveBugs,
      });
      break;
    }
    case 'ParticleStreamMode': {
      if (mode.slow) {
        state.particles.spawnParticleSlow(
          muzzle,
          Vec2.fromHeading(shotAngle).toAngle(),
          owner,
        );
      } else {
        const particleId = state.particles.spawnParticle(
          muzzle,
          particleAngle,
          1.0,
          owner,
        );
        if (mode.style !== null) {
          state.particles.entries[particleId].styleId = mode.style;
        }
      }
      break;
    }
    case 'MultiPlasmaFanMode': {
      // Multi-Plasma: 5-shot fixed spread using type 0x09 and 0x0B.
      shotCount = 5;
      const spreadSmall = Math.PI / 10;
      const spreadLarge = Math.PI / 6;
      const patterns: readonly [number, ProjectileTemplateId][] = [
        [-spreadSmall, ProjectileTemplateId.PLASMA_RIFLE],
        [-spreadLarge, ProjectileTemplateId.PLASMA_MINIGUN],
        [0.0, ProjectileTemplateId.PLASMA_RIFLE],
        [spreadLarge, ProjectileTemplateId.PLASMA_MINIGUN],
        [spreadSmall, ProjectileTemplateId.PLASMA_RIFLE],
      ];
      for (const [angleOffset, typeId] of patterns) {
        state.projectiles.spawn(
          muzzle,
          shotAngle + angleOffset,
          typeId,
          projectileOwner,
          travelBudgetForTypeId(typeId),
        );
      }
      break;
    }
    case 'SwarmerDumpMode': {
      // Mini-Rocket Swarmers -> secondary type 2 (fires the full clip in a spread).
      const rocketCount = Math.max(1, player.weapon.ammo | 0);
      let step: number;
      let angle: number;
      if (state.preserveBugs) {
        // Native bug: step scales by ammo (`ammo * pi/3`), which aliases to identical headings
        // for some clip sizes (e.g. 6 rockets), causing visible clumping.
        step = rocketCount * (Math.PI / 3.0);
        angle = (shotAngle - Math.PI) - step * rocketCount * 0.5;
      } else {
        const spread = Math.PI * (2.0 / 3.0);
        step = rocketCount <= 1 ? 0.0 : spread / (rocketCount - 1);
        angle = shotAngle - spread * 0.5;
      }
      for (let i = 0; i < rocketCount; i++) {
        state.secondaryProjectiles.spawnFromSpec({
          pos: muzzle,
          angle,
          typeId: SecondaryProjectileTypeId.HOMING_ROCKET,
          owner,
          targetHint: aim,
          creatures: creatures as CreatureState[] | null,
          preserveBugs: state.preserveBugs,
        });
        angle += step;
      }
      ammoCost = rocketCount;
      shotCount = rocketCount;
      break;
    }
  }

  const shotsFired = state.shotsFired as number[];
  const weaponShotsFired = state.weaponShotsFired as number[][];
  if ((player.index | 0) >= 0 && (player.index | 0) < shotsFired.length) {
    shotsFired[player.index | 0] += shotCount | 0;
    if ((weaponId as number) >= 0 && (weaponId as number) < WEAPON_COUNT_SIZE) {
      weaponShotsFired[player.index | 0][weaponId as number] += shotCount | 0;
    }
  }

  if (spawnMuzzleAfterProjectile) {
    spawnNativeFireMuzzleSprites(
      state,
      weaponId as number,
      muzzle,
      aimHeading,
      isFireBullets,
    );
  }

  if (!perkActive(player, PerkId.SHARPSHOOTER)) {
    player.spreadHeat = Math.min(0.48, Math.max(0.0, player.spreadHeat + spreadInc));
  }

  let muzzleInc = weaponSpreadHeat;
  if (isFireBullets && pelletCount === 1) {
    muzzleInc = fireBulletsSpreadHeat;
  }
  player.muzzleFlashAlpha = Math.min(1.0, player.muzzleFlashAlpha);
  player.muzzleFlashAlpha = Math.min(1.0, player.muzzleFlashAlpha + muzzleInc);
  player.muzzleFlashAlpha = Math.min(0.8, player.muzzleFlashAlpha);

  player.shotSeq += 1;
  if (state.bonuses.reflexBoost <= 0.0 && !isFireBullets) {
    // Native allows ammo to cross below zero for reload-time firing paths
    // (for example Regression Bullets), and replay checkpoints rely on that.
    player.weapon.ammo = player.weapon.ammo - ammoCost;
  }
  let reloadStartGateOpen = player.weapon.reloadTimer <= 0.0;
  if (forcePreSwapFireGate) {
    // Alt-weapon same-tick fire uses the pre-swap gate (reload_timer==0) for
    // reload restart eligibility after ammo drains below zero.
    reloadStartGateOpen = true;
  }
  if (player.weapon.ammo <= 0.0 && reloadStartGateOpen) {
    playerStartReload(player, state);
  }
  return { fired: true, shotCount: shotCount | 0, ammoCost };
}
