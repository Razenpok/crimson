// Port of crimson/ui/overlays/tutorial_run.py

import { type WebGLContext } from '../../../grim/webgl.ts';
import { Vec2 } from '../../../grim/geom.ts';

export interface TutorialOverlayState {
  promptText: string;
  promptAlpha: number;
  hintText: string;
  hintAlpha: number;
}

const TUTORIAL_PANEL_POS = new Vec2(0.0, 64.0);
const TUTORIAL_PANEL_PADDING = new Vec2(20.0, 8.0);

export type DrawUiText = (text: string, pos: Vec2, color: [number, number, number, number], scale: number) => void;
export type MeasureUiTextWidth = (text: string, scale: number) => number;
export type MeasureUiLineHeight = (scale: number) => number;

export interface TutorialPanelRectResult {
  rect: [number, number, number, number];
  lines: string[];
  lineH: number;
}

export function tutorialPromptPanelRect(
  text: string,
  screenW: number,
  measureTextWidth: MeasureUiTextWidth,
  measureLineHeight: MeasureUiLineHeight,
  pos: Vec2,
  scale: number,
): TutorialPanelRectResult {
  const lines = text ? text.split('\n') : [''];
  const lineH = measureLineHeight(scale);
  let maxW = 0.0;
  for (const line of lines) {
    maxW = Math.max(maxW, measureTextWidth(line, scale));
  }
  const padX = TUTORIAL_PANEL_PADDING.x * scale;
  const padY = TUTORIAL_PANEL_PADDING.y * scale;
  const width = maxW + padX * 2.0;
  const height = lines.length * lineH + padY * 2.0;
  const x = (screenW - width) * 0.5;
  const rect: [number, number, number, number] = [x, pos.y, width, height];
  return { rect, lines, lineH };
}

function drawRectOutline(
  ctx: WebGLContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  // Top edge
  ctx.drawRectangle(x, y, w, 1, r, g, b, a);
  // Bottom edge
  ctx.drawRectangle(x, y + h - 1, w, 1, r, g, b, a);
  // Left edge
  ctx.drawRectangle(x, y + 1, 1, h - 2, r, g, b, a);
  // Right edge
  ctx.drawRectangle(x + w - 1, y + 1, 1, h - 2, r, g, b, a);
}

export function drawTutorialPromptPanel(
  ctx: WebGLContext,
  screenW: number,
  text: string,
  alpha: number,
  pos: Vec2,
  scale: number,
  drawText: DrawUiText,
  measureTextWidth: MeasureUiTextWidth,
  measureLineHeight: MeasureUiLineHeight,
): void {
  if (alpha <= 1e-3) return;
  const { rect, lines, lineH } = tutorialPromptPanelRect(
    text,
    screenW,
    measureTextWidth,
    measureLineHeight,
    pos,
    scale,
  );
  const [rx, ry, rw, rh] = rect;

  // Background fill
  ctx.drawRectangle(rx, ry, rw, rh, 0, 0, 0, alpha * 0.8);

  // Border outline
  drawRectOutline(ctx, rx, ry, rw, rh, 1, 1, 1, alpha);

  // Draw text lines
  const textAlpha = Math.min(1.0, Math.max(0.0, alpha * 0.9));
  const color: [number, number, number, number] = [1, 1, 1, textAlpha];
  const padX = TUTORIAL_PANEL_PADDING.x * scale;
  const padY = TUTORIAL_PANEL_PADDING.y * scale;
  for (let i = 0; i < lines.length; i++) {
    const linePos = new Vec2(rx + padX, ry + padY + i * lineH);
    drawText(lines[i], linePos, color, scale);
  }
}

export function drawTutorialOverlayPanels(
  ctx: WebGLContext,
  screenW: number,
  overlay: TutorialOverlayState,
  scale: number,
  drawText: DrawUiText,
  measureTextWidth: MeasureUiTextWidth,
  measureLineHeight: MeasureUiLineHeight,
): void {
  if (overlay.promptText && overlay.promptAlpha > 1e-3) {
    drawTutorialPromptPanel(
      ctx,
      screenW,
      overlay.promptText,
      overlay.promptAlpha,
      TUTORIAL_PANEL_POS,
      scale,
      drawText,
      measureTextWidth,
      measureLineHeight,
    );
  }
  if (overlay.hintText && overlay.hintAlpha > 1e-3) {
    drawTutorialPromptPanel(
      ctx,
      screenW,
      overlay.hintText,
      overlay.hintAlpha,
      TUTORIAL_PANEL_POS.offset(0.0, 84.0),
      scale,
      drawText,
      measureTextWidth,
      measureLineHeight,
    );
  }
}
