// Port of crimson/perks/runtime/hook_types.py

import type { CreaturePool, CreatureDeath } from '@crimson/creatures/runtime.ts';
import type { FxQueue } from '@crimson/effects.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import type { PerkId } from '@crimson/perks/ids.ts';
import type { PerkApplyHandler } from './apply-context.ts';
import type { PerksUpdateEffectsStep } from './effects-context.ts';
export type { PerksUpdateEffectsStep } from './effects-context.ts';
import type { PlayerPerkTickCtx } from './player-tick-context.ts';

export type WorldDtStep = (dt: number, players: PlayerState[]) => number;

export type { CreatureDeath };

export type PlayerDeathHook = (opts: {
  state: GameplayState;
  creatures: CreaturePool;
  players: PlayerState[];
  player: PlayerState;
  dt: number;
  worldSize: number;
  detailPreset: number;
  fxQueue: FxQueue;
  deaths: CreatureDeath[];
}) => void;

export type PlayerPerkTickStep = (ctx: PlayerPerkTickCtx) => void;

export interface PerkHooks {
  readonly perkId: PerkId;
  readonly applyHandler?: PerkApplyHandler;
  readonly worldDtStep?: WorldDtStep;
  readonly playerTickSteps?: readonly PlayerPerkTickStep[];
  readonly effectsSteps?: readonly PerksUpdateEffectsStep[];
  readonly playerDeathHook?: PlayerDeathHook;
}
