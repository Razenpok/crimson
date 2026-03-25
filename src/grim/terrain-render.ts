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

export interface GroundDecal {
  texture: wgl.Texture;
  srcRect: wgl.Rectangle;
  pos: Vec2;
  width: number;
  height: number;
  rotationRad: number;
  tint: wgl.Color;
}

export interface GroundCorpseDecal {
  bodysetFrame: number;
  topLeft: Vec2;
  size: number;
  rotationRad: number;
  tint: wgl.Color;
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

  constructor(texture: wgl.Texture, overlay: wgl.Texture, overlayDetail: wgl.Texture) {
    this.texture = texture;
    this.overlay = overlay;
    this.overlayDetail = overlayDetail;
  }

  generationPending(): boolean {
    return this._scheduledSeed !== null;
  }

  renderTargetReady(): boolean {
    return this.renderTarget !== null && this._renderTargetReady;
  }

  processPending(): void {
    const seed = this._scheduledSeed;
    if (seed === null) return;
    this._scheduledSeed = null;
    this._generateTexture(seed);
  }

  scheduleGenerate(seed: number): void {
    this._scheduledSeed = seed;
  }

  private _ensureRenderTarget(): void {
    const scale = Math.min(Math.max(this.textureScale, 0.5), 4.0);
    this.textureScale = scale;
    const pixelScale = this._renderPixelRatio();
    const renderW = Math.max(1, Math.floor((this.width * pixelScale) / scale));
    const renderH = Math.max(1, Math.floor((this.height * pixelScale) / scale));

    if (this.renderTarget) {
      if (this.renderTarget.width === renderW && this.renderTarget.height === renderH) {
        this.textureFailed = false;
        return;
      }
      wgl.unloadRenderTexture(this.renderTarget);
      this.renderTarget = null;
      this._renderTargetReady = false;
    }

    try {
      this.renderTarget = wgl.loadRenderTexture(renderW, renderH);
      this.textureFailed = false;
    } catch {
      this.textureFailed = true;
      this.renderTarget = null;
      this._renderTargetReady = false;
    }
  }

  private _generateTexture(seed: number): void {
    this._ensureRenderTarget();
    if (!this.renderTarget) return;

    const rng = new CrtRand(seed);

    wgl.beginTextureMode(this.renderTarget);
    wgl.clearBackground(TERRAIN_CLEAR_COLOR);

    wgl.setAlphaTest(true);
    wgl.rlColorMask(true, true, true, false);
    wgl.endBlendMode();

    this._scatterTexture(this.texture, TERRAIN_BASE_TINT, rng, TERRAIN_DENSITY_BASE);
    this._scatterTexture(this.overlay, TERRAIN_OVERLAY_TINT, rng, TERRAIN_DENSITY_OVERLAY);
    this._scatterTexture(this.overlayDetail, TERRAIN_DETAIL_TINT, rng, TERRAIN_DENSITY_DETAIL);

    wgl.setAlphaTest(false);
    wgl.rlColorMask(true, true, true, true);
    wgl.endTextureMode();
    this._renderTargetReady = true;
  }

  private _scatterTexture(
    texture: wgl.Texture,
    tint: wgl.Color,
    rng: CrtRand,
    density: number,
  ): void {
    const area = this.width * this.height;
    const count = (area * density) >> TERRAIN_DENSITY_SHIFT;
    if (count <= 0) return;

    const invScale = 1.0 / this._normalizedTextureScale();
    const size = TERRAIN_PATCH_SIZE * invScale;
    const spanW = this.width + (TERRAIN_PATCH_OVERSCAN * 2) | 0;
    const spanH = spanW;
    const halfSize = size * 0.5;

    for (let i = 0; i < count; i++) {
      const angle = ((rng.rand() % TERRAIN_ROTATION_MAX) * 0.01) % (Math.PI * 2);
      const y = ((rng.rand() % spanH) - TERRAIN_PATCH_OVERSCAN) * invScale;
      const x = ((rng.rand() % spanW) - TERRAIN_PATCH_OVERSCAN) * invScale;

      wgl.drawTexturePro(
        texture,
        wgl.makeRectangle(0, 0, texture.width, texture.height),
        wgl.makeRectangle(x + halfSize, y + halfSize, size, size),
        wgl.makeVector2(halfSize, halfSize),
        angle * (180.0 / Math.PI),
        tint,
      );
    }
  }

