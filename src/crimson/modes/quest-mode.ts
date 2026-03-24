// Port of crimson/modes/quest_mode.py

import * as wgl from '@wgl';
import { type WebGLContext } from '@grim/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { type AudioState, audioPlayMusic } from '@grim/audio.ts';
import { type CrimsonConfig } from '@grim/config.ts';
import { type ConsoleState } from '@grim/console.ts';
import { type GrimMonoFont, createGrimMonoFont } from '@grim/fonts/grim-mono.ts';
import { Vec2 } from '@grim/geom.ts';
import { InputState } from '@grim/input.ts';
import { Crand } from '@grim/rand.ts';
import { SfxId } from '@grim/sfx-map.ts';

import { GameMode } from '@crimson/game-modes.ts';
import {
  DeterministicSession,
  type DeterministicSessionTick,
  QuestSpawnState,

} from '@crimson/sim/sessions.ts';
import {
  buildQuestSession,
} from '@crimson/sim/session-builders.ts';
import { advanceExplicitTerrain, advanceUnlockTerrain } from '@crimson/sim/bootstrap.ts';
import { type QuestLevel, questLevelText, questLevelFromGlobalIndex } from '@crimson/quests/level.ts';
import {
  type QuestDefinition,
  type SpawnEntry,
  type QuestContext,
} from '@crimson/quests/types.ts';
import { questByLevel } from '@crimson/quests/index.ts';
import { buildQuestSpawnTable } from '@crimson/quests/runtime.ts';
import { trackedQuestGamesCounterIndex } from '@crimson/quests/status.ts';
import { perkSelectionPreparedChoices } from '@crimson/perks/selection.ts';
import { WeaponId, WEAPON_BY_ID } from '@crimson/weapons.ts';
import { weaponAssignPlayer, mostUsedWeaponIdForPlayer } from '@crimson/weapon-runtime/index.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';

import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { drawHudOverlay, hudFlagsForGameMode } from '@crimson/ui/hud.ts';
import {
  drawQuestTitleTimerOverlay,
  drawQuestCompleteBannerOverlay,
} from '@crimson/ui/overlays/quest-run.ts';

import {
  BaseGameplayMode,
  type GameStatus,
  type LanSession,
  type LanStepAction,
} from './base-gameplay-mode.ts';
import { PerkMenuController } from './components/perk-menu-controller.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { PerkPromptState } from './components/perk-prompt-controller.ts';
import {
  type PostApplyReaction,
  buildPostApplyReaction,
  applyPostApplyReaction,
} from '@crimson/sim/presentation-reactions.ts';
import type { TickResult } from '@crimson/sim/hooks.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORLD_SIZE = 1024.0;

const UI_TEXT_SCALE = 1.0;
const UI_TEXT_COLOR = wgl.makeColor(220 / 255, 220 / 255, 220 / 255, 1.0);
const UI_HINT_COLOR = wgl.makeColor(140 / 255, 140 / 255, 140 / 255, 1.0);
const UI_SPONSOR_COLOR = wgl.makeColor(1.0, 1.0, 1.0, 0.5);

const _DEBUG_WEAPON_IDS: WeaponId[] = (() => {
  const ids: WeaponId[] = [];
  for (const id of WEAPON_BY_ID.keys()) {
    ids.push(id);
  }
  return ids.sort((a, b) => a - b);
})();

// ---------------------------------------------------------------------------
// QuestRunOutcome
// ---------------------------------------------------------------------------

export interface QuestRunOutcome {
  readonly kind: 'completed' | 'failed';
  readonly level: QuestLevel;
  readonly baseTimeMs: number;
  readonly playerHealth: number;
  readonly player2Health: number | null;
  readonly pendingPerkCount: number;
  readonly experience: number;
  readonly killCount: number;
  readonly weaponId: WeaponId;
  readonly shotsFired: number;
  readonly shotsHit: number;
  readonly mostUsedWeaponId: WeaponId;
  readonly playerHealthValues: readonly number[];
}

