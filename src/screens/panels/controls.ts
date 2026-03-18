// Port of crimson/screens/panels/controls.py — Controls menu panel (979 lines)

import { Vec2, Rect } from '../../engine/geom.ts';
import { type WebGLContext } from '../../engine/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '../../engine/assets.ts';
import { type SmallFontData } from '../../engine/assets.ts';
import { drawSmallText, measureSmallTextWidth } from '../../engine/fonts/small.ts';
import { InputState } from '../../engine/input.ts';
import {
  AimScheme,
  MovementControlType,
  type CrimsonControlsConfig,
  defaultCrimsonConfig,
} from '../../engine/config.ts';
import { drawClassicMenuPanel } from '../../ui/menu-panel.ts';
import { type DropdownLayoutBase } from '../../ui/layout.ts';
import { mouseInsideRectWithPadding } from './hit-test.ts';
import { INPUT_CODE_UNBOUND, inputCodeName } from '../../game/input-codes.ts';
import {
  PanelMenuView,
  type PanelGameState,
  MENU_PANEL_WIDTH,
  MENU_PANEL_HEIGHT,
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
  uiElementAnim,
} from './base.ts';
import {
  type RebindRowSpec,
  RebindTarget,
  controlsAimMethodDropdownIds,
  controlsRebindPlan,
  inputConfigureForLabel,
  inputSchemeLabel,
} from './controls-labels.ts';

// ---------------------------------------------------------------------------
// Layout constants — measured from ui_render_trace_oracle_1024x768.json
// ---------------------------------------------------------------------------

const CONTROLS_LEFT_PANEL_POS_X = -165.0;
const CONTROLS_LEFT_PANEL_POS_Y = 200.0;
const CONTROLS_RIGHT_PANEL_POS_X = 590.0;
const CONTROLS_RIGHT_PANEL_POS_Y = 110.0;
const CONTROLS_RIGHT_PANEL_HEIGHT = 378.0;
const CONTROLS_BACK_POS_X = -155.0;
const CONTROLS_BACK_POS_Y = 420.0;

// `ui_menu_item_update`: idle rebind value tint (rgb 70,180,240 @ alpha 0.6).
type Color = [number, number, number, number];

const CONTROLS_REBIND_VALUE_COLOR: Color = [70 / 255, 180 / 255, 240 / 255, 153 / 255];
const CONTROLS_REBIND_HOVER_COLOR: Color = [200 / 255, 230 / 255, 250 / 255, 230 / 255];
const CONTROLS_REBIND_ACTIVE_COLOR: Color = [255 / 255, 228 / 255, 170 / 255, 1.0];

const WHITE: Color = [1, 1, 1, 1];
const ORIGIN: [number, number] = [0, 0];

const KEY_ESCAPE = 27;
const KEY_BACKSPACE = 8;
const KEY_DELETE = 46;
const MOUSE_BUTTON_LEFT = 0;
const MOUSE_BUTTON_RIGHT = 2;

// ---------------------------------------------------------------------------
// Binding helpers
// ---------------------------------------------------------------------------

function rowBindingCode(row: RebindRowSpec, playerIndex: number, controls: CrimsonControlsConfig): number {
  const pc = controls.players[playerIndex];
  switch (row.target) {
    case RebindTarget.PLAYER_MOVE_CODES:
      return pc.moveCodes[row.targetIndex!];
    case RebindTarget.PLAYER_FIRE_CODE:
      return pc.fireCode;
    case RebindTarget.PLAYER_KEYBOARD_AIM_CODES:
      return pc.keyboardAimCodes[row.targetIndex!];
    case RebindTarget.PLAYER_AIM_AXIS_CODES:
      return pc.aimAxisCodes[row.targetIndex!];
    case RebindTarget.PLAYER_MOVE_AXIS_CODES:
      return pc.moveAxisCodes[row.targetIndex!];
    case RebindTarget.GLOBAL_PICK_PERK_CODE:
      return controls.pickPerkCode;
    case RebindTarget.GLOBAL_RELOAD_CODE:
      return controls.reloadCode;
  }
  return INPUT_CODE_UNBOUND;
}

function setRowBindingCode(
  row: RebindRowSpec,
  value: number,
  playerIndex: number,
  controls: CrimsonControlsConfig,
): void {
  const code = value | 0;
  const pc = controls.players[playerIndex];
  switch (row.target) {
    case RebindTarget.PLAYER_MOVE_CODES: {
      const values: [number, number, number, number] = [...pc.moveCodes];
      values[row.targetIndex!] = code;
      pc.moveCodes = values;
      break;
    }
    case RebindTarget.PLAYER_FIRE_CODE:
      pc.fireCode = code;
      break;
    case RebindTarget.PLAYER_KEYBOARD_AIM_CODES: {
      const values: [number, number] = [...pc.keyboardAimCodes];
      values[row.targetIndex!] = code;
      pc.keyboardAimCodes = values;
      break;
    }
    case RebindTarget.PLAYER_AIM_AXIS_CODES: {
      const values: [number, number] = [...pc.aimAxisCodes];
      values[row.targetIndex!] = code;
      pc.aimAxisCodes = values;
      break;
    }
    case RebindTarget.PLAYER_MOVE_AXIS_CODES: {
      const values: [number, number] = [...pc.moveAxisCodes];
      values[row.targetIndex!] = code;
      pc.moveAxisCodes = values;
      break;
    }
    case RebindTarget.GLOBAL_PICK_PERK_CODE:
      controls.pickPerkCode = code;
      break;
    case RebindTarget.GLOBAL_RELOAD_CODE:
      controls.reloadCode = code;
      break;
  }
}

