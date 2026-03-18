// Port of crimson/modes/base_gameplay_mode.py — base gameplay mode (1965 lines)
//
// Excludes networking (LAN lockstep, rollback, resync) which is not applicable
// to the WebGL single-player port.  All LAN-related state is stubbed as no-ops
// so that subclass call-sites compile without change.

import { Vec2 } from '@grim/geom.ts';
import { type WebGLContext } from '@grim/webgl.ts';
import { type CrimsonConfig } from '@grim/config.ts';
import { type AudioState, audioUpdate, audioStopMusic } from '@grim/audio.ts';
import { type ConsoleState } from '@grim/console.ts';
import { type CrandLike } from '@grim/rand.ts';
import { type SmallFontData, measureSmallTextWidth } from '@grim/fonts/small.ts';
import { drawSmallText } from '@grim/fonts/small.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { InputState } from '@grim/input.ts';
import { type GroundRenderer } from '@grim/terrain-render.ts';
import { type RuntimeResources } from '@grim/assets.ts';

import type { CreatureDeath, CreaturePool } from '@crimson/creatures/runtime.ts';
import { GameMode } from '@crimson/game-modes.ts';
import type { GameplayState } from '@crimson/sim/state-types.ts';
import { LocalInputInterpreter, clearInputEdges } from '@crimson/local-input.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { perkCountGet } from '@crimson/perks/helpers.ts';
import { perkSelectionOpenChoices } from '@crimson/perks/selection.ts';
import { creatureFindInRadius } from '@crimson/perks/runtime/effects-context.ts';
import { RtxRenderMode } from '@crimson/render/rtx/mode.ts';
import { WorldRenderer } from '@crimson/render/world/renderer.ts';
import { FixedStepClock } from '@crimson/sim/clock.ts';
import {
  type PresentationTickOutput,
  applyPresentationOutputs,
  applySimMetadataTickResult,
} from '@crimson/sim/batch-apply.ts';
import { advanceTickRunnerFrame } from '@crimson/sim/frame-pump.ts';
import {
  type LanFrameSample,
  type LanSyncCallbacks,
  type TickResult,
} from '@crimson/sim/hooks.ts';
import { PlayerInput } from '@crimson/sim/input.ts';
import {
  type FrameContext,
  type GameCommand,
  InputStatus,
  LocalInputProvider,
  PerkMenuOpenCommand,
  PerkPickCommand,
  TickSupply,
} from '@crimson/sim/input-providers.ts';
import {
  type PostApplyReaction,
  applyPostApplyReaction,
  buildPostApplyReaction,
} from '@crimson/sim/presentation-reactions.ts';
import type { DeterministicSession, DeterministicSessionTick } from '@crimson/sim/sessions.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import { TickBatchResult, TickRunner } from '@crimson/sim/tick-runner.ts';
import type { WorldEvents } from '@crimson/sim/world-state.ts';
import type { TerrainSlotTriplet } from '@crimson/terrain-slots.ts';
import { shotsFromState, buildHighscoreRecordForGameOver } from './components/highscore-record-builder.ts';
import type { PerkMenuUiContext as FullPerkMenuUiContext } from './components/perk-menu-controller.ts';
import { drawTargetHealthBar, HudState } from '@crimson/ui/hud.ts';
import type { HighScoreRecord } from '@crimson/screens/results/game-over.ts';
import { GameOverUi } from '@crimson/screens/results/game-over.ts';
import type { GameState } from '@crimson/game/types.ts';
import { WorldRuntime } from '@crimson/world/runtime.ts';
import type { SimWorldState } from '@crimson/world/sim-world-state.ts';
import type { RenderResources } from '@crimson/world/render-resources.ts';
import type { AudioBridge } from '@crimson/world/audio-bridge.ts';
import type { TerrainRuntime } from '@crimson/world/terrain-runtime.ts';
import type { PresentationStepCommands } from '@crimson/sim/presentation-step.ts';
import type { TerrainFxBatch } from '@crimson/sim/terrain-fx.ts';

/** Replay is not applicable to WebGL port; stubs retained for structure. */
interface ReplayRecorder {
  tickIndex: number;
  recordedTickCount: number;
  recordTick(inputs: readonly (readonly PlayerInput[])[], commands?: readonly GameCommand[]): number;
  finish(): unknown;
}

interface ReplayCheckpoint {
  tickIndex: number;
}

// GameStatus stub — persistence module not yet ported
export interface GameStatus {
  questUnlockIndex: number;
  questUnlockIndexFull: number;
  incrementQuestPlayCount?(idx: number): void;
}

interface GameStatusData {}

// ---------------------------------------------------------------------------
// Helper — debug flag (no console/debug system in WebGL port yet)
// ---------------------------------------------------------------------------

function debugEnabled(): boolean {
  return false;
}

// ---------------------------------------------------------------------------
// _AppliedBatchTick
// ---------------------------------------------------------------------------

interface AppliedBatchTick {
  tick: DeterministicSessionTick;
  replayTickIndex: number | null;
  frameTickIndex: number | null;
}

// ---------------------------------------------------------------------------
// _BatchApplyOutcome
// ---------------------------------------------------------------------------

interface BatchApplyOutcome {
  readonly ticksApplied: number;
  readonly stopped: boolean;
  readonly stopAfterFinalize: boolean;
  readonly presentationOutputs: readonly PresentationTickOutput[];
  readonly postApplyReactions: readonly PostApplyReaction[];
}

function emptyBatchOutcome(): BatchApplyOutcome {
  return {
    ticksApplied: 0,
    stopped: false,
    stopAfterFinalize: false,
    presentationOutputs: [],
    postApplyReactions: [],
  };
}

// ---------------------------------------------------------------------------
// _ModeFrameState
// ---------------------------------------------------------------------------

interface ModeFrameState {
  readonly dt: number;
  readonly dtUiMs: number;
}

// ---------------------------------------------------------------------------
// LanStepAction
// ---------------------------------------------------------------------------

export type LanStepAction = 'continue' | 'stop_before_finalize' | 'stop_after_finalize';

/** Alias for DeterministicSession used in LAN contexts. */
export type LanSession = DeterministicSession;

// ---------------------------------------------------------------------------
// _LanRuntimeInputProvider (stub — no LAN in WebGL)
// ---------------------------------------------------------------------------

class LanRuntimeInputProvider {
  private readonly _captureClockRate: number;
  private _captureClock: FixedStepClock;
  private _popBlocked = false;

  constructor(opts: { playerCount: number; tickRate: number }) {
    this._captureClockRate = Math.max(1, Math.trunc(opts.tickRate));
    this._captureClock = new FixedStepClock(this._captureClockRate);
  }

  get popBlocked(): boolean {
    return this._popBlocked;
  }

  get captureTickDt(): number {
    return this._captureClock.dtTick;
  }

  advanceCaptureTicks(dt: number): number {
    return this._captureClock.advance(dt);
  }

  resetCaptureClock(): void {
    this._captureClock.reset();
  }

  beginFrame(_frameCtx: FrameContext): void {
    this._popBlocked = false;
  }

  takeFrameSample(_runnerTickIndex: number): LanFrameSample | null {
    return null;
  }

  pullTick(_tickIndex: number, _defaultDtSeconds: number): TickSupply {
    return new TickSupply(InputStatus.STALLED, null);
  }

  supportsCommandSubmission(): boolean {
    return false;
  }

  submitCommand(_command: GameCommand): void {}

