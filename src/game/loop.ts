// Port of crimson/game/loop_view.py (1092 lines) — main game loop controller
//
// Manages screen transitions, demo mode, console overlay, gamma ramp shader,
// demo trial overlay, and the overall game flow.
//
// Networking (LAN lobby, lockstep, rollback, network sessions) is excluded;
// all network-related paths are stubbed as no-ops.

import { type WebGLContext } from '../engine/webgl.ts';
import { type View, ViewContext } from '../engine/view.ts';
import { Vec2 } from '../engine/geom.ts';
import { type CrandLike } from '../engine/rand.ts';
import { type AudioState, audioStopMusic } from '../engine/audio.ts';
import { type GroundRenderer } from '../engine/terrain-render.ts';
import { InputState } from '../engine/input.ts';
import { inputBeginFrame } from './input-codes.ts';

import { GameMode } from './game-modes.ts';
import { type RtxRenderMode, cycleRtxRenderMode } from './render/rtx/mode.ts';
import { type Screen, type GameState, type PauseBackground } from './types.ts';
import {
  type DemoTrialOverlayInfo,
  demoTrialOverlayInfo,
  tickDemoTrialTimers,
} from './demo-trial.ts';
import { updateScreenFade } from '../screens/transitions.ts';

import { BootView } from '../screens/boot.ts';
import { DemoView } from './demo.ts';
import { MenuView, ensureMenuGround } from '../screens/menu.ts';
import { HighScoresView } from '../screens/high-scores-view/view.ts';
import { PauseMenuView } from '../screens/pause-menu.ts';

import { PlayGameMenuView } from '../screens/panels/play-game.ts';
import { OptionsMenuView } from '../screens/panels/options.ts';
import { ControlsMenuView } from '../screens/panels/controls.ts';
import { StatisticsMenuView } from '../screens/panels/stats.ts';
import { UnlockedWeaponsDatabaseView } from '../screens/panels/databases-weapons.ts';
import { UnlockedPerksDatabaseView } from '../screens/panels/databases-perks.ts';
import { CreditsView } from '../screens/panels/credits.ts';
import { AlienZooKeeperView } from '../screens/panels/alien-zookeeper.ts';
import { ModsMenuView } from '../screens/panels/mods.ts';
import { PanelMenuView } from '../screens/panels/base.ts';

import { QuestsMenuView } from '../screens/quest-views/quests-menu.ts';
import { QuestResultsView } from '../screens/quest-views/quest-results.ts';
import { QuestFailedView } from '../screens/quest-views/quest-failed.ts';
import { EndNoteView } from '../screens/quest-views/end-note.ts';

import { type QuestLevel } from './quests/level.ts';
import { type GameStatus } from '../modes/base-gameplay-mode.ts';
import { QuestMode } from '../modes/quest-mode.ts';
import { SurvivalMode } from '../modes/survival-mode.ts';
import { RushMode } from '../modes/rush-mode.ts';
import { TypoShooterMode } from '../modes/typo-mode.ts';
import { TutorialMode } from '../modes/tutorial-mode.ts';

import { DEMO_PURCHASE_URL } from './demo.ts';
import { DemoTrialOverlayUi } from '../ui/demo-trial-overlay.ts';
import { WorldRuntime } from './world/runtime.ts';

import { type GameStatusPersist } from './runtime.ts';

// ---------------------------------------------------------------------------
// Forward-reference type stubs
// ---------------------------------------------------------------------------

// TODO: These are the key codes from the original game; adapt to DOM keyCodes
const KEY_F4 = 115; // DOM keyCode for F4
const KEY_P = 80;   // DOM keyCode for P
const KEY_ESCAPE = 27;

// ---------------------------------------------------------------------------
// GameplayScreen protocol — matches BaseGameplayMode's public surface
// ---------------------------------------------------------------------------

/** Internal view that receives ctx through draw/update calls. */
/** Structural type matching BaseGameplayMode's gameplay-relevant methods. */
interface GameplayScreen extends Screen, PauseBackground {
  closeRequested: boolean;
  defaultGameModeId: GameMode;

  setRuntimeUpdatesPerFrame(value: number): void;
  frameTelemetry(): [number, number, number, number, number, number];
  consoleElapsedMs(): number;
  regenerateTerrainForConsole(): void;
  prepareDemoTrialOverlayFrame(): void;

  bindStatus(status: GameStatus | null): void;
  bindAudio(audio: AudioState | null, audioRng: CrandLike): void;
  setRtxMode(mode: RtxRenderMode): void;
  bindScreenFade(fade: GameState | null): void;

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
  setLanMatchStart(opts: { seed: number; startTick?: number; status?: unknown }): void;

