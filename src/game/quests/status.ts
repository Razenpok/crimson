import type { QuestLevel } from './level.ts';
import { questLevelGlobalIndex } from './level.ts';

export const QUEST_STATUS_GAMES_OFFSET = 11;
export const QUEST_STATUS_COMPLETED_OFFSET = 51;
export const QUEST_STATUS_TRACKED_COUNT = 40;

export function questGamesCounterIndex(level: QuestLevel): number {
  return questLevelGlobalIndex(level) + QUEST_STATUS_GAMES_OFFSET;
}

export function trackedQuestGamesCounterIndex(level: QuestLevel): number | null {
  if (!questTrackedInStatus(level)) {
    return null;
  }
  return questGamesCounterIndex(level);
}

export function questCompletedCounterIndex(level: QuestLevel): number {
  return questLevelGlobalIndex(level) + QUEST_STATUS_COMPLETED_OFFSET;
}

export function questTrackedInStatus(level: QuestLevel): boolean {
  return questLevelGlobalIndex(level) < QUEST_STATUS_TRACKED_COUNT;
}

export function trackedQuestCompletedCounterIndex(level: QuestLevel): number | null {
  if (!questTrackedInStatus(level)) {
    return null;
  }
  return questCompletedCounterIndex(level);
}