  bindRuntime(_runtime: unknown): void {}
  setRole(_role: string): void {}
  setBeforePop(_callback: (() => boolean) | null): void {}
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAN_SIM_DETAIL_PRESET = 5;
const LAN_SIM_VIOLENCE_DISABLED = 0;

// ---------------------------------------------------------------------------
// BaseGameplayMode
// ---------------------------------------------------------------------------

export class BaseGameplayMode {
  // -- injected references --
  protected _assetsRoot: string;
  protected _small: SmallFontData | null = null;
  protected _hudState: HudState;
  defaultGameModeId: GameMode;
  config: CrimsonConfig;
  protected _console: ConsoleState | null;
  protected _baseDir: string;

  closeRequested = false;
  protected _action: string | null = null;
  protected _paused = false;
  protected _statusBase: GameStatus | null = null;
  protected _statusSim: GameStatus | null = null;
  protected _lanStatus: GameStatus | null = null;
  protected _lanStatusData: GameStatusData | null = null;
  protected _localInput: LocalInputInterpreter;
  protected _gameOverUi: GameOverUi;

  assetsDir: string;
  worldSize: number;
  demoModeActive: boolean;
  questFailRetryCount: number;
  hardcore: boolean;
  preserveBugs: boolean;
  audio: AudioState | null;
  audioRng: CrandLike;
  rtxMode: RtxRenderMode;

  protected _worldRuntime: WorldRuntime;
  simWorld: SimWorldState;
  renderResources: RenderResources;
  audioBridge: AudioBridge;
  terrainRuntime: TerrainRuntime;
  renderer: WorldRenderer;

  lanPlayerRingsEnabled = false;
  lanLocalAimIndicatorsOnly = false;
  lanLocalPlayerSlotIndex = 0;

  protected _gameOverActive = false;
  protected _gameOverRecord: HighScoreRecord | null = null;
  protected _gameOverBanner = 'reaper';

  protected _uiMouse: Vec2 = new Vec2();
  protected _cursorPulseTime = 0.0;
  protected _lastDtMs = 0.0;
  protected _screenFade: GameState | null = null;
  protected _terrainRegenCounter = 0;
  protected _runResetSeed = 0;
  protected _replayRecorder: ReplayRecorder | null = null;
  protected _replayCheckpoints: ReplayCheckpoint[] = [];
  protected _replayCheckpointsSampleRate = 60;
  protected _replayCheckpointsLastTick: number | null = null;
  protected _lanRuntime: unknown = null;
  protected _rollbackRuntime: unknown = null;
  protected _lanLocalSlotIndex = 0;
  protected _lanSeedOverride: number | null = null;
  protected _lanStartTick = 0;
  protected _lanEnabled = false;
  protected _lanRole = '';
  protected _lanExpectedPlayers = 1;
  protected _lanConnectedPlayers = 1;
  protected _lanWaitingForPlayers = false;
  protected _lanTraceLastMs = -1000.0;
  protected _lanTerrainPendingLast = false;
  protected _lanTerrainPendingSinceMs = 0;
  protected _lanInitialTerrainReady = false;
  protected _runtimeUpdatesPerFrame = 0;
  protected _inputStallCount = 0;
  protected _ticksAdvancedPerFrame = 0;
  protected _simMs = 0.0;
  protected _presentationPlanMs = 0.0;
  protected _presentationApplyMs = 0.0;
  protected _queuedInputCommands: GameCommand[] = [];
  protected _networkInputProvider: LanRuntimeInputProvider;
  protected _simSession: DeterministicSession | null = null;
  protected _tickInputProvider: LocalInputProvider | LanRuntimeInputProvider | null = null;
  protected _tickRunner: TickRunner | null = null;
  protected _tickRunnerSession: DeterministicSession | null = null;
  protected _tickRunnerIsNetworked = false;
  protected _tickRunnerNetworkRole = '';
  protected _tickRunnerFrameIndex = 0;
  protected _tickRunnerNextTickIndex = 0;
  protected _tickRunnerLocalClock: FixedStepClock | null = null;

  // -- state aliases (set in _bindWorld) --
  state!: GameplayState;
  creatures!: CreaturePool;
  player!: PlayerState;

  // -- WebGL context --
  protected _gl: WebGLContext;

  constructor(
    opts: {
      gl: WebGLContext;
      assetsUrl?: string;
      worldSize: number;
      defaultGameModeId: GameMode;
      demoModeActive?: boolean;
      questFailRetryCount?: number;
      hardcore?: boolean;
      config: CrimsonConfig;
      console?: ConsoleState | null;
      audio?: AudioState | null;
      audioRng: CrandLike;
      preserveBugs?: boolean;
    },
  ) {
    this._gl = opts.gl;
    this._assetsRoot = opts.assetsUrl ?? '';
    this._small = null;
    this._hudState = new HudState();
    this.defaultGameModeId = opts.defaultGameModeId;

    this.config = opts.config;
    this._console = opts.console ?? null;
    this._baseDir = '';

    this.closeRequested = false;
    this._action = null;
    this._paused = false;
    this._localInput = new LocalInputInterpreter();
    this._gameOverUi = new GameOverUi(opts.config);

    this.assetsDir = opts.assetsUrl ?? '';
    this.worldSize = opts.worldSize;
    this.demoModeActive = opts.demoModeActive ?? false;
    this.questFailRetryCount = opts.questFailRetryCount ?? 0;
    this.hardcore = opts.hardcore ?? false;
    this.preserveBugs = opts.preserveBugs ?? false;
    this.audio = opts.audio ?? null;
    this.audioRng = opts.audioRng;
    this.rtxMode = RtxRenderMode.CLASSIC;

    this._worldRuntime = new WorldRuntime(opts.gl, {
      worldSize: this.worldSize,
      demoModeActive: this.demoModeActive,
      questFailRetryCount: this.questFailRetryCount,
      hardcore: this.hardcore,
      preserveBugs: this.preserveBugs,
      config: this.config,
      audio: this.audio,
      audioRng: this.audioRng,
      rtxMode: this.rtxMode,
    });
    this.simWorld = this._worldRuntime.simWorld;
    this.renderResources = this._worldRuntime.renderResources;
    this.audioBridge = this._worldRuntime.audioBridge;
    this.terrainRuntime = this._worldRuntime.terrainRuntime;
    this.renderer = this._worldRuntime.renderer;

    this._setCameraVec(new Vec2(-1.0, -1.0));
    this.lanPlayerRingsEnabled = false;
    this.lanLocalAimIndicatorsOnly = false;
    this.lanLocalPlayerSlotIndex = 0;
    this._syncWorldRuntimeConfig();

    const playerCount = this._runtimePlayerCount();
    this._worldRuntime.reset(0xBEEF, Math.max(1, Math.min(4, playerCount)));
    this._bindWorld();

    this._gameOverActive = false;
    this._gameOverRecord = null;
    this._gameOverBanner = 'reaper';

    this._uiMouse = new Vec2();
    this._cursorPulseTime = 0.0;
    this._lastDtMs = 0.0;
    this._screenFade = null;
    this._terrainRegenCounter = 0;
    this._runResetSeed = 0;
    this._replayRecorder = null;
    this._replayCheckpoints = [];
    this._replayCheckpointsSampleRate = 60;
    this._replayCheckpointsLastTick = null;
    this._lanRuntime = null;
    this._rollbackRuntime = null;
    this._lanLocalSlotIndex = 0;
    this._lanSeedOverride = null;
    this._lanStartTick = 0;
    this._lanEnabled = false;
    this._lanRole = '';
    this._lanExpectedPlayers = 1;
    this._lanConnectedPlayers = 1;
    this._lanWaitingForPlayers = false;
    this._lanTraceLastMs = -1000.0;
    this._lanTerrainPendingLast = false;
    this._lanTerrainPendingSinceMs = 0;
    this._lanInitialTerrainReady = false;
    this._runtimeUpdatesPerFrame = 0;
    this._inputStallCount = 0;
    this._ticksAdvancedPerFrame = 0;
    this._simMs = 0.0;
    this._presentationPlanMs = 0.0;
    this._presentationApplyMs = 0.0;
    this._queuedInputCommands = [];
    this._networkInputProvider = new LanRuntimeInputProvider({
      playerCount: Math.max(0, this.simWorld.players.length),
      tickRate: this._deterministicTickRate(),
    });
    this._simSession = null;
    this._tickInputProvider = null;
    this._tickRunner = null;
    this._tickRunnerSession = null;
    this._tickRunnerIsNetworked = false;
    this._tickRunnerNetworkRole = '';
    this._tickRunnerFrameIndex = 0;
    this._tickRunnerNextTickIndex = 0;
    this._tickRunnerLocalClock = null;
  }

