// Port of grim/config.py

import { QuestLevel } from "@crimson/quests/level.js";
import { GameMode } from "@crimson/game-modes.ts";

export { GameMode };

export enum AimScheme {
  UNKNOWN = -1,
  MOUSE = 0,
  KEYBOARD = 1,
  JOYSTICK = 2,
  MOUSE_RELATIVE = 3,
  DUAL_ACTION_PAD = 4,
  COMPUTER = 5,
}

export enum MovementControlType {
  UNKNOWN = 0,
  RELATIVE = 1,
  STATIC = 2,
  DUAL_ACTION_PAD = 3,
  MOUSE_POINT_CLICK = 4,
  COMPUTER = 5,
}

export enum HighScoreDateMode {
  ALL_TIME = 0,
  MONTH = 1,
  WEEK = 2,
  DAY = 3,
}

export interface CrimsonDisplayConfig {
  width: number;
  height: number;
  windowed: boolean;
  bpp: number;
  textureScale: number;
  mouseSensitivity: number;
  detailPreset: number;
  fxDetail: [boolean, boolean, boolean];
  violenceDisabled: number;
}

export interface CrimsonAudioConfig {
  soundDisabled: boolean;
  musicDisabled: boolean;
  sfxVolume: number;
  musicVolume: number;
}

export interface CrimsonGameplayConfig {
  mode: GameMode;
  playerCount: number;
  hardcore: boolean;
  questLevel: QuestLevel | null;
  showInfoTexts: boolean;
}

export interface CrimsonProfileConfig {
  playerName: string;
  playerNameInputLen: number;
  savedNameCount: number;
  selectedSavedNameSlot: number;
  savedNames: string[];
  showInternetScores: boolean;
  scoreDateMode: HighScoreDateMode;
}

export interface CrimsonPlayerControls {
  movement: MovementControlType;
  aimScheme: AimScheme;
  showDirectionArrow: boolean;
  moveCodes: [number, number, number, number];
  fireCode: number;
  keyboardAimCodes: [number, number];
  aimAxisCodes: [number, number];
  moveAxisCodes: [number, number];
}

export interface CrimsonControlsConfig {
  players: [CrimsonPlayerControls, CrimsonPlayerControls, CrimsonPlayerControls, CrimsonPlayerControls];
  pickPerkCode: number;
  reloadCode: number;
}

export interface CrimsonConfig {
  display: CrimsonDisplayConfig;
  audio: CrimsonAudioConfig;
  gameplay: CrimsonGameplayConfig;
  profile: CrimsonProfileConfig;
  controls: CrimsonControlsConfig;
}

const _DEFAULT_PLAYER_CONTROL_TEMPLATES: CrimsonPlayerControls[] = [
  { // Player 1
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0x11, 0x1F, 0x1E, 0x20],
    fireCode: 0x100,
    keyboardAimCodes: [0x10, 0x12],
    aimAxisCodes: [0x13F, 0x140],
    moveAxisCodes: [0x141, 0x153],
  },
  { // Player 2
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0xC8, 0xD0, 0xCB, 0xCD],
    fireCode: 0x9D,
    keyboardAimCodes: [0xD3, 0xD1],
    aimAxisCodes: [0x13F, 0x140],
    moveAxisCodes: [0x141, 0x153],
  },
  { // Player 3
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0x17, 0x25, 0x24, 0x26],
    fireCode: 0x36,
    keyboardAimCodes: [0x16, 0x18],
    aimAxisCodes: [0x17E, 0x17E],
    moveAxisCodes: [0x17E, 0x17E],
  },
  { // Player 4
    movement: MovementControlType.STATIC,
    aimScheme: AimScheme.MOUSE,
    showDirectionArrow: true,
    moveCodes: [0x131, 0x132, 0x133, 0x134],
    fireCode: 0x11F,
    keyboardAimCodes: [0x17E, 0x17E],
    aimAxisCodes: [0x140, 0x13F],
    moveAxisCodes: [0x153, 0x154],
  },
];

function defaultPlayerControls(index: number): CrimsonPlayerControls {
  return { ..._DEFAULT_PLAYER_CONTROL_TEMPLATES[Math.max(0, Math.min(3, index))] };
}

export function defaultCrimsonConfig(): CrimsonConfig {
  return {
    display: {
      width: 1024,
      height: 768,
      windowed: true,
      bpp: 32,
      textureScale: 1.0,
      mouseSensitivity: 0.5,
      detailPreset: 5,
      fxDetail: [true, true, true],
      violenceDisabled: 0,
    },
    audio: {
      soundDisabled: false,
      musicDisabled: false,
      sfxVolume: 1.0,
      musicVolume: 1.0,
    },
    gameplay: {
      mode: GameMode.SURVIVAL,
      playerCount: 1,
      hardcore: false,
      questLevel: null,
      showInfoTexts: true,
    },
    profile: {
      playerName: '10tons',
      playerNameInputLen: 0,
      savedNameCount: 1,
      selectedSavedNameSlot: 0,
      savedNames: ['default', 'default', 'default', 'default', 'default', 'default', 'default', 'default'],
      showInternetScores: false,
      scoreDateMode: HighScoreDateMode.ALL_TIME,
    },
    controls: {
      players: [
        defaultPlayerControls(0),
        defaultPlayerControls(1),
        defaultPlayerControls(2),
        defaultPlayerControls(3),
      ],
      pickPerkCode: 0x101,
      reloadCode: 0x102,
    },
  };
}

const PLAYER_NAME_MAX_BYTES = 31;
const SAVED_NAME_SLOT_COUNT = 8;

export function setPlayerNameInput(profile: CrimsonProfileConfig, name: string): void {
  // Trim to latin-1 safe chars, strip trailing spaces
  let trimmed = name.slice(0, PLAYER_NAME_MAX_BYTES);
  trimmed = trimmed.replace(/\s+$/, '');
  profile.playerName = trimmed;
  profile.playerNameInputLen = trimmed.length;
}

export function savedNameLabels(profile: CrimsonProfileConfig): string[] {
  const count = profile.savedNameCount;
  if (count < 1 || count > SAVED_NAME_SLOT_COUNT) {
    throw new Error(`savedNameCount must be in 1..${SAVED_NAME_SLOT_COUNT}, got ${count}`);
  }
  const labels: string[] = [];
  for (let idx = 0; idx < count; idx++) {
    let label = (profile.savedNames[idx] ?? '').trim();
    if (!label) {
      label = idx === 0 ? 'default' : `slot_${idx}`;
    }
    labels.push(label);
  }
  return labels;
}

export function setFxDetail(config: CrimsonDisplayConfig, level: number, enabled: boolean): void {
  const idx = Math.max(0, Math.min(2, level));
  const values: [boolean, boolean, boolean] = [...config.fxDetail];
  values[idx] = enabled;
  config.fxDetail = values;
}

export function fxDetailEnabled(config: CrimsonDisplayConfig, level: number): boolean {
  return config.fxDetail[level];
}

export function applyDetailPreset(config: CrimsonConfig, preset?: number): number {
  const selected = Math.max(1, Math.min(5, preset ?? config.display.detailPreset));
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
