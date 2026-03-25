// Port of crimson/screens/high_scores_view/records.py

import { GameMode } from '@crimson/game-modes.ts';
import type { GameState, HighScoresRequest } from '@crimson/game/types.ts';
import type { QuestLevel } from '@crimson/quests/level.ts';
import type { HighScoreRecord } from './shared.ts';

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
    request.questLevel = level ?? { major: 1, minor: 1 };
  }

  return request;
}

function passesDateFilter(entry: HighScoreRecord, dateMode: number, now: Date): boolean {
  // Native `config_highscore_date_mode` values:
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
    // TODO: In the WebGL port we skip the checksum comparison for now
    // since the binary high-score format is not yet implemented.
    return year === now.getFullYear();
  }
  return true;
}

export function loadRecords(state: GameState, _request: HighScoresRequest): HighScoreRecord[] {
  // TODO: In the WebGL port, high-score persistence is not yet implemented.
  // Return an empty list; the UI will display "No scores yet."
  return [];
}
