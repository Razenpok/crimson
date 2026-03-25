// Port of crimson/screens/results/game_over.py

import * as wgl from '@wgl';
import { Vec2, Rect } from '@grim/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText, measureSmallTextWidth, SmallFontData } from '@grim/fonts/small.ts';
import { InputState } from '@grim/input.ts';
import { type CrimsonConfig } from '@grim/config.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { type CrandLike } from '@grim/rand.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { WeaponId, WEAPON_BY_ID, weaponDisplayName } from '@crimson/weapons.ts';
import { drawMenuCursor } from '@crimson/ui/cursor.ts';
import { formatOrdinal, formatTimeMmSs } from '@crimson/ui/formatting.ts';
import { menuWidescreenYShift, uiScale } from '@crimson/ui/layout.ts';
import { drawClassicMenuPanel } from '@crimson/ui/menu-panel.ts';
import {
  UiButtonState,
  buttonDraw,
  buttonUpdate,
  buttonWidth,
  drawUiText,
} from '@crimson/ui/perk-menu.ts';
import {
  flushTextInputEvents,
  gameplayControlsHeld,
  updateNameEntryText,
} from '@crimson/ui/text-input.ts';

// ---------------------------------------------------------------------------
// High-score types (stub -- these will come from a persistence module)
// ---------------------------------------------------------------------------

export const NAME_MAX_EDIT = 15;
export const TABLE_MAX = 100;

export interface HighScoreRecord {
  gameModeId: number;
  scoreXp: number;
  survivalElapsedMs: number;
  mostUsedWeaponId: number;
  creatureKillCount: number;
  shotsFired: number;
  shotsHit: number;
  name: string;
}

