// Port of crimson/screens/quest_views/quest_failed.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';

import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import type { CrimsonConfig } from '@grim/config.ts';
import { drawSmallText, measureSmallTextWidth, SmallFontData } from '@grim/fonts/small.ts';
import { InputState } from '@grim/input.ts';
import { audioPlaySfx, audioUpdate } from '@grim/audio.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { GameState } from '@crimson/game/types.ts';
import { type QuestRunOutcome } from '@crimson/modes/quest-mode.ts';
import { questByLevel } from '@crimson/quests/index.ts';
import { drawClassicMenuPanel } from '@crimson/ui/menu-panel.ts';
import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { menuWidescreenYShift } from '@crimson/ui/layout.ts';
import {
  UiButtonState,
  buttonDraw,
  buttonUpdate,
  buttonWidth,
} from '@crimson/ui/perk-menu.ts';
import { drawScreenFade } from '@crimson/screens/transitions.ts';
import {
  QUEST_FAILED_BANNER_H,
  QUEST_FAILED_BANNER_W,
  QUEST_FAILED_BANNER_X_OFFSET,
  QUEST_FAILED_BANNER_Y_OFFSET,
  QUEST_FAILED_BUTTON_STEP_Y,
  QUEST_FAILED_BUTTON_X_OFFSET,
  QUEST_FAILED_BUTTON_Y_OFFSET,
  QUEST_FAILED_MESSAGE_X_OFFSET,
  QUEST_FAILED_MESSAGE_Y_OFFSET,
  QUEST_FAILED_PANEL_GEOM_X0,
  QUEST_FAILED_PANEL_GEOM_Y0,
  QUEST_FAILED_PANEL_H,
  QUEST_FAILED_PANEL_POS_X,
  QUEST_FAILED_PANEL_POS_Y,
  QUEST_FAILED_PANEL_SLIDE_DURATION_MS,
  QUEST_FAILED_PANEL_W,
  QUEST_FAILED_SCORE_X_OFFSET,
  QUEST_FAILED_SCORE_Y_OFFSET,

} from './shared.ts';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const KEY_ESCAPE = 27;
const KEY_ENTER = 13;
const KEY_Q = 81;
const MOUSE_BUTTON_LEFT = 0;

const WHITE = wgl.makeColor(1, 1, 1, 1);
const ORIGIN = wgl.makeVector2(0, 0);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type QuestFailedOutcome = QuestRunOutcome;

export interface QuestFailedScoreRecord {
  survivalElapsedMs: number;
  scoreXp: number;
}

export type QuestFailedState = GameState;

// ---------------------------------------------------------------------------
// QuestFailedView
// ---------------------------------------------------------------------------

export class QuestFailedView {
  private state: QuestFailedState;
  private _ground: { processPending(): void; draw(camera: Vec2): void } | null = null;
  private _outcome: QuestFailedOutcome | null = null;
  private _record: QuestFailedScoreRecord | null = null;
  private _questTitle: string = '';
  private _action: string | null = null;
  private _cursorPulseTime: number = 0.0;
  private _introMs: number = 0.0;
  private _closing: boolean = false;
  private _closeAction: string | null = null;
  private _retryButton: UiButtonState;
  private _questListButton: UiButtonState;
  private _mainMenuButton: UiButtonState;

  constructor(state: QuestFailedState) {
    this.state = state;
    this._retryButton = new UiButtonState('Play Again', { forceWide: true });
    this._questListButton = new UiButtonState('Play Another', { forceWide: true });
    this._mainMenuButton = new UiButtonState('Main Menu', { forceWide: true });
  }

  open(): void {
    this._action = null;
    this._ground = this.state.pauseBackground !== null ? null : (this.state.menuGround ?? null);
    this._cursorPulseTime = 0.0;
    this._introMs = 0.0;
    this._closing = false;
    this._closeAction = null;
    this._outcome = this.state.questOutcome as QuestFailedOutcome | null;
    this.state.questOutcome = null;
    this._questTitle = '';
    this._record = null;
    this._retryButton = new UiButtonState('Play Again', { forceWide: true });
    this._questListButton = new UiButtonState('Play Another', { forceWide: true });
    this._mainMenuButton = new UiButtonState('Main Menu', { forceWide: true });

    const outcome = this._outcome;
    if (outcome !== null) {
      const quest = questByLevel(outcome.level);
      this._questTitle = quest !== null ? quest.title : '';
    }

    this._buildScorePreview(outcome);
  }

