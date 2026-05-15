// Port of crimson/ui/overlays/tutorial_run.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { TutorialOverlayState } from '@crimson/tutorial/state.ts';

export type { TutorialOverlayState };

export const TUTORIAL_PANEL_POS = new Vec2(0.0, 64.0);
export const TUTORIAL_PANEL_PADDING = new Vec2(20.0, 8.0);

export type DrawUiText = (text: string, pos: Vec2, color: wgl.Color, scale: number) => void;
export type MeasureUiTextWidth = (text: string, scale: number) => number;
export type MeasureUiLineHeight = (scale: number) => number;

export type TutorialPanelRectResult = [wgl.Rectangle, string[], number];

function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (/\r\n|\r|\n/.test(text.slice(-2))) {
    lines.pop();
  }
  return lines;
}

export function tutorialPromptPanelRect(
  text: string,
  opts: {
    measureTextWidth: MeasureUiTextWidth;
    measureLineHeight: MeasureUiLineHeight;
    pos: Vec2;
    scale: number;
  },
): TutorialPanelRectResult {
  const lines = text ? splitLines(text) : [''];
  const lineH = opts.measureLineHeight(opts.scale);
  let maxW = 0.0;
  for (const line of lines) {
    maxW = Math.max(maxW, opts.measureTextWidth(line, opts.scale));
  }
  const padX = TUTORIAL_PANEL_PADDING.x * opts.scale;
  const padY = TUTORIAL_PANEL_PADDING.y * opts.scale;
  const width = maxW + padX * 2.0;
  const height = lines.length * lineH + padY * 2.0;
  const screenW = wgl.getScreenWidth();
  const x = (screenW - width) * 0.5;
  const rect = wgl.makeRectangle(x, opts.pos.y, width, height);
  return [rect, lines, lineH];
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
  const color = wgl.makeColor(r, g, b, int(255 * a) / 255);
  wgl.drawRectangle(int(x), int(y), int(w), 1, color);
  wgl.drawRectangle(int(x), int(y + h - 1), int(w), 1, color);
  wgl.drawRectangle(int(x), int(y + 1), 1, int(h - 2), color);
  wgl.drawRectangle(int(x + w - 1), int(y + 1), 1, int(h - 2), color);
}

export function drawTutorialPromptPanel(
  text: string,
  opts: {
    alpha: number;
    pos: Vec2;
    drawText: DrawUiText;
    measureTextWidth: MeasureUiTextWidth;
    measureLineHeight: MeasureUiLineHeight;
  },
): void {
  if (opts.alpha <= 1e-3) return;
  const scale = 1.0;
  const [rect, lines, lineH] = tutorialPromptPanelRect(
    text,
    {
      measureTextWidth: opts.measureTextWidth,
      measureLineHeight: opts.measureLineHeight,
      pos: opts.pos,
      scale,
    },
  );
  const { x: rx, y: ry, w: rw, h: rh } = rect;

  wgl.drawRectangle(
    int(rx),
    int(ry),
    int(rw),
    int(rh),
    wgl.makeColor(0, 0, 0, int(255 * opts.alpha * 0.8) / 255),
  );

  drawRectOutline(rx, ry, rw, rh, 1, 1, 1, opts.alpha);

  const textAlpha = int(255 * Math.min(1.0, Math.max(0.0, opts.alpha * 0.9))) / 255;
  const color = wgl.makeColor(1, 1, 1, textAlpha);
  const padX = TUTORIAL_PANEL_PADDING.x * scale;
  let lineY = ry + TUTORIAL_PANEL_PADDING.y * scale;
  for (const line of lines) {
    opts.drawText(line, new Vec2(rx + padX, lineY), color, scale);
    lineY += lineH;
  }
}

export function drawTutorialOverlayPanels(
  overlay: TutorialOverlayState,
  opts: {
    drawText: DrawUiText;
    measureTextWidth: MeasureUiTextWidth;
    measureLineHeight: MeasureUiLineHeight;
  },
): void {
  if (overlay.promptText && overlay.promptAlpha > 1e-3) {
    drawTutorialPromptPanel(
      overlay.promptText,
      {
        alpha: overlay.promptAlpha,
        pos: TUTORIAL_PANEL_POS,
        drawText: opts.drawText,
        measureTextWidth: opts.measureTextWidth,
        measureLineHeight: opts.measureLineHeight,
      },
    );
  }
  if (overlay.hintText && overlay.hintAlpha > 1e-3) {
    drawTutorialPromptPanel(
      overlay.hintText,
      {
        alpha: overlay.hintAlpha,
        pos: TUTORIAL_PANEL_POS.offset({ dy: 84.0 }),
        drawText: opts.drawText,
        measureTextWidth: opts.measureTextWidth,
        measureLineHeight: opts.measureLineHeight,
      },
    );
  }
}
