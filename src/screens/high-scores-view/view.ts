// Port of crimson/screens/high_scores_view/view.py

import { type WebGLContext } from '../../engine/webgl.ts';
import { Vec2, Rect } from '../../engine/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '../../engine/assets.ts';
import { type SmallFontData } from '../../engine/assets.ts';
import { measureSmallTextWidth } from '../../engine/fonts/small.ts';
import { audioPlaySfx, audioUpdate } from '../../engine/audio.ts';
import { SfxId } from '../../engine/sfx-map.ts';
import { type GroundRenderer } from '../../engine/terrain-render.ts';
import { InputState } from '../../engine/input.ts';
import { GameMode } from '../../game/game-modes.ts';
import type { GameState, HighScoresRequest } from '../../game/types.ts';
import type { QuestLevel } from '../../game/quests/level.ts';
import { questLevelGlobalIndex, questLevelFromGlobalIndex } from '../../game/quests/level.ts';
import { HighScoreDateMode } from '../../engine/config.ts';
import { drawClassicMenuPanel } from '../../ui/menu-panel.ts';
import { UiButtonState, buttonUpdate, buttonWidth } from '../../ui/perk-menu.ts';
import { drawMenuCursor } from '../../ui/cursor.ts';
import { menuWidescreenYShift, type DropdownLayoutBase } from '../../ui/layout.ts';
import { UI_SHADOW_OFFSET, drawUiQuadShadow } from '../../ui/shadow.ts';
import { requireRuntimeResources } from '../assets.ts';
import { drawScreenFade } from '../transitions.ts';
import { mouseInsideRectWithPadding } from '../panels/hit-test.ts';
import {
  uiElementAnim,
  signLayoutScale,
  MENU_PANEL_WIDTH,
  MENU_PANEL_OFFSET_X,
  MENU_PANEL_OFFSET_Y,
  MENU_SCALE_SMALL_THRESHOLD,
  MENU_SIGN_WIDTH,
  MENU_SIGN_HEIGHT,
  MENU_SIGN_OFFSET_X,
  MENU_SIGN_OFFSET_Y,
  MENU_SIGN_POS_X_PAD,
  MENU_SIGN_POS_Y,
  MENU_SIGN_POS_Y_SMALL,
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
} from '../panels/base.ts';
import {
  HS_LEFT_PANEL_POS_Y,
  HS_LEFT_PANEL_HEIGHT,
  HS_RIGHT_PANEL_POS_Y,
  HS_RIGHT_PANEL_HEIGHT,
  HS_BACK_BUTTON_X,
  HS_BACK_BUTTON_Y,
  HS_BUTTON_STEP_Y,
  HS_BUTTON_X,
  HS_BUTTON_Y0,
  HS_QUEST_ARROW_X,
  HS_QUEST_ARROW_Y,
  HS_RIGHT_CHECK_X,
  HS_RIGHT_CHECK_Y,
  HS_RIGHT_GAME_MODE_WIDGET_W,
  HS_RIGHT_GAME_MODE_WIDGET_X,
  HS_RIGHT_GAME_MODE_WIDGET_Y,
  HS_RIGHT_PLAYER_COUNT_WIDGET_W,
  HS_RIGHT_PLAYER_COUNT_WIDGET_X,
  HS_RIGHT_PLAYER_COUNT_WIDGET_Y,
  HS_RIGHT_SCORE_LIST_WIDGET_W,
  HS_RIGHT_SCORE_LIST_WIDGET_X,
  HS_RIGHT_SCORE_LIST_WIDGET_Y,
  HS_RIGHT_SHOW_SCORES_WIDGET_W,
  HS_RIGHT_SHOW_SCORES_WIDGET_X,
  HS_RIGHT_SHOW_SCORES_WIDGET_Y,
  hsLeftPanelPosX,
  hsRightPanelPosX,
  hsRightOptionsXShift,
} from '../high-scores-layout.ts';
import type { HighScoreRecord } from './shared.ts';
import { drawMainPanel } from './main-panel.ts';
import { drawRightPanel } from './right-panel.ts';
import { resolveRequest, loadRecords } from './records.ts';

type Color = [number, number, number, number];
type RectTuple = [number, number, number, number];

const WHITE: Color = [1, 1, 1, 1];
const ORIGIN: [number, number] = [0, 0];

