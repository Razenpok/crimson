// Port of crimson/ui/overlays/typo_run.py

import { type GlTexture, type WebGLContext } from '@grim/webgl.ts';
import { Vec2 } from '@grim/geom.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';

const NAME_LABEL_SCALE = 1.0;
const NAME_LABEL_BG_ALPHA = 0.67;
const TYPING_PANEL_WIDTH = 182.0;
const TYPING_PANEL_HEIGHT = 53.0;
const TYPING_PANEL_ALPHA = 0.7;
const TYPING_TEXT_X = 6.0;
const TYPING_PROMPT = '>';
const TYPING_CURSOR = '_';
const TYPING_CURSOR_X_OFFSET = 14.0;

export type DrawUiText = (text: string, pos: Vec2, color: [number, number, number, number], scale: number) => void;
export type MeasureUiTextWidth = (text: string, scale: number) => number;
export type WorldToScreen = (worldPos: Vec2) => Vec2;

export function drawTypoNameLabels(
  ctx: WebGLContext,
  creatures: readonly CreatureState[],
  names: readonly string[],
  worldToScreen: WorldToScreen,
  drawText: DrawUiText,
  measureTextWidth: MeasureUiTextWidth,
): void {
  for (let idx = 0; idx < creatures.length; idx++) {
    const creature = creatures[idx];
    if (!creature.active) continue;
    if (idx < 0 || idx >= names.length) continue;
    const text = names[idx];
    if (!text) continue;

    let labelAlpha = 1.0;
    const hitbox = creature.lifecycleStage;
    if (hitbox < 0.0) {
      labelAlpha = Math.max(0.0, Math.min(1.0, (hitbox + 10.0) * 0.1));
    }
    if (labelAlpha <= 1e-3) continue;

    const screenPos = worldToScreen(creature.pos);
    const y = screenPos.y - 50.0;
    const textW = measureTextWidth(text, NAME_LABEL_SCALE);
    const textH = 15.0;
    const x = screenPos.x - textW * 0.5;
    const bgAlpha = labelAlpha * NAME_LABEL_BG_ALPHA;

    ctx.drawRectangle(x - 4, y, textW + 8, textH, 0, 0, 0, bgAlpha);
    drawText(text, new Vec2(x, y), [1, 1, 1, labelAlpha], NAME_LABEL_SCALE);
  }
}

export function drawTypingBox(
  ctx: WebGLContext,
  screenH: number,
  panelTexture: GlTexture,
  text: string,
  cursorPulseTime: number,
  drawText: DrawUiText,
  measureTextWidth: MeasureUiTextWidth,
): void {
  const panelX = -1.0;
  const panelY = screenH - 144.0;
  const textY = screenH - 127.0;

  const src: [number, number, number, number] = [0, 0, panelTexture.width, panelTexture.height];
  const dst: [number, number, number, number] = [panelX, panelY, TYPING_PANEL_WIDTH, TYPING_PANEL_HEIGHT];
  const tint: [number, number, number, number] = [1, 1, 1, TYPING_PANEL_ALPHA];
  ctx.drawTexturePro(panelTexture, src, dst, [0, 0], 0.0, tint);

  drawText(TYPING_PROMPT + text, new Vec2(TYPING_TEXT_X, textY), [1, 1, 1, 1], 1.0);

  const cursorDim = Math.sin(cursorPulseTime * 4.0) > 0.0;
  const cursorAlpha = cursorDim ? 0.4 : 1.0;
  const cursorColor: [number, number, number, number] = [1, 1, 1, cursorAlpha];
  const textW = measureTextWidth(text, 1.0);
  const cursorX = textW + TYPING_CURSOR_X_OFFSET;
  drawText(TYPING_CURSOR, new Vec2(cursorX, textY), cursorColor, 1.0);
}
