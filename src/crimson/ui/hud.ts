// Port of crimson/ui/hud.py

import * as wgl from '@wgl';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { RGBA } from '@grim/color.ts';
import { Vec2 } from '@grim/geom.ts';
import { drawSmallText, SmallFontData } from '@grim/fonts/small.ts';
import { type BonusHudState } from '@crimson/bonuses/hud.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { survivalLevelThreshold } from '@crimson/gameplay.ts';
import { type PlayerState } from '@crimson/sim/state-types.ts';
import { WEAPON_BY_ID, WeaponId, weaponDisplayName } from '@crimson/weapons.ts';

// ---------------------------------------------------------------------------
// Color constants (0..1 float tuples)
// ---------------------------------------------------------------------------

const HUD_TEXT_COLOR = wgl.makeColor(220 / 255, 220 / 255, 220 / 255, 1.0);
const HUD_HINT_COLOR = wgl.makeColor(170 / 255, 170 / 255, 180 / 255, 1.0);
const HUD_ACCENT_COLOR = wgl.makeColor(240 / 255, 200 / 255, 80 / 255, 1.0);

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const HUD_BASE_WIDTH = 1024.0;
const HUD_BASE_HEIGHT = 768.0;

const HUD_TOP_BAR_ALPHA = 0.7;
const HUD_ICON_ALPHA = 0.8;
const HUD_PANEL_ALPHA = 0.9;
const HUD_HEALTH_BG_ALPHA = 0.5;
const HUD_AMMO_DIM_ALPHA = 0.3;

const HUD_TOP_BAR_POS: [number, number] = [0.0, 0.0];
const HUD_TOP_BAR_SIZE: [number, number] = [512.0, 64.0];
const HUD_HEART_CENTER: [number, number] = [27.0, 21.0];
const HUD_HEALTH_BAR_POS: [number, number] = [64.0, 16.0];
const HUD_HEALTH_BAR_SIZE: [number, number] = [120.0, 9.0];
const HUD_WEAPON_ICON_POS: [number, number] = [220.0, 2.0];
const HUD_WEAPON_ICON_SIZE: [number, number] = [64.0, 32.0];
const HUD_CLOCK_POS: [number, number] = [220.0, 2.0];
const HUD_CLOCK_SIZE: [number, number] = [32.0, 32.0];
const HUD_CLOCK_ALPHA = 0.9;
const HUD_AMMO_BASE_POS: [number, number] = [300.0, 10.0];
const HUD_AMMO_BAR_SIZE: [number, number] = [6.0, 16.0];
const HUD_AMMO_BAR_STEP = 6.0;
const HUD_AMMO_BAR_LIMIT = 30;
const HUD_AMMO_BAR_CLAMP = 20;
const HUD_AMMO_TEXT_OFFSET: [number, number] = [8.0, 1.0];
const HUD_SURV_PANEL_POS: [number, number] = [-68.0, 60.0];
const HUD_SURV_PANEL_SIZE: [number, number] = [182.0, 53.0];
const HUD_SURV_XP_LABEL_POS: [number, number] = [4.0, 78.0];
const HUD_SURV_XP_VALUE_POS: [number, number] = [26.0, 74.0];
const HUD_SURV_LVL_VALUE_POS: [number, number] = [85.0, 79.0];
const HUD_SURV_PROGRESS_POS: [number, number] = [26.0, 91.0];
const HUD_SURV_PROGRESS_WIDTH = 54.0;
const HUD_BONUS_BASE_Y = 121.0;
const HUD_BONUS_ICON_SIZE = 32.0;
const HUD_BONUS_TEXT_OFFSET: [number, number] = [36.0, 6.0];
const HUD_BONUS_SPACING = 52.0;
const HUD_BONUS_PANEL_OFFSET_Y = -11.0;
const HUD_XP_BAR_RGBA = new RGBA(0.1, 0.3, 0.6, 1.0);
const HUD_QUEST_LEFT_Y_SHIFT = 80.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HudRenderFlags {
  readonly showHealth: boolean;
  readonly showWeapon: boolean;
  readonly showXp: boolean;
  readonly showTime: boolean;
  readonly showQuestHud: boolean;
}

export interface HudRenderContext {
  readonly resources: RuntimeResources;
  readonly state: HudState;
  readonly font: SmallFontData | null;
  readonly alpha: number;
  readonly showHealth: boolean;
  readonly showWeapon: boolean;
  readonly showXp: boolean;
  readonly showTime: boolean;
  readonly showQuestHud: boolean;
  readonly smallIndicators: boolean;
}

export class HudState {
  survivalXpSmoothed = 0;
  preserveBugs = false;

  smoothXp(target: number, frameDtMs: number): number {
    target = int(target);
    if (target <= 0) {
      this.survivalXpSmoothed = 0;
      return 0;
    }

    let smoothed = int(this.survivalXpSmoothed);
    if (smoothed === target) {
      return smoothed;
    }

    let step = Math.max(1, int(frameDtMs) >> 1);
    const diff = Math.abs(smoothed - target);
    if (diff > 1000) {
      step *= (diff / 100) | 0;
    }

    if (smoothed < target) {
      smoothed += step;
      if (smoothed > target) {
        smoothed = target;
      }
    } else {
      smoothed -= step;
      if (smoothed < target) {
        smoothed = target;
      }
    }

    this.survivalXpSmoothed = smoothed;
    return smoothed;
  }
}

