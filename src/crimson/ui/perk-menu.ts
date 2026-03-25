// Port of crimson/ui/perk_menu.py

import * as wgl from '@wgl';
import { Vec2, Rect } from '@grim/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText, measureSmallTextWidth } from '@grim/fonts/small.ts';
import { clamp } from '@grim/math.ts';
import { menuWidescreenYShift } from './layout.ts';

export const PERK_MENU_ANIM_START_MS = 400.0;
export const PERK_MENU_ANIM_END_MS = 100.0;
export const PERK_MENU_TRANSITION_MS = PERK_MENU_ANIM_START_MS;

const MENU_PANEL_ANCHOR_X = 224.0;
const MENU_PANEL_ANCHOR_Y = 40.0;
const MENU_TITLE_X = 54.0;
const MENU_TITLE_Y = 6.0;
const MENU_TITLE_W = 128.0;
const MENU_TITLE_H = 32.0;
const MENU_SPONSOR_Y = -8.0;
const MENU_SPONSOR_X_EXPERT = -26.0;
const MENU_SPONSOR_X_MASTER = -28.0;
const MENU_LIST_Y_NORMAL = 50.0;
const MENU_LIST_Y_EXPERT = 40.0;
const MENU_LIST_STEP_NORMAL = 19.0;
const MENU_LIST_STEP_EXPERT = 18.0;
const MENU_DESC_X = -12.0;
const MENU_DESC_Y_AFTER_LIST = 32.0;
const MENU_DESC_Y_EXTRA_TIGHTEN = 20.0;
const MENU_BUTTON_X = 162.0;
const MENU_BUTTON_Y = 276.0;
const MENU_DESC_RIGHT_X = 480.0;

export class PerkMenuLayout {
  panelPos: Vec2 = new Vec2(-108.0, 29.0);
  panelSize: Vec2 = new Vec2(510.0, 378.0);
}

export interface PerkMenuComputedLayout {
  panel: Rect;
  title: Rect;
  sponsorPos: Vec2;
  listPos: Vec2;
  listStepY: number;
  desc: Rect;
  cancelPos: Vec2;
}

export function perkMenuComputeLayout(
  layout: PerkMenuLayout,
  opts: {
    screenW: number;
    origin: Vec2;
    scale: number;
    choiceCount: number;
    expertOwned: boolean;
    masterOwned: boolean;
    panelSlideX?: number;
  },
): PerkMenuComputedLayout {
  const { screenW, origin, scale, choiceCount, expertOwned, masterOwned } = opts;
  const panelSlideX = opts.panelSlideX ?? 0.0;
  const layoutW = scale ? screenW / scale : screenW;
  const widescreenShiftY = menuWidescreenYShift(layoutW);
  const panelPos = layout.panelPos.add(new Vec2(panelSlideX, widescreenShiftY));
  const panel = Rect.fromPosSize(origin.add(panelPos.mul(scale)), layout.panelSize.mul(scale));
  const anchorPos = new Vec2(
    panel.x + MENU_PANEL_ANCHOR_X * scale,
    panel.y + MENU_PANEL_ANCHOR_Y * scale,
  );
  const title = Rect.fromTopLeft(
    anchorPos.offset({ dx: MENU_TITLE_X * scale, dy: MENU_TITLE_Y * scale }),
    MENU_TITLE_W * scale,
    MENU_TITLE_H * scale,
  );
  const sponsorPos = new Vec2(
    anchorPos.x + (masterOwned ? MENU_SPONSOR_X_MASTER : MENU_SPONSOR_X_EXPERT) * scale,
    anchorPos.y + MENU_SPONSOR_Y * scale,
  );
  const listStepY = expertOwned ? MENU_LIST_STEP_EXPERT : MENU_LIST_STEP_NORMAL;
  const listPos = new Vec2(
    anchorPos.x,
    anchorPos.y + (expertOwned ? MENU_LIST_Y_EXPERT : MENU_LIST_Y_NORMAL) * scale,
  );
  let descPos = new Vec2(
    anchorPos.x + MENU_DESC_X * scale,
    listPos.y + choiceCount * listStepY * scale + MENU_DESC_Y_AFTER_LIST * scale,
  );
  if (choiceCount > 5) {
    descPos = descPos.offset({ dy: -MENU_DESC_Y_EXTRA_TIGHTEN * scale });
  }
  const descRight = panel.x + MENU_DESC_RIGHT_X * scale;
  const cancelPos = anchorPos.offset({ dx: MENU_BUTTON_X * scale, dy: MENU_BUTTON_Y * scale });
  const descSize = new Vec2(
    Math.max(0.0, descRight - descPos.x),
    Math.max(0.0, cancelPos.y - 12.0 * scale - descPos.y),
  );
  const desc = Rect.fromPosSize(descPos, descSize);
  return {
    panel,
    title,
    sponsorPos,
    listPos,
    listStepY: listStepY * scale,
    desc,
    cancelPos,
  };
}