function defaultRowBindingCode(playerIndex: number, row: RebindRowSpec): number {
  const controls = defaultCrimsonConfig().controls;
  return rowBindingCode(row, playerIndex, controls);
}

// ---------------------------------------------------------------------------
// Layout position helpers (width-dependent nudges)
// ---------------------------------------------------------------------------

function controlsLeftPanelPosX(screenWidth: number): number {
  if ((screenWidth | 0) <= 640) {
    return CONTROLS_LEFT_PANEL_POS_X - 18.0;
  }
  return CONTROLS_LEFT_PANEL_POS_X;
}

function controlsRightPanelPosX(screenWidth: number): number {
  const w = screenWidth | 0;
  let x = (w - 434) as number;
  if (w <= 640) {
    x += 80.0;
  }
  return x;
}

function controlsRightPanelPosY(screenWidth: number): number {
  if ((screenWidth | 0) <= 640) {
    return CONTROLS_RIGHT_PANEL_POS_Y - 14.0;
  }
  return CONTROLS_RIGHT_PANEL_POS_Y;
}

// ---------------------------------------------------------------------------
// Dropdown layout
// ---------------------------------------------------------------------------

interface ControlsDropdownLayout extends DropdownLayoutBase {
  readonly arrowPos: Vec2;
  readonly arrowSize: Vec2;
  readonly textPos: Vec2;
  readonly textScale: number;
}

// ---------------------------------------------------------------------------
// Rebind row layout
// ---------------------------------------------------------------------------

interface RebindRowLayout {
  readonly row: RebindRowSpec;
  readonly rowY: number;
  readonly valuePos: Vec2;
  readonly valueRect: Rect;
}

// ---------------------------------------------------------------------------
// Capture helper — simplified for WebGL (no gamepad axes)
// ---------------------------------------------------------------------------

function captureFirstPressedInputCode(
  _playerIndex: number,
  includeKeyboard: boolean,
  includeMouse: boolean,
  _includeGamepad: boolean,
  _includeAxes: boolean,
  _axisThreshold: number,
): number | null {
  // Check keyboard keys
  if (includeKeyboard) {
    const pressed = InputState.firstKeyPressed();
    if (pressed !== null) {
      // Convert DOM keyCode back to DIK code for storage
      const domToDik = domKeyToDik(pressed);
      if (domToDik !== null) return domToDik;
    }
  }
  // Check mouse buttons
  if (includeMouse) {
    for (let btn = 0; btn < 5; btn++) {
      if (InputState.wasMouseButtonPressed(btn)) {
        return 0x100 + btn;
      }
    }
  }
  // Gamepad/axes not supported in WebGL port
  return null;
}

// DOM keyCode -> DIK scan code reverse mapping
function domKeyToDik(domKey: number): number | null {
  const map: Record<number, number> = {
    27: 0x01, 49: 0x02, 50: 0x03, 51: 0x04, 52: 0x05, 53: 0x06, 54: 0x07,
    55: 0x08, 56: 0x09, 57: 0x0A, 48: 0x0B, 189: 0x0C, 187: 0x0D, 8: 0x0E,
    9: 0x0F, 81: 0x10, 87: 0x11, 69: 0x12, 82: 0x13, 84: 0x14, 89: 0x15,
    85: 0x16, 73: 0x17, 79: 0x18, 80: 0x19, 219: 0x1A, 221: 0x1B, 13: 0x1C,
    17: 0x1D, 65: 0x1E, 83: 0x1F, 68: 0x20, 70: 0x21, 71: 0x22, 72: 0x23,
    74: 0x24, 75: 0x25, 76: 0x26, 186: 0x27, 222: 0x28, 192: 0x29, 16: 0x2A,
    220: 0x2B, 90: 0x2C, 88: 0x2D, 67: 0x2E, 86: 0x2F, 66: 0x30, 78: 0x31,
    77: 0x32, 188: 0x33, 190: 0x34, 191: 0x35, 18: 0x38, 32: 0x39,
    112: 0x3B, 113: 0x3C, 114: 0x3D, 115: 0x3E, 116: 0x3F, 117: 0x40,
    118: 0x41, 119: 0x42, 120: 0x43, 121: 0x44, 122: 0x57, 123: 0x58,
    38: 0xC8, 33: 0xC9, 37: 0xCB, 39: 0xCD, 40: 0xD0, 34: 0xD1, 45: 0xD2,
    46: 0xD3, 35: 0xCF, 36: 0xC7,
    // Numpad keys
    96: 0x52, 97: 0x4F, 98: 0x50, 99: 0x51, 100: 0x4B, 101: 0x4C,
    102: 0x4D, 103: 0x47, 104: 0x48, 105: 0x49, 106: 0x37, 107: 0x4E,
    109: 0x4A, 110: 0x53, 111: 0x35, 144: 0x45,
  };
  return map[domKey] ?? null;
}

