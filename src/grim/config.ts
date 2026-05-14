// Port of grim/config.py

import { QuestLevel } from '@crimson/quests/level.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { AimScheme } from '@crimson/aim-schemes.ts';
import { MovementControlType } from '@crimson/movement-controls.ts';

export { AimScheme, GameMode, MovementControlType };

export const CRIMSON_CFG_NAME = 'crimson.cfg';
export const CRIMSON_CFG_SIZE = 0x480;
export const PLAYER_NAME_SIZE = 0x20;
export const PLAYER_NAME_MAX_BYTES = PLAYER_NAME_SIZE - 1;
export const SAVED_NAME_SLOT_COUNT = 8;
export const SAVED_NAME_ENTRY_SIZE = 0x1B;
export const SAVED_NAMES_BLOB_SIZE = SAVED_NAME_SLOT_COUNT * SAVED_NAME_ENTRY_SIZE;
export const UNKNOWN_248_SIZE = 0x1F8;
export const PLAYER_BIND_BLOCK_DWORDS = 0x10;
export const PLAYER_BIND_BLOCK_SIZE = PLAYER_BIND_BLOCK_DWORDS * 4;
export const EXT_DIRECTION_ARROW_FLAG_COUNT = 2;
export const EXTENDED_RESERVED_GAP_SIZE = UNKNOWN_248_SIZE - 2 * PLAYER_BIND_BLOCK_SIZE - EXT_DIRECTION_ARROW_FLAG_COUNT;
export const EXT_DIRECTION_ARROW_UNSET = 0;
export const EXT_DIRECTION_ARROW_OFF = 1;
export const EXT_DIRECTION_ARROW_ON = 2;
export const KEYBIND_UNBOUND_CODE = 0x17E;
export const RESERVED_KEYBIND_SLOT_COUNT = 2;
export const PADDING_KEYBIND_SLOT_COUNT = 3;

export enum HighScoreDateMode {
  ALL_TIME = 0,
  MONTH = 1,
  WEEK = 2,
  DAY = 3,
}

export class CrimsonDisplayConfig {
  width: number;
  height: number;
  windowed: boolean;
  bpp: number;
  textureScale: number;
  mouseSensitivity: number;
  detailPreset: number;
  fxDetail: [boolean, boolean, boolean];
  violenceDisabled: number;

  constructor(opts: {
    width: number;
    height: number;
    windowed: boolean;
    bpp: number;
    textureScale: number;
    mouseSensitivity: number;
    detailPreset: number;
    fxDetail: [boolean, boolean, boolean];
    violenceDisabled: number;
  }) {
    this.width = opts.width;
    this.height = opts.height;
    this.windowed = opts.windowed;
    this.bpp = opts.bpp;
    this.textureScale = opts.textureScale;
    this.mouseSensitivity = opts.mouseSensitivity;
    this.detailPreset = opts.detailPreset;
    this.fxDetail = opts.fxDetail;
    this.violenceDisabled = opts.violenceDisabled;
  }

  fxDetailEnabled(level: number, _default: boolean = false): boolean {
    return Boolean(this.fxDetail[int(level)]);
  }

  setFxDetail(level: number, enabled: boolean): void {
    const values: [boolean, boolean, boolean] = [...this.fxDetail];
    values[int(level)] = Boolean(enabled);
    this.fxDetail = [Boolean(values[0]), Boolean(values[1]), Boolean(values[2])];
  }
}

export class CrimsonAudioConfig {
  soundDisabled: boolean;
  musicDisabled: boolean;
  sfxVolume: number;
  musicVolume: number;

  constructor(opts: { soundDisabled: boolean; musicDisabled: boolean; sfxVolume: number; musicVolume: number }) {
    this.soundDisabled = opts.soundDisabled;
    this.musicDisabled = opts.musicDisabled;
    this.sfxVolume = opts.sfxVolume;
    this.musicVolume = opts.musicVolume;
  }
}

export class CrimsonGameplayConfig {
  mode: GameMode;
  playerCount: number;
  hardcore: boolean;
  questLevel: QuestLevel | null;
  showInfoTexts: boolean;

  constructor(opts: {
    mode: GameMode;
    playerCount: number;
    hardcore: boolean;
    questLevel: QuestLevel | null;
    showInfoTexts: boolean;
  }) {
    this.mode = opts.mode;
    this.playerCount = opts.playerCount;
    this.hardcore = opts.hardcore;
    this.questLevel = opts.questLevel;
    this.showInfoTexts = opts.showInfoTexts;
  }
}

export class CrimsonProfileConfig {
  playerName: string;
  playerNameInputLen: number;
  savedNameCount: number;
  selectedSavedNameSlot: number;
  savedNames: string[];
  showInternetScores: boolean;
  scoreDateMode: HighScoreDateMode;

