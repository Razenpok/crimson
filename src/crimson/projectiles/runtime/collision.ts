// Port of crimson/projectiles/runtime/collision.py

import { Vec2 } from '@grim/geom.ts';
import { nativeFindSizeMargin } from '@crimson/collision-math.ts';
import { creatureLifecycleIsAlive } from '@crimson/creatures/lifecycle.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';
import { OwnerRef } from '@crimson/owner-ref.ts';
import { CreatureDamageApplier } from '@crimson/projectiles/types.ts';

const _NATIVE_FIND_RADIUS_MARGIN_EPS = 0.0;

export function hitRadiusFor(creature: CreatureState): number {
  return Math.max(0.0, nativeFindSizeMargin(creature.size));
}

export function withinNativeFindRadius(
  origin: Vec2,
  target: Vec2,
  radius: number,
  targetSize: number,
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const radiusF = radius;
  const sizeMargin = nativeFindSizeMargin(targetSize);
  const maxAxisDelta = radiusF + sizeMargin + _NATIVE_FIND_RADIUS_MARGIN_EPS;
  if (Math.abs(dx) > maxAxisDelta || Math.abs(dy) > maxAxisDelta) {
    return false;
  }
  const margin = Math.sqrt(dx * dx + dy * dy) - radiusF - sizeMargin;
  return margin < _NATIVE_FIND_RADIUS_MARGIN_EPS;
}

export function creatureFindNearestForSecondary(
  creatures: readonly CreatureState[],
  origin: Vec2,
  preserveBugs: boolean = false,
): number {
  let bestIdx = preserveBugs ? 0 : -1;
  let bestDistSq = 1_000_000.0;
  const maxIndex = Math.min(creatures.length, 0x180);
  for (let idx = 0; idx < maxIndex; idx++) {
    const creature = creatures[idx];
    if (!creature.active) {
      continue;
    }
    if (!creatureLifecycleIsAlive(creature.lifecycleStage)) {
      continue;
    }
    const distSq = Vec2.distanceSq(origin, creature.pos);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

export function applyDamageToCreature(
  creatures: readonly CreatureState[],
  creatureIndex: number,
  damage: number,
  damageType: number,
  impulse: Vec2,
  owner: OwnerRef,
  applyCreatureDamage: CreatureDamageApplier | null = null,
): void {
  if (damage <= 0.0) {
    return;
  }
  const idx = int(creatureIndex);
  if (!(0 <= idx && idx < creatures.length)) {
    return;
  }
  if (applyCreatureDamage !== null) {
    applyCreatureDamage(
      idx,
      damage,
      damageType,
      impulse,
      owner,
    );
  } else {
    creatures[idx].hp -= damage;
  }
}
