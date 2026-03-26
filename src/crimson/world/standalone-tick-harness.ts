// Port of crimson/world/standalone_tick_harness.py

import { WorldRuntime } from "@crimson/world/runtime.js";
import { GameMode } from "@crimson/game-modes.js";
import { FrameContext, LocalInputProvider } from "@crimson/sim/input-providers.js";
import { PlayerInput } from "@crimson/sim/input.js";
import { DeterministicSession } from "@crimson/sim/sessions.js";
import { TickBatchResult, TickRunner } from "@crimson/sim/tick-runner.js";
import { FixedStepClock } from "@crimson/sim/clock.js";
import { applyPresentationOutputs, applySimMetadataBatch } from "@crimson/sim/batch-apply.js";
import {
  applyPostApplyReaction,
  buildPostApplyReaction,
  PostApplyReaction
} from "@crimson/sim/presentation-reactions.js";
import { advanceTickRunnerFrame } from "@crimson/sim/frame-pump.js";

type WorldTickInputBuilder = (ctx: FrameContext) => readonly PlayerInput[];

// Standalone local runner for demo/debug screens outside BaseGameplayMode.
export class StandaloneTickHarness {
  private readonly _gameMode: GameMode;
  private readonly _buildInputs: WorldTickInputBuilder;
  private readonly _tickRate: number;
  private _session: DeterministicSession | null = null;
  private _runner: TickRunner | null = null;
  private _worldState: object | null = null;
  private _playerCount = 0;
  private _clock: FixedStepClock;
  private _frameIndex = 0;
  private _nextTickIndex = 0;

  constructor(opts: {
    gameMode: GameMode;
    buildInputs: WorldTickInputBuilder;
    tickRate?: number;
  }) {
    this._gameMode = opts.gameMode;
    this._buildInputs = opts.buildInputs;
    this._tickRate = Math.max(1, int(opts.tickRate ?? 60));
    this._clock = new FixedStepClock(this._tickRate);
  }

  reset(): void {
    this._session = null;
    this._runner = null;
    this._worldState = null;
    this._playerCount = 0;
    this._clock = new FixedStepClock(this._tickRate);
    this._frameIndex = 0;
    this._nextTickIndex = 0;
  }

  private _ensureRunner(runtime: WorldRuntime): [TickRunner, DeterministicSession] {
    const worldState = runtime.simWorld.worldState;
    const playerCount = runtime.simWorld.players.length;

    if (
      this._session !== null &&
      this._runner !== null &&
      this._worldState === worldState &&
      int(this._playerCount) === int(playerCount)
    ) {
      return [this._runner, this._session];
    }

    let detailPreset = 5;
    let violenceDisabled = 0;
    const config = runtime.config;
    if (config !== null) {
      detailPreset = config.display.detailPreset;
      violenceDisabled = config.display.violenceDisabled;
    }

    const session = new DeterministicSession({
      world: worldState,
      worldSize: runtime.worldSize,
      damageScaleByType: runtime.simWorld.damageScaleByType,
      gameMode: this._gameMode,
      detailPreset: int(detailPreset),
      violenceDisabled,
      gameTuneStarted: runtime.simWorld.gameTuneStarted,
      demoModeActive: runtime.demoModeActive,
      perkProgressionEnabled: false,
      applyWorldDtSteps: true,
    });

    const provider = new LocalInputProvider({
      playerCount: int(playerCount),
      buildInputs: this._buildInputs,
    });

    const runner = new TickRunner({
      session,
      inputProvider: provider,
    });

    this._session = session;
    this._runner = runner;
    this._worldState = worldState;
    this._playerCount = int(playerCount);
    this._clock = new FixedStepClock(this._tickRate);
    this._frameIndex = 0;
    this._nextTickIndex = 0;
    return [runner, session];
  }

  private _applyTickBatch(
    runtime: WorldRuntime,
    opts: {
      batch: TickBatchResult,
      session: DeterministicSession,
    },
  ): number {
    const { batch, session } = opts;
    const outputs = applySimMetadataBatch({
      simWorld: runtime.simWorld,
      completedResults: batch.completedResults,
      gameTuneStarted: session.gameTuneStarted,
    });

    const reactions = new Map<number, PostApplyReaction>();
    for (const result of batch.completedResults) {
      reactions.set(
        int(result.sourceTick.tickIndex),
        buildPostApplyReaction({ tickResult: result }),
      );
    }

    applyPresentationOutputs({
      outputs,
      syncAudioBridgeState: () => runtime.syncAudioBridgeState(),
      applyAudioPlan: (plan, shouldApplyAudio) =>
        runtime.audioBridge.applyPlan({ plan, applyAudio: shouldApplyAudio }),
      applyTerrainFx: (batch) => runtime.renderResources.consumeTerrainFxBatch(batch),
      updateCamera: (dtSim) => runtime.updateCamera(dtSim),
      onOutputApplied: (output) => {
        const reaction = reactions.get(int(output.tickIndex)) ?? new PostApplyReaction();
        if (reaction) {
          applyPostApplyReaction({
            reaction,
            playSfx: (sfx) => runtime.audioBridge.router.playSfx(sfx),
          });
        }
      },
      applyAudio: true,
    });

    return outputs.length;
  }

  advanceFrame(runtime: WorldRuntime, dt: number): number {
    if (runtime.simWorld.players.length === 0) return 0;
    runtime.terrainRuntime.processPending();

    const [runner, session] = this._ensureRunner(runtime);
    session.demoModeActive = runtime.demoModeActive;

    const ticksRequested = int(this._clock.advance(dt));
    const advance = advanceTickRunnerFrame({
      runner,
      startTick: int(this._nextTickIndex),
      frameIndex: int(this._frameIndex),
      ticksRequested: int(ticksRequested),
      dtSeconds: dt,
      tickDtSeconds: this._clock.dtTick,
      isNetworked: false,
      isReplay: false,
      refundClock: this._clock,
    });

    this._frameIndex = int(advance.frameIndex);
    this._nextTickIndex = int(advance.nextTickIndex);

    return this._applyTickBatch(runtime, { batch: advance.batch, session });
  }
}