// Port of grim/fonts/grim_mono.py

import { type GlTexture, type WebGLContext } from '@grim/webgl.ts';
import { Vec2 } from '@grim/geom.ts';

export const GRIM_MONO_ADVANCE = 16.0;
export const GRIM_MONO_DRAW_SIZE = 32.0;
export const GRIM_MONO_LINE_HEIGHT = 28.0;

export interface GrimMonoFont {
  texture: GlTexture;
  grid: number;
  cellWidth: number;
  cellHeight: number;
  advance: number;
}

export function createGrimMonoFont(texture: GlTexture): GrimMonoFont {
  const grid = 16;
  return {
    texture,
    grid,
    cellWidth: texture.width / grid,
    cellHeight: texture.height / grid,
    advance: GRIM_MONO_ADVANCE,
  };
}

export function drawGrimMonoText(
  ctx: WebGLContext,
  font: GrimMonoFont,
  text: string,
  pos: Vec2,
  scale: number,
  color: [number, number, number, number],
): void {
  let xPos = pos.x;
  let yPos = pos.y;
  const advance = font.advance * scale;
  const drawSize = GRIM_MONO_DRAW_SIZE * scale;
  const lineHeight = GRIM_MONO_LINE_HEIGHT * scale;
  let skipAdvance = false;

  for (let i = 0; i < text.length; i++) {
    const value = text.charCodeAt(i);
    if (value === 0x0A) {
      xPos = pos.x;
      yPos += lineHeight;
      continue;
    }
    if (value === 0x0D) continue;
    if (value === 0xA7) { // section sign — skip next advance
      skipAdvance = true;
      continue;
    }

    if (skipAdvance) {
      skipAdvance = false;
    } else {
      xPos += advance;
    }

    const charCode = value > 255 ? 63 : value;
    const col = charCode % font.grid;
    const row = Math.floor(charCode / font.grid);

    ctx.drawTexturePro(
      font.texture,
      [col * font.cellWidth, row * font.cellHeight, font.cellWidth, font.cellHeight],
      [xPos, yPos + 1.0, drawSize, drawSize],
      [0, 0],
      0,
      color,
    );
  }
}

export function measureGrimMonoTextHeight(_font: GrimMonoFont, text: string, scale: number): number {
  const lineCount = (text.match(/\n/g) || []).length + 1;
  return GRIM_MONO_LINE_HEIGHT * scale * lineCount;
}
