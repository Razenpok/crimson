// Port of crimson/projectiles/effects.py

import { RGBA } from '../../engine/color.ts';
import { Vec2 } from '../../engine/geom.ts';
import type { CrandLike } from '../../engine/rand.ts';
import { SfxId } from '../../engine/sfx-map.ts';
import { EffectPool } from '../effects.ts';
import { EffectId } from '../effects-atlas.ts';
import { RngCallerStatic } from '../rng-caller-static.ts';
import { ProjectileTemplateId } from './types.ts';

export { _spawnShrinkifierHitEffects as spawnShrinkifierHitEffects };
export { _spawnIonHitEffects as spawnIonHitEffects };
export { _spawnPlasmaCannonHitEffects as spawnPlasmaCannonHitEffects };
export { _spawnSplitterHitEffects as spawnSplitterHitEffects };

export function _spawnShrinkifierHitEffects(
  effects: EffectPool | null,
  pos: Vec2,
  rng: CrandLike,
  detailPreset: number,
): void {
  if (effects === null) return;

  const detail = detailPreset | 0;

  effects.spawn(
    EffectId.RING,
    pos,
    new Vec2(),
    0.0,
    1.0,
    36.0,
    36.0,
    0.0,
    0.3,
    0x19,
    new RGBA(0.3, 0.6, 0.9, 1.0),
    0.0,
    -4.0,
    detail,
  );

  const count = detail < 3 ? 2 : 4;
  for (let i = 0; i < count; i++) {
    const rotation = (rng.rand(RngCallerStatic.SHRINKIFIER_HIT_ROTATION) & 0x7F) * 0.049087387;
    const velocity = new Vec2(
      ((rng.rand(RngCallerStatic.SHRINKIFIER_HIT_VEL_X) & 0x7F) - 0x40) * 1.4,
      ((rng.rand(RngCallerStatic.SHRINKIFIER_HIT_VEL_Y) & 0x7F) - 0x40) * 1.4,
    );
    const scaleStep = (rng.rand(RngCallerStatic.SHRINKIFIER_HIT_SCALE_STEP) % 100) * 0.01 + 0.1;
    effects.spawn(
      EffectId.BURST,
      pos,
      velocity,
      rotation,
      1.0,
      32.0,
      32.0,
      0.0,
      0.3,
      0x1D,
      new RGBA(0.4, 0.5, 1.0, 0.5),
      0.0,
      scaleStep,
      detail,
    );
  }
}

export function _spawnIonHitEffects(
  effects: EffectPool | null,
  sfxQueue: SfxId[] | null,
  typeId: ProjectileTemplateId,
  pos: Vec2,
  rng: CrandLike,
  detailPreset: number,
): void {
  if (effects === null) return;

  let ringScale = 0.0;
  let ringStrength = 0.0;
  let burstScale = 0.0;
  switch (typeId) {
    case ProjectileTemplateId.ION_MINIGUN:
      ringScale = 1.5;
      ringStrength = 0.1;
      burstScale = 0.8;
      break;
    case ProjectileTemplateId.ION_RIFLE:
      ringScale = 1.2;
      ringStrength = 0.4;
      burstScale = 1.2;
      break;
    case ProjectileTemplateId.ION_CANNON:
      ringScale = 1.0;
      ringStrength = 1.0;
      burstScale = 2.2;
      if (sfxQueue !== null) {
        sfxQueue.push(SfxId.SHOCKWAVE);
      }
      break;
    default:
      return;
  }

  const detail = detailPreset | 0;

  effects.spawn(
    EffectId.RING,
    pos,
    new Vec2(),
    0.0,
    1.0,
    4.0,
    4.0,
    0.0,
    ringStrength * 0.8,
    0x19,
    new RGBA(0.6, 0.6, 0.9, 1.0),
    0.0,
    ringScale * 45.0,
    detail,
  );

  const burst = burstScale * 0.8;
  const lifetime = Math.min(burst * 0.7, 1.1);
  const half = burst * 32.0;
  let count = (burst * 5.0) | 0;
  if (detail < 3) {
    count = (count / 2) | 0;
  }

  for (let i = 0; i < Math.max(0, count); i++) {
    const rotation = (rng.rand(RngCallerStatic.ION_HIT_SPARK_ROTATION) & 0x7F) * 0.049087387;
    const velocity = new Vec2(
      ((rng.rand(RngCallerStatic.ION_HIT_SPARK_VEL_X) & 0x7F) - 0x40) * burst * 1.4,
      ((rng.rand(RngCallerStatic.ION_HIT_SPARK_VEL_Y) & 0x7F) - 0x40) * burst * 1.4,
    );
    const scaleStep = ((rng.rand(RngCallerStatic.ION_HIT_SPARK_SCALE_STEP) % 100) * 0.01 + 0.1) * burst;
    effects.spawn(
      EffectId.BURST,
      pos,
      velocity,
      rotation,
      1.0,
      half,
      half,
      0.0,
      lifetime,
      0x1D,
      new RGBA(0.4, 0.5, 1.0, 0.5),
      0.0,
      scaleStep,
      detail,
    );
  }
}

export function _spawnPlasmaCannonHitEffects(
  effects: EffectPool | null,
  sfxQueue: SfxId[] | null,
  pos: Vec2,
  detailPreset: number,
): void {
  if (effects === null) return;

  if (sfxQueue !== null) {
    sfxQueue.push(SfxId.EXPLOSION_MEDIUM);
    sfxQueue.push(SfxId.SHOCKWAVE);
  }

  const detail = detailPreset | 0;

  const _spawnRing = (scale: number): void => {
    effects.spawn(
      EffectId.RING,
      pos,
      new Vec2(),
      0.0,
      1.0,
      4.0,
      4.0,
      0.1,
      1.0,
      0x19,
      new RGBA(0.9, 0.6, 0.3, 1.0),
      0.0,
      scale * 45.0,
      detail,
    );
  };

  _spawnRing(1.5);
  _spawnRing(1.0);
}

export function _spawnSplitterHitEffects(
  effects: EffectPool | null,
  pos: Vec2,
  rng: CrandLike,
  detailPreset: number,
): void {
  if (effects === null) return;

  const detail = detailPreset | 0;
  for (let i = 0; i < 3; i++) {
    const angle = (rng.rand(RngCallerStatic.SPLITTER_HIT_ANGLE) & 0x1FF) * (Math.PI * 2.0 / 512.0);
    const radius = rng.rand(RngCallerStatic.SPLITTER_HIT_RADIUS) % 26;
    const jitterAge = -(rng.rand(RngCallerStatic.SPLITTER_HIT_AGE) & 0xFF) * 0.0012;
    const lifetime = 0.1 - jitterAge;

    const offset = Vec2.fromAngle(angle).mul(radius);
    effects.spawn(
      EffectId.BURST,
      pos.add(offset),
      new Vec2(),
      0.0,
      1.0,
      4.0,
      4.0,
      jitterAge,
      lifetime,
      0x19,
      new RGBA(1.0, 0.9, 0.1, 1.0),
      0.0,
      55.0,
      detail,
    );
  }
}
