// Port of crimson/sim/sessions.py

import type { CrandLike } from '@grim/rand.ts';
import { RecordingCrand } from '@grim/rand.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { advanceSurvivalSpawnStage, tickRushModeSpawns, tickSurvivalWaveSpawns } from '@crimson/creatures/spawn.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { perkSelectionOpenChoices, perkSelectionPick } from '@crimson/perks/selection.ts';
import type { SpawnEntry } from '@crimson/quests/types.ts';
import { tickQuestCompletionTransition } from '@crimson/quests/runtime.ts';
import { questSpawnTableEmpty, tickQuestModeSpawns } from '@crimson/quests/timeline.ts';
import { PlayerInput } from './input.ts';
import { normalizeInputFrame } from './input-frame.ts';
import type {
  GameCommand,
  PerkPickCommand,



} from './input-providers.ts';
import { planWorldPresentationStep } from './presentation-step.ts';
import {
  DeterministicStepResult,
  PresentationRngTrace,
  timeScaleReflexBoostFactor,
} from './step-pipeline.ts';
import { TerrainFxScratch } from './terrain-fx.ts';
import { FrameTiming } from './timing.ts';

import { survivalUpdateWeaponHandouts } from '@crimson/gameplay.ts';
import { preparePerkAvailability } from '@crimson/perks/availability.ts';
import { prepareWeaponAvailability } from '@crimson/weapon-runtime/availability.ts';
import { applyTypoCommand } from '@crimson/typo/runtime.ts';
import type { WorldState } from './world-state.ts';
export type { WorldState };

// ---------------------------------------------------------------------------
// DeterministicSessionTick
// ---------------------------------------------------------------------------

export class DeterministicSessionTick {
  readonly step: DeterministicStepResult;
  readonly elapsedMs: number;
  readonly creatureCountWorldStep: number;

  constructor(
    step: DeterministicStepResult,
    elapsedMs: number,
    creatureCountWorldStep: number,
  ) {
    this.step = step;
    this.elapsedMs = elapsedMs;
    this.creatureCountWorldStep = creatureCountWorldStep;
  }
}

// ---------------------------------------------------------------------------
// MidStepContext / PostStepContext
// ---------------------------------------------------------------------------

export class MidStepContext {
  readonly world: WorldState;
  readonly elapsedBeforeMs: number;
  readonly dtSimMs: number;
  readonly dtRawMs: number;
  readonly worldSize: number;

  constructor(
    world: WorldState,
    elapsedBeforeMs: number,
    dtSimMs: number,
    dtRawMs: number,
    worldSize: number,
  ) {
    this.world = world;
    this.elapsedBeforeMs = elapsedBeforeMs;
    this.dtSimMs = dtSimMs;
    this.dtRawMs = dtRawMs;
    this.worldSize = worldSize;
  }
}

export type MidStepHook = (ctx: MidStepContext) => void;

export class PostStepContext {
  readonly world: WorldState;
  readonly stepResult: DeterministicStepResult;
  readonly dtSimMs: number;
  readonly worldSize: number;
  readonly detailPreset: number;

  constructor(
    world: WorldState,
    stepResult: DeterministicStepResult,
    dtSimMs: number,
    worldSize: number,
    detailPreset: number,
  ) {
    this.world = world;
    this.stepResult = stepResult;
    this.dtSimMs = dtSimMs;
    this.worldSize = worldSize;
    this.detailPreset = detailPreset;
  }
}

export type PostStepHook = (ctx: PostStepContext) => void;

// ---------------------------------------------------------------------------
// Spawn state classes
// ---------------------------------------------------------------------------

export class SurvivalSpawnState {
  stage = 0;
  spawnCooldownMs = 0.0;
}

export class RushSpawnState {
  spawnCooldownMs = 0.0;
}

export class QuestSpawnState {
  spawnEntries: readonly SpawnEntry[] = [];
  spawnTimelineMs = 0.0;
  noCreaturesTimerMs = 0.0;
  completionTransitionMs = -1.0;
  completed = false;
  playHitSfx = false;
  playCompletionMusic = false;
}

// ---------------------------------------------------------------------------
// Mode-specific step functions
// ---------------------------------------------------------------------------

