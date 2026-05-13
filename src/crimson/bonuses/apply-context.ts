// Port of crimson/bonuses/apply_context.py

import type { Vec2 } from '@grim/geom.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import { timerRef } from './hud.ts';
import { BONUS_BY_ID, BonusId } from './ids.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';

export class BonusApplyCtx {
  state: GameplayState;
  player: PlayerState;
  bonusId: BonusId;
  amount: number;
  originPos: Vec2;
  creatures: readonly CreatureState[];
  players: PlayerState[];
  detailPreset: number;
  economistMultiplier: number;
  label: string;
  iconId: number;
  deferFreezeCorpseFx: boolean;
  freezeCorpseIndices: Set<number> | null;

  constructor(opts: {
    state: GameplayState;
    player: PlayerState;
    bonusId: BonusId;
    amount: number;
    originPos: Vec2;
    creatures: readonly CreatureState[];
    players: PlayerState[];
    detailPreset: number;
    economistMultiplier: number;
    label: string;
    iconId: number;
    deferFreezeCorpseFx?: boolean;
    freezeCorpseIndices?: Set<number> | null;
  }) {
    this.state = opts.state;
    this.player = opts.player;
    this.bonusId = opts.bonusId;
    this.amount = opts.amount;
    this.originPos = opts.originPos;
    this.creatures = opts.creatures;
    this.players = opts.players;
    this.detailPreset = opts.detailPreset;
    this.economistMultiplier = opts.economistMultiplier;
    this.label = opts.label;
    this.iconId = opts.iconId;
    this.deferFreezeCorpseFx = opts.deferFreezeCorpseFx ?? false;
    this.freezeCorpseIndices = opts.freezeCorpseIndices ?? null;
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
          timerRef: timerRef('player', String(timerKey), int(this.player.index)),
        },
      );
    }
  }
}

export type BonusApplyHandler = (ctx: BonusApplyCtx) => void;

export function bonusApplySeconds(ctx: BonusApplyCtx): number {
  const meta = BONUS_BY_ID.get(ctx.bonusId);
  if (meta !== undefined && meta.applySeconds !== null && meta.applySeconds !== undefined) {
    return meta.applySeconds;
  }
  return ctx.amount;
}
