// Port of crimson/perks/state.py

import { PerkId } from './ids.ts';

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
