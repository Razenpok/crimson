// Port of crimson/quests/level.py

export const QUEST_STAGE_COUNT = 5;
export const QUESTS_PER_STAGE = 10;
export const QUEST_COUNT = QUEST_STAGE_COUNT * QUESTS_PER_STAGE;

export class QuestLevel {
  constructor(
    public readonly major: number,
    public readonly minor: number
  ) {
  }

  static parse(value: string): QuestLevel {
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
    return new QuestLevel(major, minor);
  }

  static fromGlobalIndex(index: number): QuestLevel {
    if (index < 0 || index >= QUEST_COUNT) {
      throw new Error(`quest global index out of range: ${index} (expected 0..${QUEST_COUNT - 1})`);
    }
    const major = Math.floor(index / QUESTS_PER_STAGE) + 1;
    const minor = (index % QUESTS_PER_STAGE) + 1;
    return new QuestLevel(major, minor);
  }

  get text(): string {
    return `${this.major}.${this.minor}`;
  }

  get globalIndex(): number {
    return (this.major - 1) * QUESTS_PER_STAGE + (this.minor - 1);
  }

  title(questByLevel: (level: QuestLevel) => { title: string } | null): string {
    const quest = questByLevel(this);
    if (quest === null) {
      throw new Error(`unknown quest level: ${this.text}`);
    }
    return String(quest.title);
  }

  equal(other: QuestLevel | null): boolean {
    if (other === null) return false;
    return this.major === other.major && this.minor === other.minor;
  }

  get key(): string {
    return `${this.major}.${this.minor}`;
  }

  toString(): string {
    return this.text;
  }
}
