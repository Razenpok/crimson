// Port of crimson/bonuses/freeze.py

// Freeze bonus behavior shared by sim, apply, and presentation steps.

import { RGBA } from '@grim/color.ts';
import { Vec2 } from '@grim/geom.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { CREATURE_CORPSE_DESPAWN_LIFECYCLE } from '@crimson/creatures/lifecycle.ts';
import { f32 } from '@crimson/math-parity.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import type { BonusPickupEvent, GameplayState } from '@crimson/sim/state-types.ts';
import type { BonusApplyCtx } from './apply-context.ts';

export class DeferredFreezeCorpseFx {
  constructor(
    public readonly pos: Vec2,
    public readonly detailPreset: number,
  ) {
  }
}

export function applyFreeze(ctx: BonusApplyCtx): void {
  const old = ctx.state.bonuses.freeze;
  if (old <= 0.0) {
    ctx.registerGlobal('freeze');
  }
  ctx.state.bonuses.freeze = f32(old + ctx.amount * ctx.economistMultiplier);

  const creatures = ctx.creatures;
  if (creatures && creatures.length > 0) {
    const deferCorpseFx = ctx.deferFreezeCorpseFx;
    const allowedIndices = ctx.freezeCorpseIndices;
    for (let idx = 0; idx < creatures.length; idx++) {
      const creature = creatures[idx];
      if (!creature.active) {
        continue;
      }
      if (creature.hp > 0.0) {
        continue;
      }
      // Native excludes corpses already below the despawn hitbox threshold
      // from Freeze FX random work in `bonus_apply`.
      if (creature.lifecycleStage < CREATURE_CORPSE_DESPAWN_LIFECYCLE) {
        creature.active = false;
        continue;
      }
      const allowShatterFx = allowedIndices === null || allowedIndices.has(int(idx));
      const pos = creature.pos;
      if (allowShatterFx && deferCorpseFx) {
        ctx.state.deferredFreezeCorpseFx.push(
          new DeferredFreezeCorpseFx(new Vec2(pos.x, pos.y), int(ctx.detailPreset)),
        );
      } else if (allowShatterFx) {
        for (let j = 0; j < 8; j++) {
          const angle = (ctx.state.rng.rand({ caller: RngCallerStatic.BONUS_APPLY_FREEZE_SHARD_ANGLE }) % 612) * 0.01;
          ctx.state.effects.spawnFreezeShard({
            pos,
            angle,
            rng: ctx.state.rng,
            detailPreset: int(ctx.detailPreset),
          });
        }
        const angle = (ctx.state.rng.rand({ caller: RngCallerStatic.BONUS_APPLY_FREEZE_SHATTER_ANGLE }) % 612) * 0.01;
        ctx.state.effects.spawnFreezeShatter({
          pos,
          angle,
          rng: ctx.state.rng,
          detailPreset: int(ctx.detailPreset),
        });
      }
      creature.active = false;
    }
  }

  ctx.state.sfxQueue.push(SfxId.SHOCKWAVE);
}

export function flushDeferredFreezeCorpseFx(state: GameplayState): void {
  const pending = state.deferredFreezeCorpseFx;
  if (!pending || pending.length === 0) {
    return;
  }

  for (let i = 0; i < pending.length; i++) {
    const queued = pending[i];
    const pos = queued.pos;
    const detail = int(queued.detailPreset);
    for (let j = 0; j < 8; j++) {
      const angle = (state.rng.rand({ caller: RngCallerStatic.BONUS_APPLY_FREEZE_SHARD_ANGLE }) % 612) * 0.01;
      state.effects.spawnFreezeShard({
        pos,
        angle,
        rng: state.rng,
        detailPreset: detail,
      });
    }
    const angle = (state.rng.rand({ caller: RngCallerStatic.BONUS_APPLY_FREEZE_SHATTER_ANGLE }) % 612) * 0.01;
    state.effects.spawnFreezeShatter({
      pos,
      angle,
      rng: state.rng,
      detailPreset: detail,
    });
  }
  pending.length = 0;
}

export function freezeBonusActive(opts: { state: GameplayState }): boolean {
  // Return whether Freeze timer is currently active.
  return opts.state.bonuses.freeze > 0.0;
}

export function applyFreezePickupFx(opts: { state: GameplayState; pickup: BonusPickupEvent; detailPreset: number }): void {
  // Spawn the freeze-tinted ring used by Freeze bonus pickups.
  opts.state.effects.spawnRing({
    pos: opts.pickup.pos,
    detailPreset: int(opts.detailPreset),
    color: new RGBA(0.3, 0.5, 0.8, 1.0),
  });
}
