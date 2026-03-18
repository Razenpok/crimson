// Port of crimson/render/projectile_draw/types.py

import { Vec2 } from '../../../engine/geom.ts';
import { type GlTexture } from '../../../engine/webgl.ts';
import type { Projectile, SecondaryProjectile } from '../../projectiles/types.ts';
import type { WorldRenderCtx } from '../world/context.ts';

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
