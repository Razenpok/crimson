// Port of crimson/screens/panels/base.py — Base panel class for all menu panels

import { Vec2, Rect } from '../../../grim/geom.ts';
import { type WebGLContext, BlendMode } from '../../../grim/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '../../../grim/assets.ts';
import { type AudioState } from '../../../grim/audio.ts';
import { audioPlaySfx, audioUpdate } from '../../../grim/audio.ts';
import { SfxId } from '../../../grim/sfx-map.ts';
import { InputState } from '../../../grim/input.ts';
import { type GroundRenderer } from '../../../grim/terrain-render.ts';
import { drawClassicMenuPanel } from '../../ui/menu-panel.ts';
import { drawMenuCursor } from '../../ui/cursor.ts';
import { menuWidescreenYShift } from '../../ui/layout.ts';
import { UI_SHADOW_OFFSET, drawUiQuadShadow } from '../../ui/shadow.ts';
import { drawSmallText } from '../../../grim/fonts/small.ts';

// ---------------------------------------------------------------------------
// Menu layout constants (re-exported from the menu module in the Python port)
// ---------------------------------------------------------------------------

export const MENU_LABEL_WIDTH = 122.0;
export const MENU_LABEL_HEIGHT = 28.0;
export const MENU_LABEL_ROW_HEIGHT = 32.0;
export const MENU_LABEL_ROW_BACK = 7;

export const MENU_LABEL_OFFSET_X = 271.0;
export const MENU_LABEL_OFFSET_Y = -37.0;

export const MENU_ITEM_OFFSET_X = -71.0;
export const MENU_ITEM_OFFSET_Y = -59.0;

export const MENU_PANEL_WIDTH = 510.0;
export const MENU_PANEL_HEIGHT = 254.0;
export const MENU_PANEL_OFFSET_X = 21.0;
export const MENU_PANEL_OFFSET_Y = -81.0;

export const MENU_SCALE_SMALL_THRESHOLD = 640;
export const MENU_SCALE_LARGE_MIN = 801;
export const MENU_SCALE_LARGE_MAX = 1024;
export const MENU_SCALE_SMALL = 0.8;
export const MENU_SCALE_LARGE = 1.2;
export const MENU_SCALE_SHIFT = 10.0;

export const MENU_SIGN_WIDTH = 571.44;
export const MENU_SIGN_HEIGHT = 141.36;
export const MENU_SIGN_OFFSET_X = -576.44;
export const MENU_SIGN_OFFSET_Y = -61.0;
export const MENU_SIGN_POS_Y = 70.0;
export const MENU_SIGN_POS_Y_SMALL = 60.0;
export const MENU_SIGN_POS_X_PAD = 4.0;

// ---------------------------------------------------------------------------
// Panel-specific constants
// ---------------------------------------------------------------------------

const PANEL_POS_X = -45.0;
const PANEL_POS_Y = 210.0;
const PANEL_BACK_POS_X = -55.0;
const PANEL_BACK_POS_Y = 430.0;
export const PANEL_TIMELINE_START_MS = 300;
export const PANEL_TIMELINE_END_MS = 0;

const FADE_TO_GAME_ACTIONS = new Set([
  'start_survival',
  'start_rush',
  'start_typo',
  'start_tutorial',
  'start_quest',
]);

const KEY_ESCAPE = 27;
const KEY_ENTER = 13;
const MOUSE_BUTTON_LEFT = 0;

type Color = [number, number, number, number];
type RectTuple = [number, number, number, number];

const WHITE: Color = [1, 1, 1, 1];
const ORIGIN: [number, number] = [0, 0];

// ---------------------------------------------------------------------------
// MenuEntry — one interactive menu button slot
// ---------------------------------------------------------------------------

export class MenuEntry {
  slot: number;
  row: number;
  y: number;
  hoverAmount: number;
  readyTimerMs: number;

  constructor(slot: number, row: number, y: number) {
    this.slot = slot;
    this.row = row;
    this.y = y;
    this.hoverAmount = 0;
    this.readyTimerMs = 0x100;
  }
}

// ---------------------------------------------------------------------------
// Minimal GameState interface consumed by panels
// ---------------------------------------------------------------------------

