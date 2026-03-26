// Port of crimson/screens/quest_views/quest_results.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';

import type { CrimsonConfig } from '@grim/config.ts';
import { type AudioState, audioPlaySfx, audioUpdate } from '@grim/audio.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { QuestLevel } from '@crimson/quests/level.ts';
import { questByLevel } from '@crimson/quests/index.ts';
import { trackedQuestCompletedCounterIndex } from '@crimson/quests/status.ts';
import { type QuestFinalTime, computeQuestFinalTime } from '@crimson/quests/results.ts';
import { weaponDisplayName } from '@crimson/weapons.ts';
import { perkDisplayName } from '@crimson/perks/ids.ts';
import { drawScreenFade } from '@crimson/screens/transitions.ts';
import { type HighScoreRecord } from '@crimson/screens/results/game-over.ts';
import { QuestResultsUi as QuestResultsUiImpl } from '@crimson/screens/results/quest-results.ts';
import { nextQuestLevel, playerNameDefault } from './shared.ts';

// ---------------------------------------------------------------------------
// Interfaces for the state consumed by QuestResultsView
// ---------------------------------------------------------------------------

export interface QuestRunOutcome {
  level: QuestLevel;
  experience: number;
  killCount: number;
  mostUsedWeaponId: number;
  shotsFired: number;
  shotsHit: number;
  baseTimeMs: number;
  playerHealth: number;
  player2Health: number | null;
  playerHealthValues: number[];
  pendingPerkCount: number;
}

export interface QuestResultsStatus {
  questUnlockIndex: number;
  questUnlockIndexFull: number;
  incrementQuestPlayCount(index: number): void;
  saveIfDirty(): void;
}

export interface QuestResultsState {
  config: {
    display: {
      width: number;
      height: number;
      violenceDisabled: number;
    };
    gameplay: {
      mode: number;
      hardcore: boolean;
      questLevel: QuestLevel | null;
    };
    profile: { playerName: string };
    save(): void;
  };
  audio: AudioState | null;
  preserveBugs: boolean;
  assetsDir: string;
  baseDir: string;
  questOutcome: QuestRunOutcome | null;
  questFailRetryCount: number;
  pendingQuestLevel: QuestLevel | null;
  pendingHighScores: { gameModeId: number; questLevel: QuestLevel | null; highlightRank: number | null } | null;
  pauseBackground: { drawPauseBackground(opts?: { entityAlpha?: number }): void } | null;
  menuGround: { processPending(): void; draw(camera: Vec2): void } | null;
  menuGroundCamera: Vec2 | null;
  screenFadeAlpha: number;
  screenFadeRamp: boolean;
  status: QuestResultsStatus;
  console: { log: { log(msg: string): void } };
}

// ---------------------------------------------------------------------------
// QuestResultsUi — placeholder interface for the actual results UI
// ---------------------------------------------------------------------------

export interface QuestResultsUi {
  open(opts: {
    record: HighScoreRecord;
    breakdown: QuestFinalTime;
    questLevel: QuestLevel;
    questTitle: string;
    unlockWeaponName: string;
    unlockPerkName: string;
    playerNameDefault: string;
  }): void;
  close(): void;
  update(dt: number, playSfx: ((sfxId: SfxId) => void) | null): string | null;
  draw(): void;
  worldEntityAlpha(): number;
  highlightRank: number | null;
}

// ---------------------------------------------------------------------------
// QuestResultsView
// ---------------------------------------------------------------------------

export class QuestResultsView {
  private state: QuestResultsState;
  private _ground: { processPending(): void; draw(camera: Vec2): void } | null = null;
  private _questLevel: QuestLevel | null = null;
  private _questTitle: string = '';
  private _unlockWeaponName: string = '';
  private _unlockPerkName: string = '';
  private _ui: QuestResultsUi | null = null;
  private _action: string | null = null;

  constructor(state: QuestResultsState) {
    this.state = state;
  }

