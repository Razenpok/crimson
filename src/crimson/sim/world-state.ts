// Port of crimson/sim/world_state.py

import { Vec2 } from '@grim/geom.ts';
import type { SfxId } from '@grim/sfx-map.ts';

import { emitBonusPickupEffects } from '@crimson/bonuses/pickup-fx.ts';
import { bonusUpdate, bonusUpdatePrePickupTimers } from '@crimson/bonuses/update.ts';
import { cameraShakeUpdate } from '@crimson/camera.ts';
import { creatureAnimAdvancePhase } from '@crimson/creatures/anim.ts';
import { creatureApplyDamageWithLethalFollowup } from '@crimson/creatures/damage.ts';
import {
  type CreatureDeath,
  CreaturePool,
  type SpawnEnv,
} from '@crimson/creatures/runtime.ts';
import {
  CreatureAiMode,
  CreatureFlags,
  CreatureTypeId,
  buildSpawnPlan,
  resolveTint,
  tickSpawnSlot,
} from '@crimson/creatures/spawn.ts';
import type { FxQueue, FxQueueRotated } from '@crimson/effects.ts';
import { GameMode } from '@crimson/game-modes.ts';
import type { OwnerRef } from '@crimson/owner-ref.ts';
import { perksUpdateEffects } from '@crimson/perks/runtime/effects.ts';
import { PLAYER_DEATH_HOOKS, WORLD_DT_STEPS } from '@crimson/perks/runtime/manifest.ts';
import { playerTakeProjectileDamage } from '@crimson/player-damage.ts';
import type { ProjectileHit } from '@crimson/projectiles/types.ts';
import { PlayerInput } from './input.ts';
import { normalizeInputFrame } from './input-frame.ts';
import {
  type ProjectileDecalPostCtx,
  planHitSfx,
  queueProjectileDecalsPostHit,
  queueProjectileDecalsPreHit,
} from './presentation-step.ts';
import type { BonusPickupEvent, GameplayState, PlayerState } from './state-types.ts';
import { CREATURE_ANIM } from './world-defs.ts';
import {
  buildGameplayState,
  playerUpdate,
  playerFrameDtAfterRoundtrip,
  survivalProgressionUpdate,
  survivalEnforceRewardWeaponGuard,
} from '@crimson/gameplay.ts';

// ---------------------------------------------------------------------------
// WorldEvents
// ---------------------------------------------------------------------------

export interface WorldEvents {
  readonly hits: ProjectileHit[];
  readonly deaths: CreatureDeath[];
  readonly pickups: BonusPickupEvent[];
  readonly sfx: SfxId[];
  readonly triggerGameTune: boolean;
  readonly hitSfx: SfxId[];
}

function createWorldEvents(opts: {
  hits: ProjectileHit[];
  deaths: CreatureDeath[];
  pickups: BonusPickupEvent[];
  sfx: SfxId[];
  triggerGameTune?: boolean;
  hitSfx?: SfxId[];
}): WorldEvents {
  return {
    hits: opts.hits,
    deaths: opts.deaths,
    pickups: opts.pickups,
    sfx: opts.sfx,
    triggerGameTune: opts.triggerGameTune ?? false,
    hitSfx: opts.hitSfx ?? [],
  };
}

// ---------------------------------------------------------------------------
// Cached manifest references
// ---------------------------------------------------------------------------

const _WORLD_DT_STEPS = WORLD_DT_STEPS;
const _PLAYER_DEATH_HOOKS = PLAYER_DEATH_HOOKS;

// ---------------------------------------------------------------------------
// CreatureDamageApplier type alias
// ---------------------------------------------------------------------------

type CreatureDamageApplier = (
  creatureIndex: number,
  damage: number,
  damageType: number,
  knockback: Vec2,
  owner: OwnerRef,
) => void;

// ---------------------------------------------------------------------------
// WorldState
// ---------------------------------------------------------------------------

export interface WorldStateStepOpts {
  readonly applyWorldDtSteps?: boolean;
  readonly dtPlayerLocal?: number | null;
  readonly deferCameraShakeUpdate?: boolean;
  readonly deferFreezeCorpseFx?: boolean;
  readonly midStepHook?: (() => void) | null;
  readonly inputs: PlayerInput[] | null;
  readonly worldSize: number;
  readonly damageScaleByType: Map<number, number>;
  readonly detailPreset: number;
  readonly violenceDisabled?: number;
  readonly fxQueue: FxQueue;
  readonly fxQueueRotated: FxQueueRotated;
  readonly gameMode: GameMode;
  readonly perkProgressionEnabled: boolean;
  readonly gameTuneStarted?: boolean;
}

