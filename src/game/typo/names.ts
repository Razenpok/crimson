// Port of crimson/typo/names.py — creature name generation and table

import type { CrandLike } from '../../engine/rand.ts';
import { RngCallerStatic } from '../rng-caller-static.ts';

export const NAME_MAX_CHARS = 16;

const _NAME_PARTS: readonly string[] = [
  'lamb',   'gun',    'head',   'tail',   'leg',
  'nose',   'road',   'stab',   'high',   'low',
  'hat',    'pie',    'hand',   'jack',   'cube',
  'ice',    'cow',    'king',   'lord',   'mate',
  'mary',   'dick',   'bill',   'cat',    'harry',
  'tom',    'fly',    'call',   'shot',   'gate',
  'quick',  'brown',  'fox',    'jumper', 'over',
  'lazy',   'dog',    'zeta',   'unique', 'nerd',
  'earl',   'sleep',  'onyx',   'mill',   'blue',
  'below',  'scape',  'reap',   'damo',   'break',
  'boom',   'the',
];

function _draw(rng: CrandLike, caller?: number): number {
  return rng.rand(caller);
}

function _pickHighscoreName(rng: CrandLike, highscoreNames: readonly string[]): string {
  if (highscoreNames.length === 0) return 'quickbrownfox';
  return highscoreNames[
    _draw(rng, RngCallerStatic.TYPO_WORD_PICK_HIGHSCORE_NAME) % highscoreNames.length
  ];
}

export function typoNamePart(rng: CrandLike, allowThe: boolean): string {
  const mod = allowThe ? 52 : 51;
  const idx = _draw(rng, RngCallerStatic.TYPO_WORD_PICK_FRAGMENT) % mod;
  if (idx === 39) return 'nerd';
  return _NAME_PARTS[idx];
}

export function typoBuildName(
  rng: CrandLike,
  scoreXp: number,
  dictionaryWords: readonly string[] | null = null,
  highscoreNames: readonly string[] = [],
): string {
  scoreXp = scoreXp | 0;

  if (dictionaryWords && dictionaryWords.length > 0) {
    return _typoBuildCustomName(rng, scoreXp, dictionaryWords);
  }

  if (scoreXp > 120) {
    if (_draw(rng, RngCallerStatic.TYPO_TARGET_NAME_ASSIGN_RANDOM_HIGHSCORE_GATE) % 100 < 10) {
      return _pickHighscoreName(rng, highscoreNames);
    }
    if (_draw(rng, RngCallerStatic.TYPO_TARGET_NAME_ASSIGN_RANDOM_FOUR_WORD_GATE) % 100 < 80) {
      return (
        typoNamePart(rng, true) +
        typoNamePart(rng, false) +
        typoNamePart(rng, false) +
        typoNamePart(rng, false)
      );
    }
  }

  if (
    (scoreXp > 80 &&
      _draw(rng, RngCallerStatic.TYPO_TARGET_NAME_ASSIGN_RANDOM_THREE_WORD_GATE_GT80) % 100 < 80) ||
    (scoreXp > 60 &&
      _draw(rng, RngCallerStatic.TYPO_TARGET_NAME_ASSIGN_RANDOM_THREE_WORD_GATE_GT60) % 100 < 40)
  ) {
    return (
      typoNamePart(rng, true) +
      typoNamePart(rng, false) +
      typoNamePart(rng, false)
    );
  }

  if (
    (scoreXp > 40 &&
      _draw(rng, RngCallerStatic.TYPO_TARGET_NAME_ASSIGN_RANDOM_TWO_WORD_GATE_GT40) % 100 < 80) ||
    (scoreXp > 20 &&
      _draw(rng, RngCallerStatic.TYPO_TARGET_NAME_ASSIGN_RANDOM_TWO_WORD_GATE_GT20) % 100 < 40)
  ) {
    return (
      typoNamePart(rng, true) +
      typoNamePart(rng, false)
    );
  }

  return typoNamePart(rng, false);
}

function _pickWord(rng: CrandLike, words: readonly string[]): string {
  return words[_draw(rng) % words.length];
}

