// Port of crimson/sim/step_pipeline.py

import { SfxId } from '@grim/sfx-map.ts';
import { f32 } from '@crimson/math-parity.ts';
import { PresentationStepCommands } from './presentation-step.ts';
import { TerrainFxBatch, EMPTY_TERRAIN_FX_BATCH } from './terrain-fx.ts';
import { FrameTiming } from './timing.ts';
import { WorldEvents } from './world-state.ts';

export class PresentationRngTrace {
  drawsTotal = 0;
}

export class DeterministicStepResult {
  constructor(
    public dtSim: number,
    public timing: FrameTiming,
    public events: WorldEvents,
    public presentation: PresentationStepCommands,
    public presentationPlanMs: number,
    public presentationRngTrace: PresentationRngTrace,
    public terrainFx: TerrainFxBatch = EMPTY_TERRAIN_FX_BATCH,
    public postApplySfx: readonly SfxId[] = [],
  ) {
  }
}

// Unused in WebGL port: replay system excluded
export function timeScaleReflexBoostBonus(opts: {
  reflexBoostTimer: number;
  timeScaleActive: boolean;
  dt: number;
}): number {
  // Apply Reflex Boost time scaling, matching the classic frame loop latch semantics.

  // Native stores frame delta time in float32 (`frame_dt`). Many downstream systems
  // multiply `frame_dt` before rounding back to float32, so the *input* precision
  // matters even when Reflex Boost is inactive.
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