  draw(camera: Vec2): void {
    const outW = Math.max(1.0, wgl.getScreenWidth());
    const outH = Math.max(1.0, wgl.getScreenHeight());
    const [screenW, screenH] = this._fitViewWindow(outW, outH);
    const cam = this._clampCamera(camera, screenW, screenH);
    this._drawView(cam, screenW, screenH, outW, outH);
  }

  drawView(camera: Vec2, screenW: number, screenH: number, outW: number, outH: number): void {
    this._drawView(camera, Math.max(1, screenW), Math.max(1, screenH), Math.max(1, outW), Math.max(1, outH));
  }

  private _drawView(camera: Vec2, screenW: number, screenH: number, outW: number, outH: number): void {
    if (!this.renderTarget || !this._renderTargetReady) {
      wgl.drawRectangle(0, 0, outW, outH, TERRAIN_CLEAR_COLOR);
      return;
    }

    const target = this.renderTarget;
    const u0 = -camera.x / this.width;
    const v0 = -camera.y / this.height;
    const u1 = u0 + screenW / this.width;
    const v1 = v0 + screenH / this.height;

    const srcX = u0 * target.width;
    const srcY = v0 * target.height;
    const srcW = (u1 - u0) * target.width;
    const srcH = (v1 - v0) * target.height;

    // WebGL render targets are NOT flipped (unlike raylib), so we sample directly
    wgl.beginBlendMode(wgl.BlendMode.NONE);
    wgl.drawTexturePro(
      target.texture,
      wgl.makeRectangle(srcX, srcY, srcW, srcH),
      wgl.makeRectangle(0, 0, outW, outH),
      wgl.makeVector2(0, 0),
      0,
      wgl.makeColor(1, 1, 1, 1),
    );
    wgl.endBlendMode();
  }

  private _fitViewWindow(screenW: number, screenH: number): [number, number] {
    const worldW = this.width;
    const worldH = this.height;
    if (worldW <= 0 || worldH <= 0) return [Math.max(1, screenW), Math.max(1, screenH)];

    const outW = Math.max(1, screenW);
    const outH = Math.max(1, screenH);
    const scale = Math.max(outW / worldW, outH / worldH, 1.0);
    const viewW = Math.min(worldW, outW / scale);
    const viewH = Math.min(worldH, outH / scale);
    return [viewW, viewH];
  }

  private _clampCamera(camera: Vec2, screenW: number, screenH: number): Vec2 {
    const minX = screenW - this.width;
    const minY = screenH - this.height;
    return new Vec2(
      Math.max(Math.min(camera.x, -1.0), minX),
      Math.max(Math.min(camera.y, -1.0), minY),
    );
  }

  private _renderPixelRatio(): number {
    // Matches Python's _render_pixel_ratio() which detects 2x retina scaling
    if (typeof window !== 'undefined' && window.devicePixelRatio === 2) {
      return 2.0;
    }
    return 1.0;
  }

  private _normalizedTextureScale(): number {
    let scale = this.textureScale;
    if (scale < 0.5) scale = 0.5;
    if (this._renderPixelRatio() === 2.0) {
      scale *= 0.5;
    }
    return scale;
  }

