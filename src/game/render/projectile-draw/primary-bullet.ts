// Port of crimson/render/projectile_draw/primary_bullet.py

import { TextureId, getTexture } from '../../../engine/assets.ts';
import { clamp } from '../../../engine/math.ts';
import { WorldRenderCtx } from '../world/context.ts';
import { RAD_TO_DEG, projOrigin } from './common.ts';
import type { ProjectileDrawCtx } from './types.ts';

export function drawBulletTrail(ctx: ProjectileDrawCtx): boolean {
  const renderer = ctx.renderer;
  const resources = renderer.frame.resources;
  const typeId = ctx.typeId;
  if (!WorldRenderCtx.isBulletTrailType(typeId)) {
    return false;
  }

  const lifeAlpha = clamp(ctx.life, 0.0, 1.0) * 255.0;
  const alphaByte = clamp(lifeAlpha * ctx.alpha, 0.0, 255.0) + 0.5 | 0;
  let drawn = false;

  let bulletTrail;
  try {
    bulletTrail = getTexture(resources, TextureId.BULLET_TRAIL);
  } catch {
    bulletTrail = null;
  }
  if (bulletTrail !== null) {
    const origin = projOrigin(ctx.proj, ctx.pos);
    const originScreen = renderer.worldToScreen(origin);
    drawn = renderer.drawBulletTrail(
      originScreen,
      ctx.screenPos,
      typeId,
      alphaByte,
      ctx.scale,
      ctx.angle,
    );
  }

  let bullet;
  try {
    bullet = getTexture(resources, TextureId.BULLET_I);
  } catch {
    bullet = null;
  }
  if (bullet !== null && ctx.life >= 0.39) {
    const size = WorldRenderCtx.bulletSpriteSize(typeId, ctx.scale);
    const src: [number, number, number, number] = [0.0, 0.0, bullet.width, bullet.height];
    const dst: [number, number, number, number] = [ctx.screenPos.x, ctx.screenPos.y, size, size];
    const origin: [number, number] = [size * 0.5, size * 0.5];
    const tint: [number, number, number, number] = [220 / 255, 220 / 255, 220 / 255, alphaByte / 255];
    renderer.gl.drawTexturePro(bullet, src, dst, origin, ctx.angle * RAD_TO_DEG, tint);
    drawn = true;
  }

  return drawn;
}
