// Port of grim/fonts/small.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';

export interface SmallFontData {
  widths: number[];
  texture: wgl.Texture;
  cellSize: number;
  grid: number;
}

export function drawSmallText(
  font: SmallFontData,
  text: string,
  pos: Vec2,
  color: wgl.Color,
): void {
  let xPos = Math.floor(pos.x);
  let yPos = Math.floor(pos.y);
  const baseX = xPos;
  const lineHeight = font.cellSize;
  const origin = wgl.makeVector2(0, 0);

  for (let i = 0; i < text.length; i++) {
    const value = text.charCodeAt(i);
    if (value === 0x0A) { // newline
      xPos = baseX;
      yPos += lineHeight;
      continue;
    }
    if (value === 0x0D) continue; // carriage return

    const charCode = value > 255 ? 63 : value; // '?' for out of range
    const width = font.widths[charCode];
    if (width <= 0) continue;

    const col = charCode % font.grid;
    const row = Math.floor(charCode / font.grid);
    const srcX = col * font.cellSize;
    const srcY = row * font.cellSize;

    // Native Grim2D applies a 1/512 UV inset on the DX8 path. Raylib/OpenGL
    // renders visibly cropped glyphs with that bias, so we intentionally use
    // the full glyph rect here.
    wgl.drawTexturePro(
      font.texture,
      wgl.makeRectangle(srcX, srcY, width, font.cellSize),
      wgl.makeRectangle(xPos, yPos, width, font.cellSize),
      origin,
      0,
      color,
    );
    xPos += width;
  }
}

export function measureSmallTextHeight(font: SmallFontData, text: string): number {
  const lineCount = (text.match(/\n/g) || []).length + 1;
  return font.cellSize * lineCount;
}

export function measureSmallTextWidth(font: SmallFontData, text: string): number {
  let x = 0;
  let best = 0;
  for (let i = 0; i < text.length; i++) {
    const value = text.charCodeAt(i);
    if (value === 0x0A) {
      best = Math.max(best, x);
      x = 0;
      continue;
    }
    if (value === 0x0D) continue;
    const charCode = value > 255 ? 63 : value;
    const width = font.widths[charCode];
    if (width <= 0) continue;
    x += width;
  }
  return Math.max(best, x);
}
