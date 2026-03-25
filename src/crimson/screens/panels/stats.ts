// Port of crimson/screens/panels/stats.py — Statistics hub panel

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';

import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText } from '@grim/fonts/small.ts';
import { audioPlaySfx, audioPlayMusic, audioStopMusic, audioUpdate } from '@grim/audio.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { fxDetailEnabled } from '@grim/config.ts';
import { InputState } from '@grim/input.ts';
import { type GroundRenderer } from '@grim/terrain-render.ts';
import { drawClassicMenuPanel } from '@crimson/ui/menu-panel.ts';
import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { menuWidescreenYShift } from '@crimson/ui/layout.ts';
import { UI_SHADOW_OFFSET, drawUiQuadShadow } from '@crimson/ui/shadow.ts';
import { UiButtonState, buttonDraw, buttonUpdate, buttonWidth } from '@crimson/ui/perk-menu.ts';
import { type GameState } from '@crimson/game/types.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import { requireRuntimeResources } from '@crimson/screens/assets.ts';
import { drawScreenFade } from '@crimson/screens/transitions.ts';
import {
  MENU_PANEL_WIDTH,
  MENU_PANEL_OFFSET_X,
  MENU_PANEL_OFFSET_Y,
  MENU_LABEL_ROW_HEIGHT,
  MENU_SCALE_SMALL_THRESHOLD,
  MENU_SIGN_WIDTH,
  MENU_SIGN_HEIGHT,
  MENU_SIGN_OFFSET_X,
  MENU_SIGN_OFFSET_Y,
  MENU_SIGN_POS_Y,
  MENU_SIGN_POS_Y_SMALL,
  MENU_SIGN_POS_X_PAD,
  uiElementAnim,
  signLayoutScale,
} from './base.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_TIMELINE_START_MS = 300;
const PANEL_TIMELINE_END_MS = 0;

const STATISTICS_PANEL_POS_X = -89.0;
const STATISTICS_PANEL_POS_Y = 185.0;
const STATISTICS_PANEL_HEIGHT = 378.0;

const _TITLE_X = 290.0;
const _TITLE_Y = 52.0;
const _TITLE_W = 128.0;
const _TITLE_H = 32.0;

const _BUTTON_X = 270.0;
const _BUTTON_Y0 = 104.0;
const _BUTTON_STEP_Y = 34.0;

const _BACK_BUTTON_X = 394.0;
const _BACK_BUTTON_Y = 290.0;

const _PLAYTIME_X = 204.0;
const _PLAYTIME_Y = 334.0;

const _STATS_EASTER_ROLL_UNSET = -1;
const _STATS_EASTER_TRIGGER_ROLL = 3;
const _STATS_EASTER_TEXT = 'Orbes Volantes Exstare';
const _STATS_EASTER_TEXT_Y = 5.0;

// Label row index for the "statistics" label in UI_ITEM_TEXTS texture.
const MENU_LABEL_ROW_STATISTICS = 3;

const KEY_ESCAPE = 27;
const MOUSE_BUTTON_LEFT = 0;