  constructor(opts: {
    playerName: string;
    playerNameInputLen: number;
    savedNameCount: number;
    selectedSavedNameSlot: number;
    savedNames: string[];
    showInternetScores: boolean;
    scoreDateMode: HighScoreDateMode;
  }) {
    this.playerName = opts.playerName;
    this.playerNameInputLen = opts.playerNameInputLen;
    this.savedNameCount = opts.savedNameCount;
    this.selectedSavedNameSlot = opts.selectedSavedNameSlot;
    this.savedNames = opts.savedNames;
    this.showInternetScores = opts.showInternetScores;
    this.scoreDateMode = opts.scoreDateMode;
  }

  setPlayerNameInput(name: string): void {
    const encoded: number[] = [];
    for (const ch of String(name)) {
      const code = ch.charCodeAt(0);
      if (code <= 0xFF) encoded.push(code);
      if (encoded.length >= PLAYER_NAME_MAX_BYTES) break;
    }

    let end = encoded.length;
    while (end > 1 && encoded[end - 1] === 0x20) {
      end -= 1;
    }

    this.playerName = String.fromCharCode(...encoded.slice(0, end));
    this.playerNameInputLen = encoded.length;
  }

  savedNameLabels(): string[] {
    const count = int(this.savedNameCount);
    if (count < 1 || count > SAVED_NAME_SLOT_COUNT) {
      throw new Error(`saved_name_count must be in 1..${SAVED_NAME_SLOT_COUNT}, got ${count}`);
    }
    const labels: string[] = [];
    for (let idx = 0; idx < count; idx++) {
      let label = String(this.savedNames[idx] ?? '').trim();
      if (!label) {
        label = idx === 0 ? 'default' : `slot_${idx}`;
      }
      labels.push(label);
    }
    return labels;
  }
}

export class CrimsonPlayerControls {
  movement: MovementControlType;
  aimScheme: AimScheme;
  showDirectionArrow: boolean;
  moveCodes: [number, number, number, number];
  fireCode: number;
  keyboardAimCodes: [number, number];
  aimAxisCodes: [number, number];
  moveAxisCodes: [number, number];

  constructor(opts: {
    movement: MovementControlType;
    aimScheme: AimScheme;
    showDirectionArrow: boolean;
    moveCodes: [number, number, number, number];
    fireCode: number;
    keyboardAimCodes: [number, number];
    aimAxisCodes: [number, number];
    moveAxisCodes: [number, number];
  }) {
    this.movement = opts.movement;
    this.aimScheme = opts.aimScheme;
    this.showDirectionArrow = opts.showDirectionArrow;
    this.moveCodes = opts.moveCodes;
    this.fireCode = opts.fireCode;
    this.keyboardAimCodes = opts.keyboardAimCodes;
    this.aimAxisCodes = opts.aimAxisCodes;
    this.moveAxisCodes = opts.moveAxisCodes;
  }
}

export class CrimsonControlsConfig {
  players: [CrimsonPlayerControls, CrimsonPlayerControls, CrimsonPlayerControls, CrimsonPlayerControls];
  pickPerkCode: number;
  reloadCode: number;

  constructor(opts: {
    players: [CrimsonPlayerControls, CrimsonPlayerControls, CrimsonPlayerControls, CrimsonPlayerControls];
    pickPerkCode: number;
    reloadCode: number;
  }) {
    this.players = opts.players;
    this.pickPerkCode = opts.pickPerkCode;
    this.reloadCode = opts.reloadCode;
  }

  player(playerIndex: number): CrimsonPlayerControls {
    return this.players[_playerIndex(playerIndex)];
  }
}

export class CrimsonConfig {
  path: string;
  display: CrimsonDisplayConfig;
  audio: CrimsonAudioConfig;
  gameplay: CrimsonGameplayConfig;
  profile: CrimsonProfileConfig;
  controls: CrimsonControlsConfig;

  constructor(opts: {
    path?: string;
    display: CrimsonDisplayConfig;
    audio: CrimsonAudioConfig;
    gameplay: CrimsonGameplayConfig;
    profile: CrimsonProfileConfig;
    controls: CrimsonControlsConfig;
  }) {
    this.path = opts.path ?? '<memory>';
    this.display = opts.display;
    this.audio = opts.audio;
    this.gameplay = opts.gameplay;
    this.profile = opts.profile;
    this.controls = opts.controls;
  }

  save(): void {
    // WebGL has no file-backed crimson.cfg path; keep the Python method as a no-op.
  }
}

const _DEFAULT_PLAYER_CONTROL_TEMPLATES: CrimsonPlayerControls[] = [
  new CrimsonPlayerControls({
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0x11, 0x1F, 0x1E, 0x20],
    fireCode: 0x100,
    keyboardAimCodes: [0x10, 0x12],
    aimAxisCodes: [0x13F, 0x140],
    moveAxisCodes: [0x141, 0x153],
  }),
  new CrimsonPlayerControls({
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0xC8, 0xD0, 0xCB, 0xCD],
    fireCode: 0x9D,
    keyboardAimCodes: [0xD3, 0xD1],
    aimAxisCodes: [0x13F, 0x140],
    moveAxisCodes: [0x141, 0x153],
  }),
  new CrimsonPlayerControls({
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0x17, 0x25, 0x24, 0x26],
    fireCode: 0x36,
    keyboardAimCodes: [0x16, 0x18],
    aimAxisCodes: [0x17E, 0x17E],
    moveAxisCodes: [0x17E, 0x17E],
  }),
  new CrimsonPlayerControls({
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0x131, 0x132, 0x133, 0x134],
    fireCode: 0x11F,
    keyboardAimCodes: [0x17E, 0x17E],
    aimAxisCodes: [0x140, 0x13F],
    moveAxisCodes: [0x153, 0x154],
  }),
];

