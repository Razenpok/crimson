// Port of crimson/modes/typo_mode.py

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

} from '@crimson/sim/sessions.ts';
import { buildTypoSession } from '@crimson/sim/session-builders.ts';
import { advanceUnlockTerrain } from '@crimson/sim/bootstrap.ts';
import {
  TypoCharCommand,
  TypoBackspaceCommand,
  TypoSubmitCommand,
} from '@crimson/sim/input-providers.ts';

import { typoShotCounts } from '@crimson/typo/state.ts';
import { buildTypoPlayerInput } from '@crimson/typo/player.ts';
import { PlayerInput } from '@crimson/sim/input.ts';
import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { drawHudOverlay, hudFlagsForGameMode } from '@crimson/ui/hud.ts';
import { drawTypingBox, drawTypoNameLabels } from '@crimson/ui/overlays/typo-run.ts';

import {
  BaseGameplayMode,
  type GameStatus,
} from './base-gameplay-mode.ts';
import { buildHighscoreRecordForGameOver } from './components/highscore-record-builder.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORLD_SIZE = 1024.0;

// ---------------------------------------------------------------------------
// TypoShooterMode
// ---------------------------------------------------------------------------

export class TypoShooterMode extends BaseGameplayMode {
  constructor(opts: {
    config: CrimsonConfig;
    console?: ConsoleState | null;
    audio?: AudioState | null;
    audioRng: Crand;
  }) {
    super({
      worldSize: WORLD_SIZE,
      defaultGameModeId: GameMode.TYPO,
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
    const typo = this.state.typo;
    return buildTypoSession({
      world: this.simWorld.worldState,
      worldSize: this.worldSize,
      damageScaleByType: this.simWorld.damageScaleByType,
      detailPreset: 5,
      violenceDisabled: 0,
      gameTuneStarted: this.simWorld.gameTuneStarted,
      dictionaryWords: typo != null ? (typo.dictionaryWords ?? []) : [],
      highscoreNames: typo != null ? (typo.highscoreNames ?? []) : [],
    });
  }

  // ---------------------------------------------------------------------------
  // Player count
  // ---------------------------------------------------------------------------

  protected _runtimePlayerCount(): number {
    return 1;
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

  protected _replayClaimedShots(): [number, number] {
    return this._typoShotCounts();
  }

  protected _replayOutputBasename(opts: { stamp: string; replay: unknown }): string {
    const stamp = opts.stamp;
    const score = int(this.player.experience);
    return `typo_${stamp}_score${score}`;
  }

  // ---------------------------------------------------------------------------
  // Typo shot counts
  // ---------------------------------------------------------------------------

  private _typoShotCounts(): [number, number] {
    const typo = this.state.typo;
    if (typo == null) return [0, 0];
    return typoShotCounts(typo);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  open(): void {
    super.open();

    // In the WebGL port, typo dictionary and highscore names are loaded
    // externally and set on state.typo before open() is called, or are
    // empty tuples if not available.  The native code loads from disk here;
    // we skip the file I/O and rely on the pre-populated state.

    const status = this.state.status as GameStatus | null;
    const questUnlockIndex = status !== null ? int(status.questUnlockIndex) : 0;

    const terrain = advanceUnlockTerrain(
      this.state.rng,
      { unlockIndex: questUnlockIndex, width: int(this.worldSize), height: int(this.worldSize) },
    );
    this.applyTerrainSetup({ terrainSlots: terrain.terrainSlots, seed: terrain.terrainSeed });
    this.simWorld.state.rng.srand(int(this.state.rng.state));

    this._simSession = this._newSimSession();
    this._replayRecorder = null; // WebGL: no file-based replay recording
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

    if (InputState.wasKeyPressed(9)) { // Tab
      this._paused = !this._paused;
    }

    if (InputState.wasKeyPressed(27)) { // Escape
      this._action = 'open_pause_menu';
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Typing commands
  // ---------------------------------------------------------------------------

  private _enqueueTypingCommands(): void {
    // Enter / KP Enter → submit
    const enterPressed = InputState.wasKeyPressed(13) || InputState.wasKeyPressed(0x100D);
    const typo = this.state.typo;
    if (enterPressed && typo != null && typo.typing != null && typo.typing.text) {
      this.enqueueInputCommand(new TypoSubmitCommand(0));
    }

    // Backspace (including key-repeat)
    if (InputState.wasKeyPressed(8) || InputState.wasKeyPressedRepeat(8)) {
      this.enqueueInputCommand(new TypoBackspaceCommand(0));
    } else {
      // Character input — poll one codepoint per frame
      const codepoint = InputState.getCharPressed();
      if (codepoint !== 13 && codepoint !== 8 && codepoint >= 0x20 && codepoint <= 0xFF) {
        const ch = String.fromCharCode(codepoint);
        if (ch) {
          this.enqueueInputCommand(new TypoCharCommand(0, ch[0]));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Game over
  // ---------------------------------------------------------------------------

  protected _enterGameOver(): void {
    if (this._gameOverActive) return;

    const [shotsFired, shotsHit] = this._typoShotCounts();
    const record = buildHighscoreRecordForGameOver({
      state: this.state,
      player: this.player,
      survivalElapsedMs: int(this._sessionElapsedMs()),
      creatureKillCount: int(this.creatures.killCount),
      gameModeId: GameMode.TYPO,
      shotsFired,
      shotsHit,
      clampShotsHit: false,
    });

    this._gameOverRecord = record;
    this._gameOverUi.open();
    this._gameOverActive = true;
    this._saveReplay();
  }

  // ---------------------------------------------------------------------------
  // Build local inputs
  // ---------------------------------------------------------------------------

  protected _buildLocalInputs(_opts: { dt: number }): PlayerInput[] {
    const aim = this.screenToWorld(this._uiMouse);
    return [buildTypoPlayerInput({ aim, fireRequested: false, reloadRequested: false })];
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this._updateAudio(dt);

    const [frameDt] = this._tickFrame(dt);
    this._handleInput();
    if (this._action === 'open_pause_menu') return;

    if (this._gameOverActive) {
      this._updateGameOverUi(frameDt);
      return;
    }

    const dtWorld = this._paused ? 0.0 : frameDt;

    // Native: delay game-over transition until the trooper death animation
    // finishes (checks death_timer < 0.0 in the main gameplay loop).
    if (this.player.health <= 0.0) {
      if (dtWorld > 0.0) {
        this.player.deathTimer -= dtWorld * 20.0;
      }
      if (this.player.deathTimer < 0.0) {
        this._enterGameOver();
        this._updateGameOverUi(frameDt);
        return;
      }
      return;
    }

    if (dtWorld > 0.0) {
      this._enqueueTypingCommands();
    }

    if (dtWorld <= 0.0) return;

    const session = this._simSession;
    if (session === null) return;

    this._runDeterministicSessionTicks({
      dtFrame: dtWorld,
      session,
      recorder: this._replayRecorder,
      onTick: (_tick: DeterministicSessionTick, _tickIndex: number | null) => false,
      onCheckpoint: (tickIndex: number, tick: DeterministicSessionTick) => {
        this._recordReplayCheckpointFromTick({ tickIndex, tick });
      },
    });
    // Death/game-over flow is handled at the start of the next frame so the
    // trooper death animation can play before the UI slides in.
  }

  // ---------------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------------

  draw(): void {
    const alive = this.player.health > 0.0;
    const showGameplayUi = alive && !this._gameOverActive;

    this._drawWorld({
      drawAimIndicators: showGameplayUi,
      entityAlpha: this._worldEntityAlpha(),
    });
    this._drawScreenFade();

    if (showGameplayUi) {
      this._drawNameLabels();
    }

    if (showGameplayUi) {
      const hudFlags = hudFlagsForGameMode(this._configGameModeId());
      this._drawTargetHealthBar();
      drawHudOverlay({
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

    if (showGameplayUi) {
      this._drawTypingBox();
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
  }

  // ---------------------------------------------------------------------------
  // Draw helpers
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

  private _drawNameLabels(): void {
    const typo = this.state.typo;
    if (typo == null || typo.names == null) return;
    drawTypoNameLabels({
      creatures: this.creatures.entries,
      names: typo.names.names ?? [],
      worldToScreen: (worldPos: Vec2) => this.worldToScreen(worldPos),
      drawText: (text: string, pos: Vec2, color: wgl.Color, scale: number) =>
        this._drawUiText(text, pos, color, scale),
      measureTextWidth: (text: string, scale: number) => this._uiTextWidth(text, scale),
    });
  }

  private _drawTypingBox(): void {
    const typo = this.state.typo;
    if (typo == null || typo.typing == null) return;
    const screenH = wgl.getScreenHeight();
    const panelTexture = getTexture(this.renderResources.resources as RuntimeResources, TextureId.UI_IND_PANEL);
    if (panelTexture === null) return;
    drawTypingBox(
      screenH,
      panelTexture,
      {
        text: typo.typing.text ?? '',
        cursorPulseTime: this._cursorPulseTime,
        drawText: (text: string, pos: Vec2, color: wgl.Color, scale: number) =>
          this._drawUiText(text, pos, color, scale),
        measureTextWidth: (text: string, scale: number) => this._uiTextWidth(text, scale),
      },
    );
  }
}
