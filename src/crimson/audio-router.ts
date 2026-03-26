// Port of crimson/audio_router.py

import type { AudioState } from '@grim/audio.ts';
import { audioPlaySfx, audioTriggerGameTune } from '@grim/audio.ts';
import type { CrandLike } from '@grim/rand.ts';
import { SfxId } from '@grim/sfx-map.ts';
import type { PlayerState } from './sim/state-types.ts';
import { WEAPON_BY_ID, WeaponId, weaponEntryForProjectileTypeId } from './weapons.ts';
import { type ProjectileHit } from './projectiles/types.ts';
import { RngCallerStatic } from './rng-caller-static.ts';
import { GameMode } from './game-modes.ts';

const _MAX_HIT_SFX_PER_FRAME = 4;

const _BULLET_HIT_SFX: readonly SfxId[] = [
  SfxId.BULLET_HIT_01,
  SfxId.BULLET_HIT_02,
  SfxId.BULLET_HIT_03,
  SfxId.BULLET_HIT_04,
  SfxId.BULLET_HIT_05,
  SfxId.BULLET_HIT_06,
];

export class AudioRouter {
  audioRng: CrandLike;
  audio: AudioState | null;
  demoModeActive: boolean;
  sfxEnabled: boolean;
  reflexBoostTimerSource: (() => number) | null;

  constructor(opts: {
    audioRng: CrandLike;
    audio?: AudioState | null;
    demoModeActive?: boolean;
    sfxEnabled?: boolean;
    reflexBoostTimerSource?: (() => number) | null;
  }) {
    this.audioRng = opts.audioRng;
    this.audio = opts.audio ?? null;
    this.demoModeActive = opts.demoModeActive ?? false;
    this.sfxEnabled = opts.sfxEnabled ?? true;
    this.reflexBoostTimerSource = opts.reflexBoostTimerSource ?? null;
  }

  private _reflexBoostTimer(): number {
    const source = this.reflexBoostTimerSource;
    if (source === null) return 0.0;
    return source();
  }

  playSfx(sfx: SfxId): void {
    if (this.audio === null || !this.sfxEnabled) return;
    audioPlaySfx(this.audio, sfx, { reflexBoostTimer: this._reflexBoostTimer() });
  }

  triggerGameTune(): string | null {
    if (this.audio === null) return null;
    return audioTriggerGameTune(this.audio, { rng: this.audioRng });
  }

  handlePlayerAudio(
    player: PlayerState,
    opts: { prevShotSeq: number; prevReloadActive: boolean; prevReloadTimer: number },
  ): void {
    if (this.audio === null) return;
    const weapon = WEAPON_BY_ID.get(player.weapon.weaponId);
    if (weapon === undefined) return;

    const { prevShotSeq, prevReloadActive, prevReloadTimer } = opts;
    if (int(player.shotSeq) > int(prevShotSeq)) {
      if (player.fireBulletsTimer > 0.0) {
        // player_update (crimsonland.exe): when Fire Bullets is active, the regular per-weapon
        // shot sfx is suppressed and replaced by Fire Bullets + Plasma Minigun fire sfx.
        const fireBullets = WEAPON_BY_ID.get(WeaponId.FIRE_BULLETS);
        const plasmaMinigun = WEAPON_BY_ID.get(WeaponId.PLASMA_MINIGUN);
        if (fireBullets) this.playSfx(fireBullets.fireSound);
        if (plasmaMinigun) this.playSfx(plasmaMinigun.fireSound);
      } else {
        this.playSfx(weapon.fireSound);
      }
    }

    const reloadActive = player.weapon.reloadActive;
    const reloadTimer = player.weapon.reloadTimer;
    const reloadStarted = (!prevReloadActive && reloadActive) || (reloadTimer > prevReloadTimer + 1e-6);
    if (reloadStarted) {
      this.playSfx(weapon.reloadSound);
    }
  }

  private _hitSfxForType(typeId: number, _beamTypes: ReadonlySet<number>, rng: CrandLike): SfxId {
    const entry = weaponEntryForProjectileTypeId(typeId);
    const ammoClass = entry.ammoClass;
    if (ammoClass === 4) return SfxId.SHOCK_HIT_01;
    return _BULLET_HIT_SFX[rng.rand({ caller: RngCallerStatic.PROJECTILE_UPDATE_HIT_SFX }) % _BULLET_HIT_SFX.length];
  }

  playHitSfx(
    hits: ProjectileHit[],
    opts: { gameMode: GameMode; rng: CrandLike; beamTypes: ReadonlySet<number> },
  ): void {
    const { gameMode, rng, beamTypes } = opts;
    if (this.audio === null || hits.length === 0) return;

    const end = Math.min(hits.length, _MAX_HIT_SFX_PER_FRAME);
    let gameTuneStarted = this.audio.music.gameTuneStarted;
    for (let idx = 0; idx < end; idx++) {
      if (!this.demoModeActive && gameMode !== GameMode.RUSH && !gameTuneStarted) {
        audioTriggerGameTune(this.audio, { rng });
        gameTuneStarted = true;
        continue;
      }
      const typeId = int(hits[idx].typeId);
      this.playSfx(this._hitSfxForType(typeId, beamTypes, rng));
    }
  }
}
