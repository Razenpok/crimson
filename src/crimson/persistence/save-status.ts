// Port of crimson/persistence/save_status.py

import { GameMode } from '@crimson/game-modes.ts';
import {
  WEAPON_USAGE_SLOT_COUNT,
  ZERO_WEAPON_USAGE_COUNTS,
  type WeaponUsageCounts,
  weaponUsageSlotForWeaponId,
} from '@crimson/weapon-usage.ts';

export const GAME_CFG_NAME = 'game.cfg';

export const BLOB_SIZE = 0x268;
export const FILE_SIZE = BLOB_SIZE + 4;

export const WEAPON_USAGE_COUNT = WEAPON_USAGE_SLOT_COUNT;

// Quest play count length inferred from known trailing fields in the blob (0xD8..0x244).
export const QUEST_PLAY_COUNT = 91;

export const UNKNOWN_TAIL_SIZE = 0x10;

export type QuestPlayCounts = readonly number[];

const ZERO_QUEST_PLAY_COUNTS: QuestPlayCounts = Array.from({ length: QUEST_PLAY_COUNT }, () => 0);
const ZERO_UNKNOWN_TAIL = new Uint8Array(UNKNOWN_TAIL_SIZE);
const STATUS_FIELD_NAMES = new Set([
  'questUnlockIndex',
  'questUnlockIndexFull',
  'weaponUsageCounts',
  'questPlayCounts',
  'modePlaySurvival',
  'modePlayRush',
  'modePlayTypo',
  'modePlayOther',
  'gameSequenceId',
  'unknownTail',
]);

export class GameStatusData {
  questUnlockIndex: number;
  questUnlockIndexFull: number;
  weaponUsageCounts: WeaponUsageCounts;
  questPlayCounts: QuestPlayCounts;
  modePlaySurvival: number;
  modePlayRush: number;
  modePlayTypo: number;
  modePlayOther: number;
  gameSequenceId: number;
  unknownTail: Uint8Array;

  constructor(opts: {
    questUnlockIndex?: number;
    questUnlockIndexFull?: number;
    weaponUsageCounts?: WeaponUsageCounts;
    questPlayCounts?: QuestPlayCounts;
    modePlaySurvival?: number;
    modePlayRush?: number;
    modePlayTypo?: number;
    modePlayOther?: number;
    gameSequenceId?: number;
    unknownTail?: Uint8Array;
  } = {}) {
    this.questUnlockIndex = opts.questUnlockIndex ?? 0;
    this.questUnlockIndexFull = opts.questUnlockIndexFull ?? 0;
    this.weaponUsageCounts = opts.weaponUsageCounts ?? ZERO_WEAPON_USAGE_COUNTS;
    this.questPlayCounts = opts.questPlayCounts ?? ZERO_QUEST_PLAY_COUNTS;
    this.modePlaySurvival = opts.modePlaySurvival ?? 0;
    this.modePlayRush = opts.modePlayRush ?? 0;
    this.modePlayTypo = opts.modePlayTypo ?? 0;
    this.modePlayOther = opts.modePlayOther ?? 0;
    this.gameSequenceId = opts.gameSequenceId ?? 0;
    this.unknownTail = opts.unknownTail ?? ZERO_UNKNOWN_TAIL;
  }
}

export class GameStatus extends GameStatusData {
  path: string;
  dirty: boolean;

  constructor(opts: {
    path: string;
    dirty?: boolean;
    questUnlockIndex?: number;
    questUnlockIndexFull?: number;
    weaponUsageCounts?: WeaponUsageCounts;
    questPlayCounts?: QuestPlayCounts;
    modePlaySurvival?: number;
    modePlayRush?: number;
    modePlayTypo?: number;
    modePlayOther?: number;
    gameSequenceId?: number;
    unknownTail?: Uint8Array;
  }) {
    super(opts);
    this.path = opts.path;
    this.dirty = opts.dirty ?? false;
    return new Proxy(this, {
      set(target, prop, value, receiver) {
        const name = String(prop);
        const markDirty = STATUS_FIELD_NAMES.has(name);
        const current = markDirty ? Reflect.get(target, prop, receiver) : undefined;
        const ok = Reflect.set(target, prop, value, receiver);
        if (ok && markDirty && current !== undefined && current !== value) {
          Reflect.set(target, 'dirty', true, receiver);
        }
        return ok;
      },
    });
  }

