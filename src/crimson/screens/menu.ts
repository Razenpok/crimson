// Port of crimson/screens/menu.py

import * as wgl from '@wgl';
import { Vec2, Rect } from '@grim/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { audioPlaySfx, audioPlayMusic, audioStopMusic, audioUpdate } from '@grim/audio.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { fxDetailEnabled } from '@grim/config.ts';
import { InputState } from '@grim/input.ts';
import { GroundRenderer } from '@grim/terrain-render.ts';
import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { menuWidescreenYShift } from '@crimson/ui/layout.ts';
import { UI_SHADOW_OFFSET, drawUiQuadShadow } from '@crimson/ui/shadow.ts';
import { type GameState } from '@crimson/game/types.ts';
import { advanceUnlockTerrain } from '@crimson/sim/bootstrap.ts';
import { requireRuntimeResources } from './assets.ts';
import { drawScreenFade } from './transitions.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MENU_LABEL_WIDTH = 122.0;
export const MENU_LABEL_HEIGHT = 28.0;
export const MENU_LABEL_ROW_HEIGHT = 32.0;
export const MENU_LABEL_ROW_PLAY_GAME = 1;
export const MENU_LABEL_ROW_OPTIONS = 2;
export const MENU_LABEL_ROW_STATISTICS = 3;
export const MENU_LABEL_ROW_MODS = 4;
export const MENU_LABEL_ROW_OTHER_GAMES = 5;
export const MENU_LABEL_ROW_QUIT = 6;
export const MENU_LABEL_ROW_BACK = 7;
export const MENU_LABEL_BASE_X = -60.0;
export const MENU_LABEL_BASE_Y = 210.0;
export const MENU_LABEL_OFFSET_X = 271.0;
export const MENU_LABEL_OFFSET_Y = -37.0;
export const MENU_LABEL_STEP = 60.0;
export const MENU_ITEM_OFFSET_X = -71.0;
export const MENU_ITEM_OFFSET_Y = -59.0;
export const MENU_PANEL_WIDTH = 510.0;
export const MENU_PANEL_HEIGHT = 254.0;
// Measured from ui_render_trace at 1024x768 (stable timeline):
// panel top-left is (pos_x + 21, pos_y - 81) and size is 510x254, plus a shadow pass at +7,+7.
export const MENU_PANEL_OFFSET_X = 21.0;
export const MENU_PANEL_OFFSET_Y = -81.0;
export const MENU_PANEL_BASE_X = -45.0;
export const MENU_PANEL_BASE_Y = 210.0;
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

// Measured in the shareware/demo attract loop trace:
// {"event":"demo_mode_start","dt_since_start_ms":23024,...}
export const MENU_DEMO_IDLE_START_MS = 23_000;

// Key codes
const KEY_TAB = 9;
const KEY_ENTER = 13;
const KEY_LEFT_SHIFT = 16;
const KEY_RIGHT_SHIFT = 16; // DOM doesn't distinguish shift keys by keyCode
const MOUSE_BUTTON_LEFT = 0;
const MOUSE_BUTTON_RIGHT = 2;
const MOUSE_BUTTON_MIDDLE = 1;

