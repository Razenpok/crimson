// Port of crimson/modes/components/perk_prompt_ui.py

import * as wgl from '@wgl';
import { type WebGLContext, BlendMode } from '@grim/webgl.ts';
import { Vec2, Rect } from '@grim/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { type CrimsonConfig } from '@grim/config.ts';
import { drawUiText } from '@crimson/ui/perk-menu.ts';

export const PERK_PROMPT_MAX_TIMER_MS = 200.0;
const PERK_PROMPT_OUTSET_X = 50.0;

// Perk prompt bar geometry comes from `ui_menu_assets_init` + `ui_menu_layout_init`:
// - `ui_menu_item_element` is set_rect(512x64, offset -72,-60)
// - the perk prompt mutates quad coords: x = (x - 300) * 0.75, y = y * 0.75
const PERK_PROMPT_BAR_SCALE = 0.75;
const PERK_PROMPT_BAR_BASE_OFFSET_X = -72.0;
const PERK_PROMPT_BAR_BASE_OFFSET_Y = -60.0;
const PERK_PROMPT_BAR_SHIFT_X = -300.0;

// `ui_textLevelUp` is set_rect(75x25, offset -230,-27), then its quad coords are:
// x = x * 0.85 - 46, y = y * 0.85 - 4
const PERK_PROMPT_LEVEL_UP_SCALE = 0.85;
const PERK_PROMPT_LEVEL_UP_BASE_OFFSET_X = -230.0;
const PERK_PROMPT_LEVEL_UP_BASE_OFFSET_Y = -27.0;
const PERK_PROMPT_LEVEL_UP_BASE_W = 75.0;
const PERK_PROMPT_LEVEL_UP_BASE_H = 25.0;
const PERK_PROMPT_LEVEL_UP_SHIFT_X = -46.0;
const PERK_PROMPT_LEVEL_UP_SHIFT_Y = -4.0;

const PERK_PROMPT_TEXT_MARGIN_X = 16.0;
const PERK_PROMPT_TEXT_OFFSET_Y = 8.0;

export type UiTextWidthFn = (text: string, scale: number) => number;

export class PerkPromptUi {
  static label(config: CrimsonConfig, pendingCount: number): string {
    if (!config.gameplay.showInfoTexts) {
      return '';
    }
    const pending = Math.floor(pendingCount);
    if (pending <= 0) {
      return '';
    }
    const suffix = pending > 1 ? ` (${pending})` : '';
    return `Press Mouse2 to pick a perk${suffix}`;
  }

  static hinge(screenW: number): Vec2 {
    const hingeX = screenW + PERK_PROMPT_OUTSET_X;
    const hingeY = Math.floor(screenW) === 640 ? 80.0 : 40.0;
    return new Vec2(hingeX, hingeY);
  }

  static rect(
    resources: RuntimeResources,
    screenW: number,
    _scale: number = 1.0,
  ): Rect {
    const hinge = PerkPromptUi.hinge(screenW);
    const tex = getTexture(resources, TextureId.UI_MENU_ITEM);
    const barW = tex.width * PERK_PROMPT_BAR_SCALE;
    const barH = tex.height * PERK_PROMPT_BAR_SCALE;
    const localX = (PERK_PROMPT_BAR_BASE_OFFSET_X + PERK_PROMPT_BAR_SHIFT_X) * PERK_PROMPT_BAR_SCALE;
    const localY = PERK_PROMPT_BAR_BASE_OFFSET_Y * PERK_PROMPT_BAR_SCALE;
    return Rect.fromTopLeft(
      hinge.offset(localX, localY),
      barW,
      barH,
    );
  }