const WHITE = wgl.makeColor(1, 1, 1, 1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statsMenuEasterRoll(currentRoll: number, rng: { rand(caller: number): number }): number {
  if (currentRoll !== _STATS_EASTER_ROLL_UNSET) {
    return currentRoll;
  }
  return rng.rand(RngCallerStatic.REWRITE_STATS_MENU_EASTER_ROLL) % 32;
}

function isOrbesVolantesDay(date: Date): boolean {
  return date.getMonth() === 2 && date.getDate() === 3; // month is 0-indexed
}

export function formatPlaytimeText(gameSequenceMs: number, preserveBugs: boolean = false): string {
  const totalMinutes = Math.floor(Math.max(0, gameSequenceMs) / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (preserveBugs) {
    return `played for ${hours} hours ${minutes} minutes`;
  }
  const hourLabel = hours === 1 ? 'hour' : 'hours';
  const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
  return `played for ${hours} ${hourLabel} ${minutes} ${minuteLabel}`;
}

// ---------------------------------------------------------------------------
// StatisticsMenuView
// ---------------------------------------------------------------------------

export class StatisticsMenuView {
  state: GameState;

  private _isOpen: boolean = false;
  private _ground: GroundRenderer | null = null;

  private _cursorPulseTime: number = 0.0;
  private _widescreenYShift: number = 0.0;
  _timelineMs: number = 0;
  private _timelineMaxMs: number = PANEL_TIMELINE_START_MS;
  private _closing: boolean = false;
  private _closeAction: string | null = null;
  private _pendingAction: string | null = null;

  private _action: string | null = null;

  private _btnHighScores: UiButtonState;
  private _btnWeapons: UiButtonState;
  private _btnPerks: UiButtonState;
  private _btnCredits: UiButtonState;
  private _btnBack: UiButtonState;

  constructor(state: GameState) {
    this.state = state;
    this._btnHighScores = new UiButtonState('High scores', { forceWide: true });
    this._btnWeapons = new UiButtonState('Weapons', { forceWide: true });
    this._btnPerks = new UiButtonState('Perks', { forceWide: true });
    this._btnCredits = new UiButtonState('Credits', { forceWide: true });
    this._btnBack = new UiButtonState('Back', { forceWide: false });
  }

  open(): void {
    const layoutW = this.state.config.display.width;
    this._widescreenYShift = menuWidescreenYShift(layoutW);
    this._ground = this.state.pauseBackground !== null ? null : this.state.menuGround;
    this._cursorPulseTime = 0.0;
    this._action = null;
    this._timelineMs = 0;
    this._timelineMaxMs = PANEL_TIMELINE_START_MS;
    this._closing = false;
    this._closeAction = null;
    this._pendingAction = null;

    this._btnHighScores = new UiButtonState('High scores', { forceWide: true });
    this._btnWeapons = new UiButtonState('Weapons', { forceWide: true });
    this._btnPerks = new UiButtonState('Perks', { forceWide: true });
    this._btnCredits = new UiButtonState('Credits', { forceWide: true });
    this._btnBack = new UiButtonState('Back', { forceWide: false });

    if (this.state.audio !== null) {
      if (this.state.audio.music.activeTrack !== 'shortie_monk') {
        audioStopMusic(this.state.audio);
      }
      audioPlayMusic(this.state.audio, 'shortie_monk');
      audioPlaySfx(this.state.audio, SfxId.UI_PANELCLICK);
    }
    this._isOpen = true;
  }

  close(): void {
    this._isOpen = false;
    this._ground = null;
    this._action = null;
    this._closing = false;
    this._closeAction = null;
    this._pendingAction = null;
  }

  reopenFromChild(): void {
    this._action = null;
    this._timelineMs = 0;
    this._timelineMaxMs = PANEL_TIMELINE_START_MS;
    this._closing = false;
    this._closeAction = null;
    this._pendingAction = null;
    this._btnHighScores = new UiButtonState('High scores', { forceWide: true });
    this._btnWeapons = new UiButtonState('Weapons', { forceWide: true });
    this._btnPerks = new UiButtonState('Perks', { forceWide: true });
    this._btnCredits = new UiButtonState('Credits', { forceWide: true });
    this._btnBack = new UiButtonState('Back', { forceWide: false });
    audioPlaySfx(this.state.audio, SfxId.UI_PANELCLICK);
  }

  takeAction(): string | null {
    this._assertOpen();
    if (this._pendingAction !== null) {
      const action = this._pendingAction;
      this._pendingAction = null;
      this._closing = false;
      this._closeAction = null;
      this._timelineMs = this._timelineMaxMs;
      return action;
    }
    const action = this._action;
    this._action = null;
    return action;
  }

  private _assertOpen(): void {
    if (!this._isOpen) {
      throw new Error('StatisticsMenuView must be opened before use');
    }
  }

  private _panelTopLeft(scale: number): Vec2 {
    return new Vec2(
      STATISTICS_PANEL_POS_X + MENU_PANEL_OFFSET_X * scale,
      STATISTICS_PANEL_POS_Y + this._widescreenYShift + MENU_PANEL_OFFSET_Y * scale,
    );
  }

  private _beginCloseTransition(action: string): void {
    if (this._closing) return;
    this._closing = true;
    this._closeAction = action;
  }

  update(dt: number): void {
    this._assertOpen();
    if (this.state.audio !== null) {
      if (!this._closing) {
        audioPlayMusic(this.state.audio, 'shortie_monk');
      }
      audioUpdate(this.state.audio, dt);
    }
    this.state.statsMenuEasterEggRoll = statsMenuEasterRoll(
      this.state.statsMenuEasterEggRoll,
      this.state.rng,
    );
    if (this._ground !== null) {
      this._ground.processPending();
    }
    this._cursorPulseTime += Math.min(dt, 0.1) * 1.1;
    const dtMs = (Math.min(dt, 0.1) * 1000.0) | 0;

    if (this._closing) {
      if (dtMs > 0 && this._pendingAction === null) {
        this._timelineMs -= dtMs;
        if (this._timelineMs < 0 && this._closeAction !== null) {
          this._pendingAction = this._closeAction;
          this._closeAction = null;
        }
      }
      return;
    }

    if (dtMs > 0) {
      this._timelineMs = Math.min(this._timelineMaxMs, this._timelineMs + dtMs);
    }
    const interactive = this._timelineMs >= this._timelineMaxMs;

    if (InputState.wasKeyPressed(KEY_ESCAPE) && interactive) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('back_to_menu');
      return;
    }

    if (!interactive) return;

    const scale = this.state.config.display.width < 641 ? 0.9 : 1.0;
    const panelW = MENU_PANEL_WIDTH * scale;
    const [_angleRad, slideX] = uiElementAnim(
      this, 1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      panelW, 0,
    );
    const panelTopLeft = this._panelTopLeft(scale).offset(slideX, 0);
    const resources = requireRuntimeResources(this.state);

    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    const dtMsF = Math.min(dt, 0.1) * 1000.0;

    function updateButton(btn: UiButtonState, pos: Vec2): boolean {
      const w = buttonWidth(resources, btn.label, { scale, forceWide: btn.forceWide });
      return buttonUpdate(btn, { pos, width: w, dtMs: dtMsF, mouse, click });
    }

    const buttonBase = panelTopLeft.add(new Vec2(_BUTTON_X * scale, _BUTTON_Y0 * scale));
    if (updateButton(this._btnHighScores, buttonBase.offset(0, _BUTTON_STEP_Y * 0.0 * scale))) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('open_high_scores');
      return;
    }
    if (updateButton(this._btnWeapons, buttonBase.offset(0, _BUTTON_STEP_Y * 1.0 * scale))) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('open_weapon_database');
      return;
    }
    if (updateButton(this._btnPerks, buttonBase.offset(0, _BUTTON_STEP_Y * 2.0 * scale))) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('open_perk_database');
      return;
    }
    if (updateButton(this._btnCredits, buttonBase.offset(0, _BUTTON_STEP_Y * 3.0 * scale))) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('open_credits');
      return;
    }

    const backPos = panelTopLeft.add(new Vec2(_BACK_BUTTON_X * scale, _BACK_BUTTON_Y * scale));
    if (updateButton(this._btnBack, backPos)) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('back_to_menu');
      return;
    }
  }

  draw(): void {
    this._assertOpen();
    wgl.clearBackground(wgl.makeColor(0, 0, 0, 1));

    const pauseBackground = this.state.pauseBackground;
    if (pauseBackground !== null) {
      pauseBackground.drawPauseBackground();
    } else if (this._ground !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this._ground.draw(camera);
    }

    const screenW = this.state.config.display.width;
    const screenH = this.state.config.display.height;
    drawScreenFade(this.state, screenW, screenH);

    const resources = requireRuntimeResources(this.state);

    const scale = screenW < 641 ? 0.9 : 1.0;
    const panelW = MENU_PANEL_WIDTH * scale;
    const [_angleRad, slideX] = uiElementAnim(
      this, 1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      panelW, 0,
    );
    const panelTopLeft = this._panelTopLeft(scale).offset(slideX, 0);
    const dst = wgl.makeRectangle(panelTopLeft.x, panelTopLeft.y, panelW, STATISTICS_PANEL_HEIGHT * scale);
    const fxDetail = fxDetailEnabled(this.state.config.display, 0);
    const panel = getTexture(resources, TextureId.UI_MENU_PANEL);
    drawClassicMenuPanel(panel, dst, WHITE, fxDetail);

    // Title: full-size row from UI_ITEM_TEXTS (128x32).
    const labelTex = getTexture(resources, TextureId.UI_ITEM_TEXTS);
    const rowH = MENU_LABEL_ROW_HEIGHT;
    const src = wgl.makeRectangle(0.0, MENU_LABEL_ROW_STATISTICS * rowH, labelTex.width, rowH);
    wgl.drawTexturePro(
      labelTex, src,
      wgl.makeRectangle(
        panelTopLeft.x + _TITLE_X * scale,
        panelTopLeft.y + _TITLE_Y * scale,
        _TITLE_W * scale,
        _TITLE_H * scale,
      ),
      wgl.makeVector2(0, 0), 0.0, WHITE,
    );

    // "played for # hours # minutes"
    const font = resources.smallFont;
    const playtimeMs = (this.state as unknown as { status?: { gameSequenceId?: number } }).status?.gameSequenceId ?? 0;
    const playtimeText = formatPlaytimeText(playtimeMs, this.state.preserveBugs);
    const playtimePos = panelTopLeft.add(new Vec2(_PLAYTIME_X * scale, _PLAYTIME_Y * scale));
    drawSmallText(font, playtimeText, playtimePos, wgl.makeColor(1, 1, 1, 0.8));

    // Easter egg: Orbes Volantes Exstare
    const today = new Date();
    if (isOrbesVolantesDay(today) && this.state.statsMenuEasterEggRoll === _STATS_EASTER_TRIGGER_ROLL) {
      this.state.statsMenuEasterEggRoll = _STATS_EASTER_ROLL_UNSET;
      const easterX = this.state.rng.rand(RngCallerStatic.REWRITE_STATS_MENU_EASTER_TEXT_X) % 64 + 16;
      drawSmallText(font, _STATS_EASTER_TEXT, new Vec2(easterX, _STATS_EASTER_TEXT_Y), wgl.makeColor(0.2, 1.0, 0.6, 0.5));
    }

    // Buttons
    const buttonBase = panelTopLeft.add(new Vec2(_BUTTON_X * scale, _BUTTON_Y0 * scale));
    const buttons = [this._btnHighScores, this._btnWeapons, this._btnPerks, this._btnCredits];
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const w = buttonWidth(resources, btn.label, { scale, forceWide: btn.forceWide });
      const btnPos = buttonBase.offset(0, _BUTTON_STEP_Y * i * scale);
      buttonDraw(resources, btn, { pos: btnPos, width: w, scale });
    }

    const backW = buttonWidth(resources, this._btnBack.label, { scale, forceWide: this._btnBack.forceWide });
    const backPos = panelTopLeft.add(new Vec2(_BACK_BUTTON_X * scale, _BACK_BUTTON_Y * scale));
    buttonDraw(resources, this._btnBack, { pos: backPos, width: backW, scale });

    this._drawSign(resources, scale);
    this._drawMenuCursor(resources);
  }

  private _drawSign(resources: RuntimeResources, _scale: number): void {
    const sign = getTexture(resources, TextureId.UI_SIGN_CRIMSON);
    const screenW = this.state.config.display.width;
    const [signScale, shiftX] = signLayoutScale(screenW | 0);
    const signPosY = screenW > MENU_SCALE_SMALL_THRESHOLD ? MENU_SIGN_POS_Y : MENU_SIGN_POS_Y_SMALL;
    const signPos = new Vec2(screenW + MENU_SIGN_POS_X_PAD, signPosY);
    const signW = MENU_SIGN_WIDTH * signScale;
    const signH = MENU_SIGN_HEIGHT * signScale;
    const offsetX = MENU_SIGN_OFFSET_X * signScale + shiftX;
    const offsetY = MENU_SIGN_OFFSET_Y * signScale;
    const rotationDeg = 0.0;
    const fxDetail = fxDetailEnabled(this.state.config.display, 0);
    const signSrc = wgl.makeRectangle(0.0, 0.0, sign.width, sign.height);
    const signOrigin = wgl.makeVector2(-offsetX, -offsetY);

    if (fxDetail) {
      drawUiQuadShadow(
        sign, signSrc,
        wgl.makeRectangle(signPos.x + UI_SHADOW_OFFSET, signPos.y + UI_SHADOW_OFFSET, signW, signH),
        signOrigin, rotationDeg,
      );
    }
    wgl.drawTexturePro(
      sign, signSrc,
      wgl.makeRectangle(signPos.x, signPos.y, signW, signH),
      signOrigin, rotationDeg, WHITE,
    );
  }

  private _drawMenuCursor(resources: RuntimeResources): void {
    const particles = getTexture(resources, TextureId.PARTICLES);
    const cursorTex = getTexture(resources, TextureId.UI_CURSOR);
    const [mx, my] = InputState.mousePosition();
    drawMenuCursor(particles, cursorTex, new Vec2(mx, my), this._cursorPulseTime);
  }
}