// ---------------------------------------------------------------------------
// ControlsMenuView
// ---------------------------------------------------------------------------

export class ControlsMenuView extends PanelMenuView {
  private _configPlayer: number = 1;
  private _moveMethodOpen: boolean = false;
  private _aimMethodOpen: boolean = false;
  private _playerProfileOpen: boolean = false;
  private _dirty: boolean = false;
  private _rebindRow: RebindRowSpec | null = null;
  private _rebindPlayerIndex: number | null = null;
  private _rebindSkipFrames: number = 0;

  constructor(state: PanelGameState) {
    super(state, {
      title: 'Controls',
      backAction: 'open_options',
      panelPos: new Vec2(CONTROLS_LEFT_PANEL_POS_X, CONTROLS_LEFT_PANEL_POS_Y),
      backPos: new Vec2(CONTROLS_BACK_POS_X, CONTROLS_BACK_POS_Y),
    });
  }

  override open(): void {
    super.open();
    this._configPlayer = Math.max(1, Math.min(4, this._configPlayer | 0));
    this._moveMethodOpen = false;
    this._aimMethodOpen = false;
    this._playerProfileOpen = false;
    this._dirty = false;
    this._clearRebindCapture();
  }

  override update(dt: number): void {
    super.update(dt);
    if (this._closing) {
      return;
    }
    const entry = this._entry;
    if (entry === null || !this._entryEnabled(entry)) {
      return;
    }
    const [panelScale] = this._menuItemScale(0);
    const leftTopLeft = this._leftPanelTopLeft(panelScale);
    const rightTopLeft = this._rightPanelTopLeft(panelScale);
    const resources = this._requireResources();
    const font = resources.smallFont;

    let clickConsumed = this._updateMethodDropdowns(leftTopLeft, panelScale, font);
    if (!clickConsumed) {
      clickConsumed = this._updateRebindCapture(rightTopLeft, panelScale, font);
    }
    if (!clickConsumed && this._updateDirectionArrowCheckbox(
      leftTopLeft, panelScale, this._checkboxEnabled(), resources, font,
    )) {
      this._dirty = true;
    }
  }