  // -----------------------------------------------------------------------
  // Properties (mirror Python @property accessors)
  // -----------------------------------------------------------------------

  get worldRuntime(): WorldRuntime {
    return this._worldRuntime;
  }

  get camera(): Vec2 {
    return this._worldRuntime.camera;
  }

  protected _setCameraVec(value: Vec2): void {
    this._worldRuntime.camera = value;
  }

  // -----------------------------------------------------------------------
  // _syncWorldRuntimeConfig
  // -----------------------------------------------------------------------

  protected _syncWorldRuntimeConfig(): void {
    const runtime = this._worldRuntime;
    runtime.worldSize = this.worldSize;
    runtime.demoModeActive = this.demoModeActive;
    runtime.questFailRetryCount = this.questFailRetryCount;
    runtime.hardcore = this.hardcore;
    runtime.preserveBugs = this.preserveBugs;
    runtime.config = this.config;
    runtime.audio = this.audio;
    runtime.audioRng = this.audioRng;
    runtime.rtxMode = this.rtxMode;
  }

  // -----------------------------------------------------------------------
  // applyTerrainSetup
  // -----------------------------------------------------------------------

  applyTerrainSetup(opts: { terrainSlots: TerrainSlotTriplet; seed: number }): void {
    this.terrainRuntime.applyTerrainSetup(opts.terrainSlots, opts.seed);
  }

  // -----------------------------------------------------------------------
  // _drawWorld
  // -----------------------------------------------------------------------

  protected _drawWorld(opts?: { drawAimIndicators?: boolean; entityAlpha?: number }): void {
    this._worldRuntime.draw(
      opts?.drawAimIndicators ?? true,
      opts?.entityAlpha ?? 1.0,
    );
  }

  // -----------------------------------------------------------------------
  // Coordinate conversions
  // -----------------------------------------------------------------------

  worldToScreen(pos: Vec2): Vec2 {
    return this.renderer.worldToScreen(pos);
  }

  screenToWorld(pos: Vec2): Vec2 {
    return this.renderer.screenToWorld(pos);
  }

  // -----------------------------------------------------------------------
  // _refreshEffectiveStatus
  // -----------------------------------------------------------------------

  protected _refreshEffectiveStatus(opts: { resetLanStatus: boolean }): void {
    if (this._lanEnabled) {
      if (opts.resetLanStatus || this._lanStatus === null) {
        this._lanStatus = null; // No LAN status in WebGL
      }
      this._statusSim = this._lanStatus;
    } else {
      this._lanStatus = null;
      this._lanStatusData = null;
      this._statusSim = this._statusBase;
    }
    // Keep the currently-bound world state in sync
    this.state.status = this._statusSim;
  }

  // -----------------------------------------------------------------------
  // LAN stubs (no-op in WebGL)
  // -----------------------------------------------------------------------

  bindLanRuntime(_runtime: unknown): void {
    // No LAN in WebGL port
  }

  setLanMatchStart(_opts: { seed: number; startTick?: number; status?: unknown }): void {
    // No LAN in WebGL port
  }

  // -----------------------------------------------------------------------
  // Console helpers
  // -----------------------------------------------------------------------

  protected _cvarFloat(name: string, defaultVal: number = 0.0): number {
    const console_ = this._console;
    if (console_ === null) return defaultVal;
    const cvar = console_.cvars.get(name);
    if (cvar == null) return defaultVal;
    return Number(cvar.valueF ?? defaultVal);
  }

  protected _hudSmallIndicators(): boolean {
    return this._cvarFloat('cv_uiSmallIndicators', 0.0) !== 0.0;
  }

  protected _lanPlayerRingsEnabled(): boolean {
    if (!this._lanEnabled) return false;
    return this._cvarFloat('cv_lanPlayerRings', 0.0) !== 0.0;
  }

  protected _syncLanVisualFlags(): void {
    this.lanPlayerRingsEnabled = this._lanPlayerRingsEnabled();
    this.lanLocalAimIndicatorsOnly = this._lanEnabled;
    this.lanLocalPlayerSlotIndex = Math.max(0, Math.min(3, this._lanLocalSlotIndex));
  }

  // -----------------------------------------------------------------------
  // _configGameModeId
  // -----------------------------------------------------------------------

  protected _configGameModeId(): GameMode {
    try {
      return this.config.gameplay.mode;
    } catch {
      return GameMode.DEMO;
    }
  }

  // -----------------------------------------------------------------------
  // _drawTargetHealthBar
  // -----------------------------------------------------------------------

  protected _drawTargetHealthBar(ctx: WebGLContext, opts?: { alpha?: number }): void {
    const alpha = opts?.alpha ?? 1.0;
    const creatures = this.creatures.entries;
    if (!creatures || creatures.length === 0) return;

    const targetIndices: number[] = [];
    const targetPlayers = this.state.preserveBugs
      ? this.simWorld.players.slice(0, 1)
      : this.simWorld.players;

    for (const targetPlayer of targetPlayers) {
      if (!this.state.preserveBugs && targetPlayer.health <= 0.0) continue;
      if (perkCountGet(targetPlayer, PerkId.DOCTOR) <= 0) continue;
      const targetIdx = creatureFindInRadius(
        creatures,
        targetPlayer.aim,
        12.0,
        0,
      );
      if (targetIdx === -1) continue;
      if (targetIndices.indexOf(targetIdx) !== -1) continue;
      targetIndices.push(targetIdx);
    }

    for (const targetIdx of targetIndices) {
      const creature = creatures[targetIdx];
      if (!creature.active) continue;
      const hp = Number(creature.hp);
      const maxHp = Number(creature.max_hp);
      if (maxHp <= 0.0) continue;

      let ratio = hp / maxHp;
      if (ratio < 0.0) ratio = 0.0;
      if (ratio > 1.0) ratio = 1.0;

      const screenLeft = this.worldToScreen(creature.pos.add(new Vec2(-32.0, 32.0)));
      const screenRight = this.worldToScreen(creature.pos.add(new Vec2(32.0, 32.0)));
      const width = screenRight.x - screenLeft.x;
      if (width <= 1e-3) continue;
      drawTargetHealthBar(ctx, {
        pos: screenLeft,
        width,
        ratio,
        alpha,
        scale: width / 64.0,
      });
    }
  }

  // -----------------------------------------------------------------------
  // _bindWorld
  // -----------------------------------------------------------------------

  protected _bindWorld(): void {
    this.state = this.simWorld.state;
    this.creatures = this.simWorld.creatures;
    this.player = this.simWorld.players[0];
    const preserveBugs = this.state.preserveBugs;
    this._localInput.setPreserveBugs(preserveBugs);
    this._hudState.preserveBugs = preserveBugs;
    this._gameOverUi.preserveBugs = preserveBugs;
    this.state.status = this._statusSim;
  }

  // -----------------------------------------------------------------------
  // _anyPlayerAlive
  // -----------------------------------------------------------------------

  protected _anyPlayerAlive(): boolean {
    return this.simWorld.players.some((p) => p.health > 0.0);
  }

