// Port of crimson/screens/panels/alien_zookeeper.py — AlienZooKeeper mini-game panel

import { Vec2 } from '@grim/geom.ts';
import { type WebGLContext } from '@grim/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText } from '@grim/fonts/small.ts';
import { audioPlaySfx, audioUpdate } from '@grim/audio.ts';
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
  MENU_SCALE_SMALL_THRESHOLD,
  MENU_SIGN_WIDTH,
  MENU_SIGN_HEIGHT,
  MENU_SIGN_OFFSET_X,
  MENU_SIGN_OFFSET_Y,
  MENU_SIGN_POS_Y,
  MENU_SIGN_POS_Y_SMALL,
  MENU_SIGN_POS_X_PAD,
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
  uiElementAnim,
  signLayoutScale,
} from './base.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const _BOARD_SIDE = 6;
const _BOARD_CELLS = _BOARD_SIDE * _BOARD_SIDE;
const _TILE_SIZE = 32.0;
const _BOARD_SIZE = 192.0;

const _TIMER_RESET_MS = 0x2580;
const _MATCH_TIMER_BONUS_MS = 2000;

// Directly mirrored from the native flow for 1024x768 mode:
//   data_489df8 = -35, data_489dfc = 275, data_489e1c = -63, data_489e20 = -81.
const _LAYOUT_OFFSET_X = -35.0;
const _LAYOUT_OFFSET_X_SMALL = -85.0;
const _LAYOUT_POS_X = -63.0;
const _LAYOUT_POS_Y = -81.0;
const _LAYOUT_BASE_Y = 275.0;
const _TITLE_BASE_Y_OFFSET = 50.0;
const _BOARD_X_OFFSET = 220.0; // 300 - 80
const _BOARD_Y_OFFSET = 40.0;

const _TITLE = 'AlienZooKeeper';
const _SUBTITLE_1 = 'a puzzle game unfinished';
const _SUBTITLE_2 = '..or something more?';
const _LABEL_GAME_OVER = 'Game Over';

const _RESET_LABEL = 'Reset';
const _BACK_LABEL = 'Back';

const KEY_ESCAPE = 27;
const MOUSE_BUTTON_LEFT = 0;

type Color = [number, number, number, number];
type RectTuple = [number, number, number, number];
const WHITE: Color = [1, 1, 1, 1];

// ---------------------------------------------------------------------------
// AzkLayout
// ---------------------------------------------------------------------------

interface AzkLayout {
  scale: number;
  panelX: number;
  panelY: number;
  boardX: number;
  boardY: number;
  tileSize: number;
  boardSize: number;
  titleX: number;
  titleY: number;
  subtitle1X: number;
  subtitle1Y: number;
  subtitle2X: number;
  subtitle2Y: number;
  scoreX: number;
  scoreY: number;
  gameOverX: number;
  gameOverY: number;
  resetPos: Vec2;
  backPos: Vec2;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mouseInsideRect(
  mx: number, my: number,
  x: number, y: number, w: number, h: number,
): boolean {
  return (x <= mx && mx <= (x + w)) && (y <= my && my <= (y + h));
}

function creditsSecretMatch3Find(board: number[]): [boolean, number, number] {
  // Native order: horizontal first, then vertical.
  for (let row = 0; row < _BOARD_SIDE; row++) {
    const base = row * _BOARD_SIDE;
    for (let col = 0; col < _BOARD_SIDE - 2; col++) {
      const idx = base + col;
      const v = board[idx];
      if (v < 0) continue;
      if (board[idx + 1] === v && board[idx + 2] === v) {
        return [true, idx, 1];
      }
    }
  }

  for (let col = 0; col < _BOARD_SIDE; col++) {
    for (let row = 0; row < _BOARD_SIDE - 2; row++) {
      const idx = row * _BOARD_SIDE + col;
      const v = board[idx];
      if (v < 0) continue;
      if (board[idx + _BOARD_SIDE] === v && board[idx + (_BOARD_SIDE * 2)] === v) {
        return [true, idx, 0];
      }
    }
  }

  return [false, 0, 0];
}

// ---------------------------------------------------------------------------
// AlienZooKeeperView
// ---------------------------------------------------------------------------

export class AlienZooKeeperView {
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

