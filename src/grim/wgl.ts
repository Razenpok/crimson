import { type WebGLContext, type RenderTarget, BlendMode } from "@grim/webgl.js";

export { BlendMode };
export type { RenderTarget };

// ---------------------------------------------------------------------------
// Branded types
// ---------------------------------------------------------------------------

export type Brand<K, T extends string> = K & { readonly __brand: T };
// Kludge for in-progress porting.
export type Unbrand<T> =
  T extends [infer A, infer B, infer C, infer D] & { readonly __brand: string } ? [A, B, C, D] :
    T extends [infer A, infer B] & { readonly __brand: string } ? [A, B] :
      T;

export type Color = Brand<[number, number, number, number], 'Color'>;
export function makeColor(r: number, g: number, b: number, a: number): Color { return [r, g, b, a] as Color; }

export type Rectangle = Brand<[number, number, number, number], 'Rectangle'>;
export function makeRectangle(x: number, y: number, w: number, h: number): Rectangle { return [x, y, w, h] as Rectangle; }

export type Vector2 = Brand<[number, number], 'Vector2'>;
export function makeVector2(x: number, y: number): Vector2 { return [x, y] as Vector2; }

export interface Texture {
  id: WebGLTexture;
  width: number;
  height: number;
}

export function makeTexture(id: WebGLTexture, width: number, height: number): Texture { return { id, width, height }; }

// ---------------------------------------------------------------------------
// Module-level context (set once at startup via setContext)
// ---------------------------------------------------------------------------

let ctx: WebGLContext;
export function setContext(context: WebGLContext): void { ctx = context; }

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function getScreenWidth(): number { return ctx.screenWidth; }
export function getScreenHeight(): number { return ctx.screenHeight; }
export function clearBackground(color: Color): void {
  ctx.clearBackground(color[0], color[1], color[2], color[3]);
}

// ---------------------------------------------------------------------------
// Drawing — matches rl.draw_texture_pro / rl.draw_rectangle
// ---------------------------------------------------------------------------

export function drawTexturePro(
  texture: Texture,
  source: Rectangle,
  dest: Rectangle,
  origin: Vector2,
  rotation: number,
  tint: Color,
): void {
  ctx.drawTexturePro(texture, source, dest, origin, rotation, tint);
}

export function drawRectangle(x: number, y: number, w: number, h: number, color: Color): void {
  ctx.drawRectangle(x, y, w, h, color[0], color[1], color[2], color[3]);
}

// ---------------------------------------------------------------------------
// Blend modes — matches rl.begin_blend_mode / rl.end_blend_mode
// ---------------------------------------------------------------------------

export function beginBlendMode(mode: BlendMode): void { ctx.setBlendMode(mode); }
export function endBlendMode(): void { ctx.setBlendMode(BlendMode.ALPHA); }

// matches rl.rl_set_blend_factors / rl.rl_set_blend_factors_separate
export function rlSetBlendFactors(src: number, dst: number, eq: number): void {
  ctx.setCustomBlendFactors(src, dst, eq);
}
export function rlSetBlendFactorsSeparate(
  srcRGB: number, dstRGB: number, eqRGB: number,
  srcA: number, dstA: number, eqA: number,
): void {
  ctx.setCustomBlendFactorsSeparate(srcRGB, dstRGB, eqRGB, srcA, dstA, eqA);
}

// ---------------------------------------------------------------------------
// Alpha test & color mask — matches rl.rl_color_mask
// ---------------------------------------------------------------------------

export function setAlphaTest(enabled: boolean): void { ctx.setAlphaTest(enabled); }
export function rlColorMask(r: boolean, g: boolean, b: boolean, a: boolean): void { ctx.setColorMask(r, g, b, a); }

// ---------------------------------------------------------------------------
// Scissor
// ---------------------------------------------------------------------------

export function setScissor(x: number, y: number, w: number, h: number): void { ctx.setScissor(x, y, w, h); }
export function clearScissor(): void { ctx.clearScissor(); }

// ---------------------------------------------------------------------------
// Immediate-mode quads — matches rl.rl_begin / rl.rl_end / rl.rl_vertex2f etc.
// ---------------------------------------------------------------------------

export function beginQuads(texture: Texture): void { ctx.beginQuads(texture); }
export function endQuads(): void { ctx.endQuads(); }
export function rlTexCoord2f(u: number, v: number): void { ctx.texCoord2f(u, v); }
export function rlColor4f(r: number, g: number, b: number, a: number): void { ctx.color4f(r, g, b, a); }
export function rlVertex2f(x: number, y: number): void { ctx.vertex2f(x, y); }

// ---------------------------------------------------------------------------
// Render targets — matches rl.begin_texture_mode / rl.end_texture_mode
// ---------------------------------------------------------------------------

export function beginTextureMode(rt: RenderTarget): void { ctx.beginRenderTarget(rt); }
export function endTextureMode(): void { ctx.endRenderTarget(); }
export function loadRenderTexture(width: number, height: number): RenderTarget { return ctx.createRenderTarget(width, height); }
export function unloadRenderTexture(rt: RenderTarget): void { ctx.destroyRenderTarget(rt); }

// ---------------------------------------------------------------------------
// Texture management
// ---------------------------------------------------------------------------

export function loadTexture(
  source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
  opts?: { clamp?: boolean; pointFilter?: boolean },
): Texture { return ctx.loadTexture(source, opts); }
export function unloadTexture(texture: Texture): void { ctx.unloadTexture(texture); }

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function flush(): void { ctx.flush(); }
export function getWhiteTexture(): Texture { return ctx.whiteTexture; }
export function resize(width: number, height: number): void { ctx.resize(width, height); }
export function getCanvas(): HTMLCanvasElement { return ctx.canvas; }
export function destroy(): void { ctx.destroy(); }

// ---------------------------------------------------------------------------
// Blend factor constants — matches rd.* (raylib defines)
// These are standard WebGL enum values.
// ---------------------------------------------------------------------------

export const RL_SRC_ALPHA = 0x0302;
export const RL_ONE_MINUS_SRC_ALPHA = 0x0303;
export const RL_ONE = 1;
export const RL_ZERO = 0;
export const RL_DST_COLOR = 0x0306;
export const RL_ONE_MINUS_DST_COLOR = 0x0307;
export const RL_FUNC_ADD = 0x8006;
export const RL_DST_ALPHA = 0x0304;
export const RL_SRC_COLOR = 0x0300;
