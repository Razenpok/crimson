// Port of crimson/perks/state.py

import { PerkId } from './ids.ts';

/**
 * Global thresholds used by perk timers in `player_update`.
 *
 * These are global (not per-player) in crimsonland.exe: `flt_473310`,
 * `flt_473314`, and `flt_473318`.
 */
export class PerkEffectIntervals {
  manBomb = 4.0;
  fireCough = 2.0;
  hotTempered = 2.0;
}

export class PerkSelectionState {
  pendingCount = 0;
  choices: PerkId[] = [];
  choicesDirty = true;
  capturePlayerPerkCountsKnown = true;
}