function defaultPlayerControls(index: number): CrimsonPlayerControls {
  const defaults = _DEFAULT_PLAYER_CONTROL_TEMPLATES[_playerIndex(index)];
  return new CrimsonPlayerControls({
    movement: defaults.movement,
    aimScheme: defaults.aimScheme,
    showDirectionArrow: defaults.showDirectionArrow,
    moveCodes: defaults.moveCodes,
    fireCode: defaults.fireCode,
    keyboardAimCodes: defaults.keyboardAimCodes,
    aimAxisCodes: defaults.aimAxisCodes,
    moveAxisCodes: defaults.moveAxisCodes,
  });
}

function _playerIndex(playerIndex: number): number {
  const idx = int(playerIndex);
  if (idx < 0 || idx >= 4) {
    throw new Error(`player index must be in 0..3, got ${idx}`);
  }
  return idx;
}

function _requireRange(value: number, opts: { minimum: number; maximum: number; field: string }): number {
  if (value < opts.minimum || value > opts.maximum) {
    throw new Error(`${opts.field} must be in ${opts.minimum}..${opts.maximum}, got ${value}`);
  }
  return value;
}

export function defaultCrimsonConfig(path: string = '<memory>'): CrimsonConfig {
  const profile = new CrimsonProfileConfig({
    playerName: '',
    playerNameInputLen: 0,
    savedNameCount: 1,
    selectedSavedNameSlot: 0,
    savedNames: ['default', 'default', 'default', 'default', 'default', 'default', 'default', 'default'],
    showInternetScores: false,
    scoreDateMode: HighScoreDateMode.ALL_TIME,
  });
  profile.setPlayerNameInput('10tons');
  profile.playerNameInputLen = 0;

  return new CrimsonConfig({
    path,
    display: new CrimsonDisplayConfig({
      width: 1024,
      height: 768,
      windowed: true,
      bpp: 32,
      textureScale: 1.0,
      mouseSensitivity: 0.5,
      detailPreset: 5,
      fxDetail: [true, true, true],
      violenceDisabled: 0,
    }),
    audio: new CrimsonAudioConfig({
      soundDisabled: false,
      musicDisabled: false,
      sfxVolume: 1.0,
      musicVolume: 1.0,
    }),
    gameplay: new CrimsonGameplayConfig({
      mode: GameMode.SURVIVAL,
      playerCount: 1,
      hardcore: false,
      questLevel: null,
      showInfoTexts: true,
    }),
    profile,
    controls: new CrimsonControlsConfig({
      players: [
        defaultPlayerControls(0),
        defaultPlayerControls(1),
        defaultPlayerControls(2),
        defaultPlayerControls(3),
      ],
      pickPerkCode: 0x101,
      reloadCode: 0x102,
    }),
  });
}

export const defaultCrimsonCfg = defaultCrimsonConfig;

export function decodeCrimsonCfg(_path: string, _blob: Uint8Array): CrimsonConfig {
  throw new Error('crimson.cfg binary decode is unavailable in the WebGL build');
}

export function encodeCrimsonCfg(_config: CrimsonConfig): Uint8Array {
  throw new Error('crimson.cfg binary encode is unavailable in the WebGL build');
}

export function loadCrimsonCfg(_path: string): CrimsonConfig {
  throw new Error('crimson.cfg file loading is unavailable in the WebGL build');
}

export function ensureCrimsonCfg(baseDir: string): CrimsonConfig {
  // WebGL has no file-backed crimson.cfg path; use the default config.
  return defaultCrimsonConfig(`${baseDir}/${CRIMSON_CFG_NAME}`);
}

export function setPlayerNameInput(profile: CrimsonProfileConfig, name: string): void {
  profile.setPlayerNameInput(name);
}

export function savedNameLabels(profile: CrimsonProfileConfig): string[] {
  return profile.savedNameLabels();
}

export function setFxDetail(config: CrimsonDisplayConfig, level: number, enabled: boolean): void {
  config.setFxDetail(level, enabled);
}

export function fxDetailEnabled(config: CrimsonDisplayConfig, level: number): boolean {
  return config.fxDetailEnabled(level);
}

export function applyDetailPreset(config: CrimsonConfig, preset?: number): number {
  const selected = _requireRange(int(preset ?? config.display.detailPreset), {
    minimum: 1,
    maximum: 5,
    field: 'detail_preset',
  });
  config.display.detailPreset = selected;
  if (selected <= 1) {
    config.display.fxDetail = [false, false, false];
  } else if (selected === 2) {
    config.display.fxDetail = [false, false, true];
  } else {
    config.display.fxDetail = [true, true, true];
  }
  return selected;
}