  static fromData(opts: { path: string; data: GameStatusData; dirty?: boolean }): GameStatus {
    return new GameStatus({
      path: opts.path,
      dirty: opts.dirty ?? false,
      questUnlockIndex: opts.data.questUnlockIndex,
      questUnlockIndexFull: opts.data.questUnlockIndexFull,
      weaponUsageCounts: opts.data.weaponUsageCounts.slice(),
      questPlayCounts: opts.data.questPlayCounts.slice(),
      modePlaySurvival: opts.data.modePlaySurvival,
      modePlayRush: opts.data.modePlayRush,
      modePlayTypo: opts.data.modePlayTypo,
      modePlayOther: opts.data.modePlayOther,
      gameSequenceId: opts.data.gameSequenceId,
      unknownTail: new Uint8Array(opts.data.unknownTail),
    });
  }

  asData(): GameStatusData {
    return new GameStatusData({
      questUnlockIndex: this.questUnlockIndex,
      questUnlockIndexFull: this.questUnlockIndexFull,
      weaponUsageCounts: this.weaponUsageCounts.slice(),
      questPlayCounts: this.questPlayCounts.slice(),
      modePlaySurvival: this.modePlaySurvival,
      modePlayRush: this.modePlayRush,
      modePlayTypo: this.modePlayTypo,
      modePlayOther: this.modePlayOther,
      gameSequenceId: this.gameSequenceId,
      unknownTail: new Uint8Array(this.unknownTail),
    });
  }

  modePlayCountForMode(gameMode: GameMode): number {
    return this[modeCountFieldForMode(gameMode)];
  }

  incrementModePlayCountForMode(gameMode: GameMode, delta: number = 1): number {
    const field = modeCountFieldForMode(gameMode);
    const value = this[field] + int(delta);
    this[field] = value;
    return value;
  }

  weaponUsageCountSlot(slot: number): number {
    const slotIdx = requireIndex(slot, { size: WEAPON_USAGE_COUNT, field: 'weapon_usage_slot' });
    return int(this.weaponUsageCounts[slotIdx]);
  }

  incrementWeaponUsageSlot(slot: number, delta: number = 1): number {
    const slotIdx = requireIndex(slot, { size: WEAPON_USAGE_COUNT, field: 'weapon_usage_slot' });
    const counts = Array.from(this.weaponUsageCounts);
    counts[slotIdx] = counts[slotIdx] + int(delta);
    this.weaponUsageCounts = counts;
    return counts[slotIdx];
  }

  weaponUsageCountForWeaponId(weaponId: number): number {
    const slot = weaponUsageSlotForWeaponId(weaponId);
    if (slot === null) return 0;
    return this.weaponUsageCountSlot(slot);
  }

  incrementWeaponUsageForWeaponId(weaponId: number, delta: number = 1): number | null {
    const slot = weaponUsageSlotForWeaponId(weaponId);
    if (slot === null) return null;
    return this.incrementWeaponUsageSlot(slot, delta);
  }

  questPlayCount(index: number): number {
    const questIdx = requireIndex(index, { size: QUEST_PLAY_COUNT, field: 'quest_play_count' });
    return int(this.questPlayCounts[questIdx]);
  }

  incrementQuestPlayCount(index: number, delta: number = 1): number {
    const questIdx = requireIndex(index, { size: QUEST_PLAY_COUNT, field: 'quest_play_count' });
    const counts = Array.from(this.questPlayCounts);
    counts[questIdx] = counts[questIdx] + int(delta);
    this.questPlayCounts = counts;
    return counts[questIdx];
  }