  private _board: number[] = new Array(_BOARD_CELLS).fill(0);
  private _selectedIndex: number = -1;
  private _timerMs: number = _TIMER_RESET_MS;
  private _animTimeMs: number = 0;
  private _score: number = 0;

  private _resetButton: UiButtonState;
  private _backButton: UiButtonState;

  constructor(state: GameState) {
    this.state = state;
    this._resetButton = new UiButtonState(_RESET_LABEL, { forceWide: false });
    this._backButton = new UiButtonState(_BACK_LABEL, { forceWide: false });
  }

  open(): void {
    const layoutW = this.state.config.display.width;
    this._widescreenYShift = menuWidescreenYShift(layoutW);
    this._ground = this.state.pauseBackground !== null ? null : this.state.menuGround;
    this._cursorPulseTime = 0.0;
    this._timelineMs = 0;
    this._timelineMaxMs = PANEL_TIMELINE_START_MS;
    this._closing = false;
    this._closeAction = null;
    this._pendingAction = null;
    this._action = null;

    this._resetButton = new UiButtonState(_RESET_LABEL, { forceWide: false });
    this._backButton = new UiButtonState(_BACK_LABEL, { forceWide: false });

    this._animTimeMs = 0;
    this._resetState();
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
      throw new Error('AlienZooKeeperView must be opened before use');
    }
  }

  private _beginCloseTransition(action: string): void {
    if (this._closing) return;
    this._closing = true;
    this._closeAction = action;
  }

  private _panelSlideX(scale: number): number {
    const panelW = MENU_PANEL_WIDTH * scale;
    const [_angleRad, slideX] = uiElementAnim(
      this,
      1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      panelW,
      0,
    );
    return slideX;
  }

  private _layout(scale: number): AzkLayout {
    const layoutOffsetX = this.state.config.display.width < 641.0 ? _LAYOUT_OFFSET_X_SMALL : _LAYOUT_OFFSET_X;
    const slideX = this._panelSlideX(scale);
    const anchorX = _LAYOUT_POS_X + layoutOffsetX + _BOARD_X_OFFSET + slideX;
    const titleBaseY = _LAYOUT_BASE_Y + _LAYOUT_POS_Y + _TITLE_BASE_Y_OFFSET + this._widescreenYShift;
    const boardX = anchorX + (22.0 * scale);
    const boardY = titleBaseY + (_BOARD_Y_OFFSET * scale);

    const tileSize = _TILE_SIZE * scale;
    const boardSize = _BOARD_SIZE * scale;

    return {
      scale,
      panelX: _LAYOUT_POS_X + layoutOffsetX + slideX,
      panelY: _LAYOUT_BASE_Y + _LAYOUT_POS_Y + this._widescreenYShift,
      boardX,
      boardY,
      tileSize,
      boardSize,
      titleX: anchorX,
      titleY: titleBaseY - (14.0 * scale),
      subtitle1X: anchorX + (12.0 * scale),
      subtitle1Y: titleBaseY + (10.0 * scale),
      subtitle2X: anchorX + (18.0 * scale),
      subtitle2Y: titleBaseY + (23.0 * scale),
      scoreX: boardX + (124.0 * scale),
      scoreY: boardY - (16.0 * scale),
      gameOverX: boardX + (38.0 * scale),
      gameOverY: boardY + (74.0 * scale), // 96 - 22
      resetPos: new Vec2(anchorX + (38.0 * scale), titleBaseY + (256.0 * scale)),
      backPos: new Vec2(anchorX + (138.0 * scale), titleBaseY + (256.0 * scale)),
    };
  }