const WHITE = wgl.makeColor(1, 1, 1, 1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function menuGroundCamera(state: GameState): Vec2 {
  const camera = state.menuGroundCamera;
  if (camera instanceof Vec2) {
    return camera;
  }
  return new Vec2();
}

export function ensureMenuGround(
  state: GameState,
  regenerate: boolean = false,
): GroundRenderer {
  const resources = requireRuntimeResources(state);
  let ground = state.menuGround;
  const generatedNewTerrain = ground === null || regenerate;

  // Slot mapping: 0 => TER_Q1_BASE, 1 => TER_Q1_OVERLAY, 2 => TER_Q2_BASE, etc.
  const slotToTextureId: TextureId[] = [
    TextureId.TER_Q1_BASE, TextureId.TER_Q1_OVERLAY,
    TextureId.TER_Q2_BASE, TextureId.TER_Q2_OVERLAY,
    TextureId.TER_Q3_BASE, TextureId.TER_Q3_OVERLAY,
    TextureId.TER_Q4_BASE, TextureId.TER_Q4_OVERLAY,
  ];

  let base: wgl.Texture;
  let overlay: wgl.Texture;
  let detail: wgl.Texture;
  let terrainSeed = 0;

  if (generatedNewTerrain) {
    const terrain = advanceUnlockTerrain(
      state.rng,
      0, // unlockIndex — quest_unlock_index not tracked on GameState yet
      1024,
      1024,
    );
    // resolveTerrainSlots: map slot indices to texture IDs and look them up.
    base = getTexture(resources, slotToTextureId[terrain.terrainSlots[0]]);
    overlay = getTexture(resources, slotToTextureId[terrain.terrainSlots[1]]);
    detail = getTexture(resources, slotToTextureId[terrain.terrainSlots[2]]);
    terrainSeed = terrain.terrainSeed;
  } else {
    base = ground!.texture;
    overlay = ground!.overlay;
    detail = ground!.overlayDetail;
  }

  if (ground === null) {
    ground = new GroundRenderer(base, overlay, detail);
    ground.textureScale = state.config.display.textureScale;
    state.menuGround = ground;
  } else {
    ground.texture = base;
    ground.overlay = overlay;
    ground.overlayDetail = detail;
  }

  if (generatedNewTerrain) {
    ground.scheduleGenerate(terrainSeed);
    state.menuGroundCamera = null;
  }

  return ground;
}

function drawMenuCursorHelper(
  state: GameState,
  resources: RuntimeResources,
  pulseTime: number,
): void {
  const particles = getTexture(resources, TextureId.PARTICLES);
  const cursorTex = getTexture(resources, TextureId.UI_CURSOR);
  const [mx, my] = InputState.mousePosition();
  const pos = new Vec2(mx, my);
  drawMenuCursor(particles, cursorTex, pos, pulseTime);
}

// ---------------------------------------------------------------------------
// MenuEntry
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
// UI element animation — port of MenuView._ui_element_anim
// ---------------------------------------------------------------------------

function uiElementAnim(
  timelineMs: number,
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
  const t = timelineMs | 0;
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
// MenuView
// ---------------------------------------------------------------------------

export class MenuView {
  state: GameState;
  private _isOpen: boolean = false;
  private _ground: GroundRenderer | null = null;
  private _menuEntries: MenuEntry[] = [];
  private _selectedIndex: number = 0;
  private _focusTimerMs: number = 0;
  private _hoveredIndex: number | null = null;
  private _fullVersion: boolean = false;
  private _timelineMs: number = 0;
  private _timelineMaxMs: number = 0;
  private _idleMs: number = 0;
  private _lastMousePos: Vec2 = new Vec2();
  private _cursorPulseTime: number = 0.0;
  private _widescreenYShift: number = 0.0;
  private _menuScreenWidth: number = 0;
  private _closing: boolean = false;
  private _closeAction: string | null = null;
  private _pendingAction: string | null = null;
  private _panelOpenSfxPlayed: boolean = false;

  constructor(state: GameState) {
    this.state = state;
  }

  open(): void {
    const layoutW = this.state.config.display.width;
    this._menuScreenWidth = layoutW | 0;
    this._widescreenYShift = menuWidescreenYShift(layoutW);
    // Shareware gating is controlled by the demoEnabled flag.
    this._fullVersion = !this.state.demoEnabled;
    this._menuEntries = this._menuEntriesForFlags(
      this._fullVersion,
      this._modsAvailable(),
      this._otherGamesEnabled(),
    );
    this._selectedIndex = this._menuEntries.length > 0 ? 0 : -1;
    this._focusTimerMs = 0;
    this._hoveredIndex = null;
    this._timelineMs = 0;
    this._idleMs = 0;
    this._cursorPulseTime = 0.0;
    const [mx, my] = InputState.mousePosition();
    this._lastMousePos = new Vec2(mx, my);
    this._closing = false;
    this._closeAction = null;
    this._pendingAction = null;
    this._panelOpenSfxPlayed = false;
    this._timelineMaxMs = MenuView._menuMaxTimelineMs(
      this._fullVersion,
      this._modsAvailable(),
      this._otherGamesEnabled(),
    );
    this._initGround();
    if (this.state.audio !== null) {
      const theme = this.state.demoEnabled ? 'crimsonquest' : 'crimson_theme';
      if (this.state.audio.music.activeTrack !== theme) {
        audioStopMusic(this.state.audio);
      }
      this.state.audio.music.activeTrack = theme;
      audioPlayMusic(this.state.audio, theme);
    }
    this._isOpen = true;
  }

  close(): void {
    this._isOpen = false;
    this._ground = null;
  }

  update(dt: number): void {
    this._assertOpen();
    if (this.state.audio !== null) {
      if (!this._closing) {
        const theme = this.state.demoEnabled ? 'crimsonquest' : 'crimson_theme';
        this.state.audio.music.activeTrack = theme;
        audioPlayMusic(this.state.audio, theme);
      }
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
        this._focusTimerMs = Math.max(0, this._focusTimerMs - dtMs);
        if (this._timelineMs < 0 && this._closeAction !== null) {
          this._pendingAction = this._closeAction;
          this._closeAction = null;
        }
      }
      return;
    }

    if (dtMs > 0) {
      const [mx, my] = InputState.mousePosition();
      const mousePos = new Vec2(mx, my);
      const mouseMoved = mousePos.x !== this._lastMousePos.x || mousePos.y !== this._lastMousePos.y;
      if (mouseMoved) {
        this._lastMousePos = mousePos;
      }

      const anyKey = InputState.firstKeyPressed() !== null;
      const anyClick = (
        InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT) ||
        InputState.wasMouseButtonPressed(MOUSE_BUTTON_RIGHT) ||
        InputState.wasMouseButtonPressed(MOUSE_BUTTON_MIDDLE)
      );

      if (anyKey || anyClick || mouseMoved) {
        this._idleMs = 0;
      } else {
        this._idleMs += dtMs;
      }
    }

    if (dtMs > 0) {
      this._timelineMs = Math.min(this._timelineMaxMs, this._timelineMs + dtMs);
      this._focusTimerMs = Math.max(0, this._focusTimerMs - dtMs);
      if (this._timelineMs >= this._timelineMaxMs) {
        this.state.menuSignLocked = true;
        if (!this._panelOpenSfxPlayed && this.state.audio !== null) {
          audioPlaySfx(this.state.audio, SfxId.UI_PANELCLICK);
          this._panelOpenSfxPlayed = true;
        }
      }
    }
    if (this._menuEntries.length === 0) {
      return;
    }

    const resources = requireRuntimeResources(this.state);
    this._hoveredIndex = this._hoveredEntryIndex(resources);

    if (InputState.wasKeyPressed(KEY_TAB)) {
      const reverse = InputState.isKeyDown(KEY_LEFT_SHIFT);
      const delta = reverse ? -1 : 1;
      this._selectedIndex = ((this._selectedIndex + delta) % this._menuEntries.length + this._menuEntries.length) % this._menuEntries.length;
      this._focusTimerMs = 1000;
    }

    let activatedIndex: number | null = null;
    if (InputState.wasKeyPressed(KEY_ENTER) && 0 <= this._selectedIndex && this._selectedIndex < this._menuEntries.length) {
      const entry = this._menuEntries[this._selectedIndex];
      if (this._menuEntryEnabled(entry)) {
        activatedIndex = this._selectedIndex;
      }
    }

    if (activatedIndex === null && this._hoveredIndex !== null) {
      if (InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
        const hovered = this._hoveredIndex;
        const entry = this._menuEntries[hovered];
        if (this._menuEntryEnabled(entry)) {
          this._selectedIndex = hovered;
          this._focusTimerMs = 1000;
          activatedIndex = hovered;
        }
      }
    }

    if (activatedIndex !== null) {
      this._activateMenuEntry(activatedIndex);
    }
    if (
      !this._closing &&
      this._pendingAction === null &&
      this.state.demoEnabled &&
      this._timelineMs >= this._timelineMaxMs &&
      this._idleMs >= MENU_DEMO_IDLE_START_MS
    ) {
      this._beginCloseTransition('start_demo');
    }
    this._updateReadyTimers(dtMs);
    this._updateHoverAmounts(dtMs);
  }

  draw(): void {
    this._assertOpen();
    wgl.clearBackground(wgl.makeColor(0, 0, 0, 1));
    if (this._ground !== null) {
      this._ground.draw(menuGroundCamera(this.state));
    }
    const screenW = this.state.config.display.width;
    const screenH = this.state.config.display.height;
    drawScreenFade(this.state, screenW, screenH);
    const resources = requireRuntimeResources(this.state);
    this._drawMenuItems(resources);
    this._drawMenuSign(resources);
    drawMenuCursorHelper(this.state, resources, this._cursorPulseTime);
  }

  takeAction(): string | null {
    this._assertOpen();
    const action = this._pendingAction;
    this._pendingAction = null;
    return action;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _assertOpen(): void {
    if (!this._isOpen) {
      throw new Error('MenuView must be opened before use');
    }
  }

  private _activateMenuEntry(index: number): void {
    if (!(0 <= index && index < this._menuEntries.length)) {
      return;
    }
    const entry = this._menuEntries[index];
    if (this.state.audio !== null) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
    }
    if (entry.row === MENU_LABEL_ROW_QUIT) {
      this._beginQuitTransition();
    } else if (entry.row === MENU_LABEL_ROW_PLAY_GAME) {
      this._beginCloseTransition('open_play_game');
    } else if (entry.row === MENU_LABEL_ROW_OPTIONS) {
      this._beginCloseTransition('open_options');
    } else if (entry.row === MENU_LABEL_ROW_STATISTICS) {
      this._beginCloseTransition('open_statistics');
    } else if (entry.row === MENU_LABEL_ROW_MODS) {
      this._beginCloseTransition('open_mods');
    } else if (entry.row === MENU_LABEL_ROW_OTHER_GAMES) {
      this._beginCloseTransition('open_other_games');
    }
  }

  private _beginCloseTransition(action: string): void {
    if (this._closing) return;
    this._closing = true;
    this._closeAction = action;
  }

  private _beginQuitTransition(): void {
    this.state.menuSignLocked = false;
    this._beginCloseTransition(this.state.demoEnabled ? 'quit_after_demo' : 'quit_app');
  }

  private _initGround(): void {
    this._ground = ensureMenuGround(this.state);
    this.state.menuGround = this._ground;
  }

  private _menuEntriesForFlags(
    fullVersion: boolean,
    modsAvailable: boolean,
    otherGames: boolean,
  ): MenuEntry[] {
    const rows = MenuView._menuLabelRows(fullVersion, otherGames);
    const slotYs = MenuView._menuSlotYs(otherGames, this._widescreenYShift);
    const active = MenuView._menuSlotActive(fullVersion, modsAvailable, otherGames);
    const entries: MenuEntry[] = [];
    for (let slot = 0; slot < rows.length; slot++) {
      if (!active[slot]) continue;
      entries.push(new MenuEntry(slot, rows[slot], slotYs[slot]));
    }
    return entries;
  }

  private static _menuLabelRows(_fullVersion: boolean, otherGames: boolean): number[] {
    // Label atlas rows in ui_itemTexts.jaz:
    //   0 BUY NOW (unused), 1 PLAY GAME, 2 OPTIONS, 3 STATISTICS, 4 MODS,
    //   5 OTHER GAMES, 6 QUIT, 7 BACK
    const top = 4;
    if (otherGames) {
      return [top, 1, 2, 3, 5, 6];
    }
    return [top, 1, 2, 3, 6, 7];
  }

  private static _menuSlotYs(_otherGames: boolean, yShift: number): number[] {
    const ys = [
      MENU_LABEL_BASE_Y,
      MENU_LABEL_BASE_Y + MENU_LABEL_STEP,
      MENU_LABEL_BASE_Y + MENU_LABEL_STEP * 2.0,
      MENU_LABEL_BASE_Y + MENU_LABEL_STEP * 3.0,
      MENU_LABEL_BASE_Y + MENU_LABEL_STEP * 4.0,
      MENU_LABEL_BASE_Y + MENU_LABEL_STEP * 5.0,
    ];
    return ys.map(y => y + yShift);
  }

  private static _menuSlotActive(
    _fullVersion: boolean,
    modsAvailable: boolean,
    otherGames: boolean,
  ): boolean[] {
    const showTop = modsAvailable;
    if (otherGames) {
      return [showTop, true, true, true, true, true];
    }
    return [showTop, true, true, true, true, false];
  }

  private _drawMenuItems(resources: RuntimeResources): void {
    if (this._menuEntries.length === 0) return;
    const item = getTexture(resources, TextureId.UI_MENU_ITEM);
    const labelTex = getTexture(resources, TextureId.UI_ITEM_TEXTS);
    const itemW = item.width;
    const itemH = item.height;
    const fxDetail = fxDetailEnabled(this.state.config.display, 0);
    // Matches ui_elements_update_and_render reverse table iteration:
    // later entries draw first, earlier entries draw last (on top).
    for (let idx = this._menuEntries.length - 1; idx >= 0; idx--) {
      const entry = this._menuEntries[idx];
      const posX = MenuView._menuSlotPosX(entry.slot);
      const posY = entry.y;
      const [angleRad, _slideX] = uiElementAnim(
        this._timelineMs,
        entry.slot + 2,
        MenuView._menuSlotStartMs(entry.slot),
        MenuView._menuSlotEndMs(entry.slot),
        itemW,
      );
      // slide is ignored for render_mode==0 (transform) elements
      const [itemScale, localYShift] = this._menuItemScale(entry.slot);
      const offsetX = MENU_ITEM_OFFSET_X * itemScale;
      const offsetY = MENU_ITEM_OFFSET_Y * itemScale - localYShift;
      const dst = wgl.makeRectangle(posX, posY, itemW * itemScale, itemH * itemScale);
      const origin = wgl.makeVector2(-offsetX, -offsetY);
      const rotationDeg = angleRad * (180.0 / Math.PI);
      if (fxDetail) {
        drawUiQuadShadow(
          item,
          wgl.makeRectangle(0.0, 0.0, itemW, itemH),
          wgl.makeRectangle(dst[0] + UI_SHADOW_OFFSET, dst[1] + UI_SHADOW_OFFSET, dst[2], dst[3]),
          origin,
          rotationDeg,
        );
      }
      wgl.drawTexturePro(
        item,
        wgl.makeRectangle(0.0, 0.0, itemW, itemH),
        dst,
        origin,
        rotationDeg,
        WHITE,
      );
      let counterValue = entry.hoverAmount;
      if (idx === this._selectedIndex && this._focusTimerMs > 0) {
        counterValue = this._focusTimerMs;
      }
      const alpha = labelAlpha(counterValue);
      const alphaNorm = alpha / 255;
      const tint = wgl.makeColor(1, 1, 1, alphaNorm);
      const src = wgl.makeRectangle(
        0.0,
        entry.row * MENU_LABEL_ROW_HEIGHT,
        MENU_LABEL_WIDTH,
        MENU_LABEL_ROW_HEIGHT,
      );
      const labelOffsetX = MENU_LABEL_OFFSET_X * itemScale;
      const labelOffsetY = MENU_LABEL_OFFSET_Y * itemScale - localYShift;
      const labelDst = wgl.makeRectangle(
        posX,
        posY,
        MENU_LABEL_WIDTH * itemScale,
        MENU_LABEL_HEIGHT * itemScale,
      );
      const labelOrigin = wgl.makeVector2(-labelOffsetX, -labelOffsetY);
      wgl.drawTexturePro(labelTex, src, labelDst, labelOrigin, rotationDeg, tint);
      if (this._menuEntryEnabled(entry)) {
        let glowAlpha = alpha;
        if (0 <= entry.readyTimerMs && entry.readyTimerMs < 0x100) {
          glowAlpha = 0xFF - ((entry.readyTimerMs / 2) | 0);
        }
        const glowAlphaNorm = glowAlpha / 255;
        wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);
        wgl.drawTexturePro(
          labelTex, src, labelDst, labelOrigin, rotationDeg,
          wgl.makeColor(1, 1, 1, glowAlphaNorm),
        );
        wgl.endBlendMode();
      }
    }
  }

  private _modsAvailable(): boolean {
    // Mods are not supported in the WebGL port.
    return false;
  }

  private _otherGamesEnabled(): boolean {
    // Original game checks a config string via grim_get_config_var(100).
    // Not implemented in WebGL port.
    return false;
  }

  private _hoveredEntryIndex(resources: RuntimeResources): number | null {
    if (this._menuEntries.length === 0) return null;
    const [mx, my] = InputState.mousePosition();
    const mousePos = new Vec2(mx, my);
    for (let idx = 0; idx < this._menuEntries.length; idx++) {
      const entry = this._menuEntries[idx];
      if (!this._menuEntryEnabled(entry)) continue;
      if (this._menuItemBounds(entry, resources).contains(mousePos)) {
        return idx;
      }
    }
    return null;
  }

  private _updateReadyTimers(dtMs: number): void {
    for (const entry of this._menuEntries) {
      if (entry.readyTimerMs < 0x100) {
        entry.readyTimerMs = Math.min(0x100, entry.readyTimerMs + dtMs);
      }
    }
  }

  private _updateHoverAmounts(dtMs: number): void {
    const hoveredIndex = this._hoveredIndex;
    for (let idx = 0; idx < this._menuEntries.length; idx++) {
      const entry = this._menuEntries[idx];
      const hover = hoveredIndex !== null && idx === hoveredIndex;
      if (hover) {
        entry.hoverAmount += dtMs * 6;
      } else {
        entry.hoverAmount -= dtMs * 2;
      }
      entry.hoverAmount = Math.max(0, Math.min(1000, entry.hoverAmount));
    }
  }

  private _menuEntryEnabled(entry: MenuEntry): boolean {
    return this._timelineMs >= MenuView._menuSlotStartMs(entry.slot);
  }

  private _menuItemScale(slot: number): [number, number] {
    if (this._menuScreenWidth < 641) {
      return [0.9, slot * 11.0];
    }
    return [1.0, 0.0];
  }

  private _menuItemBounds(entry: MenuEntry, resources: RuntimeResources): Rect {
    // FUN_0044fb50: inset bounds derived from quad0 v0/v2 and pos_x/pos_y.
    const item = getTexture(resources, TextureId.UI_MENU_ITEM);
    const itemW = item.width;
    const itemH = item.height;
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
    const pos = new Vec2(MenuView._menuSlotPosX(entry.slot), entry.y);
    const topLeft = pos.add(new Vec2(
      offsetMin.x + size.x * 0.54,
      offsetMin.y + size.y * 0.28,
    ));
    const bottomRight = pos.add(new Vec2(
      offsetMax.x - size.x * 0.05,
      offsetMax.y - size.y * 0.10,
    ));
    return Rect.fromPosSize(topLeft, bottomRight.sub(topLeft));
  }

  private static _menuSlotPosX(slot: number): number {
    // ui_menu_layout_init: subtract 20, 40, ... from later menu items
    return MENU_LABEL_BASE_X - slot * 20;
  }

  private static _menuSlotStartMs(slot: number): number {
    // ui_menu_layout_init: start_time_ms is the fully-visible time.
    return (slot + 2) * 100 + 300;
  }

  private static _menuSlotEndMs(slot: number): number {
    // ui_menu_layout_init: end_time_ms is the fully-hidden time.
    return (slot + 2) * 100;
  }

  private static _menuMaxTimelineMs(
    _fullVersion: boolean,
    modsAvailable: boolean,
    otherGames: boolean,
  ): number {
    let maxMs = 300; // sign element at index 0
    const showTop = modsAvailable;
    const slotActive = [showTop, true, true, true, true, otherGames];
    for (let slot = 0; slot < slotActive.length; slot++) {
      if (!slotActive[slot]) continue;
      maxMs = Math.max(maxMs, (slot + 2) * 100 + 300);
    }
    return maxMs;
  }

  private _drawMenuSign(resources: RuntimeResources): void {
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
    let rotationDeg = 0.0;
    if (!this.state.menuSignLocked) {
      const [angleRad, _slideX] = uiElementAnim(
        this._timelineMs,
        0,
        300,
        0,
        signW,
      );
      // slide is ignored for render_mode==0 (transform) elements
      rotationDeg = angleRad * (180.0 / Math.PI);
    }
    const sign = getTexture(resources, TextureId.UI_SIGN_CRIMSON);
    const fxDetail = fxDetailEnabled(this.state.config.display, 0);
    const signSrc = wgl.makeRectangle(0.0, 0.0, sign.width, sign.height);
    const signOrigin = wgl.makeVector2(-signOffsetX, -signOffsetY);

    if (fxDetail) {
      drawUiQuadShadow(
        sign, signSrc,
        wgl.makeRectangle(signPos.x + UI_SHADOW_OFFSET, signPos.y + UI_SHADOW_OFFSET, signW, signH),
        signOrigin,
        rotationDeg,
      );
    }
    wgl.drawTexturePro(
      sign, signSrc,
      wgl.makeRectangle(signPos.x, signPos.y, signW, signH),
      signOrigin,
      rotationDeg,
      WHITE,
    );
  }
}
