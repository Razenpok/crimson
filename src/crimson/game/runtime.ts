// Port of crimson/game/runtime.py
//
// WebGL adaptation: no faulthandler, no file-based crash log, no PAQ download,
// no webbrowser.open (stubbed), no raylib config flags.  The `runGame` function
// wires up the GameState, registers console commands, and hands off to the
// GameLoopView via the engine App.

import * as wgl from '@wgl';
import { defaultCrimsonConfig } from '@grim/config.ts';
import { type ConsoleState, type CommandHandler, createConsole } from '@grim/console.ts';
import { Crand } from '@grim/rand.ts';
import { loadMusicTrack, queueTrack } from '@grim/music.ts';

import { GameMode } from '@crimson/game-modes.ts';
import { cycleRtxRenderMode, modeFromRtxFlag, parseRtxRenderMode } from '@crimson/render/rtx/mode.ts';
import {
  DEMO_QUEST_GRACE_TIME_MS,
  DEMO_TOTAL_PLAY_TIME_MS,
  demoTrialOverlayInfo,
  formatDemoTrialTime,
} from '@crimson/demo-trial.ts';
import { type GameConfig, GameState } from './types.ts';
import { GameLoopView } from './loop-view.ts';

export const CRIMSON_PAQ_NAME = 'crimson.paq';
export const MUSIC_PAQ_NAME = 'music.paq';
export const SFX_PAQ_NAME = 'sfx.paq';
export const AUTOEXEC_NAME = 'autoexec.txt';
export const REQUIRED_RUNTIME_PAQS: readonly string[] = [
  CRIMSON_PAQ_NAME,
  MUSIC_PAQ_NAME,
  SFX_PAQ_NAME,
];

function parseFloatArg(value: string): number {
  const v = parseFloat(value);
  return Number.isFinite(v) ? v : 0.0;
}

function applyDebugConsoleDefaults(console: ConsoleState, debug: boolean): void {
  if (!debug) return;
  console.registerCvar('cv_showFPS', '1');
}

/** Minimal persistence stub matching fields used by runtime.py. */
export interface GameStatusPersist {
  gameSequenceId: number;
  questUnlockIndex: number;
  questUnlockIndexFull: number;
  questPlayCounts: number[];
  saveIfDirty(): void;
  incrementModePlayCountForMode(mode: GameMode): void;
  modePlayCountForMode(mode: number): number;
  incrementQuestPlayCount(index: number): void;
  weaponUsageCountSlot(slot: number): number;
  incrementWeaponUsageSlot(slot: number): void;
}

/** In-memory status (no file I/O). */
export function createGameStatus(): GameStatusPersist {
  let _gameSequenceId = 0;
  let _dirty = false;
  const _modePlayCounts = new Map<number, number>();
  const _weaponUsageCounts = new Map<number, number>();
  const _questPlayCounts: number[] = [];

  return {
    get gameSequenceId(): number {
      return _gameSequenceId;
    },
    set gameSequenceId(v: number) {
      if (v !== _gameSequenceId) {
        _gameSequenceId = int(v);
        _dirty = true;
      }
    },
    questUnlockIndex: 50,
    questUnlockIndexFull: 50,
    get questPlayCounts(): number[] {
      return _questPlayCounts;
    },
    saveIfDirty(): void {
      if (!_dirty) return;
      _dirty = false;
      // TODO: persist to localStorage
    },
    incrementModePlayCountForMode(mode: GameMode): void {
      _modePlayCounts.set(mode, (_modePlayCounts.get(mode) ?? 0) + 1);
      _dirty = true;
    },
    modePlayCountForMode(mode: number): number {
      return _modePlayCounts.get(mode) ?? 0;
    },
    incrementQuestPlayCount(index: number): void {
      while (_questPlayCounts.length <= index) _questPlayCounts.push(0);
      _questPlayCounts[index]++;
      _dirty = true;
    },
    weaponUsageCountSlot(slot: number): number {
      return _weaponUsageCounts.get(slot) ?? 0;
    },
    incrementWeaponUsageSlot(slot: number): void {
      _weaponUsageCounts.set(slot, (_weaponUsageCounts.get(slot) ?? 0) + 1);
      _dirty = true;
    },
  };
}

