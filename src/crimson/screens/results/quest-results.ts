// Port of crimson/screens/results/quest_results.py

import * as wgl from '@wgl';
import { type WebGLContext, type GlTexture } from '@grim/webgl.ts';
import { Vec2, Rect } from '@grim/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText, measureSmallTextWidth, SmallFontData } from '@grim/fonts/small.ts';
import { InputState } from '@grim/input.ts';
import { type CrimsonConfig } from '@grim/config.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { type CrandLike } from '@grim/rand.ts';
import { type QuestLevel, questLevelEqual } from '@crimson/quests/level.ts';
import {
  type QuestFinalTime,
  QuestResultsBreakdownAnim,
  tickQuestResultsBreakdownAnim,
} from '@crimson/quests/results.ts';
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
import {
  type HighScoreRecord,
  TABLE_MAX,
  NAME_MAX_EDIT,
  rankIndex,
} from './game-over.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEST_RESULTS_PANEL_POS_X = -45.0;
const QUEST_RESULTS_PANEL_POS_Y = 110.0;
const QUEST_RESULTS_PANEL_GEOM_X0 = -63.0;
const QUEST_RESULTS_PANEL_GEOM_Y0 = -81.0;

const QUEST_RESULTS_PANEL_W = 510.0;
const QUEST_RESULTS_PANEL_H = 378.0;

const TEXTURE_TOP_BANNER_W = 256.0;
const TEXTURE_TOP_BANNER_H = 64.0;

const QUEST_RESULTS_CONTENT_X = 220.0;
const QUEST_RESULTS_BANNER_X_FROM_CONTENT = -18.0;
const QUEST_RESULTS_SCORE_CARD_X_FROM_CONTENT = 30.0;

const INPUT_BOX_W = 166.0;
const INPUT_BOX_H = 18.0;

const PANEL_SLIDE_START_MS = 400.0;
const PANEL_SLIDE_END_MS = 100.0;

const COLOR_TEXT = wgl.makeColor(1.0, 1.0, 1.0, 1.0);
const COLOR_TEXT_MUTED = wgl.makeColor(1.0, 1.0, 1.0, 0.8);
const COLOR_TEXT_SUBTLE = wgl.makeColor(1.0, 1.0, 1.0, 0.7);
const COLOR_GREEN = wgl.makeColor(25 / 255, 200 / 255, 25 / 255, 1.0);
const COLOR_UI_ACCENT = wgl.makeColor(149 / 255, 175 / 255, 198 / 255, 1.0);

