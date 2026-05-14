// Port of crimson/sim/step_pipeline.py

import { SfxId } from '@grim/sfx-map.ts';
import { f32 } from '@crimson/math-parity.ts';
import { PresentationStepCommands } from './presentation-step.ts';
import { TerrainFxBatch } from './terrain-fx.ts';
import { FrameTiming } from './timing.ts';
import { WorldEvents } from './world-state.ts';

export class PresentationRngTrace {
  constructor(opts: { drawsTotal?: number } = {}) {
    this.drawsTotal = opts.drawsTotal ?? 0;
  }

  drawsTotal: number;
}

export class DeterministicStepResult {
  readonly dtSim: number;
  readonly timing: FrameTiming;
  readonly events: WorldEvents;
  readonly presentation: PresentationStepCommands;
  readonly presentationPlanMs: number;
  readonly presentationRngTrace: PresentationRngTrace;
  readonly terrainFx: TerrainFxBatch;
  readonly postApplySfx: readonly SfxId[];

  constructor(opts: {
    dtSim: number;
    timing: FrameTiming;
    events: WorldEvents;
    presentation: PresentationStepCommands;
    presentationPlanMs: number;
    presentationRngTrace: PresentationRngTrace;
    terrainFx?: TerrainFxBatch;
    postApplySfx?: readonly SfxId[];
  }) {
    this.dtSim = opts.dtSim;
    this.timing = opts.timing;
    this.events = opts.events;
    this.presentation = opts.presentation;
    this.presentationPlanMs = opts.presentationPlanMs;
    this.presentationRngTrace = opts.presentationRngTrace;
    this.terrainFx = opts.terrainFx ?? new TerrainFxBatch();
    this.postApplySfx = opts.postApplySfx ?? [];
  }
}

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
