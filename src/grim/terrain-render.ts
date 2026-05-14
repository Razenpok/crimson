// Port of grim/terrain_render.py

import * as wgl from '@wgl';
import { Vec2 } from './geom.ts';
import { CrtRand } from './rand.ts';

export const TERRAIN_TEXTURE_SIZE = 1024;
export const TERRAIN_PATCH_SIZE = 128.0;
export const TERRAIN_PATCH_OVERSCAN = 64.0;
export const TERRAIN_CLEAR_COLOR = wgl.makeColor(63 / 255, 56 / 255, 25 / 255, 1.0);
export const TERRAIN_BASE_TINT = wgl.makeColor(178 / 255, 178 / 255, 178 / 255, 230 / 255);
export const TERRAIN_OVERLAY_TINT = wgl.makeColor(178 / 255, 178 / 255, 178 / 255, 230 / 255);
export const TERRAIN_DETAIL_TINT = wgl.makeColor(178 / 255, 178 / 255, 178 / 255, 153 / 255);
export const TERRAIN_DENSITY_BASE = 800;
export const TERRAIN_DENSITY_OVERLAY = 0x23;
export const TERRAIN_DENSITY_DETAIL = 0x0F;
export const TERRAIN_DENSITY_SHIFT = 19;
export const TERRAIN_ROTATION_MAX = 0x13A;

const WHITE = wgl.makeColor(1, 1, 1, 1);

// Grim2D enables alpha test globally with:
//   ALPHATESTENABLE=1, ALPHAFUNC=GREATER, ALPHAREF=4
// See: analysis/ghidra/raw/grim.dll_decompiled.c (FUN_10004520).
//
// WebGL does not expose fixed-function alpha test, so the renderer emulates it
// with a tiny discard shader selected by `wgl.setAlphaTest`.
// This shim is required for parity; shader/program creation failures surface
// through the WebGL context instead of silently drifting away from the native
// cutoff behavior.
function blendCustom(srcFactor: number, dstFactor: number, blendEquation: number, draw: () => void): void {
  // NOTE: raylib/rlgl tracks custom blend factors as state; some backends only
  // apply them when switching the blend mode. Set factors both before and
  // after BeginBlendMode() to ensure the current draw uses the intended values.
  wgl.rlSetBlendFactors(srcFactor, dstFactor, blendEquation);
  wgl.beginBlendMode(wgl.BlendMode.CUSTOM);
  wgl.rlSetBlendFactors(srcFactor, dstFactor, blendEquation);
  try {
    draw();
  } finally {
    wgl.endBlendMode();
  }
}

function colorMask(opts: { writeAlpha: boolean }, draw: () => void): void {
  wgl.rlColorMask(true, true, true, opts.writeAlpha);
  try {
    draw();
  } finally {
    wgl.rlColorMask(true, true, true, true);
  }
}

function terrainRtBlend(srcFactor: number, dstFactor: number, blendEquation: number, draw: () => void): void {
  colorMask({ writeAlpha: false }, () => {
    blendCustom(srcFactor, dstFactor, blendEquation, draw);
  });
}

function maybeAlphaTest(draw: () => void): void {
  wgl.setAlphaTest(true);
  try {
    draw();
  } finally {
    wgl.setAlphaTest(false);
  }
}

export class GroundDecal {
  texture: wgl.Texture;
  src: wgl.Rectangle;
  pos: Vec2;
  width: number;
  height: number;
  rotationRad: number;
  tint: wgl.Color;

  constructor(opts: {
    texture: wgl.Texture;
    src: wgl.Rectangle;
    pos: Vec2;
    width: number;
    height: number;
    rotationRad?: number;
    tint?: wgl.Color;
  }) {
    this.texture = opts.texture;
    this.src = opts.src;
    this.pos = opts.pos;
    this.width = opts.width;
    this.height = opts.height;
    this.rotationRad = opts.rotationRad ?? 0.0;
    this.tint = opts.tint ?? WHITE;
  }
}

