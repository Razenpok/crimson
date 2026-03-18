// Port of crimson/render/projectile_render_registry.py

import { ProjectileTemplateId } from '../projectiles/types.ts';

export interface PlasmaProjectileRenderConfig {
  readonly rgb: [number, number, number];
  readonly spacing: number;
  readonly segLimit: number;
  readonly tailSize: number;
  readonly headSize: number;
  readonly headAlphaMul: number;
  readonly auraRgb: [number, number, number];
  readonly auraSize: number;
  readonly auraAlphaMul: number;
}

const DEFAULT_PLASMA_RENDER_CONFIG: PlasmaProjectileRenderConfig = {
  rgb: [1.0, 1.0, 1.0],
  spacing: 2.1,
  segLimit: 3,
  tailSize: 12.0,
  headSize: 16.0,
  headAlphaMul: 0.45,
  auraRgb: [1.0, 1.0, 1.0],
  auraSize: 120.0,
  auraAlphaMul: 0.15,
};

const PLASMA_PROJECTILE_RENDER_CONFIG_BY_TYPE_ID = new Map<number, PlasmaProjectileRenderConfig>([
  [ProjectileTemplateId.PLASMA_RIFLE, {
    rgb: [1.0, 1.0, 1.0],
    spacing: 2.5,
    segLimit: 8,
    tailSize: 22.0,
    headSize: 56.0,
    headAlphaMul: 0.45,
    auraRgb: [1.0, 1.0, 1.0],
    auraSize: 256.0,
    auraAlphaMul: 0.3,
  }],
  [ProjectileTemplateId.PLASMA_MINIGUN, DEFAULT_PLASMA_RENDER_CONFIG],
  [ProjectileTemplateId.PLASMA_CANNON, {
    rgb: [1.0, 1.0, 1.0],
    spacing: 2.6,
    segLimit: 18,
    tailSize: 44.0,
    headSize: 84.0,
    headAlphaMul: 0.45,
    auraRgb: [1.0, 1.0, 1.0],
    auraSize: 256.0,
    auraAlphaMul: 0.4,
  }],
  [ProjectileTemplateId.SPIDER_PLASMA, {
    rgb: [0.3, 1.0, 0.3],
    spacing: DEFAULT_PLASMA_RENDER_CONFIG.spacing,
    segLimit: DEFAULT_PLASMA_RENDER_CONFIG.segLimit,
    tailSize: DEFAULT_PLASMA_RENDER_CONFIG.tailSize,
    headSize: DEFAULT_PLASMA_RENDER_CONFIG.headSize,
    headAlphaMul: DEFAULT_PLASMA_RENDER_CONFIG.headAlphaMul,
    auraRgb: [0.3, 1.0, 0.3],
    auraSize: DEFAULT_PLASMA_RENDER_CONFIG.auraSize,
    auraAlphaMul: DEFAULT_PLASMA_RENDER_CONFIG.auraAlphaMul,
  }],
  [ProjectileTemplateId.SHRINKIFIER, {
    rgb: [0.3, 0.3, 1.0],
    spacing: DEFAULT_PLASMA_RENDER_CONFIG.spacing,
    segLimit: DEFAULT_PLASMA_RENDER_CONFIG.segLimit,
    tailSize: DEFAULT_PLASMA_RENDER_CONFIG.tailSize,
    headSize: DEFAULT_PLASMA_RENDER_CONFIG.headSize,
    headAlphaMul: DEFAULT_PLASMA_RENDER_CONFIG.headAlphaMul,
    auraRgb: [0.3, 0.3, 1.0],
    auraSize: DEFAULT_PLASMA_RENDER_CONFIG.auraSize,
    auraAlphaMul: DEFAULT_PLASMA_RENDER_CONFIG.auraAlphaMul,
  }],
]);

export function plasmaProjectileRenderConfig(typeId: number): PlasmaProjectileRenderConfig {
  return PLASMA_PROJECTILE_RENDER_CONFIG_BY_TYPE_ID.get(typeId) ?? DEFAULT_PLASMA_RENDER_CONFIG;
}

const BEAM_EFFECT_SCALE_BY_TYPE_ID = new Map<number, number>([
  [ProjectileTemplateId.ION_MINIGUN, 1.05],
  [ProjectileTemplateId.ION_RIFLE, 2.2],
  [ProjectileTemplateId.ION_CANNON, 3.5],
]);

export function beamEffectScale(typeId: number): number {
  return BEAM_EFFECT_SCALE_BY_TYPE_ID.get(typeId) ?? 0.8;
}

const KNOWN_PROJ_RGB_BY_TYPE_ID = new Map<number, [number, number, number]>([
  [ProjectileTemplateId.ION_RIFLE, [120, 200, 255]],
  [ProjectileTemplateId.ION_MINIGUN, [120, 200, 255]],
  [ProjectileTemplateId.ION_CANNON, [120, 200, 255]],
  [ProjectileTemplateId.FIRE_BULLETS, [255, 170, 90]],
  [ProjectileTemplateId.SHRINKIFIER, [160, 255, 170]],
  [ProjectileTemplateId.BLADE_GUN, [240, 120, 255]],
]);

export function knownProjRgb(typeId: number): [number, number, number] {
  return KNOWN_PROJ_RGB_BY_TYPE_ID.get(typeId) ?? [240, 220, 160];
}