export interface PanelGameState {
  config: {
    display: {
      width: number;
      height: number;
      fxDetail: [boolean, boolean, boolean];
    };
    controls: import('../../../grim/config.ts').CrimsonControlsConfig;
    save?(): void;
  };
  audio: AudioState | null;
  resources: RuntimeResources | null;
  menuSignLocked: boolean;
  screenFadeAlpha: number;
  screenFadeRamp: boolean;
  pauseBackground: { drawPauseBackground(ctx: WebGLContext): void } | null;
  menuGround: GroundRenderer | null;
  menuGroundCamera: Vec2 | null;
  console?: { log: { log(msg: string): void } };
}

// ---------------------------------------------------------------------------
// UI element animation — port of MenuView._ui_element_anim
// ---------------------------------------------------------------------------

interface TimelineView {
  _timelineMs: number;
}

function uiElementAnim(
  view: TimelineView,
  index: number,
  startMs: number,
  endMs: number,
  width: number,
  directionFlag: number = 0,
): [number, number] {
  // Matches ui_element_update: angle lerps pi/2 -> 0 over [end_ms, start_ms].
  // directionFlag=0 slides from left  (-width -> 0)
  // directionFlag=1 slides from right (+width -> 0)
  if (startMs <= endMs || width <= 0.0) {
    return [0.0, 0.0];
  }
  const dirSign = directionFlag ? 1.0 : -1.0;
  const t = view._timelineMs | 0;
  if (t < endMs) {
    const angle = 1.5707964;
    const offsetX = dirSign * Math.abs(width);
    return [angle, offsetX];
  } else if (t < startMs) {
    const elapsed = t - endMs;
    const span = startMs - endMs;
    const p = elapsed / span;
    const angle = 1.5707964 * (1.0 - p);
    const offsetX = dirSign * ((1.0 - p) * Math.abs(width));
    return [angle, offsetX];
  } else {
    return [0.0, 0.0];
  }
}

function labelAlpha(counterValue: number): number {
  // ui_element_render: alpha = 100 + floor(counter_value * 155 / 1000)
  return 100 + (((counterValue * 155) / 1000) | 0);
}

function signLayoutScale(width: number): [number, number] {
  if (width <= MENU_SCALE_SMALL_THRESHOLD) {
    return [MENU_SCALE_SMALL, MENU_SCALE_SHIFT];
  }
  if (MENU_SCALE_LARGE_MIN <= width && width <= MENU_SCALE_LARGE_MAX) {
    return [MENU_SCALE_LARGE, MENU_SCALE_SHIFT];
  }
  return [1.0, 0.0];
}

// ---------------------------------------------------------------------------
// PanelMenuView
// ---------------------------------------------------------------------------

export class PanelMenuView {
  state: PanelGameState;

  private _isOpen: boolean = false;
  private _title: string;
  private _bodyLines: string[];
  protected _panelPos: Vec2;
  protected _panelOffset: Vec2;
  protected _panelHeight: number;
  protected _backPos: Vec2;
  protected _backAction: string;

  protected _ground: GroundRenderer | null = null;
  private _cachedResources: RuntimeResources | null = null;
  protected _entry: MenuEntry | null = null;
  protected _hovered: boolean = false;
  protected _menuScreenWidth: number = 0;
  protected _widescreenYShift: number = 0.0;
  _timelineMs: number = 0;
  protected _timelineMaxMs: number = 0;
  protected _cursorPulseTime: number = 0.0;
  protected _closing: boolean = false;
  protected _closeAction: string | null = null;
  protected _pendingAction: string | null = null;
  private _panelOpenSfxPlayed: boolean = false;

  constructor(
    state: PanelGameState,
    opts: {
      title: string;
      body?: string | null;
      panelPos?: Vec2;
      panelOffset?: Vec2;
      panelHeight?: number;
      backPos?: Vec2;
      backAction?: string;
    },
  ) {
    this.state = state;
    this._title = opts.title;
    this._bodyLines = (opts.body ?? '').split('\n');
    this._panelPos = opts.panelPos ?? new Vec2(PANEL_POS_X, PANEL_POS_Y);
    this._panelOffset = opts.panelOffset ?? new Vec2(MENU_PANEL_OFFSET_X, MENU_PANEL_OFFSET_Y);
    this._panelHeight = opts.panelHeight ?? MENU_PANEL_HEIGHT;
    this._backPos = opts.backPos ?? new Vec2(PANEL_BACK_POS_X, PANEL_BACK_POS_Y);
    this._backAction = opts.backAction ?? 'back_to_menu';
  }

