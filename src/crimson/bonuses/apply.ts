// Port of crimson/bonuses/apply.py

import type { Vec2 } from '@grim/geom.ts';
import { perkCountGet } from '@crimson/perks/helpers.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import type { BonusApplyHandler } from './apply-context.ts';
import { BonusApplyCtx } from './apply-context.ts';
import { BONUS_BY_ID, BonusId } from './ids.ts';
import { applyPoints } from './points.ts';
import { applyEnergizer } from './energizer.ts';
import { applyWeaponPowerUp } from './weapon-power-up.ts';
import { applyDoubleExperience } from './double-experience.ts';
import { applyReflexBoost } from './reflex-boost.ts';
import { applyFreeze } from './freeze.ts';
import { applyShield } from './shield.ts';
import { applyMedikit } from './medikit.ts';
import { applySpeed } from './speed.ts';
import { applyFireBullets } from './fire-bullets.ts';
import { applyShockChain } from './shock-chain.ts';
import { applyWeapon } from './weapon.ts';
import { applyFireblast } from './fireblast.ts';
import { applyNuke } from './nuke.ts';
import { CreatureState } from "@crimson/creatures/runtime.js";
import { GameplayState } from "@crimson/gameplay.js";

const _BONUS_APPLY_HANDLERS: Map<BonusId, BonusApplyHandler> = new Map([
  [BonusId.POINTS, applyPoints],
  [BonusId.ENERGIZER, applyEnergizer],
  [BonusId.WEAPON_POWER_UP, applyWeaponPowerUp],
  [BonusId.DOUBLE_EXPERIENCE, applyDoubleExperience],
  [BonusId.REFLEX_BOOST, applyReflexBoost],
  [BonusId.FREEZE, applyFreeze],
  [BonusId.SHIELD, applyShield],
  [BonusId.MEDIKIT, applyMedikit],
  [BonusId.SPEED, applySpeed],
  [BonusId.FIRE_BULLETS, applyFireBullets],
  [BonusId.SHOCK_CHAIN, applyShockChain],
  [BonusId.WEAPON, applyWeapon],
  [BonusId.FIREBLAST, applyFireblast],
  [BonusId.NUKE, applyNuke],
]);

/** Apply a bonus to player + global timers (subset of `bonusApply`). */
export function bonusApply(
  state: GameplayState,
  player: PlayerState,
  bonusId: BonusId,
  opts: {
    amount?: number | null;
    origin: Vec2;
    creatures: readonly CreatureState[];
    players: PlayerState[];
    detailPreset?: number;
    deferFreezeCorpseFx?: boolean;
    freezeCorpseIndices?: Set<number> | null;
  },
): void {
  const origin = opts.origin;
  const creatures = opts.creatures;
  const players = opts.players;
  let amount = opts.amount ?? null;
  const detailPreset = opts.detailPreset ?? 5;
  const deferFreezeCorpseFx = opts.deferFreezeCorpseFx ?? false;
  const freezeCorpseIndices = opts.freezeCorpseIndices ?? null;

  const meta = BONUS_BY_ID.get(bonusId);
  if (meta === undefined) {
    return;
  }
  if (amount === null) {
    amount = int(meta.nativeAmount ?? 0);
  }

  const economistMultiplier = perkCountGet(player, PerkId.BONUS_ECONOMIST) !== 0 ? 1.5 : 1.0;
  const iconId = meta.iconId !== null ? int(meta.iconId) : -1;
  const label = meta.name;
  const ctx = new BonusApplyCtx(
    state,
    player,
    bonusId,
    int(amount),
    origin,
    creatures,
    players,
    int(detailPreset),
    Number(economistMultiplier),
    String(label),
    int(iconId),
    Boolean(deferFreezeCorpseFx),
    freezeCorpseIndices,
  );
  const handler = _BONUS_APPLY_HANDLERS.get(bonusId);
  if (handler !== undefined) {
    handler(ctx);
  }

  // Bonus types not modeled yet.
  return;
}