export class WorldState {
  spawnEnv: SpawnEnv;
  state: GameplayState;
  players: PlayerState[];
  creatures: CreaturePool;

  constructor(opts: {
    spawnEnv: SpawnEnv;
    state: GameplayState;
    players: PlayerState[];
    creatures: CreaturePool;
  }) {
    this.spawnEnv = opts.spawnEnv;
    this.state = opts.state;
    this.players = opts.players;
    this.creatures = opts.creatures;
  }

  static build(opts: {
    worldSize: number;
    demoModeActive: boolean;
    hardcore: boolean;
    questFailRetryCount: number;
    preserveBugs?: boolean;
  }): WorldState {
    const spawnEnv: SpawnEnv = {
      terrainWidth: Number(opts.worldSize),
      terrainHeight: Number(opts.worldSize),
      demoModeActive: opts.demoModeActive,
      hardcore: opts.hardcore,
      questFailRetryCount: opts.questFailRetryCount | 0,
    };
    const state = buildGameplayState();
    state.demoModeActive = opts.demoModeActive;
    state.hardcore = opts.hardcore;
    state.preserveBugs = opts.preserveBugs ?? false;
    const players: PlayerState[] = [];
    const creatures = new CreaturePool({
      env: spawnEnv,
      effects: state.effects,
    }, {
      buildSpawnPlan,
      resolveTint,
      tickSpawnSlot,
    });
    return new WorldState({
      spawnEnv,
      state,
      players,
      creatures,
    });
  }

  // -------------------------------------------------------------------------
  // step() — main simulation tick
  // -------------------------------------------------------------------------

