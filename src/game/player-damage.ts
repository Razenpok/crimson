// Port of crimson/player_damage.py — player damage intake helpers

import { SfxId } from '../engine/sfx-map.ts';
import { f32 } from './math-parity.ts';
import { PerkId } from './perks/ids.ts';
import { perkActive } from './perks/helpers.ts';
import { RngCallerStatic } from './rng-caller-static.ts';
import type { GameplayState, PlayerState } from './sim/state-types.ts';

const _PLAYER_PAIN_SFX: readonly SfxId[] = [
  SfxId.TROOPER_INPAIN_01,
  SfxId.TROOPER_INPAIN_02,
  SfxId.TROOPER_INPAIN_03,
];
const _PLAYER_DEATH_SFX: readonly SfxId[] = [SfxId.TROOPER_DIE_01, SfxId.TROOPER_DIE_02];
const _THICK_SKINNED_DAMAGE_SCALE_F32 = 0.6660000085830688;

export function playerTakeDamage(
  state: GameplayState,
  player: PlayerState,
  damage: number,
  dt: number | null = null,
  players: readonly PlayerState[] | null = null,
  onLethal: (() => void) | null = null,
): number {
  const rawDamage = damage;
  if (rawDamage <= 0.0) return 0.0;
  if (state.debugGodMode) return 0.0;

  if (perkActive(player, PerkId.DEATH_CLOCK)) return 0.0;

  let damageScaled = rawDamage;
  if (perkActive(player, PerkId.TOUGH_RELOADER) && player.weapon.reloadActive) {
    damageScaled *= 0.5;
  }
  const spreadHeatDamage = damageScaled;

  state.survivalRewardDamageSeen = true;

  if (player.shieldTimer > 0.0) return 0.0;

  let wasAliveSource: PlayerState = player;
  if (state.preserveBugs && players && players.length > 0) {
    wasAliveSource = players[0];
  }
  const wasAlive = wasAliveSource.health > 0.0;

  if (perkActive(player, PerkId.THICK_SKINNED)) {
    damageScaled = f32(damageScaled * _THICK_SKINNED_DAMAGE_SCALE_F32);
  }

  let dodged = false;
  if (perkActive(player, PerkId.NINJA)) {
    dodged = (state.rng.rand(RngCallerStatic.PLAYER_TAKE_DAMAGE_NINJA) % 3) === 0;
  } else if (perkActive(player, PerkId.DODGER)) {
    dodged = (state.rng.rand(RngCallerStatic.PLAYER_TAKE_DAMAGE_DODGER) % 5) === 0;
  }

  const healthBefore = player.health;
  if (!dodged) {
    if (perkActive(player, PerkId.HIGHLANDER)) {
      if ((state.rng.rand(RngCallerStatic.PLAYER_TAKE_DAMAGE_HIGHLANDER) % 10) === 0) {
        player.health = 0.0;
      }
    } else {
      player.health = f32(player.health - damageScaled);
    }
  }

  let lethalHit = player.health < 0.0;
  if (!state.preserveBugs && player.health === 0.0) {
    lethalHit = true;
  }
  if (!dodged && lethalHit && dt !== null && dt > 0.0) {
    player.deathTimer -= dt * 28.0;
  }

  if (!lethalHit) {
    state.sfxQueue.push(
      _PLAYER_PAIN_SFX[state.rng.rand(RngCallerStatic.PLAYER_TAKE_DAMAGE_PAIN_SFX) % _PLAYER_PAIN_SFX.length],
    );
    if (!wasAlive) {
      return Math.max(0.0, healthBefore - player.health);
    }
  } else {
    if (!wasAlive) {
      return Math.max(0.0, healthBefore - player.health);
    }
    if (!perkActive(player, PerkId.FINAL_REVENGE)) {
      state.sfxQueue.push(_PLAYER_DEATH_SFX[state.rng.rand(RngCallerStatic.PLAYER_TAKE_DAMAGE_DEATH_SFX) & 1]);
    } else if (onLethal !== null) {
      onLethal();
      state.playerDeathHookSkipIndices.add(player.index);
    }
  }

  if (!dodged) {
    if (!perkActive(player, PerkId.UNSTOPPABLE)) {
      player.heading += ((state.rng.rand(RngCallerStatic.PLAYER_TAKE_DAMAGE_HEADING) % 100) - 50) * 0.04;
      player.spreadHeat = Math.min(0.48, player.spreadHeat + spreadHeatDamage * 0.01);
    }

    if (player.health <= 20.0 && (state.rng.rand(RngCallerStatic.PLAYER_TAKE_DAMAGE_LOW_HEALTH) & 7) === 3) {
      player.lowHealthTimer = 0.0;
    }
  }

  return Math.max(0.0, healthBefore - player.health);
}

export function playerTakeProjectileDamage(
  state: GameplayState,
  player: PlayerState,
  damage: number,
): number {
  const dmg = damage;
  if (dmg <= 0.0) return 0.0;
  if (state.debugGodMode) return 0.0;
  if (player.shieldTimer > 0.0) return 0.0;

  player.health -= dmg;
  return dmg;
}
