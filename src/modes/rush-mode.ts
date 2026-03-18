// Port of crimson/modes/rush_mode.py

import { type WebGLContext } from '../engine/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '../engine/assets.ts';
import { type AudioState } from '../engine/audio.ts';
import { type CrimsonConfig } from '../engine/config.ts';
import { type ConsoleState } from '../engine/console.ts';
import { Vec2 } from '../engine/geom.ts';
import { InputState } from '../engine/input.ts';
import { Crand } from '../engine/rand.ts';

import { GameMode } from '../game/game-modes.ts';
import {
  DeterministicSession,
  type DeterministicSessionTick,
  RushSpawnState,

} from '../game/sim/sessions.ts';
import { buildRushSession, enforceRushLoadout } from '../game/sim/session-builders.ts';
import { advanceUnlockTerrain } from '../game/sim/bootstrap.ts';

import { drawMenuCursor } from '../ui/cursor.ts';
import { drawHudOverlay, hudFlagsForGameMode } from '../ui/hud.ts';

import {
  BaseGameplayMode,
  type GameStatus,
  type LanSession,
  type LanStepAction,
} from './base-gameplay-mode.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORLD_SIZE = 1024.0;

const UI_TEXT_SCALE = 1.0;
const UI_TEXT_COLOR: [number, number, number, number] = [220 / 255, 220 / 255, 220 / 255, 1.0];
const UI_HINT_COLOR: [number, number, number, number] = [140 / 255, 140 / 255, 140 / 255, 1.0];
const UI_ERROR_COLOR: [number, number, number, number] = [240 / 255, 80 / 255, 80 / 255, 1.0];

// ---------------------------------------------------------------------------
// RushMode
// ---------------------------------------------------------------------------

export class RushMode extends BaseGameplayMode {
  private _spawnState = new RushSpawnState();
  protected _simSession: DeterministicSession | null = null;

  constructor(opts: {
    gl: WebGLContext;
    config: CrimsonConfig;
    console?: ConsoleState | null;
    audio?: AudioState | null;
    audioRng: Crand;
  }) {
    super({
      gl: opts.gl,
      worldSize: WORLD_SIZE,
      defaultGameModeId: GameMode.RUSH,
      demoModeActive: false,
      questFailRetryCount: 0,
      hardcore: false,
      config: opts.config,
      console: opts.console ?? null,
      audio: opts.audio ?? null,
      audioRng: opts.audioRng,
    });
    this._simSession = this._newSimSession();
  }

  // ---------------------------------------------------------------------------
  // Session builder
  // ---------------------------------------------------------------------------