  static draw(
    ctx: WebGLContext,
    opts: {
      resources: RuntimeResources;
      label: string;
      timerMs: number;
      pulse: number;
      uiTextWidth: UiTextWidthFn;
      textColor: wgl.Color;
      scale: number;
    },
  ): void {
    const { resources, label, timerMs, pulse, uiTextWidth, textColor, scale } = opts;
    const alpha = timerMs / PERK_PROMPT_MAX_TIMER_MS;
    if (alpha <= 1e-3) {
      return;
    }

    const screenW = ctx.screenWidth;
    const hinge = PerkPromptUi.hinge(screenW);
    // Prompt swings counter-clockwise; WebGL Y-down makes positive rotation clockwise.
    const rotDeg = -(1.0 - alpha) * 90.0;
    const tint = wgl.makeColor(1, 1, 1, alpha);

    const textScale = scale;
    const textW = uiTextWidth(label, textScale);
    const x = screenW - PERK_PROMPT_TEXT_MARGIN_X - textW;
    const y = hinge.y + PERK_PROMPT_TEXT_OFFSET_Y;
    const color = wgl.makeColor(textColor[0], textColor[1], textColor[2], alpha);
    drawUiText(ctx, resources, label, new Vec2(x, y), { scale: textScale, color });

    // Bar texture (mirrored via negative src width)
    const barTex = getTexture(resources, TextureId.UI_MENU_ITEM);
    const barW = barTex.width * PERK_PROMPT_BAR_SCALE;
    const barH = barTex.height * PERK_PROMPT_BAR_SCALE;
    const barLocalX = (PERK_PROMPT_BAR_BASE_OFFSET_X + PERK_PROMPT_BAR_SHIFT_X) * PERK_PROMPT_BAR_SCALE;
    const barLocalY = PERK_PROMPT_BAR_BASE_OFFSET_Y * PERK_PROMPT_BAR_SCALE;
    const barSrc = wgl.makeRectangle(0, 0, -barTex.width, barTex.height);
    const barDst = wgl.makeRectangle(hinge.x, hinge.y, barW, barH);
    const barOrigin = wgl.makeVector2(-barLocalX, -barLocalY);
    ctx.drawTexturePro(barTex, barSrc, barDst, barOrigin, rotDeg, tint);

    // Level-up label texture
    const luTex = getTexture(resources, TextureId.UI_TEXT_LEVEL_UP);
    const luLocalX = PERK_PROMPT_LEVEL_UP_BASE_OFFSET_X * PERK_PROMPT_LEVEL_UP_SCALE + PERK_PROMPT_LEVEL_UP_SHIFT_X;
    const luLocalY = PERK_PROMPT_LEVEL_UP_BASE_OFFSET_Y * PERK_PROMPT_LEVEL_UP_SCALE + PERK_PROMPT_LEVEL_UP_SHIFT_Y;
    const luW = PERK_PROMPT_LEVEL_UP_BASE_W * PERK_PROMPT_LEVEL_UP_SCALE;
    const luH = PERK_PROMPT_LEVEL_UP_BASE_H * PERK_PROMPT_LEVEL_UP_SCALE;
    const pulseAlpha = Math.max(0.0, Math.min(1.0, (100.0 + Math.floor(pulse * 155.0 / 1000.0)) / 255.0));
    const labelAlpha = Math.max(0.0, Math.min(1.0, alpha * pulseAlpha));
    const pulseTint = wgl.makeColor(1, 1, 1, labelAlpha);
    const luSrc = wgl.makeRectangle(0, 0, luTex.width, luTex.height);
    const luDst = wgl.makeRectangle(hinge.x, hinge.y, luW, luH);
    const luOrigin = wgl.makeVector2(-luLocalX, -luLocalY);
    ctx.drawTexturePro(luTex, luSrc, luDst, luOrigin, rotDeg, pulseTint);
    if (labelAlpha > 0.0) {
      ctx.setBlendMode(BlendMode.ADDITIVE);
      ctx.drawTexturePro(luTex, luSrc, luDst, luOrigin, rotDeg, pulseTint);
      ctx.setBlendMode(BlendMode.ALPHA);
    }
  }
}
