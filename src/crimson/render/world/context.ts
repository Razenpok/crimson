// Port of crimson/render/world/context.py

import * as wgl from '@wgl';
import { TextureId, getTexture } from '@grim/assets.ts';
import { Vec2 } from '@grim/geom.ts';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import type { RenderFrame } from '@crimson/render/frame.ts';
import { RAD_TO_DEG } from './constants.ts';
import * as viewport from './viewport.ts';
import type { WorldRenderer } from './renderer.ts';

export class WorldRenderCtx {
  renderer: WorldRenderer;
  frame: RenderFrame;
  projectionCamera: Vec2 | null = null;
  projectionViewScale: Vec2 | null = null;

  constructor(renderer: WorldRenderer, frame: RenderFrame) {
    this.renderer = renderer;
    this.frame = frame;
  }

  cameraScreenSize(runtimeW?: number, runtimeH?: number): Vec2 {
    const outW = runtimeW ?? wgl.getScreenWidth();
    const outH = runtimeH ?? wgl.getScreenHeight();
    return viewport.cameraScreenSize(
      this.frame.worldSize,
      this.frame.config,
      outW,
      outH,
    );
  }

  clampCamera(camera: Vec2, screenSize: Vec2): Vec2 {
    return viewport.clampCamera(this.frame.worldSize, camera, screenSize);
  }

  worldParams(): [Vec2, Vec2] {
    const outSize = new Vec2(wgl.getScreenWidth(), wgl.getScreenHeight());
    const [camera, viewScale] = viewport.viewTransform(
      this.frame.worldSize,
      this.frame.config,
      this.frame.camera,
      outSize,
    );
    return [camera, viewScale];
  }

  static worldToScreenWith(pos: Vec2, camera: Vec2, viewScale: Vec2): Vec2 {
    return viewport.worldToScreenWith(pos, camera, viewScale);
  }

  static viewScaleAvg(viewScale: Vec2): number {
    return viewport.viewScaleAvg(viewScale);
  }

  drawAtlasSprite(
    texture: wgl.Texture,
    grid: number,
    frame: number,
    pos: Vec2,
    scale: number,
    rotationRad: number = 0.0,
    tint: [number, number, number, number] = [1, 1, 1, 1],
  ): void {
    grid = Math.max(1, grid | 0);
    frame = Math.max(0, frame | 0);
    const cellW = texture.width / grid;
    const cellH = texture.height / grid;
    const col = frame % grid;
    const row = (frame / grid) | 0;
    const src = wgl.makeRectangle(cellW * col, cellH * row, cellW, cellH);
    const w = cellW * scale;
    const h = cellH * scale;
    const dst = wgl.makeRectangle(pos.x, pos.y, w, h);
    const origin = wgl.makeVector2(w * 0.5, h * 0.5);
    wgl.drawTexturePro(texture, src, dst, origin, rotationRad * RAD_TO_DEG, tint as wgl.Color);
  }

  withProjection(camera: Vec2, viewScale: Vec2): WorldRenderCtx {
    const ctx = new WorldRenderCtx(this.renderer, this.frame);
    ctx.projectionCamera = camera;
    ctx.projectionViewScale = viewScale;
    return ctx;
  }

  static isBulletTrailType(typeId: number): boolean {
    return isBulletTrailType(typeId);
  }

  static bulletSpriteSize(typeId: number, scale: number): number {
    return bulletSpriteSize(typeId, scale);
  }

  drawBulletTrail(
    start: Vec2,
    end: Vec2,
    typeId: number,
    alpha: number,
    scale: number,
    angle: number,
  ): boolean {
    return drawBulletTrail(this, start, end, typeId, alpha, scale, angle);
  }

  worldToScreen(pos: Vec2): Vec2 {
    let camera = this.projectionCamera;
    let viewScale = this.projectionViewScale;
    if (camera === null || viewScale === null) {
      [camera, viewScale] = this.worldParams();
    }
    return WorldRenderCtx.worldToScreenWith(pos, camera, viewScale);
  }

  screenToWorld(pos: Vec2): Vec2 {
    let camera = this.projectionCamera;
    let viewScale = this.projectionViewScale;
    if (camera === null || viewScale === null) {
      [camera, viewScale] = this.worldParams();
    }
    return viewport.screenToWorldWith(pos, camera, viewScale);
  }
}

export function buildWorldRenderCtx(
  renderer: WorldRenderer,
  renderFrame: RenderFrame,
): WorldRenderCtx {
  return new WorldRenderCtx(renderer, renderFrame);
}

export function isBulletTrailType(typeId: number): boolean {
  return (0 <= typeId && typeId < 8) || typeId === ProjectileTemplateId.SPLITTER_GUN;
}

export function bulletSpriteSize(typeId: number, scale: number): number {
  let base = 4.0;
  if (typeId === ProjectileTemplateId.ASSAULT_RIFLE) {
    base = 6.0;
  } else if (typeId === ProjectileTemplateId.SUBMACHINE_GUN) {
    base = 8.0;
  }
  return Math.max(2.0, base * scale);
}

function drawBulletTrail(
  renderCtx: WorldRenderCtx,
  start: Vec2,
  end: Vec2,
  typeId: number,
  alpha: number,
  scale: number,
  angle: number,
): boolean {
  const bulletTrailTexture = getTexture(renderCtx.frame.resources, TextureId.BULLET_TRAIL);
  if (alpha <= 0) return false;

  const segment = end.sub(start);
  const [direction, dist] = segment.normalizedWithLength();

  let sideMul: number;
  if (typeId === ProjectileTemplateId.PISTOL || typeId === ProjectileTemplateId.ASSAULT_RIFLE) {
    sideMul = 1.2;
  } else if (typeId === ProjectileTemplateId.GAUSS_GUN) {
    sideMul = 1.1;
  } else {
    sideMul = 0.7;
  }
  const half = 1.5 * sideMul * scale;

  let side: Vec2;
  if (dist > 1e-6) {
    side = direction.perpLeft();
  } else {
    side = Vec2.fromAngle(angle);
  }

  const sideOffset = side.mul(half);
  const p0 = start.sub(sideOffset);
  const p1 = start.add(sideOffset);
  const p2 = end.add(sideOffset);
  const p3 = end.sub(sideOffset);

  let headRgb: [number, number, number];
  if (typeId === ProjectileTemplateId.GAUSS_GUN) {
    headRgb = [51 / 255, 128 / 255, 255 / 255];
  } else {
    headRgb = [128 / 255, 128 / 255, 128 / 255];
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
