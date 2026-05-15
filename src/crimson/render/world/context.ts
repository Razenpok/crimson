// Port of crimson/render/world/context.py

import { TextureId, getTexture } from '@grim/assets.ts';
import { Vec2 } from '@grim/geom.ts';
import * as wgl from '@wgl';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import * as viewport from './viewport.ts';
import { RAD_TO_DEG } from './constants.ts';
import type { RenderFrame } from '@crimson/render/frame.ts';
import type { WorldRenderer } from './renderer.ts';

export class WorldRenderCtx {
  renderer: WorldRenderer;
  frame: RenderFrame;
  projectionCamera: Vec2 | null = null;
  projectionViewScale: Vec2 | null = null;

  constructor(opts: {
    renderer: WorldRenderer;
    frame: RenderFrame;
    projectionCamera?: Vec2 | null;
    projectionViewScale?: Vec2 | null;
  }) {
    this.renderer = opts.renderer;
    this.frame = opts.frame;
    this.projectionCamera = opts.projectionCamera ?? null;
    this.projectionViewScale = opts.projectionViewScale ?? null;
  }

  cameraScreenSize(opts: { runtimeW?: number | null; runtimeH?: number | null } = {}): Vec2 {
    const outW = opts.runtimeW ?? wgl.getScreenWidth();
    const outH = opts.runtimeH ?? wgl.getScreenHeight();
    return viewport.cameraScreenSize({
      worldSize: this.frame.worldSize,
      config: this.frame.config,
      runtimeW: outW,
      runtimeH: outH,
    });
  }

  clampCamera(camera: Vec2, screenSize: Vec2): Vec2 {
    return viewport.clampCamera({ worldSize: this.frame.worldSize, camera, screenSize });
  }

  worldParams(): [Vec2, Vec2] {
    const outSize = new Vec2(wgl.getScreenWidth(), wgl.getScreenHeight());
    const [camera, viewScale] = viewport.viewTransform({
      worldSize: this.frame.worldSize,
      config: this.frame.config,
      camera: this.frame.camera,
      outSize,
    });
    return [camera, viewScale];
  }

  static worldToScreenWith(pos: Vec2, opts: { camera: Vec2; viewScale: Vec2 }): Vec2 {
    return viewport.worldToScreenWith(pos, { camera: opts.camera, viewScale: opts.viewScale });
  }

  static viewScaleAvg(viewScale: Vec2): number {
    return viewport.viewScaleAvg(viewScale);
  }

  drawAtlasSprite(
    texture: wgl.Texture,
    opts: {
      grid: number;
      frame: number;
      pos: Vec2;
      scale: number;
      rotationRad?: number;
      tint?: wgl.Color;
    },
  ): void {
    let grid = Math.max(1, int(opts.grid));
    let frame = Math.max(0, int(opts.frame));
    const cellW = texture.width / grid;
    const cellH = texture.height / grid;
    const col = frame % grid;
    const row = Math.floor(frame / grid);
    const src = wgl.makeRectangle(cellW * col, cellH * row, cellW, cellH);
    const w = cellW * opts.scale;
    const h = cellH * opts.scale;
    const dst = wgl.makeRectangle(opts.pos.x, opts.pos.y, w, h);
    const origin = wgl.makeVector2(w * 0.5, h * 0.5);
    const rotationRad = opts.rotationRad ?? 0.0;
    const tint = opts.tint ?? wgl.makeColor(1, 1, 1, 1);
    wgl.drawTexturePro(texture, src, dst, origin, rotationRad * RAD_TO_DEG, tint);
  }

  withProjection(opts: { camera: Vec2; viewScale: Vec2 }): WorldRenderCtx {
    return new WorldRenderCtx({
      renderer: this.renderer,
      frame: this.frame,
      projectionCamera: opts.camera,
      projectionViewScale: opts.viewScale,
    });
  }

  static isBulletTrailType(typeId: number): boolean {
    return isBulletTrailType(typeId);
  }

  static bulletSpriteSize(typeId: number, opts: { scale: number }): number {
    return bulletSpriteSize(typeId, { scale: opts.scale });
  }

  isBulletTrailType(typeId: number): boolean {
    return WorldRenderCtx.isBulletTrailType(typeId);
  }

  bulletSpriteSize(typeId: number, opts: { scale: number }): number {
    return WorldRenderCtx.bulletSpriteSize(typeId, { scale: opts.scale });
  }

  drawBulletTrail(
    start: Vec2,
    end: Vec2,
    opts: { typeId: number; alpha: number; scale: number; angle: number },
  ): boolean {
    return drawBulletTrail(this, start, end, opts);
  }

