// Port of crimson/sim/frame_pump.py

import type { FixedStepClock } from './clock.ts';
import { FrameContext, InputStatus } from './input-providers.ts';
import type { TickBatchResult } from './tick-runner.ts';

export interface TickFrameRunner {
  beginFrame(frameCtx: FrameContext): void;
  advanceTicks(opts: {
    startTick: number;
    ticksRequested: number;
    tickDt: number;
  }): TickBatchResult;
}

export class TickFrameAdvance {
  readonly batch: TickBatchResult;
  readonly frameIndex: number;
  readonly nextTickIndex: number;
  readonly ticksRequested: number;

  constructor(opts: {
    batch: TickBatchResult;
    frameIndex: number;
    nextTickIndex: number;
    ticksRequested: number;
  }) {
    this.batch = opts.batch;
    this.frameIndex = opts.frameIndex;
    this.nextTickIndex = opts.nextTickIndex;
    this.ticksRequested = opts.ticksRequested;
  }
}

export function advanceTickRunnerFrame(opts: {
  runner: TickFrameRunner;
  startTick: number;
  frameIndex: number;
  ticksRequested: number;
  dtSeconds: number;
  tickDtSeconds: number;
  isNetworked: boolean;
  isReplay: boolean;
  refundClock?: FixedStepClock | null;
}): TickFrameAdvance {
  const nextFrameIndex = Math.trunc(opts.frameIndex) + 1;
  const ticksRequested = Math.max(0, Math.trunc(opts.ticksRequested));

  opts.runner.beginFrame(
    new FrameContext({
      dtSeconds: Number(opts.dtSeconds),
      tickDtSeconds: Number(opts.tickDtSeconds),
      frameIndex: nextFrameIndex,
      candidateTicks: ticksRequested,
      isNetworked: Boolean(opts.isNetworked),
      isReplay: Boolean(opts.isReplay),
    }),
  );

  const batch = opts.runner.advanceTicks({
    startTick: Math.trunc(opts.startTick),
    ticksRequested,
    tickDt: Number(opts.tickDtSeconds),
  });

  const nextTickIndex = Math.trunc(batch.nextTickIndex);

  const refundClock = opts.refundClock ?? null;
  if (
    refundClock !== null &&
    (batch.batchStatus === InputStatus.STALLED ||
      batch.batchStatus === InputStatus.EOS)
  ) {
    const unconsumedTicks = Math.max(
      0,
      Math.trunc(ticksRequested) - Math.trunc(batch.ticksCompleted),
    );
    if (unconsumedTicks > 0) {
      refundClock.accum += unconsumedTicks * Number(opts.tickDtSeconds);
    }
  }

  return new TickFrameAdvance({
    batch,
    frameIndex: nextFrameIndex,
    nextTickIndex,
    ticksRequested,
  });
}