export class GroundCorpseDecal {
  bodysetFrame: number;
  topLeft: Vec2;
  size: number;
  rotationRad: number;
  tint: wgl.Color;

  constructor(opts: {
    bodysetFrame: number;
    topLeft: Vec2;
    size: number;
    rotationRad: number;
    tint?: wgl.Color;
  }) {
    this.bodysetFrame = opts.bodysetFrame;
    this.topLeft = opts.topLeft;
    this.size = opts.size;
    this.rotationRad = opts.rotationRad;
    this.tint = opts.tint ?? WHITE;
  }
}

export class GroundRenderer {
  texture: wgl.Texture;
  overlay: wgl.Texture;
  overlayDetail: wgl.Texture;
  width = TERRAIN_TEXTURE_SIZE;
  height = TERRAIN_TEXTURE_SIZE;
  textureScale = 1.0;
  textureFailed = false;
  renderTarget: wgl.RenderTarget | null = null;
  private _renderTargetReady = false;
  private _scheduledSeed: number | null = null;

  constructor(opts: {
    texture: wgl.Texture;
    overlay: wgl.Texture;
    overlayDetail: wgl.Texture;
    width?: number;
    height?: number;
    textureScale?: number;
    textureFailed?: boolean;
    renderTarget?: wgl.RenderTarget | null;
  }) {
    this.texture = opts.texture;
    this.overlay = opts.overlay;
    this.overlayDetail = opts.overlayDetail;
    this.width = opts.width ?? TERRAIN_TEXTURE_SIZE;
    this.height = opts.height ?? TERRAIN_TEXTURE_SIZE;
    this.textureScale = opts.textureScale ?? 1.0;
    this.textureFailed = opts.textureFailed ?? false;
    this.renderTarget = opts.renderTarget ?? null;
  }

  generationPending(): boolean {
    // True while a scheduled terrain generate is still pending.
    return this._scheduledSeed !== null;
  }

  renderTargetReady(): boolean {
    // True when the terrain render target exists and is ready for drawing.
    return this.renderTarget !== null && this._renderTargetReady;
  }

  processPending(): void {
    const seed = this._scheduledSeed;
    if (seed === null) return;
    this._scheduledSeed = null;
    this._generateTexture(seed);
  }

  private _ensureRenderTarget(): void {
    const scale = Math.min(Math.max(this.textureScale, 0.5), 4.0);
    this.textureScale = scale;

    const [renderW, renderH] = this._renderTargetSizeFor(scale);
    if (this._loadRenderTarget(renderW, renderH)) {
      this.textureFailed = false;
      return;
    }

    this.textureFailed = true;
    if (this.renderTarget !== null) {
      wgl.unloadRenderTexture(this.renderTarget);
      this.renderTarget = null;
    }
    this._renderTargetReady = false;
  }

  scheduleGenerate(seed: number): void {
    this._scheduledSeed = seed;
  }

  private _generateTexture(seed: number): void {
    this._ensureRenderTarget();
    if (this.renderTarget === null) {
      return;
    }
    const rng = new CrtRand(seed);
    wgl.beginTextureMode(this.renderTarget);
    wgl.clearBackground(TERRAIN_CLEAR_COLOR);
    // Intentional rewrite deviation: the classic game appears to point-sample
    // terrain stamps while rotating them into the RT, but bilinear sampling
    // reads better in the port and still stays within current fixture tolerances.
    // Keep the ground RT alpha opaque like the original exe's XRGB-style RT.
    // The port does that by masking out alpha writes while stamping.
    maybeAlphaTest(() => {
      terrainRtBlend(wgl.RL_SRC_ALPHA, wgl.RL_ONE_MINUS_SRC_ALPHA, wgl.RL_FUNC_ADD, () => {
        this._scatterTexture(this.texture, TERRAIN_BASE_TINT, rng, TERRAIN_DENSITY_BASE);
        this._scatterTexture(this.overlay, TERRAIN_OVERLAY_TINT, rng, TERRAIN_DENSITY_OVERLAY);
        this._scatterTexture(this.overlayDetail, TERRAIN_DETAIL_TINT, rng, TERRAIN_DENSITY_DETAIL);
      });
    });
    wgl.endTextureMode();
    this._renderTargetReady = true;
  }