  bakeDecals(decals: GroundDecal[]): boolean {
    if (decals.length === 0) return false;
    if (!this.renderTarget || !this._renderTargetReady) return false;

    const invScale = 1.0 / this._normalizedTextureScale();

    wgl.beginTextureMode(this.renderTarget);
    wgl.setAlphaTest(true);
    wgl.rlColorMask(true, true, true, false);
    wgl.endBlendMode();

    for (const decal of decals) {
      const w = decal.width * invScale;
      const h = decal.height * invScale;
      wgl.drawTexturePro(
        decal.texture,
        decal.srcRect,
        wgl.makeRectangle(decal.pos.x * invScale, decal.pos.y * invScale, w, h),
        wgl.makeVector2(w * 0.5, h * 0.5),
        decal.rotationRad * (180 / Math.PI),
        decal.tint,
      );
    }

    wgl.setAlphaTest(false);
    wgl.rlColorMask(true, true, true, true);
    wgl.endTextureMode();
    this._renderTargetReady = true;
    return true;
  }

  bakeCorpseDecals(bodysetTexture: wgl.Texture, decals: GroundCorpseDecal[]): boolean {
    if (decals.length === 0) return false;
    if (!this.renderTarget || !this._renderTargetReady) return false;

    const scale = this._normalizedTextureScale();
    const invScale = 1.0 / scale;
    const offset = 2.0 * scale / this.width;

    wgl.beginTextureMode(this.renderTarget);
    wgl.setAlphaTest(true);

    // Shadow pass
    wgl.rlColorMask(true, true, true, false);
    wgl.rlSetBlendFactors(wgl.RL_ZERO, wgl.RL_ONE_MINUS_SRC_ALPHA, wgl.RL_FUNC_ADD);
    wgl.beginBlendMode(wgl.BlendMode.CUSTOM);

    for (const decal of decals) {
      const src = this._corpseSrc(bodysetTexture, decal.bodysetFrame);
      const size = decal.size * invScale * 1.064;
      const x = (decal.topLeft.x - 0.5) * invScale - offset;
      const y = (decal.topLeft.y - 0.5) * invScale - offset;
      const halfAlpha = Math.floor(decal.tint[3] * 0.5 * 255) / 255;
      wgl.drawTexturePro(
        bodysetTexture, src,
        wgl.makeRectangle(x + size * 0.5, y + size * 0.5, size, size),
        wgl.makeVector2(size * 0.5, size * 0.5),
        (decal.rotationRad - Math.PI * 0.5) * (180 / Math.PI),
        wgl.makeColor(decal.tint[0], decal.tint[1], decal.tint[2], halfAlpha),
      );
    }

    // Color pass
    wgl.endBlendMode();
    for (const decal of decals) {
      const src = this._corpseSrc(bodysetTexture, decal.bodysetFrame);
      const size = decal.size * invScale;
      const x = decal.topLeft.x * invScale - offset;
      const y = decal.topLeft.y * invScale - offset;
      wgl.drawTexturePro(
        bodysetTexture, src,
        wgl.makeRectangle(x + size * 0.5, y + size * 0.5, size, size),
        wgl.makeVector2(size * 0.5, size * 0.5),
        (decal.rotationRad - Math.PI * 0.5) * (180 / Math.PI),
        decal.tint,
      );
    }

    wgl.setAlphaTest(false);
    wgl.rlColorMask(true, true, true, true);
    wgl.endTextureMode();
    this._renderTargetReady = true;
    return true;
  }

  private _corpseSrc(bodysetTexture: wgl.Texture, frame: number): wgl.Rectangle {
    frame = frame & 0xF;
    const cellW = bodysetTexture.width * 0.25;
    const cellH = bodysetTexture.height * 0.25;
    const col = frame & 3;
    const row = frame >> 2;
    return wgl.makeRectangle(cellW * col, cellH * row, cellW, cellH);
  }

  destroy(): void {
    if (this.renderTarget) {
      wgl.unloadRenderTexture(this.renderTarget);
      this.renderTarget = null;
      this._renderTargetReady = false;
    }
  }
}
