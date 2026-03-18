// Port of crimson/render/projectile_draw/types.py

import { Vec2 } from '@grim/geom.ts';
import { type GlTexture } from '@grim/webgl.ts';
import type { Projectile, SecondaryProjectile } from '@crimson/projectiles/types.ts';
import type { WorldRenderCtx } from '@crimson/render/world/context.ts';

export interface ProjectileDrawCtx {
  readonly renderer: WorldRenderCtx;
  readonly proj: Projectile;
  readonly projIndex: number;
  readonly texture: GlTexture | null;
  readonly typeId: number;
  readonly pos: Vec2;
  readonly screenPos: Vec2;
  readonly life: number;
  readonly angle: number;
  readonly scale: number;
  readonly alpha: number;
}

export interface SecondaryProjectileDrawCtx {
  readonly renderer: WorldRenderCtx;
  readonly proj: SecondaryProjectile;
  readonly projType: number;
  readonly screenPos: Vec2;
  readonly angle: number;
  readonly scale: number;
  readonly alpha: number;
}