  worldToScreen(pos: Vec2): Vec2 {
    let camera = this.projectionCamera;
    let viewScale = this.projectionViewScale;
    if (camera === null || viewScale === null) {
      [camera, viewScale] = this.worldParams();
    }
    return WorldRenderCtx.worldToScreenWith(pos, { camera, viewScale });
  }

  screenToWorld(pos: Vec2): Vec2 {
    let camera = this.projectionCamera;
    let viewScale = this.projectionViewScale;
    if (camera === null || viewScale === null) {
      [camera, viewScale] = this.worldParams();
    }
    return viewport.screenToWorldWith(pos, { camera, viewScale });
  }
}

export function buildWorldRenderCtx(
  renderer: WorldRenderer,
  opts: { renderFrame: RenderFrame },
): WorldRenderCtx {
  return new WorldRenderCtx({
    renderer,
    frame: opts.renderFrame,
  });
}

export function isBulletTrailType(typeId: number): boolean {
  return (0 <= typeId && typeId < 8) || typeId === ProjectileTemplateId.SPLITTER_GUN;
}

export function bulletSpriteSize(typeId: number, opts: { scale: number }): number {
  let base = 4.0;
  if (typeId === ProjectileTemplateId.ASSAULT_RIFLE) {
    base = 6.0;
  } else if (typeId === ProjectileTemplateId.SUBMACHINE_GUN) {
    base = 8.0;
  }
  return Math.max(2.0, base * opts.scale);
}

function drawBulletTrail(
  renderCtx: WorldRenderCtx,
  start: Vec2,
  end: Vec2,
  opts: { typeId: number; alpha: number; scale: number; angle: number },
): boolean {
  const bulletTrailTexture = getTexture(renderCtx.frame.resources, TextureId.BULLET_TRAIL);
  const typeId = opts.typeId;
  const alpha = opts.alpha;
  if (alpha <= 0) return false;

  const segment = end.sub(start);
  const [direction, dist] = segment.normalizedWithLength();

  // Native uses projectile travel direction as the side-offset basis and still emits the
  // trail quad even when origin=head (degenerate impact frames).
  let sideMul: number;
  if (typeId === ProjectileTemplateId.PISTOL || typeId === ProjectileTemplateId.ASSAULT_RIFLE) {
    sideMul = 1.2;
  } else if (typeId === ProjectileTemplateId.GAUSS_GUN) {
    sideMul = 1.1;
  } else {
    sideMul = 0.7;
  }
  const half = 1.5 * sideMul * opts.scale;

  let side: Vec2;
  if (dist > 1e-6) {
    side = direction.perpLeft();
  } else {
    side = Vec2.fromAngle(opts.angle);
  }

  const sideOffset = side.mul(half);
  const p0 = start.sub(sideOffset);
  const p1 = start.add(sideOffset);
  const p2 = end.add(sideOffset);
  const p3 = end.sub(sideOffset);

  // Native uses additive blending for bullet trails and sets color slots per projectile type.
  // Gauss has a distinct blue tint; most other bullet trails are neutral gray.
  let headRgb: [number, number, number];
  if (typeId === ProjectileTemplateId.GAUSS_GUN) {
    headRgb = [51 / 255, 128 / 255, 255 / 255]; // (0.2, 0.5, 1.0)
  } else {
    headRgb = [128 / 255, 128 / 255, 128 / 255]; // (0.5, 0.5, 0.5)
  }
  const tailRgb: [number, number, number] = [128 / 255, 128 / 255, 128 / 255];
  const alphaNorm = alpha / 255;

  wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);
  wgl.beginQuads(bulletTrailTexture);

  wgl.rlColor4f(tailRgb[0], tailRgb[1], tailRgb[2], 0);
  wgl.rlTexCoord2f(0.0, 0.0);
  wgl.rlVertex2f(p0.x, p0.y);

  wgl.rlColor4f(tailRgb[0], tailRgb[1], tailRgb[2], 0);
  wgl.rlTexCoord2f(1.0, 0.0);
  wgl.rlVertex2f(p1.x, p1.y);

  wgl.rlColor4f(headRgb[0], headRgb[1], headRgb[2], alphaNorm);
  wgl.rlTexCoord2f(1.0, 0.5);
  wgl.rlVertex2f(p2.x, p2.y);

  wgl.rlColor4f(headRgb[0], headRgb[1], headRgb[2], alphaNorm);
  wgl.rlTexCoord2f(0.0, 0.5);
  wgl.rlVertex2f(p3.x, p3.y);

  wgl.endQuads();
  wgl.endBlendMode();
  return true;
}
