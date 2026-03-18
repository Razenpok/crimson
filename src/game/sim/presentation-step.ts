// Port of crimson/sim/presentation_step.py

import { Vec2 } from '../../engine/geom.ts';
import type { CrandLike } from '../../engine/rand.ts';
import { SfxId } from '../../engine/sfx-map.ts';
import { freezeBonusActive } from '../bonuses/freeze.ts';
import type { FxQueue } from '../effects.ts';
import { queueProjectileLargeStreakDecal } from '../features/presentation.ts';
import { GameMode } from '../game-modes.ts';
import { PerkId } from '../perks/ids.ts';
import { perkActive } from '../perks/helpers.ts';
import type { ProjectileHit } from '../projectiles/types.ts';
import { ProjectileTemplateId } from '../projectiles/types.ts';
import { RngCallerStatic } from '../rng-caller-static.ts';
import { WEAPON_BY_ID, WeaponId, weaponEntryForProjectileTypeId } from '../weapons.ts';
import type { BonusPickupEvent, GameplayState, PlayerState } from './state-types.ts';
import { BEAM_TYPES } from './world-defs.ts';

const _MAX_HIT_SFX_PER_FRAME = 4;
const _BULLET_HIT_SFX: readonly SfxId[] = [
  SfxId.BULLET_HIT_01, SfxId.BULLET_HIT_02, SfxId.BULLET_HIT_03,
  SfxId.BULLET_HIT_04, SfxId.BULLET_HIT_05, SfxId.BULLET_HIT_06,
];

/** Extended GameplayState with the fields used by presentation step. */
export interface PresentationGameplayState extends GameplayState {}

// --- PresentationStepCommands ---

export class PresentationStepCommands {
  triggerGameTune = false;
  sfx: SfxId[] = [];
}

// --- PresentationAudioSink ---

export interface PresentationAudioSink {
  triggerGameTune(): string | null;
  playSfx(sfx: SfxId): void;
}

// --- plan_player_audio_sfx ---

export function planPlayerAudioSfx(
  player: PlayerState,
  prevShotSeq: number,
  prevReloadActive: boolean,
  prevReloadTimer: number,
): SfxId[] {
  const sfx: SfxId[] = [];
  const weapon = WEAPON_BY_ID.get(player.weapon.weaponId)!;

  if ((player.shotSeq | 0) > (prevShotSeq | 0)) {
    if (player.fireBulletsTimer > 0.0) {
      const fireBullets = WEAPON_BY_ID.get(WeaponId.FIRE_BULLETS)!;
      const plasmaMinigun = WEAPON_BY_ID.get(WeaponId.PLASMA_MINIGUN)!;
      sfx.push(fireBullets.fireSound);
      sfx.push(plasmaMinigun.fireSound);
    } else {
      sfx.push(weapon.fireSound);
    }
  }

  const reloadActive = player.weapon.reloadActive;
  const reloadTimer = player.weapon.reloadTimer;
  const reloadStarted =
    (!prevReloadActive && reloadActive) ||
    (reloadTimer > prevReloadTimer + 1e-6);
  if (reloadStarted) {
    sfx.push(weapon.reloadSound);
  }

  return sfx;
}

// --- _hit_sfx_for_type ---

function _hitSfxForType(
  typeId: number,
  _beamTypes: ReadonlySet<number>,
  rng: CrandLike,
): SfxId {
  const ammoClass = weaponEntryForProjectileTypeId(typeId as ProjectileTemplateId).ammoClass;
  if (ammoClass === 4) {
    return SfxId.SHOCK_HIT_01;
  }
  return _BULLET_HIT_SFX[rng.rand(RngCallerStatic.PROJECTILE_UPDATE_HIT_SFX) % _BULLET_HIT_SFX.length];
}

// --- plan_hit_sfx ---

export function planHitSfx(
  hits: ProjectileHit[],
  gameMode: GameMode,
  demoModeActive: boolean,
  gameTuneStarted: boolean,
  rng: CrandLike,
  beamTypes: ReadonlySet<number> = BEAM_TYPES,
): [boolean, SfxId[]] {
  if (hits.length === 0) return [false, []];

  let triggerGameTune = false;
  let localGameTuneStarted = gameTuneStarted;
  const end = Math.min(hits.length, _MAX_HIT_SFX_PER_FRAME);
  const sfx: SfxId[] = [];

  for (let idx = 0; idx < end; idx++) {
    if (!demoModeActive && gameMode !== GameMode.RUSH && !localGameTuneStarted) {
      triggerGameTune = true;
      localGameTuneStarted = true;
      rng.rand(RngCallerStatic.SFX_PLAY_EXCLUSIVE_PLAYLIST_PICK);
      continue;
    }
    const typeId = hits[idx].typeId as number;
    sfx.push(_hitSfxForType(typeId, beamTypes, rng));
  }

  return [triggerGameTune, sfx];
}