  bakeDecals(decals: GroundDecal[]): boolean {
    if (decals.length === 0) {
      return false;
    }

    if (this.renderTarget === null || !this._renderTargetReady) {
      return false;
    }

    const invScale = 1.0 / this._normalizedTextureScale();
    wgl.beginTextureMode(this.renderTarget);
    maybeAlphaTest(() => {
      terrainRtBlend(wgl.RL_SRC_ALPHA, wgl.RL_ONE_MINUS_SRC_ALPHA, wgl.RL_FUNC_ADD, () => {
        for (const decal of decals) {
          const w = decal.width * invScale;
          const h = decal.height * invScale;
          wgl.drawTexturePro(
            decal.texture,
            decal.src,
            wgl.makeRectangle(decal.pos.x * invScale, decal.pos.y * invScale, w, h),
            wgl.makeVector2(w * 0.5, h * 0.5),
            decal.rotationRad * (180 / Math.PI),
            decal.tint,
          );
        }
      });
    });
    wgl.endTextureMode();

    this._renderTargetReady = true;
    return true;
  }

  bakeCorpseDecals(
    bodysetTexture: wgl.Texture,
    decals: GroundCorpseDecal[],
  ): boolean {
    if (decals.length === 0) {
      return false;
    }

    if (this.renderTarget === null || !this._renderTargetReady) {
      return false;
    }

    const scale = this._normalizedTextureScale();
    const invScale = 1.0 / scale;
    const offset = 2.0 * scale / this.width;
    wgl.beginTextureMode(this.renderTarget);
    // Intentional rewrite deviation: the classic game appears to point-sample
    // corpse atlas frames while baking, but bilinear sampling reads better in
    // the port at modern output scales.
    maybeAlphaTest(() => {
      this._drawCorpseShadowPass(bodysetTexture, decals, invScale, offset);
      this._drawCorpseColorPass(bodysetTexture, decals, invScale, offset);
    });
    wgl.endTextureMode();

    this._renderTargetReady = true;
    return true;
  }

  draw(camera: Vec2): void {
    const outW = Math.max(1.0, wgl.getScreenWidth());
    const outH = Math.max(1.0, wgl.getScreenHeight());
    const [screenW, screenH] = this._fitViewWindow(outW, outH);
    const cam = this._clampCamera(camera, screenW, screenH);
    this._drawView(cam, screenW, screenH, outW, outH);
  }

  drawView(camera: Vec2, opts: { screenW: number; screenH: number; outW: number; outH: number }): void {
    this._drawView(
      camera,
      Math.max(1.0, opts.screenW),
      Math.max(1.0, opts.screenH),
      Math.max(1.0, opts.outW),
      Math.max(1.0, opts.outH),
    );
  }

  private _drawView(camera: Vec2, screenW: number, screenH: number, outW: number, outH: number): void {
    if (this.renderTarget === null || !this._renderTargetReady) {
      wgl.drawRectangle(0, 0, int(outW + 0.5), int(outH + 0.5), TERRAIN_CLEAR_COLOR);
      return;
    }

    const target = this.renderTarget;
    const u0 = -camera.x / this.width;
    const v0 = -camera.y / this.height;
    const u1 = u0 + screenW / this.width;
    const v1 = v0 + screenH / this.height;
    const srcX = u0 * target.width;
    // WebGL render targets are not vertically flipped, so sample the world-space
    // slice directly instead of applying raylib's negative source height.
    const srcY = v0 * target.height;
    const srcW = (u1 - u0) * target.width;
    const srcH = (v1 - v0) * target.height;
    // Disable alpha blending when drawing terrain to screen - the render target's
    // alpha channel may be < 1.0 after stamp blending, but terrain should be opaque.
    blendCustom(wgl.RL_ONE, wgl.RL_ZERO, wgl.RL_FUNC_ADD, () => {
      wgl.drawTexturePro(
        target.texture,
        wgl.makeRectangle(srcX, srcY, srcW, srcH),
        wgl.makeRectangle(0.0, 0.0, outW, outH),
        wgl.makeVector2(0.0, 0.0),
        0.0,
        WHITE,
      );
    });
  }