const FADE_TO_GAME_ACTIONS = new Set([
  'start_survival',
  'start_rush',
  'start_typo',
  'start_tutorial',
  'start_quest',
]);

const KEY_ESCAPE = 27;
const KEY_UP = 38;
const KEY_DOWN = 40;
const KEY_PAGE_UP = 33;
const KEY_PAGE_DOWN = 34;
const KEY_HOME = 36;
const KEY_END = 35;
const MOUSE_BUTTON_LEFT = 0;

export interface HighScoresViewStatus {
  questUnlockIndex: number;
  questUnlockIndexFull: number;
}

export class HighScoresView {
  state: GameState;

  private _isOpen: boolean = false;
  private _ground: GroundRenderer | null = null;
  private _action: string | null = null;
  private _cursorPulseTime: number = 0.0;
  private _widescreenYShift: number = 0.0;
  _timelineMs: number = 0;
  private _timelineMaxMs: number = PANEL_TIMELINE_START_MS;
  private _closing: boolean = false;
  private _closeAction: string | null = null;
  private _dirty: boolean = false;

  // Public for main-panel and right-panel draw modules
  updateButton: UiButtonState;
  playButton: UiButtonState;
  backButton: UiButtonState;

  private _request: HighScoresRequest | null = null;
  private _records: HighScoreRecord[] = [];
  private _scrollIndex: number = 0;

  // Right-panel dropdown state
  playerCountOpen: boolean = false;
  gameModeOpen: boolean = false;
  showScoresOpen: boolean = false;
  scoreListOpen: boolean = false;

  // Status (quest unlocks)
  questUnlockIndex: number = 0;
  questUnlockIndexFull: number = 0;

  constructor(state: GameState) {
    this.state = state;
    this.updateButton = new UiButtonState('Update scores', { forceWide: true });
    this.playButton = new UiButtonState('Play a game', { forceWide: true });
    this.backButton = new UiButtonState('Back', { forceWide: false });
  }

  get records(): HighScoreRecord[] {
    return this._records;
  }

  get scrollIndex(): number {
    return this._scrollIndex;
  }

  open(status?: HighScoresViewStatus): void {
    const layoutW = this.state.config.display.width;
    this._widescreenYShift = menuWidescreenYShift(layoutW);
    this._action = null;
    this._ground = this.state.menuGround;
    this._cursorPulseTime = 0.0;
    this._timelineMs = 0;
    this._timelineMaxMs = PANEL_TIMELINE_START_MS;
    this._closing = false;
    this._closeAction = null;
    this._scrollIndex = 0;
    this._dirty = false;
    this.updateButton = new UiButtonState('Update scores', { forceWide: true });
    this.playButton = new UiButtonState('Play a game', { forceWide: true });
    this.backButton = new UiButtonState('Back', { forceWide: false });

    this.playerCountOpen = false;
    this.gameModeOpen = false;
    this.showScoresOpen = false;
    this.scoreListOpen = false;

    if (status !== undefined) {
      this.questUnlockIndex = status.questUnlockIndex;
      this.questUnlockIndexFull = status.questUnlockIndexFull;
    }

    const request = resolveRequest(this.state);
    this._request = request;
    this._records = loadRecords(this.state, request);
    if (this.state.audio !== null) {
      audioPlaySfx(this.state.audio, SfxId.UI_PANELCLICK);
    }
    this._isOpen = true;
  }

  close(): void {
    this._isOpen = false;
    this._request = null;
    this._records = [];
    this._scrollIndex = 0;
    this._dirty = false;
    this.playerCountOpen = false;
    this.gameModeOpen = false;
    this.showScoresOpen = false;
    this.scoreListOpen = false;
    this._closing = false;
    this._closeAction = null;
  }

  private _panelTopLeft(pos: Vec2, scale: number): Vec2 {
    return new Vec2(
      pos.x + MENU_PANEL_OFFSET_X * scale,
      pos.y + this._widescreenYShift + MENU_PANEL_OFFSET_Y * scale,
    );
  }

