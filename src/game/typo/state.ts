// Port of crimson/typo/state.py — TypoState

import { Vec2 } from '../../engine/geom.ts';
import { CreatureNameTable } from './names.ts';
import { TypingBuffer } from './typing.ts';

export class TypoState {
  typing = new TypingBuffer();
  names = CreatureNameTable.sized(0);
  spawnCooldownMs = 0;
  dictionaryWords: readonly string[] = [];
  highscoreNames: readonly string[] = [];
  pendingFireTarget: Vec2 | null = null;
  pendingReload = false;
}

export function resetTypoState(
  typo: TypoState,
  creatureCapacity: number,
  dictionaryWords: readonly string[] = [],
  highscoreNames: readonly string[] = [],
): void {
  typo.typing = new TypingBuffer();
  typo.names = CreatureNameTable.sized(creatureCapacity | 0);
  typo.spawnCooldownMs = 0;
  typo.dictionaryWords = Array.from(dictionaryWords);
  typo.highscoreNames = Array.from(highscoreNames);
  typo.pendingFireTarget = null;
  typo.pendingReload = false;
}

export function typoShotCounts(typo: TypoState): [number, number] {
  return [typo.typing.submitCount | 0, typo.typing.matchCount | 0];
}
