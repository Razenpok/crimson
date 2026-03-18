import type { PlayerState } from '../../sim/state-types.ts';
import { perkActive } from '../helpers.ts';
import { PerkId } from '../ids.ts';

export interface LivingFortressCtx {
  readonly player: PlayerState;
  readonly dt: number;
}

export function tickLivingFortress(ctx: LivingFortressCtx): void {
  if (perkActive(ctx.player, PerkId.LIVING_FORTRESS)) {
    ctx.player.livingFortressTimer = Math.min(30.0, ctx.player.livingFortressTimer + ctx.dt);
  } else {
    ctx.player.livingFortressTimer = 0.0;
  }
}

export const LIVING_FORTRESS_HOOKS = {
  perkId: PerkId.LIVING_FORTRESS as const,
  playerTickSteps: [tickLivingFortress] as const,
};