  // -----------------------------------------------------------------------
  // Status bindings
  // -----------------------------------------------------------------------

  get saveStatus(): GameStatus | null {
    return this._statusBase;
  }

  get simStatus(): GameStatus | null {
    return this._statusSim;
  }

  bindStatus(status: GameStatus | null): void {
    this._statusBase = status;
    this._refreshEffectiveStatus({ resetLanStatus: false });
  }

  bindScreenFade(fade: GameState | null): void {
    this._screenFade = fade;
  }

  bindAudio(audio: AudioState | null, audioRng: CrandLike): void {
    this.audio = audio;
    this.audioRng = audioRng;
    this._worldRuntime.audio = audio;
    this._worldRuntime.audioRng = audioRng;
  }

  setRtxMode(mode: RtxRenderMode): void {
    this.rtxMode = mode;
    this._worldRuntime.rtxMode = mode;
  }

  // -----------------------------------------------------------------------
  // Audio update
  // -----------------------------------------------------------------------

  protected _updateAudio(dt: number): void {
    if (this.audio !== null) {
      audioUpdate(this.audio, dt);
    }
  }

  // -----------------------------------------------------------------------
  // UI text helpers
  // -----------------------------------------------------------------------

  protected _uiLineHeight(scale: number = 1.0): number {
    if (this._small !== null) {
      return Math.trunc(this._small.cellSize * scale);
    }
    return Math.trunc(20 * scale);
  }

  protected _uiTextWidth(text: string, _scale: number = 1.0): number {
    const font = this._small;
    if (font === null) throw new Error('small font must be loaded before ui text measurement');
    return Math.trunc(measureSmallTextWidth(font, text));
  }

  protected _drawUiText(
    ctx: WebGLContext,
    text: string,
    pos: Vec2,
    color: [number, number, number, number],
    _scale: number = 1.0,
  ): void {
    const font = this._small;
    if (font === null) throw new Error('small font must be loaded before ui text draw');
    drawSmallText(ctx, font, text, pos, color);
  }

  // -----------------------------------------------------------------------
  // Perk menu helpers
  // -----------------------------------------------------------------------

  protected _perkMenuPlaySfx(): ((sfx: SfxId) => void) | null {
    return this.audioBridge.router.playSfx;
  }

  protected _perkMenuUiContext(): FullPerkMenuUiContext {
    const players = this._worldRuntime.simWorld.players;
    return {
      player: players[0],
      resources: this.renderResources.resources as RuntimeResources,
      mouse: this._uiMousePos(),
      screenW: this._gl.screenWidth,
      screenH: this._gl.screenHeight,
      violenceDisabled: 0,
      preserveBugs: this.state.preserveBugs ?? false,
    };
  }

  protected _openPerkMenuUi(opts: {
    menu: { active: boolean; openMenu?(opts: { playSfx?: ((sfx: SfxId) => void) | null }): void };
    players: PlayerState[];
    gameMode: GameMode;
    playerCount: number;
  }): void {
    // If menu is already active, do nothing
    if (opts.menu.active) return;

    const recorder = this._replayRecorder;
    if (recorder !== null) {
      this._recordReplayCheckpoint(Math.max(0, recorder.tickIndex - 1), { force: true });
    }

    const choices = perkSelectionOpenChoices(
      this.state,
      opts.players,
      this.state.perkSelection,
      opts.gameMode,
      opts.playerCount,
    );
    if (!choices || (Array.isArray(choices) && choices.length === 0)) {
      throw new Error('perk menu open requires prepared perk choices');
    }

    opts.menu.openMenu?.({ playSfx: this._perkMenuPlaySfx() });
    this.enqueueInputCommand(new PerkMenuOpenCommand(0));
  }

  protected _uiMousePos(): Vec2 {
    return this._uiMouse;
  }

  // -----------------------------------------------------------------------
  // _updateUiMouse
  // -----------------------------------------------------------------------

  protected _updateUiMouse(): void {
    const [mx, my] = InputState.mousePosition();
    const screenW = this._gl.screenWidth;
    const screenH = this._gl.screenHeight;
    this._uiMouse = new Vec2(
      Math.max(0.0, Math.min(mx, Math.max(0.0, screenW - 1.0))),
      Math.max(0.0, Math.min(my, Math.max(0.0, screenH - 1.0))),
    );
  }

  // -----------------------------------------------------------------------
  // _tickFrame
  // -----------------------------------------------------------------------

  protected _tickFrame(dt: number, opts?: { clampCursorPulse?: boolean }): [number, number] {
    dt = Number(dt);
    const dtUiMs = Math.min(dt, 0.1) * 1000.0;
    this._lastDtMs = dtUiMs;

    this._updateUiMouse();
    this._traceLanStateHeartbeat();

    const pulseDt = opts?.clampCursorPulse ? Math.min(dt, 0.1) : dt;
    this._cursorPulseTime += pulseDt * 1.1;

    return [dt, dtUiMs];
  }

  // -----------------------------------------------------------------------
  // _beginModeUpdate
  // -----------------------------------------------------------------------

  protected _beginModeUpdate(dt: number): ModeFrameState | null {
    this._updateAudio(dt);

    const [frameDt, frameDtUiMs] = this._tickFrame(dt);
    this._resetFrameTelemetry();
    this._handleInput();
    if (this._action === 'open_pause_menu') {
      return null;
    }
    return { dt: frameDt, dtUiMs: frameDtUiMs };
  }

  // -----------------------------------------------------------------------
  // _handleInput (abstract — must be overridden)
  // -----------------------------------------------------------------------

  protected _handleInput(): void {
    throw new Error('_handleInput() must be implemented by subclass');
  }

  // -----------------------------------------------------------------------
  // Runtime updates
  // -----------------------------------------------------------------------

  setRuntimeUpdatesPerFrame(value: number): void {
    this._runtimeUpdatesPerFrame = Math.max(0, Math.trunc(value));
  }

  enqueueInputCommand(command: GameCommand): void {
    const provider = this._tickInputProvider;
    if (provider === null) {
      this._queuedInputCommands.push(command);
      return;
    }
    if (!provider.supportsCommandSubmission()) {
      this._queuedInputCommands.push(command);
      return;
    }
    provider.submitCommand(command);
  }

  protected _flushQueuedInputCommands(opts: {
    provider: LocalInputProvider | LanRuntimeInputProvider;
  }): void {
    if (this._queuedInputCommands.length === 0) return;
    if (!opts.provider.supportsCommandSubmission()) return;
    for (const command of this._queuedInputCommands) {
      opts.provider.submitCommand(command);
    }
    this._queuedInputCommands.length = 0;
  }

  recordPerkPickCommand(choiceIndex: number, opts?: { playerIndex?: number }): void {
    this.enqueueInputCommand(
      new PerkPickCommand(opts?.playerIndex ?? 0, Math.trunc(choiceIndex)),
    );
  }

  // -----------------------------------------------------------------------
  // Session timing
  // -----------------------------------------------------------------------

  protected _sessionElapsedMs(): number {
    const session = this._simSession;
    if (session === null) throw new Error('session elapsed requested without an active deterministic session');
    return Number(session.elapsedMs);
  }

  protected _replayCheckpointElapsedMs(): number {
    return Number(this.simWorld.presentationElapsedMs);
  }

  protected _replayClaimedStatsComplete(): boolean {
    return false;
  }

  protected _replayClaimedStatsElapsedMs(): number {
    return Math.trunc(this._replayCheckpointElapsedMs());
  }

  protected _replayClaimedShots(): [number, number] {
    return shotsFromState(this.state, this.player.index);
  }

