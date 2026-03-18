// Port of crimson/bonuses/energizer.py

import { f32 } from '../math-parity.ts';
import type { BonusApplyCtx } from './apply-context.ts';
import { bonusApplySeconds } from './apply-context.ts';

export function applyEnergizer(ctx: BonusApplyCtx): void {
  const old = ctx.state.bonuses.energizer as number;
  if (old <= 0.0) {
    ctx.registerGlobal('energizer');
  }

  ctx.state.bonuses.energizer = f32(old + bonusApplySeconds(ctx) * ctx.economistMultiplier);
}
