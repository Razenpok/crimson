// Port of crimson/screens/panels/play_game.py — Play Game mode select panel

import { Vec2, Rect } from '../../../grim/geom.ts';
import { type WebGLContext } from '../../../grim/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '../../../grim/assets.ts';
import { type SmallFontData } from '../../../grim/assets.ts';
import { drawSmallText, measureSmallTextWidth } from '../../../grim/fonts/small.ts';
import { InputState } from '../../../grim/input.ts';
import { audioUpdate } from '../../../grim/audio.ts';
import { GameMode } from '../../game-modes.ts';
import {
  UiButtonState,
  buttonDraw,
  buttonUpdate,
  buttonWidth,
} from '../../ui/perk-menu.ts';
import {
  PanelMenuView,
  type PanelGameState,
  MENU_LABEL_ROW_HEIGHT,
  MENU_PANEL_OFFSET_Y,
  MENU_PANEL_WIDTH,
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
  uiElementAnim,
} from './base.ts';
import { mouseInsideRectWithPadding } from './hit-test.ts';

// ---------------------------------------------------------------------------
// Label row indices for the UI_ITEM_TEXTS sprite sheet
// ---------------------------------------------------------------------------

const MENU_LABEL_ROW_PLAY_GAME = 1;

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const KEY_ESCAPE = 27;
const KEY_F1 = 112;
const MOUSE_BUTTON_LEFT = 0;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

type Color = [number, number, number, number];
const WHITE: Color = [1, 1, 1, 1];

// ---------------------------------------------------------------------------
// PlayGameModeEntry
// ---------------------------------------------------------------------------

interface PlayGameModeEntry {
  key: string;
  label: string;
  tooltip: string;
  action: string;
  gameMode: number | null;
  showCount: boolean;
}

function modeEntry(
  key: string,
  label: string,
  tooltip: string,
  action: string,
  gameMode: number | null = null,
  showCount: boolean = false,
): PlayGameModeEntry {
  return { key, label, tooltip, action, gameMode, showCount };
}

// ---------------------------------------------------------------------------
// PlayGameContentLayout
// ---------------------------------------------------------------------------

interface PlayGameContentLayout {
  scale: number;
  basePos: Vec2;
  dropPos: Vec2;
}

// ---------------------------------------------------------------------------
// PlayerCountWidgetLayout
// ---------------------------------------------------------------------------

interface PlayerCountWidgetLayout {
  pos: Vec2;
  width: number;
  headerH: number;
  rowH: number;
  rowsY0: number;
  fullH: number;
  arrowPos: Vec2;
  arrowSize: Vec2;
  textPos: Vec2;
  textScale: number;
}

// ---------------------------------------------------------------------------
// State interface consumed by PlayGameMenuView
// ---------------------------------------------------------------------------

export interface PlayGameStatus {
  questPlayCounts: number[];
  questUnlockIndex: number;
  modePlayCountForMode(mode: number): number;
}

export interface PlayGamePanelState extends PanelGameState {
  config: PanelGameState['config'] & {
    gameplay: {
      playerCount: number;
      mode: number;
    };
    save?(): void;
  };
  demoEnabled: boolean;
  debugEnabled: boolean;
  status: PlayGameStatus;
  console: {
    log: { log(msg: string): void };
    cvars: Map<string, { name: string; value: string; valueF: number }>;
  };
}

// ---------------------------------------------------------------------------
// PlayGameMenuView
// ---------------------------------------------------------------------------

export class PlayGameMenuView extends PanelMenuView {
  /**
   * Play Game mode select panel.
   *
   * Layout and gating are based on `sub_44ed80` (crimsonland.exe).
   */

  private static readonly _PLAYER_COUNT_LABELS = ['1 player', '2 players', '3 players', '4 players'];

  private _playerListOpen: boolean = false;
  private _dirty: boolean = false;
  private _tooltipMs: Map<string, number> = new Map();
  private _modeButtons: Map<string, UiButtonState> = new Map();

  constructor(state: PlayGamePanelState) {
    super(state, {
      title: 'Play Game',
      panelOffset: new Vec2(-63.0, MENU_PANEL_OFFSET_Y),
      panelHeight: 278.0,
      backPos: new Vec2(-55.0, 462.0),
    });
  }

