import { SfxId } from "../../../engine/sfx-map.ts";
import type { PlayerState } from "../../sim/state-types.ts";
import { f32 } from "../../math-parity.ts";
import { perkActive } from "../helpers.ts";
import { PerkId } from "../ids.ts";
import { RngCallerStatic } from "../../rng-caller-static.ts";
import type { PerksUpdateEffectsCtx } from "../runtime/effects-context.ts";

function awardExperienceOnceFromReward(player: PlayerState, reward_value: number): number {
  const rewardF32 = f32(reward_value);
  if (rewardF32 <= 0.0) {
    return 0;
  }

  const before = player.experience | 0;
  const totalF32 = f32(f32(before) + rewardF32);
  const after = totalF32 | 0;
  player.experience = after | 0;
  return (after - before) | 0;
}

function awardExperienceFromReward(ctx: PerksUpdateEffectsCtx, reward_value: number): number {
  if (!ctx.players.length) {
    return 0;
  }
  const player = ctx.players[0];
  let gained = awardExperienceOnceFromReward(player, reward_value);
  if (gained <= 0) {
    return 0;
  }
  if (ctx.state.bonuses.doubleExperience > 0.0) {
    gained += awardExperienceOnceFromReward(player, reward_value);
  }
  return gained | 0;
}

function selectJinxedAccidentTarget(ctx: PerksUpdateEffectsCtx): PlayerState {
  const player0 = ctx.players[0];
  if (ctx.state.preserveBugs) {
    return player0;
  }

  const alivePlayers = ctx.players.filter((p) => p.health > 0.0);
  if (!alivePlayers.length) {
    return player0;
  }
  if (alivePlayers.length === 1) {
    return alivePlayers[0];
  }

  const pick =
    ctx.state.rng.rand(RngCallerStatic.REWRITE_JINXED_ACCIDENT_TARGET_PICK) %
    alivePlayers.length;
  return alivePlayers[pick];
}

export function updateJinxedTimer(ctx: PerksUpdateEffectsCtx): void {
  if (ctx.state.jinxedTimer >= 0.0) {
    ctx.state.jinxedTimer -= ctx.dt;
  }
}

export function updateJinxed(ctx: PerksUpdateEffectsCtx): void {
  if (ctx.state.jinxedTimer >= 0.0) {
    return;
  }
  if (!ctx.players.length) {
    return;
  }
  if (!perkActive(ctx.players[0], PerkId.JINXED)) {
    return;
  }

  if (
    ctx.state.rng.rand(
      RngCallerStatic.PERKS_UPDATE_EFFECTS_JINXED_ACCIDENT_GATE,
    ) %
      10 ===
    3
  ) {
    const player = selectJinxedAccidentTarget(ctx);
    player.health = player.health - 5.0;
    if (ctx.fxQueue !== null) {
      ctx.fxQueue.addRandom(player.pos, ctx.state.rng);
      ctx.fxQueue.addRandom(player.pos, ctx.state.rng);
    }
  }

  ctx.state.jinxedTimer =
    (ctx.state.rng.rand(
      RngCallerStatic.PERKS_UPDATE_EFFECTS_JINXED_TIMER_RESET,
    ) %
      20) *
      0.1 +
    ctx.state.jinxedTimer +
    2.0;

  if (ctx.state.bonuses.freeze <= 0.0 && ctx.creatures !== null) {
    const poolLimit = ctx.state.preserveBugs ? 0x17f : 0x180;
    const poolMod = Math.min(poolLimit, ctx.creatures.length);
    if (poolMod <= 0) {
      return;
    }

    let idx =
      ctx.state.rng.rand(
        RngCallerStatic.PERKS_UPDATE_EFFECTS_JINXED_CREATURE_PICK,
      ) % poolMod;
    let attempts = 0;
    while (attempts < 10 && !ctx.creatures[idx].active) {
      idx =
        ctx.state.rng.rand(
          RngCallerStatic.PERKS_UPDATE_EFFECTS_JINXED_CREATURE_RETRY,
        ) % poolMod;
      attempts += 1;
    }
    if (!ctx.creatures[idx].active) {
      return;
    }

    const creature = ctx.creatures[idx];
    creature.hp = -1.0;
    creature.lifecycleStage = creature.lifecycleStage - ctx.dt * 20.0;
    awardExperienceFromReward(ctx, creature.reward_value);
    ctx.state.sfxQueue.push(SfxId.TROOPER_INPAIN_01);
  }
}

export const JINXED_HOOKS = {
  perkId: PerkId.JINXED as const,
  effectsSteps: [updateJinxedTimer, updateJinxed] as const,
};
