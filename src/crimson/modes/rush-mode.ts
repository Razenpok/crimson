// Port of crimson/modes/rush_mode.py

import * as wgl from '@wgl';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { type AudioState } from '@grim/audio.ts';
import { type CrimsonConfig } from '@grim/config.ts';
import { type ConsoleState } from '@grim/console.ts';
import { Vec2 } from '@grim/geom.ts';
import { InputState } from '@grim/input.ts';
import { Crand } from '@grim/rand.ts';

import { GameMode } from '@crimson/game-modes.ts';
import {
  DeterministicSession,
  type DeterministicSessionTick,
  RushSpawnState,

} from '@crimson/sim/sessions.ts';
import { buildRushSession, enforceRushLoadout } from '@crimson/sim/session-builders.ts';
import { advanceUnlockTerrain } from '@crimson/sim/bootstrap.ts';

import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { drawHudOverlay, hudFlagsForGameMode } from '@crimson/ui/hud.ts';

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
const UI_TEXT_COLOR = wgl.makeColor(220 / 255, 220 / 255, 220 / 255, 1.0);
const UI_HINT_COLOR = wgl.makeColor(140 / 255, 140 / 255, 140 / 255, 1.0);
const UI_ERROR_COLOR = wgl.makeColor(240 / 255, 80 / 255, 80 / 255, 1.0);

// ---------------------------------------------------------------------------
// RushMode
// ---------------------------------------------------------------------------

export class RushMode extends BaseGameplayMode {
  private _spawnState = new RushSpawnState();
  protected _simSession: DeterministicSession | null = null;

  constructor(opts: {
    config: CrimsonConfig;
    console?: ConsoleState | null;
    audio?: AudioState | null;
    audioRng: Crand;
  }) {
    super({
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
    const questUnlockIndex = int(simUnlockIndex);

    const terrain = advanceUnlockTerrain(
      this.state.rng,
      { unlockIndex: questUnlockIndex, width: int(this.worldSize), height: int(this.worldSize) },
    );
    this.applyTerrainSetup({ terrainSlots: terrain.terrainSlots, seed: terrain.terrainSeed });
    this.simWorld.state.rng.srand(int(this.state.rng.state));

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
      survivalElapsedMs: int(this._sessionElapsedMs()),
      creatureKillCount: int(this.creatures.killCount),
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
    return int(this._sessionElapsedMs());
  }

  protected _replayOutputBasename(opts: { stamp: string; replay: unknown }): string {
    const stamp = opts.stamp;
    const kills = int(this.creatures.killCount);
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
        killCount: int(this.creatures.killCount),
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

  private _drawGameCursor(): void {
    const resources = this.renderResources.resources as RuntimeResources;
    const mousePos = this._uiMouse;
    drawMenuCursor(
      getTexture(resources, TextureId.PARTICLES),
      getTexture(resources, TextureId.UI_CURSOR),
      { pos: mousePos, pulseTime: this._cursorPulseTime },
    );
  }

  draw(): void {
    this._drawWorld({
      drawAimIndicators: !this._gameOverActive,
      entityAlpha: this._worldEntityAlpha(),
    });
    this._drawScreenFade();

    let hudBottom = 0.0;
    if (!this._gameOverActive) {
      const hudFlags = hudFlagsForGameMode(this._configGameModeId());

      this._drawTargetHealthBar();
      hudBottom = drawHudOverlay({
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
        `rush: t=${(this._sessionElapsedMs() / 1000.0).toFixed(1)}s`,
        new Vec2(x, y),
        UI_TEXT_COLOR,
      );
      this._drawUiText(
        `kills=${this.creatures.killCount}`,
        new Vec2(x, y + line),
        UI_HINT_COLOR,
      );
      let yExtra = y + line * 2.0;
      if (this._paused) {
        this._drawUiText('paused (TAB)', new Vec2(x, yExtra), UI_HINT_COLOR);
        yExtra += line;
      }
      if (this.player.health <= 0.0) {
        this._drawUiText('game over', new Vec2(x, yExtra), UI_ERROR_COLOR);
        yExtra += line;
      }
      this._drawLanDebugInfo({ x, y: yExtra, lineH: line });
    }

    if (this._gameOverActive) {
      this._drawGameCursor();
      if (this._gameOverRecord !== null) {
        this._gameOverUi.draw({
          record: this._gameOverRecord,
          bannerKind: this._gameOverBanner,
          resources: this.renderResources.resources as RuntimeResources,
          mouse: this._uiMousePos(),
        });
      }
    }
    this._drawLanWaitOverlay();
  }
}