  step(dt: number, opts: WorldStateStepOpts): WorldEvents {
    const {
      applyWorldDtSteps = true,
      dtPlayerLocal = null,
      deferCameraShakeUpdate: deferCameraShake = false,
      deferFreezeCorpseFx = false,
      midStepHook = null,
      worldSize,
      damageScaleByType,
      detailPreset,
      violenceDisabled = 0,
      fxQueue,
      fxQueueRotated,
      gameMode,
      perkProgressionEnabled,
      gameTuneStarted = false,
    } = opts;

    let inputs = opts.inputs;

    dt = Number(dt);
    fxQueue.violenceDisabled = violenceDisabled | 0;
    this.state.playerDeathHookSkipIndices.clear();

    // Apply world-dt perk steps (e.g. reflex-boost time scale)
    if (applyWorldDtSteps) {
      for (const step of _WORLD_DT_STEPS) {
        dt = Number(step({ dt, players: this.players }));
      }
    }

    // Normalize input frame to match player count
    const normalizedInputs = normalizeInputFrame(inputs, { playerCount: this.players.length }).asList();

    // Snapshot previous positions & health
    const prevPositions: [number, number][] = this.players.map(
      (player) => [player.pos.x, player.pos.y] as [number, number],
    );
    const prevHealth: number[] = this.players.map((player) => Number(player.health));

    // Native Freeze pickup shatters corpses that existed at tick start;
    // same-tick kills are not included in that pass.
    const freezeCorpseIndicesAtTickStart = new Set<number>();
    const creatureEntries = this.creatures.entries;
    for (let idx = 0; idx < creatureEntries.length; idx++) {
      const creature = creatureEntries[idx];
      if (creature.active && Number(creature.hp) <= 0.0) {
        freezeCorpseIndicesAtTickStart.add(idx);
      }
    }

    // Perks update effects
    perksUpdateEffects(this.state, this.players, dt, { creatures: creatureEntries, fxQueue });

    // effects_update runs early in the native frame loop, before creature/projectile updates
    this.state.effects.update(dt, { fxQueue });

    // --- Creature update ---

    const _applyProjectileDamageToPlayer = (playerIndex: number, damage: number): void => {
      const idx = playerIndex | 0;
      if (!(idx >= 0 && idx < this.players.length)) return;
      playerTakeProjectileDamage(this.state, this.players[idx], Number(damage));
    };

    const creatureResult = this.creatures.update(dt, { options: {
      state: this.state,
      players: this.players,
      rng: this.state.rng,
      env: this.spawnEnv,
      worldWidth: Number(worldSize),
      worldHeight: Number(worldSize),
      fxQueue,
      fxQueueRotated,
      detailPreset: detailPreset | 0,
      violenceDisabled: violenceDisabled | 0,
    } });

    const deaths: CreatureDeath[] = [...creatureResult.deaths];
    const sfx: SfxId[] = [...creatureResult.sfx];
    let triggerGameTune = false;
    const hitSfx: SfxId[] = [];
    let hitAudioGameTuneStarted = gameTuneStarted;

    // --- Projectile damage applier ---

    const _applyProjectileDamageToCreature: CreatureDamageApplier = (
      creatureIndex: number,
      damage: number,
      damageType: number,
      impulse: Vec2,
      owner: OwnerRef,
    ): void => {
      const idx = creatureIndex | 0;
      if (!(idx >= 0 && idx < creatureEntries.length)) return;
      const creature = creatureEntries[idx];
      if (!creature.active) return;

      creatureApplyDamageWithLethalFollowup(
        creature,
        {
          damageAmount: Number(damage),
          damageType: damageType | 0,
          impulse,
          owner,
          dt: Number(dt),
          players: this.players,
          rng: this.state.rng,
          preserveBugs: Boolean(this.state.preserveBugs),
          effects: this.state.effects,
          detailPreset: detailPreset | 0,
          onLethal: (deathSfx: SfxId[]) => {
            this._recordCreatureDeath({
              creatureIndex: idx,
              dt: Number(dt),
              detailPreset: detailPreset | 0,
              worldSize: Number(worldSize),
              fxQueue,
              deaths,
              sfx,
              deathSfx,
            });
          },
        },
      );
    };

    const prevCreatureDamageAppliers = this._setCreatureDamageAppliers(_applyProjectileDamageToCreature);

    // --- Secondary detonation kill handler ---

    const _onSecondaryDetonationKill = (creatureIndex: number): void => {
      const idx = creatureIndex | 0;
      if (!(idx >= 0 && idx < creatureEntries.length) || Number(creatureEntries[idx].hp) > 0.0) {
        return;
      }
      // Native detonation follow-up re-enters creature death handling but does
      // not run a second death-SFX random pick.
      this._recordCreatureDeath({
        creatureIndex: idx,
        dt: Number(dt),
        detailPreset: detailPreset | 0,
        worldSize: Number(worldSize),
        fxQueue,
        deaths,
        sfx,
      });
    };

    // --- Projectile hit handlers ---

    const _onProjectileHitPre = (hit: ProjectileHit): ProjectileDecalPostCtx => {
      return this._prepareProjectileHitPresentation(hit, {
        fxQueue,
        detailPreset: detailPreset | 0,
        violenceDisabled: violenceDisabled | 0,
      });
    };

    const _onProjectileHitPost = (_hit: ProjectileHit, postCtx: unknown): void => {
      this._finalizeProjectileHitPresentation({
        postCtx: postCtx as ProjectileDecalPostCtx,
        fxQueue,
      });
      const [hitTrigger, keys] = planHitSfx(
        [_hit],
        {
          gameMode,
          demoModeActive: this.state.demoModeActive,
          gameTuneStarted: hitAudioGameTuneStarted,
          rng: this.state.rng,
        },
      );
      if (hitTrigger) {
        triggerGameTune = true;
        hitAudioGameTuneStarted = true;
      }
      if (keys.length > 0) {
        hitSfx.push(...keys);
      }
    };

    // --- Primary projectile step ---

    const hits: ProjectileHit[] = this.state.projectiles.step({
      dt: Number(dt),
      creatures: creatureEntries,
      options: {
        worldSize: Number(worldSize),
        damageScaleByType,
        rng: this.state.rng,
        runtimeState: this.state,
        players: this.players,
        applyPlayerDamage: _applyProjectileDamageToPlayer,
        detailPreset: detailPreset | 0,
        onHit: _onProjectileHitPre,
        onHitPost: _onProjectileHitPost,
      },
    });

    // --- Secondary projectile step ---

    this.state.secondaryProjectiles.step({
      dt: Number(dt),
      creatures: creatureEntries,
      runtimeState: this.state,
      fxQueue,
      detailPreset: detailPreset | 0,
      onDetonationKill: _onSecondaryDetonationKill,
    });

    // --- Post-damage player death hooks ---

    this._runPostDamagePlayerDeathHooks({
      prevHealth,
      dt: Number(dt),
      worldSize: Number(worldSize),
      detailPreset: detailPreset | 0,
      fxQueue,
      deaths,
    });

    // --- Particle kill handler (no corpse) ---

    const _killCreatureNoCorpse = (creatureIndex: number, owner: OwnerRef): void => {
      const idx = creatureIndex | 0;
      if (!(idx >= 0 && idx < creatureEntries.length)) return;
      const creature = creatureEntries[idx];
      if (!creature.active) return;
      if (Number(creature.hp) <= 0.0) return;
      creature.lastHitOwner = owner;
      this._recordCreatureDeath({
        creatureIndex: idx,
        dt: Number(dt),
        detailPreset: detailPreset | 0,
        worldSize: Number(worldSize),
        fxQueue,
        deaths,
        sfx,
        keepCorpse: false,
      });
    };

    // --- Particle & sprite effect updates ---

    this.state.particles.update(dt, {
      creatures: creatureEntries,
      killCreature: _killCreatureNoCorpse,
      fxQueue,
      spriteEffects: this.state.spriteEffects,
    });

    this.state.spriteEffects.update(dt);

    // --- Player update ---

    const reloadActiveAny = normalizedInputs.some(
      (entry) => Boolean(entry.reloadDown) || Boolean(entry.reloadPressed),
    );
    let playerDt = Number(dt);
    if (dtPlayerLocal !== null) {
      playerDt = Number(dtPlayerLocal);
    }

    for (let idx = 0; idx < this.players.length; idx++) {
      const player = this.players[idx];
      const inputState = idx < normalizedInputs.length ? normalizedInputs[idx] : new PlayerInput();

      playerUpdate(player, inputState, playerDt, this.state, {
        detailPreset: detailPreset | 0,
        worldSize: Number(worldSize),
        players: this.players,
        creatures: creatureEntries,
        spawnSlots: this.creatures.spawnSlots,
        onPlayerLethal: (deadPlayer: PlayerState) => {
          this._runPlayerDeathHooks({
            player: deadPlayer,
            dt: Number(playerDt),
            worldSize: Number(worldSize),
            detailPreset: detailPreset | 0,
            fxQueue,
            deaths,
          });
        },
        reloadActiveAny: Boolean(reloadActiveAny),
      });

      if (dtPlayerLocal === null) {
        playerDt = playerFrameDtAfterRoundtrip({
          dt: playerDt,
          timeScaleActive: Boolean(this.state.timeScaleActive),
          reflexBoostTimer: Number(this.state.bonuses.reflexBoost),
        });
      }
    }

    dt = Number(playerDt);

    // --- Animation advancement ---

    if (dt > 0.0) {
      this._advanceCreatureAnim(dt);
      this._advancePlayerAnim(dt, prevPositions);
    }

    // --- Mid-step hook ---

    if (midStepHook !== null) {
      midStepHook();
    }

    // --- Camera shake ---

    if (!deferCameraShake) {
      cameraShakeUpdate(this.state, dt);
    }

    // --- Survival progression / perk level-up ---
    // Native level-up/perk-pending check runs before bonus_update in
    // gameplay_update_and_render. Keep the same ordering so XP awarded from
    // bonus-side kill paths (e.g. freeze cleanup) levels on the next tick.

    if (perkProgressionEnabled) {
      survivalProgressionUpdate(this.state, this.players);
    }

    // Native latches timeScaleActive late (post mode update, pre bonus decrement);
    // next-frame dt uses it.
    this.state.timeScaleActive = Number(this.state.bonuses.reflexBoost) > 0.0;

    // --- Bonus update ---

    bonusUpdatePrePickupTimers(this.state, dt);

    const pickups = bonusUpdate(
      this.state,
      this.players,
      dt,
      {
        creatures: creatureEntries,
        updateHud: true,
        detailPreset: detailPreset | 0,
        deferFreezeCorpseFx: Boolean(deferFreezeCorpseFx),
        freezeCorpseIndices: freezeCorpseIndicesAtTickStart,
      },
    );

    if (pickups.length > 0) {
      emitBonusPickupEffects({ state: this.state, pickups, detailPreset: detailPreset | 0 });
    }

    survivalEnforceRewardWeaponGuard(this.state, this.players);

    // --- Flush SFX queue ---

    if (this.state.sfxQueue.length > 0) {
      sfx.push(...this.state.sfxQueue);
      this.state.sfxQueue.length = 0;
    }

    // Player-damage VO RNG work lives inside player_take_damage for native
    // ordering parity (VO draw before heading-jitter draw).

    this.state.playerDeathHookSkipIndices.clear();
    this._restoreCreatureDamageAppliers(prevCreatureDamageAppliers);

    return createWorldEvents({
      hits,
      deaths,
      pickups,
      sfx,
      triggerGameTune: Boolean(triggerGameTune),
      hitSfx,
    });
  }

