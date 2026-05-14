// Port of crimson/sim/input_providers.py

import { PlayerInput } from './input.ts';
import { clearInputEdges } from '@crimson/local-input.ts';

type TypoChar = string;

export class PerkMenuOpenCommand {
  readonly tag = 'perk_menu_open' as const;
  readonly playerIndex: number;

  constructor(opts: { playerIndex: number }) {
    this.playerIndex = opts.playerIndex;
  }
}

export class PerkPickCommand {
  readonly tag = 'perk_pick' as const;
  readonly playerIndex: number;
  readonly choiceIndex: number;

  constructor(opts: { playerIndex: number; choiceIndex: number }) {
    this.playerIndex = opts.playerIndex;
    this.choiceIndex = opts.choiceIndex;
  }
}

export class TypoCharCommand {
  readonly tag = 'typo_char' as const;
  readonly playerIndex: number;
  readonly ch: TypoChar;

  constructor(opts: { playerIndex: number; ch: TypoChar }) {
    this.playerIndex = opts.playerIndex;
    this.ch = opts.ch;
  }
}

export class TypoBackspaceCommand {
  readonly tag = 'typo_backspace' as const;
  readonly playerIndex: number;

  constructor(opts: { playerIndex: number }) {
    this.playerIndex = opts.playerIndex;
  }
}

export class TypoSubmitCommand {
  readonly tag = 'typo_submit' as const;
  readonly playerIndex: number;

  constructor(opts: { playerIndex: number }) {
    this.playerIndex = opts.playerIndex;
  }
}

export type GameCommand =
  | PerkMenuOpenCommand
  | PerkPickCommand
  | TypoCharCommand
  | TypoBackspaceCommand
  | TypoSubmitCommand;

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

export enum InputStatus {
  READY = 'ready',
  STALLED = 'stalled',
  EOS = 'eos',
}

export class ResolvedTick {
  readonly tickIndex: number;
  readonly dtSeconds: number;
  readonly inputs: PlayerInput[];
  readonly commands: GameCommand[];

  constructor(opts: {
    tickIndex: number;
    dtSeconds: number;
    inputs?: readonly PlayerInput[];
    commands?: readonly GameCommand[];
  }) {
    this.tickIndex = opts.tickIndex;
    this.dtSeconds = opts.dtSeconds;
    this.inputs = Array.from(opts.inputs ?? []);
    this.commands = Array.from(opts.commands ?? []);
  }
}

export class TickSupply {
  readonly status: InputStatus;
  readonly tick: ResolvedTick | null;

  constructor(opts: { status: InputStatus; tick?: ResolvedTick | null }) {
    this.status = opts.status;
    this.tick = opts.tick ?? null;
  }
}

export interface InputProvider {
  beginFrame(frameCtx: FrameContext): void;
  pullTick(tickIndex: number, defaultDtSeconds: number): TickSupply;
  supportsCommandSubmission(): boolean;
  submitCommand(command: GameCommand): void;
}

export type LocalInputBuilder = (ctx: FrameContext) => readonly PlayerInput[];

// Adapter over local input polling.
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
      return new TickSupply({
        status: InputStatus.READY,
        tick: new ResolvedTick({ tickIndex: ti, dtSeconds: dt, inputs, commands }),
      });
    }
    const inputs =
      this._playerCount <= 0 ? [] : Array.from(this._edgeInputs);
    return new TickSupply({
      status: InputStatus.READY,
      tick: new ResolvedTick({ tickIndex: ti, dtSeconds: dt, inputs, commands: [] }),
    });
  }

  supportsCommandSubmission(): boolean {
    return true;
  }

  submitCommand(command: GameCommand): void {
    this._pendingCommands.push(command);
  }
}
