// Port of crimson/sim/input_providers.py

import { PlayerInput } from './input.ts';

// ---------------------------------------------------------------------------
// clearInputEdges – inline helper (from local_input.py, not yet ported)
// Clears one-shot "pressed" flags, preserving held-down state.
// ---------------------------------------------------------------------------

function clearInputEdges(inputs: readonly PlayerInput[]): PlayerInput[] {
  return inputs.map(
    (inp) =>
      new PlayerInput({
        move: inp.move,
        aim: inp.aim,
        fireDown: inp.fireDown,
        firePressed: false,
        reloadPressed: false,
        moveToCursorPressed: false,
        moveForwardPressed: inp.moveForwardPressed,
        moveBackwardPressed: inp.moveBackwardPressed,
        turnLeftPressed: inp.turnLeftPressed,
        turnRightPressed: inp.turnRightPressed,
      }),
  );
}

// ---------------------------------------------------------------------------
// Game commands (tagged‑union discriminated by `tag`)
// ---------------------------------------------------------------------------

export class PerkMenuOpenCommand {
  readonly tag = 'perk_menu_open' as const;
  constructor(readonly playerIndex: number) {}
}

export class PerkPickCommand {
  readonly tag = 'perk_pick' as const;
  constructor(
    readonly playerIndex: number,
    readonly choiceIndex: number,
  ) {}
}

export class TypoCharCommand {
  readonly tag = 'typo_char' as const;
  constructor(
    readonly playerIndex: number,
    readonly ch: string,
  ) {}
}

export class TypoBackspaceCommand {
  readonly tag = 'typo_backspace' as const;
  constructor(readonly playerIndex: number) {}
}

export class TypoSubmitCommand {
  readonly tag = 'typo_submit' as const;
  constructor(readonly playerIndex: number) {}
}

export type GameCommand =
  | PerkMenuOpenCommand
  | PerkPickCommand
  | TypoCharCommand
  | TypoBackspaceCommand
  | TypoSubmitCommand;

// ---------------------------------------------------------------------------
// FrameContext
// ---------------------------------------------------------------------------

export class FrameContext {
  readonly dtSeconds: number;
  readonly tickDtSeconds: number;
  readonly frameIndex: number;
  readonly candidateTicks: number;
  readonly isNetworked: boolean;
  readonly isReplay: boolean;

  constructor(opts: {
    dtSeconds: number;
    tickDtSeconds: number;
    frameIndex: number;
    candidateTicks: number;
    isNetworked?: boolean;
    isReplay?: boolean;
  }) {
    this.dtSeconds = opts.dtSeconds;
    this.tickDtSeconds = opts.tickDtSeconds;
    this.frameIndex = opts.frameIndex;
    this.candidateTicks = opts.candidateTicks;
    this.isNetworked = opts.isNetworked ?? false;
    this.isReplay = opts.isReplay ?? false;
  }
}

// ---------------------------------------------------------------------------
// InputStatus
// ---------------------------------------------------------------------------

export enum InputStatus {
  READY = 'ready',
  STALLED = 'stalled',
  EOS = 'eos',
}

// ---------------------------------------------------------------------------
// ResolvedTick
// ---------------------------------------------------------------------------

export class ResolvedTick {
  readonly tickIndex: number;
  readonly dtSeconds: number;
  readonly inputs: readonly PlayerInput[];
  readonly commands: readonly GameCommand[];

  constructor(opts: {
    tickIndex: number;
    dtSeconds: number;
    inputs?: readonly PlayerInput[];
    commands?: readonly GameCommand[];
  }) {
    this.tickIndex = opts.tickIndex;
    this.dtSeconds = opts.dtSeconds;
    this.inputs = opts.inputs ?? [];
    this.commands = opts.commands ?? [];
  }
}

// ---------------------------------------------------------------------------
// TickSupply
// ---------------------------------------------------------------------------

export class TickSupply {
  readonly status: InputStatus;
  readonly tick: ResolvedTick | null;

  constructor(status: InputStatus, tick: ResolvedTick | null = null) {
    this.status = status;
    this.tick = tick;
  }
}

// ---------------------------------------------------------------------------
// InputProvider interface (Protocol → interface)
// ---------------------------------------------------------------------------

export interface InputProvider {
  beginFrame(frameCtx: FrameContext): void;
  pullTick(tickIndex: number, defaultDtSeconds: number): TickSupply;
  supportsCommandSubmission(): boolean;
  submitCommand(command: GameCommand): void;
}

// ---------------------------------------------------------------------------
// LocalInputBuilder type alias
// ---------------------------------------------------------------------------

export type LocalInputBuilder = (ctx: FrameContext) => readonly PlayerInput[];

// ---------------------------------------------------------------------------
// LocalInputProvider
// ---------------------------------------------------------------------------

export class LocalInputProvider implements InputProvider {
  private readonly _playerCount: number;
  private readonly _buildInputs: LocalInputBuilder;
  private _pendingCommands: GameCommand[] = [];
  private _commandsForNextTick: GameCommand[] = [];
  private _frameInputs: PlayerInput[] = [];
  private _edgeInputs: PlayerInput[] = [];
  private _firstTickPending = false;

  constructor(opts: { playerCount: number; buildInputs: LocalInputBuilder }) {
    this._playerCount = Math.max(0, opts.playerCount);
    this._buildInputs = opts.buildInputs;
  }

  beginFrame(frameCtx: FrameContext): void {
    const frameInputs = Array.from(this._buildInputs(frameCtx));
    this._frameInputs = Array.from(frameInputs);
    this._edgeInputs = clearInputEdges(this._frameInputs);
    this._firstTickPending = true;
    if (this._pendingCommands.length > 0) {
      this._commandsForNextTick.push(...this._pendingCommands);
      this._pendingCommands = [];
    }
  }

  pullTick(tickIndex: number, defaultDtSeconds: number): TickSupply {
    const ti = int(tickIndex);
    const dt = Number(defaultDtSeconds);
    if (this._firstTickPending) {
      this._firstTickPending = false;
      const inputs =
        this._playerCount <= 0 ? [] : Array.from(this._frameInputs);
      const commands = Array.from(this._commandsForNextTick);
      this._commandsForNextTick = [];
      return new TickSupply(
        InputStatus.READY,
        new ResolvedTick({ tickIndex: ti, dtSeconds: dt, inputs, commands }),
      );
    }
    const inputs =
      this._playerCount <= 0 ? [] : Array.from(this._edgeInputs);
    return new TickSupply(
      InputStatus.READY,
      new ResolvedTick({ tickIndex: ti, dtSeconds: dt, inputs, commands: [] }),
    );
  }

  supportsCommandSubmission(): boolean {
    return true;
  }

  submitCommand(command: GameCommand): void {
    this._pendingCommands.push(command);
  }
}
