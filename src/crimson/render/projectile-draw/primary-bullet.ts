// Port of crimson/render/projectile_draw/primary_bullet.py

import * as wgl from '@wgl';
import { TextureId, getTexture } from '@grim/assets.ts';
import { clamp } from '@grim/math.ts';
import { WorldRenderCtx } from '@crimson/render/world/context.ts';
import { RAD_TO_DEG, projOrigin } from './common.ts';
import type { ProjectileDrawCtx } from './types.ts';

export function drawBulletTrail(ctx: ProjectileDrawCtx): boolean {
  const renderer = ctx.renderer;
  const resources = renderer.frame.resources;
  const typeId = ctx.typeId;
  if (!WorldRenderCtx.isBulletTrailType(typeId)) {
    return false;
  }

  const lifeAlpha = (clamp(ctx.life, 0.0, 1.0) * 255.0) | 0;
  const alphaByte = (clamp(lifeAlpha * ctx.alpha, 0.0, 255.0) + 0.5) | 0;
  let drawn = false;

  const bulletTrail = getTexture(resources, TextureId.BULLET_TRAIL);
  if (bulletTrail !== null) {
    const origin = projOrigin(ctx.proj, ctx.pos);
    const originScreen = renderer.worldToScreen(origin);
    drawn = renderer.drawBulletTrail(
      originScreen,
      ctx.screenPos,
      { typeId, alpha: alphaByte, scale: ctx.scale, angle: ctx.angle },
    );
  }

  const bullet = getTexture(resources, TextureId.BULLET_I);
  if (bullet !== null && ctx.life >= 0.39) {
    const size = WorldRenderCtx.bulletSpriteSize(typeId, ctx.scale);
    const src = wgl.makeRectangle(0.0, 0.0, bullet.width, bullet.height);
    const dst = wgl.makeRectangle(ctx.screenPos.x, ctx.screenPos.y, size, size);
    const origin = wgl.makeVector2(size * 0.5, size * 0.5);
    const tint = wgl.makeColor(220 / 255, 220 / 255, 220 / 255, alphaByte / 255);
    wgl.drawTexturePro(bullet, src, dst, origin, ctx.angle * RAD_TO_DEG, tint);
    drawn = true;
  }

  return drawn;
}