  update(dt: number): void {
    this._assertOpen();
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, dt);
    }
    if (this._ground !== null) {
      this._ground.processPending();
    }
    this._cursorPulseTime += Math.min(dt, 0.1) * 1.1;

    const dtMs = (Math.min(dt, 0.1) * 1000.0) | 0;
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
    }

    const enabled = this._timelineMs >= this._timelineMaxMs;
    const scale = 1.0;

    if (InputState.wasKeyPressed(KEY_ESCAPE) && enabled) {
      this._beginCloseTransition('back_to_previous');
      return;
    }

    const screenWidth = this.state.config.display.width;
    const resources = requireRuntimeResources(this.state);
    const font = resources.smallFont;

    // Compute animated panel positions
    const panelW = MENU_PANEL_WIDTH * scale;
    const [, leftSlideX] = uiElementAnim(
      this, 1, PANEL_TIMELINE_START_MS, PANEL_TIMELINE_END_MS, panelW, 0,
    );
    const [, rightSlideX] = uiElementAnim(
      this, 2, PANEL_TIMELINE_START_MS, PANEL_TIMELINE_END_MS, panelW, 1,
    );
    const leftPanelPosX = hsLeftPanelPosX(screenWidth);
    const leftTopLeft = this._panelTopLeft(new Vec2(leftPanelPosX, HS_LEFT_PANEL_POS_Y), scale);
    const rightPanelPosX = hsRightPanelPosX(screenWidth);
    const rightTopLeft = this._panelTopLeft(new Vec2(rightPanelPosX, HS_RIGHT_PANEL_POS_Y), scale);
    const leftPanelTopLeft = leftTopLeft.offset(leftSlideX);
    const rightPanelTopLeft = rightTopLeft.offset(rightSlideX);

    if (enabled) {
      if (this._updateRightPanelWidgets(rightPanelTopLeft, scale, resources, font)) {
        return;
      }
      if (this._updateQuestArrows(leftPanelTopLeft, scale, resources)) {
        return;
      }
    }

    if (enabled) {
      const buttonBasePos = leftPanelTopLeft.add(new Vec2(HS_BUTTON_X * scale, HS_BUTTON_Y0 * scale));
      const [mx, my] = InputState.mousePosition();
      const mouse = { x: mx, y: my };
      const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);

      let w = buttonWidth(resources, this.updateButton.label, { scale, forceWide: this.updateButton.forceWide });
      if (buttonUpdate(this.updateButton, { pos: buttonBasePos, width: w, dtMs, mouse, click })) {
        // Reload scores from disk (no view transition).
        if (this.state.audio !== null) {
          audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
        }
        this.open();
        return;
      }

      w = buttonWidth(resources, this.playButton.label, { scale, forceWide: this.playButton.forceWide });
      if (buttonUpdate(this.playButton, { pos: buttonBasePos.offset(0.0, HS_BUTTON_STEP_Y * scale), width: w, dtMs, mouse, click })) {
        this._beginCloseTransition('open_play_game');
        return;
      }

      const backW = buttonWidth(resources, this.backButton.label, { scale, forceWide: this.backButton.forceWide });
      if (buttonUpdate(this.backButton, {
        pos: leftPanelTopLeft.add(new Vec2(HS_BACK_BUTTON_X * scale, HS_BACK_BUTTON_Y * scale)),
        width: backW,
        dtMs,
        mouse,
        click,
      })) {
        this._beginCloseTransition('back_to_previous');
        return;
      }
    }

    const rows = this._visibleRows(font);
    const maxScroll = Math.max(0, this._records.length - rows);

    if (enabled) {
      const wheel = InputState.mouseWheelDelta();
      if (wheel) {
        this._scrollIndex = Math.max(0, Math.min(maxScroll, this._scrollIndex - wheel));
      }

      if (InputState.wasKeyPressed(KEY_UP)) {
        this._scrollIndex = Math.max(0, this._scrollIndex - 1);
      }
      if (InputState.wasKeyPressed(KEY_DOWN)) {
        this._scrollIndex = Math.min(maxScroll, this._scrollIndex + 1);
      }
      if (InputState.wasKeyPressed(KEY_PAGE_UP)) {
        this._scrollIndex = Math.max(0, this._scrollIndex - rows);
      }
      if (InputState.wasKeyPressed(KEY_PAGE_DOWN)) {
        this._scrollIndex = Math.min(maxScroll, this._scrollIndex + rows);
      }
      if (InputState.wasKeyPressed(KEY_HOME)) {
        this._scrollIndex = 0;
      }
      if (InputState.wasKeyPressed(KEY_END)) {
        this._scrollIndex = maxScroll;
      }
    }
  }

  private _beginCloseTransition(action: string): void {
    if (this._dirty) {
      try {
        const cfg = this.state.config as unknown as { save?(): void };
        if (cfg.save) cfg.save();
        this._dirty = false;
      } catch (_) { /* config save failed — will retry next close */ }
    }
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

  private _dropdownLayout(pos: Vec2, width: number, itemCount: number, scale: number): DropdownLayoutBase {
    const headerH = 16.0 * scale;
    const rowH = 16.0 * scale;
    const fullH = (itemCount * 16.0 + 24.0) * scale;
    return {
      pos,
      width,
      headerH: headerH,
      rowH: rowH,
      rowsY0: pos.y + 17.0 * scale,
      fullH: fullH,
    };
  }

  private _updateDropdown(
    layout: DropdownLayoutBase,
    itemCount: number,
    isOpen: boolean,
    enabled: boolean,
    scale: number,
  ): [boolean, number | null, boolean] {
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = enabled && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    const hoveredHeader = enabled && mouseInsideRectWithPadding(
      mouse, layout.pos, layout.width, 14.0 * scale,
    );
    if (hoveredHeader && click) {
      return [!isOpen, null, true];
    }
    if (!isOpen) {
      return [isOpen, null, false];
    }

    const listRect = Rect.fromTopLeft(layout.pos, layout.width, layout.fullH);
    const listHovered = listRect.contains(mouse);
    if (click && !listHovered) {
      return [false, null, true];
    }

    for (let idx = 0; idx < itemCount; idx++) {
      const itemY = layout.rowsY0 + layout.rowH * idx;
      const hovered = enabled && mouseInsideRectWithPadding(
        mouse, new Vec2(layout.pos.x, itemY), layout.width, 14.0 * scale,
      );
      if (hovered && click) {
        return [false, idx, true];
      }
    }

    return [isOpen, null, false];
  }

  private _reloadRecords(): void {
    const request = this._request;
    if (request === null) return;
    this._records = loadRecords(this.state, request);
    const resources = requireRuntimeResources(this.state);
    const rows = this._visibleRows(resources.smallFont);
    this._scrollIndex = Math.max(0, Math.min(this._scrollIndex, Math.max(0, this._records.length - rows)));
  }

  private _updateRightPanelWidgets(
    rightTopLeft: Vec2,
    scale: number,
    resources: RuntimeResources,
    font: SmallFontData,
  ): boolean {
    const request = this._request;
    if (request === null) return false;

    const dropdownBlocked = this.playerCountOpen || this.gameModeOpen || this.showScoresOpen || this.scoreListOpen;
    const smallWidthShiftX = hsRightOptionsXShift(this.state.config.display.width);
    const shiftedRightTopLeft = rightTopLeft.add(new Vec2(smallWidthShiftX * scale, 0.0));

    // Checkbox: "Show internet scores"
    if (!dropdownBlocked) {
      const checkTex = this.state.config.profile.showInternetScores
        ? getTexture(resources, TextureId.UI_CHECK_ON)
        : getTexture(resources, TextureId.UI_CHECK_OFF);
      const label = 'Show internet scores';
      const checkPos = shiftedRightTopLeft.add(new Vec2(HS_RIGHT_CHECK_X * scale, HS_RIGHT_CHECK_Y * scale));
      const labelW = measureSmallTextWidth(font, label);
      const fontH = font.cellSize * scale;
      const rectW = checkTex.width * scale + 6.0 * scale + labelW;
      const rectH = Math.max(checkTex.height * scale, fontH);
      const [mx, my] = InputState.mousePosition();
      const mousePos = { x: mx, y: my };
      const checkRect = Rect.fromTopLeft(checkPos, rectW, rectH);
      if (checkRect.contains(mousePos)) {
        if (InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
          this.state.config.profile.showInternetScores = !this.state.config.profile.showInternetScores;
          this._dirty = true;
          this._reloadRecords();
          return true;
        }
      }
    }

    // Dropdown: show scores date filter
    const showScoresItems = ['Best of all time', 'Best of month', 'Best of week', 'Best of day'];
    const showScoresPos = shiftedRightTopLeft.add(new Vec2(HS_RIGHT_SHOW_SCORES_WIDGET_X * scale, HS_RIGHT_SHOW_SCORES_WIDGET_Y * scale));
    const showScoresLayout = this._dropdownLayout(showScoresPos, HS_RIGHT_SHOW_SCORES_WIDGET_W * scale, showScoresItems.length, scale);
    const showScoresEnabled = !(this.playerCountOpen || this.gameModeOpen || this.scoreListOpen);
    let consumed: boolean;
    let selected: number | null;
    [this.showScoresOpen, selected, consumed] = this._updateDropdown(
      showScoresLayout, showScoresItems.length, this.showScoresOpen, showScoresEnabled, scale,
    );
    if (selected !== null) {
      this.state.config.profile.scoreDateMode = selected as HighScoreDateMode;
      this._dirty = true;
      this._reloadRecords();
    }
    if (consumed) {
      if (this.showScoresOpen) {
        this.playerCountOpen = false;
        this.gameModeOpen = false;
        this.scoreListOpen = false;
      }
      return true;
    }

    // Dropdown: player count
    const playerItems = ['1 player', '2 players', '3 players', '4 players'];
    const playerPos = shiftedRightTopLeft.add(new Vec2(HS_RIGHT_PLAYER_COUNT_WIDGET_X * scale, HS_RIGHT_PLAYER_COUNT_WIDGET_Y * scale));
    const playerLayout = this._dropdownLayout(playerPos, HS_RIGHT_PLAYER_COUNT_WIDGET_W * scale, playerItems.length, scale);
    const playerEnabled = !(this.gameModeOpen || this.showScoresOpen || this.scoreListOpen);
    [this.playerCountOpen, selected, consumed] = this._updateDropdown(
      playerLayout, playerItems.length, this.playerCountOpen, playerEnabled, scale,
    );
    if (selected !== null) {
      const newCount = selected + 1;
      if (this.state.config.gameplay.playerCount !== newCount) {
        this.state.config.gameplay.playerCount = newCount;
        this._dirty = true;
        this._reloadRecords();
      }
    }
    if (consumed) {
      if (this.playerCountOpen) {
        this.gameModeOpen = false;
        this.showScoresOpen = false;
        this.scoreListOpen = false;
      }
      return true;
    }

    // Dropdown: game mode
    const modeItems: [string, GameMode][] = [
      ['Quests', GameMode.QUESTS],
      ['Rush', GameMode.RUSH],
      ['Survival', GameMode.SURVIVAL],
    ];
    if ((this.questUnlockIndex | 0) >= 0x28) {
      modeItems.push(["Typ'o'Shooter", GameMode.TYPO]);
    }
    const gameModePos = shiftedRightTopLeft.add(new Vec2(HS_RIGHT_GAME_MODE_WIDGET_X * scale, HS_RIGHT_GAME_MODE_WIDGET_Y * scale));
    const gameModeLayout = this._dropdownLayout(gameModePos, HS_RIGHT_GAME_MODE_WIDGET_W * scale, modeItems.length, scale);
    const gameModeEnabled = !(this.playerCountOpen || this.showScoresOpen || this.scoreListOpen);
    [this.gameModeOpen, selected, consumed] = this._updateDropdown(
      gameModeLayout, modeItems.length, this.gameModeOpen, gameModeEnabled, scale,
    );
    if (selected !== null) {
      const [, modeId] = modeItems[Math.max(0, Math.min(selected, modeItems.length - 1))];
      this.state.config.gameplay.mode = modeId;
      request.gameModeId = modeId;
      if (modeId === GameMode.TYPO) {
        this.state.config.gameplay.playerCount = 1;
      } else if (modeId === GameMode.QUESTS) {
        if (request.questLevel === null) {
          request.questLevel = (this.state.config.gameplay.questLevel as unknown as QuestLevel) ?? { major: 1, minor: 1 };
        }
      }
      this._dirty = true;
      this._reloadRecords();
    }
    if (consumed) {
      if (this.gameModeOpen) {
        this.playerCountOpen = false;
        this.showScoresOpen = false;
        this.scoreListOpen = false;
      }
      return true;
    }

    // Dropdown: selected score list (profile slots)
    const scoreListEnabled = !(this.playerCountOpen || this.gameModeOpen || this.showScoresOpen);
    const names = this.state.config.profile.savedNames.slice(0, Math.max(1, this.state.config.profile.savedNameCount));
    const scoreListPos = shiftedRightTopLeft.add(new Vec2(HS_RIGHT_SCORE_LIST_WIDGET_X * scale, HS_RIGHT_SCORE_LIST_WIDGET_Y * scale));
    const scoreListLayout = this._dropdownLayout(scoreListPos, HS_RIGHT_SCORE_LIST_WIDGET_W * scale, names.length, scale);
    [this.scoreListOpen, selected, consumed] = this._updateDropdown(
      scoreListLayout, names.length, this.scoreListOpen, scoreListEnabled, scale,
    );
    if (selected !== null) {
      this.state.config.profile.selectedSavedNameSlot = selected;
      this._dirty = true;
      this._reloadRecords();
    }
    if (consumed) {
      if (this.scoreListOpen) {
        this.playerCountOpen = false;
        this.gameModeOpen = false;
        this.showScoresOpen = false;
      }
      return true;
    }

    return false;
  }

  private _updateQuestArrows(
    leftPanelTopLeft: Vec2,
    scale: number,
    resources: RuntimeResources,
  ): boolean {
    const request = this._request;
    if (request === null) return false;
    if (request.gameModeId !== GameMode.QUESTS) return false;

    const level = request.questLevel;
    if (level === null) return false;

    const globalIndex = questLevelGlobalIndex(level);
    const unlock = this.state.config.gameplay.hardcore
      ? (this.questUnlockIndexFull | 0)
      : (this.questUnlockIndex | 0);
    const maxIndex = Math.max(0, Math.min(49, unlock));
    const arrow = getTexture(resources, TextureId.UI_ARROW);

    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    const arrowW = arrow.width * scale;
    const arrowH = arrow.height * scale;

    const prevPos = leftPanelTopLeft.add(new Vec2((HS_QUEST_ARROW_X - 255.0) * scale, HS_QUEST_ARROW_Y * scale));
    const nextPos = leftPanelTopLeft.add(new Vec2(HS_QUEST_ARROW_X * scale, HS_QUEST_ARROW_Y * scale));
    const prevRect = Rect.fromTopLeft(prevPos, arrowW, arrowH);
    const nextRect = Rect.fromTopLeft(nextPos, arrowW, arrowH);

    const setLevel = (index: number): void => {
      index = Math.max(0, Math.min(maxIndex, index));
      const newLevel = questLevelFromGlobalIndex(index);
      request.questLevel = newLevel;
      this.state.config.gameplay.questLevel = newLevel as unknown as number | null;
      this._dirty = true;
      this._reloadRecords();
    };

    if (globalIndex > 0 && prevRect.contains(mouse) && click) {
      setLevel(globalIndex - 1);
      return true;
    }
    if (globalIndex < maxIndex && nextRect.contains(mouse) && click) {
      setLevel(globalIndex + 1);
      return true;
    }
    return false;
  }

  draw(ctx: WebGLContext): void {
    this._assertOpen();
    ctx.clearBackground(0, 0, 0, 1);

    const pauseBackground = this.state.pauseBackground;
    if (pauseBackground !== null) {
      pauseBackground.drawPauseBackground(ctx, { entityAlpha: this._worldEntityAlpha() });
    } else if (this._ground !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this._ground.draw(camera);
    }
    drawScreenFade(ctx, this.state, this.state.config.display.width, this.state.config.display.height);

    const resources = requireRuntimeResources(this.state);
    const font = resources.smallFont;
    const request = this._request;
    let modeId: GameMode;
    if (request !== null) {
      modeId = request.gameModeId;
    } else {
      modeId = this.state.config.gameplay.mode ?? GameMode.DEMO;
    }
    const questMajor = (request !== null && request.questLevel !== null) ? request.questLevel.major : 0;
    const questMinor = (request !== null && request.questLevel !== null) ? request.questLevel.minor : 0;

    const screenWidth = this.state.config.display.width;
    const scale = 1.0;
    const fxDetail = this.state.config.display.fxDetail[0] ?? false;
    const panelW = MENU_PANEL_WIDTH * scale;

    const [, leftSlideX] = uiElementAnim(this, 1, PANEL_TIMELINE_START_MS, PANEL_TIMELINE_END_MS, panelW, 0);
    const [, rightSlideX] = uiElementAnim(this, 2, PANEL_TIMELINE_START_MS, PANEL_TIMELINE_END_MS, panelW, 1);

    const leftPanelPosX = hsLeftPanelPosX(screenWidth);
    const leftTopLeft = this._panelTopLeft(new Vec2(leftPanelPosX, HS_LEFT_PANEL_POS_Y), scale);
    const rightPanelPosXVal = hsRightPanelPosX(screenWidth);
    const rightTopLeft = this._panelTopLeft(new Vec2(rightPanelPosXVal, HS_RIGHT_PANEL_POS_Y), scale);
    const leftPanelTopLeft = leftTopLeft.offset(leftSlideX);
    const rightPanelTopLeft = rightTopLeft.offset(rightSlideX);

    const panelTex = getTexture(resources, TextureId.UI_MENU_PANEL);
    drawClassicMenuPanel(
      ctx, panelTex,
      [leftPanelTopLeft.x, leftPanelTopLeft.y, panelW, HS_LEFT_PANEL_HEIGHT * scale],
      WHITE, fxDetail,
    );
    drawClassicMenuPanel(
      ctx, panelTex,
      [rightPanelTopLeft.x, rightPanelTopLeft.y, panelW, HS_RIGHT_PANEL_HEIGHT * scale],
      WHITE, fxDetail, true,
    );

    const selectedRank = drawMainPanel(ctx, this, {
      resources,
      font,
      leftPanelTopLeft,
      scale,
      modeId,
      questMajor,
      questMinor,
      request,
    });

    drawRightPanel(ctx, this, {
      resources,
      font,
      rightTopLeft: rightPanelTopLeft,
      scale,
      highlightRank: selectedRank,
    });

    this._drawSign(ctx, resources);
    this._drawMenuCursor(ctx, resources);
  }

  private _drawSign(ctx: WebGLContext, resources: RuntimeResources): void {
    const sign = getTexture(resources, TextureId.UI_SIGN_CRIMSON);
    const screenW = this.state.config.display.width;
    const [signScale, shiftX] = signLayoutScale(screenW | 0);
    const signPos = new Vec2(
      screenW + MENU_SIGN_POS_X_PAD,
      screenW > MENU_SCALE_SMALL_THRESHOLD ? MENU_SIGN_POS_Y : MENU_SIGN_POS_Y_SMALL,
    );
    const signW = MENU_SIGN_WIDTH * signScale;
    const signH = MENU_SIGN_HEIGHT * signScale;
    const offsetX = MENU_SIGN_OFFSET_X * signScale + shiftX;
    const offsetY = MENU_SIGN_OFFSET_Y * signScale;
    const rotationDeg = 0.0;
    const fxDetail = this.state.config.display.fxDetail[0] ?? false;
    const signSrc: RectTuple = [0.0, 0.0, sign.width, sign.height];
    const signOrigin: [number, number] = [-offsetX, -offsetY];

    if (fxDetail) {
      drawUiQuadShadow(
        ctx, sign, signSrc,
        [signPos.x + UI_SHADOW_OFFSET, signPos.y + UI_SHADOW_OFFSET, signW, signH],
        signOrigin, rotationDeg,
      );
    }
    ctx.drawTexturePro(
      sign, signSrc,
      [signPos.x, signPos.y, signW, signH],
      signOrigin, rotationDeg, WHITE,
    );
  }

  private _drawMenuCursor(ctx: WebGLContext, resources: RuntimeResources): void {
    const particles = getTexture(resources, TextureId.PARTICLES);
    const cursorTex = getTexture(resources, TextureId.UI_CURSOR);
    const [mx, my] = InputState.mousePosition();
    const pos = new Vec2(mx, my);
    drawMenuCursor(ctx, particles, cursorTex, pos, this._cursorPulseTime);
  }

  private _worldEntityAlpha(): number {
    if (!this._closing) return 1.0;
    const span = PANEL_TIMELINE_START_MS - PANEL_TIMELINE_END_MS;
    if (span <= 0) return 0.0;
    let alpha = (this._timelineMs - PANEL_TIMELINE_END_MS) / span;
    if (alpha < 0.0) return 0.0;
    if (alpha > 1.0) return 1.0;
    return alpha;
  }

  _visibleRows(font: SmallFontData): number {
    const rowStep = font.cellSize;
    const tableTop = 188.0 + rowStep;
    const reservedBottom = 96.0;
    const screenH = this.state.config.display.height;
    const available = Math.max(0.0, screenH - tableTop - reservedBottom);
    return Math.max(1, Math.floor(available / rowStep));
  }

  takeAction(): string | null {
    this._assertOpen();
    const action = this._action;
    this._action = null;
    return action;
  }

  private _assertOpen(): void {
    if (!this._isOpen) {
      throw new Error('HighScoresView must be opened before use');
    }
  }
}