  private _fitViewWindow(screenW: number, screenH: number): [number, number] {
    // Convert output dimensions into a world-space camera window.
    //
    // Keep a uniform pixel scale and never request a camera window larger than
    // the terrain dimensions. This avoids non-uniform stretch on widescreen
    // outputs where only one axis exceeds world size.
    const worldW = this.width;
    const worldH = this.height;
    if (worldW <= 0.0 || worldH <= 0.0) {
      return [Math.max(1.0, screenW), Math.max(1.0, screenH)];
    }

    const outW = Math.max(1.0, screenW);
    const outH = Math.max(1.0, screenH);
    const scale = Math.max(outW / worldW, outH / worldH, 1.0);
    const viewW = Math.min(worldW, outW / scale);
    const viewH = Math.min(worldH, outH / scale);
    return [viewW, viewH];
  }

  private _scatterTexture(
    texture: wgl.Texture,
    tint: wgl.Color,
    rng: CrtRand,
    density: number,
  ): void {
    const area = this.width * this.height;
    const count = (area * density) >> TERRAIN_DENSITY_SHIFT;
    if (count <= 0) {
      return;
    }
    const invScale = 1.0 / this._normalizedTextureScale();
    const size = TERRAIN_PATCH_SIZE * invScale;
    const src = wgl.makeRectangle(0.0, 0.0, texture.width, texture.height);
    const origin = wgl.makeVector2(size * 0.5, size * 0.5);
    const spanW = this.width + int(TERRAIN_PATCH_OVERSCAN * 2);
    // The original exe uses `terrain_texture_width` for both axes. Terrain is
    // square (1024x1024) so this is equivalent, but keep it for parity.
    const spanH = spanW;
    for (let i = 0; i < count; i++) {
      const angle = ((rng.rand() % TERRAIN_ROTATION_MAX) * 0.01) % (Math.PI * 2);
      // IMPORTANT: The exe consumes RNG as rotation, then Y, then X.
      const y = ((rng.rand() % spanH) - TERRAIN_PATCH_OVERSCAN) * invScale;
      const x = ((rng.rand() % spanW) - TERRAIN_PATCH_OVERSCAN) * invScale;
      // raylib's DrawTexturePro positions the quad by the *origin point*,
      // while the original engine uses x/y as the quad top-left.
      const dst = wgl.makeRectangle(x + size * 0.5, y + size * 0.5, size, size);
      wgl.drawTexturePro(texture, src, dst, origin, angle * (180.0 / Math.PI), tint);
    }
  }

  private _clampCamera(camera: Vec2, screenW: number, screenH: number): Vec2 {
    const minX = screenW - this.width;
    const minY = screenH - this.height;
    return new Vec2(
      Math.max(Math.min(camera.x, -1.0), minX),
      Math.max(Math.min(camera.y, -1.0), minY),
    );
  }

  private _loadRenderTarget(renderW: number, renderH: number): boolean {
    if (this.renderTarget !== null) {
      if (this.renderTarget.width === renderW && this.renderTarget.height === renderH) {
        return true;
      }
      wgl.unloadRenderTexture(this.renderTarget);
      this.renderTarget = null;
      this._renderTargetReady = false;
    }

    try {
      // WebGL render-target creation checks framebuffer completeness so
      // incomplete FBO attachments fail immediately.
      this.renderTarget = wgl.loadRenderTexture(renderW, renderH);
    } catch {
      return false;
    }

    this._renderTargetReady = false;
    wgl.setTextureFilter(this.renderTarget.texture, wgl.TextureFilter.BILINEAR);
    wgl.setTextureWrap(this.renderTarget.texture, wgl.TextureWrap.CLAMP);
    return true;
  }

