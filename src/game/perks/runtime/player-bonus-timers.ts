// Port of crimson/perks/runtime/player_bonus_timers.py

import type { PerksUpdateEffectsCtx } from './effects-context.ts';

export function updatePlayerBonusTimers(ctx: PerksUpdateEffectsCtx): void {
  for (const player of ctx.players) {
    if (player.shieldTimer <= 0.0) {
      player.shieldTimer = 0.0;
    } else {
      player.shieldTimer = Number(player.shieldTimer) - Number(ctx.dt);
    }

    if (player.fireBulletsTimer <= 0.0) {
      player.fireBulletsTimer = 0.0;
    } else {
      player.fireBulletsTimer = Number(player.fireBulletsTimer) - Number(ctx.dt);
    }

    if (player.speedBonusTimer <= 0.0) {
      player.speedBonusTimer = 0.0;
    } else {
      player.speedBonusTimer = Number(player.speedBonusTimer) - Number(ctx.dt);
    }
  }
}
