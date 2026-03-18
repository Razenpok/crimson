// Port of crimson/typo/player.py — Typ'o'Shooter player frame enforcement

import { Vec2 } from '../../engine/geom.ts';
import { PlayerInput } from '../sim/input.ts';
import type { PlayerState } from '../sim/state-types.ts';
import type { GameplayState } from '../gameplay.ts';
import { weaponAssignPlayer } from '../weapon-runtime/assign.ts';
import { WeaponId } from '../weapons.ts';

export const TYPO_WEAPON_ID = WeaponId.SAWED_OFF_SHOTGUN;

/**
 * Match Typ-o Shooter's bespoke player loop (`player_fire_weapon @ 0x00444980`).
 *
 * Typ-o resets timers and tops up ammo each frame, so typing speed (not weapon
 * cooldown) controls rate of fire.
 */
export function enforceTypoPlayerFrame(player: PlayerState, state: GameplayState): void {
  if (player.weapon.weaponId !== TYPO_WEAPON_ID) {
    weaponAssignPlayer(player, TYPO_WEAPON_ID, state);
  }

  player.weapon.shotCooldown = 0.0;
  player.spreadHeat = 0.0;
  player.weapon.ammo = Math.max(0, player.weapon.clipSize | 0);

  player.weapon.reloadActive = false;
  player.weapon.reloadTimer = 0.0;
  player.weapon.reloadTimerMax = 0.0;
}

export function buildTypoPlayerInput(
  aim: Vec2,
  fireRequested: boolean,
  reloadRequested: boolean,
): PlayerInput {
  return new PlayerInput({
    move: new Vec2(),
    aim,
    fireDown: fireRequested,
    firePressed: fireRequested,
    reloadPressed: reloadRequested,
  });
}
