// Port of crimson/ui/shadow.py

import * as wgl from '@wgl';

// ui_element_render (0x446c40): shadow pass uses offset (7, 7), tint 0x44444444, and
// blend factors (src=ZERO, dst=ONE_MINUS_SRC_ALPHA).
export const UI_SHADOW_OFFSET = 7.0;
export const UI_SHADOW_TINT: wgl.Color = wgl.makeColor(
  0x44 / 255, 0x44 / 255, 0x44 / 255, 0x44 / 255,
);

export function drawUiQuadShadow(
  texture: wgl.Texture,
  src: wgl.Rectangle,
  dst: wgl.Rectangle,
  origin: wgl.Vector2,
  rotationDeg: number,
): void {
  // From original Python code (might not be true for WebGL):
  // NOTE: raylib/rlgl tracks custom blend factors as state; some backends
  // only apply them when switching the blend mode.
  wgl.rlSetBlendFactorsSeparate(
    0 /* gl.ZERO */,
    0x0303 /* gl.ONE_MINUS_SRC_ALPHA */,
    0x8006 /* gl.FUNC_ADD */,
    0 /* gl.ZERO */,
    1 /* gl.ONE */,
    0x8006 /* gl.FUNC_ADD */,
  );
  wgl.beginBlendMode(wgl.BlendMode.CUSTOM);
  wgl.rlSetBlendFactorsSeparate(
    0 /* gl.ZERO */,
    0x0303 /* gl.ONE_MINUS_SRC_ALPHA */,
    0x8006 /* gl.FUNC_ADD */,
    0 /* gl.ZERO */,
    1 /* gl.ONE */,
    0x8006 /* gl.FUNC_ADD */,
  );
  wgl.drawTexturePro(texture, src, dst, origin, rotationDeg, UI_SHADOW_TINT);
  wgl.endBlendMode();
}
