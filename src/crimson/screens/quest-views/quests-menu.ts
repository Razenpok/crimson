// Port of crimson/screens/quest_views/quests_menu.py

import * as wgl from '@wgl';
import { Vec2, Rect } from '@grim/geom.ts';

import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText, measureSmallTextWidth } from '@grim/fonts/small.ts';
import { InputState } from '@grim/input.ts';
import { type AudioState, audioPlaySfx, audioUpdate } from '@grim/audio.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { QuestLevel } from '@crimson/quests/level.ts';
import { questByLevel } from '@crimson/quests/index.ts';
import { questGamesCounterIndex, questCompletedCounterIndex } from '@crimson/quests/status.ts';
import { drawClassicMenuPanel } from '@crimson/ui/menu-panel.ts';
import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { menuWidescreenYShift } from '@crimson/ui/layout.ts';
import {
  UiButtonState,
  buttonDraw,
  buttonUpdate,
  buttonWidth,
} from '@crimson/ui/perk-menu.ts';
import {
  MENU_PANEL_OFFSET_Y,
  MENU_PANEL_WIDTH,
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
  MENU_SIGN_WIDTH,
  MENU_SIGN_HEIGHT,
  MENU_SIGN_OFFSET_X,
  MENU_SIGN_OFFSET_Y,
  MENU_SIGN_POS_Y,
  MENU_SIGN_POS_Y_SMALL,
  MENU_SIGN_POS_X_PAD,
  MENU_SCALE_SMALL_THRESHOLD,
  uiElementAnim,
  signLayoutScale,
} from '@crimson/screens/panels/base.ts';
import { UI_SHADOW_OFFSET, drawUiQuadShadow } from '@crimson/ui/shadow.ts';
import { drawScreenFade } from '@crimson/screens/transitions.ts';
import type { QuestMenuLayout } from './shared.ts';
import {
  QUEST_MENU_BASE_X,
  QUEST_MENU_BASE_Y,
  QUEST_MENU_PANEL_OFFSET_X,
  QUEST_TITLE_X_OFFSET,
  QUEST_TITLE_Y_OFFSET,
  QUEST_TITLE_W,
  QUEST_TITLE_H,
  QUEST_STAGE_ICON_X_OFFSET,
  QUEST_STAGE_ICON_Y_OFFSET,
  QUEST_STAGE_ICON_SIZE,
  QUEST_STAGE_ICON_STEP,
  QUEST_STAGE_ICON_SCALE_UNSELECTED,
  QUEST_LIST_Y_OFFSET,
  QUEST_LIST_ROW_STEP,
  QUEST_LIST_NAME_X_OFFSET,
  QUEST_LIST_HOVER_LEFT_PAD,
  QUEST_LIST_HOVER_RIGHT_PAD,
  QUEST_LIST_HOVER_TOP_PAD,
  QUEST_LIST_HOVER_BOTTOM_PAD,
  QUEST_HARDCORE_UNLOCK_INDEX,
  QUEST_HARDCORE_CHECKBOX_X_OFFSET,
  QUEST_HARDCORE_CHECKBOX_Y_OFFSET,
  QUEST_HARDCORE_LIST_Y_SHIFT,
  QUEST_BACK_BUTTON_X_OFFSET,
  QUEST_BACK_BUTTON_Y_OFFSET,
  QUEST_PANEL_HEIGHT,
} from './shared.ts';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const KEY_ESCAPE = 27;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_ENTER = 13;
const KEY_F1 = 112;
const KEY_F5 = 116;
const KEY_0 = 48;
const KEY_1 = 49;
const KEY_2 = 50;
const KEY_3 = 51;
const KEY_4 = 52;
const KEY_5 = 53;
const KEY_6 = 54;
const KEY_7 = 55;
const KEY_8 = 56;
const KEY_9 = 57;
const MOUSE_BUTTON_LEFT = 0;

const WHITE = wgl.makeColor(1, 1, 1, 1);
const ORIGIN = wgl.makeVector2(0, 0);

const FADE_TO_GAME_ACTIONS = new Set([
  'start_survival',
  'start_rush',
  'start_typo',
  'start_tutorial',
  'start_quest',
]);