// DOM key codes
const KEY_ENTER = 13;
const KEY_ESCAPE = 27;
const KEY_SPACE = 32;
const KEY_H = 72;
const KEY_N = 78;
const MOUSE_BUTTON_LEFT = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function weaponIconSrc(
  texture: GlTexture,
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

interface QuestResultsPanelLayout {
  panel: Rect;
  topLeft: Vec2;
}

function textWidth(font: SmallFontData, text: string): number {
  return measureSmallTextWidth(font, text);
}

function drawSmall(
  ctx: WebGLContext,
  font: SmallFontData,
  text: string,
  pos: Vec2,
  color: wgl.Color,
): void {
  drawSmallText(ctx, font, text, pos, color);
}

// ---------------------------------------------------------------------------
// QuestResultsUi
// ---------------------------------------------------------------------------

export class QuestResultsUi {
  config: CrimsonConfig;
  preserveBugs = false;

  phase = -1; // -1 init, 0 breakdown, 1 name entry (if qualifies), 2 results/buttons
  rank = TABLE_MAX;
  highlightRank: number | null = null;

  questLevel: QuestLevel | null = null;
  questTitle = '';
  unlockWeaponName = '';
  unlockPerkName = '';

  record: HighScoreRecord | null = null;
  breakdown: QuestFinalTime | null = null;
  private _breakdownAnim: QuestResultsBreakdownAnim | null = null;

  inputText = '';
  inputCaret = 0;
  private _saved = false;

  private _introMs = 0.0;
  private _cursorPulseTime = 0.0;
  private _panelOpenSfxPlayed = false;
  private _closing = false;
  private _closeAction: string | null = null;
  private _consumeEnter = false;
  private _deferNameInputUntilControlsReleased = false;

  // Buttons
  private _okButton = new UiButtonState('OK', { forceWide: false });
  private _playNextButton = new UiButtonState('Play Next', { forceWide: true });
  private _playAgainButton = new UiButtonState('Play Again', { forceWide: true });
  private _highScoresButton = new UiButtonState('High scores', { forceWide: true });
  private _mainMenuButton = new UiButtonState('Main Menu', { forceWide: true });

  constructor(config: CrimsonConfig) {
    this.config = config;
  }

  open(opts: {
    record: HighScoreRecord;
    breakdown: QuestFinalTime;
    questLevel: QuestLevel;
    questTitle: string;
    unlockWeaponName: string;
    unlockPerkName: string;
    playerNameDefault: string;
    existingRecords?: HighScoreRecord[];
  }): void {
    this.close();
    this.phase = -1;
    this.rank = TABLE_MAX;
    this.highlightRank = null;
    this.questLevel = opts.questLevel;
    this.questTitle = opts.questTitle || '';
    this.unlockWeaponName = opts.unlockWeaponName || '';
    this.unlockPerkName = opts.unlockPerkName || '';
    this.record = { ...opts.record };
    this.breakdown = opts.breakdown;
    this._breakdownAnim = QuestResultsBreakdownAnim.start();
    this._saved = false;

    // Native behavior: the final quest replaces "Play Next" with "Show End Note".
    if (this.questLevel && questLevelEqual(this.questLevel, { major: 5, minor: 10 })) {
      this._playNextButton.label = 'Show End Note';
    } else {
      this._playNextButton.label = 'Play Next';
    }

    const records = opts.existingRecords ?? [];
    try {
      this.rank = rankIndex(records, this.record);
    } catch {
      this.rank = TABLE_MAX;
    }

    this.inputText = (opts.playerNameDefault || '').slice(0, NAME_MAX_EDIT);
    this.inputCaret = this.inputText.length;

    this._introMs = 0.0;
    this._cursorPulseTime = 0.0;
    this._panelOpenSfxPlayed = false;
    this._closing = false;
    this._closeAction = null;
    this._consumeEnter = true;
    this._deferNameInputUntilControlsReleased = false;
    this.phase = 0;
  }

  close(): void {
    // no-op
  }

  private _beginCloseTransition(action: string): void {
    if (this._closing) return;
    this._closing = true;
    this._closeAction = action;
  }

  private _armNameInputAfterControlRelease(): void {
    this._deferNameInputUntilControlsReleased = true;
    flushTextInputEvents();
    InputState.wasKeyPressed(KEY_ENTER);
  }

  worldEntityAlpha(): number {
    if (!this._closing) return 1.0;
    const tMs = this._introMs;
    if (tMs <= PANEL_SLIDE_END_MS) return 0.0;
    if (tMs >= PANEL_SLIDE_START_MS) return 1.0;
    const span = PANEL_SLIDE_START_MS - PANEL_SLIDE_END_MS;
    if (span <= 1e-6) return 1.0;
    const alpha = (tMs - PANEL_SLIDE_END_MS) / span;
    if (alpha < 0.0) return 0.0;
    if (alpha > 1.0) return 1.0;
    return alpha;
  }

  private _panelLayout(screenW: number, scale: number): QuestResultsPanelLayout {
    const tMs = this._introMs;
    let panelSlideX: number;
    if (tMs < PANEL_SLIDE_END_MS) {
      panelSlideX = -QUEST_RESULTS_PANEL_W;
    } else if (tMs < PANEL_SLIDE_START_MS) {
      const span = PANEL_SLIDE_START_MS - PANEL_SLIDE_END_MS;
      const p = span > 1e-6 ? (tMs - PANEL_SLIDE_END_MS) / span : 1.0;
      panelSlideX = -((1.0 - p) * QUEST_RESULTS_PANEL_W);
    } else {
      panelSlideX = 0.0;
    }

    const panelPosX = (QUEST_RESULTS_PANEL_GEOM_X0 + QUEST_RESULTS_PANEL_POS_X + panelSlideX) * scale;
    const layoutW = scale ? screenW / scale : screenW;
    const widescreenShiftY = menuWidescreenYShift(layoutW);
    const panelPosY = (QUEST_RESULTS_PANEL_GEOM_Y0 + QUEST_RESULTS_PANEL_POS_Y + widescreenShiftY) * scale;
    const topLeft = new Vec2(panelPosX, panelPosY);
    const panel = Rect.fromTopLeft(topLeft, QUEST_RESULTS_PANEL_W * scale, QUEST_RESULTS_PANEL_H * scale);
    return { panel, topLeft };
  }

  private _drawNameEntryStats(
    ctx: WebGLContext,
    opts: {
      pos: Vec2;
      scale: number;
      alpha: number;
      showWeaponRow: boolean;
      resources: RuntimeResources;
      font: SmallFontData;
    },
  ): void {
    if (this.record === null) return;
    const record = this.record;
    const qualifies = this.rank < TABLE_MAX;
    const rankText = qualifies ? formatOrdinal(this.rank + 1) : '--';
    const x = opts.pos.x;
    const y = opts.pos.y;
    const scale = opts.scale;
    const resources = opts.resources;
    const font = opts.font;

    const seconds = Math.floor(record.survivalElapsedMs) * 0.001;
    const scoreValue = `${seconds.toFixed(2)} secs`;
    const xpValue = `${Math.floor(record.scoreXp)}`;

    const alphaF = Math.max(0.0, Math.min(1.0, opts.alpha));
    const colLabel = wgl.makeColor(230 / 255, 230 / 255, 230 / 255, alphaF * 0.8);
    const colScoreValue = wgl.makeColor(230 / 255, 230 / 255, 255 / 255, alphaF);
    const colRow = wgl.makeColor(230 / 255, 230 / 255, 230 / 255, alphaF * 0.7);
    const colLine = wgl.makeColor(
      COLOR_UI_ACCENT[0], COLOR_UI_ACCENT[1], COLOR_UI_ACCENT[2],
      alphaF * 0.7,
    );
    const iconTint = wgl.makeColor(1.0, 1.0, 1.0, alphaF);

    const leftCenterX = x + 36.0 * scale;
    const rightLabelX = x + 100.0 * scale;
    const rightCenterX = rightLabelX + 32.0 * scale;

    const scoreW = textWidth(font, 'Score');
    drawSmall(ctx, font, 'Score', new Vec2(leftCenterX - scoreW * 0.5, y), colLabel);
    const scoreValueW = textWidth(font, scoreValue);
    drawSmall(
      ctx, font, scoreValue,
      new Vec2(leftCenterX - scoreValueW * 0.5, y + 15.0 * scale),
      colScoreValue,
    );
    const rankLabel = `Rank: ${rankText}`;
    const rankW = textWidth(font, rankLabel);
    drawSmall(
      ctx, font, rankLabel,
      new Vec2(leftCenterX - rankW * 0.5, y + 30.0 * scale),
      colLabel,
    );

    // Experience column
    drawSmall(ctx, font, 'Experience', new Vec2(rightLabelX, y), colLine);
    const xpValueW = textWidth(font, xpValue);
    drawSmall(
      ctx, font, xpValue,
      new Vec2(rightCenterX - xpValueW * 0.5, y + 15.0 * scale),
      colLabel,
    );

    // Vertical separator
    const sepX = x + 84.0 * scale;
    ctx.drawRectangle(
      Math.floor(sepX), Math.floor(y),
      1, Math.floor(48.0 * scale),
      colLine[0], colLine[1], colLine[2], colLine[3],
    );

    // Horizontal separator
    const rowTop = y + 52.0 * scale;
    ctx.drawRectangle(
      Math.floor(x - 12.0 * scale), Math.floor(rowTop),
      Math.floor(192.0 * scale), 1,
      colLine[0], colLine[1], colLine[2], colLine[3],
    );
    if (!opts.showWeaponRow) return;

    const rowY = rowTop;
    const wicons = getTexture(resources, TextureId.UI_WICONS);
    const src = weaponIconSrc(wicons, record.mostUsedWeaponId);
    if (src !== null) {
      const dst = wgl.makeRectangle(x + 4.0 * scale, rowY, 64.0 * scale, 32.0 * scale);
      ctx.drawTexturePro(wicons, src, dst, wgl.makeVector2(0.0, 0.0), 0.0, iconTint);
    }

    const weaponId = record.mostUsedWeaponId as WeaponId;
    const weaponName = weaponDisplayName(weaponId, this.preserveBugs);
    const nameW = textWidth(font, weaponName);
    const nameX = Math.max(x + 4.0 * scale, leftCenterX - nameW * 0.5);
    drawSmall(ctx, font, weaponName, new Vec2(nameX, rowY + 32.0 * scale), colRow);

    const fragsText = `Frags: ${Math.floor(record.creatureKillCount)}`;
    drawSmall(ctx, font, fragsText, new Vec2(x + 114.0 * scale, rowY + 1.0 * scale), colRow);

    const fired = Math.max(0, Math.floor(record.shotsFired));
    const hit = Math.max(0, Math.min(Math.floor(record.shotsHit), fired));
    const ratio = fired > 0 ? Math.floor((hit * 100) / fired) : 0;
    const hitText = `Hit %: ${ratio}%`;
    drawSmall(ctx, font, hitText, new Vec2(x + 114.0 * scale, rowY + 15.0 * scale), colRow);

    // Bottom horizontal separator
    ctx.drawRectangle(
      Math.floor(x - 12.0 * scale), Math.floor(rowY + 48.0 * scale),
      Math.floor(192.0 * scale), 1,
      colLine[0], colLine[1], colLine[2], colLine[3],
    );
  }

  update(
    ctx: WebGLContext,
    dt: number,
    opts: {
      resources: RuntimeResources;
      playSfx?: ((id: SfxId) => void) | null;
      rng?: CrandLike | null;
      mouse?: { x: number; y: number } | null;
    },
  ): string | null {
    const dtS = Math.min(dt, 0.1);
    const dtMs = dtS * 1000.0;
    this._cursorPulseTime += dtS * 1.1;
    const mouse = opts.mouse ?? { x: InputState.mousePosition()[0], y: InputState.mousePosition()[1] };
    const playSfx = opts.playSfx ?? null;
    const resources = opts.resources;

    if (this.record === null || this.breakdown === null) return null;

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

    this._introMs = Math.min(PANEL_SLIDE_START_MS, this._introMs + dtMs);
    if (
      !this._panelOpenSfxPlayed &&
      playSfx !== null &&
      this._introMs >= PANEL_SLIDE_START_MS - 1e-3
    ) {
      playSfx(SfxId.UI_PANELCLICK);
      this._panelOpenSfxPlayed = true;
    }
    if (this._consumeEnter) {
      this._consumeEnter = false;
      InputState.wasKeyPressed(KEY_ENTER);
    }

    if (InputState.wasKeyPressed(KEY_ESCAPE)) {
      if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
      this._beginCloseTransition('main_menu');
      return null;
    }

    const qualifies = this.rank < TABLE_MAX;

    if (this.phase === 0) {
      let anim = this._breakdownAnim;
      if (anim === null) {
        this._breakdownAnim = QuestResultsBreakdownAnim.start();
        anim = this._breakdownAnim;
      }

      const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
      if (InputState.wasKeyPressed(KEY_SPACE) || click) {
        anim.setFinal(this.breakdown);
        if (qualifies) {
          this.phase = 1;
          this._armNameInputAfterControlRelease();
        } else {
          this.phase = 2;
        }
        return null;
      }

      const clinks = tickQuestResultsBreakdownAnim(anim, {
        frameDtMs: Math.floor(dtS * 1000.0),
        target: this.breakdown,
      });
      if (clinks > 0 && playSfx !== null) {
        playSfx(SfxId.UI_CLINK_01);
      }
      if (anim.done) {
        if (qualifies) {
          this.phase = 1;
          this._armNameInputAfterControlRelease();
        } else {
          this.phase = 2;
        }
      }
      return null;
    }

    if (this.phase === 1) {
      if (this._deferNameInputUntilControlsReleased) {
        flushTextInputEvents();
        InputState.wasKeyPressed(KEY_ENTER);
        if (!gameplayControlsHeld(this.config)) {
          this._deferNameInputUntilControlsReleased = false;
        }
        return null;
      }
      const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
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

      const screenW = ctx.screenWidth;
      const screenH = ctx.screenHeight;
      const scale = uiScale(screenW, screenH);
      const panelLayout = this._panelLayout(screenW, scale);
      const contentPos = panelLayout.topLeft.offset(QUEST_RESULTS_CONTENT_X * scale);
      const inputPos = contentPos.offset(0.0, 150.0 * scale);
      const okPos = inputPos.add(new Vec2(170.0 * scale, -8.0 * scale));
      const okW = buttonWidth(resources, this._okButton.label, { scale, forceWide: this._okButton.forceWide });
      const okClicked = buttonUpdate(this._okButton, { pos: okPos, width: okW, dtMs, mouse, click });

      if (okClicked || InputState.wasKeyPressed(KEY_ENTER)) {
        if (this.inputText.trim()) {
          if (playSfx !== null) playSfx(SfxId.UI_TYPEENTER);
          if (!this._saved) {
            // In WebGL port, actual saving is handled by the caller
            this._saved = true;
          }
          this.phase = 2;
          return null;
        }
        if (playSfx !== null) playSfx(SfxId.SHOCK_HIT_01);
      }
      return null;
    }

    if (this.phase === 2) {
      const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
      if (InputState.wasKeyPressed(KEY_ENTER)) {
        if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
        this._beginCloseTransition('play_again');
        return null;
      }
      if (InputState.wasKeyPressed(KEY_N)) {
        if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
        this._beginCloseTransition('play_next');
        return null;
      }
      if (InputState.wasKeyPressed(KEY_H)) {
        if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
        this._beginCloseTransition('high_scores');
        return null;
      }

      const screenW = ctx.screenWidth;
      const screenH = ctx.screenHeight;
      const scale = uiScale(screenW, screenH);
      const panelLayout = this._panelLayout(screenW, scale);
      const contentPos = panelLayout.topLeft.offset(QUEST_RESULTS_CONTENT_X * scale);
      const scoreCardPos = contentPos.offset(QUEST_RESULTS_SCORE_CARD_X_FROM_CONTENT * scale);

      let varC12 = panelLayout.topLeft.y + (qualifies ? 96.0 : 108.0) * scale;
      let varC14 = varC12 + 84.0 * scale;
      if (this.unlockWeaponName) {
        varC14 += 30.0 * scale;
      }
      if (this.unlockPerkName) {
        varC14 += 30.0 * scale;
      }

      let btnPos = new Vec2(scoreCardPos.x + 20.0 * scale, varC14 + 6.0 * scale);

      const playNextW = buttonWidth(resources, this._playNextButton.label, {
        scale,
        forceWide: this._playNextButton.forceWide,
      });
      if (buttonUpdate(this._playNextButton, { pos: btnPos, width: playNextW, dtMs, mouse, click })) {
        if (playSfx !== null) playSfx(SfxId.UI_BUTTONCLICK);
        this._beginCloseTransition('play_next');
        return null;
      }
      btnPos = btnPos.offset(0.0, 32.0 * scale);

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
      return null;
    }

    return null;
  }

  draw(
    ctx: WebGLContext,
    opts: {
      resources: RuntimeResources;
      mouse?: { x: number; y: number } | null;
    },
  ): void {
    if (this.record === null || this.breakdown === null) return;
    const mouse = opts.mouse ?? { x: InputState.mousePosition()[0], y: InputState.mousePosition()[1] };
    const resources = opts.resources;
    const font = resources.smallFont;

    const screenW = ctx.screenWidth;
    const screenH = ctx.screenHeight;
    const scale = uiScale(screenW, screenH);

    const panelLayout = this._panelLayout(screenW, scale);
    const panel = panelLayout.panel;

    const fxDetail = this.config.display.fxDetail[0] ?? false;
    drawClassicMenuPanel(
      ctx,
      getTexture(resources, TextureId.UI_MENU_PANEL),
      wgl.makeRectangle(panel.x, panel.y, panel.w, panel.h),
      wgl.makeColor(1, 1, 1, 1),
      fxDetail,
    );

    const contentPos = panelLayout.topLeft.offset(QUEST_RESULTS_CONTENT_X * scale);
    const bannerPos = contentPos.add(new Vec2(QUEST_RESULTS_BANNER_X_FROM_CONTENT * scale, 36.0 * scale));
    const textWellDone = getTexture(resources, TextureId.UI_TEXT_WELL_DONE);
    const bannerSrc = wgl.makeRectangle(0.0, 0.0, textWellDone.width, textWellDone.height);
    const bannerDst = wgl.makeRectangle(bannerPos.x, bannerPos.y, TEXTURE_TOP_BANNER_W * scale, TEXTURE_TOP_BANNER_H * scale);
    ctx.drawTexturePro(textWellDone, bannerSrc, bannerDst, wgl.makeVector2(0.0, 0.0), 0.0, wgl.makeColor(1, 1, 1, 1));

    const qualifies = this.rank < TABLE_MAX;

    if (this.phase === 0) {
      const labelX = contentPos.x + 32.0 * scale;
      const valueX = labelX + 132.0 * scale;

      const anim = this._breakdownAnim;
      let step = 4;
      let highlightAlpha = 1.0;
      let baseTimeMs = Math.floor(this.breakdown.baseTimeMs);
      let lifeBonusMs = Math.floor(this.breakdown.lifeBonusMs);
      let perkBonusMs = Math.floor(this.breakdown.unpickedPerkBonusMs);
      let finalTimeMs = Math.floor(this.breakdown.finalTimeMs);
      if (anim !== null && !anim.done) {
        step = anim.step;
        highlightAlpha = anim.highlightAlpha();
        baseTimeMs = anim.baseTimeMs;
        lifeBonusMs = anim.lifeBonusMs;
        perkBonusMs = anim.unpickedPerkBonusS * 1000;
        finalTimeMs = anim.finalTimeMs;
      }

      const rowColor = (idx: number, final = false): wgl.Color => {
        if (anim === null || anim.done) return COLOR_TEXT;
        let a = 0.2;
        if (idx < step) {
          a = 0.4;
        } else if (idx === step) {
          a = 1.0;
          if (final) a *= highlightAlpha;
        }
        let rgb: [number, number, number] = [1.0, 1.0, 1.0];
        if (idx === step) {
          rgb = [COLOR_GREEN[0], COLOR_GREEN[1], COLOR_GREEN[2]];
        }
        return wgl.makeColor(rgb[0], rgb[1], rgb[2], Math.max(0.0, Math.min(1.0, a)));
      };

      let y = panelLayout.topLeft.y + 156.0 * scale;
      const baseValue = formatTimeMmSs(baseTimeMs);
      const lifeValue = formatTimeMmSs(lifeBonusMs);
      const perkValue = formatTimeMmSs(perkBonusMs);
      const finalValue = formatTimeMmSs(finalTimeMs);

      drawSmall(ctx, font, 'Base Time:', new Vec2(labelX, y), rowColor(0));
      drawSmall(ctx, font, baseValue, new Vec2(valueX, y), rowColor(0));
      y += 20.0 * scale;

      drawSmall(ctx, font, 'Life Bonus:', new Vec2(labelX, y), rowColor(1));
      drawSmall(ctx, font, lifeValue, new Vec2(valueX, y), rowColor(1));
      y += 20.0 * scale;

      drawSmall(ctx, font, 'Unpicked Perk Bonus:', new Vec2(labelX, y), rowColor(2));
      drawSmall(ctx, font, perkValue, new Vec2(valueX, y), rowColor(2));
      y += 20.0 * scale;

      // Final time underline
      const lineY = y + 1.0 * scale;
      const lineColor = rowColor(3, true);
      ctx.drawRectangle(
        Math.floor(labelX - 4.0 * scale), Math.floor(lineY),
        Math.floor(168.0 * scale), Math.floor(1.0 * scale),
        lineColor[0], lineColor[1], lineColor[2], lineColor[3],
      );

      y += 8.0 * scale;
      drawSmall(ctx, font, 'Final Time:', new Vec2(labelX, y), rowColor(3, true));
      drawSmall(ctx, font, finalValue, new Vec2(valueX, y), rowColor(3, true));

    } else if (this.phase === 1) {
      const textY = panelLayout.topLeft.y + 118.0 * scale;
      const namePrompt = this.preserveBugs ? 'State your name trooper!' : 'State your name, trooper!';
      drawSmall(
        ctx, font, namePrompt,
        new Vec2(contentPos.x + 42.0 * scale, textY),
        COLOR_UI_ACCENT,
      );

      const inputPos = contentPos.offset(0.0, 150.0 * scale);
      // Input box outline
      ctx.drawRectangle(
        Math.floor(inputPos.x), Math.floor(inputPos.y),
        Math.floor(INPUT_BOX_W * scale), 1,
        1, 1, 1, 1,
      );
      ctx.drawRectangle(
        Math.floor(inputPos.x), Math.floor(inputPos.y + INPUT_BOX_H * scale - 1),
        Math.floor(INPUT_BOX_W * scale), 1,
        1, 1, 1, 1,
      );
      ctx.drawRectangle(
        Math.floor(inputPos.x), Math.floor(inputPos.y),
        1, Math.floor(INPUT_BOX_H * scale),
        1, 1, 1, 1,
      );
      ctx.drawRectangle(
        Math.floor(inputPos.x + INPUT_BOX_W * scale - 1), Math.floor(inputPos.y),
        1, Math.floor(INPUT_BOX_H * scale),
        1, 1, 1, 1,
      );
      // Input box fill
      ctx.drawRectangle(
        Math.floor(inputPos.x + 1.0 * scale), Math.floor(inputPos.y + 1.0 * scale),
        Math.floor((INPUT_BOX_W - 2.0) * scale), Math.floor((INPUT_BOX_H - 2.0) * scale),
        0, 0, 0, 1,
      );
      drawUiText(
        ctx, resources, this.inputText,
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
      ctx.drawRectangle(
        Math.floor(caretX), Math.floor(inputPos.y + 2.0 * scale),
        Math.floor(1.0 * scale), Math.floor(14.0 * scale),
        caretColor[0], caretColor[1], caretColor[2], caretColor[3],
      );

      const okPos = inputPos.add(new Vec2(170.0 * scale, -8.0 * scale));
      const okW = buttonWidth(resources, this._okButton.label, { scale, forceWide: this._okButton.forceWide });
      buttonDraw(ctx, resources, this._okButton, { pos: okPos, width: okW, scale });

      // Score card during name entry
      const scoreCardPos = inputPos.add(new Vec2(26.0 * scale, 46.0 * scale));
      this._drawNameEntryStats(ctx, {
        pos: scoreCardPos,
        scale,
        alpha: 1.0,
        showWeaponRow: true,
        resources,
        font,
      });

    } else {
      // Phase 2: results/buttons
      const scoreCardPos = contentPos.offset(QUEST_RESULTS_SCORE_CARD_X_FROM_CONTENT * scale);
      let varC12 = panelLayout.topLeft.y + (qualifies ? 96.0 : 108.0) * scale;
      if (!qualifies) {
        drawSmall(
          ctx, font,
          'Score too low for top100.',
          new Vec2(scoreCardPos.x + 8.0 * scale, panelLayout.topLeft.y + 102.0 * scale),
          wgl.makeColor(200 / 255, 200 / 255, 200 / 255, 1.0),
        );
      }

      const cardY = varC12 + 16.0 * scale;
      this._drawNameEntryStats(ctx, {
        pos: new Vec2(scoreCardPos.x, cardY),
        scale,
        alpha: 1.0,
        showWeaponRow: false,
        resources,
        font,
      });

      // Unlock lines
      let varC14 = varC12 + 84.0 * scale;
      if (this.unlockWeaponName) {
        drawSmall(
          ctx, font,
          'Weapon unlocked:',
          new Vec2(scoreCardPos.x, varC14 + 1.0 * scale),
          COLOR_TEXT_SUBTLE,
        );
        drawSmall(
          ctx, font,
          this.unlockWeaponName,
          new Vec2(scoreCardPos.x, varC14 + 14.0 * scale),
          COLOR_TEXT,
        );
        varC14 += 30.0 * scale;
      }
      if (this.unlockPerkName) {
        drawSmall(
          ctx, font,
          'Perk unlocked:',
          new Vec2(scoreCardPos.x, varC14 + 1.0 * scale),
          COLOR_TEXT_SUBTLE,
        );
        drawSmall(
          ctx, font,
          this.unlockPerkName,
          new Vec2(scoreCardPos.x, varC14 + 14.0 * scale),
          COLOR_TEXT,
        );
        varC14 += 30.0 * scale;
      }

      // Buttons
      let btnPos = new Vec2(scoreCardPos.x + 20.0 * scale, varC14 + 6.0 * scale);
      const playNextW = buttonWidth(resources, this._playNextButton.label, {
        scale,
        forceWide: this._playNextButton.forceWide,
      });
      buttonDraw(ctx, resources, this._playNextButton, { pos: btnPos, width: playNextW, scale });
      btnPos = btnPos.offset(0.0, 32.0 * scale);

      const playAgainW = buttonWidth(resources, this._playAgainButton.label, {
        scale,
        forceWide: this._playAgainButton.forceWide,
      });
      buttonDraw(ctx, resources, this._playAgainButton, { pos: btnPos, width: playAgainW, scale });
      btnPos = btnPos.offset(0.0, 32.0 * scale);

      const highScoresW = buttonWidth(resources, this._highScoresButton.label, {
        scale,
        forceWide: this._highScoresButton.forceWide,
      });
      buttonDraw(ctx, resources, this._highScoresButton, { pos: btnPos, width: highScoresW, scale });
      btnPos = btnPos.offset(0.0, 32.0 * scale);

      const mainMenuW = buttonWidth(resources, this._mainMenuButton.label, {
        scale,
        forceWide: this._mainMenuButton.forceWide,
      });
      buttonDraw(ctx, resources, this._mainMenuButton, { pos: btnPos, width: mainMenuW, scale });
    }

    drawMenuCursor(
      ctx,
      getTexture(resources, TextureId.PARTICLES),
      getTexture(resources, TextureId.UI_CURSOR),
      new Vec2(mouse.x, mouse.y),
      this._cursorPulseTime,
    );
  }
}