function _pickUniqueWords(
  rng: CrandLike,
  words: readonly string[],
  count: number,
): string[] {
  if (count <= 1) return [_pickWord(rng, words)];
  if (words.length <= count) {
    const result: string[] = [];
    for (let i = 0; i < count; i++) result.push(_pickWord(rng, words));
    return result;
  }

  const picked: string[] = [];
  const used = new Set<number>();
  while (picked.length < count) {
    const idx = _draw(rng) % words.length;
    if (used.has(idx)) continue;
    used.add(idx);
    picked.push(words[idx]);
  }
  return picked;
}

function _typoBuildCustomName(
  rng: CrandLike,
  scoreXp: number,
  dictionaryWords: readonly string[],
): string {
  scoreXp = scoreXp | 0;

  if (scoreXp > 120) {
    if (_draw(rng) % 100 < 10) return _pickWord(rng, dictionaryWords);
    if (_draw(rng) % 100 < 80) return _pickUniqueWords(rng, dictionaryWords, 4).join('');
  }

  if (
    (scoreXp > 80 && _draw(rng) % 100 < 80) ||
    (scoreXp > 60 && _draw(rng) % 100 < 40)
  ) {
    return _pickUniqueWords(rng, dictionaryWords, 3).join('');
  }

  if (
    (scoreXp > 40 && _draw(rng) % 100 < 80) ||
    (scoreXp > 20 && _draw(rng) % 100 < 40)
  ) {
    return _pickUniqueWords(rng, dictionaryWords, 2).join('');
  }

  return _pickWord(rng, dictionaryWords);
}

export function loadTypoDictionary(raw: string): string[] {
  const words: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const text = line.split('#', 2)[0].trim();
    if (!text) continue;
    if (text.length >= NAME_MAX_CHARS) continue;
    if (seen.has(text)) continue;
    words.push(text);
    seen.add(text);
  }
  return words;
}

export function loadTypoHighscoreNames(records: readonly { name(): string }[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const name = record.name();
    if (!name) continue;
    if (seen.has(name)) continue;
    if (!/^[a-zA-Z.]+$/.test(name)) continue;
    names.push(name);
    seen.add(name);
  }
  return names;
}

export class CreatureNameTable {
  names: string[];

  constructor(names: string[]) {
    this.names = names;
  }

  static sized(size: number): CreatureNameTable {
    return new CreatureNameTable(new Array(size | 0).fill(''));
  }

  clear(idx: number): void {
    idx = idx | 0;
    if (idx >= 0 && idx < this.names.length) {
      this.names[idx] = '';
    }
  }

  // Unused in WebGL port: replay checkpoints excluded
  activeEntries(activeMask: readonly boolean[]): Array<[number, string]> {
    const entries: Array<[number, string]> = [];
    for (let idx = 0; idx < this.names.length; idx++) {
      const name = this.names[idx];
      if (!name) continue;
      if (!(idx >= 0 && idx < activeMask.length && activeMask[idx])) continue;
      entries.push([idx, name]);
    }
    return entries;
  }

  findByName(name: string, activeMask: readonly boolean[]): number | null {
    for (let idx = 0; idx < this.names.length; idx++) {
      if (!(idx >= 0 && idx < activeMask.length && activeMask[idx])) continue;
      if (this.names[idx] === name) return idx;
    }
    return null;
  }

  isUnique(name: string, excludeIdx: number, activeMask: readonly boolean[]): boolean {
    for (let idx = 0; idx < this.names.length; idx++) {
      if (idx === excludeIdx) continue;
      if (!(idx >= 0 && idx < activeMask.length && activeMask[idx])) continue;
      if (this.names[idx] === name) return false;
    }
    return true;
  }

  assignRandom(
    creatureIdx: number,
    rng: CrandLike,
    scoreXp: number,
    activeMask: readonly boolean[],
    dictionaryWords: readonly string[] | null = null,
    highscoreNames: readonly string[] = [],
  ): string {
    const idx = creatureIdx | 0;
    if (idx < 0 || idx >= this.names.length) {
      throw new RangeError(`creature_idx out of range: ${idx}`);
    }

    let tooLongAttempts = 0;
    let attempts = 0;
    for (;;) {
      const name = typoBuildName(rng, scoreXp, dictionaryWords, highscoreNames);

      if (!this.isUnique(name, idx, activeMask)) {
        attempts += 1;
        if (attempts < 200) continue;
      }

      if (name.length < NAME_MAX_CHARS) {
        this.names[idx] = name;
        return name;
      }

      tooLongAttempts += 1;
      if (tooLongAttempts > 99) {
        this.names[idx] = name;
        return name;
      }
    }
  }
}