  protected _replayOutputBasename(opts: { stamp: string; replay: unknown }): string {
    const modeName = this.constructor.name.replace('Mode', '').toLowerCase() || 'replay';
    return `${modeName}_${opts.stamp}`;
  }

  protected _replaySkipSaveWhenEmpty(_opts: { recorder: ReplayRecorder }): boolean {
    return false;
  }

  // -----------------------------------------------------------------------
  // _recordReplayCheckpoint
  // -----------------------------------------------------------------------

  protected _recordReplayCheckpoint(
    tickIndex: number,
    opts?: {
      force?: boolean;
      deaths?: readonly CreatureDeath[] | null;
      events?: WorldEvents | null;
    },
  ): void {
    const recorder = this._replayRecorder;
    if (recorder === null) return;
    if (tickIndex < 0) return;
    const force = opts?.force ?? false;
    if (!force && (tickIndex % (this._replayCheckpointsSampleRate || 1)) !== 0) return;
    if (this._replayCheckpointsLastTick === tickIndex) return;
    this._replayCheckpoints.push({ tickIndex });
    this._replayCheckpointsLastTick = tickIndex;
  }

  // -----------------------------------------------------------------------
  // _saveReplay (stub — no file I/O in WebGL)
  // -----------------------------------------------------------------------

  protected _saveReplay(): void {
    // Replay saving is not applicable in the WebGL port.
    this._replayRecorder = null;
    this._replayCheckpoints.length = 0;
    this._replayCheckpointsLastTick = null;
  }

  // -----------------------------------------------------------------------
  // Frame telemetry
  // -----------------------------------------------------------------------

  frameTelemetry(): [number, number, number, number, number, number] {
    return [
      this._runtimeUpdatesPerFrame,
      this._inputStallCount,
      this._ticksAdvancedPerFrame,
      this._simMs,
      this._presentationPlanMs,
      this._presentationApplyMs,
    ];
  }

  protected _resetFrameTelemetry(): void {
    this._inputStallCount = 0;
    this._ticksAdvancedPerFrame = 0;
    this._simMs = 0.0;
    this._presentationPlanMs = 0.0;
    this._presentationApplyMs = 0.0;
  }

  // -----------------------------------------------------------------------
  // LAN runtime stubs
  // -----------------------------------------------------------------------

  setLanRuntime(_opts: {
    enabled: boolean;
    role: string;
    expectedPlayers: number;
    connectedPlayers: number;
    waitingForPlayers: boolean;
  }): void {
    // No LAN in WebGL port
  }

  protected _lanWaitGateActive(): boolean {
    if (!this._lanEnabled) return false;
    if (!this._lanWaitingForPlayers) return false;
    return this._lanConnectedPlayers < this._lanExpectedPlayers;
  }

  protected _lanTerrainGenerationPending(): boolean {
    return false;
  }

  protected _traceLanTerrainGeneration(): void {
    // No LAN terrain generation tracking in WebGL
  }

  protected _traceLanStateHeartbeat(): void {
    // No LAN heartbeat in WebGL
  }

  // -----------------------------------------------------------------------
  // _drawLanDebugInfo (stub)
  // -----------------------------------------------------------------------

  protected _drawLanDebugInfo(
    _ctx: WebGLContext,
    _opts: { x: number; y: number; lineH: number },
  ): number {
    return _opts.y;
  }

  // -----------------------------------------------------------------------
  // _drawLanWaitOverlay (stub)
  // -----------------------------------------------------------------------

  protected _drawLanWaitOverlay(_ctx: WebGLContext): void {
    // No LAN wait overlay in WebGL
  }

  // -----------------------------------------------------------------------
  // Net replay/snapshot stubs
  // -----------------------------------------------------------------------

  protected _netReplaySnapshotState(): unknown {
    return null;
  }

  protected _storeNetRuntimeSnapshot(_opts: Record<string, unknown>): void {}

  protected _consumeNetRuntimeRecovery(_opts: { modeName: string }): void {}

  protected _applyResyncSnapshot(_snapshot: unknown): void {
    throw new Error(`${this.constructor.name}._applyResyncSnapshot() must be implemented`);
  }

  // -----------------------------------------------------------------------
  // Player config helpers
  // -----------------------------------------------------------------------

  protected _playerNameDefault(): string {
    return String(this.config.profile.playerName || '');
  }

  protected _runtimePlayerCount(): number {
    return this.config.gameplay.playerCount;
  }

  protected _deterministicDetailPreset(): number {
    if (this._lanEnabled) return LAN_SIM_DETAIL_PRESET;
    return this.config.display.detailPreset;
  }

  protected _deterministicViolenceDisabled(): number {
    if (this._lanEnabled) return LAN_SIM_VIOLENCE_DISABLED;
    return this.config.display.violenceDisabled;
  }

  // -----------------------------------------------------------------------
  // update / draw (abstract)
  // -----------------------------------------------------------------------

  update(dt: number): void {
    throw new Error(`${this.constructor.name}.update() must be implemented by gameplay mode`);
  }

  draw(_ctx: WebGLContext): void {
    throw new Error(`${this.constructor.name}.draw() must be implemented by gameplay mode`);
  }

  // -----------------------------------------------------------------------
  // Debug flag
  // -----------------------------------------------------------------------

  protected get _debugEnabled(): boolean {
    return false;
  }

  // -----------------------------------------------------------------------
  // Screen size helper
  // -----------------------------------------------------------------------

  protected _screenSize(): [number, number] {
    return [this._gl.screenWidth, this._gl.screenHeight];
  }

  // -----------------------------------------------------------------------
  // _shotsFromState helper
  // -----------------------------------------------------------------------

  protected _shotsFromState(playerIndex: number): [number, number] {
    return shotsFromState(this.state, playerIndex);
  }

  // -----------------------------------------------------------------------
  // _buildHighscoreRecordForGameOver helper
  // -----------------------------------------------------------------------

  protected _buildHighscoreRecordForGameOver(opts: {
    survivalElapsedMs: number;
    creatureKillCount: number;
    gameModeId: GameMode;
    shotsFired?: number | null;
    shotsHit?: number | null;
    clampShotsHit?: boolean;
  }): HighScoreRecord {
    return buildHighscoreRecordForGameOver({
      state: this.state,
      player: this.player,
      ...opts,
    });
  }

  // -----------------------------------------------------------------------
  // Perk prompt/menu stubs (overridden in modes with perk UI)
  // -----------------------------------------------------------------------

  protected _handlePerkMenuInput(_choices: readonly PerkId[], _dtUiMs: number): number | null {
    return null;
  }

  protected _pollPerkOpenRequest(_opts: {
    pendingCount: number;
    playerCount: number;
    anyAlive: boolean;
    paused: boolean;
    menuActive: boolean;
  }): boolean {
    return false;
  }

  protected _tickPerkPromptTimer(_opts: {
    pendingCount: number;
    anyAlive: boolean;
    paused: boolean;
    menuActive: boolean;
    dtUiMs: number;
  }): void {}

  protected _tickPerkPromptPulse(_dtUiMs: number): void {}

  protected _tickPerkMenuTimeline(_dtUiMs: number): void {}

  protected _drawPerkPrompt(_ctx: WebGLContext, _opts: {
    pendingCount: number;
    anyAlive: boolean;
    menuActive: boolean;
    textColor: [number, number, number, number];
    promptScale: number;
  }): void {}

  protected _drawPerkMenu(_ctx: WebGLContext, _choices: readonly PerkId[]): void {}

  // -----------------------------------------------------------------------
  // open
  // -----------------------------------------------------------------------

