// Port of crimson/sim/batch_apply.py

import type { PresentationStepCommands } from './presentation-step.ts';
import type { DeterministicStepResult } from './step-pipeline.ts';
import type { TerrainFxBatch } from './terrain-fx.ts';
import { EMPTY_TERRAIN_FX_BATCH, terrainFxBatchIsEmpty } from './terrain-fx.ts';
import type { WorldEvents } from './world-state.ts';
import type { TickResult } from './hooks.ts';

// ---------------------------------------------------------------------------
// SimMetadataSink (Protocol → interface)
// ---------------------------------------------------------------------------

export interface SimMetadataSink {
  applyStepMetadata(opts: {
    events: WorldEvents;
    presentation: PresentationStepCommands;
    dtSim: number;
    gameTuneStarted: boolean;
  }): void;
}

// ---------------------------------------------------------------------------
// PresentationTickOutput
// ---------------------------------------------------------------------------

export class PresentationTickOutput {
  readonly tickIndex: number;
  readonly dtSim: number;
  readonly presentation: PresentationStepCommands | null;
  readonly terrainFx: TerrainFxBatch;

  constructor(opts: {
    tickIndex: number;
    dtSim: number;
    presentation: PresentationStepCommands | null;
    terrainFx?: TerrainFxBatch;
  }) {
    this.tickIndex = opts.tickIndex;
    this.dtSim = opts.dtSim;
    this.presentation = opts.presentation;
    this.terrainFx = opts.terrainFx ?? EMPTY_TERRAIN_FX_BATCH;
  }
}

// ---------------------------------------------------------------------------
// applySimMetadataTickResult
// ---------------------------------------------------------------------------

export function applySimMetadataTickResult(opts: {
  simWorld: SimMetadataSink;
  tickResult: TickResult;
  gameTuneStarted: boolean;
}): PresentationTickOutput {
  const { simWorld, tickResult, gameTuneStarted } = opts;
  const step = tickResult.payload.step;
  applyTickToSim({ simWorld, step, gameTuneStarted });
  return new PresentationTickOutput({
    tickIndex: int(tickResult.sourceTick.tickIndex),
    dtSim: Number(step.dtSim),
    presentation: step.presentation,
    terrainFx: step.terrainFx,
  });
}

// ---------------------------------------------------------------------------
// applyTickToSim
// ---------------------------------------------------------------------------

export function applyTickToSim(opts: {
  simWorld: SimMetadataSink;
  step: DeterministicStepResult;
  gameTuneStarted: boolean;
}): void {
  const { simWorld, step, gameTuneStarted } = opts;
  simWorld.applyStepMetadata({
    events: step.events,
    presentation: step.presentation,
    dtSim: Number(step.dtSim),
    gameTuneStarted: gameTuneStarted,
  });
}

// ---------------------------------------------------------------------------
// applySimMetadataBatch
// ---------------------------------------------------------------------------

export function applySimMetadataBatch(opts: {
  simWorld: SimMetadataSink;
  completedResults: readonly TickResult[];
  gameTuneStarted: boolean;
}): PresentationTickOutput[] {
  const { simWorld, completedResults, gameTuneStarted } = opts;
  return completedResults.map((tickResult) =>
    applySimMetadataTickResult({ simWorld, tickResult, gameTuneStarted, }),
  );
}

// ---------------------------------------------------------------------------
// applyPresentationOutputs
// ---------------------------------------------------------------------------

export function applyPresentationOutputs(opts: {
  outputs: readonly PresentationTickOutput[];
  syncAudioBridgeState: () => void;
  applyAudioPlan: (plan: PresentationStepCommands, applyAudio: boolean) => void;
  applyTerrainFx?: ((batch: TerrainFxBatch) => void) | null;
  updateCamera?: ((dtSim: number) => void) | null;
  onOutputApplied?: ((output: PresentationTickOutput) => void) | null;
  applyAudio: boolean;
}): void {
  const {
    outputs,
    syncAudioBridgeState,
    applyAudioPlan,
    applyTerrainFx,
    updateCamera,
    onOutputApplied,
    applyAudio,
  } = opts;

  if (outputs.length === 0) return;

  syncAudioBridgeState();

  for (const output of outputs) {
    if (output.presentation !== null) {
      applyAudioPlan(output.presentation, applyAudio);
      if (updateCamera != null) {
        updateCamera(Number(output.dtSim));
      }
    }
    if (applyTerrainFx != null && !terrainFxBatchIsEmpty(output.terrainFx)) {
      applyTerrainFx(output.terrainFx);
    }
    if (onOutputApplied != null) {
      onOutputApplied(output);
    }
  }
}
