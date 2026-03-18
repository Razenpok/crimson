// Port of crimson/perks/runtime/manifest.py

import type { PerkId } from '../ids.ts';
import { HOOKS as AMMO_MANIAC_HOOKS } from '../impl/ammo-maniac.ts';
import { HOOKS as BANDAGE_HOOKS } from '../impl/bandage.ts';
import { HOOKS as BREATHING_ROOM_HOOKS } from '../impl/breathing-room.ts';
import { HOOKS as DEATH_CLOCK_HOOKS } from '../impl/death-clock.ts';
import { HOOKS as EVIL_EYES_HOOKS } from '../impl/evil-eyes-effect.ts';
import { HOOKS as FATAL_LOTTERY_HOOKS } from '../impl/fatal-lottery.ts';
import { FINAL_REVENGE_HOOKS } from '../impl/final-revenge.ts';
import { FIRE_COUGH_HOOKS } from '../impl/fire-cough.ts';
import { HOOKS as GRIM_DEAL_HOOKS } from '../impl/grim-deal.ts';
import { HOT_TEMPERED_HOOKS } from '../impl/hot-tempered.ts';
import { HOOKS as INFERNAL_CONTRACT_HOOKS } from '../impl/infernal-contract.ts';
import { HOOKS as INSTANT_WINNER_HOOKS } from '../impl/instant-winner.ts';
import { JINXED_HOOKS } from '../impl/jinxed-effect.ts';
import { HOOKS as LEAN_MEAN_EXP_MACHINE_HOOKS } from '../impl/lean-mean-exp-machine-effect.ts';
import { HOOKS as LIFELINE_50_50_HOOKS } from '../impl/lifeline-50-50.ts';
import { LIVING_FORTRESS_HOOKS } from '../impl/living-fortress.ts';
import { MAN_BOMB_HOOKS } from '../impl/man-bomb.ts';
import { HOOKS as MY_FAVOURITE_WEAPON_HOOKS } from '../impl/my-favourite-weapon.ts';
import { HOOKS as PLAGUEBEARER_HOOKS } from '../impl/plaguebearer.ts';
import { PYROKINETIC_HOOKS } from '../impl/pyrokinetic-effect.ts';
import { RANDOM_WEAPON_HOOKS } from '../impl/random-weapon.ts';
import { REFLEX_BOOSTED_HOOKS } from '../impl/reflex-boosted.ts';
import { REGENERATION_HOOKS } from '../impl/regeneration-effect.ts';
import { THICK_SKINNED_HOOKS } from '../impl/thick-skinned.ts';
import type { PerkApplyHandler } from './apply-context.ts';
import type {
  PerkHooks,
  PerksUpdateEffectsStep,
  PlayerDeathHook,
  PlayerPerkTickStep,
  WorldDtStep,
} from './hook-types.ts';
import { updatePlayerBonusTimers } from './player-bonus-timers.ts';

// Order is parity-critical for runtime dispatch.
export const PERK_HOOKS_IN_ORDER: readonly PerkHooks[] = [
  REFLEX_BOOSTED_HOOKS,
  MAN_BOMB_HOOKS,
  LIVING_FORTRESS_HOOKS,
  FIRE_COUGH_HOOKS,
  HOT_TEMPERED_HOOKS,
  REGENERATION_HOOKS,
  LEAN_MEAN_EXP_MACHINE_HOOKS,
  DEATH_CLOCK_HOOKS,
  EVIL_EYES_HOOKS,
  PYROKINETIC_HOOKS,
  JINXED_HOOKS,
  FINAL_REVENGE_HOOKS,
  INSTANT_WINNER_HOOKS,
  FATAL_LOTTERY_HOOKS,
  RANDOM_WEAPON_HOOKS,
  LIFELINE_50_50_HOOKS,
  THICK_SKINNED_HOOKS,
  BREATHING_ROOM_HOOKS,
  INFERNAL_CONTRACT_HOOKS,
  GRIM_DEAL_HOOKS,
  AMMO_MANIAC_HOOKS,
  BANDAGE_HOOKS,
  MY_FAVOURITE_WEAPON_HOOKS,
  PLAGUEBEARER_HOOKS,
];

export const PERK_APPLY_HANDLERS: Map<PerkId, PerkApplyHandler> = new Map(
  PERK_HOOKS_IN_ORDER
    .filter((hook): hook is PerkHooks & { applyHandler: PerkApplyHandler } => hook.applyHandler !== undefined)
    .map((hook) => [hook.perkId, hook.applyHandler]),
);

export const WORLD_DT_STEPS: readonly WorldDtStep[] =
  PERK_HOOKS_IN_ORDER
    .filter((hook): hook is PerkHooks & { worldDtStep: WorldDtStep } => hook.worldDtStep !== undefined)
    .map((hook) => hook.worldDtStep);

export const PLAYER_DEATH_HOOKS: readonly PlayerDeathHook[] =
  PERK_HOOKS_IN_ORDER
    .filter((hook): hook is PerkHooks & { playerDeathHook: PlayerDeathHook } => hook.playerDeathHook !== undefined)
    .map((hook) => hook.playerDeathHook);

export const PLAYER_PERK_TICK_STEPS: readonly PlayerPerkTickStep[] =
  PERK_HOOKS_IN_ORDER.flatMap((hook) => hook.playerTickSteps ?? []);

export const PERKS_UPDATE_EFFECT_STEPS: readonly PerksUpdateEffectsStep[] = [
  updatePlayerBonusTimers,
  ...PERK_HOOKS_IN_ORDER.flatMap((hook) => hook.effectsSteps ?? []),
];