export interface HudLayout {
  readonly scale: number;
  readonly textScale: number;
  readonly lineH: number;
  readonly hudYShift: number;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function hudFlagsForGameMode(gameModeId: GameMode): HudRenderFlags {
  switch (gameModeId) {
    case GameMode.QUESTS:
      return {
        showHealth: true,
        showWeapon: true,
        showXp: true,
        showTime: false,
        showQuestHud: true,
      };
    case GameMode.SURVIVAL:
      return {
        showHealth: true,
        showWeapon: true,
        showXp: true,
        showTime: false,
        showQuestHud: false,
      };
    case GameMode.RUSH:
      return {
        showHealth: true,
        showWeapon: false,
        showXp: false,
        showTime: true,
        showQuestHud: false,
      };
    case GameMode.TYPO:
      return {
        showHealth: true,
        showWeapon: false,
        showXp: true,
        showTime: true,
        showQuestHud: false,
      };
    default:
      return {
        showHealth: false,
        showWeapon: false,
        showXp: false,
        showTime: false,
        showQuestHud: false,
      };
  }
}

export function hudUiScale(screenW: number, screenH: number): number {
  const scale = Math.min(screenW / HUD_BASE_WIDTH, screenH / HUD_BASE_HEIGHT);
  if (scale < 0.75) return 0.75;
  if (scale > 1.5) return 1.5;
  return scale;
}

export function hudLayout(
  screenW: number,
  screenH: number,
  opts: { font: SmallFontData | null; showQuestHud: boolean },
): HudLayout {
  const scale = hudUiScale(screenW, screenH);
  const textScale = 1.0 * scale;
  const lineH = opts.font !== null ? opts.font.cellSize * textScale : 18.0 * textScale;
  const hudYShift = opts.showQuestHud ? HUD_QUEST_LEFT_Y_SHIFT : 0.0;
  return { scale, textScale, lineH, hudYShift };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _drawText(
  font: SmallFontData | null,
  text: string,
  pos: Vec2,
  _scale: number,
  color: wgl.Color,
): void {
  if (font !== null) {
    drawSmallText(font, text, pos, color);
  }
  // No rl.draw_text fallback in WebGL — skip if font is null.
}

function _withAlpha(
  color: wgl.Color,
  alpha: number,
): wgl.Color {
  alpha = Math.max(0.0, Math.min(1.0, alpha));
  return wgl.makeColor(color[0], color[1], color[2], color[3] * alpha);
}

function _questPanelSlideX(timeMs: number): number {
  timeMs = Number(timeMs);
  if (timeMs < 1000.0) {
    return (1000.0 - timeMs) * -0.128;
  }
  return 0.0;
}

function _survivalXpProgressRatio(xp: number, level: number): number {
  level = Math.max(1, int(level));
  const prevThreshold = level <= 1 ? 0 : survivalLevelThreshold(level - 1);
  const nextThreshold = survivalLevelThreshold(level);
  if (nextThreshold <= prevThreshold) return 0.0;
  return (int(xp) - prevThreshold) / (nextThreshold - prevThreshold);
}

function _drawProgressBar(
  pos: Vec2,
  width: number,
  ratio: number,
  rgba: RGBA,
  scale: number,
): void {
  ratio = Math.max(0.0, Math.min(1.0, ratio));
  width = Math.max(0.0, width);
  if (width <= 0.0) return;
  rgba = rgba.clamped();
  const barH = 4.0 * scale;
  const innerH = 2.0 * scale;
  // Background color
  const bgR = rgba.r * 0.6;
  const bgG = rgba.g * 0.6;
  const bgB = rgba.b * 0.6;
  const bgA = rgba.a * 0.4;
  // Foreground color
  const fgR = rgba.r;
  const fgG = rgba.g;
  const fgB = rgba.b;
  const fgA = rgba.a;
  wgl.drawRectangle(
    int(pos.x),
    int(pos.y),
    int(width),
    int(barH),
    wgl.makeColor(bgR, bgG, bgB, bgA),
  );
  const innerW = Math.max(0.0, (width - 2.0 * scale) * ratio);
  wgl.drawRectangle(
    int(pos.x + scale),
    int(pos.y + scale),
    int(innerW),
    int(innerH),
    wgl.makeColor(fgR, fgG, fgB, fgA),
  );
}

export function drawTargetHealthBar(
  opts: { pos: Vec2; width: number; ratio: number; alpha?: number; scale?: number },
): void {
  let ratio = Math.max(0.0, Math.min(1.0, opts.ratio));
  let alpha = Math.max(0.0, Math.min(1.0, opts.alpha ?? 1.0));
  let scale = Math.max(0.1, opts.scale ?? 1.0);

  const r = (1.0 - ratio) * 0.9 + 0.1;
  const g = ratio * 0.9 + 0.1;
  const rgba = new RGBA(r, g, 0.7, 0.2 * alpha);
  _drawProgressBar(opts.pos, opts.width, ratio, rgba, scale);
}

function _weaponIconIndex(weaponId: number): number | null {
  const entry = WEAPON_BY_ID.get(weaponId as WeaponId);
  if (!entry) return null;
  const iconIndex = int(entry.iconIndex);
  if (iconIndex < 0 || iconIndex > 31) return null;
  return iconIndex;
}

function _weaponAmmoClass(weaponId: number): number {
  const entry = WEAPON_BY_ID.get(weaponId as WeaponId);
  if (!entry) return 0;
  const value = entry.ammoClass;
  return value !== null ? int(value) : 0;
}

function _weaponIconSrc(
  texture: wgl.Texture,
  iconIndex: number,
): wgl.Rectangle {
  const grid = 8;
  const cellW = texture.width / grid;
  const cellH = texture.height / grid;
  const frame = int(iconIndex) * 2;
  const col = frame % grid;
  const row = (frame / grid) | 0;
  return wgl.makeRectangle(col * cellW, row * cellH, cellW * 2, cellH);
}

function _bonusIconSrc(
  texture: wgl.Texture,
  iconId: number,
): wgl.Rectangle {
  const grid = 4;
  const cellW = texture.width / grid;
  const cellH = texture.height / grid;
  const col = int(iconId) % grid;
  const row = (int(iconId) / grid) | 0;
  return wgl.makeRectangle(col * cellW, row * cellH, cellW, cellH);
}

// ---------------------------------------------------------------------------
// Main HUD overlay
// ---------------------------------------------------------------------------

export function drawHudOverlay(
  context: HudRenderContext,
  options: {
    player: PlayerState;
    players?: PlayerState[] | null;
    bonusHud?: BonusHudState | null;
    elapsedMs?: number;
    score?: number | null;
    frameDtMs?: number | null;
    questProgressRatio?: number | null;
  },
): number {
  const resources = context.resources;
  const state = context.state;
  const font = context.font;
  let alpha = Number(context.alpha);
  const showHealth = Boolean(context.showHealth);
  const showWeapon = Boolean(context.showWeapon);
  const showXp = Boolean(context.showXp);
  const showTime = Boolean(context.showTime);
  const showQuestHud = Boolean(context.showQuestHud);
  const smallIndicators = Boolean(context.smallIndicators);

  const player = options.player;
  const players = options.players ?? null;
  const bonusHud = options.bonusHud ?? null;
  const elapsedMs = options.elapsedMs ?? 0.0;
  const score = options.score ?? null;
  let frameDtMs = options.frameDtMs ?? null;
  const questProgressRatio = options.questProgressRatio ?? null;

  const gameTop = getTexture(resources, TextureId.UI_GAME_TOP);
  const lifeHeart = getTexture(resources, TextureId.UI_LIFE_HEART);
  const indLife = getTexture(resources, TextureId.UI_IND_LIFE);
  const indPanel = getTexture(resources, TextureId.UI_IND_PANEL);
  const indBullet = getTexture(resources, TextureId.UI_IND_BULLET);
  const indFire = getTexture(resources, TextureId.UI_IND_FIRE);
  const indRocket = getTexture(resources, TextureId.UI_IND_ROCKET);
  const indElectric = getTexture(resources, TextureId.UI_IND_ELECTRIC);
  const wicons = getTexture(resources, TextureId.UI_WICONS);
  const clockTable = getTexture(resources, TextureId.UI_CLOCK_TABLE);
  const clockPointer = getTexture(resources, TextureId.UI_CLOCK_POINTER);
  const bonusesTexture = getTexture(resources, TextureId.BONUSES);

  if (frameDtMs === null) {
    frameDtMs = 16.0; // ~60fps fallback
  }
  const hudPlayers: PlayerState[] =
    players !== null && players.length > 0 ? [...players] : [player];
  const playerCount = hudPlayers.length;

  const screenW = wgl.getScreenWidth();
  const screenH = wgl.getScreenHeight();
  const layout = hudLayout(screenW, screenH, { font, showQuestHud });
  const scale = layout.scale;
  const textScale = layout.textScale;
  const lineH = layout.lineH;

  function ui(value: number): number {
    return value * scale;
  }

  let maxY = 0.0;
  alpha = Math.max(0.0, Math.min(1.0, alpha));
  const textColor = _withAlpha(HUD_TEXT_COLOR, alpha);
  const panelTextColor = _withAlpha(HUD_TEXT_COLOR, alpha * HUD_PANEL_ALPHA);
  const hudYShift = layout.hudYShift;

  // -----------------------------------------------------------------------
  // Top bar background.
  // -----------------------------------------------------------------------
  {
    const src = wgl.makeRectangle(0.0, 0.0, gameTop.width, gameTop.height);
    const dst = wgl.makeRectangle(
      ui(HUD_TOP_BAR_POS[0]),
      ui(HUD_TOP_BAR_POS[1]),
      ui(HUD_TOP_BAR_SIZE[0]),
      ui(HUD_TOP_BAR_SIZE[1]),
    );
    const topAlpha = alpha * HUD_TOP_BAR_ALPHA;
    wgl.drawTexturePro(
      gameTop,
      src,
      dst,
      wgl.makeVector2(0, 0),
      0.0,
      wgl.makeColor(1.0, 1.0, 1.0, topAlpha),
    );
    maxY = Math.max(maxY, dst[1] + dst[3]);
  }

  // -----------------------------------------------------------------------
  // Pulsing heart.
  // -----------------------------------------------------------------------
  if (showHealth) {
    const t = Math.max(0.0, elapsedMs) / 1000.0;
    const src = wgl.makeRectangle(0.0, 0.0, lifeHeart.width, lifeHeart.height);
    let heartCenterBase: Vec2;
    let heartStep: Vec2;
    let heartScale: number;
    if (playerCount === 1) {
      heartCenterBase = new Vec2(HUD_HEART_CENTER[0], HUD_HEART_CENTER[1]);
      heartStep = new Vec2();
      heartScale = 1.0;
    } else {
      heartCenterBase = new Vec2(27.0, 12.0);
      heartStep = new Vec2(0.0, 15.0);
      heartScale = 0.5;
    }
    const player0LowHealth = playerCount > 0 && hudPlayers[0].health < 30.0;

    for (let idx = 0; idx < hudPlayers.length; idx++) {
      const hudPlayer = hudPlayers[idx];
      let pulseSpeed = hudPlayer.health < 30.0 ? 5.0 : 2.0;
      if (state.preserveBugs && playerCount > 1 && idx > 0 && player0LowHealth) {
        // Native 2-player HUD uses player 1 low-health pulse speed as a
        // shared baseline for later player heart pulses.
        pulseSpeed = 5.0;
      }
      const phase = idx * (Math.PI * 0.5);
      const pulse = (Math.pow(Math.sin(t * pulseSpeed + phase), 4) * 4.0 + 14.0) * heartScale;
      const size = pulse * 2.0;
      const center = heartCenterBase.add(heartStep.mul(idx));
      const dst = wgl.makeRectangle(
        ui(center.x - pulse),
        ui(center.y - pulse),
        ui(size),
        ui(size),
      );
      wgl.drawTexturePro(
        lifeHeart,
        src,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, alpha * HUD_ICON_ALPHA),
      );
      maxY = Math.max(maxY, dst[1] + dst[3]);
    }
  }

  // -----------------------------------------------------------------------
  // Health bar.
  // -----------------------------------------------------------------------
  if (showHealth) {
    let barBasePos = new Vec2(HUD_HEALTH_BAR_POS[0], HUD_HEALTH_BAR_POS[1]);
    const barSize = new Vec2(HUD_HEALTH_BAR_SIZE[0], HUD_HEALTH_BAR_SIZE[1]);
    const bgSrc = wgl.makeRectangle(0.0, 0.0, indLife.width, indLife.height);
    if (playerCount > 1) {
      barBasePos = new Vec2(barBasePos.x, 6.0);
    }

    for (let idx = 0; idx < hudPlayers.length; idx++) {
      const hudPlayer = hudPlayers[idx];
      const barPos = barBasePos.offset({ dy: playerCount > 1 ? idx * 16.0 : 0.0 });
      const bgDst = wgl.makeRectangle(
        ui(barPos.x),
        ui(barPos.y),
        ui(barSize.x),
        ui(barSize.y),
      );
      wgl.drawTexturePro(
        indLife,
        bgSrc,
        bgDst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, alpha * HUD_HEALTH_BG_ALPHA),
      );
      const healthRatio = Math.max(0.0, Math.min(1.0, hudPlayer.health / 100.0));
      if (healthRatio > 0.0) {
        const fillW = barSize.x * healthRatio;
        const fillDst = wgl.makeRectangle(
          ui(barPos.x),
          ui(barPos.y),
          ui(fillW),
          ui(barSize.y),
        );
        const fillSrc = wgl.makeRectangle(
          0.0,
          0.0,
          indLife.width * healthRatio,
          indLife.height,
        );
        wgl.drawTexturePro(
          indLife,
          fillSrc,
          fillDst,
          wgl.makeVector2(0, 0),
          0.0,
          wgl.makeColor(1.0, 1.0, 1.0, alpha * HUD_ICON_ALPHA),
        );
      }
      maxY = Math.max(maxY, bgDst[1] + bgDst[3]);
    }
  }

