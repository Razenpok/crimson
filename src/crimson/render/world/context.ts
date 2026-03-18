// Port of crimson/render/world/context.py

import { TextureId, getTexture } from '../../../grim/assets.ts';
import { Vec2 } from '../../../grim/geom.ts';
import { type GlTexture, type WebGLContext, BlendMode } from '../../../grim/webgl.ts';
import { ProjectileTemplateId } from '../../projectiles/types.ts';
import type { RenderFrame } from '../frame.ts';
import { RAD_TO_DEG } from './constants.ts';
import * as viewport from './viewport.ts';
import type { WorldRenderer } from './renderer.ts';

export class WorldRenderCtx {
  renderer: WorldRenderer;
  frame: RenderFrame;
  gl: WebGLContext;
  projectionCamera: Vec2 | null = null;
  projectionViewScale: Vec2 | null = null;

  constructor(renderer: WorldRenderer, frame: RenderFrame, gl: WebGLContext) {
    this.renderer = renderer;
    this.frame = frame;
    this.gl = gl;
  }

  cameraScreenSize(runtimeW?: number, runtimeH?: number): Vec2 {
    const outW = runtimeW ?? this.gl.screenWidth;
    const outH = runtimeH ?? this.gl.screenHeight;
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
    const outSize = new Vec2(this.gl.screenWidth, this.gl.screenHeight);
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
    texture: GlTexture,
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
    const src: [number, number, number, number] = [cellW * col, cellH * row, cellW, cellH];
    const w = cellW * scale;
    const h = cellH * scale;
    const dst: [number, number, number, number] = [pos.x, pos.y, w, h];
    const origin: [number, number] = [w * 0.5, h * 0.5];
    this.gl.drawTexturePro(texture, src, dst, origin, rotationRad * RAD_TO_DEG, tint);
  }

  withProjection(camera: Vec2, viewScale: Vec2): WorldRenderCtx {
    const ctx = new WorldRenderCtx(this.renderer, this.frame, this.gl);
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
  gl: WebGLContext,
): WorldRenderCtx {
  return new WorldRenderCtx(renderer, renderFrame, gl);
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

  const ctx = renderCtx.gl;
  ctx.setBlendMode(BlendMode.ADDITIVE);
  ctx.beginQuads(bulletTrailTexture);

  ctx.color4f(tailRgb[0], tailRgb[1], tailRgb[2], 0);
  ctx.texCoord2f(0.0, 0.0);
  ctx.vertex2f(p0.x, p0.y);

  ctx.color4f(tailRgb[0], tailRgb[1], tailRgb[2], 0);
  ctx.texCoord2f(1.0, 0.0);
  ctx.vertex2f(p1.x, p1.y);

  ctx.color4f(headRgb[0], headRgb[1], headRgb[2], alphaNorm);
  ctx.texCoord2f(1.0, 0.5);
  ctx.vertex2f(p2.x, p2.y);

  ctx.color4f(headRgb[0], headRgb[1], headRgb[2], alphaNorm);
  ctx.texCoord2f(0.0, 0.5);
  ctx.vertex2f(p3.x, p3.y);

  ctx.endQuads();
  ctx.setBlendMode(BlendMode.ALPHA);
  return true;
}
