// Port of crimson/ui/shadow.py

import { WebGLContext, GlTexture, BlendMode } from '../../grim/webgl.ts';

// ui_element_render (0x446c40): shadow pass uses offset (7, 7), tint 0x44444444, and
// blend factors (src=ZERO, dst=ONE_MINUS_SRC_ALPHA).
export const UI_SHADOW_OFFSET = 7.0;
export const UI_SHADOW_TINT: [number, number, number, number] = [
  0x44 / 255, 0x44 / 255, 0x44 / 255, 0x44 / 255,
];

export function drawUiQuadShadow(
  ctx: WebGLContext,
  texture: GlTexture,
  src: [number, number, number, number],
  dst: [number, number, number, number],
  origin: [number, number],
  rotationDeg: number,
): void {
  // From original Python code (might not be true for WebGL):
  // NOTE: raylib/rlgl tracks custom blend factors as state; some backends
  // only apply them when switching the blend mode.
  ctx.setCustomBlendFactorsSeparate(
    0 /* gl.ZERO */,
    0x0303 /* gl.ONE_MINUS_SRC_ALPHA */,
    0x8006 /* gl.FUNC_ADD */,
    0 /* gl.ZERO */,
    1 /* gl.ONE */,
    0x8006 /* gl.FUNC_ADD */,
  );
  ctx.setBlendMode(BlendMode.CUSTOM);
  ctx.setCustomBlendFactorsSeparate(
    0 /* gl.ZERO */,
    0x0303 /* gl.ONE_MINUS_SRC_ALPHA */,
    0x8006 /* gl.FUNC_ADD */,
    0 /* gl.ZERO */,
    1 /* gl.ONE */,
    0x8006 /* gl.FUNC_ADD */,
  );
  ctx.drawTexturePro(texture, src, dst, origin, rotationDeg, UI_SHADOW_TINT);
  ctx.setBlendMode(BlendMode.ALPHA);
}
