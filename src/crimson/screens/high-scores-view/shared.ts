// Port of crimson/screens/high_scores_view/shared.py

import { GameMode } from '../../game-modes.ts';

export interface HighScoreRecord {
  name(): string;
  day: number;
  month: number;
  yearOffset: number;
  gameModeId: number;
  scoreXp: number;
  survivalElapsedMs: number;
  creatureKillCount: number;
  shotsFired: number;
  shotsHit: number;
  mostUsedWeaponId: number;
  data: Uint8Array;
}

export function formatScoreDate(entry: HighScoreRecord): string {
  const day = Math.floor(entry.day);
  const month = Math.floor(entry.month);
  const yearOff = Math.floor(entry.yearOffset);
  if (day <= 0 || month <= 0) {
    return '';
  }
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const monthName = (month >= 1 && month <= 12) ? months[month - 1] : `${month}`;
  const year = yearOff >= 0 ? 2000 + yearOff : 2000;
  return `${day}. ${monthName} ${year}`;
}

export function ordinal(value: number): string {
  const n = Math.floor(value);
  const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th'
    : (n % 10 === 1) ? 'st'
    : (n % 10 === 2) ? 'nd'
    : (n % 10 === 3) ? 'rd'
    : 'th';
  return `${n}${suffix}`;
}

export function formatElapsedMmSs(valueMs: number): string {
  const totalSec = Math.max(0, Math.floor(valueMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function modeLabel(modeId: GameMode, questMajor: number, questMinor: number): string {
  switch (modeId) {
    case GameMode.SURVIVAL:
      return 'Survival';
    case GameMode.RUSH:
      return 'Rush';
    case GameMode.TYPO:
      return 'Typ-o Shooter';
    case GameMode.QUESTS:
      if (Math.floor(questMajor) > 0 && Math.floor(questMinor) > 0) {
        return `Quest ${Math.floor(questMajor)}.${Math.floor(questMinor)}`;
      }
      return 'Quests';
    default:
      return 'Unknown';
  }
}
