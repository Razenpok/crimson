// Port of crimson/bonuses/apply_context.py

import type { Vec2 } from '@grim/geom.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import { timerRef } from './hud.ts';
import { BONUS_BY_ID, BonusId } from './ids.ts';
import { CreatureState } from "@crimson/creatures/runtime.js";

export class BonusApplyCtx {
  constructor(
    public state: GameplayState,
    public player: PlayerState,
    public bonusId: BonusId,
    public amount: number,
    public originPos: Vec2,
    public creatures: readonly CreatureState[],
    public players: PlayerState[],
    public detailPreset: number,
    public economistMultiplier: number,
    public label: string,
    public iconId: number,
    public deferFreezeCorpseFx: boolean = false,
    public freezeCorpseIndices: Set<number> | null = null,
  ) {
  }

  registerGlobal(timerKey: string): void {
    this.state.bonusHud.register(
      this.bonusId,
      {
        label: this.label,
        iconId: this.iconId,
        timerRef: timerRef('global', String(timerKey)),
      },
    );
  }

  registerPlayer(timerKey: string): void {
    if (this.players.length > 1) {
      this.state.bonusHud.register(
        this.bonusId,
        {
          label: this.label,
          iconId: this.iconId,
          timerRef: timerRef('player', String(timerKey), 0),
          timerRefAlt: timerRef('player', String(timerKey), 1),
        },
      );
    } else {
      this.state.bonusHud.register(
        this.bonusId,
        {
          label: this.label,
          iconId: this.iconId,
          timerRef: timerRef('player', String(timerKey), this.player.index | 0),
        },
      );
    }
  }
}

export type BonusApplyHandler = (ctx: BonusApplyCtx) => void;

export function bonusApplySeconds(ctx: BonusApplyCtx): number {
  const meta = BONUS_BY_ID.get(ctx.bonusId);
  if (meta !== undefined && meta.applySeconds !== null) {
    return Number(meta.applySeconds);
  }
  return Number(ctx.amount);
}