// ---------------------------------------------------------------------------
// QuestsMenuState — the state consumed by the quests menu
// ---------------------------------------------------------------------------

export interface QuestsMenuStatus {
  questUnlockIndex: number;
  questUnlockIndexFull: number;
  questPlayCount(index: number): number;
  incrementQuestPlayCount(index: number): void;
  modePlayCountForMode(mode: GameMode): number;
  modePlayOther: number;
  gameSequenceId: number;
  unknownTail: Uint8Array;
  saveIfDirty(): void;
}

export interface QuestsMenuState {
  config: {
    display: {
      width: number;
      height: number;
      fxDetail: [boolean, boolean, boolean];
    };
    gameplay: {
      mode: number;
      hardcore: boolean;
      questLevel: QuestLevel | null;
    };
    save(): void;
  };
  audio: AudioState | null;
  resources: RuntimeResources | null;
  menuSignLocked: boolean;
  menuGround: { processPending(): void; draw(camera: Vec2): void } | null;
  menuGroundCamera: Vec2 | null;
  screenFadeAlpha: number;
  screenFadeRamp: boolean;
  pauseBackground: { drawPauseBackground(): void } | null;
  demoEnabled: boolean;
  debugEnabled: boolean;
  pendingQuestLevel: QuestLevel | null;
  status: QuestsMenuStatus;
  console: { log: { log(msg: string): void } };
}

// ---------------------------------------------------------------------------
// QuestsMenuView
// ---------------------------------------------------------------------------

export class QuestsMenuView {
  private state: QuestsMenuState;

  private _isOpen: boolean = false;
  private _ground: { processPending(): void; draw(camera: Vec2): void } | null = null;
  private _backButton: UiButtonState;

  private _menuScreenWidth: number = 0;
  private _widescreenYShift: number = 0.0;

  private _stage: number = 1;
  private _action: string | null = null;
  private _dirty: boolean = false;
  private _cursorPulseTime: number = 0.0;
  _timelineMs: number = 0;
  private _timelineMaxMs: number = PANEL_TIMELINE_START_MS;
  private _closing: boolean = false;
  private _closeAction: string | null = null;
  private _panelOpenSfxPlayed: boolean = false;

  constructor(state: QuestsMenuState) {
    this.state = state;
    this._backButton = new UiButtonState('Back');
  }

  open(): void {
    const layoutW = this.state.config.display.width;
    this._menuScreenWidth = int(layoutW);
    this._widescreenYShift = menuWidescreenYShift(layoutW);
    this._ground = this.state.pauseBackground !== null ? null : (this.state.menuGround ?? null);
    this._action = null;
    this._dirty = false;
    this._stage = Math.max(1, Math.min(5, int(this._stage)));
    this._cursorPulseTime = 0.0;
    this._timelineMs = 0;
    this._timelineMaxMs = PANEL_TIMELINE_START_MS;
    this._closing = false;
    this._closeAction = null;
    this._panelOpenSfxPlayed = false;
    this._backButton = new UiButtonState('Back');
    this._isOpen = true;
  }

  close(): void {
    this._isOpen = false;
    this._ground = null;
    if (this._dirty) {
      try {
        this.state.config.save();
      } catch (exc) {
        this.state.console.log.log(`failed to save quest menu config: ${exc}`);
      }
      this._dirty = false;
    }
  }

