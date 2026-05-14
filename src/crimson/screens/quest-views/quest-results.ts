// Port of crimson/screens/quest_views/quest_results.py

import * as wgl from '@wgl';

import { audioPlaySfx, audioUpdate } from '@grim/audio.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { type GroundRenderer } from '@grim/terrain-render.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { QuestLevel } from '@crimson/quests/level.ts';
import { questByLevel } from '@crimson/quests/index.ts';
import { trackedQuestCompletedCounterIndex } from '@crimson/quests/status.ts';
import { computeQuestFinalTime } from '@crimson/quests/results.ts';
import { weaponDisplayName } from '@crimson/weapons.ts';
import { PERK_BY_ID, PerkId, perkDisplayName } from '@crimson/perks/ids.ts';
import { ensureMenuGround, menuGroundCamera } from '@crimson/screens/menu.ts';
import { drawScreenFade } from '@crimson/screens/transitions.ts';
import { QuestResultsUi as QuestResultsUiImpl } from '@crimson/screens/results/quest-results.ts';
import { HighScoreRecord } from '@crimson/persistence/highscores.ts';
import { HighScoresRequest, type GameState } from '@crimson/game/types.ts';
import { nextQuestLevel, playerNameDefault } from './shared.ts';

export class QuestResultsView {
  private state: GameState;
  private _ground: GroundRenderer | null = null;
  private _questLevel: QuestLevel | null = null;
  private _questTitle: string = '';
  private _unlockWeaponName: string = '';
  private _unlockPerkName: string = '';
  private _ui: QuestResultsUiImpl | null = null;
  private _action: string | null = null;

  constructor(state: GameState) {
    this.state = state;
  }

  open(): void {
    this._action = null;
    this._ground = this.state.pauseBackground !== null ? null : ensureMenuGround(this.state);
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
    const major = level.major;
    const minor = level.minor;

    const quest = questByLevel(level);

    this._questTitle = quest !== null ? String(quest.title || '') : '';
    if (quest !== null) {
      const weaponIdNative = quest.unlockWeaponId !== null ? int(quest.unlockWeaponId) : 0;
      if (weaponIdNative > 0) {
        this._unlockWeaponName = weaponDisplayName(
          weaponIdNative,
          { preserveBugs: Boolean(this.state.preserveBugs) },
        );
      }

      const perkIdNative = quest.unlockPerkId !== null ? int(quest.unlockPerkId) : 0;
      if (perkIdNative !== int(PerkId.ANTIPERK)) {
        const perkId = perkIdNative;
        const perkEntry = PERK_BY_ID.get(perkId);
        if (perkEntry !== undefined && perkEntry.name) {
          const violenceDisabled = this.state.config.display.violenceDisabled;
          this._unlockPerkName = perkDisplayName(
            perkId,
            { violenceDisabled, preserveBugs: Boolean(this.state.preserveBugs) },
          );
        } else {
          this._unlockPerkName = `perk_${perkIdNative}`;
        }
      }
    }

    const record = HighScoreRecord.blank();
    record.gameModeId = GameMode.QUESTS;
    record.questStageMajor = int(major);
    record.questStageMinor = int(minor);
    record.scoreXp = int(outcome.experience);
    record.creatureKillCount = int(outcome.killCount);
    record.mostUsedWeaponId = outcome.mostUsedWeaponId;
    const fired = Math.max(0, int(outcome.shotsFired));
    const hit = Math.max(0, Math.min(int(outcome.shotsHit), fired));
    record.shotsFired = fired;
    record.shotsHit = hit;

    let playerHealthValues = outcome.playerHealthValues.map((v) => v);
    if (playerHealthValues.length === 0) {
      playerHealthValues = [outcome.playerHealth];
      if (outcome.player2Health !== null) {
        playerHealthValues = playerHealthValues.concat([outcome.player2Health]);
      }
    }
    const breakdown = computeQuestFinalTime({
      baseTimeMs: int(outcome.baseTimeMs),
      playerHealth: outcome.playerHealth,
      player2Health: outcome.player2Health !== null ? outcome.player2Health : null,
      playerHealthValues,
      pendingPerkCount: int(outcome.pendingPerkCount),
    });
    record.survivalElapsedMs = int(breakdown.finalTimeMs);
    const defaultName = playerNameDefault(this.state.config) || 'Player';
    record.setName(defaultName);

    const globalIndex = int(level.globalIndex);
    const completedIdx = trackedQuestCompletedCounterIndex(level);
    if (completedIdx !== null) {
      try {
        this.state.status.incrementQuestPlayCount(completedIdx);
      } catch (exc) {
        this._logNonfatal('failed to increment quest play count', String(exc));
      }
    }

    // Advance quest unlock progression when completing the currently-unlocked quest.
    if (globalIndex >= 0) {
      const nextUnlock = int(globalIndex + 1);
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
        this._logNonfatal('failed to update quest unlock progression', String(exc));
      }
    }

    try {
      this.state.status.saveIfDirty();
    } catch (exc) {
      this._logNonfatal('failed to save status', String(exc));
    }

    const ui = new QuestResultsUiImpl({
      assetsRoot: this.state.assetsDir,
      baseDir: this.state.baseDir,
      config: this.state.config,
      preserveBugs: Boolean(this.state.preserveBugs),
    });
    ui.open({
      record,
      breakdown,
      questLevel: level,
      questTitle: String(this._questTitle || ''),
      unlockWeaponName: String(this._unlockWeaponName || ''),
      unlockPerkName: String(this._unlockPerkName || ''),
      playerNameDefault: defaultName,
    });
    this._ui = ui;
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

    const action = ui.update(dt, { playSfx: playSfxFn });
    if (action === 'play_again') {
      if (this._questLevel === null) throw new Error('quest level must be set');
      this._setPendingQuestLevel(this._questLevel);
      this._action = 'start_quest';
      return;
    }
    if (action === 'play_next') {
      if (this._questLevel !== null && this._questLevel.equal(new QuestLevel({ major: 5, minor: 10 }))) {
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
      this._ground.draw(menuGroundCamera(this.state));
    }
    drawScreenFade(this.state);
    if (ui !== null) {
      const resources = this.state.resources;
      if (resources === null) return;
      ui.draw({ resources });
      return;
    }

    wgl.drawText('Quest results unavailable.', 32, 140, 28, wgl.makeColor(235 / 255, 235 / 255, 235 / 255, 1.0));
    wgl.drawText('Press ESC to return to the menu.', 32, 180, 18, wgl.makeColor(190 / 255, 190 / 255, 200 / 255, 1.0));
  }

  takeAction(): string | null {
    const action = this._action;
    this._action = null;
    return action;
  }

  private _openHighScoresList(): void {
    let highlightRank: number | null = null;
    if (this._ui !== null) {
      highlightRank = this._ui.highlightRank;
    }
    if (this._questLevel === null) throw new Error('quest level must be set');
    this.state.pendingHighScores = new HighScoresRequest({
      gameModeId: GameMode.QUESTS,
      questLevel: this._questLevel,
      highlightRank,
    });
    this._action = 'open_high_scores';
  }

  private _setPendingQuestLevel(level: QuestLevel): void {
    this.state.pendingQuestLevel = level;
    this.state.config.gameplay.mode = GameMode.QUESTS;
    this.state.config.gameplay.questLevel = level;
    try {
      this.state.config.save();
    } catch (exc) {
      this._logNonfatal('failed to save quest selection config', String(exc));
    }
  }

  private _logNonfatal(message: string, exc: Error | string): void {
    this.state.console.log.log(`quest results: ${message}: ${exc}`);
  }
}
