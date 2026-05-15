// Port of grim/fonts/grim_mono.py

import { runtimeResourcesFor, TextureId } from '@grim/assets.ts';
import { Vec2 } from '@grim/geom.ts';
import * as wgl from '@wgl';

export const GRIM_MONO_ADVANCE = 16.0;
export const GRIM_MONO_DRAW_SIZE = 32.0;
export const GRIM_MONO_LINE_HEIGHT = 28.0;
export const GRIM_MONO_TEXTURE_FILTER = wgl.TextureFilter.BILINEAR;

export class GrimMonoFont {
  readonly texture: wgl.Texture;
  readonly grid: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly advance: number;

  constructor(opts: {
    texture: wgl.Texture;
    grid?: number;
    cellWidth?: number;
    cellHeight?: number;
    advance?: number;
  }) {
    this.texture = opts.texture;
    this.grid = opts.grid ?? 16;
    this.cellWidth = opts.cellWidth ?? 16.0;
    this.cellHeight = opts.cellHeight ?? 16.0;
    this.advance = opts.advance ?? GRIM_MONO_ADVANCE;
  }
}

export function createGrimMonoFont(texture: wgl.Texture): GrimMonoFont {
  wgl.setTextureFilter(texture, GRIM_MONO_TEXTURE_FILTER);
  const grid = 16;
  return new GrimMonoFont({
    texture,
    grid,
    cellWidth: texture.width / grid,
    cellHeight: texture.height / grid,
    advance: GRIM_MONO_ADVANCE,
  });
}

export function loadGrimMonoFont(assetsRoot: string): GrimMonoFont {
  const texture = runtimeResourcesFor(assetsRoot).texture(TextureId.DEFAULT_FONT_COURIER);
  return createGrimMonoFont(texture);
}

export function drawGrimMonoText(
  font: GrimMonoFont,
  text: string,
  pos: Vec2,
  scale: number,
  color: wgl.Color,
): void {
  let xPos = pos.x;
  let yPos = pos.y;
  const advance = font.advance * scale;
  const drawSize = GRIM_MONO_DRAW_SIZE * scale;
  const lineHeight = GRIM_MONO_LINE_HEIGHT * scale;
  const origin = wgl.makeVector2(0, 0);
  let skipAdvance = false;

  for (const ch of text) {
    const rawValue = ch.codePointAt(0) ?? 0;
    const value = rawValue > 255 ? 63 : rawValue;
    if (value === 0x0A) {
      xPos = pos.x;
      yPos += lineHeight;
      continue;
    }
    if (value === 0x0D) continue;
    if (value === 0xA7) {
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

    wgl.drawTexturePro(
      font.texture,
      wgl.makeRectangle(col * font.cellWidth, row * font.cellHeight, font.cellWidth, font.cellHeight),
      wgl.makeRectangle(xPos, yPos + 1.0, drawSize, drawSize),
      origin,
      0,
      color,
    );
  }
}

export function measureGrimMonoTextHeight(_font: GrimMonoFont, text: string, scale: number): number {
  const lineCount = (text.match(/\n/g) || []).length + 1;
  return GRIM_MONO_LINE_HEIGHT * scale * lineCount;
}
