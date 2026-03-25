// Port of crimson/bonuses/update.py

import { f32 } from '@crimson/math-parity.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import type { BonusPickupEvent, GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import { bonusApply } from './apply.ts';
import { bonusHudUpdate } from './hud.ts';
import { BonusId } from './ids.ts';
import { bonusFindAimHoverEntry, BONUS_PICKUP_LINGER, BONUS_TELEKINETIC_PICKUP_MS } from './pool.ts';
import { CreatureState } from "@crimson/creatures/runtime.js";

export interface BonusPoolLike {
  update(
    dt: number,
    opts: { state: GameplayState; players: PlayerState[]; creatures: readonly CreatureState[]; detailPreset?: number; deferFreezeCorpseFx?: boolean; freezeCorpseIndices?: Set<number> | null },
  ): BonusPickupEvent[];
}

const _REFLEX_TIMER_SUBTRACT_BIAS = 4e-9;

export function bonusTelekineticUpdate(
  state: GameplayState,
  players: PlayerState[],
  dt: number,
  opts: { creatures: readonly CreatureState[]; detailPreset?: number; deferFreezeCorpseFx?: boolean; freezeCorpseIndices?: Set<number> | null },
): BonusPickupEvent[] {
  const creatures = opts.creatures;
  const detailPreset = opts.detailPreset ?? 5;
  const deferFreezeCorpseFx = opts.deferFreezeCorpseFx ?? false;
  const freezeCorpseIndices = opts.freezeCorpseIndices ?? null;
  if (dt <= 0.0) {
    return [];
  }

  const pickups: BonusPickupEvent[] = [];
  const dtMs = Number(dt) * 1000.0;

  for (const player of players) {
    if (player.health <= 0.0) {
      continue;
    }

    const hovered = bonusFindAimHoverEntry(player, state.bonusPool);
    if (hovered === null) {
      player.bonusAimHoverIndex = -1;
      player.bonusAimHoverTimerMs = 0.0;
      continue;
    }

    const [idx, entry] = hovered;
    player.bonusAimHoverIndex = idx | 0;
    player.bonusAimHoverTimerMs += dtMs;

    if (player.bonusAimHoverTimerMs <= BONUS_TELEKINETIC_PICKUP_MS) {
      continue;
    }
    if (!perkActive(player, PerkId.TELEKINETIC)) {
      continue;
    }
    if (entry.picked || entry.bonusId === BonusId.UNUSED) {
      continue;
    }

    bonusApply(
      state,
      player,
      entry.bonusId,
      {
        origin: entry.pos,
        creatures,
        players,
        amount: entry.amount | 0,
        detailPreset: detailPreset | 0,
        deferFreezeCorpseFx: Boolean(deferFreezeCorpseFx),
        freezeCorpseIndices,
      },
    );
    entry.picked = true;
    entry.timeLeft = BONUS_PICKUP_LINGER;
    pickups.push({
      playerIndex: player.index | 0,
      bonusId: entry.bonusId,
      amount: entry.amount | 0,
      pos: entry.pos,
    });

    player.bonusAimHoverIndex = -1;
    player.bonusAimHoverTimerMs = 0.0;
    break;
  }

  return pickups;
}

export function bonusUpdate(
  state: GameplayState,
  players: PlayerState[],
  dt: number,
  opts: { creatures: readonly CreatureState[]; updateHud?: boolean; detailPreset?: number; deferFreezeCorpseFx?: boolean; freezeCorpseIndices?: Set<number> | null },
): BonusPickupEvent[] {
  const creatures = opts.creatures;
  const updateHud = opts.updateHud ?? true;
  const detailPreset = opts.detailPreset ?? 5;
  const deferFreezeCorpseFx = opts.deferFreezeCorpseFx ?? false;
  const freezeCorpseIndices = opts.freezeCorpseIndices ?? null;
  const pickups = bonusTelekineticUpdate(
    state,
    players,
    dt,
    {
      creatures,
      detailPreset: detailPreset | 0,
      deferFreezeCorpseFx: Boolean(deferFreezeCorpseFx),
      freezeCorpseIndices,
    },
  );

  const bonusPool = state.bonusPool as BonusPoolLike;
  const poolPickups = bonusPool.update(
    dt,
    {
      state,
      players,
      creatures,
      detailPreset: detailPreset | 0,
      deferFreezeCorpseFx: Boolean(deferFreezeCorpseFx),
      freezeCorpseIndices,
    },
  );
  for (const p of poolPickups) {
    pickups.push(p);
  }

  if (dt > 0.0) {
    let doubleXp = Number(state.bonuses.doubleExperience);
    if (doubleXp <= 0.0) {
      state.bonuses.doubleExperience = 0.0;
    } else {
      state.bonuses.doubleExperience = Number(f32(Number(doubleXp) - Number(dt)));
    }

    let freeze = Number(state.bonuses.freeze);
    if (freeze <= 0.0) {
      state.bonuses.freeze = 0.0;
    } else {
      state.bonuses.freeze = Number(f32(Number(freeze) - Number(dt)));
    }
  }

  if (updateHud) {
    bonusHudUpdate(state, players, { dt });
  }

  return pickups;
}

export function bonusUpdatePrePickupTimers(state: GameplayState, dt: number): void {
  if (dt <= 0.0) {
    return;
  }

  if (Number(state.bonuses.weaponPowerUp) > 0.0) {
    state.bonuses.weaponPowerUp = Number(f32(Number(state.bonuses.weaponPowerUp) - Number(dt)));
  }
  if (Number(state.bonuses.energizer) > 0.0) {
    state.bonuses.energizer = Number(f32(Number(state.bonuses.energizer) - Number(dt)));
  }
  if (Number(state.bonuses.reflexBoost) > 0.0) {
    const reflexBefore = Number(state.bonuses.reflexBoost);
    let subtract = Number(dt);
    if (0.0 < reflexBefore && reflexBefore < 1.0) {
      subtract += Number(_REFLEX_TIMER_SUBTRACT_BIAS);
    }
    state.bonuses.reflexBoost = Number(f32(Number(reflexBefore) - Number(subtract)));
  }
}