// --- ProjectileDecalPostCtx ---

export interface ProjectileDecalPostCtx {
  readonly hit: ProjectileHit;
  readonly baseAngle: number;
  readonly typeId: number;
  readonly freezeActive: boolean;
  readonly freezeShardSpawn: ((pos: Vec2, angle: number) => void) | null;
}

// --- queue_projectile_decals ---

export function queueProjectileDecals(
  state: PresentationGameplayState,
  players: readonly PlayerState[],
  fxQueue: FxQueue,
  hits: ProjectileHit[],
  rng: CrandLike,
  detailPreset: number,
  violenceDisabled: number,
): void {
  for (const hit of hits) {
    const postCtx = queueProjectileDecalsPreHit(
      state, players, fxQueue, hit, rng, detailPreset, violenceDisabled,
    );
    queueProjectileDecalsPostHit(fxQueue, postCtx, rng);
  }
}

// --- queue_projectile_decals_pre_hit ---

export function queueProjectileDecalsPreHit(
  state: PresentationGameplayState,
  players: readonly PlayerState[],
  _fxQueue: FxQueue,
  hit: ProjectileHit,
  rng: CrandLike,
  detailPreset: number,
  violenceDisabled: number,
): ProjectileDecalPostCtx {
  const freezeActive = freezeBonusActive(state);
  const bloody = players.length > 0 && perkActive(players[0], PerkId.BLOODY_MESS_QUICK_LEARNER);

  let freezeShardSpawn: ((pos: Vec2, angle: number) => void) | null = null;
  if (freezeActive) {
    freezeShardSpawn = (pos: Vec2, angle: number): void => {
      state.effects.spawnFreezeShard(pos, angle, rng, detailPreset | 0);
    };
  }

  const typeId = hit.typeId;
  const baseAngle = hit.hit.sub(hit.origin).toAngle();

  if (typeId === ProjectileTemplateId.BLADE_GUN) {
    for (let i = 0; i < 8; i++) {
      state.effects.spawnBloodSplatter(
        hit.hit,
        (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_BLADE_GUN_SPLATTER_ANGLE) & 0xFF) * 0.024543693,
        0.0, rng, detailPreset, violenceDisabled,
      );
    }
  }

  if (bloody) {
    for (let i = 0; i < 8; i++) {
      const spread = ((rng.rand(RngCallerStatic.PROJECTILE_UPDATE_BLOODY_MESS_SPREAD) & 0x1F) - 16.0) * 0.0625;
      state.effects.spawnBloodSplatter(
        hit.hit, baseAngle + spread, 0.0, rng, detailPreset, violenceDisabled,
      );
    }
    state.effects.spawnBloodSplatter(
      hit.hit, baseAngle + Math.PI, 0.0, rng, detailPreset, violenceDisabled,
    );

    let lo = -30;
    let hi = 30;
    while (lo > -60) {
      const span = hi - lo;
      const callerPairs: [number, number][] = [
        [RngCallerStatic.PROJECTILE_UPDATE_BLOODY_MESS_DECAL_DX_1, RngCallerStatic.PROJECTILE_UPDATE_BLOODY_MESS_DECAL_DY_1],
        [RngCallerStatic.PROJECTILE_UPDATE_BLOODY_MESS_DECAL_DX_2, RngCallerStatic.PROJECTILE_UPDATE_BLOODY_MESS_DECAL_DY_2],
      ];
      for (const [dxCaller, dyCaller] of callerPairs) {
        const dx = rng.rand(dxCaller) % span + lo;
        const dy = rng.rand(dyCaller) % span + lo;
        _fxQueue.addRandom(hit.target.add(new Vec2(dx, dy)), rng);
      }
      lo -= 10;
      hi += 10;
    }
  } else if (!freezeActive) {
    for (let i = 0; i < 2; i++) {
      state.effects.spawnBloodSplatter(
        hit.hit, baseAngle, 0.0, rng, detailPreset, violenceDisabled,
      );
      if ((rng.rand(RngCallerStatic.PROJECTILE_UPDATE_DEFAULT_REVERSE_SPLATTER_GATE) & 7) === 2) {
        state.effects.spawnBloodSplatter(
          hit.hit, baseAngle + Math.PI, 0.0, rng, detailPreset, violenceDisabled,
        );
      }
    }
  }

  return {
    hit,
    baseAngle,
    typeId: typeId as number,
    freezeActive,
    freezeShardSpawn,
  };
}