  private _fillEmptyCells(): void {
    for (let i = 0; i < this._board.length; i++) {
      if (this._board[i] === -1) {
        this._board[i] = this.state.rng.rand(RngCallerStatic.CREDITS_SECRET_ALIEN_ZOOKEEPER_FILL_EMPTY) % 5;
      }
    }
  }

  private _rerollBoardNoInitialMatch(): void {
    while (true) {
      for (let i = 0; i < _BOARD_CELLS; i++) {
        this._board[i] = this.state.rng.rand(RngCallerStatic.CREDITS_SECRET_ALIEN_ZOOKEEPER_REROLL_FILL) % 5;
      }
      const [hasMatch] = creditsSecretMatch3Find(this._board);
      if (!hasMatch) return;
    }
  }

  private _resetState(): void {
    this._rerollBoardNoInitialMatch();
    this._selectedIndex = -1;
    this._score = 0;
    this._timerMs = _TIMER_RESET_MS;
  }

  private _resolveTileClick(layout: AzkLayout, mx: number, my: number): void {
    if (this._timerMs <= 0) return;

    for (let index = 0; index < this._board.length; index++) {
      const cellValue = this._board[index];
      if (cellValue === -3) continue;
      const row = (index / _BOARD_SIDE) | 0;
      const col = index % _BOARD_SIDE;
      const x = layout.boardX + col * layout.tileSize;
      const y = layout.boardY + row * layout.tileSize;
      if (!mouseInsideRect(mx, my, x, y, layout.tileSize, layout.tileSize)) continue;

      audioPlaySfx(this.state.audio, SfxId.UI_CLINK_01);

      if (this._selectedIndex === -1) {
        this._selectedIndex = index;
        return;
      }

      const selected = this._selectedIndex;
      const tmp = this._board[index];
      this._board[index] = this._board[selected];
      this._board[selected] = tmp;
      this._selectedIndex = -1;

      const [hasMatch, outIdx, outDir] = creditsSecretMatch3Find(this._board);
      if (!hasMatch) return;

      this._board[outIdx] = -3;
      if (outDir === 0) {
        if ((outIdx + _BOARD_SIDE) < _BOARD_CELLS) {
          this._board[outIdx + _BOARD_SIDE] = -3;
        }
        if ((outIdx + (_BOARD_SIDE * 2)) < _BOARD_CELLS) {
          this._board[outIdx + (_BOARD_SIDE * 2)] = -3;
        }
      } else {
        if ((outIdx + 1) < _BOARD_CELLS) {
          this._board[outIdx + 1] = -3;
        }
        if ((outIdx + 2) < _BOARD_CELLS) {
          this._board[outIdx + 2] = -3;
        }
      }

      this._score += 1;
      this._timerMs += _MATCH_TIMER_BONUS_MS;
      audioPlaySfx(this.state.audio, SfxId.UI_BONUS);
      return;
    }
  }