  open(): void {
    this.closeRequested = false;
    this._action = null;
    this._paused = false;
    // Font is loaded as part of RuntimeResources; bind it if available.
    this._small = this.renderResources.resources?.smallFont ?? null;
    this._hudState = new HudState();

    this._gameOverActive = false;
    this._gameOverRecord = null;
    this._gameOverBanner = 'reaper';
    this._gameOverUi.close();

    // Stop any playing music before restarting gameplay
    audioStopMusic(this.audio);

    const playerCount = this._runtimePlayerCount();
    let seed: number;
    if (this._lanSeedOverride !== null) {
      seed = this._lanSeedOverride;
    } else {
      seed = Number((this.state).rng?.state ?? 0);
    }
    this._runResetSeed = (seed >>> 0) & 0xFFFFFFFF;

    // Reset LAN sim status at the start of each run
    this._refreshEffectiveStatus({ resetLanStatus: true });

    this._syncWorldRuntimeConfig();
    this._worldRuntime.reset(seed, Math.max(1, Math.min(4, playerCount)));
    this._worldRuntime.openRuntime();
    this._bindWorld();

    this._localInput.reset(this.simWorld.players);
    this._networkInputProvider = new LanRuntimeInputProvider({
      playerCount: Math.max(0, this.simWorld.players.length),
      tickRate: this._deterministicTickRate(),
    });
    this._resetLanCaptureClock();
    this._resetTickRunnerState();
    this._resetReplayCaptureState({ clearRecorder: false });

    const screenW = this._gl.screenWidth;
    const screenH = this._gl.screenHeight;
    this._uiMouse = new Vec2(screenW * 0.5, screenH * 0.5);
    this._cursorPulseTime = 0.0;
    this._lanTerrainPendingLast = false;
    this._lanTerrainPendingSinceMs = 0;
    this._lanInitialTerrainReady = false;
  }

  // -----------------------------------------------------------------------
  // close
  // -----------------------------------------------------------------------

  close(): void {
    this._gameOverUi.close();
    if (this._small !== null) {
      this._small = null;
    }
    this._resetTickRunnerState();
    this._resetReplayCaptureState({ clearRecorder: true });
    this._worldRuntime.closeRuntime();
  }

  // -----------------------------------------------------------------------
  // takeAction
  // -----------------------------------------------------------------------

  takeAction(): string | null {
    const action = this._action;
    this._action = null;
    return action;
  }

  // -----------------------------------------------------------------------
  // Game over
  // -----------------------------------------------------------------------

  protected _enterGameOver(): void {
    throw new Error('_enterGameOver() must be implemented by subclass');
  }

  protected _updateGameOverUi(dt: number): void {
    let record = this._gameOverRecord;
    if (record === null) {
      this._enterGameOver();
      record = this._gameOverRecord;
    }
    if (record === null) return;

    const action = this._gameOverUi.update(this._gl, dt, {
      record,
      playerNameDefault: this._playerNameDefault(),
      resources: this.renderResources.resources,
      playSfx: (id: SfxId) => this.audioBridge.router.playSfx(id),
      rng: null,
      mouse: this._uiMousePos(),
    });
    if (action === 'play_again') {
      this.open();
      return;
    }
    if (action === 'high_scores') {
      this._action = 'open_high_scores';
      return;
    }
    if (action === 'main_menu') {
      this._action = 'back_to_menu';
      this.closeRequested = true;
    }
  }

  // -----------------------------------------------------------------------
  // World entity alpha
  // -----------------------------------------------------------------------

  protected _worldEntityAlpha(): number {
    if (!this._gameOverActive) return 1.0;
    return Number(this._gameOverUi.worldEntityAlpha());
  }

  // -----------------------------------------------------------------------
  // drawPauseBackground
  // -----------------------------------------------------------------------

  drawPauseBackground(opts?: { entityAlpha?: number }): void {
    let alpha = opts?.entityAlpha ?? 1.0;
    if (alpha < 0.0) alpha = 0.0;
    else if (alpha > 1.0) alpha = 1.0;
    this._drawWorld({
      drawAimIndicators: false,
      entityAlpha: this._worldEntityAlpha() * alpha,
    });
  }

  // -----------------------------------------------------------------------
  // Ground management
  // -----------------------------------------------------------------------

  stealGroundForMenu(): GroundRenderer | null {
    const ground = this.renderResources.ground;
    this.renderResources.ground = null;
    return ground;
  }

  adoptGroundFromMenu(ground: GroundRenderer | null): void {
    if (ground === null) return;
    const current = this.renderResources.ground;
    if (current !== null && current !== ground) {
      current.destroy();
    }
    this.renderResources.ground = ground;
  }

  menuGroundCamera(): Vec2 {
    return this.camera;
  }

  // -----------------------------------------------------------------------
  // Console helpers
  // -----------------------------------------------------------------------

  consoleElapsedMs(): number {
    return Number(this.simWorld.presentationElapsedMs);
  }

  prepareDemoTrialOverlayFrame(): void {
    this._worldRuntime.updateCamera(0.0);
    this._syncAudioAndGround();
  }

  regenerateTerrainForConsole(): void {
    if (this.renderResources.ground === null) return;
    this._terrainRegenCounter = ((this._terrainRegenCounter + 1) >>> 0) & 0xFFFFFFFF;
    const terrainSeed = (Number((this.state).rng?.state ?? 0) + this._terrainRegenCounter) & 0xFFFFFFFF;
    this.renderResources.ground.scheduleGenerate(terrainSeed);
  }

  // -----------------------------------------------------------------------
  // _drawScreenFade
  // -----------------------------------------------------------------------

  protected _drawScreenFade(ctx: WebGLContext): void {
    let fadeAlpha = 0.0;
    if (this._screenFade !== null) {
      fadeAlpha = Number(this._screenFade.screenFadeAlpha);
    }
    if (fadeAlpha <= 0.0) return;
    const alpha = Math.max(0.0, Math.min(1.0, fadeAlpha));
    const screenW = this._gl.screenWidth;
    const screenH = this._gl.screenHeight;
    ctx.drawRectangle(0, 0, screenW, screenH, 0, 0, 0, alpha);
  }

  // -----------------------------------------------------------------------
  // Input building
  // -----------------------------------------------------------------------

  protected _buildLocalInputs(opts: { dt: number }): PlayerInput[] {
    const screenW = this._gl.screenWidth;
    const screenH = this._gl.screenHeight;
    return this._localInput.buildFrameInputs({
      players: this.simWorld.players,
      config: this.config,
      mouseScreen: this._uiMouse,
      screenToWorld: (pos: Vec2) => this.screenToWorld(pos),
      screenCenter: new Vec2(screenW * 0.5, screenH * 0.5),
      dt: opts.dt,
      creatures: this.creatures.entries,
    });
  }

  protected static _clearLocalInputEdges(inputs: readonly PlayerInput[]): PlayerInput[] {
    return clearInputEdges(inputs);
  }

  // -----------------------------------------------------------------------
  // Tick rate
  // -----------------------------------------------------------------------

  protected static _deterministicTickRate(): number {
    return 60;
  }

  // Instance method for convenience
  protected _deterministicTickRate(): number {
    return 60;
  }

  protected _gameplayTickRate(): number {
    return this._deterministicTickRate();
  }

  protected _gameplayTickDt(_opts?: { session?: DeterministicSession | null }): number {
    return 1.0 / this._gameplayTickRate();
  }

  // -----------------------------------------------------------------------
  // Clock/runner reset
  // -----------------------------------------------------------------------

  protected _resetGameplayFrameClock(): void {
    const clock = this._tickRunnerLocalClock;
    if (clock !== null) {
      clock.reset();
    }
  }

  protected _resetTickRunnerState(): void {
    this._tickInputProvider = null;
    this._tickRunner = null;
    this._tickRunnerSession = null;
    this._tickRunnerIsNetworked = false;
    this._tickRunnerNetworkRole = '';
    this._tickRunnerFrameIndex = 0;
    this._tickRunnerNextTickIndex = 0;
    this._tickRunnerLocalClock = null;
  }