  open(): void {
    const layoutW = this.state.config.display.width;
    this._menuScreenWidth = layoutW | 0;
    this._widescreenYShift = menuWidescreenYShift(layoutW);
    this._entry = new MenuEntry(0, MENU_LABEL_ROW_BACK, this._backPos.y);
    this._hovered = false;
    this._timelineMs = 0;
    this._timelineMaxMs = PANEL_TIMELINE_START_MS;
    this._cursorPulseTime = 0.0;
    this._closing = false;
    this._closeAction = null;
    this._pendingAction = null;
    this._panelOpenSfxPlayed = false;
    this._initGround();
    this._isOpen = true;
  }

  close(): void {
    this._isOpen = false;
    this._ground = null;
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
      if (this._timelineMs >= this._timelineMaxMs) {
        this.state.menuSignLocked = true;
        if (!this._panelOpenSfxPlayed && this.state.audio !== null) {
          audioPlaySfx(this.state.audio, SfxId.UI_PANELCLICK);
          this._panelOpenSfxPlayed = true;
        }
      }
    }

    const entry = this._entry;
    if (entry === null) return;

    const enabled = this._entryEnabled(entry);
    const hovered = enabled && this._hoveredEntry(entry);
    this._hovered = hovered;

    if (InputState.wasKeyPressed(KEY_ESCAPE) && enabled) {
      this._beginCloseTransition(this._backAction);
    }
    if (InputState.wasKeyPressed(KEY_ENTER) && enabled) {
      this._beginCloseTransition(this._backAction);
    }
    if (enabled && hovered && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._beginCloseTransition(this._backAction);
    }

    if (hovered) {
      entry.hoverAmount += dtMs * 6;
    } else {
      entry.hoverAmount -= dtMs * 2;
    }
    entry.hoverAmount = Math.max(0, Math.min(1000, entry.hoverAmount));

