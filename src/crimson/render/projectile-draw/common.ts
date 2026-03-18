// Port of crimson/render/projectile_draw/common.py

import { Vec2 } from '../../../grim/geom.ts';
import type { Projectile } from '../../projectiles/types.ts';

export const RAD_TO_DEG = 57.29577951308232;

export function projOrigin(proj: Projectile, _fallback: Vec2): Vec2 {
  return proj.origin;
}
