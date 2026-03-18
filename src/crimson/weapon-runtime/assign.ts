// Port of crimson/weapon_runtime/assign.py

import { PerkId } from '../perks/ids.ts';
import { perkActive } from '../perks/helpers.ts';
import type { GameplayState, PlayerState } from '../sim/state-types.ts';
import { WeaponSlot } from '../sim/state-types.ts';
import { WEAPON_BY_ID, WeaponId } from '../weapons.ts';
import type { Weapon } from '../weapons.ts';

export function weaponEntry(weaponId: WeaponId): Weapon {
  const entry = WEAPON_BY_ID.get(weaponId);
  if (!entry) throw new Error(`No weapon entry for id: ${weaponId}`);
  return entry;
}

interface WeaponAssignCtx {
  player: PlayerState;
  clipSize: number;
}

type WeaponAssignClipModifier = (ctx: WeaponAssignCtx) => void;

function weaponAssignClipAmmoManiac(ctx: WeaponAssignCtx): void {
  if (perkActive(ctx.player, PerkId.AMMO_MANIAC)) {
    ctx.clipSize += Math.max(1, (ctx.clipSize * 0.25) | 0);
  }
}

function weaponAssignClipMyFavouriteWeapon(ctx: WeaponAssignCtx): void {
  if (perkActive(ctx.player, PerkId.MY_FAVOURITE_WEAPON)) {
    ctx.clipSize += 2;
  }
}

const WEAPON_ASSIGN_CLIP_MODIFIERS: readonly WeaponAssignClipModifier[] = [
  weaponAssignClipAmmoManiac,
  weaponAssignClipMyFavouriteWeapon,
];

export function initDefaultAltWeapon(player: PlayerState): void {
  const slot = new WeaponSlot(WeaponId.PISTOL);
  slot.clipSize = 12;
  slot.ammo = 12.0;
  slot.reloadActive = false;
  slot.reloadTimer = 0.0;
  slot.reloadTimerMax = 1.2;
  slot.shotCooldown = 0.0;
  player.altWeapon = slot;
}

// Inline helper — mirrors weapon_usage_slot_for_weapon_id from weapon_usage.py
const WEAPON_USAGE_TRACKED_WEAPON_ID_MIN = WeaponId.PISTOL as number;
const WEAPON_USAGE_TRACKED_WEAPON_ID_MAX = 52;

function weaponUsageSlotForWeaponId(weaponId: number): number | null {
  const id = weaponId | 0;
  if (WEAPON_USAGE_TRACKED_WEAPON_ID_MIN <= id && id <= WEAPON_USAGE_TRACKED_WEAPON_ID_MAX) {
    return id;
  }
  return null;
}

export interface WeaponAssignStatus {
  incrementWeaponUsageSlot(slot: number): void;
}

export function weaponAssignPlayer(
  player: PlayerState,
  weaponId: WeaponId,
  state: GameplayState,
): void {
  const status = state.status as WeaponAssignStatus | null;
  if (status !== null && !state.demoModeActive) {
    const usageSlot = weaponUsageSlotForWeaponId(weaponId as number);
    if (usageSlot !== null) {
      status.incrementWeaponUsageSlot(usageSlot);
    }
  }

  const weapon = weaponEntry(weaponId);
  player.weapon.weaponId = weaponId;

  let clipSize = weapon.clipSize | 0;
  const clipCtx: WeaponAssignCtx = { player, clipSize: Math.max(0, clipSize) };
  for (const modifier of WEAPON_ASSIGN_CLIP_MODIFIERS) {
    modifier(clipCtx);
  }
  player.weapon.clipSize = Math.max(0, clipCtx.clipSize | 0);
  player.weapon.ammo = player.weapon.clipSize;
  player.weaponResetLatch = 0;
  player.weapon.reloadActive = false;
  player.weapon.reloadTimer = 0.0;
  player.weapon.reloadTimerMax = 0.0;
  player.weapon.shotCooldown = 0.0;
  player.auxTimer = 2.0;

  state.sfxQueue.push(weapon.reloadSound);
}

export function mostUsedWeaponIdForPlayer(
  state: GameplayState,
  playerIndex: number,
  fallbackWeaponId: WeaponId,
): WeaponId {
  const idx = playerIndex | 0;
  const weaponShotsFired = state.weaponShotsFired;
  if (idx >= 0 && idx < weaponShotsFired.length) {
    const counts = weaponShotsFired[idx];
    if (counts && counts.length > 0) {
      const start = counts.length > 1 ? 1 : 0;
      let best = start;
      for (let i = start + 1; i < counts.length; i++) {
        if ((counts[i] | 0) > (counts[best] | 0)) {
          best = i;
        }
      }
      if ((counts[best] | 0) > 0) {
        return best as WeaponId;
      }
    }
  }
  return fallbackWeaponId;
}

export function playerSwapAltWeapon(player: PlayerState): boolean {
  if (player.altWeapon === null) {
    return false;
  }
  const tmp = player.weapon;
  player.weapon = player.altWeapon;
  player.altWeapon = tmp;
  return true;
}

export function playerStartReload(player: PlayerState, state: GameplayState): void {
  if (
    player.weapon.reloadActive &&
    (perkActive(player, PerkId.AMMUNITION_WITHIN) || perkActive(player, PerkId.REGRESSION_BULLETS))
  ) {
    return;
  }

  const weapon = weaponEntry(player.weapon.weaponId);
  let reloadTime = weapon.reloadTime;

  if (!player.weapon.reloadActive) {
    player.weapon.reloadActive = true;
  }

  if (perkActive(player, PerkId.FASTLOADER)) {
    reloadTime *= 0.7;
  }
  if (state.bonuses.weaponPowerUp > 0.0) {
    reloadTime *= 0.6;
  }

  player.weapon.reloadTimer = Math.max(0.0, reloadTime);
  player.weapon.reloadTimerMax = player.weapon.reloadTimer;
}