function bootCommandHandlers(
  state: GameState,
  status: GameStatusPersist,
): Record<string, CommandHandler> {
  const con = state.console;

  function cmdSetGammaRamp(args: string[]): void {
    if (args.length !== 1) {
      con.log.log('setGammaRamp <scalar > 0>');
      con.log.log('Command adjusts gamma ramp linearly by multiplying with given scalar');
      return;
    }
    const value = parseFloatArg(args[0]);
    state.gammaRamp = value;
    con.log.log(`Gamma ramp regenerated and multiplied with ${value.toFixed(6)}`);
  }

  function cmdSndAddGameTune(args: string[]): void {
    if (args.length !== 1) {
      con.log.log('snd_addGameTune <tuneName.ogg>');
      return;
    }
    const relPath = `music/${args[0]}`;
    const audio = state.audio;
    if (!audio || !audio.audioContext) {
      con.log.log(`snd_addGameTune: audio not initialised`);
      return;
    }
    loadMusicTrack(audio.music, audio.audioContext, state.assetsUrl, relPath)
      .then((result) => {
        if (result) {
          const [key, trackId] = result;
          queueTrack(audio.music, key);
          con.log.log(`snd_addGameTune: loaded '${key}' (id=${trackId})`);
        } else {
          con.log.log(`snd_addGameTune: failed to load '${relPath}'`);
        }
      })
      .catch((err) => {
        con.log.log(`snd_addGameTune: error loading '${relPath}': ${err}`);
      });
  }

  function cmdGenerateTerrain(_args: string[]): void {
    state.terrainRegenerateRequested = true;
  }

  function cmdTellTimeSurvived(_args: string[]): void {
    const seconds = int(Math.max(0.0, state.survivalElapsedMs) * 0.00100000005);
    con.log.log(`Survived: ${seconds} seconds.`);
  }

  function cmdSetResourcePaq(args: string[]): void {
    if (args.length !== 1) {
      con.log.log('setresourcepaq <resourcepaq>');
      return;
    }
    con.log.log('setresourcepaq is not supported in the rewrite.');
  }

  function cmdLoadTexture(args: string[]): void {
    if (args.length !== 1) {
      con.log.log('loadtexture <texturefileid>');
      return;
    }
    con.log.log('loadtexture is not supported in the rewrite.');
  }

  function cmdOpenUrl(args: string[]): void {
    if (args.length !== 1) {
      con.log.log('openurl <url>');
      return;
    }
    const url = args[0];
    try {
      window.open(url, '_blank');
      con.log.log(`Launching web browser (${url})..`);
    } catch {
      con.log.log('Failed to launch web browser.');
    }
  }

  function cmdSndFreqAdjustment(_args: string[]): void {
    state.sndFreqAdjustmentEnabled = !state.sndFreqAdjustmentEnabled;
    if (state.sndFreqAdjustmentEnabled) {
      con.log.log('Sound frequency adjustment is now enabled.');
    } else {
      con.log.log('Sound frequency adjustment is now disabled.');
    }
  }

  function cmdDemoTrialSetPlaytime(args: string[]): void {
    if (args.length !== 1) {
      con.log.log('demoTrialSetPlaytime <ms>');
      return;
    }
    let value: number;
    try {
      value = int(parseFloat(args[0]));
    } catch {
      value = 0;
    }
    if (!Number.isFinite(value)) value = 0;
    status.gameSequenceId = Math.max(0, value);
    status.saveIfDirty();
    con.log.log(
      `demo trial: playtime=${status.gameSequenceId}ms (total ${DEMO_TOTAL_PLAY_TIME_MS}ms)`,
    );
  }

  function cmdDemoTrialSetGrace(args: string[]): void {
    if (args.length !== 1) {
      con.log.log('demoTrialSetGrace <ms>');
      return;
    }
    let value: number;
    try {
      value = int(parseFloat(args[0]));
    } catch {
      value = 0;
    }
    if (!Number.isFinite(value)) value = 0;
    state.demoTrialElapsedMs = Math.max(0, value);
    con.log.log(
      `demo trial: quest grace=${state.demoTrialElapsedMs}ms (total ${DEMO_QUEST_GRACE_TIME_MS}ms)`,
    );
  }

  function cmdDemoTrialReset(_args: string[]): void {
    status.gameSequenceId = 0;
    status.saveIfDirty();
    state.demoTrialElapsedMs = 0;
    con.log.log('demo trial: timers reset');
  }

  function cmdDemoTrialInfo(_args: string[]): void {
    const modeRaw = state.config.gameplay.mode;
    let modeId: GameMode;
    if (Object.values(GameMode).includes(modeRaw as GameMode)) {
      modeId = modeRaw as GameMode;
    } else {
      modeId = GameMode.DEMO;
    }
    let questLevel = null;
    if (modeId === GameMode.QUESTS) {
      questLevel = state.pendingQuestLevel;
    }
    const info = demoTrialOverlayInfo({
      demoBuild: state.demoEnabled,
      gameModeId: modeId,
      globalPlaytimeMs: int(status.gameSequenceId),
      questGraceElapsedMs: int(state.demoTrialElapsedMs),
      questLevel,
    });
    const remaining = formatDemoTrialTime(info.remainingMs);
    con.log.log(
      'demo trial: ' +
        `demo=${state.demoEnabled ? 1 : 0} ` +
        `mode=${modeId} ` +
        `quest=${questLevel !== null ? `${questLevel.major}.${questLevel.minor}` : '0.0'} ` +
        `playtime=${status.gameSequenceId}ms ` +
        `grace=${state.demoTrialElapsedMs}ms ` +
        `visible=${info.visible ? 1 : 0} ` +
        `kind=${info.kind} ` +
        `remaining=${remaining}`,
    );
  }

  function cmdRenderMode(args: string[]): void {
    if (args.length > 1) {
      con.log.log('rendermode <classic|rtx>');
      return;
    }
    if (args.length === 0) {
      con.log.log(`Render mode is '${state.rtxMode}'.`);
      return;
    }
    try {
      const mode = parseRtxRenderMode(args[0]);
      state.rtxMode = mode;
      con.log.log(`Render mode set to '${state.rtxMode}'.`);
    } catch {
      con.log.log('rendermode <classic|rtx>');
    }
  }

  function cmdToggleRtx(args: string[]): void {
    if (args.length > 0) {
      con.log.log('togglertx');
      return;
    }
    state.rtxMode = cycleRtxRenderMode(state.rtxMode);
    con.log.log(`Render mode set to '${state.rtxMode}'.`);
  }

  return {
    setGammaRamp: cmdSetGammaRamp,
    snd_addGameTune: cmdSndAddGameTune,
    generateterrain: cmdGenerateTerrain,
    telltimesurvived: cmdTellTimeSurvived,
    setresourcepaq: cmdSetResourcePaq,
    loadtexture: cmdLoadTexture,
    openurl: cmdOpenUrl,
    sndfreqadjustment: cmdSndFreqAdjustment,
    demoTrialSetPlaytime: cmdDemoTrialSetPlaytime,
    demoTrialSetGrace: cmdDemoTrialSetGrace,
    demoTrialReset: cmdDemoTrialReset,
    demoTrialInfo: cmdDemoTrialInfo,
    rendermode: cmdRenderMode,
    togglertx: cmdToggleRtx,
  };
}