// ---------------------------------------------------------------------------
// QuestMode
// ---------------------------------------------------------------------------

export class QuestMode extends BaseGameplayMode {
  private _questDef: QuestDefinition | null = null;
  private _questLevel: QuestLevel | null = null;
  private _questTotalSpawnCount = 0;
  private _outcome: QuestRunOutcome | null = null;
  private _grimMono: GrimMonoFont | null = null;
  private _perkPromptPendingCount = 0;
  private _perkPrompt = new PerkPromptState();
  private _perkMenu = new PerkMenuController({ onClose: () => this._resetPerkPrompt() });
  private _questSpawnState = new QuestSpawnState();
  protected _simSession: DeterministicSession | null = null;

  constructor(opts: {
    gl: WebGLContext;
    worldSize?: number;
    demoModeActive?: boolean;
    config: CrimsonConfig;
    console?: ConsoleState | null;
    audio?: AudioState | null;
    audioRng: Crand;
  }) {
    super({
      gl: opts.gl,
      worldSize: opts.worldSize ?? WORLD_SIZE,
      defaultGameModeId: GameMode.QUESTS,
      demoModeActive: opts.demoModeActive ?? false,
      questFailRetryCount: 0,
      hardcore: false,
      config: opts.config,
      console: opts.console ?? null,
      audio: opts.audio ?? null,
      audioRng: opts.audioRng,
    });
    this._questLevel = opts.config.gameplay.questLevel ?? { major: 1, minor: 1 };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  open(): void {
    super.open();
    this._questDef = null;
    const cfgLevel = this.config.gameplay.questLevel;
    this._questLevel = cfgLevel ?? { major: 1, minor: 1 };
    this._questTotalSpawnCount = 0;
    this._outcome = null;
    const courierTex = getTexture(this.renderResources.resources as RuntimeResources, TextureId.DEFAULT_FONT_COURIER);
    this._grimMono = courierTex != null ? createGrimMonoFont(courierTex) : null;

    this._perkPromptPendingCount = 0;
    this._perkPrompt.reset();
    this._perkMenu.reset();
    this._resetGameplayFrameClock();
    this._resetLanCaptureClock();
    this._simSession = null;
  }

  close(): void {
    this._grimMono = null;
    this._simSession = null;
    super.close();
  }

  // ---------------------------------------------------------------------------
  // Session builder
  // ---------------------------------------------------------------------------

  private _newSimSession(spawnEntries: readonly SpawnEntry[]): DeterministicSession {
    const questDef = this._questDef;
    const [session, questSpawnState] = buildQuestSession({
      world: this.simWorld.worldState,
      worldSize: this.worldSize,
      damageScaleByType: this.simWorld.damageScaleByType,
      detailPreset: 5,
      violenceDisabled: 0,
      gameTuneStarted: this.simWorld.gameTuneStarted,
      demoModeActive: this.demoModeActive,
      applyWorldDtSteps: false,
      finalizePostRenderLifecycle: true,
      spawnEntries: [...spawnEntries],
      questLevel: questDef !== null ? questDef.level : null,
      startWeaponId: questDef !== null ? questDef.startWeaponId : null,
    });
    this._questSpawnState = questSpawnState;
    return session;
  }

  // ---------------------------------------------------------------------------
  // Perk UI
  // ---------------------------------------------------------------------------

  private _tryOpenPerkMenu(): void {
    this._openPerkMenuUi({
      menu: this._perkMenu,
      players: this.simWorld.players,
      gameMode: GameMode.QUESTS,
      playerCount: Math.max(1, this.simWorld.players.length),
    });
  }

  private _resetPerkPrompt(): void {
    this._perkPromptPendingCount = this.state.perkSelection.pendingCount;
    this._perkPrompt.resetIfPending(this._perkPromptPendingCount);
  }

  private _updatePerkUi(dtUiMs: number): void {
    const pendingCount = this.state.perkSelection.pendingCount;
    const choices = perkSelectionPreparedChoices(
      this.simWorld.players,
      this.state.perkSelection,
    );

    if (this._perkMenu.open) {
      const choiceIndex = this._handlePerkMenuInput(choices, dtUiMs);
      if (choiceIndex !== null) {
        this.recordPerkPickCommand(choiceIndex, { playerIndex: 0 });
      }
    }

    if (this._pollPerkOpenRequest({
      pendingCount,
      playerCount: Math.max(1, this.simWorld.players.length),
      anyAlive: this._anyPlayerAlive(),
      paused: this._paused,
      menuActive: this._perkMenu.active,
    })) {
      this._tryOpenPerkMenu();
    }

    this._tickPerkPromptTimer({
      pendingCount,
      anyAlive: this._anyPlayerAlive(),
      paused: this._paused,
      menuActive: this._perkMenu.active,
      dtUiMs,
    });
    if (!this._paused) {
      this._tickPerkPromptPulse(dtUiMs);
    }
    this._tickPerkMenuTimeline(dtUiMs);
  }

  // ---------------------------------------------------------------------------
  // Perk prompt overrides
  // ---------------------------------------------------------------------------

  protected _pollPerkOpenRequest(opts: {
    pendingCount: number;
    playerCount: number;
    anyAlive: boolean;
    paused: boolean;
    menuActive: boolean;
  }): boolean {
    this._perkPrompt.beginFrame();
    return this._perkPrompt.pollOpenRequest({
      ctx: this._perkMenuUiContext(),
      config: this.config,
      pendingCount: opts.pendingCount,
      playerCount: opts.playerCount,
      anyAlive: opts.anyAlive,
      paused: opts.paused,
      menuActive: opts.menuActive,
    });
  }

  protected _tickPerkPromptTimer(opts: {
    pendingCount: number;
    anyAlive: boolean;
    paused: boolean;
    menuActive: boolean;
    dtUiMs: number;
  }): void {
    this._perkPrompt.tickTimer(opts);
  }

  protected _tickPerkPromptPulse(dtUiMs: number): void {
    this._perkPrompt.tickPulse(dtUiMs);
  }

  protected override _handlePerkMenuInput(choices: readonly PerkId[], dtUiMs: number): number | null {
    return this._perkMenu.handleInput(
      this._perkMenuUiContext(),
      choices,
      { dtUiMs },
    );
  }

  protected override _tickPerkMenuTimeline(dtUiMs: number): void {
    this._perkMenu.tickTimeline(dtUiMs);
  }

  protected override _drawPerkMenu(ctx: WebGLContext, choices: readonly PerkId[]): void {
    this._perkMenu.draw(ctx, this._perkMenuUiContext(), choices);
  }

  protected _drawPerkPrompt(ctx: WebGLContext, opts: {
    pendingCount: number;
    anyAlive: boolean;
    menuActive: boolean;
    textColor: wgl.Color;
    promptScale: number;
  }): void {
    this._perkPrompt.draw(ctx, {
      uiCtx: this._perkMenuUiContext(),
      pendingCount: opts.pendingCount,
      anyAlive: opts.anyAlive,
      menuActive: opts.menuActive,
      config: this.config,
      uiTextWidth: (text: string, scale: number) => this._uiTextWidth(text, scale),
      textColor: opts.textColor,
      promptScale: opts.promptScale,
    });
  }

  // ---------------------------------------------------------------------------
  // Replay helpers
  // ---------------------------------------------------------------------------

  protected _replayCheckpointElapsedMs(): number {
    return this._questSpawnState.spawnTimelineMs;
  }

  protected _replayClaimedStatsComplete(): boolean {
    return this._outcome !== null;
  }

  protected _replayClaimedStatsElapsedMs(): number {
    return this._questSpawnState.spawnTimelineMs | 0;
  }

  protected _replayOutputBasename(opts: { stamp: string; replay: unknown }): string {
    const stamp = opts.stamp;
    const level = this._questLevel !== null ? questLevelText(this._questLevel) : 'quest';
    const kind = this._outcome !== null ? this._outcome.kind : 'quest';
    const baseTimeMs = this._questSpawnState.spawnTimelineMs | 0;
    return `quest_${level}_${stamp}_${kind}_t${baseTimeMs}`;
  }

  // ---------------------------------------------------------------------------
  // LAN helpers
  // ---------------------------------------------------------------------------

  protected _lanModeName(): 'survival' | 'rush' | 'quests' {
    return 'quests';
  }

  protected _lanMatchSession(): DeterministicSession | null {
    return this._simSession;
  }

  protected _lanOnPaused(dt: number): void {
    this._tickDeathTimers(dt, 1.0);
    if (this._deathTransitionReady()) {
      this._closeFailedRun();
    }
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
    const spawnState = this._questSpawnState;

    if (frameTick !== null) {
      this._storeNetRuntimeSnapshot({
        tickIndex: frameTick,
        elapsedMs: this._simSession !== null ? this._simSession.elapsedMs : 0.0,
        spawnEntries: [...spawnState.spawnEntries],
        spawnTimelineMs: spawnState.spawnTimelineMs,
        noCreaturesTimerMs: spawnState.noCreaturesTimerMs,
        completionTransitionMs: spawnState.completionTransitionMs,
        perkPendingCount: this.state.perkSelection.pendingCount,
      });
    }

    if (spawnState.completed) {
      if (this._outcome === null) {
        this._buildCompletedOutcome();
      }
      this._saveReplay();
      this.closeRequested = true;
      return 'stop_after_finalize';
    }

    if (this._deathTransitionReady()) {
      this._closeFailedRun();
      return 'stop_after_finalize';
    }
    return 'continue';
  }

  // ---------------------------------------------------------------------------
  // Post-apply reaction hooks
  // ---------------------------------------------------------------------------

  protected _buildTickPostApplyReaction(opts: { tickResult: TickResult }): PostApplyReaction {
    return buildPostApplyReaction({
      tickResult: opts.tickResult,
      questState: this._questSpawnState,
    });
  }

  protected _applyTickPostApplyReaction(reaction: PostApplyReaction, _opts: { dtSeconds: number }): void {
    applyPostApplyReaction({
      reaction,
      playSfx: (sfx) => this.audioBridge.router.playSfx(sfx),
      playCompletionMusic: () => this._playQuestCompletionMusic(),
    });
  }

  private _playQuestCompletionMusic(): void {
    if (this.audio === null) return;
    audioPlayMusic(this.audio, 'crimsonquest');
    // Start silent — volume is faded in during update
    const playback = this.audio.music.playbacks?.get?.('crimsonquest');
    if (playback != null) {
      playback.volume = 0.0;
    }
  }

  // ---------------------------------------------------------------------------
  // Resync snapshot
  // ---------------------------------------------------------------------------

  protected _applyResyncSnapshot(snapshot: unknown): void {
    const rs = snapshot as {
      spawnEntries: SpawnEntry[];
      spawnTimelineMs: number;
      noCreaturesTimerMs: number;
      completionTransitionMs: number;
      elapsedMs: number;
    };
    this._questSpawnState.spawnEntries = [...rs.spawnEntries];
    this._questSpawnState.spawnTimelineMs = rs.spawnTimelineMs;
    this._questSpawnState.noCreaturesTimerMs = rs.noCreaturesTimerMs;
    this._questSpawnState.completionTransitionMs = rs.completionTransitionMs;
    this._questSpawnState.completed = false;
    this._questSpawnState.playHitSfx = false;
    this._questSpawnState.playCompletionMusic = false;
    const session = this._simSession;
    if (session !== null) {
      session.elapsedMs = rs.elapsedMs;
    }
  }

  // ---------------------------------------------------------------------------
  // Outcome
  // ---------------------------------------------------------------------------

  consumeOutcome(): QuestRunOutcome | null {
    const outcome = this._outcome;
    this._outcome = null;
    return outcome;
  }

  // ---------------------------------------------------------------------------
  // Start run
  // ---------------------------------------------------------------------------

  startRun(level: QuestLevel, status: GameStatus | null): void {
    const quest = questByLevel(level);
    if (quest === null) {
      this._questDef = null;
      this._questLevel = level;
      this._questTotalSpawnCount = 0;
      this._simSession = null;
      return;
    }
    this._outcome = null;

    const hardcoreFlag = this.config.gameplay.hardcore;
    this.hardcore = hardcoreFlag;

    const seed = (this.state.rng.state | 0) & 0xFFFFFFFF;
    this._runResetSeed = seed;

    const playerCount = this.config.gameplay.playerCount;
    this._syncWorldRuntimeConfig();
    this.worldRuntime.reset(seed, Math.max(1, Math.min(4, playerCount)));
    this._bindWorld();
    this._localInput.reset(this.simWorld.players);
    this.bindStatus(status);

    const boundStatus = this.state.status as GameStatus | null;
    const genericUnlockIndex = boundStatus != null ? (boundStatus.questUnlockIndex ?? 0) : 0;

    advanceUnlockTerrain(
      this.state.rng,
      genericUnlockIndex,
      this.worldSize | 0,
      this.worldSize | 0,
    );

    // Native burns one crt_rand for highscore_record_random_tag
    this.state.rng.rand(RngCallerStatic.QUEST_START_SELECTED_HIGHSCORE_RANDOM_TAG);

    const questTerrain = advanceExplicitTerrain(
      this.state.rng,
      quest.terrainSlots,
      this.worldSize | 0,
      this.worldSize | 0,
    );
    this.applyTerrainSetup({ terrainSlots: questTerrain.terrainSlots, seed: questTerrain.terrainSeed });

    const ctx: QuestContext = {
      width: this.worldSize | 0,
      height: this.worldSize | 0,
      playerCount: this.simWorld.players.length,
    };
    const entries = buildQuestSpawnTable(quest, ctx, {
      rng: this.state.rng,
      hardcore: hardcoreFlag,
      fullVersion: !this.demoModeActive,
    });
    this.simWorld.state.rng.srand(this.state.rng.state | 0);
    const totalSpawnCount = entries.reduce((sum, e) => sum + e.count, 0);
    this._questDef = quest;
    this._questLevel = quest.level;
    this._questTotalSpawnCount = totalSpawnCount;
    this._resetGameplayFrameClock();
    this._simSession = this._newSimSession(entries);

    if (status !== null) {
      const idx = trackedQuestGamesCounterIndex(quest.level);
      if (idx !== null) {
        status.incrementQuestPlayCount?.(idx);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Input handling
  // ---------------------------------------------------------------------------

  protected _handleInput(): void {
    if (this._perkMenu.open && InputState.wasKeyPressed(27)) { // Escape
      this.audioBridge.router.playSfx?.(SfxId.UI_BUTTONCLICK);
      this._perkMenu.close();
      return;
    }

    if (!this._lanEnabled && InputState.wasKeyPressed(9)) { // Tab
      this._paused = !this._paused;
    }

    if (this._debugEnabled && !this._perkMenu.open) {
      if (InputState.wasKeyPressed(113)) { // F2
        this.state.debugGodMode = !this.state.debugGodMode;
        this.audioBridge.router.playSfx?.(SfxId.UI_BUTTONCLICK);
      }
      if (InputState.wasKeyPressed(114)) { // F3
        this.state.perkSelection.pendingCount += 1;
        this.state.perkSelection.choicesDirty = true;
        this.audioBridge.router.playSfx?.(SfxId.UI_LEVELUP);
      }
      if (InputState.wasKeyPressed(219)) { // [
        this._debugCycleWeapon(-1);
      }
      if (InputState.wasKeyPressed(221)) { // ]
        this._debugCycleWeapon(1);
      }
    }

    if (InputState.wasKeyPressed(27)) { // Escape
      this._action = 'open_pause_menu';
      return;
    }
  }

  private _debugCycleWeapon(delta: number): void {
    const weaponIds = _DEBUG_WEAPON_IDS;
    if (weaponIds.length === 0) return;
    const current = this.player.weapon.weaponId;
    let idx = weaponIds.indexOf(current);
    if (idx < 0) idx = 0;
    const weaponId = weaponIds[((idx + delta) % weaponIds.length + weaponIds.length) % weaponIds.length];
    weaponAssignPlayer(this.player, weaponId, this.state);
  }

  // ---------------------------------------------------------------------------
  // Death transition
  // ---------------------------------------------------------------------------

  private _deathTransitionReady(): boolean {
    let deadPlayers = 0;
    for (const player of this.simWorld.players) {
      if (player.health > 0.0) return false;
      deadPlayers += 1;
      if (player.deathTimer >= 0.0) return false;
    }
    return deadPlayers > 0;
  }

  private _tickDeathTimers(dt: number, rate: number = 20.0): void {
    const delta = dt * rate;
    if (delta <= 0.0) return;
    for (const player of this.simWorld.players) {
      if (player.health > 0.0) continue;
      if (player.deathTimer < 0.0) continue;
      player.deathTimer -= delta;
    }
  }

  // ---------------------------------------------------------------------------
  // Outcome builders
  // ---------------------------------------------------------------------------

  private _buildCompletedOutcome(): void {
    if (this._questLevel === null) {
      throw new Error('quest outcome requires active quest level');
    }
    const [fired, hit] = this._shotsFromState(this.player.index);
    const mostUsed = mostUsedWeaponIdForPlayer(
      this.state,
      this.player.index,
      this.player.weapon.weaponId,
    );
    const healthValues = this.simWorld.players.map((p) => p.health);
    const player2Health = healthValues.length >= 2 ? healthValues[1] : null;
    this._outcome = {
      kind: 'completed',
      level: this._questLevel,
      baseTimeMs: this._questSpawnState.spawnTimelineMs | 0,
      playerHealth: healthValues.length > 0 ? healthValues[0] : this.player.health,
      player2Health,
      playerHealthValues: healthValues,
      pendingPerkCount: this.state.perkSelection.pendingCount,
      experience: this.player.experience,
      killCount: this.creatures.killCount,
      weaponId: this.player.weapon.weaponId,
      shotsFired: fired,
      shotsHit: hit,
      mostUsedWeaponId: mostUsed,
    };
  }

  private _closeFailedRun(): void {
    if (this._outcome === null) {
      if (this._questLevel === null) {
        throw new Error('quest outcome requires active quest level');
      }
      const [fired, hit] = this._shotsFromState(this.player.index);
      const mostUsed = mostUsedWeaponIdForPlayer(
        this.state,
        this.player.index,
        this.player.weapon.weaponId,
      );
      const healthValues = this.simWorld.players.map((p) => p.health);
      const player2Health = healthValues.length >= 2 ? healthValues[1] : null;
      this._outcome = {
        kind: 'failed',
        level: this._questLevel,
        baseTimeMs: this._questSpawnState.spawnTimelineMs | 0,
        playerHealth: healthValues.length > 0 ? healthValues[0] : this.player.health,
        player2Health,
        playerHealthValues: healthValues,
        pendingPerkCount: this.state.perkSelection.pendingCount,
        experience: this.player.experience,
        killCount: this.creatures.killCount,
        weaponId: this.player.weapon.weaponId,
        shotsFired: fired,
        shotsHit: hit,
        mostUsedWeaponId: mostUsed,
      };
    }
    this._saveReplay();
    this.closeRequested = true;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const frame = this._beginModeUpdate(dt);
    if (frame === null) return;
    if (this.closeRequested) return;

    if (this._lanEnabled && this._lanRuntime !== null) {
      this._updateLanMatch({ dt: frame.dt, dtUiMs: frame.dtUiMs });
      return;
    }

    this._updatePerkUi(frame.dtUiMs);

    const simDt = (this._paused || this._perkMenu.active) ? 0.0 : frame.dt;
    const session = this._simSession;

    if (this._lanWaitGateActive()) {
      this._resetGameplayFrameClock();
      return;
    }
    if (simDt <= 0.0) {
      this._resetGameplayFrameClock();
      // Keep death countdown moving at real-time pace while paused
      this._tickDeathTimers(frame.dt, 1.0);
      if (this._deathTransitionReady()) {
        this._closeFailedRun();
      }
      return;
    }
    if (session === null) {
      this._tickDeathTimers(simDt);
      if (this._deathTransitionReady()) {
        this._closeFailedRun();
      }
      return;
    }

    session.detailPreset = this._deterministicDetailPreset();
    session.violenceDisabled = this._deterministicViolenceDisabled();

    this._worldRuntime.syncAudioBridgeState();
    if (this.renderResources.ground !== null) {
      this.renderResources.ground.processPending();
    }

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

  draw(ctx: WebGLContext): void {
    const perkMenuActive = this._perkMenu.active;
    let debugOverlayHeight = 0.0;

    this._drawWorld({
      drawAimIndicators: !perkMenuActive,
      entityAlpha: this._worldEntityAlpha(),
    });
    this._drawScreenFade(ctx);

    let hudBottom = 0.0;
    if (!perkMenuActive) {
      const total = this._questTotalSpawnCount;
      const kills = this.creatures.killCount;
      const questProgressRatio = total > 0 ? kills / total : null;
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
        elapsedMs: this._questSpawnState.spawnTimelineMs,
        frameDtMs: this._lastDtMs,
        questProgressRatio,
      });
    }

    if (this._debugEnabled && !perkMenuActive) {
      const x = 18.0;
      const y = Math.max(18.0, hudBottom + 10.0);
      const god = this.state.debugGodMode ? 'on' : 'off';
      const line = this._uiLineHeight(0.9);
      this._drawUiText(
        ctx,
        `debug: [/] weapon  F3 perk+1  F2 god=${god}`,
        new Vec2(x, y),
        UI_HINT_COLOR,
        0.9,
      );
      const overlayEndY = this._drawLanDebugInfo(ctx, { x, y: y + line, lineH: line });
      debugOverlayHeight = Math.max(0.0, overlayEndY - y);
    }

    this._drawQuestTitle(ctx);
    this._drawQuestCompleteBanner(ctx);

    this._drawPerkPrompt(ctx, {
      pendingCount: this.state.perkSelection.pendingCount,
      anyAlive: this._anyPlayerAlive(),
      menuActive: this._perkMenu.active,
      textColor: UI_TEXT_COLOR,
      promptScale: UI_TEXT_SCALE,
    });
    this._drawPerkMenu(ctx, perkSelectionPreparedChoices(
      this.simWorld.players,
      this.state.perkSelection,
    ));

    if (perkMenuActive) {
      this._drawGameCursor(ctx);
    } else if (this._paused) {
      this._drawGameCursor(ctx);
      const x = 18.0;
      let y = Math.max(18.0, hudBottom + 10.0);
      y += debugOverlayHeight;
      this._drawUiText(ctx, 'paused (TAB)', new Vec2(x, y), UI_HINT_COLOR);
    }
    this._drawLanWaitOverlay(ctx);
  }

  // ---------------------------------------------------------------------------
  // Draw helpers
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

  private _drawQuestTitle(ctx: WebGLContext): void {
    const font = this._grimMono;
    const quest = this._questDef;
    if (font === null || quest === null) return;
    const [screenW, screenH] = this._screenSize();
    drawQuestTitleTimerOverlay(
      ctx,
      screenW,
      screenH,
      font,
      quest.title,
      questLevelText(quest.level),
      this._questSpawnState.spawnTimelineMs,
    );
  }

  private _drawQuestCompleteBanner(ctx: WebGLContext): void {
    const tex = getTexture(this.renderResources.resources as RuntimeResources, TextureId.UI_TEXT_LEVEL_COMPLETE);
    if (tex === null) return;
    const [screenW, screenH] = this._screenSize();
    drawQuestCompleteBannerOverlay(
      ctx,
      screenW,
      screenH,
      tex,
      this._questSpawnState.completionTransitionMs,
    );
  }
}