export function survivalMidStep(ctx: MidStepContext, spawn: SurvivalSpawnState): void {
  const state = ctx.world.state;

  survivalUpdateWeaponHandouts(state, ctx.world.players, { survivalElapsedMs: ctx.elapsedBeforeMs });

  const playerLevel = ctx.world.players.length > 0 ? ctx.world.players[0].level : 1;
  const [stage, milestoneCalls] = advanceSurvivalSpawnStage(spawn.stage, { playerLevel: playerLevel | 0 });
  spawn.stage = stage;

  for (const call of milestoneCalls) {
    ctx.world.creatures.spawnTemplate(call.templateId, call.pos, call.heading, state.rng);
  }

  const playerXp = ctx.world.players.length > 0 ? ctx.world.players[0].experience : 0;
  const [cooldown, waveSpawns] = tickSurvivalWaveSpawns(
    spawn.spawnCooldownMs,
    ctx.dtSimMs,
    state.rng,
    {
      playerCount: ctx.world.players.length,
      survivalElapsedMs: ctx.elapsedBeforeMs,
      playerExperience: playerXp | 0,
      terrainWidth: ctx.worldSize | 0,
      terrainHeight: ctx.worldSize | 0,
    },
  );
  spawn.spawnCooldownMs = cooldown;
  ctx.world.creatures.spawnInits(waveSpawns);
}

export function rushMidStep(ctx: MidStepContext, spawn: RushSpawnState): void {
  const state = ctx.world.state;
  const [cooldown, spawns] = tickRushModeSpawns(
    spawn.spawnCooldownMs,
    ctx.dtRawMs,
    state.rng,
    {
      playerCount: ctx.world.players.length,
      survivalElapsedMs: ctx.elapsedBeforeMs | 0,
      terrainWidth: ctx.worldSize,
      terrainHeight: ctx.worldSize,
    },
  );
  spawn.spawnCooldownMs = cooldown;
  ctx.world.creatures.spawnInits(spawns);
}

export function questPostStep(ctx: PostStepContext, spawn: QuestSpawnState): void {
  const state = ctx.world.state;
  const dtMs = ctx.stepResult.timing.dtMsI32;
  const creaturesNoneActive = !ctx.world.creatures.entries.some((c) => c.active);

  const result = tickQuestModeSpawns(
    spawn.spawnEntries,
    spawn.spawnTimelineMs,
    dtMs,
    {
      terrainWidth: ctx.world.spawnEnv.terrainWidth,
      creaturesNoneActive,
      noCreaturesTimerMs: spawn.noCreaturesTimerMs,
    },
  );

  spawn.spawnEntries = result.entries;
  spawn.spawnTimelineMs = result.questSpawnTimelineMs;
  spawn.noCreaturesTimerMs = result.noCreaturesTimerMs;

  const spawnTableEmptyNow = questSpawnTableEmpty(spawn.spawnEntries);
  if (!state.demoModeActive && result.creaturesNoneActive && spawnTableEmptyNow) {
    state.bonuses.reflexBoost = 0.0;
    state.timeScaleActive = false;
  }

  for (const call of result.spawnCalls) {
    ctx.world.creatures.spawnTemplate(call.templateId, call.pos, call.heading, state.rng);
  }

  const anyAliveAfter = ctx.world.players.some((player) => player.health > 0.0);

  if (anyAliveAfter) {
    const completionResult = tickQuestCompletionTransition(
      spawn.completionTransitionMs,
      dtMs,
      {
        creaturesNoneActive: result.creaturesNoneActive,
        spawnTableEmpty: spawnTableEmptyNow,
      },
    );
    spawn.completionTransitionMs = completionResult.completionTransitionMs;
    spawn.completed = completionResult.completed;
    spawn.playHitSfx = completionResult.playHitSfx;
    spawn.playCompletionMusic = completionResult.playCompletionMusic;
  } else {
    spawn.completionTransitionMs = -1.0;
    spawn.completed = false;
    spawn.playHitSfx = false;
    spawn.playCompletionMusic = false;
  }
}

// ---------------------------------------------------------------------------
// rushInputTransform
// ---------------------------------------------------------------------------

export function rushInputTransform(inputs: PlayerInput[]): PlayerInput[] {
  return inputs.map((inp) =>
    inp.reloadPressed ? inp.replace({ reloadPressed: false }) : inp,
  );
}

// ---------------------------------------------------------------------------
// _sessionTiming (private helper)
// ---------------------------------------------------------------------------

function sessionTiming(
  state: { timeScaleActive: boolean; bonuses: { reflexBoost: number } },
  dt: number,
): FrameTiming {
  return FrameTiming.compute(dt, {
    timeScaleActiveEntry: Boolean(state.timeScaleActive),
    timeScaleFactor: timeScaleReflexBoostFactor({
      reflexBoostTimer: Number(state.bonuses.reflexBoost),
      timeScaleActive: Boolean(state.timeScaleActive),
    }),
    zeroGateActive: false,
  });
}

// ---------------------------------------------------------------------------
// DeterministicSession
// ---------------------------------------------------------------------------

