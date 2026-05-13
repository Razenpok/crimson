// Port of crimson/quests/results.py

export interface QuestFinalTime {
  readonly baseTimeMs: number;
  readonly lifeBonusMs: number;
  readonly unpickedPerkBonusMs: number;
  readonly finalTimeMs: number;
}

export class QuestResultsBreakdownAnim {
  // Phase-based breakdown animation modeled after `quest_results_screen_update`.
  //
  // The native flow animates the breakdown in four steps:
  //   0) base time counts up to `base_time_ms`
  //   1) life bonus counts up to `life_bonus_ms`
  //   2) perk bonus counts up (in 1s steps) to `unpicked_perk_bonus_ms`
  //   3) final-time highlight blink then completes
  step = 0; // 0=base,1=life,2=perk,3=final blink,4=done
  stepTimerMs = 700;
  baseTimeMs = 0;
  lifeBonusMs = 0;
  unpickedPerkBonusS = 0;
  finalTimeMs = 0;
  blinkTicks = 0;
  done = false;

  static start(): QuestResultsBreakdownAnim {
    return new QuestResultsBreakdownAnim();
  }

  setFinal(target: QuestFinalTime): void {
    this.step = 4;
    this.done = true;
    this.stepTimerMs = 0;
    this.baseTimeMs = int(target.baseTimeMs);
    this.lifeBonusMs = int(target.lifeBonusMs);
    this.unpickedPerkBonusS = Math.max(0, Math.floor(int(target.unpickedPerkBonusMs) / 1000));
    this.finalTimeMs = int(target.finalTimeMs);
    this.blinkTicks = 0;
  }

  highlightAlpha(): number {
    if (this.step !== 3) return 1.0;
    return Math.max(0.0, Math.min(1.0, 1.0 - this.blinkTicks * 0.1));
  }
}

export function computeQuestFinalTime(opts: {
  baseTimeMs: number;
  playerHealth: number;
  pendingPerkCount: number;
  player2Health?: number | null;
  playerHealthValues?: readonly number[] | null;
}): QuestFinalTime {
  // Compute quest final time (ms) and breakdown.
  //
  // Modeled after `quest_results_screen_update`:
  //   final_time_ms = base_time_ms - round(player_health) - (pending_perk_count * 1000)
  //   clamped to at least 1ms.
  const baseMs = int(opts.baseTimeMs);
  let lifeBonusMs: number;
  if (opts.playerHealthValues != null && opts.playerHealthValues.length > 0) {
    lifeBonusMs = 0;
    for (const health of opts.playerHealthValues) {
      lifeBonusMs += int(Math.round(health));
    }
  } else {
    lifeBonusMs = int(Math.round(opts.playerHealth));
    if (opts.player2Health != null) {
      lifeBonusMs += int(Math.round(opts.player2Health));
    }
  }

  const unpickedPerkBonusMs = Math.max(0, int(opts.pendingPerkCount)) * 1000;
  let finalMs = baseMs - int(lifeBonusMs) - int(unpickedPerkBonusMs);
  if (finalMs < 1) finalMs = 1;

  return {
    baseTimeMs: baseMs,
    lifeBonusMs: int(lifeBonusMs),
    unpickedPerkBonusMs: int(unpickedPerkBonusMs),
    finalTimeMs: int(finalMs),
  };
}

export function tickQuestResultsBreakdownAnim(
  anim: QuestResultsBreakdownAnim,
  opts: {
    frameDtMs: number;
    target: QuestFinalTime;
  },
): number {
  // Advance quest results breakdown animation.
  //
  // Returns the number of "clink" ticks to play this frame.
  if (anim.done) return 0;

  let clinks = 0;
  let remaining = Math.max(0, int(opts.frameDtMs));
  if (remaining <= 0) return 0;

  const baseTargetMs = Math.max(0, int(opts.target.baseTimeMs));
  const lifeTargetMs = Math.max(0, int(opts.target.lifeBonusMs));
  const perkTargetS = Math.max(0, Math.floor(int(opts.target.unpickedPerkBonusMs) / 1000));

  while (remaining > 0 && !anim.done) {
    const stepTimer = int(anim.stepTimerMs);
    const take = stepTimer <= 0 ? remaining : Math.min(remaining, stepTimer);
    anim.stepTimerMs = int(anim.stepTimerMs) - int(take);
    remaining -= int(take);

    while (anim.stepTimerMs <= 0 && !anim.done) {
      const step = int(anim.step);
      if (step === 0) {
        anim.baseTimeMs = Math.min(baseTargetMs, int(anim.baseTimeMs) + 2000);
        anim.finalTimeMs = int(anim.baseTimeMs);
        anim.stepTimerMs += 40;
        clinks += 1;
        if (int(anim.baseTimeMs) >= baseTargetMs) {
          anim.step = 1;
        }
        continue;
      }

      if (step === 1) {
        anim.lifeBonusMs = Math.min(lifeTargetMs, int(anim.lifeBonusMs) + 1000);
        anim.finalTimeMs = Math.max(1, baseTargetMs - int(anim.lifeBonusMs) - int(anim.unpickedPerkBonusS) * 1000);
        anim.stepTimerMs += 150;
        clinks += 1;
        if (int(anim.lifeBonusMs) >= lifeTargetMs) {
          anim.step = 2;
        }
        continue;
      }

      if (step === 2) {
        anim.unpickedPerkBonusS = Math.min(perkTargetS, int(anim.unpickedPerkBonusS) + 1);
        anim.finalTimeMs = Math.max(1, baseTargetMs - int(anim.lifeBonusMs) - int(anim.unpickedPerkBonusS) * 1000);
        clinks += 1;
        if (int(anim.unpickedPerkBonusS) >= perkTargetS) {
          anim.finalTimeMs = int(opts.target.finalTimeMs);
          anim.stepTimerMs += 1000;
          anim.step = 3;
        } else {
          anim.stepTimerMs += 300;
        }
        continue;
      }

      if (step === 3) {
        anim.blinkTicks += 1;
        anim.stepTimerMs += 50;
        if (int(anim.blinkTicks) > 10) {
          anim.setFinal(opts.target);
        }
        continue;
      }

      anim.setFinal(opts.target);
    }
  }

  return int(clinks);
}