  protected _resetReplayCaptureState(opts: { clearRecorder: boolean }): void {
    this._queuedInputCommands.length = 0;
    if (opts.clearRecorder) {
      this._replayRecorder = null;
    }
    this._replayCheckpoints.length = 0;
    this._replayCheckpointsLastTick = null;
  }

  // -----------------------------------------------------------------------
  // LAN capture clock stubs
  // -----------------------------------------------------------------------

  protected _lanCaptureTickDt(): number {
    return this._networkInputProvider.captureTickDt;
  }

  protected _advanceLanCaptureTicks(dt: number): number {
    return this._networkInputProvider.advanceCaptureTicks(dt);
  }

  protected _resetLanCaptureClock(): void {
    this._networkInputProvider.resetCaptureClock();
  }

  // -----------------------------------------------------------------------
  // _buildLanSyncCallbacks (stub)
  // -----------------------------------------------------------------------

  protected _buildLanSyncCallbacks(_opts: {
    runtime: unknown;
    lockstepRuntime: unknown;
    role: string;
    provider: LanRuntimeInputProvider;
  }): LanSyncCallbacks {
    return {
      role: _opts.role,
      takeFrameSample: (_tickIndex: number) => null,
      broadcastTickFrame: null,
    };
  }

  // -----------------------------------------------------------------------
  // _ensureTickRunner
  // -----------------------------------------------------------------------

  protected _ensureTickRunner(opts: {
    session: DeterministicSession;
    isNetworked: boolean;
    lanRuntime?: unknown;
    lockstepRuntime?: unknown;
    role?: string;
  }): [TickRunner, LocalInputProvider | LanRuntimeInputProvider] {
    const runner = this._tickRunner;
    const provider = this._tickInputProvider;

    if (
      runner !== null &&
      provider !== null &&
      this._tickRunnerSession === opts.session &&
      this._tickRunnerIsNetworked === opts.isNetworked &&
      (!opts.isNetworked || this._tickRunnerNetworkRole === (opts.role ?? ''))
    ) {
      if (opts.isNetworked) {
        if (!(provider instanceof LanRuntimeInputProvider)) {
          throw new TypeError('networked tick runner provider must be LanRuntimeInputProvider');
        }
        provider.bindRuntime(opts.lanRuntime);
        provider.setRole(opts.role ?? '');
        provider.setBeforePop(null);
        this._tickRunnerLocalClock = null;
      } else if (this._tickRunnerLocalClock === null) {
        this._tickRunnerLocalClock = new FixedStepClock(this._gameplayTickRate());
      }
      return [runner, provider];
    }

    let newProvider: LocalInputProvider | LanRuntimeInputProvider;
    if (opts.isNetworked) {
      newProvider = this._networkInputProvider;
      (newProvider as LanRuntimeInputProvider).bindRuntime(opts.lanRuntime);
      (newProvider as LanRuntimeInputProvider).setRole(opts.role ?? '');
      (newProvider as LanRuntimeInputProvider).setBeforePop(null);
    } else {
      newProvider = new LocalInputProvider({
        playerCount: Math.max(0, this.simWorld.players.length),
        buildInputs: (frameCtx: FrameContext) => this._buildLocalInputs({ dt: frameCtx.dtSeconds }),
      });
    }
    this._flushQueuedInputCommands({ provider: newProvider });

    const newRunner = new TickRunner({
      session: opts.session,
      inputProvider: newProvider,
      config: { traceRng: false },
    });
    this._tickRunner = newRunner;
    this._tickInputProvider = newProvider;
    this._tickRunnerSession = opts.session;
    this._tickRunnerIsNetworked = opts.isNetworked;
    this._tickRunnerNetworkRole = opts.isNetworked ? (opts.role ?? '') : '';
    this._tickRunnerFrameIndex = 0;
    this._tickRunnerNextTickIndex = 0;
    this._tickRunnerLocalClock = opts.isNetworked
      ? null
      : new FixedStepClock(this._gameplayTickRate());
    return [newRunner, newProvider];
  }

  // -----------------------------------------------------------------------
  // LAN tick sync stubs
  // -----------------------------------------------------------------------

  protected static _prepareLanTickSync(_opts: {
    tickResult: TickResult;
    callbacks: LanSyncCallbacks;
  }): void {
    // No LAN sync in WebGL
  }

  protected static _finalizeLanTickSync(_opts: {
    tickResult: TickResult;
    callbacks: LanSyncCallbacks;
  }): void {
    // No LAN sync in WebGL
  }

  // -----------------------------------------------------------------------
  // _recordReplayCheckpointFromTick
  // -----------------------------------------------------------------------

  protected _recordReplayCheckpointFromTick(opts: {
    tickIndex: number | null;
    tick: DeterministicSessionTick;
  }): void {
    if (opts.tickIndex === null) return;
    const worldEvents = opts.tick.step?.events;
    this._recordReplayCheckpoint(opts.tickIndex, {
      deaths: worldEvents?.deaths,
      events: worldEvents,
    });
  }

  // -----------------------------------------------------------------------
  // LAN mode stubs (abstract in Python)
  // -----------------------------------------------------------------------

  protected _lanModeName(): 'survival' | 'rush' | 'quests' {
    throw new Error('_lanModeName() must be implemented by subclass');
  }

  protected _lanMatchSession(): DeterministicSession | null {
    throw new Error('_lanMatchSession() must be implemented by subclass');
  }

  protected _lanPrepareFrame(
    _role: string,
    _dtUiMs: number,
    _session: DeterministicSession,
    _dtTick: number,
  ): boolean {
    return true;
  }

  protected _lanAllowFramePop(): boolean {
    return true;
  }

  protected _lanOnTickApplied(
    _tick: DeterministicSessionTick,
    _frameTickIndex: number | null,
    _dtTick: number,
  ): LanStepAction {
    return 'continue';
  }

  protected _lanOnPaused(_dt: number): void {}

  // -----------------------------------------------------------------------
  // _updateLanMatch (stub)
  // -----------------------------------------------------------------------

  protected _updateLanMatch(_opts: { dt: number; dtUiMs?: number }): void {
    // No LAN in WebGL port
  }

  protected _prepareLanMatchRuntime(_opts: { modeName: string }): string | null {
    return null;
  }

  protected _queueLanLocalInputs(_opts: {
    runtime: unknown;
    ticksToCapture: number;
    dt: number;
  }): void {
    // No LAN in WebGL
  }

  protected _consumeLanTickFrames(_opts: {
    runtime: unknown;
    lockstepRuntime: unknown;
    session: DeterministicSession;
    role: string;
    dtTick: number;
  }): boolean {
    return false;
  }

  // -----------------------------------------------------------------------
  // _syncAudioAndGround
  // -----------------------------------------------------------------------

  protected _syncAudioAndGround(): void {
    this._worldRuntime.syncAudioBridgeState();
    if (this.renderResources.ground !== null) {
      this.renderResources.ground.processPending();
    }
  }

  // -----------------------------------------------------------------------
  // _applyBatchPresentationOutputs
  // -----------------------------------------------------------------------