export interface DeterministicSessionOpts {
  world: WorldState;
  worldSize: number;
  damageScaleByType: Map<number, number>;
  gameMode: GameMode;
  perkProgressionEnabled: boolean;
  detailPreset?: number;
  violenceDisabled?: number;
  gameTuneStarted?: boolean;
  demoModeActive?: boolean;
  applyWorldDtSteps?: boolean;
  deferCameraShakeUpdate?: boolean;
  finalizePostRenderLifecycle?: boolean;
  elapsedUsesRawDt?: boolean;
  midStepHook?: MidStepHook | null;
  postStepHook?: PostStepHook | null;
  beforeStepHook?: (() => void) | null;
  inputTransform?: ((inputs: PlayerInput[]) => PlayerInput[]) | null;
}

export class DeterministicSession {
  world: WorldState;
  worldSize: number;
  damageScaleByType: Map<number, number>;
  gameMode: GameMode;
  perkProgressionEnabled: boolean;
  detailPreset: number;
  violenceDisabled: number;
  gameTuneStarted: boolean;
  demoModeActive: boolean;
  applyWorldDtSteps: boolean;
  deferCameraShakeUpdate: boolean;
  finalizePostRenderLifecycle: boolean;
  elapsedUsesRawDt: boolean;
  elapsedMs: number;
  terrainFx: TerrainFxScratch;
  midStepHook: MidStepHook | null;
  postStepHook: PostStepHook | null;
  beforeStepHook: (() => void) | null;
  inputTransform: ((inputs: PlayerInput[]) => PlayerInput[]) | null;

  constructor(opts: DeterministicSessionOpts) {
    this.world = opts.world;
    this.worldSize = opts.worldSize;
    this.damageScaleByType = opts.damageScaleByType;
    this.gameMode = opts.gameMode;
    this.perkProgressionEnabled = opts.perkProgressionEnabled;
    this.detailPreset = opts.detailPreset ?? 5;
    this.violenceDisabled = opts.violenceDisabled ?? 0;
    this.gameTuneStarted = opts.gameTuneStarted ?? false;
    this.demoModeActive = opts.demoModeActive ?? false;
    this.applyWorldDtSteps = opts.applyWorldDtSteps ?? true;
    this.deferCameraShakeUpdate = opts.deferCameraShakeUpdate ?? false;
    this.finalizePostRenderLifecycle = opts.finalizePostRenderLifecycle ?? false;
    this.elapsedUsesRawDt = opts.elapsedUsesRawDt ?? false;
    this.elapsedMs = 0.0;
    this.terrainFx = new TerrainFxScratch();
    this.midStepHook = opts.midStepHook ?? null;
    this.postStepHook = opts.postStepHook ?? null;
    this.beforeStepHook = opts.beforeStepHook ?? null;
    this.inputTransform = opts.inputTransform ?? null;

    // __post_init__ logic
    const state = this.world.state;
    state.gameMode = this.gameMode;
    state.demoModeActive = this.demoModeActive;
    // state.status is typed `unknown` (TODO: Phase X — GameStatus); cast to
    // the narrower union each callee expects.  Currently always null at runtime.
    prepareWeaponAvailability(state, state.status as Parameters<typeof prepareWeaponAvailability>[1]);
    preparePerkAvailability(state);
  }

  timingForDt(dt: number): FrameTiming {
    return sessionTiming(this.world.state, dt);
  }