  private _renderPixelRatio(): number {
    if (typeof window !== 'undefined' && window.devicePixelRatio === 2) {
      return 2.0;
    }
    return 1.0;
  }

  private _renderTargetSizeFor(scale: number): [number, number] {
    const pixelScale = this._renderPixelRatio();
    const renderW = Math.max(1, int((this.width * pixelScale) / scale));
    const renderH = Math.max(1, int((this.height * pixelScale) / scale));
    return [renderW, renderH];
  }

  private _normalizedTextureScale(): number {
    let scale = this.textureScale;
    if (scale < 0.5) {
      scale = 0.5;
    }
    if (this._renderPixelRatio() === 2.0) {
      scale *= 0.5;
    }
    return scale;
  }

  private _corpseSrc(bodysetTexture: wgl.Texture, frame: number): wgl.Rectangle {
    frame = int(frame) & 0xF;
    const cellW = bodysetTexture.width * 0.25;
    const cellH = bodysetTexture.height * 0.25;
    const col = frame & 3;
    const row = frame >> 2;
    return wgl.makeRectangle(cellW * col, cellH * row, cellW, cellH);
  }

  private _drawCorpseShadowPass(
    bodysetTexture: wgl.Texture,
    decals: GroundCorpseDecal[],
    invScale: number,
    offset: number,
  ): void {
    terrainRtBlend(wgl.RL_ZERO, wgl.RL_ONE_MINUS_SRC_ALPHA, wgl.RL_FUNC_ADD, () => {
      for (const decal of decals) {
        const src = this._corpseSrc(bodysetTexture, decal.bodysetFrame);
        const size = decal.size * invScale * 1.064;
        const x = (decal.topLeft.x - 0.5) * invScale - offset;
        const y = (decal.topLeft.y - 0.5) * invScale - offset;
        const dst = wgl.makeRectangle(x + size * 0.5, y + size * 0.5, size, size);
        const origin = wgl.makeVector2(size * 0.5, size * 0.5);
        const tint = wgl.makeColor(
          decal.tint.r,
          decal.tint.g,
          decal.tint.b,
          int(decal.tint.a * 0.5 * 255) / 255,
        );
        wgl.drawTexturePro(
          bodysetTexture,
          src,
          dst,
          origin,
          (decal.rotationRad - (Math.PI * 0.5)) * (180 / Math.PI),
          tint,
        );
      }
    });
  }

  private _drawCorpseColorPass(
    bodysetTexture: wgl.Texture,
    decals: GroundCorpseDecal[],
    invScale: number,
    offset: number,
  ): void {
    terrainRtBlend(wgl.RL_SRC_ALPHA, wgl.RL_ONE_MINUS_SRC_ALPHA, wgl.RL_FUNC_ADD, () => {
      for (const decal of decals) {
        const src = this._corpseSrc(bodysetTexture, decal.bodysetFrame);
        const size = decal.size * invScale;
        const x = decal.topLeft.x * invScale - offset;
        const y = decal.topLeft.y * invScale - offset;
        const dst = wgl.makeRectangle(x + size * 0.5, y + size * 0.5, size, size);
        const origin = wgl.makeVector2(size * 0.5, size * 0.5);
        wgl.drawTexturePro(
          bodysetTexture,
          src,
          dst,
          origin,
          (decal.rotationRad - (Math.PI * 0.5)) * (180 / Math.PI),
          decal.tint,
        );
      }
    });
  }

  destroy(): void {
    if (this.renderTarget !== null) {
      wgl.unloadRenderTexture(this.renderTarget);
      this.renderTarget = null;
      this._renderTargetReady = false;
    }
  }
}
