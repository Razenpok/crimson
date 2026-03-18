export const QUEST_STAGE_COUNT = 5;
export const QUESTS_PER_STAGE = 10;
export const QUEST_COUNT = QUEST_STAGE_COUNT * QUESTS_PER_STAGE;

export interface QuestLevel {
  readonly major: number;
  readonly minor: number;
}

export function questLevelParse(value: string): QuestLevel {
  const trimmed = String(value).trim();
  const parts = trimmed.split('.');
  if (parts.length !== 2) {
    throw new Error(`invalid quest level: '${value}'`);
  }
  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  if (
    isNaN(major) || isNaN(minor) ||
    major < 1 || major > QUEST_STAGE_COUNT ||
    minor < 1 || minor > QUESTS_PER_STAGE
  ) {
    throw new Error(`invalid quest level: '${value}'`);
  }
  return { major, minor };
}

export function questLevelFromGlobalIndex(index: number): QuestLevel {
  if (index < 0 || index >= QUEST_COUNT) {
    throw new Error(`quest global index out of range: ${index} (expected 0..${QUEST_COUNT - 1})`);
  }
  const major = Math.floor(index / QUESTS_PER_STAGE) + 1;
  const minor = (index % QUESTS_PER_STAGE) + 1;
  return { major, minor };
}

export function questLevelText(level: QuestLevel): string {
  return `${level.major}.${level.minor}`;
}

export function questLevelGlobalIndex(level: QuestLevel): number {
  return (level.major - 1) * QUESTS_PER_STAGE + (level.minor - 1);
}

export function questLevelTitle(
  level: QuestLevel,
  questByLevel: (level: QuestLevel) => { title: string } | null,
): string {
  const quest = questByLevel(level);
  if (quest === null) {
    throw new Error(`unknown quest level: ${questLevelText(level)}`);
  }
  return String(quest.title);
}

export function questLevelEqual(a: QuestLevel, b: QuestLevel): boolean {
  return a.major === b.major && a.minor === b.minor;
}

export function questLevelKey(level: QuestLevel): string {
  return `${level.major}.${level.minor}`;
}
