// Port of crimson/persistence/highscores.py

import type { CrimsonConfig } from '@grim/config.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { QuestLevel } from '@crimson/quests/level.ts';
import { WeaponId } from '@crimson/weapons.ts';

export const RECORD_SIZE = 0x48;
export const RECORD_WIRE_SIZE = RECORD_SIZE + 4;  // record + checksum
export const TABLE_MAX = 100;

export const NAME_SIZE = 0x20;
export const NAME_MAX_EDIT = 0x14;  // game_over_screen_update sets ui_text_input maxlen=0x14

function knownGameMode(value: number): GameMode {
  const raw = int(value);
  switch (raw) {
    case GameMode.DEMO:
      return GameMode.DEMO;
    case GameMode.SURVIVAL:
      return GameMode.SURVIVAL;
    case GameMode.RUSH:
      return GameMode.RUSH;
    case GameMode.QUESTS:
      return GameMode.QUESTS;
    case GameMode.TYPO:
      return GameMode.TYPO;
    case GameMode.TUTORIAL:
      return GameMode.TUTORIAL;
    default:
      return GameMode.DEMO;
  }
}

function clampU32(value: number): number {
  return int(value) >>> 0;
}

function scoreChecksum(data: Uint8Array): number {
  if (data.length !== RECORD_SIZE) {
    throw new Error(`expected 0x${RECORD_SIZE.toString(16)} bytes, got 0x${data.length.toString(16)}`);
  }
  let checksum = 0;
  for (let idx = 0; idx < data.length; idx++) {
    const b = data[idx];
    checksum = clampU32(checksum + (idx + 3) * int(b) * 7);
  }
  return checksum;
}

function encodeByte(value: number, idx: number): number {
  // highscore_write_record: b += ((idx * 5 + 1) * idx + 6)
  return (int(value) + (idx * 5 + 1) * idx + 6) & 0xFF;
}

function decodeByte(value: number, idx: number): number {
  // highscore_read_record: b += (-6 - ((idx * 5 + 1) * idx))
  return (int(value) - ((idx * 5 + 1) * idx + 6)) & 0xFF;
}