  stealGroundForMenu(): GroundRenderer | null;
  menuGroundCamera(): Vec2 | null;

  consumeOutcome?(): { kind: string } | null;
  startRun?(level: QuestLevel, status: GameStatus | null): void;
}

// ---------------------------------------------------------------------------
// Gamma ramp shader (WebGL2)
// ---------------------------------------------------------------------------

const GAMMA_RAMP_VS = `#version 300 es
precision highp float;

in vec3 vertexPosition;
in vec2 vertexTexCoord;
in vec4 vertexColor;

out vec2 fragTexCoord;
out vec4 fragColor;

uniform mat4 mvp;

void main() {
    fragTexCoord = vertexTexCoord;
    fragColor = vertexColor;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
`;

const GAMMA_RAMP_FS = `#version 300 es
precision highp float;

in vec2 fragTexCoord;
in vec4 fragColor;

uniform sampler2D texture0;
uniform vec4 colDiffuse;
uniform float u_gamma_gain;

out vec4 finalColor;

void main() {
    vec4 texel = texture(texture0, fragTexCoord) * fragColor * colDiffuse;
    texel.rgb = clamp(texel.rgb * max(u_gamma_gain, 0.0), 0.0, 1.0);
    finalColor = texel;
}
`;

let _gammaRampShader: WebGLProgram | null = null;
let _gammaRampShaderGainLoc: WebGLUniformLocation | null = null;
let _gammaRampShaderTried = false;