  stepTick(opts: {
    dt: number;
    inputs: PlayerInput[] | null;
    traceRng?: boolean;
    commands?: GameCommand[] | null;
  }): DeterministicSessionTick {
    const { dt, inputs } = opts;
    const traceRng = opts.traceRng ?? false;
    const commands = opts.commands ?? null;

    const timing = this.timingForDt(dt);

    if (this.beforeStepHook !== null) {
      this.beforeStepHook();
    }

    // Process commands
    const postApplySfx: SfxId[] = [];
    if (commands !== null) {
      for (const cmd of commands) {
        switch (cmd.tag) {
          case 'perk_pick': {
            const ci = (cmd as PerkPickCommand).choiceIndex;
            const picked = perkSelectionPick(
              this.world.state,
              this.world.players,
              this.world.state.perkSelection,
              ci,
              {
                gameMode: this.gameMode,
                playerCount: this.world.players.length,
                dt: timing.dtSim,
                creatures: this.world.creatures.entries,
                refreshChoices: true,
              },
            );
            if (picked !== null) {
              postApplySfx.push(SfxId.UI_BONUS);
            }
            break;
          }
          case 'perk_menu_open': {
            perkSelectionOpenChoices(
              this.world.state,
              this.world.players,
              this.world.state.perkSelection,
              { gameMode: this.gameMode, playerCount: this.world.players.length },
            );
            break;
          }
          case 'typo_char':
          case 'typo_backspace':
          case 'typo_submit': {
            if (this.gameMode !== GameMode.TYPO) {
              throw new Error(`Typ-o command in non-Typo session: ${cmd.tag}`);
            }
            applyTypoCommand(this.world, cmd);
            break;
          }
          default:
            throw new Error(`unhandled command type: ${(cmd as { tag: string }).tag}`);
        }
      }
    }

    // Apply input transform
    let tickInputs = inputs;
    if (tickInputs !== null && this.inputTransform !== null) {
      tickInputs = this.inputTransform(tickInputs);
    }

    const state = this.world.state;
    const dtSimMs = timing.dtSimMsI32;
    const dtRawMs = timing.dtMsI32;
    const elapsedBeforeMs = this.elapsedMs;

    // Build mid-step hook closure
    let hook: (() => void) | null = null;
    if (this.midStepHook !== null) {
      const ctx = new MidStepContext(
        this.world,
        elapsedBeforeMs,
        dtSimMs,
        dtRawMs,
        this.worldSize,
      );
      const mid = this.midStepHook;
      hook = () => mid(ctx);
    }

    // Terrain FX queues
    const fxQueue = this.terrainFx.decals;
    const fxQueueRotated = this.terrainFx.corpses;

    // RNG trace setup
    let presentationRng: CrandLike;
    let recordingRng: RecordingCrand | null = null;
    if (traceRng) {
      recordingRng = new RecordingCrand(state.rng);
      presentationRng = recordingRng;
    } else {
      presentationRng = state.rng;
    }

    // Normalize inputs
    const normalizedInputs = normalizeInputFrame(
      tickInputs,
      { playerCount: this.world.players.length },
    ).asList();

    // Set state fields
    state.gameMode = this.gameMode;
    state.demoModeActive = this.demoModeActive;

    // Capture previous audio state for presentation step
    const prevAudio: [number, boolean, number][] = this.world.players.map(
      (player) => [player.shotSeq, player.weapon.reloadActive, player.weapon.reloadTimer],
    );
    const prevPerkPending = this.world.state.perkSelection.pendingCount;

    // --- World step ---
    const events = this.world.step(timing.dtSim, {
      inputs: normalizedInputs,
      fxQueue,
      fxQueueRotated,
      worldSize: this.worldSize,
      damageScaleByType: this.damageScaleByType,
      detailPreset: this.detailPreset,
      gameMode: this.gameMode,
      perkProgressionEnabled: this.perkProgressionEnabled ?? true,
      gameTuneStarted: this.gameTuneStarted,
      midStepHook: hook,
      dtPlayerLocal: timing.dtPlayerLocal,
      applyWorldDtSteps: this.applyWorldDtSteps,
      deferCameraShakeUpdate: this.deferCameraShakeUpdate,
      violenceDisabled: this.violenceDisabled,
    });
    const creatureCountWorldStep = this.world.creatures.entries.filter(c => c.active).length;

    // Build presentation RNG trace
    const presentationRngTrace = new PresentationRngTrace();
    if (recordingRng !== null) {
      presentationRngTrace.drawsTotal = recordingRng.calls;
    }

    // Build terrain FX batch
    const terrainFxBatch = this.terrainFx.takeBatch();

    // Plan presentation step
    const presT0 = performance.now();
    const presentation = planWorldPresentationStep({
      state: this.world.state,
      players: this.world.players,
      fxQueue,
      hits: events.hits,
      pickups: events.pickups,
      eventSfx: events.sfx,
      prevAudio,
      prevPerkPending,
      gameMode: this.gameMode,
      demoModeActive: this.demoModeActive,
      perkProgressionEnabled: this.perkProgressionEnabled,
      rng: presentationRng,
      detailPreset: this.detailPreset,
      violenceDisabled: this.violenceDisabled,
      gameTuneStarted: this.gameTuneStarted,
      triggerGameTune: events.triggerGameTune,
      hitSfx: events.hitSfx,
    });
    const presT1 = performance.now();
    const presentationPlanMs = presT1 - presT0;

    // Wire up game tune trigger
    if (presentation.triggerGameTune) {
      this.gameTuneStarted = true;
    }

    // Build step result
    const step = new DeterministicStepResult(
      timing.dtSim,
      timing,
      events,
      presentation,
      presentationPlanMs,
      presentationRngTrace,
      terrainFxBatch,
      postApplySfx.length > 0 ? postApplySfx : [],
    );

    // Post-step hook
    if (this.postStepHook !== null) {
      this.postStepHook(new PostStepContext(
        this.world,
        step,
        dtSimMs,
        this.worldSize,
        this.detailPreset,
      ));
    }

    // Finalize post-render lifecycle
    if (this.finalizePostRenderLifecycle) {
      this.world.creatures.finalizePostRenderLifecycle();
    }

    // Update elapsed time
    if (this.elapsedUsesRawDt) {
      this.elapsedMs += dtRawMs;
    } else {
      this.elapsedMs += dtSimMs;
    }

    return new DeterministicSessionTick(step, this.elapsedMs, creatureCountWorldStep);
  }
}
