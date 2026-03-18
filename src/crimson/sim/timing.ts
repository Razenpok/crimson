// Port of crimson/sim/timing.py

import { f32 } from '@crimson/math-parity.ts';

export function ftolMsI32(dtSeconds: number): number {
  // Convert seconds -> integer milliseconds via float32 scale + truncation.
  const dtF32 = f32(dtSeconds);
  const scaledMsF32 = f32(dtF32 * 1000.0);
  return Math.trunc(scaledMsF32);
}

export class FrameTiming {
  private constructor(
    public readonly dt: number,
    public readonly timeScaleActiveEntry: boolean,
    public readonly timeScaleFactor: number,
    public readonly zeroGateActive: boolean,
    public readonly dtSim: number,
  ) {
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
        "time_scale_factor must be finite and > 0 when active",
      );
    }
    let dtSim = dtF32;
    if (active) {
      dtSim = f32(dtF32 * factor);
    }
    if (opts.zeroGateActive) {
      dtSim = 0.0;
    }
    return new FrameTiming(
      dtF32,
      active,
      factor,
      Boolean(opts.zeroGateActive),
      dtSim,
    );
  }
}