  private get _pgState(): PlayGamePanelState {
    return this.state as PlayGamePanelState;
  }

  override open(): void {
    super.open();
    this._playerListOpen = false;
    this._dirty = false;
    this._tooltipMs.clear();
    this._modeButtons.clear();
  }

  override update(dt: number): void {
    this._assertOpen();
    const pgState = this._pgState;

    if (pgState.audio !== null) {
      audioUpdate(pgState.audio, dt);
    }

    if (this._ground !== null) {
      this._ground.processPending();
    }

    this._cursorPulseTime += Math.min(dt, 0.1) * 1.1;
    const dtMs = (Math.min(dt, 0.1) * 1000.0) | 0;

    // Close transition (matches PanelMenuView).
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
        pgState.menuSignLocked = true;
      }
    }

    const entry = this._entry;
    if (entry === null) return;

    const enabled = this._entryEnabled(entry);
    const hoveredBack = enabled && this._hoveredEntry(entry);
    this._hovered = hoveredBack;

    // ESC always goes back; Enter should not auto-back on this screen.
    if (InputState.wasKeyPressed(KEY_ESCAPE) && enabled) {
      this._beginCloseTransition(this._backAction);
    }
    if (enabled && hoveredBack && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._beginCloseTransition(this._backAction);
    }

    if (hoveredBack) {
      entry.hoverAmount += dtMs * 6;
    } else {
      entry.hoverAmount -= dtMs * 2;
    }
    entry.hoverAmount = Math.max(0, Math.min(1000, entry.hoverAmount));

    if (entry.readyTimerMs < 0x100) {
      entry.readyTimerMs = Math.min(0x100, entry.readyTimerMs + dtMs);
    }

    if (!enabled) return;

    const layout = this._contentLayout();
    const scale = layout.scale;
    const basePos = layout.basePos;
    const resources = this._requireResources();
    const font = resources.smallFont;

    const consumedClick = this._updatePlayerCount(layout.dropPos, scale, font);
    if (consumedClick) return;

    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    const buttonEnabled = !this._playerListOpen;

    let y = basePos.y;
    const [entries, yStep, yStart, _yEnd] = this._modeEntries();
    y += yStart * scale;
    for (const mode of entries) {
      const [clicked, hovered] = this._updateModeButton(
        mode,
        new Vec2(basePos.x, y),
        scale,
        resources,
        dtMs,
        mouse,
        click,
        buttonEnabled,
      );
      this._updateTooltipTimer(mode.key, hovered, dtMs);
      if (clicked) {
        this._activateMode(mode);
        return;
      }
      y += yStep * scale;
    }

    // Decay timers for modes that aren't visible right now.
    const visible = new Set(entries.map(m => m.key));
    for (const key of Array.from(this._tooltipMs.keys())) {
      if (visible.has(key)) continue;
      this._tooltipMs.set(key, Math.max(0, (this._tooltipMs.get(key) ?? 0) - dtMs * 2));
    }
  }

  protected override _beginCloseTransition(action: string): void {
    if (this._dirty) {
      try {
        const cfg = this._pgState.config;
        if (cfg.save) cfg.save();
        this._dirty = false;
      } catch (exc) {
        this._pgState.console.log.log(`config: save failed: ${exc}`);
      }
    }
    super._beginCloseTransition(action);
  }

  private _requireResources(): RuntimeResources {
    // In production, this would call require_runtime_resources(state).
    // We assume resources are always available when panels are active.
    return this._pgState.resources as RuntimeResources;
  }

  private _contentLayout(): PlayGameContentLayout {
    const [panelScale, _localShift] = this._menuItemScale(0);
    const panelW = MENU_PANEL_WIDTH * panelScale;
    const [_angleRad, slideX] = uiElementAnim(
      this,
      1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      panelW,
    );
    const panelTopLeft = new Vec2(
      this._panelPos.x + slideX,
      this._panelPos.y + this._widescreenYShift,
    ).add(this._panelOffset.mul(panelScale));

    // `sub_44ed80`:
    //   xy = panel_offset_x + panel_x + 330 - 64  (+ animated X offset)
    //   var_1c = panel_offset_y + panel_y + 50
    const basePos = panelTopLeft.add(new Vec2(266.0 * panelScale, 50.0 * panelScale));
    const dropPos = basePos.add(new Vec2(80.0 * panelScale, 1.0 * panelScale));

    return { scale: panelScale, basePos, dropPos };
  }

  private _questsTotalPlayed(): number {
    const counts = this._pgState.status.questPlayCounts;
    if (!counts || counts.length === 0) return 0;
    // `sub_44ed80` sums 40 ints from game_status_blob+0x104..0x1a4.
    // Our `quest_play_counts` array starts at blob+0xd8, so this is indices 11..50.
    let total = 0;
    for (let i = 11; i < 51 && i < counts.length; i++) {
      total += counts[i] | 0;
    }
    return total;
  }

  private _lanLockstepEnabled(): boolean {
    const cvar = this._pgState.console.cvars.get('cv_lanLockstepEnabled');
    if (cvar === undefined) return true;
    return !!cvar.valueF;
  }

  private _modeEntries(): [PlayGameModeEntry[], number, number, number] {
    const config = this._pgState.config;
    const status = this._pgState.status;

    // Clamp to a valid range; older configs in the repo can contain 0 here,
    // which would incorrectly hide the Tutorial entry (it is gated on == 1).
    let playerCount = config.gameplay.playerCount;
    if (playerCount < 1) playerCount = 1;
    if (playerCount > PlayGameMenuView._PLAYER_COUNT_LABELS.length) {
      playerCount = PlayGameMenuView._PLAYER_COUNT_LABELS.length;
    }
    const questUnlock = status.questUnlockIndex | 0;
    const fullVersion = !this._pgState.demoEnabled;

    const questsTotal = this._questsTotalPlayed();
    const rushTotal = status.modePlayCountForMode(GameMode.RUSH) | 0;
    const survivalTotal = status.modePlayCountForMode(GameMode.SURVIVAL) | 0;
    // Matches the tutorial placement gating in `sub_44ed80` (excludes Typ-o).
    const mainTotal = questsTotal + rushTotal + survivalTotal;

    // `sub_44ed80` uses tighter spacing when quest_unlock>=40 and player_count==1.
    const tightSpacing = !(questUnlock < 0x28 || playerCount > 1);
    const yStep = tightSpacing ? 28.0 : 32.0;
    const yStart = tightSpacing ? 26.0 : 32.0;

    const hasTypo = tightSpacing && fullVersion && playerCount === 1;
    const showTutorial = playerCount === 1;

    const entries: PlayGameModeEntry[] = [];
    if (showTutorial && mainTotal <= 0) {
      entries.push(modeEntry(
        'tutorial', 'Tutorial',
        'Learn how to play Crimsonland.',
        'start_tutorial', GameMode.TUTORIAL,
      ));
    }

    entries.push(
      modeEntry('quests', ' Quests ',
        'Unlock new weapons and perks in Quest mode.',
        'open_quests', null, true),
      modeEntry('rush', '  Rush  ',
        'Face a rush of aliens in Rush mode.',
        'start_rush', GameMode.RUSH, true),
      modeEntry('survival', 'Survival',
        'Gain perks and weapons and fight back.',
        'start_survival', GameMode.SURVIVAL, true),
    );

    if (hasTypo) {
      entries.push(modeEntry(
        'typo', "Typ'o'Shooter",
        "Use your typing skills as the weapon to lay\nthem down.",
        'start_typo', GameMode.TYPO, true,
      ));
    }

    if (showTutorial && mainTotal > 0) {
      entries.push(modeEntry(
        'tutorial', 'Tutorial',
        'Learn how to play Crimsonland.',
        'start_tutorial', GameMode.TUTORIAL,
      ));
    }

    if (this._lanLockstepEnabled()) {
      entries.push(modeEntry(
        'lan', ' Network ',
        'Host or join a rollback-first network session.',
        'open_lan_session',
      ));
    }

    // The y after the last row is used as a tooltip anchor in `sub_44ed80`.
    const yEnd = yStart + yStep * entries.length;
    return [entries, yStep, yStart, yEnd];
  }

  private _modeButtonState(mode: PlayGameModeEntry): UiButtonState {
    let state = this._modeButtons.get(mode.key);
    if (state === undefined) {
      state = new UiButtonState(mode.label);
      this._modeButtons.set(mode.key, state);
    } else {
      state.label = mode.label;
    }
    return state;
  }

  private _updateModeButton(
    mode: PlayGameModeEntry,
    pos: Vec2,
    scale: number,
    resources: RuntimeResources,
    dtMs: number,
    mouse: { x: number; y: number },
    click: boolean,
    enabled: boolean,
  ): [boolean, boolean] {
    const state = this._modeButtonState(mode);
    state.enabled = enabled;
    const width = buttonWidth(resources, state.label, { scale, forceWide: state.forceWide });
    const clicked = buttonUpdate(state, { pos, width, dtMs, mouse, click });
    return [clicked, state.hovered];
  }

  private _activateMode(mode: PlayGameModeEntry): void {
    if (mode.gameMode !== null) {
      this._pgState.config.gameplay.mode = mode.gameMode;
      this._dirty = true;
    }
    this._beginCloseTransition(mode.action);
  }

  private _updateTooltipTimer(key: string, hovered: boolean, dtMs: number): void {
    let value = this._tooltipMs.get(key) ?? 0;
    if (hovered) {
      value += dtMs * 6;
    } else {
      value -= dtMs * 2;
    }
    this._tooltipMs.set(key, Math.max(0, Math.min(1000, value)));
  }

  private _playerCountWidgetLayout(pos: Vec2, scale: number, font: SmallFontData): PlayerCountWidgetLayout {
    /**
     * Return Play Game player-count dropdown metrics.
     *
     * `ui_list_widget_update` (0x43efc0):
     *   - width = max(label_w) + 0x30
     *   - header height = 16
     *   - open height = (count * 16) + 0x18
     *   - arrow icon = 16x16 at (x + width - 16 - 1, y)
     *   - selected label at (x + 4, y + 1)
     *   - list rows start at y + 17, step 16
     */
    const textScale = 1.0 * scale;
    let maxLabelW = 0.0;
    for (const label of PlayGameMenuView._PLAYER_COUNT_LABELS) {
      maxLabelW = Math.max(maxLabelW, measureSmallTextWidth(font, label));
    }
    const width = maxLabelW + 48.0 * scale;
    const headerH = 16.0 * scale;
    const rowH = 16.0 * scale;
    const fullH = (PlayGameMenuView._PLAYER_COUNT_LABELS.length * 16.0 + 24.0) * scale;
    const arrow = 16.0 * scale;
    return {
      pos,
      width,
      headerH,
      rowH,
      rowsY0: pos.y + 17.0 * scale,
      fullH,
      arrowPos: new Vec2(pos.x + width - arrow - 1.0 * scale, pos.y),
      arrowSize: new Vec2(arrow, arrow),
      textPos: pos.add(new Vec2(4.0 * scale, 1.0 * scale)),
      textScale,
    };
  }

  private _updatePlayerCount(pos: Vec2, scale: number, font: SmallFontData): boolean {
    const config = this._pgState.config;
    const layout = this._playerCountWidgetLayout(pos, scale, font);

    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const hoveredHeader = mouseInsideRectWithPadding(
      mouse, layout.pos, layout.width, 14.0 * scale,
    );
    if (hoveredHeader && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._playerListOpen = !this._playerListOpen;
      return true;
    }

    if (!this._playerListOpen) return false;

    // Close if we click outside the dropdown + list.
    const listRect = Rect.fromTopLeft(layout.pos, layout.width, layout.fullH);
    const listHovered = listRect.contains(mouse);
    if (InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT) && !listHovered) {
      this._playerListOpen = false;
      return true;
    }

    for (let idx = 0; idx < PlayGameMenuView._PLAYER_COUNT_LABELS.length; idx++) {
      const itemY = layout.rowsY0 + layout.rowH * idx;
      const itemHovered = mouseInsideRectWithPadding(
        mouse, { x: layout.pos.x, y: itemY }, layout.width, 14.0 * scale,
      );
      if (itemHovered && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
        config.gameplay.playerCount = idx + 1;
        this._dirty = true;
        this._playerListOpen = false;
        return true;
      }
    }
    return false;
  }

  protected override _drawContents(ctx: WebGLContext, resources: RuntimeResources): void {
    const font = resources.smallFont;
    const labelsTex = getTexture(resources, TextureId.UI_ITEM_TEXTS);
    const layout = this._contentLayout();
    const basePos = layout.basePos;
    const scale = layout.scale;
    const textScale = 1.0 * scale;
    const textColor: Color = [1, 1, 1, 0.8];

    // `sub_44ed80`: title label at (xy - 64, var_1c - 8), size 128x32.
    const titleW = 128.0;
    const titleH = MENU_LABEL_ROW_HEIGHT;
    const titlePos = basePos.add(new Vec2(-64.0 * scale, -8.0 * scale));

    const src: [number, number, number, number] = [
      0.0,
      MENU_LABEL_ROW_PLAY_GAME * MENU_LABEL_ROW_HEIGHT,
      titleW,
      titleH,
    ];
    const dst: [number, number, number, number] = [
      titlePos.x, titlePos.y,
      titleW * scale, titleH * scale,
    ];
    ctx.drawTexturePro(labelsTex, src, dst, [0.0, 0.0], 0.0, WHITE);

    const [entries, yStep, yStart, yEnd] = this._modeEntries();
    let y = basePos.y + yStart * scale;
    const showCounts = this._pgState.debugEnabled && InputState.isKeyDown(KEY_F1);

    if (showCounts) {
      drawSmallText(
        ctx, font, 'times played:',
        basePos.add(new Vec2(132.0 * scale, 16.0 * scale)),
        textColor,
      );
    }

    for (const mode of entries) {
      this._drawModeButton(ctx, mode, new Vec2(basePos.x, y), scale, resources, font);
      if (showCounts && mode.showCount) {
        this._drawModeCount(
          ctx, mode.key,
          new Vec2(basePos.x + 158.0 * scale, y + 8.0 * scale),
          textScale, textColor, font,
        );
      }
      y += yStep * scale;
    }

    // `sub_44ed80`: the list widget is drawn before tooltips, so tooltips can overlay it.
    this._drawPlayerCount(ctx, layout.dropPos, scale, resources, font);
    this._drawTooltips(ctx, entries, basePos, yEnd, scale, font);
  }

  private _drawPlayerCount(
    ctx: WebGLContext,
    pos: Vec2,
    scale: number,
    resources: RuntimeResources,
    font: SmallFontData,
  ): void {
    const dropOn = getTexture(resources, TextureId.UI_DROP_ON);
    const dropOff = getTexture(resources, TextureId.UI_DROP_OFF);
    const layout = this._playerCountWidgetLayout(pos, scale, font);

    // `ui_list_widget_update` draws a single bordered black rect for the widget.
    const widgetH = this._playerListOpen ? layout.fullH : layout.headerH;
    ctx.drawRectangle(
      layout.pos.x | 0, layout.pos.y | 0,
      layout.width | 0, widgetH | 0,
      1, 1, 1, 1,
    );
    const innerW = Math.max(0, (layout.width | 0) - 2);
    const innerH = Math.max(0, (widgetH | 0) - 2);
    ctx.drawRectangle(
      (layout.pos.x | 0) + 1, (layout.pos.y | 0) + 1,
      innerW, innerH,
      0, 0, 0, 1,
    );

    // Arrow icon (the ui_drop* assets are 16x16 icons, not the background).
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const hoveredHeader = mouseInsideRectWithPadding(
      mouse, layout.pos, layout.width, 14.0 * scale,
    );
    const arrowTex = (this._playerListOpen || hoveredHeader) ? dropOn : dropOff;
    if (this._playerListOpen || hoveredHeader) {
      const lineH = Math.max(1, (1.0 * scale) | 0);
      ctx.drawRectangle(
        layout.pos.x | 0,
        (layout.pos.y + 15.0 * scale) | 0,
        layout.width | 0,
        lineH,
        1, 1, 1, 128 / 255,
      );
    }
    ctx.drawTexturePro(
      arrowTex,
      [0.0, 0.0, arrowTex.width, arrowTex.height],
      [layout.arrowPos.x, layout.arrowPos.y, layout.arrowSize.x, layout.arrowSize.y],
      [0.0, 0.0], 0.0, WHITE,
    );

    let playerCount = this._pgState.config.gameplay.playerCount;
    if (playerCount < 1) playerCount = 1;
    if (playerCount > PlayGameMenuView._PLAYER_COUNT_LABELS.length) {
      playerCount = PlayGameMenuView._PLAYER_COUNT_LABELS.length;
    }
    const label = PlayGameMenuView._PLAYER_COUNT_LABELS[playerCount - 1];
    const headerAlpha = hoveredHeader ? (242 / 255) : (191 / 255); // 0x3f733333 / 0x3f400000
    drawSmallText(ctx, font, label, layout.textPos, [1, 1, 1, headerAlpha]);

    if (!this._playerListOpen) return;

    for (let idx = 0; idx < PlayGameMenuView._PLAYER_COUNT_LABELS.length; idx++) {
      const item = PlayGameMenuView._PLAYER_COUNT_LABELS[idx];
      const itemY = layout.rowsY0 + layout.rowH * idx;
      const hovered = mouseInsideRectWithPadding(
        mouse, { x: layout.pos.x, y: itemY }, layout.width, 14.0 * scale,
      );
      let alpha = 153; // 0x3f19999a
      if (hovered) {
        alpha = 242; // 0x3f733333
      }
      if (idx === (playerCount - 1)) {
        alpha = Math.max(alpha, 245); // 0x3f75c28f
      }
      drawSmallText(ctx, font, item, new Vec2(layout.textPos.x, itemY), [1, 1, 1, alpha / 255]);
    }
  }

  private _drawModeButton(
    ctx: WebGLContext,
    mode: PlayGameModeEntry,
    pos: Vec2,
    scale: number,
    resources: RuntimeResources,
    _font: SmallFontData,
  ): void {
    const state = this._modeButtonState(mode);
    const width = buttonWidth(resources, state.label, { scale, forceWide: state.forceWide });
    buttonDraw(ctx, resources, state, { pos, width, scale });
  }

  private _drawModeCount(
    ctx: WebGLContext,
    key: string,
    pos: Vec2,
    _scale: number,
    color: Color,
    font: SmallFontData,
  ): void {
    const status = this._pgState.status;
    let count: number;
    if (key === 'quests') {
      count = this._questsTotalPlayed();
    } else if (key === 'rush') {
      count = status.modePlayCountForMode(GameMode.RUSH) | 0;
    } else if (key === 'survival') {
      count = status.modePlayCountForMode(GameMode.SURVIVAL) | 0;
    } else if (key === 'typo') {
      count = status.modePlayCountForMode(GameMode.TYPO) | 0;
    } else {
      return;
    }
    drawSmallText(ctx, font, `${count}`, pos, color);
  }

  private _drawTooltips(
    ctx: WebGLContext,
    entries: PlayGameModeEntry[],
    basePos: Vec2,
    yEnd: number,
    scale: number,
    font: SmallFontData,
  ): void {
    // `sub_44ed80` draws these below the mode list based on per-button hover timers.
    const tooltipX = basePos.x - 55.0 * scale;
    const tooltipY = basePos.y + (yEnd + 16.0) * scale;

    const offsets: Record<string, [number, number]> = {
      quests: [-8.0, 0.0],
      rush: [32.0, 0.0],
      survival: [20.0, 0.0],
      typo: [0.0, -12.0],
      tutorial: [38.0, 0.0],
    };

    for (const mode of entries) {
      const ms = this._tooltipMs.get(mode.key) ?? 0;
      if (ms <= 0) continue;
      const alphaF = Math.min(1.0, ms * 0.0009);
      const alpha = (255 * alphaF) | 0;
      const [offX, offY] = offsets[mode.key] ?? [0.0, 0.0];
      const x = tooltipX + offX * scale;
      let y = tooltipY + offY * scale;
      const lines = mode.tooltip.split('\n');
      for (const line of lines) {
        drawSmallText(ctx, font, line, new Vec2(x, y), [1, 1, 1, alpha / 255]);
        y += font.cellSize * 1.0 * scale;
      }
    }
  }
}