    if (entry.readyTimerMs < 0x100) {
      entry.readyTimerMs = Math.min(0x100, entry.readyTimerMs + dtMs);
    }
  }

  draw(ctx: WebGLContext, resources: RuntimeResources | null = this.state.resources): void {
    this._assertOpen();
    if (resources === null) {
      throw new Error('PanelMenuView.draw() requires resources (none provided and state.resources is null)');
    }
    this._cachedResources = resources;
    this._drawBackground(ctx);
    this._drawScreenFade(ctx);

    const entry = this._entry;
    if (entry === null) {
      throw new Error('PanelMenuView entry must be initialized before draw()');
    }

    this._drawPanel(ctx, resources);
    this._drawEntry(ctx, resources, entry);
    this._drawSign(ctx, resources);
    this._drawContents(ctx, resources);
    this._drawMenuCursor(ctx, resources);
  }

  takeAction(): string | null {
    this._assertOpen();
    const action = this._pendingAction;
    this._pendingAction = null;
    return action;
  }

  // ---------------------------------------------------------------------------
  // Protected — subclasses may override
  // ---------------------------------------------------------------------------

  protected _drawContents(ctx: WebGLContext, resources: RuntimeResources): void {
    this._drawTitleText(ctx, resources);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  protected _assertOpen(): void {
    if (!this._isOpen) {
      throw new Error(`${this.constructor.name} must be opened before use`);
    }
  }

  private _drawTitleText(ctx: WebGLContext, resources: RuntimeResources): void {
    const font = resources.smallFont;
    const x = 32;
    let y = 140;
    const titleColor: Color = [235 / 255, 235 / 255, 235 / 255, 1];
    drawSmallText(ctx, font, this._title, new Vec2(x, y), titleColor);
    y += 34;
    const bodyColor: Color = [190 / 255, 190 / 255, 200 / 255, 1];
    for (const line of this._bodyLines) {
      drawSmallText(ctx, font, line, new Vec2(x, y), bodyColor);
      y += 22;
    }
  }

  protected _beginCloseTransition(action: string): void {
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

  private _initGround(): void {
    if (this.state.pauseBackground !== null) {
      this._ground = null;
      return;
    }
    // In the full port, this calls ensureMenuGround(state).
    // For now, reuse whatever ground the state already has.
    this._ground = this.state.menuGround;
  }

  private _drawBackground(ctx: WebGLContext): void {
    ctx.clearBackground(0, 0, 0, 1);
    const pauseBackground = this.state.pauseBackground;
    if (pauseBackground !== null) {
      pauseBackground.drawPauseBackground(ctx);
      return;
    }
    if (this._ground !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this._ground.draw(camera);
    }
  }

  private _drawScreenFade(ctx: WebGLContext): void {
    // Port of _draw_screen_fade: draws a fullscreen fade overlay.
    // The actual implementation depends on the transitions module;
    // stub here with alpha overlay when fade is active.
    const alpha = this.state.screenFadeAlpha;
    if (alpha > 0.0) {
      const w = this.state.config.display.width;
      const h = this.state.config.display.height;
      ctx.drawRectangle(0, 0, w, h, 0, 0, 0, alpha);
    }
  }

  protected _drawPanel(ctx: WebGLContext, resources: RuntimeResources): void {
    const panel = getTexture(resources, TextureId.UI_MENU_PANEL);
    const [_angleRad, slideX] = uiElementAnim(
      this,
      1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      MENU_PANEL_WIDTH * this._menuItemScale(0)[0],
    );
    const [itemScale, _localYShift] = this._menuItemScale(0);
    const panelW = MENU_PANEL_WIDTH * itemScale;
    const panelH = this._panelHeight * itemScale;
    const panelTopLeft = new Vec2(
      this._panelPos.x + slideX,
      this._panelPos.y + this._widescreenYShift,
    ).add(this._panelOffset.mul(itemScale));
    const dst: RectTuple = [panelTopLeft.x, panelTopLeft.y, panelW, panelH];
    const fxDetail = this.state.config.display.fxDetail[0];
    drawClassicMenuPanel(ctx, panel, dst, WHITE, fxDetail);
  }

  private _drawEntry(ctx: WebGLContext, resources: RuntimeResources, entry: MenuEntry): void {
    const item = getTexture(resources, TextureId.UI_MENU_ITEM);
    const labelTex = getTexture(resources, TextureId.UI_ITEM_TEXTS);
    const itemW = item.width;
    const itemH = item.height;
    const [_angleRad, slideX] = uiElementAnim(
      this,
      2,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      itemW * this._menuItemScale(entry.slot)[0],
    );
    const pos = new Vec2(this._backPos.x + slideX, entry.y + this._widescreenYShift);
    const [itemScale, localYShift] = this._menuItemScale(entry.slot);
    const offsetX = MENU_ITEM_OFFSET_X * itemScale;
    const offsetY = MENU_ITEM_OFFSET_Y * itemScale - localYShift;
    const dst: RectTuple = [pos.x, pos.y, itemW * itemScale, itemH * itemScale];
    const origin: [number, number] = [-offsetX, -offsetY];
    const fxDetail = this.state.config.display.fxDetail[0];

    if (fxDetail) {
      drawUiQuadShadow(
        ctx, item,
        [0.0, 0.0, itemW, itemH],
        [dst[0] + UI_SHADOW_OFFSET, dst[1] + UI_SHADOW_OFFSET, dst[2], dst[3]],
        origin, 0.0,
      );
    }
    ctx.drawTexturePro(
      item,
      [0.0, 0.0, itemW, itemH],
      dst,
      origin, 0.0, WHITE,
    );

    const alpha = labelAlpha(entry.hoverAmount);
    const alphaNorm = alpha / 255;
    const tint: Color = [1, 1, 1, alphaNorm];
    const src: RectTuple = [
      0.0,
      entry.row * MENU_LABEL_ROW_HEIGHT,
      MENU_LABEL_WIDTH,
      MENU_LABEL_ROW_HEIGHT,
    ];
    const labelOffsetX = MENU_LABEL_OFFSET_X * itemScale;
    const labelOffsetY = MENU_LABEL_OFFSET_Y * itemScale - localYShift;
    const labelDst: RectTuple = [
      pos.x,
      pos.y,
      MENU_LABEL_WIDTH * itemScale,
      MENU_LABEL_HEIGHT * itemScale,
    ];
    const labelOrigin: [number, number] = [-labelOffsetX, -labelOffsetY];
    ctx.drawTexturePro(labelTex, src, labelDst, labelOrigin, 0.0, tint);

    if (this._entryEnabled(entry)) {
      ctx.setBlendMode(BlendMode.ADDITIVE);
      ctx.drawTexturePro(
        labelTex, src, labelDst, labelOrigin, 0.0,
        [1, 1, 1, alphaNorm],
      );
      ctx.setBlendMode(BlendMode.ALPHA);
    }
  }

  private _drawSign(ctx: WebGLContext, resources: RuntimeResources): void {
    const screenW = this.state.config.display.width;
    const [scale, shiftX] = signLayoutScale(screenW | 0);
    const signPos = new Vec2(
      screenW + MENU_SIGN_POS_X_PAD,
      screenW > MENU_SCALE_SMALL_THRESHOLD ? MENU_SIGN_POS_Y : MENU_SIGN_POS_Y_SMALL,
    );
    const signW = MENU_SIGN_WIDTH * scale;
    const signH = MENU_SIGN_HEIGHT * scale;
    const signOffsetX = MENU_SIGN_OFFSET_X * scale + shiftX;
    const signOffsetY = MENU_SIGN_OFFSET_Y * scale;
    // Quest screen is only reachable after the Play Game panel is fully visible,
    // so the sign is already locked in place. Keep it static here.
    const rotationDeg = 0.0;

    const sign = getTexture(resources, TextureId.UI_SIGN_CRIMSON);
    const fxDetail = this.state.config.display.fxDetail[0];
    const signSrc: RectTuple = [0.0, 0.0, sign.width, sign.height];
    const signOrigin: [number, number] = [-signOffsetX, -signOffsetY];

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

  protected _entryEnabled(_entry: MenuEntry): boolean {
    return this._timelineMs >= PANEL_TIMELINE_START_MS;
  }

  protected _hoveredEntry(entry: MenuEntry): boolean {
    const [mx, my] = InputState.mousePosition();
    const mousePos = new Vec2(mx, my);
    return this._menuItemBounds(entry).contains(mousePos);
  }

  protected _menuItemScale(slot: number): [number, number] {
    if (this._menuScreenWidth < 641) {
      return [0.9, slot * 11.0];
    }
    return [1.0, 0.0];
  }

  private _menuItemBounds(entry: MenuEntry): Rect {
    // Use actual UI_MENU_ITEM texture dimensions when available,
    // falling back to reasonable defaults.
    let itemW = 400;
    let itemH = 90;
    if (this._cachedResources !== null) {
      try {
        const tex = getTexture(this._cachedResources, TextureId.UI_MENU_ITEM);
        itemW = tex.width;
        itemH = tex.height;
      } catch { /* use defaults */ }
    }
    const [itemScale, localYShift] = this._menuItemScale(entry.slot);
    const offsetMin = new Vec2(
      MENU_ITEM_OFFSET_X * itemScale,
      MENU_ITEM_OFFSET_Y * itemScale - localYShift,
    );
    const offsetMax = new Vec2(
      (MENU_ITEM_OFFSET_X + itemW) * itemScale,
      (MENU_ITEM_OFFSET_Y + itemH) * itemScale - localYShift,
    );
    const size = offsetMax.sub(offsetMin);
    const [_angleRad, slideX] = uiElementAnim(
      this,
      2,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      itemW * itemScale,
    );
    const pos = new Vec2(this._backPos.x + slideX, entry.y + this._widescreenYShift);
    const topLeft = pos.add(new Vec2(
      offsetMin.x + size.x * 0.54,
      offsetMin.y + size.y * 0.28,
    ));
    const bottomRight = pos.add(new Vec2(
      offsetMax.x - size.x * 0.05,
      offsetMax.y - size.y * 0.10,
    ));
    const br = bottomRight.sub(topLeft);
    return Rect.fromPosSize(topLeft, br);
  }
}

// Re-export the animation helper so subclasses / sibling modules can use it.
export { uiElementAnim, labelAlpha, signLayoutScale };