  save(): void {
    saveStatus(this.path, this);
    this.dirty = false;
  }

  saveIfDirty(): void {
    if (this.dirty) {
      this.save();
    }
  }
}

type ModeCountField = 'modePlaySurvival' | 'modePlayRush' | 'modePlayTypo' | 'modePlayOther';

function modeCountFieldForMode(gameMode: GameMode): ModeCountField {
  const mode = gameMode as GameMode;
  switch (mode) {
    case GameMode.SURVIVAL:
      return 'modePlaySurvival';
    case GameMode.RUSH:
      return 'modePlayRush';
    case GameMode.TYPO:
      return 'modePlayTypo';
    default:
      return 'modePlayOther';
  }
}

function requireIndex(index: number, opts: { size: number; field: string }): number {
  const idx = int(index);
  if (0 <= idx && idx < int(opts.size)) {
    return idx;
  }
  throw new RangeError(`${opts.field} out of range: ${idx}`);
}

export function defaultStatusData(): GameStatusData {
  return new GameStatusData();
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, int(value) & 0xFFFF, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, int(value) >>> 0, true);
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export function parseStatusBlob(decoded: Uint8Array): GameStatusData {
  if (decoded.length !== BLOB_SIZE) {
    throw new Error(`expected decoded blob of 0x${BLOB_SIZE.toString(16)} bytes, got 0x${decoded.length.toString(16)}`);
  }
  const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  let offset = 0;
  const questUnlockIndex = readU16(view, offset); offset += 2;
  const questUnlockIndexFull = readU16(view, offset); offset += 2;
  const weaponUsageCounts: number[] = [];
  for (let i = 0; i < WEAPON_USAGE_COUNT; i++) {
    weaponUsageCounts.push(readU32(view, offset)); offset += 4;
  }
  const questPlayCounts: number[] = [];
  for (let i = 0; i < QUEST_PLAY_COUNT; i++) {
    questPlayCounts.push(readU32(view, offset)); offset += 4;
  }
  const modePlaySurvival = readU32(view, offset); offset += 4;
  const modePlayRush = readU32(view, offset); offset += 4;
  const modePlayTypo = readU32(view, offset); offset += 4;
  const modePlayOther = readU32(view, offset); offset += 4;
  const gameSequenceId = readU32(view, offset); offset += 4;
  const unknownTail = decoded.slice(offset, offset + UNKNOWN_TAIL_SIZE);
  return new GameStatusData({
    questUnlockIndex,
    questUnlockIndexFull,
    weaponUsageCounts,
    questPlayCounts,
    modePlaySurvival,
    modePlayRush,
    modePlayTypo,
    modePlayOther,
    gameSequenceId,
    unknownTail,
  });
}

export function buildStatusBlob(data: GameStatusData): Uint8Array {
  const decoded = new Uint8Array(BLOB_SIZE);
  const view = new DataView(decoded.buffer);
  let offset = 0;
  writeU16(view, offset, data.questUnlockIndex); offset += 2;
  writeU16(view, offset, data.questUnlockIndexFull); offset += 2;
  for (let i = 0; i < WEAPON_USAGE_COUNT; i++) {
    writeU32(view, offset, data.weaponUsageCounts[i] ?? 0); offset += 4;
  }
  for (let i = 0; i < QUEST_PLAY_COUNT; i++) {
    writeU32(view, offset, data.questPlayCounts[i] ?? 0); offset += 4;
  }
  writeU32(view, offset, data.modePlaySurvival); offset += 4;
  writeU32(view, offset, data.modePlayRush); offset += 4;
  writeU32(view, offset, data.modePlayTypo); offset += 4;
  writeU32(view, offset, data.modePlayOther); offset += 4;
  writeU32(view, offset, data.gameSequenceId); offset += 4;
  decoded.set(data.unknownTail.slice(0, UNKNOWN_TAIL_SIZE), offset);
  return decoded;
}