function getGammaRampShader(
  _gl: WebGLContext,
): [WebGLProgram | null, WebGLUniformLocation | null] {
  // TODO: compile GAMMA_RAMP_VS / GAMMA_RAMP_FS into a WebGL2 program
  // For now, gamma correction is deferred until shader pipeline is wired up.
  if (_gammaRampShaderTried) {
    return [_gammaRampShader, _gammaRampShaderGainLoc];
  }
  _gammaRampShaderTried = true;
  // Shader compilation stub — gamma ramp will be a no-op until wired
  _gammaRampShader = null;
  _gammaRampShaderGainLoc = null;
  return [null, null];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function modeViewContext(state: GameState): ViewContext {
  const preserveBugs = state.preserveBugs;
  // Network multiplayer would force preserveBugs=false; not applicable in WebGL.
  return new ViewContext(state.assetsUrl, preserveBugs);
}

function isGameplayScreen(view: Screen | null): view is GameplayScreen {
  if (view === null) return false;
  return (
    'frameTelemetry' in view &&
    'consoleElapsedMs' in view &&
    'bindStatus' in view &&
    'closeRequested' in view &&
    'defaultGameModeId' in view
  );
}

// ---------------------------------------------------------------------------
// GameLoopView
// ---------------------------------------------------------------------------

export class GameLoopView implements View {
  readonly state: GameState;
  private _status: GameStatusPersist;
  private _ctx: WebGLContext;

  private _boot: BootView;
  private _demo: DemoView | null = null;
  private _menu: MenuView;

  private _frontViews: Record<string, Screen>;
  private _frontActive: Screen | null = null;
  private _frontStack: Screen[] = [];
  private _active: Screen;

  private _demoTrialOverlay: DemoTrialOverlayUi | null = null;
  private _demoTrialInfo: DemoTrialOverlayInfo | null = null;
  private _demoActive = false;
  private _menuActive = false;
  private _quitAfterDemo = false;
  private _screenshotRequested = false;
  private _runtimeUpdatesPerFrame = 0;
  private _debugEnabled = false;

  constructor(ctx: WebGLContext, state: GameState, status: GameStatusPersist) {
    this._ctx = ctx;
    this.state = state;
    this._status = status;
    this._debugEnabled = state.debugEnabled;

    this._boot = new BootView(ctx, state);
    // DemoView requires a WorldRuntime which depends on WebGLContext;
    // deferred to _ensureDemo() when the demo is actually needed.
    this._demo = null;
    this._menu = new MenuView(ctx, state);

    const _viewCtx = modeViewContext(state);

    // Screen constructors use structural sub-interfaces of GameState.
    // We cast to `any` where the interface extends PanelGameState or
    // a specialised state shape that GameState satisfies at runtime
    // once all fields are populated (resources, status, etc.).
    const gs: any = state;
    gs.status = status;

    this._frontViews = {
      open_play_game: new PlayGameMenuView(gs),
      // Network session / lobby screens stubbed — LAN excluded from WebGL port
      // open_lan_session: no-op
      // open_lan_lobby: no-op
      open_quests: new QuestsMenuView(gs),
      open_pause_menu: new PauseMenuView(gs),
      start_quest: new QuestMode({
        gl: ctx,
        demoModeActive: state.demoEnabled,
        config: state.config,
        console: state.console,
        audio: state.audio,
        audioRng: state.rng,
      }),
      quest_results: new QuestResultsView(gs),
      quest_failed: new QuestFailedView(gs),
      end_note: new EndNoteView(gs),
      open_high_scores: new HighScoresView(gs),
      start_survival: new SurvivalMode({
        gl: ctx,
        config: state.config,
        console: state.console,
        audio: state.audio,
        audioRng: state.rng,
      }),
      start_rush: new RushMode({
        gl: ctx,
        config: state.config,
        console: state.console,
        audio: state.audio,
        audioRng: state.rng,
      }),
      start_typo: new TypoShooterMode({
        gl: ctx,
        config: state.config,
        console: state.console,
        audio: state.audio,
        audioRng: state.rng,
      }),
      start_tutorial: new TutorialMode({
        gl: ctx,
        demoModeActive: state.demoEnabled,
        config: state.config,
        console: state.console,
        audio: state.audio,
        audioRng: state.rng,
      }),
      open_options: new OptionsMenuView(gs),
      open_controls: new ControlsMenuView(gs),
      open_statistics: new StatisticsMenuView(gs),
      open_weapon_database: new UnlockedWeaponsDatabaseView(gs),
      open_perk_database: new UnlockedPerksDatabaseView(gs),
      open_credits: new CreditsView(gs),
      open_alien_zookeeper: new AlienZooKeeperView(gs),
      open_mods: new ModsMenuView(gs),
      open_other_games: new PanelMenuView(
        gs,
        {
          title: 'Other games',
          body: 'This menu is out of scope for the rewrite.',
        },
      ),
    };

    this._active = this._boot;
  }

  /**
   * Lazily create the DemoView — requires WorldRuntime allocation.
   */
  private _ensureDemo(): DemoView | null {
    if (this._demo !== null) return this._demo;
    // TODO: WorldRuntime constructor requires several parameters;
    // for now, create a minimal instance for the demo.
    const runtime = new WorldRuntime(this._ctx, {
      worldSize: 1024,
      demoModeActive: true,
      config: this.state.config,
      audio: this.state.audio,
      audioRng: this.state.rng,
      preserveBugs: this.state.preserveBugs,
    });
    this._demo = new DemoView(this.state, runtime);
    return this._demo;
  }

  // -----------------------------------------------------------------------
  // Demo trial overlay
  // -----------------------------------------------------------------------

  private _demoTrialOverlayView(): DemoTrialOverlayUi | null {
    if (this._demoTrialOverlay === null) {
      // DemoTrialOverlayUi requires RuntimeResources; defer creation until
      // resources are loaded.  If resources are still null, return null.
      const resources = this.state.resources;
      if (resources === null) {
        return null;
      }
      this._demoTrialOverlay = new DemoTrialOverlayUi(resources);
    }
    return this._demoTrialOverlay;
  }

  // -----------------------------------------------------------------------
  // View protocol
  // -----------------------------------------------------------------------

  open(): void {
    // Hide the native cursor (CSS cursor: none on canvas)
    this._boot.open();
  }

  // Unused in WebGL port: desktop-only (window management / file save)
  shouldClose(): boolean {
    return this.state.quitRequested;
  }

  // Unused in WebGL port: desktop-only (window management / file save)
  consumeScreenshotRequest(): boolean {
    const requested = this._screenshotRequested;
    this._screenshotRequested = false;
    return requested;
  }

  // -----------------------------------------------------------------------
  // LAN stubs — networking excluded from WebGL port
  // -----------------------------------------------------------------------

  /** LAN UI enabled cvar check — always true (no-op in WebGL). */
  private _lanUiEnabled(): boolean {
    const cvar = this.state.console.cvars.get('cv_lanLockstepEnabled');
    if (cvar === undefined) return true;
    return cvar.valueF !== 0;
  }

  /** Auto LAN start — no-op in WebGL (no pending network session). */
  private _autoLanStartAction(): string | null {
    // Networking excluded: always null
    return null;
  }

  /**
   * Resolve LAN-related actions — in WebGL, network actions are no-ops.
   * Non-LAN actions pass through unmodified.
   */
  private _resolveLanAction(action: string): string | null {
    // Network session/lobby actions are stubbed
    if (action === 'open_lan_session') {
      // LAN UI is excluded; treat as open_play_game fallback
      return 'open_play_game';
    }

    const lanModeActions: Record<string, string> = {
      start_survival_lan: 'start_survival',
      start_rush_lan: 'start_rush',
      start_quest_lan: 'start_quest',
    };
    const mapped = lanModeActions[action];
    if (mapped !== undefined) {
      // Strip LAN prefix and run as local mode
      return mapped;
    }

    // Non-LAN actions pass through
    return action;
  }

  /** Network runtime tick — no-op in WebGL. */
  private _tickNetworkRuntime(): void {
    this._runtimeUpdatesPerFrame = 0;
    this.state.runtimeUpdatesPerFrame = 0;
  }

  // -----------------------------------------------------------------------
  // Frame telemetry
  // -----------------------------------------------------------------------

  private _clearStateFrameTelemetry(): void {
    this.state.inputStallCount = 0;
    this.state.ticksAdvancedPerFrame = 0;
    this.state.simMs = 0.0;
    this.state.presentationPlanMs = 0.0;
    this.state.presentationApplyMs = 0.0;
  }

  private _syncGameplayFrameTelemetryToState(): void {
    const gameplay = this._gameplayScreen(this._frontActive);
    if (gameplay === null) return;

    const [
      runtimeUpdatesPerFrame,
      inputStallCount,
      ticksAdvancedPerFrame,
      simMs,
      presentationPlanMs,
      presentationApplyMs,
    ] = gameplay.frameTelemetry();

    this.state.runtimeUpdatesPerFrame = runtimeUpdatesPerFrame | 0;
    this.state.inputStallCount = inputStallCount | 0;
    this.state.ticksAdvancedPerFrame = ticksAdvancedPerFrame | 0;
    this.state.simMs = simMs;
    this.state.presentationPlanMs = presentationPlanMs;
    this.state.presentationApplyMs = presentationApplyMs;
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  update(dt: number): void {
    // Flush edge-triggered state from the previous frame (keys pressed, etc.)
    inputBeginFrame();

    const con = this.state.console;
    // Console hotkey (backtick/tilde)
    if (InputState.wasKeyPressed(192)) {
      con.toggleOpen();
    }
    con.update(dt);
    this._syncConsoleElapsedMs();
    this._handleConsoleRequests();
    this._syncRtxMode();
    updateScreenFade(this.state, dt);
    this._tickNetworkRuntime();
    this._clearStateFrameTelemetry();

    const frontActive = this._frontActive;
    const gameplay = this._gameplayScreen(frontActive);

    if (gameplay !== null) {
      gameplay.setRuntimeUpdatesPerFrame(this._runtimeUpdatesPerFrame | 0);
    }

    // Debug hotkeys
    if (this._debugEnabled && !con.openFlag && InputState.wasKeyPressed(KEY_F4)) {
      this._setRtxMode(cycleRtxRenderMode(this.state.rtxMode), 'debug hotkey F4');
    }
    if (this._debugEnabled && !con.openFlag && InputState.wasKeyPressed(KEY_P)) {
      this._screenshotRequested = true;
    }

    // If console is open, only process quit and return
    if (con.openFlag) {
      if (con.quitRequested) {
        this.state.quitRequested = true;
        con.quitRequested = false;
      }
      return;
    }

    this._demoTrialInfo = null;
    this._tickStatisticsPlaytime(dt);

    if (gameplay !== null) {
      if (this._updateDemoTrialOverlay(dt)) {
        return;
      }
    }

    this._active.update(dt);
    this._syncGameplayFrameTelemetryToState();

    // Process front-active screen actions
    if (this._frontActive !== null) {
      const fa = this._frontActive;
      const gp = this._gameplayScreen(fa);
      let action = fa.takeAction();

      if (gp !== null) {
        action = this._resolveGameplayAction(gp, action);
      }
      if (action !== null) {
        action = this._resolveLanAction(action);
        if (action === null) return;
      }

      // back_to_menu
      if (action === 'back_to_menu') {
        this._captureGameplayGroundForMenu();
        this.state.pauseBackground = null;
        this._frontActive!.close();
        this._frontActive = null;
        while (this._frontStack.length > 0) {
          this._frontStack.pop()!.close();
        }
        this._menu.open();
        this._active = this._menu;
        this._menuActive = true;
        return;
      }

      // back_to_previous
      if (action === 'back_to_previous') {
        if (this._frontStack.length > 0) {
          fa.close();
          this._frontActive = this._frontStack.pop()!;
          if (this._gameplayScreen(this._frontActive) !== null) {
            this.state.pauseBackground = null;
          } else {
            if (this._frontActive instanceof StatisticsMenuView) {
              (this._frontActive as StatisticsMenuView).reopenFromChild();
            }
          }
          this._active = this._frontActive;
          return;
        }
        fa.close();
        this._frontActive = null;
        this.state.pauseBackground = null;
        this._menu.open();
        this._active = this._menu;
        this._menuActive = true;
        return;
      }

      // open_pause_menu
      if (action === 'open_pause_menu') {
        const pauseView = this._frontViews['open_pause_menu'] ?? null;
        if (pauseView === null) return;

        if (gp !== null) {
          // Gameplay is active — push it onto stack and show pause
          this.state.pauseBackground = gp;
          this._frontStack.push(fa);
          pauseView.open();
          this._frontActive = pauseView;
          this._active = pauseView;
          return;
        }
        if (this.state.pauseBackground !== null) {
          // Non-gameplay screen with a gameplay on the stack — show pause
          this._frontStack.push(fa);
          pauseView.open();
          this._frontActive = pauseView;
          this._active = pauseView;
          return;
        }
        // Options panel uses open_pause_menu as back_action
        // When no game is running, treat it like back_to_menu
        this._frontActive!.close();
        this._frontActive = null;
        while (this._frontStack.length > 0) {
          this._frontStack.pop()!.close();
        }
        this._menu.open();
        this._active = this._menu;
        this._menuActive = true;
        return;
      }

      // Mode start actions — bump statistics counter
      if (
        action === 'start_survival' ||
        action === 'start_rush' ||
        action === 'start_typo'
      ) {
        const modeMap: Record<string, GameMode> = {
          start_survival: GameMode.SURVIVAL,
          start_rush: GameMode.RUSH,
          start_typo: GameMode.TYPO,
        };
        const modeId = modeMap[action];
        if (modeId !== undefined) {
          this._status.incrementModePlayCountForMode(modeId);
        }
      }

      // Generic front view transition
      if (action !== null) {
        const view = this._frontViews[action] ?? null;
        if (view !== null) {
          // Determine stack behavior
          if (
            action === 'open_high_scores' ||
            action === 'open_weapon_database' ||
            action === 'open_perk_database' ||
            action === 'open_credits'
          ) {
            if (gp !== null && this.state.pauseBackground === null) {
              this.state.pauseBackground = gp;
            }
            this._frontStack.push(fa);
          } else if (
            (action === 'quest_results' || action === 'quest_failed') &&
            gp !== null
          ) {
            this.state.pauseBackground = gp;
            this._frontStack.push(fa);
          } else {
            if (
              action === 'start_survival' ||
              action === 'start_rush' ||
              action === 'start_typo' ||
              action === 'start_tutorial' ||
              action === 'start_quest' ||
              action === 'open_play_game' ||
              action === 'open_lan_session' ||
              action === 'open_quests'
            ) {
              this.state.pauseBackground = null;
              while (this._frontStack.length > 0) {
                this._frontStack.pop()!.close();
              }
            }
            fa.close();
          }

          this._openFrontView(action, view);
          this._frontActive = view;
          this._active = view;
          return;
        }
      }
    }

    // Menu active — process menu actions
    if (this._menuActive) {
      let action: string | null = this._menu.takeAction();
      if (action === null) {
        action = this._autoLanStartAction();
      }

      if (action === 'quit_app') {
        this.state.quitRequested = true;
        return;
      }

      if (action === 'start_demo') {
        const demo = this._ensureDemo();
        if (demo === null) return;
        this._menu.close();
        this._menuActive = false;
        demo.open();
        this._active = demo;
        this._demoActive = true;
        return;
      }

      if (action === 'quit_after_demo') {
        const demo = this._ensureDemo();
        if (demo === null) return;
        this._menu.close();
        this._menuActive = false;
        this._quitAfterDemo = true;
        demo.open();
        this._active = demo;
        this._demoActive = true;
        return;
      }

      if (action !== null) {
        action = this._resolveLanAction(action);
        if (action === null) return;

        const view = this._frontViews[action] ?? null;
        if (view !== null) {
          this._menu.close();
          this._menuActive = false;
          this._openFrontView(action, view);
          this._frontActive = view;
          this._active = view;
          return;
        }
      }
    }

    // Auto-transition: boot -> demo (if demo build)
    if (
      !this._demoActive &&
      !this._menuActive &&
      this._frontActive === null &&
      this.state.demoEnabled &&
      this._boot.isThemeStarted()
    ) {
      const demo = this._ensureDemo();
      if (demo !== null) {
        demo.open();
        this._active = demo;
        this._demoActive = true;
        return;
      }
    }

    // Demo finished -> menu
    if (this._demoActive && !this._menuActive && this._demo !== null && this._demo.isFinished()) {
      this._demo.close();
      this._demoActive = false;
      if (this._quitAfterDemo) {
        this._quitAfterDemo = false;
        this.state.quitRequested = true;
        return;
      }
      ensureMenuGround(this._ctx, this.state, true);
      this._menu.open();
      this._active = this._menu;
      this._menuActive = true;
      return;
    }

    // Boot finished, no demo -> menu
    if (
      !this._demoActive &&
      !this._menuActive &&
      this._frontActive === null &&
      this._boot.isThemeStarted()
    ) {
      this._menu.open();
      this._active = this._menu;
      this._menuActive = true;
    }

    // Console quit
    if (con.quitRequested) {
      this.state.quitRequested = true;
      con.quitRequested = false;
    }
  }

  // -----------------------------------------------------------------------
  // Statistics / playtime
  // -----------------------------------------------------------------------

  private _tickStatisticsPlaytime(dt: number): void {
    if (this.state.demoEnabled) return;
    if (this._gameplayScreen(this._frontActive) === null) return;
    const deltaMs = (dt * 1000.0) | 0;
    if (deltaMs <= 0) return;
    this._status.gameSequenceId = (this._status.gameSequenceId + deltaMs) | 0;
  }

  // -----------------------------------------------------------------------
  // Console sync
  // -----------------------------------------------------------------------

  private _syncConsoleElapsedMs(): void {
    const views: Screen[] = [];
    if (this._frontActive !== null) views.push(this._frontActive);
    if (this._frontStack.length > 0) {
      for (let i = this._frontStack.length - 1; i >= 0; i--) {
        views.push(this._frontStack[i]);
      }
    }
    for (const view of views) {
      const gameplay = this._gameplayScreen(view);
      if (gameplay !== null) {
        this.state.survivalElapsedMs = Math.max(0.0, gameplay.consoleElapsedMs());
        return;
      }
    }
  }

  private _handleConsoleRequests(): void {
    if (this.state.terrainRegenerateRequested) {
      this.state.terrainRegenerateRequested = false;
      this._regenerateTerrainForConsole();
    }
  }

  private _regenerateTerrainForConsole(): void {
    ensureMenuGround(this._ctx, this.state, true);
    const views: Screen[] = [];
    if (this._frontActive !== null) views.push(this._frontActive);
    if (this._frontStack.length > 0) {
      for (let i = this._frontStack.length - 1; i >= 0; i--) {
        views.push(this._frontStack[i]);
      }
    }
    for (const view of views) {
      const gameplay = this._gameplayScreen(view);
      if (gameplay !== null) {
        gameplay.regenerateTerrainForConsole();
        return;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Demo trial overlay
  // -----------------------------------------------------------------------

  private _updateDemoTrialOverlay(dt: number): boolean {
    if (!this.state.demoEnabled) return false;
    const gameplay = this._gameplayScreen(this._frontActive);

    const modeRaw = this.state.config.gameplay.mode;
    let modeId: GameMode;
    if (Object.values(GameMode).includes(modeRaw as GameMode)) {
      modeId = modeRaw as GameMode;
    } else {
      modeId = GameMode.DEMO;
    }

    let questLevel = null;
    if (modeId === GameMode.QUESTS) {
      questLevel = this.state.pendingQuestLevel;
    }

    const current = demoTrialOverlayInfo({
      demoBuild: true,
      gameModeId: modeId,
      globalPlaytimeMs: this._status.gameSequenceId | 0,
      questGraceElapsedMs: this.state.demoTrialElapsedMs | 0,
      questLevel,
    });

    const frameDt = Math.min(dt, 0.1);
    const dtMs = (frameDt * 1000.0) | 0;
    const [usedMs, graceMs] = tickDemoTrialTimers({
      demoBuild: true,
      gameModeId: modeId,
      overlayVisible: current.visible,
      globalPlaytimeMs: this._status.gameSequenceId | 0,
      questGraceElapsedMs: this.state.demoTrialElapsedMs | 0,
      dtMs: dtMs | 0,
    });

    if (usedMs !== (this._status.gameSequenceId | 0)) {
      this._status.gameSequenceId = usedMs | 0;
    }
    this.state.demoTrialElapsedMs = graceMs | 0;

    const info = demoTrialOverlayInfo({
      demoBuild: true,
      gameModeId: modeId,
      globalPlaytimeMs: this._status.gameSequenceId | 0,
      questGraceElapsedMs: this.state.demoTrialElapsedMs | 0,
      questLevel,
    });
    this._demoTrialInfo = info;

    if (!info.visible) return false;

    if (gameplay !== null) {
      gameplay.prepareDemoTrialOverlayFrame();
    }

    const overlayView = this._demoTrialOverlayView();
    if (overlayView === null) return false;
    const [mouseX, mouseY] = InputState.mousePosition();
    const click = InputState.wasMouseButtonPressed(0);
    // TODO: pass actual screen dimensions once ctx is wired
    const screenW = this._ctx.screenWidth || 1024;
    const screenH = this._ctx.screenHeight || 768;
    const action = overlayView.update(this._ctx, dtMs, screenW, screenH, mouseX, mouseY, click);
    if (action === 'purchase') {
      this.state.quitRequested = true;
      try {
        window.open(DEMO_PURCHASE_URL, '_blank');
      } catch {
        this.state.console.log.log('demo trial: failed to open purchase URL');
      }
      return true;
    }

    if (InputState.wasKeyPressed(KEY_ESCAPE) || action === 'maybe_later') {
      this._captureGameplayGroundForMenu();
      if (this._frontActive !== null) {
        this._frontActive.close();
        this._frontActive = null;
      }
      while (this._frontStack.length > 0) {
        this._frontStack.pop()!.close();
      }
      this._menu.open();
      this._active = this._menu;
      this._menuActive = true;
      return true;
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Gameplay screen detection
  // -----------------------------------------------------------------------

  private _gameplayScreen(view: Screen | null): GameplayScreen | null {
    if (view === null) return null;
    if (isGameplayScreen(view)) return view;
    return null;
  }

  // -----------------------------------------------------------------------
  // Front view management
  // -----------------------------------------------------------------------

  private _openFrontView(action: string, view: Screen): void {
    const gameplay = this._gameplayScreen(view);
    if (gameplay !== null) {
      this._openGameplayScreen(gameplay);
    } else {
      view.open();
    }
    this._maybeAdoptMenuGround(action);
  }

  private _maybeAdoptMenuGround(_action: string): void {
    // Native game always regenerates terrain on gameplay start;
    // menu terrain should carry back to menu but not into gameplay.
    // No-op: terrain management is handled in _openGameplayScreen.
  }

  private _openGameplayScreen(gameplay: GameplayScreen): void {
    if (this.state.screenFadeRamp) {
      this.state.screenFadeAlpha = 1.0;
    }
    this.state.screenFadeRamp = false;

    if (gameplay instanceof QuestMode) {
      this.state.questOutcome = null;
    }

    if (this.state.audio !== null) {
      // Original game: entering gameplay cuts the menu theme
      audioStopMusic(this.state.audio);
    }

    // Configure LAN runtime — no-op in WebGL single-player
    this._configureLanRuntime(gameplay);

    gameplay.bindStatus(this._status);
    gameplay.bindAudio(this.state.audio, this.state.rng);
    gameplay.setRtxMode(this.state.rtxMode);
    gameplay.bindScreenFade(this.state);
    gameplay.open();

    if (gameplay instanceof QuestMode) {
      this._prepareQuestRun(gameplay);
    }
  }

  /** Configure LAN runtime on a gameplay screen — no-op in WebGL. */
  private _configureLanRuntime(gameplay: GameplayScreen): void {
    gameplay.setLanRuntime({
      enabled: false,
      role: '',
      expectedPlayers: 1,
      connectedPlayers: 1,
      waitingForPlayers: false,
    });
    gameplay.bindLanRuntime(null);
  }

  private _prepareQuestRun(gameplay: QuestMode): void {
    const level = this.state.pendingQuestLevel;
    if (level === null) return;
    if (typeof gameplay.startRun === 'function') {
      gameplay.startRun(level, this._status);
    }
  }

  private _resolveGameplayAction(
    gameplay: GameplayScreen,
    action: string | null,
  ): string | null {
    if (action === 'open_high_scores') {
      this.state.pendingHighScores = {
        gameModeId: gameplay.defaultGameModeId,
        questLevel: null,
        highlightRank: null,
      };
      return action;
    }

    if (action === 'back_to_menu') {
      gameplay.closeRequested = false;
      return action;
    }

    if (action !== null) return action;

    if (!gameplay.closeRequested) return null;
    gameplay.closeRequested = false;

    if (gameplay instanceof QuestMode) {
      if (typeof gameplay.consumeOutcome === 'function') {
        const outcome = gameplay.consumeOutcome();
        if (outcome !== null) {
          this.state.questOutcome = outcome;
          if (outcome.kind === 'completed') return 'quest_results';
          if (outcome.kind === 'failed') return 'quest_failed';
        }
      }
      return 'back_to_menu';
    }

    return 'back_to_menu';
  }

  // -----------------------------------------------------------------------
  // RTX mode sync
  // -----------------------------------------------------------------------

  private _setRtxMode(mode: RtxRenderMode, source: string): void {
    if (mode === this.state.rtxMode) return;
    this.state.rtxMode = mode;
    this._syncRtxMode();
    this.state.console.log.log(`render mode: ${mode} (${source})`);
  }

  private _syncRtxMode(): void {
    const views: Screen[] = [];
    if (this._frontActive !== null) views.push(this._frontActive);
    if (this._frontStack.length > 0) {
      views.push(...this._frontStack);
    }
    for (const view of views) {
      const gameplay = this._gameplayScreen(view);
      if (gameplay !== null) {
        gameplay.setRtxMode(this.state.rtxMode);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Menu ground capture
  // -----------------------------------------------------------------------

  private _stealGroundFromView(view: Screen | null): GroundRenderer | null {
    const gameplay = this._gameplayScreen(view);
    if (gameplay === null) return null;
    const ground = gameplay.stealGroundForMenu();
    if (ground !== null) return ground;
    return null;
  }

  private _menuGroundCameraFromView(view: Screen | null): Vec2 | null {
    const gameplay = this._gameplayScreen(view);
    if (gameplay === null) return null;
    const camera = gameplay.menuGroundCamera();
    if (camera instanceof Vec2) return camera;
    return null;
  }

  private _replaceMenuGround(ground: GroundRenderer, camera: Vec2 | null): void {
    const previous = this.state.menuGround;
    if (previous === ground) {
      this.state.menuGroundCamera = camera;
      return;
    }
    // In WebGL, render target cleanup is handled by the GL context;
    // no explicit unload_render_texture needed.
    this.state.menuGround = ground;
    this.state.menuGroundCamera = camera;
  }

  private _captureGameplayGroundForMenu(): void {
    let ground: GroundRenderer | null = null;
    let camera: Vec2 | null = null;

    if (this._gameplayScreen(this._frontActive) !== null) {
      camera = this._menuGroundCameraFromView(this._frontActive);
      ground = this._stealGroundFromView(this._frontActive);
    }

    if (ground === null) {
      for (let i = this._frontStack.length - 1; i >= 0; i--) {
        const view = this._frontStack[i];
        if (this._gameplayScreen(view) !== null) {
          camera = this._menuGroundCameraFromView(view);
          ground = this._stealGroundFromView(view);
          if (ground !== null) break;
        }
      }
    }

    if (ground === null) return;
    this._replaceMenuGround(ground, camera);
  }

  // -----------------------------------------------------------------------
  // Draw
  // -----------------------------------------------------------------------

  private _drawSceneLayers(): void {
    this._active.draw(this._ctx);
    const info = this._demoTrialInfo;
    if (info !== null && info.visible) {
      const screenW = this._ctx.screenWidth || 1024;
      const screenH = this._ctx.screenHeight || 768;
      const [mouseX, mouseY] = InputState.mousePosition();
      this._demoTrialOverlayView()?.draw(this._ctx, info, screenW, screenH, mouseX, mouseY);
    }
    // Console draw is handled by the console's own draw method
    // which requires ctx — deferred to the caller or the console itself.
    // state.console.draw(ctx, null, null);
    // state.console.drawFpsCounter(ctx);
  }

  private _drawWithGamma(): void {
    const gammaGain = Math.max(0.0, this.state.gammaRamp);
    if (Math.abs(gammaGain - 1.0) <= 1e-6) {
      this._drawSceneLayers();
      return;
    }

    // TODO: When gamma ramp shader is wired up, wrap _drawSceneLayers in
    // a shader pass. For now, draw without gamma correction.
    this._drawSceneLayers();
  }

  draw(): void {
    this._drawWithGamma();
  }

  // -----------------------------------------------------------------------
  // Close / cleanup
  // -----------------------------------------------------------------------

  close(): void {
    if (this._menuActive) {
      this._menu.close();
    }
    if (this._frontActive !== null) {
      this._frontActive.close();
    }
    while (this._frontStack.length > 0) {
      this._frontStack.pop()!.close();
    }
    if (this._demoActive && this._demo !== null) {
      this._demo.close();
    }
    const overlay = this._demoTrialOverlay;
    if (overlay !== null) {
      overlay.close();
    }
    // Menu ground render target cleanup — handled by GL context in WebGL
    this.state.menuGround = null;
    this.state.menuGroundCamera = null;
    this._boot.close();
    // Console cleanup
    // state.console.close() — no explicit close needed in WebGL
  }
}
