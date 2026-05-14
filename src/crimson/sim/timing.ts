// Port of crimson/sim/timing.py

import { f32 } from '@crimson/math-parity.ts';

export function ftolMsI32(dtSeconds: number): number {
  // Convert seconds -> integer milliseconds via float32 scale + truncation.
  const dtF32 = f32(dtSeconds);
  const scaledMsF32 = f32(dtF32 * 1000.0);
  return int(Math.trunc(scaledMsF32));
}

export class FrameTiming {
  readonly dt: number;
  readonly timeScaleActiveEntry: boolean;
  readonly timeScaleFactor: number;
  readonly zeroGateActive: boolean;
  readonly dtSim: number;

  private constructor(opts: {
    dt: number;
    timeScaleActiveEntry: boolean;
    timeScaleFactor: number;
    zeroGateActive: boolean;
    dtSim: number;
  }) {
    this.dt = opts.dt;
    this.timeScaleActiveEntry = opts.timeScaleActiveEntry;
    this.timeScaleFactor = opts.timeScaleFactor;
    this.zeroGateActive = opts.zeroGateActive;
    this.dtSim = opts.dtSim;
  }

  get dtMsI32(): number {
    return ftolMsI32(this.dt);
  }

  get dtSimMsI32(): number {
    return ftolMsI32(this.dtSim);
  }

  get dtPlayerLocal(): number {
    if (!this.timeScaleActiveEntry) {
      return this.dtSim;
    }
    return f32((0.600000024 / this.timeScaleFactor) * this.dtSim);
  }

  static compute(
    dt: number,
    opts: {
      timeScaleActiveEntry: boolean;
      timeScaleFactor: number;
      zeroGateActive: boolean;
    },
  ): FrameTiming {
    const dtF32 = f32(dt);
    if (!Number.isFinite(dtF32)) {
      throw new Error(`dt must be finite, got ${dt}`);
    }
    const active = opts.timeScaleActiveEntry;
    const factor = f32(opts.timeScaleFactor);
    if (active && (!Number.isFinite(factor) || factor <= 0.0)) {
      throw new Error(
        `time_scale_factor must be finite and > 0 when active, got ${opts.timeScaleFactor}`,
      );
    }
    let dtSim = dtF32;
    if (active) {
      dtSim = f32(dtF32 * factor);
    }
    if (opts.zeroGateActive) {
      dtSim = 0.0;
    }
    return new FrameTiming({
      dt: dtF32,
      timeScaleActiveEntry: active,
      timeScaleFactor: factor,
      zeroGateActive: Boolean(opts.zeroGateActive),
      dtSim,
    });
  }
}
