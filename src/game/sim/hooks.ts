// Port of crimson/sim/hooks.py

import type { GameCommand, ResolvedTick } from './input-providers.ts';
import type { DeterministicSessionTick } from './sessions.ts';

// ---------------------------------------------------------------------------
// TickResult
// ---------------------------------------------------------------------------

export class TickResult {
  readonly sourceTick: ResolvedTick;
  readonly payload: DeterministicSessionTick;
  readonly replayTickIndex: number | null;
  readonly lanSync: LanTickSync | null;

  constructor(opts: {
    sourceTick: ResolvedTick;
    payload: DeterministicSessionTick;
    replayTickIndex?: number | null;
    lanSync?: LanTickSync | null;
  }) {
    this.sourceTick = opts.sourceTick;
    this.payload = opts.payload;
    this.replayTickIndex = opts.replayTickIndex ?? null;
    this.lanSync = opts.lanSync ?? null;
  }
}

// ---------------------------------------------------------------------------
// LanFrameSample
// ---------------------------------------------------------------------------

export interface LanFrameSample {
  readonly frameTickIndex: number;
  readonly frameInputs: readonly (readonly number[])[];
  readonly commands: readonly GameCommand[];
}

// ---------------------------------------------------------------------------
// LanTickSync
// ---------------------------------------------------------------------------

export interface LanTickSync {
  readonly frameTickIndex: number;
  readonly frameInputs: readonly (readonly number[])[];
}

// ---------------------------------------------------------------------------
// LanSyncCallbacks
// ---------------------------------------------------------------------------

export interface LanSyncCallbacks {
  readonly role: string;
  takeFrameSample: (tickIndex: number) => LanFrameSample | null;
  broadcastTickFrame?: ((
    tickIndex: number,
    frameInputs: readonly (readonly number[])[],
    commands: readonly GameCommand[],
  ) => void) | null;
}