function registerCoreCvars(console: ConsoleState, width: number, height: number): void {
  // Matches Python's register_core_cvars in grim/console.py.
  // cvars already registered in createConsole: cv_silentloads, cv_bodiesFade,
  // cv_uiTransparency, cv_showFPS — so we skip those here.
  console.registerCvar('cv_uiPointFilterPanels', '0');
  console.registerCvar('cv_enableMousePointAndClickMovement', '0');
  console.registerCvar('cv_verbose', '0');
  console.registerCvar('cv_terrainBodiesTransparency', '0');
  console.registerCvar('cv_uiSmallIndicators', '0');
  console.registerCvar('cv_aimEnhancementFade', '0.7');
  console.registerCvar('cv_friendlyFire', '0');
  console.registerCvar('cv_lanLockstepEnabled', '0');
  console.registerCvar('cv_lanPlayerRings', '0');
  console.registerCvar('cv_padAimDistMul', '96');
  console.registerCvar('v_width', String(width));
  console.registerCvar('v_height', String(height));
}

function registerBootCommands(
  console: ConsoleState,
  handlers: Record<string, CommandHandler>,
): void {
  for (const [name, handler] of Object.entries(handlers)) {
    console.registerCommand(name, handler);
  }
}

/**
 * Bootstrap the game: create state, register commands, and return the
 * GameLoopView ready for the engine App to drive.
 *
 * In the browser build this is synchronous; asset loading happens inside the
 * boot screen asynchronously via fetch().
 */
export function runGame(
  config: GameConfig,
): { view: GameLoopView; state: GameState } {
  const cfg = defaultCrimsonConfig();
  const width = config.width ?? cfg.display.width;
  const height = config.height ?? cfg.display.height;
  cfg.display.width = width;
  cfg.display.height = height;
  wgl.resize(width, height);

  const seed = config.seed ?? ((Date.now() * 0xDEAD + 0xBEEF) >>> 0);
  const rng = new Crand(seed);

  const console = createConsole();
  const status = createGameStatus();

  const state = new GameState({
    assetsUrl: config.assetsUrl,
    rng,
    config: cfg,
    console,
    demoEnabled: config.demoEnabled,
    debugEnabled: config.debug,
    preserveBugs: config.preserveBugs,
    resources: null,
    audio: null,
    sessionStart: performance.now(),
    rtxMode: modeFromRtxFlag(config.rtx),
  });

  // Skip intro if requested
  state.skipIntro = config.noIntro;

  // Register console commands
  const handlers = bootCommandHandlers(state, status);
  registerBootCommands(console, handlers);
  registerCoreCvars(console, width, height);
  applyDebugConsoleDefaults(console, config.debug);

  console.log.log('crimson: boot start');
  console.log.log(
    `config: ${cfg.display.width}x${cfg.display.height} windowed=${cfg.display.windowed}`,
  );
  console.log.log(`assets: ${config.assetsUrl}`);
  console.log.log(`commands: ${console.commands.size} registered`);
  console.log.log(`cvars: ${console.cvars.size} registered`);

  // NOTE: autoexec.txt exec is skipped in WebGL — no filesystem

  const view = new GameLoopView(state, status);

  return { view, state };
}
