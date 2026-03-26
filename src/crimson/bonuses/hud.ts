// Port of crimson/bonuses/hud.py

import type { PlayerState } from '@crimson/sim/state-types.ts';
import { BonusId } from './ids.ts';
import { GameplayState } from "@crimson/gameplay.js";

export interface TimerRef {
  readonly kind: string; // "global" or "player"
  readonly key: string;
  readonly playerIndex: number | null;
}

export function timerRef(kind: string, key: string, playerIndex: number | null = null): TimerRef {
  return { kind, key, playerIndex };
}

export class BonusHudSlot {
  active = false;
  bonusId: BonusId = BonusId.UNUSED;
  label = '';
  iconId = -1;
  slideX = -184.0;
  timerRef: TimerRef | null = null;
  timerRefAlt: TimerRef | null = null;
  timerValue = 0.0;
  timerValueAlt = 0.0;
}

export const BONUS_HUD_SLOT_COUNT = 16;

export class BonusHudState {
  slots: BonusHudSlot[];

  constructor() {
    this.slots = [];
    for (let i = 0; i < BONUS_HUD_SLOT_COUNT; i++) {
      this.slots.push(new BonusHudSlot());
    }
  }

  register(
    bonusId: BonusId,
    opts: { label: string; iconId: number; timerRef: TimerRef; timerRefAlt?: TimerRef | null },
  ): void {
    const label = opts.label;
    const iconId = opts.iconId;
    const timerRefValue = opts.timerRef;
    const timerRefAlt = opts.timerRefAlt ?? null;
    let existing: BonusHudSlot | null = null;
    let free: BonusHudSlot | null = null;
    for (const slot of this.slots) {
      if (slot.active && slot.bonusId === bonusId) {
        existing = slot;
        break;
      }
      if (!slot.active && free === null) {
        free = slot;
      }
    }
    let slot = existing ?? free;
    if (slot === null) {
      slot = this.slots[this.slots.length - 1];
    }
    slot.active = true;
    slot.bonusId = bonusId;
    slot.label = label;
    slot.iconId = int(iconId);
    slot.slideX = -184.0;
    slot.timerRef = timerRefValue;
    slot.timerRefAlt = timerRefAlt;
    slot.timerValue = 0.0;
    slot.timerValueAlt = 0.0;
  }
}

export function bonusHudUpdate(state: GameplayState, players: PlayerState[], opts: { dt?: number } = {}): void {
  const dt = Math.max(0.0, Number(opts.dt ?? 0.0));
  const globalTimers: Record<string, number> = {
    'weapon_power_up': Number(state.bonuses.weaponPowerUp),
    'reflex_boost': Number(state.bonuses.reflexBoost),
    'energizer': Number(state.bonuses.energizer),
    'double_experience': Number(state.bonuses.doubleExperience),
    'freeze': Number(state.bonuses.freeze),
  };

  const globalTimerValue = (key: string): number => {
    const v = globalTimers[key];
    if (v === undefined) {
      throw new Error(`Unexpected bonus HUD global timer key: ${key}`);
    }
    return v;
  };

  const playerTimerValue = (player: PlayerState, key: string): number => {
    const playerTimers: Record<string, number> = {
      'fire_bullets_timer': Number(player.fireBulletsTimer),
      'shield_timer': Number(player.shieldTimer),
      'speed_bonus_timer': Number(player.speedBonusTimer),
    };
    const v = playerTimers[key];
    if (v === undefined) {
      throw new Error(`Unexpected bonus HUD player timer key: ${key}`);
    }
    return v;
  };

  const timerValue = (ref: TimerRef | null): number => {
    if (ref === null) {
      return 0.0;
    }
    if (ref.kind === 'global') {
      return Math.max(0.0, globalTimerValue(ref.key));
    }
    if (ref.kind === 'player') {
      const idx = ref.playerIndex;
      if (idx === null || !(0 <= idx && idx < players.length)) {
        return 0.0;
      }
      return Math.max(0.0, playerTimerValue(players[idx], ref.key));
    }
    return 0.0;
  };

  const playerCount = players.length;

  const bonusHud = state.bonusHud;

  for (let slotIndex = 0; slotIndex < bonusHud.slots.length; slotIndex++) {
    const slot = bonusHud.slots[slotIndex];
    if (!slot.active) {
      continue;
    }
    const timer = Math.max(0.0, timerValue(slot.timerRef));
    const timerAlt =
      slot.timerRefAlt !== null && playerCount > 1
        ? Math.max(0.0, timerValue(slot.timerRefAlt))
        : 0.0;
    slot.timerValue = timer;
    slot.timerValueAlt = timerAlt;

    if (timer > 0.0 || timerAlt > 0.0) {
      slot.slideX += dt * 350.0;
    } else {
      slot.slideX -= dt * 320.0;
    }

    if (slot.slideX > -2.0) {
      slot.slideX = -2.0;
    }

    if (slot.slideX < -184.0 && !bonusHud.slots.slice(slotIndex + 1).some((other) => other.active)) {
      slot.active = false;
      slot.bonusId = BonusId.UNUSED;
      slot.label = '';
      slot.iconId = -1;
      slot.slideX = -184.0;
      slot.timerRef = null;
      slot.timerRefAlt = null;
      slot.timerValue = 0.0;
      slot.timerValueAlt = 0.0;
    }
  }
}
