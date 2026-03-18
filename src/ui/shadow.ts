import { WebGLContext, GlTexture, BlendMode } from '../engine/webgl.ts';

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
  ctx.setCustomBlendFactorsSeparate(
    0 /* gl.ZERO */, 0x0303 /* gl.ONE_MINUS_SRC_ALPHA */, 0x8006 /* gl.FUNC_ADD */,
    0 /* gl.ZERO */, 1 /* gl.ONE */, 0x8006 /* gl.FUNC_ADD */,
  );
  ctx.setBlendMode(BlendMode.CUSTOM);
  ctx.drawTexturePro(texture, src, dst, origin, rotationDeg, UI_SHADOW_TINT);
  ctx.setBlendMode(BlendMode.ALPHA);
}