export function uiElementSlideX(
  tMs: number,
  opts: {
    startMs: number;
    endMs: number;
    width: number;
    directionFlag?: number;
  },
): number {
  const { startMs, endMs, directionFlag } = opts;
  let width = opts.width;
  if (startMs <= endMs || width <= 0.0) return 0.0;
  width = Math.abs(width);
  const t = tMs;
  let slide: number;
  if (t < endMs) {
    slide = width;
  } else if (t < startMs) {
    const elapsed = t - endMs;
    const span = startMs - endMs;
    const p = span > 1e-6 ? elapsed / span : 1.0;
    slide = (1.0 - p) * width;
  } else {
    slide = 0.0;
  }
  return (directionFlag ? 1 : 0) ? slide : -slide;
}

export function perkMenuPanelSlideX(tMs: number, opts: { width: number }): number {
  return uiElementSlideX(tMs, {
    startMs: PERK_MENU_ANIM_START_MS,
    endMs: PERK_MENU_ANIM_END_MS,
    width: opts.width,
    directionFlag: 0,
  });
}

function _uiTextWidth(resources: RuntimeResources, text: string, scale: number): number {
  const font = resources.smallFont;
  return measureSmallTextWidth(font, text);
}

export function drawUiText(
  resources: RuntimeResources,
  text: string,
  pos: Vec2,
  opts: { scale: number; color: wgl.Color },
): void {
  const font = resources.smallFont;
  drawSmallText(font, text, pos, opts.color);
}

