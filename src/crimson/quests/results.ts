// Port of crimson/quests/results.py

export interface QuestFinalTime {
  readonly baseTimeMs: number;
  readonly lifeBonusMs: number;
  readonly unpickedPerkBonusMs: number;
  readonly finalTimeMs: number;
}

export class QuestResultsBreakdownAnim {
  step = 0;
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
    this.baseTimeMs = target.baseTimeMs;
    this.lifeBonusMs = target.lifeBonusMs;
    this.unpickedPerkBonusS = Math.max(0, Math.floor(target.unpickedPerkBonusMs / 1000));
    this.finalTimeMs = target.finalTimeMs;
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
  const baseMs = opts.baseTimeMs;
  let lifeBonusMs: number;
  if (opts.playerHealthValues != null && opts.playerHealthValues.length > 0) {
    lifeBonusMs = 0;
    for (const health of opts.playerHealthValues) {
      lifeBonusMs += Math.round(health);
    }
  } else {
    lifeBonusMs = Math.round(opts.playerHealth);
    if (opts.player2Health != null) {
      lifeBonusMs += Math.round(opts.player2Health);
    }
  }

  const unpickedPerkBonusMs = Math.max(0, opts.pendingPerkCount) * 1000;
  let finalMs = baseMs - lifeBonusMs - unpickedPerkBonusMs;
  if (finalMs < 1) finalMs = 1;

  return {
    baseTimeMs: baseMs,
    lifeBonusMs,
    unpickedPerkBonusMs,
    finalTimeMs: finalMs,
  };
}

export function tickQuestResultsBreakdownAnim(
  anim: QuestResultsBreakdownAnim,
  opts: {
    frameDtMs: number;
    target: QuestFinalTime;
  },
): number {
  if (anim.done) return 0;

  let clinks = 0;
  let remaining = Math.max(0, opts.frameDtMs);
  if (remaining <= 0) return 0;

  const baseTargetMs = Math.max(0, opts.target.baseTimeMs);
  const lifeTargetMs = Math.max(0, opts.target.lifeBonusMs);
  const perkTargetS = Math.max(0, Math.floor(opts.target.unpickedPerkBonusMs / 1000));

  while (remaining > 0 && !anim.done) {
    const stepTimer = anim.stepTimerMs;
    const take = stepTimer <= 0 ? remaining : Math.min(remaining, stepTimer);
    anim.stepTimerMs -= take;
    remaining -= take;

    while (anim.stepTimerMs <= 0 && !anim.done) {
      const step = anim.step;
      if (step === 0) {
        anim.baseTimeMs = Math.min(baseTargetMs, anim.baseTimeMs + 2000);
        anim.finalTimeMs = anim.baseTimeMs;
        anim.stepTimerMs += 40;
        clinks += 1;
        if (anim.baseTimeMs >= baseTargetMs) {
          anim.step = 1;
        }
        continue;
      }

      if (step === 1) {
        anim.lifeBonusMs = Math.min(lifeTargetMs, anim.lifeBonusMs + 1000);
        anim.finalTimeMs = Math.max(1, baseTargetMs - anim.lifeBonusMs - anim.unpickedPerkBonusS * 1000);
        anim.stepTimerMs += 150;
        clinks += 1;
        if (anim.lifeBonusMs >= lifeTargetMs) {
          anim.step = 2;
        }
        continue;
      }

      if (step === 2) {
        anim.unpickedPerkBonusS = Math.min(perkTargetS, anim.unpickedPerkBonusS + 1);
        anim.finalTimeMs = Math.max(1, baseTargetMs - anim.lifeBonusMs - anim.unpickedPerkBonusS * 1000);
        clinks += 1;
        if (anim.unpickedPerkBonusS >= perkTargetS) {
          anim.finalTimeMs = opts.target.finalTimeMs;
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
        if (anim.blinkTicks > 10) {
          anim.setFinal(opts.target);
        }
        continue;
      }

      anim.setFinal(opts.target);
    }
  }

  return clinks;
}
