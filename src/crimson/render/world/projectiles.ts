// Port of crimson/render/world/projectiles.py

import { TextureId, getTexture } from '../../../grim/assets.ts';
import { Vec2 } from '../../../grim/geom.ts';
import { clamp } from '../../../grim/math.ts';
import { BlendMode } from '../../../grim/webgl.ts';
import { PerkId } from '../../perks/ids.ts';
import { perkActive } from '../../perks/helpers.ts';
import { KNOWN_PROJ_FRAMES } from '../../sim/world-defs.ts';
import type { Projectile, SecondaryProjectile } from '../../projectiles/types.ts';
import { knownProjRgb } from '../projectile-render-registry.ts';
import { drawProjectileFromRegistry } from '../projectile-draw/primary-dispatch.ts';
import { drawSecondaryProjectileFromRegistry } from '../projectile-draw/secondary-dispatch.ts';
import type { ProjectileDrawCtx } from '../projectile-draw/types.ts';
import type { SecondaryProjectileDrawCtx } from '../projectile-draw/types.ts';
import { WorldRenderCtx } from './context.ts';

export function drawProjectile(
  renderCtx: WorldRenderCtx,
  proj: Projectile,
  projIndex: number,
  camera: Vec2,
  viewScale: Vec2,
  scale: number,
  alpha: number = 1.0,
): void {
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const projectileRenderCtx = renderCtx.withProjection(camera, viewScale);
  const texture = getTexture(projectileRenderCtx.frame.resources, TextureId.PROJS);
  const typeId = proj.typeId;
  const projPos = proj.pos;
  const screen = projectileRenderCtx.worldToScreen(projPos);
  const life = proj.lifeTimer;
  const angle = proj.angle;

  const registryCtx: ProjectileDrawCtx = {
    renderer: projectileRenderCtx,
    proj,
    projIndex: projIndex | 0,
    texture,
    typeId: typeId as number,
    pos: projPos,
    screenPos: screen,
    life,
    angle,
    scale,
    alpha,
  };
  if (drawProjectileFromRegistry(registryCtx)) return;

  const mapping = KNOWN_PROJ_FRAMES.get(typeId);
  if (mapping === undefined) return;
  const [grid, frame] = mapping;
  const alphaByte = clamp(clamp(life / 0.4, 0.0, 1.0) * alpha, 0.0, 1.0);
  const [red, green, blue] = knownProjRgb(typeId);
  const tint: [number, number, number, number] = [red / 255, green / 255, blue / 255, alphaByte];
  renderCtx.drawAtlasSprite(texture, grid, frame, screen, 0.6 * scale, angle, tint);
}

export function isBulletTrailType(typeId: number): boolean {
  return WorldRenderCtx.isBulletTrailType(typeId);
}

export function bulletSpriteSize(typeId: number, scale: number): number {
  return WorldRenderCtx.bulletSpriteSize(typeId, scale);
}

export function drawBulletTrail(
  renderCtx: WorldRenderCtx,
  start: Vec2,
  end: Vec2,
  typeId: number,
  alpha: number,
  scale: number,
  angle: number,
): boolean {
  return renderCtx.drawBulletTrail(start, end, typeId, alpha, scale, angle);
}

export function drawSharpshooterLaserSight(
  renderCtx: WorldRenderCtx,
  camera: Vec2,
  viewScale: Vec2,
  scale: number,
  alpha: number,
): void {
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const bulletTrailTexture = getTexture(renderCtx.frame.resources, TextureId.BULLET_TRAIL);
  const players = renderCtx.frame.players;
  if (!players.length) return;

  const tailAlpha = clamp(alpha * 0.5, 0.0, 1.0);
  const headAlpha = clamp(alpha * 0.2, 0.0, 1.0);

  const ctx = renderCtx.gl;
  ctx.setBlendMode(BlendMode.ADDITIVE);
  ctx.beginQuads(bulletTrailTexture);

  for (const player of players) {
    if (player.health <= 0.0) continue;
    if (!perkActive(player, PerkId.SHARPSHOOTER)) continue;

    const playerPos = player.pos;
    const aimHeading = player.aimHeading;
    const aimDir = Vec2.fromHeading(aimHeading);
    const start = playerPos.add(aimDir.mul(15.0));
    const end = playerPos.add(aimDir.mul(512.0));

    const startScreen = WorldRenderCtx.worldToScreenWith(start, camera, viewScale);
    const endScreen = WorldRenderCtx.worldToScreenWith(end, camera, viewScale);
    const segment = endScreen.sub(startScreen);
    const [direction, dist] = segment.normalizedWithLength();
    if (dist <= 1e-3) continue;

    const thickness = Math.max(1.0, 2.0 * scale);
    const half = thickness * 0.5;
    const sideOffset = direction.perpLeft().mul(half);
    const p0 = startScreen.sub(sideOffset);
    const p1 = startScreen.add(sideOffset);
    const p2 = endScreen.add(sideOffset);
    const p3 = endScreen.sub(sideOffset);

    ctx.color4f(1, 0, 0, tailAlpha);
    ctx.texCoord2f(0.0, 0.0);
    ctx.vertex2f(p0.x, p0.y);

    ctx.color4f(1, 0, 0, tailAlpha);
    ctx.texCoord2f(1.0, 0.0);
    ctx.vertex2f(p1.x, p1.y);

    ctx.color4f(1, 0, 0, headAlpha);
    ctx.texCoord2f(1.0, 0.5);
    ctx.vertex2f(p2.x, p2.y);

    ctx.color4f(1, 0, 0, headAlpha);
    ctx.texCoord2f(0.0, 0.5);
    ctx.vertex2f(p3.x, p3.y);
  }

  ctx.endQuads();
  ctx.setBlendMode(BlendMode.ALPHA);
}

export function drawSecondaryProjectile(
  renderCtx: WorldRenderCtx,
  proj: SecondaryProjectile,
  camera: Vec2,
  viewScale: Vec2,
  scale: number,
  alpha: number = 1.0,
): void {
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const projectileRenderCtx = renderCtx.withProjection(camera, viewScale);
  const projPos = proj.pos;
  const screen = projectileRenderCtx.worldToScreen(projPos);
  const projType = proj.typeId;
  const angle = proj.angle;

  const registryCtx: SecondaryProjectileDrawCtx = {
    renderer: projectileRenderCtx,
    proj,
    projType,
    screenPos: screen,
    angle,
    scale,
    alpha,
  };
  if (drawSecondaryProjectileFromRegistry(registryCtx)) return;

  // Fallback: draw a small colored circle approximation using a white texture quad.
  const ctx = renderCtx.gl;
  const r = Math.max(1.0, 4.0 * scale);
  const size = r * 2.0;
  const whTex = ctx.whiteTexture;
  const src: [number, number, number, number] = [0, 0, 1, 1];
  const dst: [number, number, number, number] = [screen.x, screen.y, size, size];
  const origin: [number, number] = [size * 0.5, size * 0.5];
  const tint: [number, number, number, number] = [200 / 255, 200 / 255, 220 / 255, (200 / 255) * alpha];
  ctx.drawTexturePro(whTex, src, dst, origin, 0, tint);
}
