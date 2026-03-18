// Port of crimson/render/projectile_draw/primary_dispatch.py

import { drawBeamEffect } from './primary-beam.ts';
import { drawBulletTrail } from './primary-bullet.ts';
import { drawPlasmaParticles } from './primary-plasma.ts';
import { drawPlagueSpreader, drawPulseGun, drawSplitterOrBlade } from './primary-special.ts';
import type { ProjectileDrawCtx } from './types.ts';

const PRIMARY_PROJECTILE_DRAW_HANDLERS: ReadonlyArray<(ctx: ProjectileDrawCtx) => boolean> = [
  drawBulletTrail,
  drawPlasmaParticles,
  drawBeamEffect,
  drawPulseGun,
  drawSplitterOrBlade,
  drawPlagueSpreader,
];

export function drawProjectileFromRegistry(ctx: ProjectileDrawCtx): boolean {
  for (const handler of PRIMARY_PROJECTILE_DRAW_HANDLERS) {
    if (handler(ctx)) return true;
  }
  return false;
}
