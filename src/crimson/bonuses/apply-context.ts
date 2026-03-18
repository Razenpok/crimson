// Port of crimson/bonuses/apply_context.py

import type { Vec2 } from '@grim/geom.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import type { BonusHudState } from './hud.ts';
import { timerRef } from './hud.ts';
import { BONUS_BY_ID, BonusId } from './ids.ts';

export { BONUS_BY_ID };

export interface CreatureState {
  active: boolean;
  pos: Vec2;
  size: number;
  hp: number;
  lifecycleStage: number;
  vel: Vec2;
  heading: number;
  flags: number;
}

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

  constructor(
    state: GameplayState,
    player: PlayerState,
    bonusId: BonusId,
    amount: number,
    originPos: Vec2,
    creatures: readonly CreatureState[],
    players: PlayerState[],
    detailPreset: number,
    economistMultiplier: number,
    label: string,
    iconId: number,
    deferFreezeCorpseFx: boolean = false,
    freezeCorpseIndices: Set<number> | null = null,
  ) {
    this.state = state;
    this.player = player;
    this.bonusId = bonusId;
    this.amount = amount;
    this.originPos = originPos;
    this.creatures = creatures;
    this.players = players;
    this.detailPreset = detailPreset;
    this.economistMultiplier = economistMultiplier;
    this.label = label;
    this.iconId = iconId;
    this.deferFreezeCorpseFx = deferFreezeCorpseFx;
    this.freezeCorpseIndices = freezeCorpseIndices;
  }

  registerGlobal(timerKey: string): void {
    (this.state.bonusHud as BonusHudState).register(
      this.bonusId,
      this.label,
      this.iconId,
      timerRef('global', String(timerKey)),
    );
  }

  registerPlayer(timerKey: string): void {
    if (this.players.length > 1) {
      (this.state.bonusHud as BonusHudState).register(
        this.bonusId,
        this.label,
        this.iconId,
        timerRef('player', String(timerKey), 0),
        timerRef('player', String(timerKey), 1),
      );
    } else {
      (this.state.bonusHud as BonusHudState).register(
        this.bonusId,
        this.label,
        this.iconId,
        timerRef('player', String(timerKey), this.player.index | 0),
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
