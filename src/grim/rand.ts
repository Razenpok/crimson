// Port of grim/rand.py

// Exact static caller address when known.
export type CallerStatic = number | null;

const CRT_RAND_MULT = 214013;
const CRT_RAND_INC = 2531011;

export type RngTraceSink = (stateBefore: number, stateAfter: number, value: number, caller: CallerStatic) => void;

export interface RngDrawRecord {
  readonly stateBefore: number;
  readonly stateAfter: number;
  readonly value: number;
  readonly caller: CallerStatic;
}

// Raised when strict RNG tracing sees an untagged gameplay draw.
export class MissingRngCallerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingRngCallerError';
  }
}

// Protocol for RNGs that follow the native CRT rand/srand/state contract.
export interface CrandLike {
  readonly state: number;
  srand(seed: number): void;
  rand(opts?: { caller?: CallerStatic }): number;
  advance(draws: number): void;
}

// MSVCRT-compatible `rand()` LCG used by the original game.
// Matches:
//   seed = seed * 214013 + 2531011
//   return (seed >> 16) & 0x7fff
export class CrtRand implements CrandLike {
  private _state: number;
  private _traceSink: RngTraceSink | null = null;
  private _traceRequireCaller = false;

  constructor(seed?: number) {
    if (seed === undefined) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      this._state = arr[0];
    } else {
      this._state = seed >>> 0;
    }
  }

  get state(): number {
    return this._state;
  }

  srand(seed: number): void {
    this._state = seed >>> 0;
  }

  advance(draws: number): void {
    const steps = int(draws);
    if (steps < 0) throw new Error(`draws must be >= 0, got ${draws}`);
    let state = this._state;
    for (let i = 0; i < steps; i++) {
      state = (Math.imul(state, CRT_RAND_MULT) + CRT_RAND_INC) >>> 0;
    }
    this._state = state;
  }

  get traceSink(): RngTraceSink | null {
    return this._traceSink;
  }

  get traceRequireCaller(): boolean {
    return this._traceRequireCaller;
  }

  setTraceSink(sink: RngTraceSink | null, opts?: { requireCaller?: boolean }): void {
    this._traceSink = sink;
    this._traceRequireCaller = opts?.requireCaller ?? false;
  }

  rand(opts?: { caller?: CallerStatic }): number {
    const caller = opts?.caller ?? null;
    const stateBefore = this._state;
    this._state = (Math.imul(this._state, CRT_RAND_MULT) + CRT_RAND_INC) >>> 0;
    const value = (this._state >>> 16) & 0x7FFF;
    if (caller !== null && (caller < 0 || caller > 0xFFFFFFFF)) {
      throw new Error(`caller must be a uint32, got ${caller}`);
    }
    if (this._traceSink !== null) {
      if (this._traceRequireCaller && caller === null) {
        throw new MissingRngCallerError('strict RNG trace requires caller');
      }
      this._traceSink(int(stateBefore), int(this._state), int(value), caller);
    }
    return value;
  }
}

// MSVCRT-compatible `rand()` LCG.
export class Crand extends CrtRand {}

class RecordingState {
  base: CrandLike;
  records: RngDrawRecord[] = [];

  constructor(base: CrandLike) {
    this.base = base;
  }
}

export class RecordingCrand implements CrandLike {
  private _shared: RecordingState;

  constructor(base: CrandLike, shared?: RecordingState) {
    this._shared = shared ?? new RecordingState(base);
  }

  get state(): number {
    return this._shared.base.state;
  }

  get calls(): number {
    return this._shared.records.length;
  }

  get records(): readonly RngDrawRecord[] {
    return this._shared.records;
  }

  srand(seed: number): void {
    this._shared.base.srand(seed);
    this._shared.records.length = 0;
  }

  rand(opts?: { caller?: CallerStatic }): number {
    const caller = opts?.caller ?? null;
    const stateBefore = this._shared.base.state;
    const value = this._shared.base.rand();
    const stateAfter = this._shared.base.state;
    this._shared.records.push({
      stateBefore,
      stateAfter,
      value,
      caller,
    });
    return value;
  }

  advance(draws: number): void {
    if (draws < 0) throw new Error(`draws must be >= 0, got ${draws}`);
    this._shared.base.advance(draws);
  }

  recordsSince(startCall: number = 0): RngDrawRecord[] {
    const start = Math.max(0, startCall);
    return this._shared.records.slice(start);
  }

  valuesSince(startCall: number = 0): number[] {
    return this.recordsSince(startCall).map(r => r.value);
  }
}
