// Port of crimson/perks/runtime/hook_types.py

import type { CreaturePool, CreatureDeath } from '@crimson/creatures/runtime.ts';
import type { FxQueue } from '@crimson/effects.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import type { PerkId } from '@crimson/perks/ids.ts';
import type { PerkApplyHandler } from './apply-context.ts';
import type { PerksUpdateEffectsCtx } from "./effects-context.ts";
import type { PlayerPerkTickCtx } from './player-tick-context.ts';
import { GameplayState } from "@crimson/gameplay.js";

export type WorldDtStep = (opts: { dt: number; players: PlayerState[] }) => number;
export type PerksUpdateEffectsStep = (ctx: PerksUpdateEffectsCtx) => void;

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