export function toS8(value: number): number {
  value &= 0xFF;
  return (value & 0x80) ? value - 0x100 : value;
}

export function indexPoly(idx: number): number {
  const i = toS8(idx);
  return ((i * 7 + 0x0F) * i + 0x03) * i;
}

export function decodeBlob(encoded: Uint8Array): Uint8Array {
  if (encoded.length !== BLOB_SIZE) {
    throw new Error(`decoded blob must be 0x${BLOB_SIZE.toString(16)} bytes, got 0x${encoded.length.toString(16)}`);
  }
  const decoded = new Uint8Array(encoded);
  for (let i = 0; i < BLOB_SIZE; i++) {
    decoded[i] = (decoded[i] - 0x6F - indexPoly(i)) & 0xFF;
  }
  return decoded;
}

export function encodeBlob(decoded: Uint8Array): Uint8Array {
  if (decoded.length !== BLOB_SIZE) {
    throw new Error(`decoded blob must be 0x${BLOB_SIZE.toString(16)} bytes, got 0x${decoded.length.toString(16)}`);
  }
  const encoded = new Uint8Array(decoded);
  for (let i = 0; i < BLOB_SIZE; i++) {
    encoded[i] = (encoded[i] + 0x6F + indexPoly(i)) & 0xFF;
  }
  return encoded;
}

export function computeChecksum(decoded: Uint8Array): number {
  let acc = 0;
  let u = 0;
  for (let i = 0; i < decoded.length; i++) {
    const c = toS8(decoded[i]);
    const iVar5 = (c * 7 + i) * c + u;
    acc = (acc + 0x0D + iVar5) >>> 0;
    u += 0x6F;
  }
  return acc >>> 0;
}

function storageKey(path: string): string {
  return `crimson-game-status:${path}`;
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

export function loadStatus(path: string): GameStatus {
  const rawText = localStorage.getItem(storageKey(path));
  if (rawText === null) {
    throw new Error(`Cannot open file '${path}'`);
  }
  const raw = base64ToBytes(rawText);
  if (raw.length !== FILE_SIZE) {
    throw new Error(`expected 0x${FILE_SIZE.toString(16)} bytes, got 0x${raw.length.toString(16)}`);
  }
  const encoded = raw.slice(0, BLOB_SIZE);
  const storedChecksum = readU32(new DataView(raw.buffer, raw.byteOffset, raw.byteLength), BLOB_SIZE);
  const decoded = decodeBlob(encoded);
  const computed = computeChecksum(decoded);
  if (storedChecksum !== computed) {
    throw new Error('checksum mismatch');
  }
  return GameStatus.fromData({ path, data: parseStatusBlob(decoded), dirty: false });
}

export function saveStatus(path: string, status: GameStatusData | GameStatus): void {
  const data = status instanceof GameStatus ? status.asData() : status;
  const decoded = buildStatusBlob(data);
  const checksum = computeChecksum(decoded);
  const encoded = encodeBlob(decoded);
  const raw = new Uint8Array(FILE_SIZE);
  raw.set(encoded, 0);
  writeU32(new DataView(raw.buffer), BLOB_SIZE, checksum);
  localStorage.setItem(storageKey(path), bytesToBase64(raw));
}

export function ensureGameStatus(baseDir: string): GameStatus {
  const path = `${baseDir.replace(/\/+$/g, '')}/${GAME_CFG_NAME}`;
  try {
    return loadStatus(path);
  } catch {
    const status = GameStatus.fromData({ path, data: defaultStatusData(), dirty: false });
    status.save();
    return status;
  }
}

export function hashStatusData(status: GameStatusData): string {
  const blob = buildStatusBlob(status);
  let hash = 0x811C9DC5;
  for (const byte of blob) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