  // -----------------------------------------------------------------------
  // Weapon icon.
  // -----------------------------------------------------------------------
  if (showWeapon) {
    let iconBasePos: Vec2;
    let iconSize: Vec2;
    let iconStep: Vec2;
    if (playerCount === 1) {
      iconBasePos = new Vec2(HUD_WEAPON_ICON_POS[0], HUD_WEAPON_ICON_POS[1]);
      iconSize = new Vec2(HUD_WEAPON_ICON_SIZE[0], HUD_WEAPON_ICON_SIZE[1]);
      iconStep = new Vec2();
    } else {
      iconBasePos = new Vec2(220.0, 4.0);
      iconSize = new Vec2(32.0, 16.0);
      iconStep = new Vec2(0.0, 16.0);
    }

    for (let idx = 0; idx < hudPlayers.length; idx++) {
      const hudPlayer = hudPlayers[idx];
      const iconIndex = _weaponIconIndex(hudPlayer.weapon.weaponId);
      if (iconIndex === null) continue;
      const src = _weaponIconSrc(wicons, iconIndex);
      const iconPos = iconBasePos.add(iconStep.mul(idx));
      const dst = wgl.makeRectangle(
        ui(iconPos.x),
        ui(iconPos.y),
        ui(iconSize.x),
        ui(iconSize.y),
      );
      wgl.drawTexturePro(
        wicons,
        src,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, alpha * HUD_ICON_ALPHA),
      );
      maxY = Math.max(maxY, dst[1] + dst[3]);
    }
  }

  // -----------------------------------------------------------------------
  // Ammo bars.
  // -----------------------------------------------------------------------
  if (showWeapon) {
    let ammoBasePos: Vec2;
    let ammoStep: Vec2;
    if (playerCount === 1) {
      ammoBasePos = new Vec2(HUD_AMMO_BASE_POS[0], HUD_AMMO_BASE_POS[1]);
      ammoStep = new Vec2();
    } else {
      ammoBasePos = new Vec2(290.0, 4.0);
      ammoStep = new Vec2(0.0, 14.0);
    }

    const baseAlpha = alpha * HUD_ICON_ALPHA;
    for (let playerIdx = 0; playerIdx < hudPlayers.length; playerIdx++) {
      const hudPlayer = hudPlayers[playerIdx];
      const ammoClass = _weaponAmmoClass(hudPlayer.weapon.weaponId);
      let ammoTex: wgl.Texture;
      if (ammoClass === 1) {
        ammoTex = indFire;
      } else if (ammoClass === 2) {
        ammoTex = indRocket;
      } else if (ammoClass === 0) {
        ammoTex = indBullet;
      } else {
        ammoTex = indElectric;
      }

      const playerAmmoBase = ammoBasePos.add(ammoStep.mul(playerIdx));
      let bars = Math.max(0, int(hudPlayer.weapon.clipSize));
      if (bars > HUD_AMMO_BAR_LIMIT) {
        bars = HUD_AMMO_BAR_CLAMP;
      }
      const ammoCount = Math.max(0, int(hudPlayer.weapon.ammo));
      for (let barIdx = 0; barIdx < bars; barIdx++) {
        const barAlpha = barIdx < ammoCount ? baseAlpha : baseAlpha * HUD_AMMO_DIM_ALPHA;
        const barPos = playerAmmoBase.offset({ dx: barIdx * HUD_AMMO_BAR_STEP });
        const dst = wgl.makeRectangle(
          ui(barPos.x),
          ui(barPos.y),
          ui(HUD_AMMO_BAR_SIZE[0]),
          ui(HUD_AMMO_BAR_SIZE[1]),
        );
        const src = wgl.makeRectangle(0.0, 0.0, ammoTex.width, ammoTex.height);
        wgl.drawTexturePro(
          ammoTex,
          src,
          dst,
          wgl.makeVector2(0, 0),
          0.0,
          wgl.makeColor(1.0, 1.0, 1.0, barAlpha),
        );
        maxY = Math.max(maxY, dst[1] + dst[3]);
      }
      if (ammoCount > bars) {
        const extra = ammoCount - bars;
        const textPos = playerAmmoBase.add(
          new Vec2(
            bars * HUD_AMMO_BAR_STEP + HUD_AMMO_TEXT_OFFSET[0],
            HUD_AMMO_TEXT_OFFSET[1],
          ),
        );
        _drawText(
          font,
          `+ ${extra}`,
          new Vec2(ui(textPos.x), ui(textPos.y)),
          textScale,
          textColor,
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Quest HUD panels (mm:ss timer + progress).
  // -----------------------------------------------------------------------
  if (showQuestHud) {
    const timeMs = Math.max(0.0, elapsedMs);
    const slideX = _questPanelSlideX(timeMs);

    const questPanelAlpha = alpha * 0.7;
    const questTextColor = _withAlpha(HUD_TEXT_COLOR, questPanelAlpha);

    const panelSrc = wgl.makeRectangle(0.0, 0.0, indPanel.width, indPanel.height);

    // Sliding top panel (first second).
    const slidePanelPos = new Vec2(slideX - 90.0, 67.0);
    const slidePanelSize = new Vec2(182.0, 53.0);
    {
      const dst = wgl.makeRectangle(
        ui(slidePanelPos.x),
        ui(slidePanelPos.y),
        ui(slidePanelSize.x),
        ui(slidePanelSize.y),
      );
      wgl.drawTexturePro(
        indPanel,
        panelSrc,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, questPanelAlpha),
      );
      maxY = Math.max(maxY, dst[1] + dst[3]);
    }

    // Static progress panel.
    {
      const progressPanelPos = new Vec2(-80.0, 107.0);
      const progressPanelSize = new Vec2(182.0, 53.0);
      const dst = wgl.makeRectangle(
        ui(progressPanelPos.x),
        ui(progressPanelPos.y),
        ui(progressPanelSize.x),
        ui(progressPanelSize.y),
      );
      wgl.drawTexturePro(
        indPanel,
        panelSrc,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, questPanelAlpha),
      );
      maxY = Math.max(maxY, dst[1] + dst[3]);
    }

    // Clock table + pointer inside the sliding panel.
    {
      const clockAlpha = alpha * HUD_CLOCK_ALPHA;
      const clockTablePos = new Vec2(slideX + 2.0, 78.0);
      const clockSz = new Vec2(32.0, 32.0);
      const dst = wgl.makeRectangle(
        ui(clockTablePos.x),
        ui(clockTablePos.y),
        ui(clockSz.x),
        ui(clockSz.y),
      );
      const src = wgl.makeRectangle(0.0, 0.0, clockTable.width, clockTable.height);
      wgl.drawTexturePro(
        clockTable,
        src,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, clockAlpha),
      );

      // NOTE: Raylib's draw_texture_pro uses dst.x/y as the rotation origin position;
      // offset by half-size so the 32x32 quad stays aligned with the table.
      const clockPointerPos = new Vec2(slideX + 18.0, 94.0);
      const dst2 = wgl.makeRectangle(
        ui(clockPointerPos.x),
        ui(clockPointerPos.y),
        ui(clockSz.x),
        ui(clockSz.y),
      );
      const src2 = wgl.makeRectangle(0.0, 0.0, clockPointer.width, clockPointer.height);
      const rotation = timeMs / 1000.0 * 6.0;
      const origin = wgl.makeVector2(ui(16.0), ui(16.0));
      wgl.drawTexturePro(
        clockPointer,
        src2,
        dst2,
        origin,
        rotation,
        wgl.makeColor(1.0, 1.0, 1.0, clockAlpha),
      );
    }

    {
      const totalSeconds = Math.max(0, (timeMs / 1000) | 0);
      const minutes = (totalSeconds / 60) | 0;
      const seconds = totalSeconds % 60;
      const timeTextPos = new Vec2(slideX + 32.0, 86.0);
      const secondsStr = seconds < 10 ? `0${seconds}` : `${seconds}`;
      _drawText(
        font,
        `${minutes}:${secondsStr}`,
        new Vec2(ui(timeTextPos.x), ui(timeTextPos.y)),
        textScale,
        questTextColor,
      );
    }

    {
      const progressLabelPos = new Vec2(18.0, 122.0);
      _drawText(
        font,
        'Progress',
        new Vec2(ui(progressLabelPos.x), ui(progressLabelPos.y)),
        textScale,
        questTextColor,
      );
    }

    if (questProgressRatio !== null) {
      const ratio = Math.max(0.0, Math.min(1.0, questProgressRatio));
      const questBarRgba = new RGBA(0.2, 0.8, 0.3, alpha * 0.8);
      const progressBarPos = new Vec2(10.0, 139.0);
      _drawProgressBar(
        new Vec2(ui(progressBarPos.x), ui(progressBarPos.y)),
        ui(70.0),
        ratio,
        questBarRgba,
        scale,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Survival XP panel.
  // -----------------------------------------------------------------------
  const xpTarget = score === null ? int(player.experience) : int(score);
  const xpDisplay = showXp ? state.smoothXp(xpTarget, frameDtMs) : xpTarget;
  if (showXp) {
    const panelPos = new Vec2(HUD_SURV_PANEL_POS[0], HUD_SURV_PANEL_POS[1] + hudYShift);
    const panelSize = new Vec2(HUD_SURV_PANEL_SIZE[0], HUD_SURV_PANEL_SIZE[1]);
    const dst = wgl.makeRectangle(
      ui(panelPos.x),
      ui(panelPos.y),
      ui(panelSize.x),
      ui(panelSize.y),
    );
    const src = wgl.makeRectangle(0.0, 0.0, indPanel.width, indPanel.height);
    wgl.drawTexturePro(
      indPanel,
      src,
      dst,
      wgl.makeVector2(0, 0),
      0.0,
      wgl.makeColor(1.0, 1.0, 1.0, alpha * HUD_PANEL_ALPHA),
    );
    maxY = Math.max(maxY, dst[1] + dst[3]);
  }

  if (showXp) {
    const xpLabelPos = new Vec2(HUD_SURV_XP_LABEL_POS[0], HUD_SURV_XP_LABEL_POS[1] + hudYShift);
    const xpValuePos = new Vec2(HUD_SURV_XP_VALUE_POS[0], HUD_SURV_XP_VALUE_POS[1] + hudYShift);
    const lvlValuePos = new Vec2(HUD_SURV_LVL_VALUE_POS[0], HUD_SURV_LVL_VALUE_POS[1] + hudYShift);
    _drawText(
      font,
      'Xp',
      new Vec2(ui(xpLabelPos.x), ui(xpLabelPos.y)),
      textScale,
      panelTextColor,
    );
    _drawText(
      font,
      `${xpDisplay}`,
      new Vec2(ui(xpValuePos.x), ui(xpValuePos.y)),
      textScale,
      panelTextColor,
    );
    _drawText(
      font,
      `${int(player.level)}`,
      new Vec2(ui(lvlValuePos.x), ui(lvlValuePos.y)),
      textScale,
      panelTextColor,
    );

    const progressRatio = _survivalXpProgressRatio(xpTarget, int(player.level));
    const progressPos = new Vec2(HUD_SURV_PROGRESS_POS[0], HUD_SURV_PROGRESS_POS[1] + hudYShift);
    const barRgba = HUD_XP_BAR_RGBA.scaledAlpha(alpha);
    _drawProgressBar(
      new Vec2(ui(progressPos.x), ui(progressPos.y)),
      ui(HUD_SURV_PROGRESS_WIDTH),
      progressRatio,
      barRgba,
      scale,
    );
    maxY = Math.max(maxY, ui(progressPos.y + 4.0));
  }

  // -----------------------------------------------------------------------
  // Mode time clock/text (rush/typo-style HUD).
  // -----------------------------------------------------------------------
  if (showTime) {
    const timeMs = Math.max(0.0, elapsedMs);
    const clockPos = new Vec2(HUD_CLOCK_POS[0], HUD_CLOCK_POS[1]);
    const clockSz = new Vec2(HUD_CLOCK_SIZE[0], HUD_CLOCK_SIZE[1]);
    {
      const dst = wgl.makeRectangle(
        ui(clockPos.x),
        ui(clockPos.y),
        ui(clockSz.x),
        ui(clockSz.y),
      );
      const src = wgl.makeRectangle(0.0, 0.0, clockTable.width, clockTable.height);
      wgl.drawTexturePro(
        clockTable,
        src,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, alpha * HUD_CLOCK_ALPHA),
      );
      maxY = Math.max(maxY, dst[1] + dst[3]);
    }
    {
      // NOTE: Raylib's draw_texture_pro uses dst.x/y as the rotation origin position;
      // offset by half-size so the 32x32 quad stays aligned with the table.
      const clockCenter = clockPos.add(clockSz.mul(0.5));
      const dst = wgl.makeRectangle(
        ui(clockCenter.x),
        ui(clockCenter.y),
        ui(clockSz.x),
        ui(clockSz.y),
      );
      const src = wgl.makeRectangle(0.0, 0.0, clockPointer.width, clockPointer.height);
      const rotation = timeMs / 1000.0 * 6.0;
      const origin = wgl.makeVector2(ui(clockSz.x * 0.5), ui(clockSz.y * 0.5));
      wgl.drawTexturePro(
        clockPointer,
        src,
        dst,
        origin,
        rotation,
        wgl.makeColor(1.0, 1.0, 1.0, alpha * HUD_CLOCK_ALPHA),
      );
    }
    {
      const totalSeconds = Math.max(0, (timeMs / 1000) | 0);
      const timeText = `${totalSeconds} seconds`;
      _drawText(font, timeText, new Vec2(ui(255.0), ui(10.0)), textScale, textColor);
      maxY = Math.max(maxY, ui(10.0 + lineH));
    }
  }

  // -----------------------------------------------------------------------
  // Bonus HUD slots (icon + timers), slide in/out from the left.
  // -----------------------------------------------------------------------
  let bonusBottomY = HUD_BONUS_BASE_Y + hudYShift;
  if (bonusHud !== null) {
    let bonusY = HUD_BONUS_BASE_Y + hudYShift;
    const bonusPanelAlpha = alpha * 0.7;
    const bonusTextColor = _withAlpha(HUD_TEXT_COLOR, bonusPanelAlpha);
    const barRgba = HUD_XP_BAR_RGBA.withAlpha(bonusPanelAlpha);

    const slots = bonusHud.slots.slice(0, 16);
    for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
      const slot = slots[slotIdx];
      if (!slot.active) {
        continue;
      }

      if (slot.slideX < -184.0) {
        bonusY += HUD_BONUS_SPACING;
        continue;
      }
      const slotPos = new Vec2(slot.slideX, bonusY);

      const hasAlt = slot.timerRefAlt !== null && playerCount > 1;
      const timer = slot.timerValue;
      const timerAlt = hasAlt ? slot.timerValueAlt : 0.0;

      // Slot panel.
      let panelPos: Vec2;
      let panelSize: Vec2;
      if (!smallIndicators) {
        panelPos = slotPos.offset({ dy: HUD_BONUS_PANEL_OFFSET_Y });
        panelSize = new Vec2(182.0, 53.0);
      } else {
        panelPos = slotPos.add(new Vec2(-96.0, 5.0));
        panelSize = new Vec2(182.0, 26.5);
      }

      {
        const src = wgl.makeRectangle(0.0, 0.0, indPanel.width, indPanel.height);
        const dst = wgl.makeRectangle(
          ui(panelPos.x),
          ui(panelPos.y),
          ui(panelSize.x),
          ui(panelSize.y),
        );
        wgl.drawTexturePro(
          indPanel,
          src,
          dst,
          wgl.makeVector2(0, 0),
          0.0,
          wgl.makeColor(1.0, 1.0, 1.0, bonusPanelAlpha),
        );
        maxY = Math.max(maxY, dst[1] + dst[3]);
      }

      // Slot icon.
      if (slot.iconId >= 0) {
        const src = _bonusIconSrc(bonusesTexture, slot.iconId);
        const iconPos = slotPos.offset({ dx: -1.0 });
        const dst = wgl.makeRectangle(
          ui(iconPos.x),
          ui(iconPos.y),
          ui(HUD_BONUS_ICON_SIZE),
          ui(HUD_BONUS_ICON_SIZE),
        );
        wgl.drawTexturePro(
          bonusesTexture,
          src,
          dst,
          wgl.makeVector2(0, 0),
          0.0,
          wgl.makeColor(1.0, 1.0, 1.0, alpha),
        );
        maxY = Math.max(maxY, dst[1] + dst[3]);
      }

      // Slot timer bars.
      if (!smallIndicators) {
        if (!hasAlt) {
          const timerPos = slotPos.add(new Vec2(36.0, 21.0));
          _drawProgressBar(
            new Vec2(ui(timerPos.x), ui(timerPos.y)),
            ui(100.0),
            timer * 0.05,
            barRgba,
            scale,
          );
          const labelPos = slotPos.add(new Vec2(36.0, 6.0));
          _drawText(
            font,
            slot.label,
            new Vec2(ui(labelPos.x), ui(labelPos.y)),
            textScale,
            bonusTextColor,
          );
        } else {
          const timer0Pos = slotPos.add(new Vec2(36.0, 17.0));
          _drawProgressBar(
            new Vec2(ui(timer0Pos.x), ui(timer0Pos.y)),
            ui(100.0),
            timer * 0.05,
            barRgba,
            scale,
          );
          const timer1Pos = slotPos.add(new Vec2(36.0, 23.0));
          _drawProgressBar(
            new Vec2(ui(timer1Pos.x), ui(timer1Pos.y)),
            ui(100.0),
            timerAlt * 0.05,
            barRgba,
            scale,
          );
          const labelPos = slotPos.add(new Vec2(36.0, 2.0));
          _drawText(
            font,
            slot.label,
            new Vec2(ui(labelPos.x), ui(labelPos.y)),
            textScale,
            bonusTextColor,
          );
        }
      } else {
        if (!hasAlt) {
          const timerPos = slotPos.add(new Vec2(36.0, 17.0));
          _drawProgressBar(
            new Vec2(ui(timerPos.x), ui(timerPos.y)),
            ui(32.0),
            timer * 0.05,
            barRgba,
            scale,
          );
        } else {
          const timer0Pos = slotPos.add(new Vec2(36.0, 13.0));
          _drawProgressBar(
            new Vec2(ui(timer0Pos.x), ui(timer0Pos.y)),
            ui(32.0),
            timer * 0.05,
            barRgba,
            scale,
          );
          const timer1Pos = slotPos.add(new Vec2(36.0, 19.0));
          _drawProgressBar(
            new Vec2(ui(timer1Pos.x), ui(timer1Pos.y)),
            ui(32.0),
            timerAlt * 0.05,
            barRgba,
            scale,
          );
        }
      }

      bonusY += HUD_BONUS_SPACING;
      maxY = Math.max(maxY, ui(bonusY));
    }
    bonusBottomY = bonusY;
  }

  // -----------------------------------------------------------------------
  // Weapon aux timer overlay (weapon name popup).
  // -----------------------------------------------------------------------
  const auxPanelBasePos = new Vec2(-12.0, bonusBottomY - 17.0);
  const auxIconBasePos = new Vec2(105.0, bonusBottomY - 5.0);
  const auxTextBasePos = new Vec2(8.0, bonusBottomY + 1.0);
  const auxStep = new Vec2(0.0, 32.0);
  for (let idx = 0; idx < hudPlayers.length; idx++) {
    const hudPlayer = hudPlayers[idx];
    const auxTimer = hudPlayer.auxTimer;
    if (auxTimer <= 0.0) {
      continue;
    }

    let fade = auxTimer > 1.0 ? 2.0 - auxTimer : auxTimer;
    fade = Math.max(0.0, Math.min(1.0, fade)) * alpha;
    if (fade <= 1e-3) {
      continue;
    }

    const panelAlphaVal = fade * 0.8;
    const textAlphaVal = fade;

    const panelPos = auxPanelBasePos.add(auxStep.mul(idx));
    const panelSize = new Vec2(182.0, 53.0);

    {
      const src = wgl.makeRectangle(0.0, 0.0, indPanel.width, indPanel.height);
      const dst = wgl.makeRectangle(
        ui(panelPos.x),
        ui(panelPos.y),
        ui(panelSize.x),
        ui(panelSize.y),
      );
      wgl.drawTexturePro(
        indPanel,
        src,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, panelAlphaVal),
      );
      maxY = Math.max(maxY, dst[1] + dst[3]);
    }

    const iconIndex = _weaponIconIndex(hudPlayer.weapon.weaponId);
    if (iconIndex !== null) {
      const src = _weaponIconSrc(wicons, iconIndex);
      const iconPos = auxIconBasePos.add(auxStep.mul(idx));
      const dst = wgl.makeRectangle(
        ui(iconPos.x),
        ui(iconPos.y),
        ui(60.0),
        ui(30.0),
      );
      wgl.drawTexturePro(
        wicons,
        src,
        dst,
        wgl.makeVector2(0, 0),
        0.0,
        wgl.makeColor(1.0, 1.0, 1.0, panelAlphaVal),
      );
      maxY = Math.max(maxY, dst[1] + dst[3]);
    }

    const weaponName = weaponDisplayName(
      hudPlayer.weapon.weaponId,
      { preserveBugs: state.preserveBugs },
    );
    const weaponColor = _withAlpha(HUD_TEXT_COLOR, textAlphaVal);
    const textPos = auxTextBasePos.add(auxStep.mul(idx));
    _drawText(
      font,
      weaponName,
      new Vec2(ui(textPos.x), ui(textPos.y)),
      textScale,
      weaponColor,
    );
  }

  return maxY;
}
