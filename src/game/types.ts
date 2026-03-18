// Port of crimson/game/types.py — excluding networking (net, rollback, lockstep)

import type { Vec2 } from '../engine/geom.ts';
import type { Crand } from '../engine/rand.ts';
import type { CrimsonConfig } from '../engine/config.ts';
import type { RuntimeResources } from '../engine/assets.ts';
import type { AudioState } from '../engine/audio.ts';
import type { ConsoleState } from '../engine/console.ts';
import type { GroundRenderer } from '../engine/terrain-render.ts';
import type { WebGLContext } from '../engine/webgl.ts';
import type { GameMode } from './game-modes.ts';
import type { RtxRenderMode } from './render/rtx/mode.ts';
import type { QuestLevel } from './quests/level.ts';

// ---------------------------------------------------------------------------
// GameConfig — frozen (interface)
// ---------------------------------------------------------------------------

export interface GameConfig {
  readonly assetsUrl: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly fps: number;
  readonly seed: number | null;
  readonly demoEnabled: boolean;
  readonly noIntro: boolean;
  readonly debug: boolean;
  readonly rtx: boolean;
  readonly preserveBugs: boolean;
}

export function defaultGameConfig(assetsUrl: string): GameConfig {
  return {
    assetsUrl,
    width: null,
    height: null,
    fps: 60,
    seed: null,
    demoEnabled: false,
    noIntro: false,
    debug: false,
    rtx: false,
    preserveBugs: false,
  };
}

// ---------------------------------------------------------------------------
// HighScoresRequest
// ---------------------------------------------------------------------------

export interface HighScoresRequest {
  gameModeId: GameMode;
  questLevel: QuestLevel | null;
  highlightRank: number | null;
}

// ---------------------------------------------------------------------------
// Screen — protocol interface
// ---------------------------------------------------------------------------

export interface Screen {
  open(): void;
  close(): void;
  update(dt: number): void;
  draw(ctx: WebGLContext): void;
  takeAction(): string | null;
}

// ---------------------------------------------------------------------------
// PauseBackground — structural interface for pause screen rendering
// ---------------------------------------------------------------------------

export interface PauseBackground {
  drawPauseBackground(ctx: WebGLContext, opts?: { entityAlpha?: number }): void;
}

// ---------------------------------------------------------------------------
// GameState — mutable class
// ---------------------------------------------------------------------------

export class GameState {
  assetsUrl: string;
  rng: Crand;
  config: CrimsonConfig;
  console: ConsoleState;
  demoEnabled: boolean;
  debugEnabled: boolean;
  preserveBugs: boolean;
  resources: RuntimeResources | null;
  audio: AudioState | null;
  sessionStart: number;
  rtxMode: RtxRenderMode;
  skipIntro: boolean;
  gammaRamp: number;
  sndFreqAdjustmentEnabled: boolean;
  menuGround: GroundRenderer | null;
  menuGroundCamera: Vec2 | null;
  menuSignLocked: boolean;
  statsMenuEasterEggRoll: number;
  pendingQuestLevel: QuestLevel | null;
  pendingHighScores: HighScoresRequest | null;
  questOutcome: { kind: string } | null;
  questFailRetryCount: number;
  terrainRegenerateRequested: boolean;
  survivalElapsedMs: number;
  demoTrialElapsedMs: number;
  quitRequested: boolean;
  screenFadeAlpha: number;
  screenFadeRamp: boolean;
  runtimeUpdatesPerFrame: number;
  inputStallCount: number;
  ticksAdvancedPerFrame: number;
  simMs: number;
  presentationPlanMs: number;
  presentationApplyMs: number;
  pauseBackground: PauseBackground | null;

  constructor(init: {
    assetsUrl: string;
    rng: Crand;
    config: CrimsonConfig;
    console: ConsoleState;
    demoEnabled: boolean;
    debugEnabled?: boolean;
    preserveBugs: boolean;
    resources: RuntimeResources | null;
    audio: AudioState | null;
    sessionStart: number;
    rtxMode: RtxRenderMode;
  }) {
    this.assetsUrl = init.assetsUrl;
    this.rng = init.rng;
    this.config = init.config;
    this.console = init.console;
    this.demoEnabled = init.demoEnabled;
    this.debugEnabled = init.debugEnabled ?? false;
    this.preserveBugs = init.preserveBugs;
    this.resources = init.resources;
    this.audio = init.audio;
    this.sessionStart = init.sessionStart;
    this.rtxMode = init.rtxMode;
    this.skipIntro = false;
    this.gammaRamp = 1.0;
    this.sndFreqAdjustmentEnabled = true;
    this.menuGround = null;
    this.menuGroundCamera = null;
    this.menuSignLocked = false;
    this.statsMenuEasterEggRoll = -1;
    this.pendingQuestLevel = null;
    this.pendingHighScores = null;
    this.questOutcome = null;
    this.questFailRetryCount = 0;
    this.terrainRegenerateRequested = false;
    this.survivalElapsedMs = 0.0;
    this.demoTrialElapsedMs = 0;
    this.quitRequested = false;
    this.screenFadeAlpha = 0.0;
    this.screenFadeRamp = false;
    this.runtimeUpdatesPerFrame = 0;
    this.inputStallCount = 0;
    this.ticksAdvancedPerFrame = 0;
    this.simMs = 0.0;
    this.presentationPlanMs = 0.0;
    this.presentationApplyMs = 0.0;
    this.pauseBackground = null;
  }
}
