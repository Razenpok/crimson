// Port of crimson/screens/high_scores_view/records.py

import { GameMode } from '@crimson/game-modes.ts';
import type { GameState, HighScoresRequest } from '@crimson/game/types.ts';
import { QuestLevel } from '@crimson/quests/level.ts';
import type { HighScoreRecord } from './shared.ts';

function highscoreDateChecksum(year: number, month: number, day: number): number {
  let iVar1 = Math.floor((0x0E - int(month)) / 0x0C);
  let iVar2 = (int(year) - iVar1) + 0x12C0;
  iVar1 = (
    Math.floor((iVar2 + ((iVar2 >> 31) & 3)) / 4)
    - 0x7D2D
    + int(day)
    + (
      Math.floor(iVar2 / 400)
      + Math.floor((((int(month) + iVar1 * 0x0C) * 0x99 - 0x1C9) / 5) + iVar2 * 0x16D)
      - Math.floor(iVar2 / 100)
    )
  );
  iVar2 = (((iVar1 - iVar1 % 7) + 0x7BFD) % 0x23AB1) % 0x8EAC % 0x5B5;
  iVar1 = Math.floor(iVar2 / 0x5B4);
  return Math.floor((((iVar2 - iVar1) % 0x16D) + iVar1) / 7) + 1;
}

export function resolveRequest(state: GameState): HighScoresRequest {
  let request = state.pendingHighScores;
  state.pendingHighScores = null;
  if (request === null) {
    request = {
      gameModeId: state.config.gameplay.mode,
      questLevel: null,
      highlightRank: null,
    };
  }

  if (request.gameModeId === GameMode.QUESTS && request.questLevel === null) {
    let level = state.pendingQuestLevel;
    if (level === null) {
      level = state.config.gameplay.questLevel;
    }
    // Native screen always has a valid quest stage selected (defaults to 1.1).
    request.questLevel = level ?? new QuestLevel(1, 1);
  }

  return request;
}

function passesDateFilter(entry: HighScoreRecord, dateMode: number, now: Date): boolean {
  // Native `config_highscore_date_mode` values (see highscore_screen_update):
  //   0 = Best of all time (no filter)
  //   1 = Best of month
  //   2 = Best of week
  //   3 = Best of day
  const mode = int(dateMode);
  if (mode <= 0) {
    return true;
  }

  const day = int(entry.day);
  const month = int(entry.month);
  const yearOff = int(entry.yearOffset);
  if (day <= 0 || month <= 0) {
    return false;
  }
  const year = 2000 + yearOff;
  if (mode === 1) {
    return month === (now.getMonth() + 1) && year === now.getFullYear();
  }
  if (mode === 3) {
    return day === now.getDate() && month === (now.getMonth() + 1) && year === now.getFullYear();
  }
  if (mode === 2) {
    // Week-of-year checksum stored at record byte 0x41.
    const stored = int(entry.data[0x41]);
    const checksum = highscoreDateChecksum(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return stored === checksum && year === now.getFullYear();
  }
  return true;
}

export function loadRecords(state: GameState, _request: HighScoresRequest): HighScoreRecord[] {
  // WebGL has no file-backed high-score table path; the UI displays "No scores yet."
  return [];
}