  open(): void {
    this._action = null;
    this._ground = this.state.pauseBackground !== null ? null : (this.state.menuGround ?? null);
    this.state.questFailRetryCount = 0;
    const outcome = this.state.questOutcome;
    this.state.questOutcome = null;
    this._questLevel = null;
    this._questTitle = '';
    this._unlockWeaponName = '';
    this._unlockPerkName = '';
    this._ui = null;
    if (outcome === null) return;

    const level = outcome.level;
    this._questLevel = level;

    const quest = questByLevel(level);
    this._questTitle = quest !== null ? String(quest.title ?? '') : '';

    // Resolve unlock weapon name
    if (quest !== null && quest.unlockWeaponId !== undefined && quest.unlockWeaponId !== null) {
      this._unlockWeaponName = weaponDisplayName(quest.unlockWeaponId, { preserveBugs: this.state.preserveBugs });
    }
    // Resolve unlock perk name
    if (quest !== null && quest.unlockPerkId !== undefined && quest.unlockPerkId !== null) {
      this._unlockPerkName = perkDisplayName(quest.unlockPerkId, { violenceDisabled: this.state.config.display.violenceDisabled, preserveBugs: this.state.preserveBugs });
    }

    const globalIndex = level.globalIndex;
    const completedIdx = trackedQuestCompletedCounterIndex(level);
    if (completedIdx !== null) {
      try {
        this.state.status.incrementQuestPlayCount(completedIdx);
      } catch (exc) {
        this._logNonfatal('failed to increment quest play count', exc);
      }
    }

    // Advance quest unlock progression when completing the currently-unlocked quest.
    if (globalIndex >= 0) {
      const nextUnlock = globalIndex + 1;
      const hardcore = this.state.config.gameplay.hardcore;
      try {
        if (hardcore) {
          if (nextUnlock > int(this.state.status.questUnlockIndexFull)) {
            this.state.status.questUnlockIndexFull = nextUnlock;
          }
        } else {
          if (nextUnlock > int(this.state.status.questUnlockIndex)) {
            this.state.status.questUnlockIndex = nextUnlock;
          }
        }
      } catch (exc) {
        this._logNonfatal('failed to update quest unlock progression', exc);
      }
    }

    try {
      this.state.status.saveIfDirty();
    } catch (exc) {
      this._logNonfatal('failed to save status', exc);
    }

    // Instantiate the actual QuestResultsUi from the results module.
    const breakdown = computeQuestFinalTime({
      baseTimeMs: outcome.baseTimeMs,
      playerHealth: outcome.playerHealth,
      pendingPerkCount: outcome.pendingPerkCount,
      player2Health: outcome.player2Health,
      playerHealthValues: outcome.playerHealthValues,
    });
    const record = {
      gameModeId: GameMode.QUESTS,
      scoreXp: outcome.experience,
      survivalElapsedMs: breakdown.finalTimeMs,
      mostUsedWeaponId: outcome.mostUsedWeaponId,
      creatureKillCount: outcome.killCount,
      shotsFired: outcome.shotsFired,
      shotsHit: outcome.shotsHit,
      name: '',
    };
    // The view's state.config is a subset of CrimsonConfig; at runtime it is always
    // the full CrimsonConfig instance, so the cast is safe.
    const ui = new QuestResultsUiImpl(this.state.config as unknown as CrimsonConfig);
    ui.preserveBugs = this.state.preserveBugs;
    ui.open({
      record,
      breakdown,
      questLevel: level,
      questTitle: this._questTitle,
      unlockWeaponName: this._unlockWeaponName,
      unlockPerkName: this._unlockPerkName,
      playerNameDefault: playerNameDefault(this.state.config as unknown as CrimsonConfig),
    });
    this._ui = ui as unknown as QuestResultsUi;
  }

  close(): void {
    if (this._ui !== null) {
      this._ui.close();
      this._ui = null;
    }
    this._ground = null;
    this._questLevel = null;
    this._questTitle = '';
    this._unlockWeaponName = '';
    this._unlockPerkName = '';
  }

  update(dt: number): void {
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, dt);
    }
    if (this._ground !== null) {
      this._ground.processPending();
    }
    const ui = this._ui;
    if (ui === null) return;

    const audio = this.state.audio;
    const playSfxFn: ((sfxId: SfxId) => void) | null =
      audio !== null ? (name: SfxId) => { audioPlaySfx(audio, name); } : null;

    const action = ui.update(dt, playSfxFn);
    if (action === 'play_again') {
      if (this._questLevel === null) throw new Error('quest level must be set');
      this._setPendingQuestLevel(this._questLevel);
      this._action = 'start_quest';
      return;
    }
    if (action === 'play_next') {
      if (this._questLevel !== null && this._questLevel.equal(new QuestLevel(5, 10))) {
        this._action = 'end_note';
        return;
      }
      if (this._questLevel === null) throw new Error('quest level must be set');
      const next = nextQuestLevel(this._questLevel);
      if (next !== null) {
        this._setPendingQuestLevel(next);
        this._action = 'start_quest';
      } else {
        this._action = 'back_to_menu';
      }
      return;
    }
    if (action === 'high_scores') {
      this._openHighScoresList();
      return;
    }
    if (action === 'main_menu') {
      this._action = 'back_to_menu';
      return;
    }
  }

  draw(): void {
    wgl.clearBackground(wgl.makeColor(0, 0, 0, 1));
    const ui = this._ui;
    let bgAlpha = 1.0;
    if (ui !== null) {
      bgAlpha = ui.worldEntityAlpha();
    }
    const pauseBackground = this.state.pauseBackground;
    if (pauseBackground !== null) {
      pauseBackground.drawPauseBackground({ entityAlpha: bgAlpha });
    } else if (this._ground !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this._ground.draw(camera);
    }
    drawScreenFade(this.state);
    if (ui !== null) {
      ui.draw();
      return;
    }

    // Fallback when no UI is available
    const textColor = wgl.makeColor(235 / 255, 235 / 255, 235 / 255, 1.0);
    const subColor = wgl.makeColor(190 / 255, 190 / 255, 200 / 255, 1.0);
    // Simple fallback text (the real QuestResultsUi handles full rendering)
    wgl.drawRectangle(32, 140, 400, 28, wgl.makeColor(textColor[0], textColor[1], textColor[2], 0));
    wgl.drawRectangle(32, 180, 400, 18, wgl.makeColor(subColor[0], subColor[1], subColor[2], 0));
  }

  takeAction(): string | null {
    const action = this._action;
    this._action = null;
    return action;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _openHighScoresList(): void {
    let highlightRank: number | null = null;
    if (this._ui !== null) {
      highlightRank = this._ui.highlightRank;
    }
    if (this._questLevel === null) throw new Error('quest level must be set');
    this.state.pendingHighScores = {
      gameModeId: GameMode.QUESTS,
      questLevel: this._questLevel,
      highlightRank,
    };
    this._action = 'open_high_scores';
  }

  private _setPendingQuestLevel(level: QuestLevel): void {
    this.state.pendingQuestLevel = level;
    this.state.config.gameplay.mode = GameMode.QUESTS;
    this.state.config.gameplay.questLevel = level;
    try {
      this.state.config.save();
    } catch (exc) {
      this._logNonfatal('failed to save quest selection config', exc);
    }
  }

  private _logNonfatal(message: string, exc: unknown): void {
    this.state.console.log.log(`quest results: ${message}: ${exc}`);
  }
}