  private _newSimSession(): DeterministicSession {
    const [session, spawnState] = buildRushSession({
      world: this.simWorld.worldState,
      worldSize: this.worldSize,
      damageScaleByType: this.simWorld.damageScaleByType,
      detailPreset: 5,
      violenceDisabled: 0,
      gameTuneStarted: this.simWorld.gameTuneStarted,
      finalizePostRenderLifecycle: true,
    });
    this._spawnState = spawnState;
    return session;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  open(): void {
    super.open();
    this._resetGameplayFrameClock();
    this._resetLanCaptureClock();

    const status = this.state.status as GameStatus | null;
    const baseStatus = this.saveStatus;
    const simUnlockIndex = status != null ? (status.questUnlockIndex ?? 0) : 0;
    const questUnlockIndex = simUnlockIndex | 0;

    const terrain = advanceUnlockTerrain(
      this.state.rng,
      questUnlockIndex,
      this.worldSize | 0,
      this.worldSize | 0,
    );
    this.applyTerrainSetup({ terrainSlots: terrain.terrainSlots, seed: terrain.terrainSeed });
    this.simWorld.state.rng.srand(this.state.rng.state | 0);

    this._simSession = this._newSimSession();
    enforceRushLoadout(this.simWorld.worldState);
  }

  close(): void {
    this._simSession = null;
    super.close();
  }

  // ---------------------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------------------

  protected _handleInput(): void {
    if (this._gameOverActive) {
      if (InputState.wasKeyPressed(27)) { // Escape
        this._action = 'back_to_menu';
        this.closeRequested = true;
      }
      return;
    }

    if (!this._lanEnabled && InputState.wasKeyPressed(9)) { // Tab
      this._paused = !this._paused;
    }

    if (InputState.wasKeyPressed(27)) { // Escape
      this._action = 'open_pause_menu';
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Game over
  // ---------------------------------------------------------------------------

  protected _enterGameOver(): void {
    if (this._gameOverActive) return;

    const gameModeId = this.config.gameplay.mode;
    const record = this._buildHighscoreRecordForGameOver({
      survivalElapsedMs: this._sessionElapsedMs() | 0,
      creatureKillCount: this.creatures.killCount | 0,
      gameModeId,
    });

    this._gameOverRecord = record;
    this._gameOverUi.open();
    this._gameOverActive = true;
    this._saveReplay();
  }

  // ---------------------------------------------------------------------------
  // Replay helpers
  // ---------------------------------------------------------------------------

  protected _replayCheckpointElapsedMs(): number {
    return this._sessionElapsedMs();
  }

  protected _replayClaimedStatsComplete(): boolean {
    return this._gameOverActive;
  }

  protected _replayClaimedStatsElapsedMs(): number {
    return this._sessionElapsedMs() | 0;
  }

  protected _replayOutputBasename(opts: { stamp: string; replay: unknown }): string {
    const stamp = opts.stamp;
    const kills = this.creatures.killCount | 0;
    return `rush_${stamp}_kills${kills}`;
  }

  // ---------------------------------------------------------------------------
  // LAN helpers
  // ---------------------------------------------------------------------------

  protected _lanModeName(): 'survival' | 'rush' | 'quests' {
    return 'rush';
  }

  protected _lanMatchSession(): DeterministicSession | null {
    return this._simSession;
  }

  protected _lanPrepareFrame(
    _role: string,
    _dtUiMs: number,
    session: LanSession,
    _dtTick: number,
  ): boolean {
    session.detailPreset = this._deterministicDetailPreset();
    session.violenceDisabled = this._deterministicViolenceDisabled();
    return true;
  }

  protected _lanOnTickApplied(
    tick: DeterministicSessionTick,
    frameTick: number | null,
    _dtTick: number,
  ): LanStepAction {
    const elapsedMs = this._sessionElapsedMs();
    const spawnCooldownMs = this._spawnState.spawnCooldownMs;

    if (frameTick !== null) {
      this._storeNetRuntimeSnapshot({
        tickIndex: frameTick,
        elapsedMs,
        spawnCooldownMs,
        killCount: this.creatures.killCount | 0,
      });
    }

    if (!this._anyPlayerAlive()) {
      this._enterGameOver();
      return 'stop_after_finalize';
    }
    return 'continue';
  }

  // ---------------------------------------------------------------------------
  // Resync snapshot
  // ---------------------------------------------------------------------------

  protected _applyResyncSnapshot(snapshot: unknown): void {
    const rs = snapshot as {
      elapsedMs: number;
      spawnCooldownMs: number;
      killCount: number;
    };
    if (this._simSession !== null) {
      this._simSession.elapsedMs = rs.elapsedMs;
    }
    this._spawnState.spawnCooldownMs = rs.spawnCooldownMs;
    this.creatures.killCount = rs.killCount;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const frame = this._beginModeUpdate(dt);
    if (frame === null) return;

    if (this._gameOverActive) {
      this._updateGameOverUi(frame.dt);
      return;
    }

    if (this._lanEnabled && this._lanRuntime !== null) {
      this._updateLanMatch({ dt: frame.dt, dtUiMs: 0.0 });
      return;
    }

    const anyAlive = this._anyPlayerAlive();
    const simDt = (!this._paused && anyAlive) ? frame.dt : 0.0;
    const session = this._simSession;

    if (this._lanWaitGateActive()) {
      this._resetGameplayFrameClock();
      return;
    }
    if (simDt <= 0.0) {
      this._resetGameplayFrameClock();
      if (!anyAlive) {
        this._enterGameOver();
      }
      return;
    }
    if (session === null) return;

    const tickDt = this._gameplayTickDt({ session });

    const onTick = (tick: DeterministicSessionTick, _tickIndex: number | null): boolean => {
      const action = this._lanOnTickApplied(tick, null, tickDt);
      return action !== 'continue';
    };

    const onCheckpoint = (tickIndex: number, tick: DeterministicSessionTick): void => {
      this._recordReplayCheckpointFromTick({ tickIndex, tick });
    };

    this._runDeterministicSessionTicks({
      dtFrame: simDt,
      session,
      recorder: this._replayRecorder,
      onTick,
      onCheckpoint,
    });
  }

  // ---------------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------------

  private _drawGameCursor(ctx: WebGLContext): void {
    const resources = this.renderResources.resources as RuntimeResources;
    const mousePos = this._uiMouse;
    drawMenuCursor(
      ctx,
      getTexture(resources, TextureId.PARTICLES),
      getTexture(resources, TextureId.UI_CURSOR),
      mousePos,
      this._cursorPulseTime,
    );
  }

  draw(ctx: WebGLContext): void {
    this._drawWorld({
      drawAimIndicators: !this._gameOverActive,
      entityAlpha: this._worldEntityAlpha(),
    });
    this._drawScreenFade(ctx);

    let hudBottom = 0.0;
    if (!this._gameOverActive) {
      const hudFlags = hudFlagsForGameMode(this._configGameModeId());

      this._drawTargetHealthBar(ctx);
      hudBottom = drawHudOverlay(ctx, {
        resources: this.renderResources.resources as RuntimeResources,
        state: this._hudState,
        font: this._small,
        alpha: 1.0,
        showHealth: hudFlags.showHealth,
        showWeapon: hudFlags.showWeapon,
        showXp: hudFlags.showXp,
        showTime: hudFlags.showTime,
        showQuestHud: hudFlags.showQuestHud,
        smallIndicators: this._hudSmallIndicators(),
      }, {
        player: this.player,
        players: this.simWorld.players,
        bonusHud: this.state.bonusHud,
        elapsedMs: this._sessionElapsedMs(),
        frameDtMs: this._lastDtMs,
      });
    }

    if (this._debugEnabled && !this._gameOverActive) {
      const x = 18.0;
      const y = Math.max(18.0, hudBottom + 10.0);
      const line = this._uiLineHeight();

      this._drawUiText(
        ctx,
        `rush: t=${(this._sessionElapsedMs() / 1000.0).toFixed(1)}s`,
        new Vec2(x, y),
        UI_TEXT_COLOR,
      );
      this._drawUiText(
        ctx,
        `kills=${this.creatures.killCount}`,
        new Vec2(x, y + line),
        UI_HINT_COLOR,
      );
      let yExtra = y + line * 2.0;
      if (this._paused) {
        this._drawUiText(ctx, 'paused (TAB)', new Vec2(x, yExtra), UI_HINT_COLOR);
        yExtra += line;
      }
      if (this.player.health <= 0.0) {
        this._drawUiText(ctx, 'game over', new Vec2(x, yExtra), UI_ERROR_COLOR);
        yExtra += line;
      }
      this._drawLanDebugInfo(ctx, { x, y: yExtra, lineH: line });
    }

    if (this._gameOverActive) {
      this._drawGameCursor(ctx);
      if (this._gameOverRecord !== null) {
        this._gameOverUi.draw(ctx, {
          record: this._gameOverRecord,
          bannerKind: this._gameOverBanner,
          resources: this.renderResources.resources as RuntimeResources,
          mouse: this._uiMousePos(),
        });
      }
    }
    this._drawLanWaitOverlay(ctx);
  }
}
