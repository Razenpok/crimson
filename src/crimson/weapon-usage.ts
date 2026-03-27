// Port of crimson/weapon_usage.py

import { WeaponId } from '@crimson/weapons.ts';

// Save-status stores 53 u32 entries:
// - slot 0 is unused
// - tracked weapon ids map 1:1 to slots 1..52
// - weapon id 53 has no safe slot in this table
export const WEAPON_USAGE_SLOT_COUNT = 53;
const WEAPON_USAGE_TRACKED_WEAPON_ID_MIN = WeaponId.PISTOL as number;
const WEAPON_USAGE_TRACKED_WEAPON_ID_MAX = WEAPON_USAGE_SLOT_COUNT - 1;

export type WeaponUsageCounts = readonly number[];
export const ZERO_WEAPON_USAGE_COUNTS: WeaponUsageCounts = Array.from({ length: WEAPON_USAGE_SLOT_COUNT }, () => 0);

export function normalizeWeaponUsageCounts(values: unknown): WeaponUsageCounts {
  if (!Array.isArray(values)) {
    return ZERO_WEAPON_USAGE_COUNTS;
  }
  const normalized: number[] = new Array(WEAPON_USAGE_SLOT_COUNT).fill(0);
  const limit = Math.min(values.length, WEAPON_USAGE_SLOT_COUNT);
  for (let idx = 0; idx < limit; idx++) {
    try {
      normalized[idx] = (int(values[idx]) & 0xFFFFFFFF) >>> 0;
    } catch {
      normalized[idx] = 0;
    }
  }
  return normalized;
}

export function weaponUsageSlotForWeaponId(weaponId: number): number | null {
  const id = int(weaponId);
  if (WEAPON_USAGE_TRACKED_WEAPON_ID_MIN <= id && id <= WEAPON_USAGE_TRACKED_WEAPON_ID_MAX) {
    return id;
  }
  return null;
}