  protected _applyBatchPresentationOutputs(opts: {
    outputs: readonly PresentationTickOutput[];
    postApplyReactions?: readonly PostApplyReaction[];
    applyAudio: boolean;
    updateCamera: boolean;
  }): void {
    const postApplyReactions = opts.postApplyReactions ?? [];
    if (postApplyReactions.length > 0 && postApplyReactions.length !== opts.outputs.length) {
      throw new Error('post-apply reactions must align with presentation outputs');
    }

    const reactionByTick = new Map<number, PostApplyReaction>();
    for (let i = 0; i < opts.outputs.length && i < postApplyReactions.length; i++) {
      reactionByTick.set(opts.outputs[i].tickIndex, postApplyReactions[i]);
    }

    applyPresentationOutputs({
      outputs: opts.outputs,
      syncAudioBridgeState: () => this._worldRuntime.syncAudioBridgeState(),
      applyAudioPlan: (plan: PresentationStepCommands, applyAudio: boolean) =>
        this.audioBridge.applyPlan(plan, applyAudio),
      applyTerrainFx: (batch: TerrainFxBatch) => this.renderResources.consumeTerrainFxBatch(batch),
      updateCamera: opts.updateCamera
        ? (dtSim: number) => this._worldRuntime.updateCamera(dtSim)
        : null,
      onOutputApplied: (output: PresentationTickOutput) => {
        const reaction = reactionByTick.get(output.tickIndex);
        if (reaction) {
          this._applyTickPostApplyReaction(reaction, { dtSeconds: Number(output.dtSim) });
        }
      },
      applyAudio: opts.applyAudio,
    });
  }

  // -----------------------------------------------------------------------
  // Post-apply reactions
  // -----------------------------------------------------------------------

  protected _buildTickPostApplyReaction(opts: { tickResult: TickResult }): PostApplyReaction {
    return buildPostApplyReaction({ tickResult: opts.tickResult });
  }

  protected _applyTickPostApplyReaction(
    reaction: PostApplyReaction,
    _opts: { dtSeconds: number },
  ): void {
    applyPostApplyReaction({
      reaction,
      playSfx: (id: SfxId) => this.audioBridge.router.playSfx(id),
    });
  }

  // -----------------------------------------------------------------------
  // _processTickBatchResults
  // -----------------------------------------------------------------------

  protected _processTickBatchResults(opts: {
    batch: TickBatchResult;
    session: DeterministicSession;
    recorder?: ReplayRecorder | null;
    lanSyncCallbacks?: LanSyncCallbacks | null;
    onTickApplied?: ((applied: AppliedBatchTick) => LanStepAction) | null;
    onCheckpoint?: ((replayTickIndex: number, tick: DeterministicSessionTick) => void) | null;
  }): BatchApplyOutcome {
    const {
      batch,
      session,
      recorder = null,
      lanSyncCallbacks = null,
      onTickApplied = null,
      onCheckpoint = null,
    } = opts;

    let ticksApplied = 0;
    let stopAfterFinalize = false;
    const presentationOutputs: PresentationTickOutput[] = [];
    const postApplyReactions: PostApplyReaction[] = [];

    for (const tickResult of batch.completedResults) {
      const tick = tickResult.payload;
      let replayTickIndex = tickResult.replayTickIndex;
      if (replayTickIndex === null && recorder !== null) {
        replayTickIndex = recorder.recordTick(
          [tickResult.sourceTick.inputs],
          tickResult.sourceTick.commands,
        );
        (tickResult as { replayTickIndex: number | null }).replayTickIndex = replayTickIndex;
      }

      const applied: AppliedBatchTick = {
        tick,
        replayTickIndex,
        frameTickIndex: null,
      };

      if (lanSyncCallbacks !== null) {
        BaseGameplayMode._prepareLanTickSync({ tickResult, callbacks: lanSyncCallbacks });
      }
      if (tickResult.lanSync !== null) {
        applied.frameTickIndex = tickResult.lanSync.frameTickIndex;
      }

      presentationOutputs.push(
        applySimMetadataTickResult({
          simWorld: this.simWorld,
          tickResult,
          gameTuneStarted: session.gameTuneStarted,
        }),
      );
      postApplyReactions.push(
        this._buildTickPostApplyReaction({ tickResult }),
      );
      this._ticksAdvancedPerFrame += 1;
      ticksApplied += 1;

      let action: LanStepAction = 'continue';
      if (onTickApplied !== null) {
        action = onTickApplied(applied);
      }
      if (action === 'stop_before_finalize') {
        return {
          ticksApplied,
          stopped: true,
          stopAfterFinalize: false,
          presentationOutputs,
          postApplyReactions,
        };
      }

      if (replayTickIndex !== null && onCheckpoint !== null) {
        onCheckpoint(replayTickIndex, tick);
      }

      if (lanSyncCallbacks !== null) {
        BaseGameplayMode._finalizeLanTickSync({ tickResult, callbacks: lanSyncCallbacks });
      }

      if (action === 'stop_after_finalize') {
        stopAfterFinalize = true;
        return {
          ticksApplied,
          stopped: true,
          stopAfterFinalize,
          presentationOutputs,
          postApplyReactions,
        };
      }
    }

    return {
      ticksApplied,
      stopped: false,
      stopAfterFinalize,
      presentationOutputs,
      postApplyReactions,
    };
  }

  // -----------------------------------------------------------------------
  // _runDeterministicSessionTicks
  // -----------------------------------------------------------------------

  protected _runDeterministicSessionTicks(opts: {
    dtFrame: number;
    session: DeterministicSession;
    recorder: ReplayRecorder | null;
    onTick: (tick: DeterministicSessionTick, replayTickIndex: number | null) => boolean;
    onCheckpoint?: ((replayTickIndex: number, tick: DeterministicSessionTick) => void) | null;
  }): void {
    if (opts.dtFrame <= 0.0) return;

    this._syncAudioAndGround();
    opts.session.detailPreset = this._deterministicDetailPreset();
    opts.session.violenceDisabled = this._deterministicViolenceDisabled();

    const [runner, provider] = this._ensureTickRunner({
      session: opts.session,
      isNetworked: false,
    });
    if (!(provider instanceof LocalInputProvider)) {
      throw new TypeError('local tick runner provider must be LocalInputProvider');
    }
    let localClock = this._tickRunnerLocalClock;
    if (localClock === null) {
      localClock = new FixedStepClock(this._gameplayTickRate());
      this._tickRunnerLocalClock = localClock;
    }

    const candidateTicks = localClock.advance(opts.dtFrame);
    const tickDt = localClock.dtTick;
    const simStart = performance.now();

    const advance = advanceTickRunnerFrame({
      runner,
      startTick: this._tickRunnerNextTickIndex,
      frameIndex: this._tickRunnerFrameIndex,
      ticksRequested: candidateTicks,
      dtSeconds: opts.dtFrame,
      tickDtSeconds: tickDt,
      isNetworked: false,
      isReplay: false,
      refundClock: localClock,
    });

    this._tickRunnerFrameIndex = advance.frameIndex;
    this._tickRunnerNextTickIndex = advance.nextTickIndex;
    const batch = advance.batch;
    this._simMs = performance.now() - simStart;
    this._presentationPlanMs = batch.completedResults.reduce(
      (sum: number, row: TickResult) =>
        sum + Math.max(0.0, Number(row.payload.step?.presentationPlanMs ?? 0)),
      0.0,
    );

    const applyStart = performance.now();
    const outcome = this._processTickBatchResults({
      batch,
      session: opts.session,
      recorder: opts.recorder,
      onTickApplied: (applied: AppliedBatchTick) =>
        opts.onTick(applied.tick, applied.replayTickIndex) ? 'stop_after_finalize' : 'continue',
      onCheckpoint: opts.onCheckpoint ?? null,
    });

    this._applyBatchPresentationOutputs({
      outputs: outcome.presentationOutputs,
      postApplyReactions: outcome.postApplyReactions,
      applyAudio: true,
      updateCamera: true,
    });

    this._presentationApplyMs = performance.now() - applyStart;
    if (batch.batchStatus === InputStatus.STALLED && batch.ticksCompleted <= 0) {
      this._inputStallCount += 1;
    }
  }
}
