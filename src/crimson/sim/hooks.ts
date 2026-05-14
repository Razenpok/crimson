// Port of crimson/sim/hooks.py

import type { GameCommand, ResolvedTick } from './input-providers.ts';
import type { DeterministicSessionTick } from './sessions.ts';

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

export class LanFrameSample {
  readonly frameTickIndex: number;
  readonly frameInputs: readonly (readonly number[])[];
  readonly commands: readonly GameCommand[];

  constructor(opts: {
    frameTickIndex: number;
    frameInputs: readonly (readonly number[])[];
    commands?: readonly GameCommand[];
  }) {
    this.frameTickIndex = opts.frameTickIndex;
    this.frameInputs = opts.frameInputs;
    this.commands = opts.commands ?? [];
  }
}

export class LanTickSync {
  readonly frameTickIndex: number;
  readonly frameInputs: readonly (readonly number[])[];

  constructor(opts: {
    frameTickIndex: number;
    frameInputs: readonly (readonly number[])[];
  }) {
    this.frameTickIndex = opts.frameTickIndex;
    this.frameInputs = opts.frameInputs;
  }
}

export class LanSyncCallbacks {
  readonly role: string;
  readonly takeFrameSample: (tickIndex: number) => LanFrameSample | null;
  readonly broadcastTickFrame: ((
    tickIndex: number,
    frameInputs: readonly (readonly number[])[],
    commands: readonly GameCommand[],
  ) => void) | null;

  constructor(opts: {
    role: string;
    takeFrameSample: (tickIndex: number) => LanFrameSample | null;
    broadcastTickFrame?: ((
      tickIndex: number,
      frameInputs: readonly (readonly number[])[],
      commands: readonly GameCommand[],
    ) => void) | null;
  }) {
    this.role = opts.role;
    this.takeFrameSample = opts.takeFrameSample;
    this.broadcastTickFrame = opts.broadcastTickFrame ?? null;
  }
}