  // -------------------------------------------------------------------------
  // _setCreatureDamageAppliers / _restoreCreatureDamageAppliers
  // -------------------------------------------------------------------------

  private _setCreatureDamageAppliers(
    applier: CreatureDamageApplier | null,
  ): [
    CreatureDamageApplier | null,
    CreatureDamageApplier | null,
    CreatureDamageApplier | null,
    CreatureDamageApplier | null,
  ] {
    const { projectiles, secondaryProjectiles, particles, bonusPool } = this.state;
    const prev: [
      CreatureDamageApplier | null,
      CreatureDamageApplier | null,
      CreatureDamageApplier | null,
      CreatureDamageApplier | null,
    ] = [
      projectiles.creatureDamageApplier,
      secondaryProjectiles.creatureDamageApplier,
      particles.creatureDamageApplier,
      bonusPool.creatureDamageApplier,
    ];
    projectiles.creatureDamageApplier = applier;
    secondaryProjectiles.creatureDamageApplier = applier;
    particles.creatureDamageApplier = applier;
    bonusPool.creatureDamageApplier = applier;
    return prev;
  }

  private _restoreCreatureDamageAppliers(
    previous: [
      CreatureDamageApplier | null,
      CreatureDamageApplier | null,
      CreatureDamageApplier | null,
      CreatureDamageApplier | null,
    ],
  ): void {
    const { projectiles, secondaryProjectiles, particles, bonusPool } = this.state;
    [
      projectiles.creatureDamageApplier,
      secondaryProjectiles.creatureDamageApplier,
      particles.creatureDamageApplier,
      bonusPool.creatureDamageApplier,
    ] = previous;
  }