export function highscoreDateChecksum(year: number, month: number, day: number): number {
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

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

function writeU32(data: Uint8Array, offset: number, value: number): void {
  new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(offset, int(value) >>> 0, true);
}

export class HighScoreRecord {
  data: Uint8Array;

  constructor(opts: { data: Uint8Array }) {
    this.data = opts.data;
  }

  static blank(): HighScoreRecord {
    const data = new Uint8Array(RECORD_SIZE);
    data[0x46] = 0x7C;
    data[0x47] = 0xFF;
    return new HighScoreRecord({ data });
  }

  static fromBytes(data: Uint8Array): HighScoreRecord {
    if (data.length !== RECORD_SIZE) {
      throw new Error(`expected 0x${RECORD_SIZE.toString(16)} bytes, got 0x${data.length.toString(16)}`);
    }
    return new HighScoreRecord({ data: new Uint8Array(data) });
  }

  copy(): HighScoreRecord {
    return new HighScoreRecord({ data: new Uint8Array(this.data) });
  }

  name(): string {
    let end = this.data.indexOf(0, 0);
    if (end < 0 || end > NAME_SIZE) end = NAME_SIZE;
    let out = '';
    for (let i = 0; i < end; i++) {
      out += String.fromCharCode(this.data[i]);
    }
    return out;
  }

  setName(value: string): void {
    const limit = NAME_SIZE - 1;
    this.data.fill(0, 0, NAME_SIZE);
    const count = Math.min(limit, value.length);
    for (let i = 0; i < count; i++) {
      this.data[i] = value.charCodeAt(i) & 0xFF;
    }
    this.data[Math.min(count, limit)] = 0;
  }

  trimTrailingSpaces(): void {
    // highscore_save_record: strips trailing spaces (0x20) in-place before saving.
    let end = this.data.indexOf(0, 0);
    if (end < 0 || end > NAME_SIZE) end = NAME_SIZE;
    let i = end - 1;
    while (i > 0 && this.data[i] === 0x20) {
      this.data[i] = 0;
      i -= 1;
    }
  }

  get survivalElapsedMs(): number {
    return readU32(this.data, 0x20);
  }

  set survivalElapsedMs(value: number) {
    writeU32(this.data, 0x20, value);
  }

  get scoreXp(): number {
    return readU32(this.data, 0x24);
  }

  set scoreXp(value: number) {
    writeU32(this.data, 0x24, value);
  }

  get gameModeId(): GameMode {
    return knownGameMode(this.data[0x28]);
  }

  set gameModeId(value: GameMode) {
    this.data[0x28] = int(value) & 0xFF;
  }

  get questStageMajor(): number {
    return int(this.data[0x29]);
  }

  set questStageMajor(value: number) {
    this.data[0x29] = int(value) & 0xFF;
  }

  get questStageMinor(): number {
    return int(this.data[0x2A]);
  }

  set questStageMinor(value: number) {
    this.data[0x2A] = int(value) & 0xFF;
  }

  get questLevel(): QuestLevel | null {
    const major = int(this.questStageMajor);
    const minor = int(this.questStageMinor);
    if (major <= 0 || minor <= 0) {
      return null;
    }
    return new QuestLevel({ major, minor });
  }

  set questLevel(value: QuestLevel | null) {
    if (value === null) {
      this.questStageMajor = 0;
      this.questStageMinor = 0;
      return;
    }
    this.questStageMajor = int(value.major);
    this.questStageMinor = int(value.minor);
  }

  get mostUsedWeaponId(): WeaponId {
    return int(this.data[0x2B]) as WeaponId;
  }

  set mostUsedWeaponId(value: WeaponId) {
    this.data[0x2B] = int(value) & 0xFF;
  }

  get shotsFired(): number {
    return readU32(this.data, 0x2C);
  }

  set shotsFired(value: number) {
    writeU32(this.data, 0x2C, value);
  }

  get shotsHit(): number {
    return readU32(this.data, 0x30);
  }

  set shotsHit(value: number) {
    writeU32(this.data, 0x30, value);
  }

  get creatureKillCount(): number {
    return readU32(this.data, 0x34);
  }

  set creatureKillCount(value: number) {
    writeU32(this.data, 0x34, value);
  }

  get reserved0(): number {
    return readU32(this.data, 0x38);
  }

  set reserved0(value: number) {
    writeU32(this.data, 0x38, value);
  }

  get day(): number {
    return int(this.data[0x40]);
  }

  get month(): number {
    return int(this.data[0x42]);
  }

  get yearOffset(): number {
    return int(this.data[0x43]);
  }

  get flags(): number {
    return int(this.data[0x44]);
  }

  set flags(value: number) {
    this.data[0x44] = int(value) & 0xFF;
  }

  get fullVersionMarker(): number {
    return int(this.data[0x45]);
  }

  set fullVersionMarker(value: number) {
    this.data[0x45] = int(value) & 0xFF;
  }

  ensureDateFields(now: Date | null = null): void {
    if (int(this.data[0x40]) !== 0) {
      return;
    }
    if (now === null) {
      now = new Date();
    }
    this.data[0x40] = int(now.getDate()) & 0xFF;
    this.data[0x42] = int(now.getMonth() + 1) & 0xFF;
    this.data[0x43] = int(now.getFullYear() - 2000) & 0xFF;
    this.data[0x41] = int(highscoreDateChecksum(now.getFullYear(), now.getMonth() + 1, now.getDate())) & 0xFF;
  }
}

export function scoresDirForBaseDir(baseDir: string): string {
  // Original uses CreateDirectoryA("scores5") relative to cwd.
  return `${baseDir.replace(/\/+$/g, '')}/scores5`;
}

function withPlayerCountSuffix(path: string, opts: { playerCount: number }): string {
  let count = int(opts.playerCount);
  if (count <= 1) {
    return path;
  }
  // Native only supports 1P/2P. Our port supports up to 4 players; keep separate leaderboards.
  count = Math.max(2, Math.min(4, count));
  if (!path.toLowerCase().endsWith('.hi')) {
    return path;
  }
  return `${path.slice(0, -3)}_${count}.hi`;
}

function scoresPathForModeRoot(opts: {
  root: string;
  gameModeId: GameMode;
  hardcore: boolean;
  questStageMajor: number;
  questStageMinor: number;
}): string {
  const mode = knownGameMode(int(opts.gameModeId));
  switch (mode) {
    case GameMode.SURVIVAL:
      return `${opts.root}/survival.hi`;
    case GameMode.RUSH:
      return `${opts.root}/rush.hi`;
    case GameMode.TYPO:
      return `${opts.root}/typo.hi`;
    case GameMode.QUESTS: {
      // Native `highscore_build_path` uses `questhc*.hi` when hardcore is OFF,
      // and `quest*.hi` when hardcore is ON.
      const prefix = opts.hardcore ? 'quest' : 'questhc';
      const major = int(opts.questStageMajor);
      const minor = int(opts.questStageMinor);
      return `${opts.root}/${prefix}${major}_${minor}.hi`;
    }
    default:
      return `${opts.root}/unknown.hi`;
  }
}

export function scoresPathForMode(
  baseDir: string,
  gameModeId: GameMode,
  opts: {
    hardcore?: boolean;
    questStageMajor?: number;
    questStageMinor?: number;
    playerCount?: number;
  } = {},
): string {
  const root = scoresDirForBaseDir(baseDir);
  const path = scoresPathForModeRoot({
    root,
    gameModeId,
    hardcore: opts.hardcore ?? false,
    questStageMajor: int(opts.questStageMajor ?? 0),
    questStageMinor: int(opts.questStageMinor ?? 0),
  });
  return withPlayerCountSuffix(path, { playerCount: int(opts.playerCount ?? 1) });
}

export function scoresPathForConfig(
  baseDir: string,
  config: CrimsonConfig,
  opts: { questStageMajor?: number; questStageMinor?: number } = {},
): string {
  const mode = knownGameMode(config.gameplay.mode);
  const root = scoresDirForBaseDir(baseDir);
  let questStageMajor = int(opts.questStageMajor ?? 0);
  let questStageMinor = int(opts.questStageMinor ?? 0);
  let path: string;
  switch (mode) {
    case GameMode.QUESTS:
      if (questStageMajor === 0 && questStageMinor === 0) {
        const level = config.gameplay.questLevel;
        if (level !== null) {
          questStageMajor = int(level.major);
          questStageMinor = int(level.minor);
        }
      }
      path = scoresPathForModeRoot({
        root,
        gameModeId: mode,
        hardcore: Boolean(config.gameplay.hardcore),
        questStageMajor: int(questStageMajor),
        questStageMinor: int(questStageMinor),
      });
      break;
    default:
      path = scoresPathForModeRoot({
        root,
        gameModeId: mode,
        hardcore: config.gameplay.hardcore,
        questStageMajor: int(questStageMajor),
        questStageMinor: int(questStageMinor),
      });
      break;
  }

  return withPlayerCountSuffix(path, { playerCount: config.gameplay.playerCount });
}

export function decodeRecordPayload(encoded: Uint8Array): Uint8Array {
  if (encoded.length !== RECORD_SIZE) {
    throw new Error(`expected 0x${RECORD_SIZE.toString(16)} bytes, got 0x${encoded.length.toString(16)}`);
  }
  const out = new Uint8Array(encoded);
  for (let idx = 0; idx < RECORD_SIZE; idx++) {
    out[idx] = decodeByte(out[idx], idx);
  }
  return out;
}

export function encodeRecordPayload(decoded: Uint8Array): Uint8Array {
  if (decoded.length !== RECORD_SIZE) {
    throw new Error(`expected 0x${RECORD_SIZE.toString(16)} bytes, got 0x${decoded.length.toString(16)}`);
  }
  const out = new Uint8Array(decoded);
  for (let idx = 0; idx < RECORD_SIZE; idx++) {
    out[idx] = encodeByte(out[idx], idx);
  }
  return out;
}

function storageKey(path: string): string {
  return `crimson-highscores:${path}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text);
}

function base64ToBytes(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export function readHighscoreRecords(path: string): HighScoreRecord[] {
  const rawText = localStorage.getItem(storageKey(path));
  if (rawText === null) {
    return [];
  }
  const raw = base64ToBytes(rawText);
  const records: HighScoreRecord[] = [];
  for (let offset = 0; offset + RECORD_WIRE_SIZE <= raw.length; offset += RECORD_WIRE_SIZE) {
    const blob = raw.slice(offset, offset + RECORD_WIRE_SIZE);
    const payload = blob.slice(0, RECORD_SIZE);
    const storedChecksum = readU32(blob, RECORD_SIZE);
    const decoded = decodeRecordPayload(payload);
    const computed = scoreChecksum(decoded);
    if (computed !== storedChecksum) {
      continue;
    }
    records.push(HighScoreRecord.fromBytes(decoded));
  }
  return records;
}

export function writeHighscoreRecords(path: string, records: HighScoreRecord[]): void {
  const raw = new Uint8Array(records.length * RECORD_WIRE_SIZE);
  let offset = 0;
  for (const source of records) {
    const record = source.copy();
    record.trimTrailingSpaces();
    record.ensureDateFields();
    const encoded = encodeRecordPayload(record.data);
    const checksum = scoreChecksum(record.data);
    raw.set(encoded, offset);
    writeU32(raw, offset + RECORD_SIZE, checksum);
    offset += RECORD_WIRE_SIZE;
  }
  localStorage.setItem(storageKey(path), bytesToBase64(raw));
}

export function readHighscoreTable(path: string, opts: { gameModeId: GameMode }): HighScoreRecord[] {
  let records = readHighscoreRecords(path);
  records = records.filter((record) => int(record.gameModeId) === int(opts.gameModeId));
  return sortHighscores(records, { gameModeId: opts.gameModeId }).slice(0, TABLE_MAX);
}

export function sortHighscores(records: HighScoreRecord[], opts: { gameModeId: GameMode }): HighScoreRecord[] {
  const mode = knownGameMode(int(opts.gameModeId));
  switch (mode) {
    case GameMode.RUSH:
      return [...records].sort((a, b) => int(b.survivalElapsedMs) - int(a.survivalElapsedMs));
    case GameMode.QUESTS:
      return [...records].sort((a, b) => {
        const aValue = int(a.survivalElapsedMs);
        const bValue = int(b.survivalElapsedMs);
        const aKey0 = aValue === 0 ? 1 : 0;
        const bKey0 = bValue === 0 ? 1 : 0;
        if (aKey0 !== bKey0) return aKey0 - bKey0;
        return aValue - bValue;
      });
    default:
      return [...records].sort((a, b) => int(b.scoreXp) - int(a.scoreXp));
  }
}

export function rankIndex(recordsSorted: HighScoreRecord[], record: HighScoreRecord): number {
  const mode = knownGameMode(int(record.gameModeId));
  switch (mode) {
    case GameMode.RUSH: {
      const score = int(record.survivalElapsedMs);
      for (let idx = 0; idx < recordsSorted.length; idx++) {
        if (score > int(recordsSorted[idx].survivalElapsedMs)) {
          return idx;
        }
      }
      return recordsSorted.length;
    }
    case GameMode.QUESTS: {
      const score = int(record.survivalElapsedMs);
      for (let idx = 0; idx < recordsSorted.length; idx++) {
        const other = int(recordsSorted[idx].survivalElapsedMs);
        if (other === 0) {
          return idx;
        }
        if (score < other) {
          return idx;
        }
      }
      return recordsSorted.length;
    }
    default: {
      const score = int(record.scoreXp);
      for (let idx = 0; idx < recordsSorted.length; idx++) {
        if (score > int(recordsSorted[idx].scoreXp)) {
          return idx;
        }
      }
      return recordsSorted.length;
    }
  }
}

export function upsertHighscoreRecord(path: string, record: HighScoreRecord): [HighScoreRecord[], number] {
  const recordsSorted = readHighscoreTable(path, { gameModeId: record.gameModeId });
  const idx = rankIndex(recordsSorted, record);
  if (idx >= TABLE_MAX) {
    return [recordsSorted, idx];
  }
  let updated = [...recordsSorted];
  updated.splice(idx, 0, record.copy());
  updated = updated.slice(0, TABLE_MAX);
  writeHighscoreRecords(path, updated);
  return [updated, idx];
}
