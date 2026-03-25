// Port of crimson/render/world/projectiles.py

import * as wgl from '@wgl';
import { TextureId, getTexture } from '@grim/assets.ts';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { KNOWN_PROJ_FRAMES } from '@crimson/sim/world-defs.ts';
import type { Projectile, SecondaryProjectile } from '@crimson/projectiles/types.ts';
import { knownProjRgb } from '@crimson/render/projectile-render-registry.ts';
import { drawProjectileFromRegistry } from '@crimson/render/projectile-draw/primary-dispatch.ts';
import { drawSecondaryProjectileFromRegistry } from '@crimson/render/projectile-draw/secondary-dispatch.ts';
import type { ProjectileDrawCtx } from '@crimson/render/projectile-draw/types.ts';
import type { SecondaryProjectileDrawCtx } from '@crimson/render/projectile-draw/types.ts';
import { WorldRenderCtx } from './context.ts';

export function drawProjectile(
  renderCtx: WorldRenderCtx,
  proj: Projectile,
  opts: { projIndex?: number; camera: Vec2; viewScale: Vec2; scale: number; alpha?: number },
): void {
  const { camera, viewScale, scale } = opts;
  const projIndex = opts.projIndex ?? 0;
  let alpha = clamp(opts.alpha ?? 1.0, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const projectileRenderCtx = renderCtx.withProjection({ camera, viewScale });
  const texture = getTexture(projectileRenderCtx.frame.resources, TextureId.PROJS);
  const typeId = proj.typeId;
  const projPos = proj.pos;
  const screen = projectileRenderCtx.worldToScreen(projPos);
  const life = proj.lifeTimer;
  const angle = proj.angle;

  const registryCtx: ProjectileDrawCtx = {
    renderer: projectileRenderCtx,
    proj,
    projIndex: int(projIndex),
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

export function bulletSpriteSize(typeId: number, opts: { scale: number }): number {
  return WorldRenderCtx.bulletSpriteSize(typeId, opts.scale);
}

export function drawBulletTrail(
  renderCtx: WorldRenderCtx,
  start: Vec2,
  end: Vec2,
  opts: { typeId: number; alpha: number; scale: number; angle: number },
): boolean {
  return renderCtx.drawBulletTrail(start, end, opts);
}

export function drawSharpshooterLaserSight(
  renderCtx: WorldRenderCtx,
  opts: { camera: Vec2; viewScale: Vec2; scale: number; alpha: number },
): void {
  const { camera, viewScale, scale } = opts;
  let alpha = clamp(opts.alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const bulletTrailTexture = getTexture(renderCtx.frame.resources, TextureId.BULLET_TRAIL);
  const players = renderCtx.frame.players;
  if (!players.length) return;

  const tailAlpha = clamp(alpha * 0.5, 0.0, 1.0);
  const headAlpha = clamp(alpha * 0.2, 0.0, 1.0);

  wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);
  wgl.beginQuads(bulletTrailTexture);

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

    wgl.rlColor4f(1, 0, 0, tailAlpha);
    wgl.rlTexCoord2f(0.0, 0.0);
    wgl.rlVertex2f(p0.x, p0.y);

    wgl.rlColor4f(1, 0, 0, tailAlpha);
    wgl.rlTexCoord2f(1.0, 0.0);
    wgl.rlVertex2f(p1.x, p1.y);

    wgl.rlColor4f(1, 0, 0, headAlpha);
    wgl.rlTexCoord2f(1.0, 0.5);
    wgl.rlVertex2f(p2.x, p2.y);

    wgl.rlColor4f(1, 0, 0, headAlpha);
    wgl.rlTexCoord2f(0.0, 0.5);
    wgl.rlVertex2f(p3.x, p3.y);
  }

  wgl.endQuads();
  wgl.endBlendMode();
}

export function drawSecondaryProjectile(
  renderCtx: WorldRenderCtx,
  proj: SecondaryProjectile,
  opts: { camera: Vec2; viewScale: Vec2; scale: number; alpha?: number },
): void {
  const { camera, viewScale, scale } = opts;
  let alpha = clamp(opts.alpha ?? 1.0, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const projectileRenderCtx = renderCtx.withProjection({ camera, viewScale });
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
  const r = Math.max(1.0, 4.0 * scale);
  const size = r * 2.0;
  const whTex = wgl.getWhiteTexture();
  const src = wgl.makeRectangle(0, 0, 1, 1);
  const dst = wgl.makeRectangle(screen.x, screen.y, size, size);
  const origin = wgl.makeVector2(size * 0.5, size * 0.5);
  const tint = wgl.makeColor(200 / 255, 200 / 255, 220 / 255, (200 / 255) * alpha);
  wgl.drawTexturePro(whTex, src, dst, origin, 0, tint);
}