  // -------------------------------------------------------------------------
  // _runPlayerDeathHooks
  // -------------------------------------------------------------------------

  private _runPlayerDeathHooks(opts: {
    player: PlayerState;
    dt: number;
    worldSize: number;
    detailPreset: number;
    fxQueue: FxQueue;
    deaths: CreatureDeath[];
  }): void {
    for (const hook of _PLAYER_DEATH_HOOKS) {
      hook({
        state: this.state,
        creatures: this.creatures,
        players: this.players,
        player: opts.player,
        dt: Number(opts.dt),
        worldSize: Number(opts.worldSize),
        detailPreset: opts.detailPreset | 0,
        fxQueue: opts.fxQueue,
        deaths: opts.deaths,
      });
    }
  }

  // -------------------------------------------------------------------------
  // _runPostDamagePlayerDeathHooks
  // -------------------------------------------------------------------------

  private _runPostDamagePlayerDeathHooks(opts: {
    prevHealth: number[];
    dt: number;
    worldSize: number;
    detailPreset: number;
    fxQueue: FxQueue;
    deaths: CreatureDeath[];
  }): void {
    for (let idx = 0; idx < this.players.length; idx++) {
      const player = this.players[idx];
      if (idx >= opts.prevHealth.length) continue;
      if (Number(opts.prevHealth[idx]) < 0.0) continue;
      if (Number(player.health) >= 0.0) continue;

      const playerIdx = player.index | 0;
      if (this.state.playerDeathHookSkipIndices.has(playerIdx)) {
        this.state.playerDeathHookSkipIndices.delete(playerIdx);
        continue;
      }

      this._runPlayerDeathHooks({
        player,
        dt: Number(opts.dt),
        worldSize: Number(opts.worldSize),
        detailPreset: opts.detailPreset | 0,
        fxQueue: opts.fxQueue,
        deaths: opts.deaths,
      });
    }
  }