export function wrapUiText(
  resources: RuntimeResources,
  text: string,
  opts: { maxWidth: number; scale: number },
): string[] {
  const lines: string[] = [];
  const rawLines = text.split('\n');
  const parts = rawLines.length > 0 ? rawLines : [''];
  for (const raw of parts) {
    const para = raw.trim();
    if (!para) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of para.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && _uiTextWidth(resources, candidate, opts.scale) > opts.maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function drawWrappedUiTextInRect(
  resources: RuntimeResources,
  text: string,
  opts: { rect: Rect; scale: number; color: wgl.Color },
): void {
  const font = resources.smallFont;
  const lines = wrapUiText(resources, text, { maxWidth: opts.rect.w, scale: opts.scale });
  const lineH = font.cellSize * opts.scale;
  let pos = opts.rect.topLeft;
  const maxY = opts.rect.bottom;
  for (const line of lines) {
    if (pos.y + lineH > maxY) break;
    drawUiText(resources, line, pos, { scale: opts.scale, color: opts.color });
    pos = pos.offset({ dy: lineH });
  }
}

const MENU_ITEM_RGB: [number, number, number] = [0x46, 0xB4, 0xF0];
const MENU_ITEM_ALPHA_IDLE = 0.6;
const MENU_ITEM_ALPHA_HOVER = 1.0;

export function menuItemHitRect(
  resources: RuntimeResources,
  label: string,
  opts: { pos: Vec2; scale: number },
): Rect {
  const width = _uiTextWidth(resources, label, opts.scale);
  const height = 16.0 * opts.scale;
  return Rect.fromTopLeft(opts.pos, width, height);
}

export function drawMenuItem(
  resources: RuntimeResources,
  label: string,
  opts: { pos: Vec2; scale: number; hovered: boolean },
): number {
  const alpha = opts.hovered ? MENU_ITEM_ALPHA_HOVER : MENU_ITEM_ALPHA_IDLE;
  const [r, g, b] = MENU_ITEM_RGB;
  const color = wgl.makeColor(r / 255, g / 255, b / 255, alpha);
  drawUiText(resources, label, opts.pos, { scale: opts.scale, color });
  const width = _uiTextWidth(resources, label, opts.scale);
  const lineY = opts.pos.y + 13.0 * opts.scale;
  // draw_line as a 1px rectangle
  wgl.drawRectangle(
    Math.floor(opts.pos.x),
    Math.floor(lineY),
    Math.floor(width),
    1,
    wgl.makeColor(r / 255, g / 255, b / 255, alpha),
  );
  return width;
}

export class UiButtonState {
  label: string;
  enabled: boolean;
  hovered: boolean;
  activated: boolean;
  hoverT: number;
  pressT: number;
  alpha: number;
  forceWide: boolean;

  constructor(
    label: string,
    opts?: {
      enabled?: boolean;
      hovered?: boolean;
      activated?: boolean;
      hoverT?: number;
      pressT?: number;
      alpha?: number;
      forceWide?: boolean;
    },
  ) {
    this.label = label;
    this.enabled = opts?.enabled ?? true;
    this.hovered = opts?.hovered ?? false;
    this.activated = opts?.activated ?? false;
    this.hoverT = opts?.hoverT ?? 0;
    this.pressT = opts?.pressT ?? 0;
    this.alpha = opts?.alpha ?? 1.0;
    this.forceWide = opts?.forceWide ?? false;
  }
}

function _resolveButtonTextures(resources: RuntimeResources): [wgl.Texture, wgl.Texture] {
  return [
    getTexture(resources, TextureId.UI_BUTTON_SM),
    getTexture(resources, TextureId.UI_BUTTON_MD),
  ];
}

export function buttonWidth(
  resources: RuntimeResources,
  label: string,
  opts: { scale: number; forceWide: boolean },
): number {
  const textW = _uiTextWidth(resources, label, opts.scale);
  if (opts.forceWide) return 145.0 * opts.scale;
  if (textW < 40.0 * opts.scale) return 82.0 * opts.scale;
  return 145.0 * opts.scale;
}

export function buttonHitRect(opts: { pos: Vec2; width: number }): Rect {
  return Rect.fromTopLeft(opts.pos.offset({ dy: 2.0 }), opts.width, 28.0);
}

export function buttonUpdate(
  state: UiButtonState,
  opts: {
    pos: Vec2;
    width: number;
    dtMs: number;
    mouse: { x: number; y: number };
    click: boolean;
  },
): boolean {
  if (!state.enabled) {
    state.hovered = false;
  } else {
    state.hovered = buttonHitRect({ pos: opts.pos, width: opts.width }).contains(opts.mouse);
  }
  const delta = (state.enabled && state.hovered) ? 6 : -4;
  state.hoverT = Math.floor(clamp(state.hoverT + Math.floor(opts.dtMs) * delta, 0.0, 1000.0));
  if (state.pressT > 0) {
    state.pressT = Math.floor(clamp(state.pressT - Math.floor(opts.dtMs) * 6, 0.0, 1000.0));
  }
  state.activated = state.enabled && state.hovered && opts.click;
  if (state.activated) state.pressT = 1000;
  return state.activated;
}

export function buttonDraw(
  resources: RuntimeResources,
  state: UiButtonState,
  opts: { pos: Vec2; width: number; scale: number },
): void {
  const [buttonSm, buttonMd] = _resolveButtonTextures(resources);
  const texture = opts.width > 120.0 * opts.scale ? buttonMd : buttonSm;

  if (state.hoverT > 0) {
    let r = 0.5;
    let g = 0.5;
    let b = 0.7;
    if (state.pressT > 0) {
      const clickT = state.pressT;
      g = Math.min(1.0, 0.5 + clickT * 0.0005);
      r = g;
      b = Math.min(1.0, 0.7 + clickT * 0.0007);
    }
    const a = state.hoverT * 0.001 * state.alpha;
    const hlR = r;
    const hlG = g;
    const hlB = b;
    const hlA = clamp(a, 0.0, 1.0);
    wgl.drawRectangle(
      Math.floor(opts.pos.x + 12.0 * opts.scale),
      Math.floor(opts.pos.y + 5.0 * opts.scale),
      Math.floor(opts.width - 24.0 * opts.scale),
      Math.floor(22.0 * opts.scale),
      wgl.makeColor(hlR, hlG, hlB, hlA),
    );
  }

  const plateAlpha = clamp(state.alpha, 0.0, 1.0);
  const plateTint = wgl.makeColor(1.0, 1.0, 1.0, plateAlpha);
  const src = wgl.makeRectangle(0.0, 0.0, texture.width, texture.height);
  const dst = wgl.makeRectangle(opts.pos.x, opts.pos.y, opts.width, 32.0 * opts.scale);
  wgl.drawTexturePro(texture, src, dst, wgl.makeVector2(0.0, 0.0), 0.0, plateTint);

  const textA = state.hovered ? state.alpha : state.alpha * 0.7;
  const textTint = wgl.makeColor(1.0, 1.0, 1.0, clamp(textA, 0.0, 1.0));
  const textW = _uiTextWidth(resources, state.label, opts.scale);
  const textPos = new Vec2(
    opts.pos.x + opts.width * 0.5 - textW * 0.5 + 1.0 * opts.scale,
    opts.pos.y + 10.0 * opts.scale,
  );
  drawUiText(resources, state.label, textPos, { scale: opts.scale, color: textTint });
}

export function cursorDraw(
  resources: RuntimeResources,
  opts: { mouse: Vec2; scale: number; alpha?: number },
): void {
  const tex = getTexture(resources, TextureId.UI_CURSOR);
  const alpha = opts.alpha ?? 1.0;
  const a = clamp(alpha, 0.0, 1.0);
  const tint = wgl.makeColor(1.0, 1.0, 1.0, a);
  const size = 32.0 * opts.scale;
  const src = wgl.makeRectangle(0.0, 0.0, tex.width, tex.height);
  const dst = wgl.makeRectangle(opts.mouse.x, opts.mouse.y, size, size);
  wgl.drawTexturePro(tex, src, dst, wgl.makeVector2(0.0, 0.0), 0.0, tint);
}
