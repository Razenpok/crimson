// Port of crimson/weapon_usage.py

import { WeaponId } from '@crimson/weapons.ts';

// Save-status stores 53 u32 entries:
// - slot 0 is unused
// - tracked weapon ids map 1:1 to slots 1..52
// - weapon id 53 has no safe slot in this table
export const WEAPON_USAGE_SLOT_COUNT = 53;
const WEAPON_USAGE_TRACKED_WEAPON_ID_MIN = WeaponId.PISTOL as number;
const WEAPON_USAGE_TRACKED_WEAPON_ID_MAX = WEAPON_USAGE_SLOT_COUNT - 1;

export function weaponUsageSlotForWeaponId(weaponId: number): number | null {
  const id = int(weaponId);
  if (WEAPON_USAGE_TRACKED_WEAPON_ID_MIN <= id && id <= WEAPON_USAGE_TRACKED_WEAPON_ID_MAX) {
    return id;
  }
  return null;
}