  // -------------------------------------------------------------------------
  // _recordCreatureDeath
  // -------------------------------------------------------------------------

  private _recordCreatureDeath(opts: {
    creatureIndex: number;
    dt: number;
    detailPreset: number;
    worldSize: number;
    fxQueue: FxQueue;
    deaths: CreatureDeath[];
    sfx?: SfxId[];
    keepCorpse?: boolean;
    deathSfx?: SfxId[];
  }): void {
    const death = this.creatures.handleDeath(opts.creatureIndex | 0, {
      state: this.state,
      players: this.players,
      rng: this.state.rng,
      dt: Number(opts.dt),
      detailPreset: opts.detailPreset | 0,
      worldWidth: Number(opts.worldSize),
      worldHeight: Number(opts.worldSize),
      fxQueue: opts.fxQueue,
      keepCorpse: opts.keepCorpse ?? true,
    });
    opts.deaths.push(death);
    if (opts.deathSfx !== undefined && opts.deathSfx.length > 0 && opts.sfx !== undefined) {
      opts.sfx.push(...opts.deathSfx);
    }
  }

  // -------------------------------------------------------------------------
  // _prepareProjectileHitPresentation
  // -------------------------------------------------------------------------

  private _prepareProjectileHitPresentation(
    hit: ProjectileHit,
    opts: {
      fxQueue: FxQueue;
      detailPreset: number;
      violenceDisabled: number;
    },
  ): ProjectileDecalPostCtx {
    return queueProjectileDecalsPreHit({
      state: this.state,
      players: this.players,
      fxQueue: opts.fxQueue,
      hit,
      rng: this.state.rng,
      detailPreset: opts.detailPreset | 0,
      violenceDisabled: opts.violenceDisabled | 0,
    });
  }

  // -------------------------------------------------------------------------
  // _finalizeProjectileHitPresentation
  // -------------------------------------------------------------------------

  private _finalizeProjectileHitPresentation(opts: {
    postCtx: ProjectileDecalPostCtx;
    fxQueue: FxQueue;
  }): void {
    queueProjectileDecalsPostHit({
      fxQueue: opts.fxQueue,
      postCtx: opts.postCtx,
      rng: this.state.rng,
    });
  }

  // -------------------------------------------------------------------------
  // _advanceCreatureAnim
  // -------------------------------------------------------------------------

  private _advanceCreatureAnim(dt: number): void {
    if (Number(this.state.bonuses.freeze) > 0.0) return;

    const entries = this.creatures.entries;
    for (let i = 0; i < entries.length; i++) {
      const creature = entries[i];
      if (!(creature.active && creature.hp > 0.0)) continue;

      const typeId = creature.typeId;
      const info = CREATURE_ANIM.get(typeId);
      if (info === undefined) continue;

      const [newPhase] = creatureAnimAdvancePhase(
        creature.anim_phase,
        {
          animRate: info.animRate,
          moveSpeed: Number(creature.move_speed),
          dt,
          size: Number(creature.size),
          localScale: Number(creature.move_scale),
          flags: creature.flags as CreatureFlags,
          aiMode: creature.ai_mode as number,
        },
      );
      creature.anim_phase = newPhase;
    }
  }

  // -------------------------------------------------------------------------
  // _advancePlayerAnim
  // -------------------------------------------------------------------------

  private _advancePlayerAnim(dt: number, prevPositions: [number, number][]): void {
    const info = CREATURE_ANIM.get(CreatureTypeId.TROOPER);
    if (info === undefined) return;

    for (let idx = 0; idx < this.players.length; idx++) {
      const player = this.players[idx];
      if (idx >= prevPositions.length) continue;

      const [prevX, prevY] = prevPositions[idx];
      const speed = new Vec2(player.pos.x - prevX, player.pos.y - prevY).length();
      const moveSpeed = dt > 0.0 ? speed / dt / 120.0 : 0.0;

      const [newPhase] = creatureAnimAdvancePhase(
        player.movePhase,
        {
          animRate: info.animRate,
          moveSpeed,
          dt,
          size: Number(player.size),
          localScale: 1.0,
          flags: 0 as CreatureFlags,
          aiMode: CreatureAiMode.ORBIT_PLAYER,
        },
      );
      player.movePhase = newPhase;
    }
  }
}