  close(): void {
    this._ground = null;
    this._outcome = null;
    this._record = null;
    this._questTitle = '';
  }

  update(dt: number): void {
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, dt);
    }
    if (this._ground !== null) {
      this._ground.processPending();
    }
    const dtStep = Math.min(dt, 0.1);
    this._cursorPulseTime += dtStep * 1.1;
    const dtMs = dtStep * 1000.0;

    if (this._closing) {
      this._introMs = Math.max(0.0, this._introMs - dtMs);
      if (this._introMs <= 1e-3 && this._closeAction !== null) {
        this._action = this._closeAction;
        this._closeAction = null;
      }
      return;
    }
    this._introMs = Math.min(QUEST_FAILED_PANEL_SLIDE_DURATION_MS, this._introMs + dtMs);

    const outcome = this._outcome;
    if (InputState.wasKeyPressed(KEY_ESCAPE)) {
      this._activateMainMenu();
      return;
    }
    if (outcome !== null && InputState.wasKeyPressed(KEY_ENTER)) {
      this._activateRetry();
      return;
    }
    if (InputState.wasKeyPressed(KEY_Q)) {
      this._activatePlayAnother();
      return;
    }

    const panelTopLeft = this._panelTopLeft();
    if (outcome === null) return;

    const scale = 1.0;
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    const resources = this._requireResources();

    let buttonPos = panelTopLeft.add(new Vec2(
      QUEST_FAILED_BUTTON_X_OFFSET * scale,
      QUEST_FAILED_BUTTON_Y_OFFSET * scale,
    ));

    const retryW = buttonWidth(resources, this._retryButton.label, { scale, forceWide: this._retryButton.forceWide });
    if (buttonUpdate(this._retryButton, { pos: buttonPos, width: retryW, dtMs, mouse, click })) {
      this._activateRetry();
      return;
    }
    buttonPos = buttonPos.offset({ dy: QUEST_FAILED_BUTTON_STEP_Y * scale });

    const playAnotherW = buttonWidth(resources, this._questListButton.label, { scale, forceWide: this._questListButton.forceWide });
    if (buttonUpdate(this._questListButton, { pos: buttonPos, width: playAnotherW, dtMs, mouse, click })) {
      this._activatePlayAnother();
      return;
    }
    buttonPos = buttonPos.offset({ dy: QUEST_FAILED_BUTTON_STEP_Y * scale });

    const mainMenuW = buttonWidth(resources, this._mainMenuButton.label, { scale, forceWide: this._mainMenuButton.forceWide });
    if (buttonUpdate(this._mainMenuButton, { pos: buttonPos, width: mainMenuW, dtMs, mouse, click })) {
      this._activateMainMenu();
      return;
    }
  }

  draw(): void {
    wgl.clearBackground(wgl.makeColor(0, 0, 0, 1));
    const pauseBackground = this.state.pauseBackground;
    if (pauseBackground !== null) {
      pauseBackground.drawPauseBackground({ entityAlpha: this._worldEntityAlpha() });
    } else if (this._ground !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this._ground.draw(camera);
    }
    drawScreenFade(this.state);

    const panelTopLeft = this._panelTopLeft();
    const resources = this._requireResources();
    const panelTex = getTexture(resources, TextureId.UI_MENU_PANEL);
    const fxDetail = this.state.config.display.fxDetail[0];
    drawClassicMenuPanel(
      panelTex,
      { dst: wgl.makeRectangle(panelTopLeft.x, panelTopLeft.y, QUEST_FAILED_PANEL_W, QUEST_FAILED_PANEL_H),
        tint: WHITE, shadow: fxDetail },
    );

    // Reaper banner
    const reaperTex = getTexture(resources, TextureId.UI_TEXT_REAPER);
    const bannerPos = panelTopLeft.add(new Vec2(QUEST_FAILED_BANNER_X_OFFSET, QUEST_FAILED_BANNER_Y_OFFSET));
    wgl.drawTexturePro(
      reaperTex,
      wgl.makeRectangle(0.0, 0.0, reaperTex.width, reaperTex.height),
      wgl.makeRectangle(bannerPos.x, bannerPos.y, QUEST_FAILED_BANNER_W, QUEST_FAILED_BANNER_H),
      ORIGIN, 0.0, WHITE,
    );

    // Failure message
    const font = resources.smallFont;
    const textColor = wgl.makeColor(235 / 255, 235 / 255, 235 / 255, 1.0);
    const msgPos = panelTopLeft.add(new Vec2(QUEST_FAILED_MESSAGE_X_OFFSET, QUEST_FAILED_MESSAGE_Y_OFFSET));
    drawSmallText(font, this._failureMessage(), msgPos, textColor);

    // Score preview
    this._drawScorePreview(font, panelTopLeft);

    // Buttons
    const scale = 1.0;
    let buttonPos = panelTopLeft.add(new Vec2(QUEST_FAILED_BUTTON_X_OFFSET, QUEST_FAILED_BUTTON_Y_OFFSET));

    const retryW = buttonWidth(resources, this._retryButton.label, { scale, forceWide: this._retryButton.forceWide });
    buttonDraw(resources, this._retryButton, { pos: buttonPos, width: retryW, scale });
    buttonPos = buttonPos.offset({ dy: QUEST_FAILED_BUTTON_STEP_Y });

    const playAnotherW = buttonWidth(resources, this._questListButton.label, { scale, forceWide: this._questListButton.forceWide });
    buttonDraw(resources, this._questListButton, { pos: buttonPos, width: playAnotherW, scale });
    buttonPos = buttonPos.offset({ dy: QUEST_FAILED_BUTTON_STEP_Y });

    const mainMenuW = buttonWidth(resources, this._mainMenuButton.label, { scale, forceWide: this._mainMenuButton.forceWide });
    buttonDraw(resources, this._mainMenuButton, { pos: buttonPos, width: mainMenuW, scale });

    // Menu cursor
    const particles = getTexture(resources, TextureId.PARTICLES);
    const cursorTex = getTexture(resources, TextureId.UI_CURSOR);
    const [mx, my] = InputState.mousePosition();
    drawMenuCursor(particles, cursorTex, { pos: new Vec2(mx, my), pulseTime: this._cursorPulseTime });
  }

  takeAction(): string | null {
    const action = this._action;
    this._action = null;
    return action;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _requireResources(): RuntimeResources {
    if (this.state.resources === null) {
      throw new Error('runtime resources are not loaded');
    }
    return this.state.resources;
  }

  private _panelOrigin(): Vec2 {
    const screenW = this.state.config.display.width;
    const widescreenShiftY = menuWidescreenYShift(screenW);
    return new Vec2(
      QUEST_FAILED_PANEL_GEOM_X0 + QUEST_FAILED_PANEL_POS_X,
      QUEST_FAILED_PANEL_GEOM_Y0 + QUEST_FAILED_PANEL_POS_Y + widescreenShiftY,
    );
  }

  private _panelSlideX(): number {
    if (QUEST_FAILED_PANEL_SLIDE_DURATION_MS <= 1e-6) return 0.0;
    let t = this._introMs / QUEST_FAILED_PANEL_SLIDE_DURATION_MS;
    if (t < 0.0) t = 0.0;
    else if (t > 1.0) t = 1.0;
    const eased = 1.0 - (1.0 - t) ** 3;
    return -QUEST_FAILED_PANEL_W * (1.0 - eased);
  }

  private _worldEntityAlpha(): number {
    if (!this._closing) return 1.0;
    if (QUEST_FAILED_PANEL_SLIDE_DURATION_MS <= 1e-6) return 0.0;
    let alpha = this._introMs / QUEST_FAILED_PANEL_SLIDE_DURATION_MS;
    if (alpha < 0.0) return 0.0;
    if (alpha > 1.0) return 1.0;
    return alpha;
  }

  private _panelTopLeft(): Vec2 {
    return this._panelOrigin().offset({ dx: this._panelSlideX() });
  }

  private _failureMessage(): string {
    const retryCount = int(this.state.questFailRetryCount);
    if (retryCount === 1) return "You didn't make it, do try again.";
    if (retryCount === 2) return 'Third time no good.';
    if (retryCount === 3) return "No luck this time, have another go?";
    if (retryCount === 4) {
      if (this.state.preserveBugs) return 'Persistence will be rewared.';
      return 'Persistence will be rewarded.';
    }
    if (retryCount === 5) return 'Try one more time?';
    return 'Quest failed, try again.';
  }

  private _buildScorePreview(outcome: QuestFailedOutcome | null): void {
    this._record = null;
    if (outcome === null) return;

    const level = outcome.level;
    const elapsed = Math.max(1, int(outcome.baseTimeMs));
    const xp = int(outcome.experience);

    this._record = {
      survivalElapsedMs: elapsed,
      scoreXp: xp,
    };
  }

  private _activateRetry(): void {
    const outcome = this._outcome;
    if (outcome === null) return;
    this.state.questFailRetryCount = int(this.state.questFailRetryCount) + 1;
    const level = outcome.level;
    this.state.pendingQuestLevel = level;
    this.state.config.gameplay.mode = GameMode.QUESTS;
    this.state.config.gameplay.questLevel = level;
    try {
      (this.state.config as CrimsonConfig & { save?(): void }).save?.();
    } catch (exc) {
      this.state.console.log.log(`quest failed: failed to save quest selection config: ${exc}`);
    }
    if (this.state.audio !== null) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
    }
    this._beginClose('start_quest');
  }

  private _activatePlayAnother(): void {
    this.state.questFailRetryCount = 0;
    if (this.state.audio !== null) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
    }
    this._beginClose('open_quests');
  }

  private _activateMainMenu(): void {
    this.state.questFailRetryCount = 0;
    if (this.state.audio !== null) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
    }
    this._beginClose('back_to_menu');
  }

  private _beginClose(action: string): void {
    if (this._closing) return;
    this._closing = true;
    this._closeAction = action;
  }

  private _textWidth(text: string): number {
    return measureSmallTextWidth(this._requireResources().smallFont, text);
  }

  private _drawScorePreview(font: SmallFontData, panelTopLeft: Vec2): void {
    const record = this._record;
    if (record === null) return;

    const scorePos = panelTopLeft.add(new Vec2(QUEST_FAILED_SCORE_X_OFFSET, QUEST_FAILED_SCORE_Y_OFFSET));

    const labelColor = wgl.makeColor(230 / 255, 230 / 255, 230 / 255, 0.8);
    const valueColor = wgl.makeColor(230 / 255, 230 / 255, 255 / 255, 1.0);
    const separatorColor = wgl.makeColor(149 / 255, 175 / 255, 198 / 255, 0.7);

    const scoreLabel = 'Score';
    const scoreLabelW = this._textWidth(scoreLabel);
    drawSmallText(font, scoreLabel, scorePos.offset({ dx: 32.0 - scoreLabelW * 0.5 }), labelColor);

    const scoreValue = `${(record.survivalElapsedMs * 0.001).toFixed(2)} secs`;
    const scoreValueW = this._textWidth(scoreValue);
    drawSmallText(font, scoreValue, scorePos.add(new Vec2(32.0 - scoreValueW * 0.5, 15.0)), valueColor);

    // Vertical separator
    const sepPos = scorePos.offset({ dx: 80.0 });
    wgl.drawRectangle(
      int(sepPos.x), int(sepPos.y),
      1, 48,
      separatorColor,
    );

    // Experience column
    const col2Pos = scorePos.offset({ dx: 96.0 });
    drawSmallText(font, 'Experience', col2Pos, valueColor);
    const xpValue = `${record.scoreXp}`;
    const xpW = this._textWidth(xpValue);
    drawSmallText(font, xpValue, col2Pos.add(new Vec2(32.0 - xpW * 0.5, 15.0)), labelColor);

    // Horizontal separator
    const linePos = scorePos.add(new Vec2(-16.0, 52.0));
    wgl.drawRectangle(
      int(linePos.x), int(linePos.y),
      192, 1,
      separatorColor,
    );
  }
}
