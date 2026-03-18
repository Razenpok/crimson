// Port of crimson/sim/step_pipeline.py

import { SfxId } from '../../engine/sfx-map.ts';
import { f32 } from '../math-parity.ts';
import { PresentationStepCommands } from './presentation-step.ts';
import { TerrainFxBatch, EMPTY_TERRAIN_FX_BATCH } from './terrain-fx.ts';
import { FrameTiming } from './timing.ts';
import { WorldEvents } from './world-state.ts';

export class PresentationRngTrace {
  drawsTotal = 0;
}

export class DeterministicStepResult {
  dtSim: number;
  timing: FrameTiming;
  events: WorldEvents;
  presentation: PresentationStepCommands;
  presentationPlanMs: number;
  presentationRngTrace: PresentationRngTrace;
  terrainFx: TerrainFxBatch;
  postApplySfx: readonly SfxId[];

  constructor(
    dtSim: number,
    timing: FrameTiming,
    events: WorldEvents,
    presentation: PresentationStepCommands,
    presentationPlanMs: number,
    presentationRngTrace: PresentationRngTrace,
    terrainFx: TerrainFxBatch = EMPTY_TERRAIN_FX_BATCH,
    postApplySfx: readonly SfxId[] = [],
  ) {
    this.dtSim = dtSim;
    this.timing = timing;
    this.events = events;
    this.presentation = presentation;
    this.presentationPlanMs = presentationPlanMs;
    this.presentationRngTrace = presentationRngTrace;
    this.terrainFx = terrainFx;
    this.postApplySfx = postApplySfx;
  }
}

// Unused in WebGL port: replay system excluded
export function timeScaleReflexBoostBonus(opts: {
  reflexBoostTimer: number;
  timeScaleActive: boolean;
  dt: number;
}): number {
  const dtF32 = f32(opts.dt);
  if (!(dtF32 > 0.0)) {
    return dtF32;
  }
  if (!opts.timeScaleActive) {
    return dtF32;
  }
  const timeScaleFactor = timeScaleReflexBoostFactor({
    reflexBoostTimer: opts.reflexBoostTimer,
    timeScaleActive: opts.timeScaleActive,
  });
  return f32(dtF32 * timeScaleFactor);
}

export function timeScaleReflexBoostFactor(opts: {
  reflexBoostTimer: number;
  timeScaleActive: boolean;
}): number {
  if (!opts.timeScaleActive) {
    return 1.0;
  }
  const reflexF32 = f32(opts.reflexBoostTimer);
  let timeScaleFactor = f32(0.3);
  if (reflexF32 < 1.0) {
    timeScaleFactor = f32((1.0 - reflexF32) * 0.7 + 0.3);
  }
  return timeScaleFactor;
}
