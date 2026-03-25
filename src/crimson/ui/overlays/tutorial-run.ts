// Port of crimson/ui/overlays/tutorial_run.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';

export interface TutorialOverlayState {
  promptText: string;
  promptAlpha: number;
  hintText: string;
  hintAlpha: number;
}

const TUTORIAL_PANEL_POS = new Vec2(0.0, 64.0);
const TUTORIAL_PANEL_PADDING = new Vec2(20.0, 8.0);

export type DrawUiText = (text: string, pos: Vec2, color: wgl.Color, scale: number) => void;
export type MeasureUiTextWidth = (text: string, scale: number) => number;
export type MeasureUiLineHeight = (scale: number) => number;

export interface TutorialPanelRectResult {
  rect: wgl.Rectangle;
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
  const rect = wgl.makeRectangle(x, pos.y, width, height);
  return { rect, lines, lineH };
}

function drawRectOutline(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const color = wgl.makeColor(r, g, b, a);
  // Top edge
  wgl.drawRectangle(x, y, w, 1, color);
  // Bottom edge
  wgl.drawRectangle(x, y + h - 1, w, 1, color);
  // Left edge
  wgl.drawRectangle(x, y + 1, 1, h - 2, color);
  // Right edge
  wgl.drawRectangle(x + w - 1, y + 1, 1, h - 2, color);
}

export function drawTutorialPromptPanel(
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
  wgl.drawRectangle(rx, ry, rw, rh, wgl.makeColor(0, 0, 0, alpha * 0.8));

  // Border outline
  drawRectOutline(rx, ry, rw, rh, 1, 1, 1, alpha);

  // Draw text lines
  const textAlpha = Math.min(1.0, Math.max(0.0, alpha * 0.9));
  const color = wgl.makeColor(1, 1, 1, textAlpha);
  const padX = TUTORIAL_PANEL_PADDING.x * scale;
  const padY = TUTORIAL_PANEL_PADDING.y * scale;
  for (let i = 0; i < lines.length; i++) {
    const linePos = new Vec2(rx + padX, ry + padY + i * lineH);
    drawText(lines[i], linePos, color, scale);
  }
}

export function drawTutorialOverlayPanels(
  screenW: number,
  overlay: TutorialOverlayState,
  scale: number,
  drawText: DrawUiText,
  measureTextWidth: MeasureUiTextWidth,
  measureLineHeight: MeasureUiLineHeight,
): void {
  if (overlay.promptText && overlay.promptAlpha > 1e-3) {
    drawTutorialPromptPanel(
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