  protected override _beginCloseTransition(action: string): void {
    if (this._dirty) {
      try {
        if (this.state.config.save) {
          this.state.config.save();
        }
        this._dirty = false;
      } catch (exc) {
        if (this.state.console) {
          this.state.console.log.log(`config: save failed: ${exc}`);
        }
      }
    }
    super._beginCloseTransition(action);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private _requireResources(): RuntimeResources {
    // In the full port this comes from require_runtime_resources(state).
    // Here we assume the state carries resources; callers must ensure this.
    return this.state.resources as RuntimeResources;
  }

  private _currentPlayerIndex(): number {
    return Math.max(0, Math.min(3, (this._configPlayer | 0) - 1));
  }

  private _rebindActive(): boolean {
    return this._rebindRow !== null && this._rebindPlayerIndex !== null;
  }

  private _clearRebindCapture(): void {
    this._rebindRow = null;
    this._rebindPlayerIndex = null;
    this._rebindSkipFrames = 0;
  }

  private _startRebindCapture(row: RebindRowSpec, playerIndex: number): void {
    this._rebindRow = row;
    this._rebindPlayerIndex = Math.max(0, Math.min(3, playerIndex | 0));
    this._moveMethodOpen = false;
    this._aimMethodOpen = false;
    this._playerProfileOpen = false;
    // Ignore the click that opened capture so Mouse1 is not rebound accidentally.
    this._rebindSkipFrames = 1;
  }

  private static _capturePromptForBinding(row: RebindRowSpec): string {
    if (row.axis) return '<press axis>';
    return '<press input>';
  }

  private _bindingDefaultCode(playerIndex: number, row: RebindRowSpec): number {
    return defaultRowBindingCode(playerIndex, row);
  }

  private _bindingCode(playerIndex: number, row: RebindRowSpec): number {
    return rowBindingCode(row, playerIndex, this.state.config.controls);
  }

  private _setBindingCode(playerIndex: number, row: RebindRowSpec, code: number): void {
    setRowBindingCode(row, code | 0, playerIndex, this.state.config.controls);
  }

  // -----------------------------------------------------------------------
  // Panel top-left helpers
  // -----------------------------------------------------------------------

  private _leftPanelTopLeft(panelScale: number): Vec2 {
    const panelW = MENU_PANEL_WIDTH * panelScale;
    const [, slideX] = uiElementAnim(
      this, 1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      panelW,
    );
    return new Vec2(
      controlsLeftPanelPosX(this.state.config.display.width) + slideX,
      this._panelPos.y + this._widescreenYShift,
    ).add(this._panelOffset.mul(panelScale));
  }

  private _rightPanelTopLeft(panelScale: number): Vec2 {
    const panelW = MENU_PANEL_WIDTH * panelScale;
    const [, slideX] = uiElementAnim(
      this, 3,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      panelW,
      1,
    );
    const sw = this.state.config.display.width;
    return new Vec2(
      controlsRightPanelPosX(sw) + slideX,
      controlsRightPanelPosY(sw) + this._widescreenYShift,
    ).add(this._panelOffset.mul(panelScale));
  }

  // -----------------------------------------------------------------------
  // Direction arrow checkbox
  // -----------------------------------------------------------------------

  private _directionArrowEnabled(): boolean {
    return this.state.config.controls.players[this._currentPlayerIndex()].showDirectionArrow;
  }

  private _setDirectionArrowEnabled(enabled: boolean): void {
    this.state.config.controls.players[this._currentPlayerIndex()].showDirectionArrow = enabled;
  }

  private _checkboxEnabled(): boolean {
    return !(this._moveMethodOpen || this._aimMethodOpen || this._rebindActive());
  }

  private _checkboxHovered(
    leftTopLeft: Vec2,
    panelScale: number,
    enabled: boolean,
    resources: RuntimeResources,
    font: SmallFontData,
  ): boolean {
    if (!enabled) return false;
    const checkOn = getTexture(resources, TextureId.UI_CHECK_ON);
    const textScale = 1.0 * panelScale;
    const label = 'Show direction arrow';
    const checkPos = new Vec2(
      leftTopLeft.x + 213.0 * panelScale,
      leftTopLeft.y + 174.0 * panelScale,
    );
    const labelW = measureSmallTextWidth(font, label);
    const rectW = checkOn.width * panelScale + 6.0 * panelScale + labelW;
    const rectH = Math.max(checkOn.height * panelScale, font.cellSize * textScale);
    const [mx, my] = InputState.mousePosition();
    return Rect.fromTopLeft(checkPos, rectW, rectH).contains(new Vec2(mx, my));
  }

  private _updateDirectionArrowCheckbox(
    leftTopLeft: Vec2,
    panelScale: number,
    enabled: boolean,
    resources: RuntimeResources,
    font: SmallFontData,
  ): boolean {
    if (!enabled) return false;
    const hovered = this._checkboxHovered(leftTopLeft, panelScale, enabled, resources, font);
    if (hovered && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._setDirectionArrowEnabled(!this._directionArrowEnabled());
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Rebind sections + row collection
  // -----------------------------------------------------------------------

  private _rebindSections(
    playerIndex: number,
    aimScheme: AimScheme,
    moveMode: MovementControlType,
  ): [string, RebindRowSpec[]][] {
    const [aimRows, moveRows, miscRows] = controlsRebindPlan(aimScheme, moveMode, playerIndex);
    const sections: [string, RebindRowSpec[]][] = [['Aiming', aimRows], ['Moving', moveRows]];
    if (miscRows.length > 0) {
      sections.push(['Misc', miscRows]);
    }
    return sections;
  }

  private _collectRebindRows(
    rightTopLeft: Vec2,
    panelScale: number,
    playerIndex: number,
    sections: [string, RebindRowSpec[]][],
    font: SmallFontData,
  ): RebindRowLayout[] {
    const rows: RebindRowLayout[] = [];
    let y = rightTopLeft.y + 64.0 * panelScale;
    for (const [, sectionRows] of sections) {
      let rowY = y + 18.0 * panelScale;
      for (const row of sectionRows) {
        const keyCode = this._bindingCode(playerIndex, row) | 0;
        const valueText = inputCodeName(keyCode);
        const valuePos = new Vec2(rightTopLeft.x + 180.0 * panelScale, rowY);
        const valueW = Math.max(60.0 * panelScale, measureSmallTextWidth(font, valueText));
        const valueRect = Rect.fromTopLeft(
          new Vec2(valuePos.x - 2.0 * panelScale, rowY - 2.0 * panelScale),
          valueW + 4.0 * panelScale,
          14.0 * panelScale,
        );
        rows.push({ row, rowY, valuePos, valueRect });
        rowY += 16.0 * panelScale;
      }
      y = rowY + 8.0 * panelScale;
    }
    return rows;
  }

  // -----------------------------------------------------------------------
  // Rebind capture update
  // -----------------------------------------------------------------------

  private _updateRebindCapture(rightTopLeft: Vec2, panelScale: number, font: SmallFontData): boolean {
    const playerIdx = this._currentPlayerIndex();
    const playerControls = this.state.config.controls.players[playerIdx];
    const aimScheme = playerControls.aimScheme;
    const moveMode = playerControls.movement;
    const sections = this._rebindSections(playerIdx, aimScheme, moveMode);
    const rows = this._collectRebindRows(rightTopLeft, panelScale, playerIdx, sections, font);

    if (this._rebindActive()) {
      const activeRow = this._rebindRow!;
      const activePlayer = this._rebindPlayerIndex! | 0;

      if (InputState.wasKeyPressed(KEY_ESCAPE) || InputState.wasMouseButtonPressed(MOUSE_BUTTON_RIGHT)) {
        this._clearRebindCapture();
        return true;
      }

      if (InputState.wasKeyPressed(KEY_BACKSPACE)) {
        this._setBindingCode(
          activePlayer, activeRow,
          this._bindingDefaultCode(activePlayer, activeRow),
        );
        this._dirty = true;
        this._clearRebindCapture();
        return true;
      }

      if (InputState.wasKeyPressed(KEY_DELETE)) {
        this._setBindingCode(activePlayer, activeRow, INPUT_CODE_UNBOUND);
        this._dirty = true;
        this._clearRebindCapture();
        return true;
      }

      if (this._rebindSkipFrames > 0) {
        this._rebindSkipFrames = Math.max(0, (this._rebindSkipFrames | 0) - 1);
        return true;
      }

      const axisOnly = activeRow.axis;
      const captured = captureFirstPressedInputCode(
        activePlayer,
        !axisOnly,    // includeKeyboard
        !axisOnly,    // includeMouse
        !axisOnly,    // includeGamepad
        axisOnly,     // includeAxes
        0.5,          // axisThreshold
      );
      if (captured !== null) {
        this._setBindingCode(activePlayer, activeRow, captured | 0);
        this._dirty = true;
        this._clearRebindCapture();
      }
      return true;
    }

    if (this._moveMethodOpen || this._aimMethodOpen || this._playerProfileOpen) {
      return false;
    }

    if (!InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      return false;
    }
    const [mx, my] = InputState.mousePosition();
    const mouse = new Vec2(mx, my);
    for (const row of rows) {
      if (row.valueRect.contains(mouse)) {
        this._startRebindCapture(row.row, playerIdx);
        return true;
      }
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Player mode setters
  // -----------------------------------------------------------------------

  private _setPlayerMoveMode(playerIndex: number, moveMode: MovementControlType): void {
    this.state.config.controls.players[playerIndex].movement = moveMode;
  }

  private _setPlayerAimScheme(playerIndex: number, aimScheme: AimScheme): void {
    this.state.config.controls.players[playerIndex].aimScheme = aimScheme;
  }

  private static _moveMethodIds(moveMode: MovementControlType): MovementControlType[] {
    const items: MovementControlType[] = [
      MovementControlType.RELATIVE,
      MovementControlType.STATIC,
      MovementControlType.DUAL_ACTION_PAD,
    ];
    if (moveMode === MovementControlType.MOUSE_POINT_CLICK) {
      items.push(MovementControlType.MOUSE_POINT_CLICK);
    }
    return items;
  }

  // -----------------------------------------------------------------------
  // Dropdown layout
  // -----------------------------------------------------------------------

  private _dropdownLayout(
    pos: Vec2,
    items: string[],
    scale: number,
    font: SmallFontData,
  ): ControlsDropdownLayout {
    const textScale = 1.0 * scale;
    let maxLabelW = 0.0;
    for (const label of items) {
      maxLabelW = Math.max(maxLabelW, measureSmallTextWidth(font, label));
    }
    const width = maxLabelW + 48.0 * scale;
    const headerH = 16.0 * scale;
    const rowH = 16.0 * scale;
    const fullH = (items.length * 16.0 + 24.0) * scale;
    const arrow = 16.0 * scale;
    return {
      pos,
      width,
      headerH: headerH,
      rowH: rowH,
      rowsY0: pos.y + 17.0 * scale,
      fullH: fullH,
      arrowPos: new Vec2(pos.x + width - arrow - 1.0 * scale, pos.y),
      arrowSize: new Vec2(arrow, arrow),
      textPos: pos.add(new Vec2(4.0 * scale, 1.0 * scale)),
      textScale,
    };
  }

  // -----------------------------------------------------------------------
  // Dropdown update
  // -----------------------------------------------------------------------

  private _updateDropdown(
    layout: ControlsDropdownLayout,
    itemCount: number,
    isOpen: boolean,
    enabled: boolean,
    scale: number,
  ): [boolean, number | null, boolean] {
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);

    const hoveredHeader = enabled && mouseInsideRectWithPadding(
      mouse, layout.pos, layout.width, 14.0 * scale,
    );
    if (hoveredHeader && click) {
      return [!isOpen, null, true];
    }
    if (!isOpen) {
      return [isOpen, null, false];
    }

    const listHovered = Rect.fromTopLeft(layout.pos, layout.width, layout.fullH).contains(new Vec2(mx, my));
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

  // -----------------------------------------------------------------------
  // Method dropdowns update
  // -----------------------------------------------------------------------

  private _updateMethodDropdowns(leftTopLeft: Vec2, panelScale: number, font: SmallFontData): boolean {
    const config = this.state.config;
    const playerIdx = this._currentPlayerIndex();
    const playerControls = config.controls.players[playerIdx];
    const aimScheme = playerControls.aimScheme;
    const moveMode = playerControls.movement;
    const moveMethodIds = ControlsMenuView._moveMethodIds(moveMode);
    const moveItems = moveMethodIds.map(m => inputSchemeLabel(m));
    const aimItemIds = controlsAimMethodDropdownIds(aimScheme);
    const aimItems = aimItemIds.map(a => inputConfigureForLabel(a));
    const playerItems = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

    const moveLayout = this._dropdownLayout(
      new Vec2(leftTopLeft.x + 214.0 * panelScale, leftTopLeft.y + 144.0 * panelScale),
      moveItems, panelScale, font,
    );
    const aimLayout = this._dropdownLayout(
      new Vec2(leftTopLeft.x + 214.0 * panelScale, leftTopLeft.y + 102.0 * panelScale),
      aimItems, panelScale, font,
    );
    const playerLayout = this._dropdownLayout(
      new Vec2(leftTopLeft.x + 340.0 * panelScale, leftTopLeft.y + 56.0 * panelScale),
      playerItems, panelScale, font,
    );

    const rebindActive = this._rebindActive();
    const moveEnabled = !(this._aimMethodOpen || this._playerProfileOpen || rebindActive);
    const aimEnabled = !(this._moveMethodOpen || this._playerProfileOpen || rebindActive);
    const playerEnabled = !(this._moveMethodOpen || this._aimMethodOpen || rebindActive);

    {
      const [newOpen, selected, consumed] = this._updateDropdown(
        moveLayout, moveItems.length, this._moveMethodOpen, moveEnabled, panelScale,
      );
      this._moveMethodOpen = newOpen;
      if (selected !== null) {
        const selectedIdx = Math.max(0, Math.min(selected | 0, moveMethodIds.length - 1));
        this._setPlayerMoveMode(playerIdx, moveMethodIds[selectedIdx]);
        this._dirty = true;
      }
      if (consumed) return true;
    }

    {
      const [newOpen, selected, consumed] = this._updateDropdown(
        aimLayout, aimItems.length, this._aimMethodOpen, aimEnabled, panelScale,
      );
      this._aimMethodOpen = newOpen;
      if (selected !== null) {
        const selectedIdx = Math.max(0, Math.min(selected | 0, aimItemIds.length - 1));
        this._setPlayerAimScheme(playerIdx, aimItemIds[selectedIdx]);
        this._dirty = true;
      }
      if (consumed) return true;
    }

    {
      const [newOpen, selected, consumed] = this._updateDropdown(
        playerLayout, playerItems.length, this._playerProfileOpen, playerEnabled, panelScale,
      );
      this._playerProfileOpen = newOpen;
      if (selected !== null) {
        this._configPlayer = Math.max(1, Math.min(4, selected + 1));
      }
      if (consumed) return true;
    }

    return false;
  }

  // -----------------------------------------------------------------------
  // Panel drawing — two panels (left + right)
  // -----------------------------------------------------------------------

  protected override _drawPanel(ctx: WebGLContext, resources: RuntimeResources): void {
    const fxDetail = this.state.config.display.fxDetail[0];
    const [panelScale] = this._menuItemScale(0);
    const panelW = MENU_PANEL_WIDTH * panelScale;
    const panel = getTexture(resources, TextureId.UI_MENU_PANEL);

    // Left (controls options) panel: standard 254px height
    const leftTopLeft = this._leftPanelTopLeft(panelScale);
    const leftH = MENU_PANEL_HEIGHT * panelScale;
    drawClassicMenuPanel(
      ctx, panel,
      [leftTopLeft.x, leftTopLeft.y, panelW, leftH],
      WHITE, fxDetail,
    );

    // Right (configured bindings) panel: tall 378px panel rendered as 3 vertical slices
    const rightTopLeft = this._rightPanelTopLeft(panelScale);
    const rightH = CONTROLS_RIGHT_PANEL_HEIGHT * panelScale;
    drawClassicMenuPanel(
      ctx, panel,
      [rightTopLeft.x, rightTopLeft.y, panelW, rightH],
      WHITE, fxDetail, true, // flipX
    );
  }

  // -----------------------------------------------------------------------
  // Contents drawing
  // -----------------------------------------------------------------------

  protected override _drawContents(ctx: WebGLContext, resources: RuntimeResources): void {
    const [panelScale] = this._menuItemScale(0);
    const leftTopLeft = this._leftPanelTopLeft(panelScale);
    const rightTopLeft = this._rightPanelTopLeft(panelScale);
    const font = resources.smallFont;

    const textColorFull: Color = [1, 1, 1, 1];
    const textColorSoft: Color = [1, 1, 1, 204 / 255];

    const config = this.state.config;
    const playerIdx = this._currentPlayerIndex();
    const playerControls = config.controls.players[playerIdx];
    const aimScheme = playerControls.aimScheme;
    const moveMode = playerControls.movement;
    const moveMethodIds = ControlsMenuView._moveMethodIds(moveMode);
    const moveItems = moveMethodIds.map(m => inputSchemeLabel(m));
    const aimItemIds = controlsAimMethodDropdownIds(aimScheme);
    const aimItems = aimItemIds.map(a => inputConfigureForLabel(a));
    const playerItems = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];

    let moveSelected = moveMethodIds.indexOf(moveMode);
    if (moveSelected < 0) moveSelected = 0;
    let aimSelected = aimItemIds.indexOf(aimScheme);
    if (aimSelected < 0) aimSelected = 0;
    const playerSelected = Math.max(0, Math.min(playerItems.length - 1, playerIdx));

    const moveLayout = this._dropdownLayout(
      new Vec2(leftTopLeft.x + 214.0 * panelScale, leftTopLeft.y + 144.0 * panelScale),
      moveItems, panelScale, font,
    );
    const aimLayout = this._dropdownLayout(
      new Vec2(leftTopLeft.x + 214.0 * panelScale, leftTopLeft.y + 102.0 * panelScale),
      aimItems, panelScale, font,
    );
    const playerLayout = this._dropdownLayout(
      new Vec2(leftTopLeft.x + 340.0 * panelScale, leftTopLeft.y + 56.0 * panelScale),
      playerItems, panelScale, font,
    );

    // --- Left panel: "Configure for" + method selectors ---
    const textControls = getTexture(resources, TextureId.UI_TEXT_CONTROLS);
    ctx.drawTexturePro(
      textControls,
      [0.0, 0.0, textControls.width, textControls.height],
      [
        leftTopLeft.x + 206.0 * panelScale,
        leftTopLeft.y + 44.0 * panelScale,
        128.0 * panelScale,
        32.0 * panelScale,
      ],
      ORIGIN, 0.0, WHITE,
    );

    drawSmallText(
      ctx, font, 'Configure for:',
      new Vec2(leftTopLeft.x + 339.0 * panelScale, leftTopLeft.y + 41.0 * panelScale),
      textColorSoft,
    );

    drawSmallText(
      ctx, font, 'Aiming method:',
      new Vec2(leftTopLeft.x + 213.0 * panelScale, leftTopLeft.y + 86.0 * panelScale),
      textColorFull,
    );

    drawSmallText(
      ctx, font, 'Moving method:',
      new Vec2(leftTopLeft.x + 213.0 * panelScale, leftTopLeft.y + 128.0 * panelScale),
      textColorFull,
    );

    // Checkbox
    const checkTex = this._directionArrowEnabled()
      ? getTexture(resources, TextureId.UI_CHECK_ON)
      : getTexture(resources, TextureId.UI_CHECK_OFF);
    ctx.drawTexturePro(
      checkTex,
      [0.0, 0.0, checkTex.width, checkTex.height],
      [
        leftTopLeft.x + 213.0 * panelScale,
        leftTopLeft.y + 174.0 * panelScale,
        16.0 * panelScale,
        16.0 * panelScale,
      ],
      ORIGIN, 0.0, WHITE,
    );
    const checkboxHovered = this._checkboxHovered(
      leftTopLeft, panelScale, this._checkboxEnabled(), resources, font,
    );
    const checkboxAlpha = checkboxHovered ? 1.0 : 178 / 255;
    drawSmallText(
      ctx, font, 'Show direction arrow',
      new Vec2(leftTopLeft.x + 235.0 * panelScale, leftTopLeft.y + 175.0 * panelScale),
      [1, 1, 1, checkboxAlpha],
    );

    // Dropdowns — closed ones first, then open (so open lists draw on top)
    type DropdownTuple = [boolean, ControlsDropdownLayout, string[], number, boolean];
    const dropdowns: DropdownTuple[] = [
      [
        this._playerProfileOpen, playerLayout, playerItems, playerSelected,
        !(this._moveMethodOpen || this._aimMethodOpen || this._rebindActive()),
      ],
      [
        this._aimMethodOpen, aimLayout, aimItems, aimSelected,
        !(this._moveMethodOpen || this._playerProfileOpen || this._rebindActive()),
      ],
      [
        this._moveMethodOpen, moveLayout, moveItems, moveSelected,
        !(this._aimMethodOpen || this._playerProfileOpen || this._rebindActive()),
      ],
    ];
    for (const [isOpen, layout, items, selectedIndex, enabled] of dropdowns) {
      if (isOpen) continue;
      this._drawDropdown(ctx, layout, items, selectedIndex, isOpen, enabled, panelScale, resources, font);
    }
    for (const [isOpen, layout, items, selectedIndex, enabled] of dropdowns) {
      if (!isOpen) continue;
      this._drawDropdown(ctx, layout, items, selectedIndex, isOpen, enabled, panelScale, resources, font);
    }

    // --- Right panel: configured bindings list ---
    const drawSectionHeading = (title: string, y: number): void => {
      const xHeading = rightTopLeft.x + 44.0 * panelScale;
      drawSmallText(ctx, font, title, new Vec2(xHeading, y), textColorFull);
      const lineY = y + 13.0 * panelScale;
      const lineH = Math.max(1.0, panelScale);
      ctx.drawRectangle(
        xHeading, lineY,
        228.0 * panelScale, lineH,
        1, 1, 1, 178 / 255,
      );
    };

    drawSmallText(
      ctx, font, 'Configured controls',
      new Vec2(rightTopLeft.x + 120.0 * panelScale, rightTopLeft.y + 38.0 * panelScale),
      textColorFull,
    );
    const headerW = measureSmallTextWidth(font, 'Configured controls');
    const headerLineY = rightTopLeft.y + 51.0 * panelScale;
    const headerLineH = Math.max(1.0, panelScale);
    ctx.drawRectangle(
      rightTopLeft.x + 120.0 * panelScale, headerLineY,
      headerW, headerLineH,
      1, 1, 1, 204 / 255,
    );

    const sections = this._rebindSections(playerIdx, aimScheme, moveMode);
    const rows = this._collectRebindRows(rightTopLeft, panelScale, playerIdx, sections, font);
    let rowIter = 0;
    const [mx, my] = InputState.mousePosition();
    const mouse = new Vec2(mx, my);
    const dropdownBlocked = this._moveMethodOpen || this._aimMethodOpen || this._playerProfileOpen;
    const rebindActive = this._rebindActive();

    let y = rightTopLeft.y + 64.0 * panelScale;
    for (const [sectionTitle, sectionRows] of sections) {
      drawSectionHeading(sectionTitle, y);
      let rowY = y + 18.0 * panelScale;
      for (let i = 0; i < sectionRows.length; i++) {
        const rowLayout = rows[rowIter++];
        const activeRow = rebindActive
          && this._rebindRow !== null
          && this._rebindRow.label === rowLayout.row.label
          && this._rebindRow.target === rowLayout.row.target
          && this._rebindRow.targetIndex === rowLayout.row.targetIndex
          && (this._rebindPlayerIndex ?? -1) === playerIdx;
        const hoveredRow = !rebindActive && !dropdownBlocked && rowLayout.valueRect.contains(mouse);

        const valueText = activeRow
          ? ControlsMenuView._capturePromptForBinding(rowLayout.row)
          : inputCodeName(this._bindingCode(playerIdx, rowLayout.row));
        const valuePos = rowLayout.valuePos;

        drawSmallText(
          ctx, font, rowLayout.row.label,
          new Vec2(rightTopLeft.x + 52.0 * panelScale, rowY),
          [1, 1, 1, 178 / 255],
        );

        let valueColor: Color = CONTROLS_REBIND_VALUE_COLOR;
        if (hoveredRow) valueColor = CONTROLS_REBIND_HOVER_COLOR;
        if (activeRow) valueColor = CONTROLS_REBIND_ACTIVE_COLOR;
        drawSmallText(ctx, font, valueText, valuePos, valueColor);

        const valueW = measureSmallTextWidth(font, valueText);
        const underlineY = rowLayout.rowY + 13.0 * panelScale;
        ctx.drawRectangle(
          valuePos.x, underlineY,
          valueW, Math.max(1.0, panelScale),
          valueColor[0], valueColor[1], valueColor[2], valueColor[3],
        );

        rowY += 16.0 * panelScale;
      }
      y = rowY + 8.0 * panelScale;
    }

    // Rebind hint
    if (rebindActive && (this._rebindPlayerIndex ?? -1) === playerIdx) {
      const hintPos = new Vec2(
        rightTopLeft.x + 48.0 * panelScale,
        rightTopLeft.y + (CONTROLS_RIGHT_PANEL_HEIGHT - 26.0) * panelScale,
      );
      drawSmallText(
        ctx, font, 'Esc/Right: cancel  Backspace: default  Delete: unbind',
        hintPos,
        [1, 226 / 255, 188 / 255, 220 / 255],
      );
    }
  }

  // -----------------------------------------------------------------------
  // Dropdown drawing
  // -----------------------------------------------------------------------

  private _drawDropdown(
    ctx: WebGLContext,
    layout: ControlsDropdownLayout,
    items: string[],
    selectedIndex: number,
    isOpen: boolean,
    enabled: boolean,
    scale: number,
    resources: RuntimeResources,
    font: SmallFontData,
  ): void {
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const hoveredHeader = enabled && mouseInsideRectWithPadding(
      mouse, layout.pos, layout.width, 14.0 * scale,
    );

    const widgetH = isOpen ? layout.fullH : layout.headerH;

    // Outer border (white)
    ctx.drawRectangle(
      layout.pos.x | 0, layout.pos.y | 0,
      layout.width | 0, widgetH | 0,
      1, 1, 1, 1,
    );
    // Inner fill (black)
    const innerW = Math.max(0, (layout.width | 0) - 2);
    const innerH = Math.max(0, (widgetH | 0) - 2);
    ctx.drawRectangle(
      (layout.pos.x | 0) + 1, (layout.pos.y | 0) + 1,
      innerW, innerH,
      0, 0, 0, 1,
    );

    if ((isOpen || hoveredHeader) && enabled) {
      const lineH = Math.max(1, (1.0 * scale) | 0);
      ctx.drawRectangle(
        layout.pos.x | 0,
        (layout.pos.y + 15.0 * scale) | 0,
        layout.width | 0, lineH,
        1, 1, 1, 128 / 255,
      );
    }

    const arrowTex = ((isOpen || hoveredHeader) && enabled)
      ? getTexture(resources, TextureId.UI_DROP_ON)
      : getTexture(resources, TextureId.UI_DROP_OFF);
    ctx.drawTexturePro(
      arrowTex,
      [0.0, 0.0, arrowTex.width, arrowTex.height],
      [layout.arrowPos.x, layout.arrowPos.y, layout.arrowSize.x, layout.arrowSize.y],
      ORIGIN, 0.0, WHITE,
    );

    const idx = items.length > 0 ? Math.max(0, Math.min(items.length - 1, selectedIndex | 0)) : 0;
    const headerAlpha = ((isOpen || hoveredHeader) && enabled) ? 242 / 255 : 191 / 255;
    if (items.length > 0) {
      drawSmallText(ctx, font, items[idx], layout.textPos, [1, 1, 1, headerAlpha]);
    }

    if (!isOpen) return;

    for (let i = 0; i < items.length; i++) {
      const itemY = layout.rowsY0 + layout.rowH * i;
      const hovered = enabled && mouseInsideRectWithPadding(
        mouse, new Vec2(layout.pos.x, itemY), layout.width, 14.0 * scale,
      );
      let alpha = 153 / 255;
      if (hovered) alpha = 242 / 255;
      if (i === selectedIndex) alpha = Math.max(alpha, 245 / 255);
      drawSmallText(ctx, font, items[i], new Vec2(layout.textPos.x, itemY), [1, 1, 1, alpha]);
    }
  }
}