  update(dt: number): void {
    this._assertOpen();
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, dt);
    }
    if (this._ground !== null) {
      this._ground.processPending();
    }

    const dtClamped = Math.min(dt, 0.1);
    const dtMs = (dtClamped * 1000.0) | 0;
    this._cursorPulseTime += dtClamped * 1.1;

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
      this._animTimeMs += dtMs;
      if (this._timerMs > 0) {
        this._timerMs -= dtMs;
        if (this._timerMs <= 0) {
          this._timerMs = 0;
          audioPlaySfx(this.state.audio, SfxId.TROOPER_DIE_01);
        }
      } else if (this._timerMs < 0) {
        this._timerMs = 0;
      }
    }

    this._fillEmptyCells();

    const interactive = this._timelineMs >= this._timelineMaxMs;
    if (InputState.wasKeyPressed(KEY_ESCAPE) && interactive) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('open_statistics');
      return;
    }
    if (!interactive) return;

    const scale = this.state.config.display.width < 641.0 ? 0.9 : 1.0;
    const layout = this._layout(scale);
    const [mx, my] = InputState.mousePosition();
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    if (click) {
      this._resolveTileClick(layout, mx, my);
    }

    const resources = requireRuntimeResources(this.state);
    const dtMsF = dtClamped * 1000.0;
    const mouse = { x: mx, y: my };

    const resetW = buttonWidth(resources, this._resetButton.label, { scale, forceWide: this._resetButton.forceWide });
    if (buttonUpdate(this._resetButton, { pos: layout.resetPos, width: resetW, dtMs: dtMsF, mouse, click })) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._resetState();
      return;
    }

    const backW = buttonWidth(resources, this._backButton.label, { scale, forceWide: this._backButton.forceWide });
    if (buttonUpdate(this._backButton, { pos: layout.backPos, width: backW, dtMs: dtMsF, mouse, click })) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('open_statistics');
      return;
    }
  }

  draw(ctx: WebGLContext): void {
    this._assertOpen();
    ctx.clearBackground(0, 0, 0, 1);
    const pauseBackground = this.state.pauseBackground as { drawPauseBackground(ctx: WebGLContext): void } | null;
    if (pauseBackground != null) {
      pauseBackground.drawPauseBackground(ctx);
    } else if (this._ground !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this._ground.draw(camera);
    }

    const screenW = this.state.config.display.width;
    const screenH = this.state.config.display.height;
    drawScreenFade(ctx, this.state, screenW, screenH);

    const resources = requireRuntimeResources(this.state);
    const font = resources.smallFont;
    const scale = this.state.config.display.width < 641.0 ? 0.9 : 1.0;
    const layout = this._layout(scale);

    // Draw panel background
    const dst: RectTuple = [
      layout.panelX,
      layout.panelY,
      MENU_PANEL_WIDTH * scale,
      378.0 * scale,
    ];
    const fxDetail = fxDetailEnabled(this.state.config.display, 0);
    const panel = getTexture(resources, TextureId.UI_MENU_PANEL);
    drawClassicMenuPanel(ctx, panel, dst, WHITE, fxDetail);

    // Title and subtitles
    drawSmallText(ctx, font, _TITLE, new Vec2(layout.titleX, layout.titleY), WHITE);
    drawSmallText(ctx, font, _SUBTITLE_1, new Vec2(layout.subtitle1X, layout.subtitle1Y), WHITE);
    drawSmallText(ctx, font, _SUBTITLE_2, new Vec2(layout.subtitle2X, layout.subtitle2Y), WHITE);

    // Score
    const scoreText = `score: ${this._score | 0}`;
    drawSmallText(ctx, font, scoreText, new Vec2(layout.scoreX, layout.scoreY), [1.0, 1.0, 1.0, 0.7]);

    // Board background
    ctx.drawRectangle(layout.boardX, layout.boardY, layout.boardSize, layout.boardSize, 0.0, 0.0, 0.0, 0.6);
    // Board border
    const borderW = Math.max(1.0, scale);
    ctx.drawRectangle(layout.boardX, layout.boardY, layout.boardSize, borderW, 1, 1, 1, 1);
    ctx.drawRectangle(layout.boardX, layout.boardY + layout.boardSize - borderW, layout.boardSize, borderW, 1, 1, 1, 1);
    ctx.drawRectangle(layout.boardX, layout.boardY, borderW, layout.boardSize, 1, 1, 1, 1);
    ctx.drawRectangle(layout.boardX + layout.boardSize - borderW, layout.boardY, borderW, layout.boardSize, 1, 1, 1, 1);

    // Timer bar
    let timerValue = (this._timerMs / 100) | 0;
    if (timerValue > 0xC0) timerValue = 0xC0;
    const timerH = 6.0 * scale;
    const timerY = layout.boardY + (200.0 * scale);
    const timerFillW = timerValue * scale;
    ctx.drawRectangle(layout.boardX, timerY, timerFillW, timerH, 0.2, 0.6, 1.0, 0.6);
    // Timer border
    ctx.drawRectangle(layout.boardX, timerY, layout.boardSize, borderW, 1, 1, 1, 1);
    ctx.drawRectangle(layout.boardX, timerY + timerH - borderW, layout.boardSize, borderW, 1, 1, 1, 1);
    ctx.drawRectangle(layout.boardX, timerY, borderW, timerH, 1, 1, 1, 1);
    ctx.drawRectangle(layout.boardX + layout.boardSize - borderW, timerY, borderW, timerH, 1, 1, 1, 1);

    // Selection highlight
    if (this._selectedIndex >= 0) {
      const selRow = (this._selectedIndex / _BOARD_SIDE) | 0;
      const selCol = this._selectedIndex % _BOARD_SIDE;
      const selX = layout.boardX + selCol * layout.tileSize + (4.0 * scale);
      const selY = layout.boardY + selRow * layout.tileSize + (4.0 * scale);
      const selSize = 24.0 * scale;
      ctx.drawRectangle(selX, selY, selSize, selSize, 0.2, 0.4, 0.7, 0.4);
      // Selection border
      ctx.drawRectangle(selX, selY, selSize, borderW, 1, 1, 1, 1);
      ctx.drawRectangle(selX, selY + selSize - borderW, selSize, borderW, 1, 1, 1, 1);
      ctx.drawRectangle(selX, selY, borderW, selSize, 1, 1, 1, 1);
      ctx.drawRectangle(selX + selSize - borderW, selY, borderW, selSize, 1, 1, 1, 1);
    }

    // Draw alien tiles
    const alien = getTexture(resources, TextureId.ALIEN);
    const frameW = alien.width / 8.0;
    const frameH = alien.height / 8.0;
    for (let index = 0; index < this._board.length; index++) {
      const tile = this._board[index];
      if (tile === -3) continue;
      const row = (index / _BOARD_SIDE) | 0;
      const col = index % _BOARD_SIDE;
      const animFrame = (((this._animTimeMs / 50) | 0) + (tile * 2)) % 32;
      const srcCol = animFrame % 8;
      const srcRow = (animFrame / 8) | 0;
      const src: RectTuple = [srcCol * frameW, srcRow * frameH, frameW, frameH];
      const tileDst: RectTuple = [
        layout.boardX + col * layout.tileSize,
        layout.boardY + row * layout.tileSize,
        layout.tileSize,
        layout.tileSize,
      ];
      let tint: Color;
      if (tile === 0) {
        tint = [1.0, 0.5, 0.5, 1.0];
      } else if (tile === 1) {
        tint = [0.5, 0.5, 1.0, 1.0];
      } else if (tile === 2) {
        tint = [1.0, 0.5, 1.0, 1.0];
      } else if (tile === 3) {
        tint = [0.5, 1.0, 1.0, 1.0];
      } else if (tile === 4) {
        tint = [1.0, 1.0, 0.5, 1.0];
      } else {
        tint = WHITE;
      }
      ctx.drawTexturePro(alien, src, tileDst, [0.0, 0.0], 0.0, tint);
    }

    // Game over text (blinks)
    if (this._timerMs === 0 && Math.cos(this._animTimeMs * 0.005) > 0.0) {
      drawSmallText(ctx, font, _LABEL_GAME_OVER, new Vec2(layout.gameOverX, layout.gameOverY), WHITE);
    }

    // Buttons
    const resetW = buttonWidth(resources, this._resetButton.label, { scale, forceWide: this._resetButton.forceWide });
    buttonDraw(ctx, resources, this._resetButton, { pos: layout.resetPos, width: resetW, scale });

    const backW = buttonWidth(resources, this._backButton.label, { scale, forceWide: this._backButton.forceWide });
    buttonDraw(ctx, resources, this._backButton, { pos: layout.backPos, width: backW, scale });

    // Sign and cursor
    this._drawSign(ctx, resources);
    this._drawMenuCursor(ctx, resources);
  }

  private _drawSign(ctx: WebGLContext, resources: RuntimeResources): void {
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
    drawMenuCursor(ctx, particles, cursorTex, new Vec2(mx, my), this._cursorPulseTime);
  }
}
