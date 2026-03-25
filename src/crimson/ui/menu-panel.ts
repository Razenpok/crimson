// Port of crimson/ui/menu_panel.py

import * as wgl from '@wgl';
import { UI_SHADOW_OFFSET, drawUiQuadShadow } from './shadow.ts';

const MENU_PANEL_INSET = 1.0;
const MENU_PANEL_SRC_SLICE_Y1 = 130.0;
const MENU_PANEL_SRC_SLICE_Y2 = 150.0;
const MENU_PANEL_DST_TOP_H = 138.0;
const MENU_PANEL_DST_BOTTOM_H = 116.0;

const WHITE = wgl.makeColor(1, 1, 1, 1);

export function drawClassicMenuPanel(
  texture: wgl.Texture,
  dst: wgl.Rectangle,
  tint: wgl.Color = WHITE,
  shadow: boolean = false,
  flipX: boolean = false,
): void {
  const texW = texture.width;
  const texH = texture.height;
  if (texW <= 0.0 || texH <= 0.0) return;

  const inset = MENU_PANEL_INSET;
  const srcX = inset;
  const srcY = inset;
  const srcW = Math.max(0.0, texW - inset * 2.0);
  const srcH = Math.max(0.0, texH - inset * 2.0);

  const [dstX, dstY, dstW, dstH] = dst;

  const scale = dstW !== 0.0 ? dstW / 510.0 : 1.0;
  const topH = MENU_PANEL_DST_TOP_H * scale;
  const bottomH = MENU_PANEL_DST_BOTTOM_H * scale;
  const midH = dstH - topH - bottomH;

  const origin = wgl.makeVector2(0, 0);

  function flipSrc(rect: wgl.Rectangle): wgl.Rectangle {
    if (!flipX) return rect;
    return wgl.makeRectangle(rect[0], rect[1], -rect[2], rect[3]);
  }

  if (midH <= 0.0) {
    const src = flipSrc(wgl.makeRectangle(srcX, srcY, srcW, srcH));
    if (shadow) {
      drawUiQuadShadow(
        texture, src,
        wgl.makeRectangle(dstX + UI_SHADOW_OFFSET, dstY + UI_SHADOW_OFFSET, dstW, dstH),
        origin, 0.0,
      );
    }
    wgl.drawTexturePro(texture, src, dst, origin, 0.0, tint);
    return;
  }

  const srcTop = flipSrc(wgl.makeRectangle(srcX, srcY, srcW, Math.max(0.0, MENU_PANEL_SRC_SLICE_Y1 - inset)));
  const srcMid = flipSrc(wgl.makeRectangle(srcX, MENU_PANEL_SRC_SLICE_Y1, srcW, Math.max(0.0, MENU_PANEL_SRC_SLICE_Y2 - MENU_PANEL_SRC_SLICE_Y1)));
  const srcBot = flipSrc(wgl.makeRectangle(srcX, MENU_PANEL_SRC_SLICE_Y2, srcW, Math.max(0.0, (texH - inset) - MENU_PANEL_SRC_SLICE_Y2)));

  const dstTop = wgl.makeRectangle(dstX, dstY, dstW, topH);
  const dstMid = wgl.makeRectangle(dstX, dstY + topH, dstW, midH);
  const dstBot = wgl.makeRectangle(dstX, dstY + topH + midH, dstW, bottomH);

  if (shadow) {
    const slices: [typeof srcTop, typeof dstTop][] = [[srcTop, dstTop], [srcMid, dstMid], [srcBot, dstBot]];
    for (const [s, d] of slices) {
      drawUiQuadShadow(
        texture, s,
        wgl.makeRectangle(d[0] + UI_SHADOW_OFFSET, d[1] + UI_SHADOW_OFFSET, d[2], d[3]),
        origin, 0.0,
      );
    }
  }

  wgl.drawTexturePro(texture, srcTop, dstTop, origin, 0.0, tint);
  wgl.drawTexturePro(texture, srcMid, dstMid, origin, 0.0, tint);
  wgl.drawTexturePro(texture, srcBot, dstBot, origin, 0.0, tint);
}