// --- queue_projectile_decals_post_hit ---

export function queueProjectileDecalsPostHit(
  fxQueue: FxQueue,
  postCtx: ProjectileDecalPostCtx,
  rng: CrandLike,
): void {
  const hit = postCtx.hit;
  const baseAngle = postCtx.baseAngle;

  rng.rand(RngCallerStatic.PROJECTILE_UPDATE_POST_HIT_DECAL_BURN);

  const hookHandled = queueProjectileLargeStreakDecal(
    hit, baseAngle, fxQueue, rng,
    postCtx.freezeActive ? hit.hit : null,
    postCtx.freezeShardSpawn,
  );

  if (hookHandled || postCtx.freezeActive) return;

  for (let i = 0; i < 3; i++) {
    const spread = (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_DECAL_SPREAD) % 20 - 10) * 0.1;
    const angle = baseAngle + spread;
    const direction = Vec2.fromAngle(angle).mul(20.0);
    fxQueue.addRandom(hit.target, rng);
    fxQueue.addRandom(hit.target.add(direction.mul(1.5)), rng);
    fxQueue.addRandom(hit.target.add(direction.mul(2.0)), rng);
    fxQueue.addRandom(hit.target.add(direction.mul(2.5)), rng);
  }
}

// --- plan_world_presentation_step ---

export function planWorldPresentationStep(opts: {
  state: PresentationGameplayState;
  players: readonly PlayerState[];
  fxQueue: FxQueue;
  hits: ProjectileHit[];
  pickups: BonusPickupEvent[];
  eventSfx: SfxId[];
  prevAudio: readonly [number, boolean, number][];
  prevPerkPending: number;
  gameMode: GameMode;
  demoModeActive: boolean;
  perkProgressionEnabled: boolean;
  rng: CrandLike;
  detailPreset: number;
  violenceDisabled: number;
  gameTuneStarted: boolean;
  triggerGameTune?: boolean | null;
  hitSfx?: SfxId[] | null;
}): PresentationStepCommands {
  const {
    state, players, fxQueue, hits, pickups, eventSfx,
    prevAudio, prevPerkPending, gameMode, demoModeActive,
    perkProgressionEnabled, rng, detailPreset, violenceDisabled,
    gameTuneStarted,
  } = opts;
  const triggerGameTuneOpt = opts.triggerGameTune ?? null;
  const hitSfxOpt = opts.hitSfx ?? null;

  const commands = new PresentationStepCommands();

  if (perkProgressionEnabled && (state.perkSelection.pendingCount | 0) > (prevPerkPending | 0)) {
    commands.sfx.push(SfxId.UI_LEVELUP);
  }

  if (triggerGameTuneOpt === null && hitSfxOpt === null) {
    if (hits.length > 0) {
      queueProjectileDecals(
        state, players, fxQueue, hits, rng,
        detailPreset | 0, violenceDisabled | 0,
      );
      if (freezeBonusActive(state)) {
        if (!demoModeActive && gameMode !== GameMode.RUSH && !gameTuneStarted) {
          commands.triggerGameTune = true;
        }
      } else {
        const [trig, plannedHitSfx] = planHitSfx(
          hits, gameMode, demoModeActive, gameTuneStarted, rng,
        );
        commands.triggerGameTune = trig;
        commands.sfx.push(...plannedHitSfx);
      }
    }
  } else {
    if (triggerGameTuneOpt !== null) {
      commands.triggerGameTune = triggerGameTuneOpt;
    }
    if (hitSfxOpt !== null) {
      commands.sfx.push(...hitSfxOpt);
    }
  }

  for (let idx = 0; idx < players.length; idx++) {
    if (idx >= prevAudio.length) continue;
    const [prevShotSeq, prevReloadActive, prevReloadTimer] = prevAudio[idx];
    commands.sfx.push(
      ...planPlayerAudioSfx(
        players[idx],
        prevShotSeq | 0,
        prevReloadActive,
        prevReloadTimer,
      ),
    );
  }

  if (pickups.length > 0) {
    for (let i = 0; i < pickups.length; i++) {
      commands.sfx.push(SfxId.UI_BONUS);
    }
  }

  commands.sfx.push(...eventSfx.slice(0, 4));

  return commands;
}

// --- apply_presentation_plan ---

export function applyPresentationPlan(
  plan: PresentationStepCommands,
  audioSink: PresentationAudioSink | null,
  applyAudio = true,
): void {
  if (!applyAudio || audioSink === null) return;
  if (plan.triggerGameTune) audioSink.triggerGameTune();
  for (const sfx of plan.sfx) audioSink.playSfx(sfx);
}