  update(dt: number): void {
    this._assertOpen();

    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, dt);
    }
    if (this.state.menuGround !== null) {
      this.state.menuGround.processPending();
    }

    this._cursorPulseTime += Math.min(dt, 0.1) * 1.1;
    const dtMs = int(Math.min(dt, 0.1) * 1000.0);

    if (this._closing) {
      if (dtMs > 0 && this._action === null) {
        this._timelineMs -= dtMs;
        if (this._timelineMs < 0 && this._closeAction !== null) {
          this._action = this._closeAction;
          this._closeAction = null;
        }
      }
      return;
    }

    if (dtMs > 0) {
      this._timelineMs = Math.min(this._timelineMaxMs, this._timelineMs + dtMs);
      if (this._timelineMs >= this._timelineMaxMs) {
        this.state.menuSignLocked = true;
        if (!this._panelOpenSfxPlayed && this.state.audio !== null) {
          audioPlaySfx(this.state.audio, SfxId.UI_PANELCLICK);
          this._panelOpenSfxPlayed = true;
        }
      }
    }

    const config = this.state.config;
    const status = this.state.status;

    // The original forcibly clears hardcore in the demo build.
    if (this.state.demoEnabled) {
      if (config.gameplay.hardcore) {
        config.gameplay.hardcore = false;
        this._dirty = true;
      }
    }

    // Debug: unlock all quests
    if (this.state.debugEnabled && InputState.wasKeyPressed(KEY_F5)) {
      const unlock = 49;
      if (int(status.questUnlockIndex) < unlock) {
        status.questUnlockIndex = unlock;
      }
      if (int(status.questUnlockIndexFull) < unlock) {
        status.questUnlockIndexFull = unlock;
      }
      this.state.console.log.log('debug: unlocked all quests');
    }

    const enabled = this._timelineMs >= this._timelineMaxMs;

    if (InputState.wasKeyPressed(KEY_ESCAPE) && enabled) {
      this._beginCloseTransition('open_play_game');
      return;
    }

    if (!enabled) return;

    if (InputState.wasKeyPressed(KEY_LEFT)) {
      this._stage = Math.max(1, this._stage - 1);
    }
    if (InputState.wasKeyPressed(KEY_RIGHT)) {
      this._stage = Math.min(5, this._stage + 1);
    }

    const layout = this._layout();

    // Stage icons: hover is tracked, but stage selection requires a click.
    const hoveredStage = this._hoveredStage(layout);
    if (hoveredStage !== null && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._stage = hoveredStage;
      return;
    }

    if (this._hardcoreCheckboxClicked(layout)) {
      return;
    }

    const resources = this._requireResources();
    const backPos = new Vec2(
      layout.listPos.x + QUEST_BACK_BUTTON_X_OFFSET,
      this._rowsY0(layout) + QUEST_BACK_BUTTON_Y_OFFSET,
    );
    const dtMsF = Math.min(dt, 0.1) * 1000.0;
    const backW = buttonWidth(resources, this._backButton.label, { scale: 1.0, forceWide: this._backButton.forceWide });
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    if (buttonUpdate(this._backButton, { pos: backPos, width: backW, dtMs: dtMsF, mouse, click })) {
      this._beginCloseTransition('open_play_game');
      return;
    }

    // Quick-select row numbers 1..0 (10).
    const rowFromKey = this._digitRowPressed();
    if (rowFromKey !== null) {
      this._tryStartQuest(this._stage, rowFromKey);
      return;
    }

    const hoveredRow = this._hoveredRow(layout);
    if (hoveredRow !== null && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._tryStartQuest(this._stage, hoveredRow);
      return;
    }

    if (hoveredRow !== null && InputState.wasKeyPressed(KEY_ENTER)) {
      this._tryStartQuest(this._stage, hoveredRow);
      return;
    }
  }

  draw(): void {
    this._assertOpen();
    wgl.clearBackground(wgl.makeColor(0, 0, 0, 1));

    const pauseBackground = this.state.pauseBackground;
    if (pauseBackground !== null) {
      pauseBackground.drawPauseBackground();
    } else if (this.state.menuGround !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this.state.menuGround.draw(camera);
    }

    drawScreenFade(this.state);

    this._drawPanel();
    this._drawSign();
    this._drawContents();

    const resources = this._requireResources();
    const particles = getTexture(resources, TextureId.PARTICLES);
    const cursorTex = getTexture(resources, TextureId.UI_CURSOR);
    const [mx, my] = InputState.mousePosition();
    drawMenuCursor(particles, cursorTex, { pos: new Vec2(mx, my), pulseTime: this._cursorPulseTime });
  }

  takeAction(): string | null {
    this._assertOpen();
    const action = this._action;
    this._action = null;
    return action;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _assertOpen(): void {
    if (!this._isOpen) {
      throw new Error('QuestsMenuView must be opened before use');
    }
  }

  private _requireResources(): RuntimeResources {
    if (this.state.resources === null) {
      throw new Error('runtime resources are not loaded');
    }
    return this.state.resources;
  }

  private _layout(): QuestMenuLayout {
    const [_angleRad, slideX] = uiElementAnim(
      this,
      1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      MENU_PANEL_WIDTH,
    );
    const xSum = QUEST_MENU_BASE_X + slideX + QUEST_MENU_PANEL_OFFSET_X;
    const ySum = QUEST_MENU_BASE_Y + MENU_PANEL_OFFSET_Y + this._widescreenYShift;

    const titlePos = new Vec2(xSum + QUEST_TITLE_X_OFFSET, ySum + QUEST_TITLE_Y_OFFSET);
    const iconsStartPos = titlePos.add(new Vec2(QUEST_STAGE_ICON_X_OFFSET, QUEST_STAGE_ICON_Y_OFFSET));
    const lastIconX = iconsStartPos.x + QUEST_STAGE_ICON_STEP * 4.0;
    const listPos = new Vec2(lastIconX - 208.0 + 16.0, titlePos.y + QUEST_LIST_Y_OFFSET);
    return { titlePos, iconsStartPos, listPos };
  }

  private _hoveredStage(layout: QuestMenuLayout): number | null {
    const titleY = layout.titlePos.y;
    const x0 = layout.iconsStartPos.x;
    const [mx, my] = InputState.mousePosition();
    for (let stage = 1; stage <= 5; stage++) {
      const x = x0 + (stage - 1) * QUEST_STAGE_ICON_STEP;
      const stageRect = Rect.fromTopLeft(new Vec2(x, titleY), QUEST_STAGE_ICON_SIZE, QUEST_STAGE_ICON_SIZE);
      if (stageRect.contains({ x: mx, y: my })) {
        return stage;
      }
    }
    return null;
  }

  private _hardcoreCheckboxClicked(layout: QuestMenuLayout): boolean {
    const status = this.state.status;
    if (int(status.questUnlockIndex) < QUEST_HARDCORE_UNLOCK_INDEX) {
      return false;
    }
    const resources = this._requireResources();
    const checkOn = getTexture(resources, TextureId.UI_CHECK_ON);
    const config = this.state.config;
    const hardcore = config.gameplay.hardcore;

    const font = resources.smallFont;
    const label = 'Hardcore';
    const labelW = measureSmallTextWidth(font, label);

    const checkPos = new Vec2(
      layout.listPos.x + QUEST_HARDCORE_CHECKBOX_X_OFFSET,
      layout.listPos.y + QUEST_HARDCORE_CHECKBOX_Y_OFFSET,
    );
    const rectW = checkOn.width + 6.0 + labelW;
    const rectH = Math.max(checkOn.height, font.cellSize);

    const [mx, my] = InputState.mousePosition();
    const hovered = Rect.fromTopLeft(checkPos, rectW, rectH).contains({ x: mx, y: my });
    if (hovered && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      config.gameplay.hardcore = !hardcore;
      this._dirty = true;
      if (this.state.demoEnabled) {
        config.gameplay.hardcore = false;
      }
      return true;
    }
    return false;
  }

  private _digitRowPressed(): number | null {
    const keys: [number, number][] = [
      [KEY_1, 0], [KEY_2, 1], [KEY_3, 2], [KEY_4, 3], [KEY_5, 4],
      [KEY_6, 5], [KEY_7, 6], [KEY_8, 7], [KEY_9, 8], [KEY_0, 9],
    ];
    for (const [key, row] of keys) {
      if (InputState.wasKeyPressed(key)) {
        return row;
      }
    }
    return null;
  }

  private _rowsY0(layout: QuestMenuLayout): number {
    const status = this.state.status;
    let y0 = layout.listPos.y;
    if (int(status.questUnlockIndex) >= QUEST_HARDCORE_UNLOCK_INDEX) {
      y0 += QUEST_HARDCORE_LIST_Y_SHIFT;
    }
    return y0;
  }

  private _hoveredRow(layout: QuestMenuLayout): number | null {
    const listX = layout.listPos.x;
    const y0 = this._rowsY0(layout);
    const [mx, my] = InputState.mousePosition();
    for (let row = 0; row < 10; row++) {
      const y = y0 + row * QUEST_LIST_ROW_STEP;
      const left = listX - QUEST_LIST_HOVER_LEFT_PAD;
      const top = y - QUEST_LIST_HOVER_TOP_PAD;
      const right = listX + QUEST_LIST_HOVER_RIGHT_PAD;
      const bottom = y + QUEST_LIST_HOVER_BOTTOM_PAD;
      const rowRect = Rect.fromTopLeft(new Vec2(left, top), right - left, bottom - top);
      if (rowRect.contains({ x: mx, y: my })) {
        return row;
      }
    }
    return null;
  }

  private _questUnlocked(stage: number, row: number): boolean {
    const status = this.state.status;
    const config = this.state.config;
    let unlock = int(status.questUnlockIndex);
    if (config.gameplay.hardcore) {
      unlock = int(status.questUnlockIndexFull);
    }
    const level = new QuestLevel(int(stage), int(row) + 1);
    return unlock >= level.globalIndex;
  }

  private _tryStartQuest(stage: number, row: number): void {
    if (!this._questUnlocked(stage, row)) return;
    const level = new QuestLevel(int(stage), int(row) + 1);
    this.state.pendingQuestLevel = level;
    this.state.config.gameplay.mode = GameMode.QUESTS;
    this.state.config.gameplay.questLevel = level;
    this._dirty = true;
    this._beginCloseTransition('start_quest');
  }

  private _questTitle(stage: number, row: number): string {
    const level = new QuestLevel(int(stage), int(row) + 1);
    const quest = questByLevel(level);
    if (quest === null) return '???';
    return quest.title;
  }

  private _questRowColors(hardcore: boolean): [wgl.Color, wgl.Color] {
    let r: number, g: number, b: number;
    if (hardcore) {
      r = 250; g = 70; b = 60;
    } else {
      r = 70; g = 180; b = 240;
    }
    const baseColor = wgl.makeColor(r / 255, g / 255, b / 255, 153 / 255);
    const hoverColor = wgl.makeColor(r / 255, g / 255, b / 255, 1.0);
    return [baseColor, hoverColor];
  }

  private _questCounts(stage: number, row: number): [number, number] | null {
    const level = new QuestLevel(int(stage), int(row) + 1);
    const globalIndex = level.globalIndex;
    const status = this.state.status;
    const gamesIdx = questGamesCounterIndex(level);
    const completedIdx = questCompletedCounterIndex(level);

    let games: number;
    try {
      games = int(status.questPlayCount(gamesIdx));
    } catch {
      return null;
    }

    let completed: number;
    try {
      completed = int(status.questPlayCount(completedIdx));
    } catch {
      if (int(stage) !== 5) return null;
      const tailSlot = globalIndex - 40;
      if (tailSlot === 0) {
        completed = int(status.modePlayCountForMode(GameMode.SURVIVAL));
      } else if (tailSlot === 1) {
        completed = int(status.modePlayCountForMode(GameMode.RUSH));
      } else if (tailSlot === 2) {
        completed = int(status.modePlayCountForMode(GameMode.TYPO));
      } else if (tailSlot === 3) {
        completed = int(status.modePlayOther);
      } else if (tailSlot === 4) {
        completed = int(status.gameSequenceId);
      } else if (tailSlot >= 5 && tailSlot <= 8) {
        const tail = status.unknownTail;
        const off = (tailSlot - 5) * 4;
        if (tail.length < off + 4) {
          completed = 0;
        } else {
          completed =
            (tail[off] | (tail[off + 1] << 8) | (tail[off + 2] << 16) | (tail[off + 3] << 24)) >>> 0;
        }
      } else {
        completed = 0;
      }
    }
    return [completed, games];
  }

  private _drawContents(): void {
    const resources = this._requireResources();
    const layout = this._layout();
    const titlePos = layout.titlePos;
    const iconsStartPos = layout.iconsStartPos;
    const listPos = layout.listPos;

    let stage = int(this._stage);
    if (stage < 1) stage = 1;
    if (stage > 5) stage = 5;

    const hoveredStage = this._hoveredStage(layout);
    const hoveredRow = this._hoveredRow(layout);
    const showCounts = this.state.debugEnabled && InputState.isKeyDown(KEY_F1);

    // Title texture tinted (0.7, 0.7, 0.7, 0.7).
    const titleTex = getTexture(resources, TextureId.UI_TEXT_QUEST);
    const titleTint = wgl.makeColor(179 / 255, 179 / 255, 179 / 255, 179 / 255);
    wgl.drawTexturePro(
      titleTex,
      wgl.makeRectangle(0.0, 0.0, titleTex.width, titleTex.height),
      wgl.makeRectangle(titlePos.x, titlePos.y, QUEST_TITLE_W, QUEST_TITLE_H),
      ORIGIN, 0.0, titleTint,
    );

    // Stage icons (1..5).
    const hoverTint = wgl.makeColor(1.0, 1.0, 1.0, 204 / 255);
    const baseTint = wgl.makeColor(179 / 255, 179 / 255, 179 / 255, 179 / 255);
    const selectedTint = WHITE;
    const stageIconIds: TextureId[] = [
      TextureId.UI_NUM1, TextureId.UI_NUM2, TextureId.UI_NUM3, TextureId.UI_NUM4, TextureId.UI_NUM5,
    ];
    for (let idx = 1; idx <= 5; idx++) {
      const icon = getTexture(resources, stageIconIds[idx - 1]);
      const x = iconsStartPos.x + (idx - 1) * QUEST_STAGE_ICON_STEP;
      const localScale = idx === stage ? 1.0 : QUEST_STAGE_ICON_SCALE_UNSELECTED;
      const size = QUEST_STAGE_ICON_SIZE * localScale;
      let tint = baseTint;
      if (hoveredStage === idx) tint = hoverTint;
      if (idx === stage) tint = selectedTint;
      wgl.drawTexturePro(
        icon,
        wgl.makeRectangle(0.0, 0.0, icon.width, icon.height),
        wgl.makeRectangle(x, iconsStartPos.y, size, size),
        ORIGIN, 0.0, tint,
      );
    }

    const config = this.state.config;
    const status = this.state.status;
    const hardcoreFlag = config.gameplay.hardcore;
    const [baseColor, hoverColor] = this._questRowColors(hardcoreFlag);

    const font = resources.smallFont;
    const y0 = this._rowsY0(layout);

    // Hardcore checkbox (only drawn once tier5 is reachable in normal mode).
    if (int(status.questUnlockIndex) >= QUEST_HARDCORE_UNLOCK_INDEX) {
      const checkTex = hardcoreFlag
        ? getTexture(resources, TextureId.UI_CHECK_ON)
        : getTexture(resources, TextureId.UI_CHECK_OFF);
      const checkPos = new Vec2(
        listPos.x + QUEST_HARDCORE_CHECKBOX_X_OFFSET,
        listPos.y + QUEST_HARDCORE_CHECKBOX_Y_OFFSET,
      );
      wgl.drawTexturePro(
        checkTex,
        wgl.makeRectangle(0.0, 0.0, checkTex.width, checkTex.height),
        wgl.makeRectangle(checkPos.x, checkPos.y, checkTex.width, checkTex.height),
        ORIGIN, 0.0, WHITE,
      );
      drawSmallText(
        font, 'Hardcore',
        new Vec2(checkPos.x + checkTex.width + 6.0, checkPos.y + 1.0),
        baseColor,
      );
    }

    // Quest list (10 rows).
    for (let row = 0; row < 10; row++) {
      const y = y0 + row * QUEST_LIST_ROW_STEP;
      const unlocked = this._questUnlocked(stage, row);
      const color = hoveredRow === row ? hoverColor : baseColor;

      drawSmallText(font, `${stage}.${row + 1}`, new Vec2(listPos.x, y), color);

      const title = unlocked ? this._questTitle(stage, row) : '???';
      drawSmallText(font, title, new Vec2(listPos.x + QUEST_LIST_NAME_X_OFFSET, y), color);
      const titleW = unlocked ? measureSmallTextWidth(font, title) : 0.0;
      if (unlocked) {
        const lineY = y + 13.0;
        wgl.drawRectangle(
          int(listPos.x), int(lineY),
          int(listPos.x + titleW + 32.0) - int(listPos.x), 1,
          color,
        );
      }

      if (showCounts && unlocked) {
        const counts = this._questCounts(stage, row);
        if (counts !== null) {
          const [completed, games] = counts;
          const countsX = listPos.x + QUEST_LIST_NAME_X_OFFSET + titleW + 12.0;
          drawSmallText(font, `(${completed}/${games})`, new Vec2(countsX, y), color);
        }
      }
    }

    if (showCounts) {
      const headerX = listPos.x + 96.0;
      const headerY = y0 + QUEST_LIST_ROW_STEP * 10.0 - 2.0;
      drawSmallText(font, '(completed/games)', new Vec2(headerX, headerY), baseColor);
    }

    // Back button.
    const backPos = new Vec2(
      listPos.x + QUEST_BACK_BUTTON_X_OFFSET,
      y0 + QUEST_BACK_BUTTON_Y_OFFSET,
    );
    const backW = buttonWidth(resources, this._backButton.label, { scale: 1.0, forceWide: this._backButton.forceWide });
    buttonDraw(resources, this._backButton, { pos: backPos, width: backW, scale: 1.0 });
  }

  private _drawSign(): void {
    const resources = this._requireResources();
    const screenW = this.state.config.display.width;
    const [scale, shiftX] = signLayoutScale(int(screenW));
    const signPos = new Vec2(
      screenW + MENU_SIGN_POS_X_PAD,
      screenW > MENU_SCALE_SMALL_THRESHOLD ? MENU_SIGN_POS_Y : MENU_SIGN_POS_Y_SMALL,
    );
    const signW = MENU_SIGN_WIDTH * scale;
    const signH = MENU_SIGN_HEIGHT * scale;
    const offsetX = MENU_SIGN_OFFSET_X * scale + shiftX;
    const offsetY = MENU_SIGN_OFFSET_Y * scale;
    let rotationDeg = 0.0;

    if (!this.state.menuSignLocked) {
      const [angleRad, _slideX] = uiElementAnim(
        this,
        0,
        300,
        0,
        signW,
      );
      rotationDeg = angleRad * (180.0 / Math.PI);
    }

    const sign = getTexture(resources, TextureId.UI_SIGN_CRIMSON);
    const fxDetail = this.state.config.display.fxDetail[0];
    const signSrc = wgl.makeRectangle(0.0, 0.0, sign.width, sign.height);
    const signOrigin = wgl.makeVector2(-offsetX, -offsetY);

    if (fxDetail) {
      drawUiQuadShadow({
        texture: sign,
        src: signSrc,
        dst: wgl.makeRectangle(signPos.x + UI_SHADOW_OFFSET, signPos.y + UI_SHADOW_OFFSET, signW, signH),
        origin: signOrigin, rotationDeg,
      });
    }
    wgl.drawTexturePro(
      sign, signSrc,
      wgl.makeRectangle(signPos.x, signPos.y, signW, signH),
      signOrigin, rotationDeg, WHITE,
    );
  }

  private _drawPanel(): void {
    const resources = this._requireResources();
    const [_angleRad, slideX] = uiElementAnim(
      this,
      1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      MENU_PANEL_WIDTH,
    );
    const fxDetail = this.state.config.display.fxDetail[0];
    const panelTex = getTexture(resources, TextureId.UI_MENU_PANEL);
    drawClassicMenuPanel(
      panelTex,
      {
        dst: wgl.makeRectangle(
          QUEST_MENU_BASE_X + slideX + QUEST_MENU_PANEL_OFFSET_X,
          QUEST_MENU_BASE_Y + MENU_PANEL_OFFSET_Y + this._widescreenYShift,
          MENU_PANEL_WIDTH,
          QUEST_PANEL_HEIGHT,
        ),
        tint: WHITE, shadow: fxDetail,
      },
    );
  }

  private _beginCloseTransition(action: string): void {
    if (this._closing) return;
    if (FADE_TO_GAME_ACTIONS.has(action)) {
      this.state.screenFadeAlpha = 0.0;
      this.state.screenFadeRamp = true;
    }
    if (this.state.audio !== null) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
    }
    this._closing = true;
    this._closeAction = action;
  }
}
