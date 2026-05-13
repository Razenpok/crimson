// Port of crimson/game/types.py

import type { Vec2 } from '@grim/geom.ts';
import type { Crand, CrandLike } from '@grim/rand.ts';
import type { CrimsonConfig } from '@grim/config.ts';
import type { RuntimeResources } from '@grim/assets.ts';
import type { AudioState } from '@grim/audio.ts';
import type { ConsoleState } from '@grim/console.ts';
import type { GroundRenderer } from '@grim/terrain-render.ts';
import type { GameMode } from '@crimson/game-modes.ts';
import type { RtxRenderMode } from '@crimson/render/rtx/mode.ts';
import type { QuestLevel } from '@crimson/quests/level.ts';
import type { QuestRunOutcome } from '@crimson/modes/quest-mode.ts';
import type { PauseBackground } from '@crimson/pause-background.ts';

export type { PauseBackground } from '@crimson/pause-background.ts';

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

export interface HighScoresRequest {
  gameModeId: GameMode;
  questLevel: QuestLevel | null;
  highlightRank: number | null;
}

export interface GameStateStatus {
  readonly gameSequenceId: number;
  questUnlockIndex: number;
  questUnlockIndexFull: number;
  questPlayCounts: number[];
  modePlayOther: number;
  unknownTail: Uint8Array;
  saveIfDirty(): void;
  incrementModePlayCountForMode(mode: GameMode): void;
  modePlayCountForMode(mode: number): number;
  questPlayCount(index: number): number;
  incrementQuestPlayCount(index: number): number;
  weaponUsageCountSlot(slot: number): number;
  incrementWeaponUsageSlot(slot: number): void;
}

export interface Screen {
  open(): void;
  close(): void;
  update(dt: number): void;
  draw(): void;
  takeAction?(): string | null;
}

export interface GameplayScreen extends Screen, PauseBackground {
  closeRequested: boolean;
  defaultGameModeId: GameMode;

  bindStatus(status: GameStateStatus | null): void;
  bindScreenFade(fade: GameState | null): void;
  bindAudio(audio: AudioState | null, audioRng: CrandLike): void;
  setLanRuntime(opts: {
    enabled: boolean;
    role: string;
    expected_players?: number;
    connected_players?: number;
    waiting_for_players?: boolean;
    expectedPlayers?: number;
    connectedPlayers?: number;
    waitingForPlayers?: boolean;
  }): void;
  bindLanRuntime(runtime: unknown): void;
  setLanMatchStart(opts: { seed: number; startTick?: number; status?: GameStateStatus | null }): void;
  stealGroundForMenu(): GroundRenderer | null;
  menuGroundCamera(): Vec2;
  consoleElapsedMs(): number;
  prepareDemoTrialOverlayFrame(): void;
  regenerateTerrainForConsole(): void;
  setRtxMode(mode: RtxRenderMode): void;
  setRuntimeUpdatesPerFrame(value: number): void;
  frameTelemetry(): [number, number, number, number, number, number];
  consumeOutcome?(): QuestRunOutcome | null;
  startRun?(level: QuestLevel, opts: { status: GameStateStatus | null }): void;
}

export class GameState {
  assetsUrl: string;
  rng: Crand;
  config: CrimsonConfig;
  status: GameStateStatus;
  console: ConsoleState;
  demoEnabled: boolean;
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
  questOutcome: QuestRunOutcome | null;
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
    status: GameStateStatus;
    console: ConsoleState;
    demoEnabled: boolean;
    preserveBugs: boolean;
    resources: RuntimeResources | null;
    audio: AudioState | null;
    sessionStart: number;
    rtxMode: RtxRenderMode;
    skipIntro?: boolean;
  }) {
    this.assetsUrl = init.assetsUrl;
    this.rng = init.rng;
    this.config = init.config;
    this.status = init.status;
    this.console = init.console;
    this.demoEnabled = init.demoEnabled;
    this.preserveBugs = init.preserveBugs;
    this.resources = init.resources;
    this.audio = init.audio;
    this.sessionStart = init.sessionStart;
    this.rtxMode = init.rtxMode;
    this.skipIntro = init.skipIntro ?? false;
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