export function rankIndex(records: HighScoreRecord[], candidate: HighScoreRecord): number {
  for (let i = 0; i < records.length; i++) {
    if (candidate.scoreXp > records[i].scoreXp) return i;
  }
  return records.length;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAME_OVER_PANEL_X = -45.0;
const GAME_OVER_PANEL_Y = 110.0;
const GAME_OVER_PANEL_W = 510.0;
const GAME_OVER_PANEL_H = 378.0;

const GAME_OVER_PANEL_OFFSET_X = 21.0;
const GAME_OVER_PANEL_OFFSET_Y = -81.0;

const TEXTURE_TOP_BANNER_W = 256.0;
const TEXTURE_TOP_BANNER_H = 64.0;

const GAME_OVER_BANNER_X_OFFSET = 214.0;

const INPUT_BOX_W = 166.0;
const INPUT_BOX_H = 18.0;

const PANEL_SLIDE_DURATION_MS = 250.0;

const COLOR_TEXT = wgl.makeColor(1.0, 1.0, 1.0, 1.0);
const COLOR_TEXT_MUTED = wgl.makeColor(1.0, 1.0, 1.0, 0.8);
const COLOR_SCORE_LABEL = wgl.makeColor(230 / 255, 230 / 255, 230 / 255, 1.0);
const COLOR_SCORE_VALUE = wgl.makeColor(230 / 255, 230 / 255, 255 / 255, 1.0);

// DOM key codes
const KEY_ENTER = 13;
const KEY_NUMPAD_ENTER = 13; // Same in DOM
const KEY_ESCAPE = 27;
const KEY_SPACE = 32;
const MOUSE_BUTTON_LEFT = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weaponIconSrc(
  texture: wgl.Texture,
  weaponIdNative: number,
): wgl.Rectangle | null {
  const weaponId = weaponIdNative as WeaponId;
  const entry = WEAPON_BY_ID.get(weaponId);
  if (!entry) return null;
  const iconIndex = entry.iconIndex;
  if (iconIndex < 0 || iconIndex > 31) return null;
  const grid = 8;
  const cellW = texture.width / grid;
  const cellH = texture.height / grid;
  const frame = iconIndex * 2;
  const col = frame % grid;
  const row = Math.floor(frame / grid);
  return wgl.makeRectangle(col * cellW, row * cellH, cellW * 2, cellH);
}

interface GameOverPanelLayout {
  panel: Rect;
  topLeft: Vec2;
}

function drawTextureCentered(
  tex: wgl.Texture,
  pos: Vec2,
  w: number,
  h: number,
  alpha: number,
): void {
  const src = wgl.makeRectangle(0.0, 0.0, tex.width, tex.height);
  const dst = wgl.makeRectangle(pos.x, pos.y, w, h);
  const a = Math.max(0.0, Math.min(1.0, alpha));
  const tint = wgl.makeColor(1.0, 1.0, 1.0, a);
  wgl.drawTexturePro(tex, src, dst, wgl.makeVector2(0.0, 0.0), 0.0, tint);
}

function easeOutCubic(t: number): number {
  const clamped = Math.max(0.0, Math.min(1.0, t));
  return 1.0 - Math.pow(1.0 - clamped, 3);
}

function textWidth(font: SmallFontData, text: string): number {
  return measureSmallTextWidth(font, text);
}

function drawSmall(
  font: SmallFontData,
  text: string,
  pos: Vec2,
  color: wgl.Color,
): void {
  drawSmallText(font, text, pos, color);
}

// ---------------------------------------------------------------------------
// GameOverUi
// ---------------------------------------------------------------------------

export class GameOverUi {
  config: CrimsonConfig;
  preserveBugs = false;

  inputText = '';
  inputCaret = 0;
  phase = -1; // -1 init, 0 name entry (if qualifies), 1 results/buttons
  rank = TABLE_MAX;
  private _candidateRecord: HighScoreRecord | null = null;
  private _saved = false;
  private _dt = 0.0;

  private _hoverWeapon = 0.0;
  private _hoverTime = 0.0;
  private _hoverHitRatio = 0.0;
  private _introMs = 0.0;
  private _cursorPulseTime = 0.0;
  private _panelOpenSfxPlayed = false;
  private _closing = false;
  private _closeAction: string | null = null;

  // Buttons
  private _okButton = new UiButtonState('OK', { forceWide: false });
  private _playAgainButton = new UiButtonState('Play Again', { forceWide: true });
  private _highScoresButton = new UiButtonState('High scores', { forceWide: true });
  private _mainMenuButton = new UiButtonState('Main Menu', { forceWide: true });

  private _consumeEnter = false;
  private _deferNameInputUntilControlsReleased = false;

  constructor(config: CrimsonConfig) {
    this.config = config;
  }

  open(): void {
    this.close();
    this.phase = -1;
    this.rank = TABLE_MAX;
    this._candidateRecord = null;
    this._saved = false;
    this._dt = 0.0;
    this._hoverWeapon = 0.0;
    this._hoverTime = 0.0;
    this._hoverHitRatio = 0.0;
    this._introMs = 0.0;
    this._cursorPulseTime = 0.0;
    this._panelOpenSfxPlayed = false;
    this._closing = false;
    this._closeAction = null;
    this.inputText = '';
    this.inputCaret = 0;
    this._consumeEnter = true;
    this._deferNameInputUntilControlsReleased = false;
  }

  close(): void {
    // no-op
  }

  consumeEnter(): boolean {
    if (this._consumeEnter) {
      this._consumeEnter = false;
      return true;
    }
    return false;
  }

  worldEntityAlpha(): number {
    if (!this._closing) return 1.0;
    if (PANEL_SLIDE_DURATION_MS <= 1e-6) return 0.0;
    const alpha = this._introMs / PANEL_SLIDE_DURATION_MS;
    if (alpha < 0.0) return 0.0;
    if (alpha > 1.0) return 1.0;
    return alpha;
  }

  private _panelLayout(screenW: number, scale: number): GameOverPanelLayout {
    const t = PANEL_SLIDE_DURATION_MS > 1e-6 ? this._introMs / PANEL_SLIDE_DURATION_MS : 1.0;
    const eased = easeOutCubic(t);
    const panelSlideX = -GAME_OVER_PANEL_W * (1.0 - eased);

    const panelPosX = (GAME_OVER_PANEL_X + panelSlideX) * scale;
    const layoutW = scale ? screenW / scale : screenW;
    const widescreenShiftY = menuWidescreenYShift(layoutW);
    const panelPosY = (GAME_OVER_PANEL_Y + widescreenShiftY) * scale;
    const panelOriginX = -(GAME_OVER_PANEL_OFFSET_X * scale);
    const panelOriginY = -(GAME_OVER_PANEL_OFFSET_Y * scale);
    const topLeftX = panelPosX - panelOriginX;
    const topLeftY = panelPosY - panelOriginY;
    const topLeft = new Vec2(topLeftX, topLeftY);
    const panel = Rect.fromTopLeft(topLeft, GAME_OVER_PANEL_W * scale, GAME_OVER_PANEL_H * scale);
    return { panel, topLeft };
  }

  private _beginCloseTransition(action: string): void {
    if (this._closing) return;
    this._closing = true;
    this._closeAction = action;
  }

  update(
    dt: number,
    opts: {
      record: HighScoreRecord;
      playerNameDefault: string;
      resources: RuntimeResources;
      playSfx?: ((id: SfxId) => void) | null;
      rng?: CrandLike | null;
      mouse?: { x: number; y: number } | null;
      existingRecords?: HighScoreRecord[];
    },
  ): string | null {
    this._dt = Math.min(dt, 0.1);
    const dtMs = this._dt * 1000.0;
    this._cursorPulseTime += this._dt * 1.1;
    const mouse = opts.mouse ?? { x: InputState.mousePosition()[0], y: InputState.mousePosition()[1] };
    const playSfx = opts.playSfx ?? null;
    const resources = opts.resources;

    if (this._closing) {
      this._introMs = Math.max(0.0, this._introMs - dtMs);
      if (this._introMs <= 1e-3 && this._closeAction !== null) {
        const action = this._closeAction;
        this._closeAction = null;
        this._closing = false;
        return action;
      }
      return null;
    }

    this._introMs = Math.min(PANEL_SLIDE_DURATION_MS, this._introMs + dtMs);
    if (
      !this._panelOpenSfxPlayed &&
      playSfx !== null &&
      this._introMs >= PANEL_SLIDE_DURATION_MS - 1e-3
    ) {
      playSfx(SfxId.UI_PANELCLICK);
      this._panelOpenSfxPlayed = true;
    }
    if (this._consumeEnter) {
      this._consumeEnter = false;
      InputState.wasKeyPressed(KEY_ENTER);
    }
    if (this.phase === -1) {
      const gameModeId = this.config.gameplay.mode as number;
      const candidate: HighScoreRecord = { ...opts.record, gameModeId };
      this._candidateRecord = candidate;

      const records = opts.existingRecords ?? [];
      const idx = rankIndex(records, candidate);
      this.rank = idx;
      flushTextInputEvents();
      InputState.wasKeyPressed(KEY_ENTER);

      if (idx < TABLE_MAX) {
        this.phase = 0;
        this.inputText = opts.playerNameDefault.slice(0, NAME_MAX_EDIT);
        this.inputCaret = this.inputText.length;
        this._deferNameInputUntilControlsReleased = true;
        return null;
      } else {
        this.phase = 1;
      }
    }

    const screenW = wgl.getScreenWidth();
    const screenH = wgl.getScreenHeight();
    const scale = uiScale(screenW, screenH);

    if (this.phase === 0) {
      if (this._deferNameInputUntilControlsReleased) {
        flushTextInputEvents();
        InputState.wasKeyPressed(KEY_ENTER);
        if (!gameplayControlsHeld(this.config)) {
          this._deferNameInputUntilControlsReleased = false;
        }
        return null;
      }
      const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
      // Provide a stub rng if none given
      const rng = opts.rng ?? { rand(_caller: number) { return 0; } } as CrandLike;
      const [newText, newCaret] = updateNameEntryText(
        this.inputText,
        this.inputCaret,
        NAME_MAX_EDIT,
        rng,
        playSfx,
      );
      this.inputText = newText;
      this.inputCaret = newCaret;

      const panelLayout = this._panelLayout(screenW, scale);
      const bannerPos = panelLayout.topLeft.add(new Vec2(GAME_OVER_BANNER_X_OFFSET * scale, 40.0 * scale));
      const formPos = bannerPos.add(new Vec2(8.0 * scale, 84.0 * scale));
      const okPos = formPos.add(new Vec2(170.0 * scale, 32.0 * scale));
      const okW = buttonWidth(resources, this._okButton.label, { scale, forceWide: this._okButton.forceWide });
      const okClicked = buttonUpdate(this._okButton, { pos: okPos, width: okW, dtMs, mouse, click });

      if (okClicked || InputState.wasKeyPressed(KEY_ENTER)) {
        if (this.inputText.trim()) {
          if (playSfx !== null) {
            playSfx(SfxId.UI_TYPEENTER);
          }
          // In WebGL port, saving is handled by the caller
          if (!this._saved) {
            this._saved = true;
          }
          this.phase = 1;
          return null;
        }
        if (playSfx !== null) {
          playSfx(SfxId.SHOCK_HIT_01);
        }
      }
    } else {
      // Buttons phase
      const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
      const panelLayout = this._panelLayout(screenW, scale);
      const bannerPos = panelLayout.topLeft.add(new Vec2(GAME_OVER_BANNER_X_OFFSET * scale, 40.0 * scale));
      let btnPos = bannerPos.add(new Vec2(
        52.0 * scale,
        (this.rank < TABLE_MAX ? 210.0 : 208.0) * scale,
      ));

      const playAgainW = buttonWidth(resources, this._playAgainButton.label, {
        scale,
        forceWide: this._playAgainButton.forceWide,
      });
      if (buttonUpdate(this._playAgainButton, { pos: btnPos, width: playAgainW, dtMs, mouse, click })) {
        if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
        this._beginCloseTransition('play_again');
        return null;
      }
      btnPos = btnPos.offset(0.0, 32.0 * scale);

      const highScoresW = buttonWidth(resources, this._highScoresButton.label, {
        scale,
        forceWide: this._highScoresButton.forceWide,
      });
      if (buttonUpdate(this._highScoresButton, { pos: btnPos, width: highScoresW, dtMs, mouse, click })) {
        if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
        this._beginCloseTransition('high_scores');
        return null;
      }
      btnPos = btnPos.offset(0.0, 32.0 * scale);

      const mainMenuW = buttonWidth(resources, this._mainMenuButton.label, {
        scale,
        forceWide: this._mainMenuButton.forceWide,
      });
      if (buttonUpdate(this._mainMenuButton, { pos: btnPos, width: mainMenuW, dtMs, mouse, click })) {
        if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
        this._beginCloseTransition('main_menu');
        return null;
      }
    }
    return null;
  }

  private _drawScoreCard(
    opts: {
      pos: Vec2;
      record: HighScoreRecord;
      resources: RuntimeResources;
      font: SmallFontData;
      alpha: number;
      showWeaponRow: boolean;
      scale: number;
      mouse: { x: number; y: number };
    },
  ): void {
    const { pos, record, resources, font, alpha, showWeaponRow, scale, mouse } = opts;
    const dtHover = this._dt * 2.0;
    const labelColor = wgl.makeColor(
      COLOR_SCORE_LABEL[0], COLOR_SCORE_LABEL[1], COLOR_SCORE_LABEL[2],
      alpha * 0.8,
    );
    const valueColor = wgl.makeColor(
      COLOR_SCORE_VALUE[0], COLOR_SCORE_VALUE[1], COLOR_SCORE_VALUE[2],
      alpha,
    );
    const hintColor = wgl.makeColor(
      COLOR_SCORE_LABEL[0], COLOR_SCORE_LABEL[1], COLOR_SCORE_LABEL[2],
      alpha * 0.7,
    );

    const cardOrigin = pos.offset(4.0 * scale);
    const modeRaw = record.gameModeId;
    let modeId: number;
    try {
      modeId = modeRaw;
    } catch {
      modeId = GameMode.DEMO;
    }

    // Left column: Score + value + Rank.
    const scoreLabel = 'Score';
    const scoreLabelW = textWidth(font, scoreLabel);
    drawSmall(
      font, scoreLabel,
      cardOrigin.offset(32.0 * scale - scoreLabelW * 0.5),
      labelColor,
    );

    let scoreValue: string;
    if (modeId === GameMode.RUSH || modeId === GameMode.QUESTS) {
      const seconds = Math.floor(record.survivalElapsedMs) * 0.001;
      scoreValue = `${seconds.toFixed(2)} secs`;
    } else {
      scoreValue = `${Math.floor(record.scoreXp)}`;
    }
    const scoreValueW = textWidth(font, scoreValue);
    drawSmall(
      font, scoreValue,
      cardOrigin.add(new Vec2(32.0 * scale - scoreValueW * 0.5, 15.0 * scale)),
      valueColor,
    );

    const rankValue = formatOrdinal(this.rank + 1);
    const rankText = `Rank: ${rankValue}`;
    const rankW = textWidth(font, rankText);
    drawSmall(
      font, rankText,
      cardOrigin.add(new Vec2(32.0 * scale - rankW * 0.5, 30.0 * scale)),
      labelColor,
    );

    // Separator between columns
    const separatorX = cardOrigin.x + 80.0 * scale;
    wgl.drawRectangle(
      Math.floor(separatorX),
      Math.floor(cardOrigin.y),
      1,
      Math.floor(48.0 * scale),
      wgl.makeColor(labelColor[0], labelColor[1], labelColor[2], labelColor[3]),
    );

    // Right column: Game time + gauge, or Experience in quest mode.
    const col2Pos = cardOrigin.offset(96.0 * scale);
    if (modeId === GameMode.QUESTS) {
      drawSmall(font, 'Experience', col2Pos, labelColor);
      const xpValue = `${Math.floor(record.scoreXp)}`;
      const xpW = textWidth(font, xpValue);
      drawSmall(
        font, xpValue,
        col2Pos.add(new Vec2(32.0 * scale - xpW * 0.5, 15.0 * scale)),
        labelColor,
      );
      this._hoverTime = Math.max(0.0, this._hoverTime - dtHover);
    } else {
      drawSmall(font, 'Game time', col2Pos.offset(6.0 * scale), labelColor);
      const timeRectPos = col2Pos.add(new Vec2(8.0 * scale, 16.0 * scale));
      const timeRect = Rect.fromTopLeft(timeRectPos, 64.0 * scale, 29.0 * scale);
      const hoveringTime = timeRect.contains(mouse);
      this._hoverTime = Math.max(0.0, Math.min(1.0, this._hoverTime + (hoveringTime ? dtHover : -dtHover)));

      const elapsedMs = Math.floor(record.survivalElapsedMs);
      const clockTable = getTexture(resources, TextureId.UI_CLOCK_TABLE);
      const clockTableSrc = wgl.makeRectangle(0.0, 0.0, clockTable.width, clockTable.height);
      const clockTablePos = col2Pos.add(new Vec2(8.0 * scale, 14.0 * scale));
      const clockTableDst = wgl.makeRectangle(clockTablePos.x, clockTablePos.y, 32.0 * scale, 32.0 * scale);
      const texTint = wgl.makeColor(1.0, 1.0, 1.0, alpha);
      wgl.drawTexturePro(clockTable, clockTableSrc, clockTableDst, wgl.makeVector2(0.0, 0.0), 0.0, texTint);

      const clockPointer = getTexture(resources, TextureId.UI_CLOCK_POINTER);
      const clockPointerSrc = wgl.makeRectangle(0.0, 0.0, clockPointer.width, clockPointer.height);
      const clockPointerPos = col2Pos.add(new Vec2(24.0 * scale, 30.0 * scale));
      const clockPointerDst = wgl.makeRectangle(clockPointerPos.x, clockPointerPos.y, 32.0 * scale, 32.0 * scale);
      const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const rotation = seconds * 6.0;
      const origin = wgl.makeVector2(16.0 * scale, 16.0 * scale);
      wgl.drawTexturePro(clockPointer, clockPointerSrc, clockPointerDst, origin, rotation, texTint);

      const timeText = formatTimeMmSs(elapsedMs);
      drawSmall(font, timeText, col2Pos.add(new Vec2(40.0 * scale, 19.0 * scale)), labelColor);
    }

    // Second row: weapon icon + frags + hit ratio
    const rowPos = cardOrigin.offset(0.0, 52.0 * scale);
    this._hoverWeapon = Math.max(0.0, Math.min(1.0, this._hoverWeapon));
    this._hoverHitRatio = Math.max(0.0, Math.min(1.0, this._hoverHitRatio));
    let tooltipPos: Vec2;
    if (showWeaponRow) {
      const weaponPos = rowPos;
      const weaponRect = Rect.fromTopLeft(weaponPos, 64.0 * scale, 32.0 * scale);
      const hoveringWeapon = weaponRect.contains(mouse);
      this._hoverWeapon = Math.max(0.0, Math.min(1.0, this._hoverWeapon + (hoveringWeapon ? dtHover : -dtHover)));

      const wicons = getTexture(resources, TextureId.UI_WICONS);
      const src = weaponIconSrc(wicons, record.mostUsedWeaponId);
      if (src !== null) {
        const dst = wgl.makeRectangle(weaponPos.x, weaponPos.y, 64.0 * scale, 32.0 * scale);
        const tint = wgl.makeColor(1.0, 1.0, 1.0, alpha);
        wgl.drawTexturePro(wicons, src, dst, wgl.makeVector2(0.0, 0.0), 0.0, tint);
      }

      const weaponId = record.mostUsedWeaponId as WeaponId;
      const weaponName = weaponDisplayName(weaponId, this.preserveBugs);
      const nameW = textWidth(font, weaponName);
      const namePos = new Vec2(
        cardOrigin.x + Math.max(0.0, 32.0 * scale - nameW * 0.5),
        rowPos.y + 32.0 * scale,
      );
      drawSmall(font, weaponName, namePos, hintColor);

      const fragsText = `Frags: ${Math.floor(record.creatureKillCount)}`;
      const statsPos = rowPos.offset(110.0 * scale);
      drawSmall(font, fragsText, statsPos.offset(0.0, 1.0 * scale), labelColor);

      const fired = Math.max(0, Math.floor(record.shotsFired));
      const hit = Math.max(0, Math.floor(record.shotsHit));
      const ratio = fired > 0 ? Math.floor((hit * 100) / fired) : 0;
      const hitText = `Hit %: ${ratio}%`;
      drawSmall(font, hitText, statsPos.offset(0.0, 15.0 * scale), labelColor);

      const hitRectPos = statsPos.offset(0.0, 15.0 * scale);
      const hitRect = Rect.fromTopLeft(hitRectPos, 64.0 * scale, 17.0 * scale);
      const hoveringHit = hitRect.contains(mouse);
      this._hoverHitRatio = Math.max(0.0, Math.min(1.0, this._hoverHitRatio + (hoveringHit ? dtHover : -dtHover)));
      tooltipPos = rowPos.offset(0.0, 48.0 * scale);
    } else {
      this._hoverWeapon = Math.max(0.0, this._hoverWeapon - dtHover);
      this._hoverHitRatio = 0.0;
      tooltipPos = rowPos;
    }

    this._hoverWeapon = Math.max(0.0, Math.min(1.0, this._hoverWeapon));
    this._hoverTime = Math.max(0.0, Math.min(1.0, this._hoverTime));
    this._hoverHitRatio = Math.max(0.0, Math.min(1.0, this._hoverHitRatio));

    if (this._hoverWeapon > 0.5) {
      const t = (this._hoverWeapon - 0.5) * 2.0;
      const col = wgl.makeColor(labelColor[0], labelColor[1], labelColor[2], alpha * t);
      drawSmall(
        font,
        'Most used weapon during the game',
        tooltipPos.offset(-20.0 * scale),
        col,
      );
    }
    if (this._hoverTime > 0.5) {
      const t = (this._hoverTime - 0.5) * 2.0;
      const col = wgl.makeColor(labelColor[0], labelColor[1], labelColor[2], alpha * t);
      drawSmall(
        font,
        'The time the game lasted',
        tooltipPos.offset(12.0 * scale),
        col,
      );
    }
    if (this._hoverHitRatio > 0.5) {
      const t = (this._hoverHitRatio - 0.5) * 2.0;
      const col = wgl.makeColor(labelColor[0], labelColor[1], labelColor[2], alpha * t);
      const hitRatioTooltip = this.preserveBugs
        ? 'The % of shot bullets hit the target'
        : 'The % of bullets that hit the target';
      drawSmall(
        font,
        hitRatioTooltip,
        tooltipPos.offset(-22.0 * scale),
        col,
      );
    }
  }

  draw(
    opts: {
      record: HighScoreRecord;
      bannerKind: string;
      resources: RuntimeResources;
      mouse?: { x: number; y: number } | null;
    },
  ): void {
    const mouse = opts.mouse ?? { x: InputState.mousePosition()[0], y: InputState.mousePosition()[1] };
    const resources = opts.resources;
    const font = resources.smallFont;
    const record = opts.record;
    const bannerKind = opts.bannerKind;

    const screenW = wgl.getScreenWidth();
    const screenH = wgl.getScreenHeight();
    const scale = uiScale(screenW, screenH);

    const panelLayout = this._panelLayout(screenW, scale);
    const panel = panelLayout.panel;
    const panelTopLeft = panelLayout.topLeft;

    // Panel background
    const fxDetail = this.config.display.fxDetail[0] ?? false;
    drawClassicMenuPanel(
      getTexture(resources, TextureId.UI_MENU_PANEL),
      wgl.makeRectangle(panel.x, panel.y, panel.w, panel.h),
      wgl.makeColor(1, 1, 1, 1),
      fxDetail,
    );

    // Banner (Reaper / Well done)
    const bannerPos = panelTopLeft.add(new Vec2(GAME_OVER_BANNER_X_OFFSET * scale, 40.0 * scale));
    const banner = bannerKind === 'reaper'
      ? getTexture(resources, TextureId.UI_TEXT_REAPER)
      : getTexture(resources, TextureId.UI_TEXT_WELL_DONE);
    drawTextureCentered(
      banner, bannerPos,
      TEXTURE_TOP_BANNER_W * scale,
      TEXTURE_TOP_BANNER_H * scale,
      1.0,
    );

    if (this.phase === 0) {
      const formPos = bannerPos.add(new Vec2(8.0 * scale, 84.0 * scale));
      drawSmall(
        font, 'State your name, trooper!',
        formPos.offset(42.0 * scale),
        COLOR_TEXT,
      );

      const inputPos = formPos.offset(0.0, 40.0 * scale);
      // Input box outline
      wgl.drawRectangle(
        Math.floor(inputPos.x),
        Math.floor(inputPos.y),
        Math.floor(INPUT_BOX_W * scale),
        1,
        wgl.makeColor(1, 1, 1, 1),
      );
      wgl.drawRectangle(
        Math.floor(inputPos.x),
        Math.floor(inputPos.y + INPUT_BOX_H * scale - 1),
        Math.floor(INPUT_BOX_W * scale),
        1,
        wgl.makeColor(1, 1, 1, 1),
      );
      wgl.drawRectangle(
        Math.floor(inputPos.x),
        Math.floor(inputPos.y),
        1,
        Math.floor(INPUT_BOX_H * scale),
        wgl.makeColor(1, 1, 1, 1),
      );
      wgl.drawRectangle(
        Math.floor(inputPos.x + INPUT_BOX_W * scale - 1),
        Math.floor(inputPos.y),
        1,
        Math.floor(INPUT_BOX_H * scale),
        wgl.makeColor(1, 1, 1, 1),
      );
      // Input box fill
      wgl.drawRectangle(
        Math.floor(inputPos.x + 1.0 * scale),
        Math.floor(inputPos.y + 1.0 * scale),
        Math.floor((INPUT_BOX_W - 2.0) * scale),
        Math.floor((INPUT_BOX_H - 2.0) * scale),
        wgl.makeColor(0, 0, 0, 1),
      );
      drawUiText(
        resources, this.inputText,
        inputPos.add(new Vec2(4.0 * scale, 2.0 * scale)),
        { scale: 1.0 * scale, color: COLOR_TEXT_MUTED },
      );
      // Caret
      let caretAlpha = 1.0;
      if (Math.sin(performance.now() * 0.004) > 0.0) {
        caretAlpha = 0.4;
      }
      const caretColor = wgl.makeColor(1.0, 1.0, 1.0, caretAlpha);
      const caretX = inputPos.x + 4.0 * scale + textWidth(font, this.inputText.slice(0, this.inputCaret));
      wgl.drawRectangle(
        Math.floor(caretX),
        Math.floor(inputPos.y + 2.0 * scale),
        Math.floor(1.0 * scale),
        Math.floor(14.0 * scale),
        wgl.makeColor(caretColor[0], caretColor[1], caretColor[2], caretColor[3]),
      );

      const okPos = formPos.add(new Vec2(170.0 * scale, 32.0 * scale));
      const okW = buttonWidth(resources, this._okButton.label, { scale, forceWide: this._okButton.forceWide });
      buttonDraw(resources, this._okButton, { pos: okPos, width: okW, scale });

      const scorePos = formPos.add(new Vec2(16.0 * scale, 116.0 * scale));
      this._drawScoreCard({
        pos: scorePos,
        record,
        resources,
        font,
        alpha: 1.0,
        showWeaponRow: false,
        scale,
        mouse,
      });
    } else {
      const scoreCardPos = bannerPos.add(new Vec2(
        30.0 * scale,
        (this.rank < TABLE_MAX ? 80.0 : 78.0) * scale,
      ));
      if (this.rank >= TABLE_MAX && bannerKind === 'reaper') {
        drawSmall(
          font,
          'Score too low for top100.',
          bannerPos.add(new Vec2(38.0 * scale, 62.0 * scale)),
          wgl.makeColor(200 / 255, 200 / 255, 200 / 255, 1.0),
        );
      }

      this._drawScoreCard({
        pos: scoreCardPos,
        record,
        resources,
        font,
        alpha: 1.0,
        showWeaponRow: true,
        scale,
        mouse,
      });
    }

    // Buttons phase rendering.
    if (this.phase === 1) {
      let btnPos = bannerPos.add(new Vec2(
        52.0 * scale,
        (this.rank < TABLE_MAX ? 210.0 : 208.0) * scale,
      ));
      const playAgainW = buttonWidth(resources, this._playAgainButton.label, {
        scale,
        forceWide: this._playAgainButton.forceWide,
      });
      buttonDraw(resources, this._playAgainButton, { pos: btnPos, width: playAgainW, scale });
      btnPos = btnPos.offset(0.0, 32.0 * scale);

      const highScoresW = buttonWidth(resources, this._highScoresButton.label, {
        scale,
        forceWide: this._highScoresButton.forceWide,
      });
      buttonDraw(resources, this._highScoresButton, { pos: btnPos, width: highScoresW, scale });
      btnPos = btnPos.offset(0.0, 32.0 * scale);

      const mainMenuW = buttonWidth(resources, this._mainMenuButton.label, {
        scale,
        forceWide: this._mainMenuButton.forceWide,
      });
      buttonDraw(resources, this._mainMenuButton, { pos: btnPos, width: mainMenuW, scale });
    }

    drawMenuCursor(
      getTexture(resources, TextureId.PARTICLES),
      getTexture(resources, TextureId.UI_CURSOR),
      new Vec2(mouse.x, mouse.y),
      this._cursorPulseTime,
    );
  }
}
