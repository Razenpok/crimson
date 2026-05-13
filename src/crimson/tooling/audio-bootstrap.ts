// Port of crimson/tooling/audio_bootstrap.py

import { type AudioState, initAudioState } from '@grim/audio.ts';
import { type CrimsonConfig, ensureCrimsonCfg } from '@grim/config.ts';
import { ConsoleLog, ConsoleState } from '@grim/console.ts';
import { Crand } from '@grim/rand.ts';

import { downloadMissingPaqs } from '../assets-fetch.ts';
import { defaultRuntimeDir } from '../paths.ts';

export class ViewAudioBootstrap {
  config: CrimsonConfig | null;
  console: ConsoleState | null;
  audio: AudioState | null;
  audioRng: Crand;

  constructor(
    config: CrimsonConfig | null,
    console: ConsoleState | null,
    audio: AudioState | null,
    audioRng: Crand,
  ) {
    this.config = config;
    this.console = console;
    this.audio = audio;
    this.audioRng = audioRng;
  }
}

export async function initViewAudio(assetsDir: string, opts: { seed?: number } = {}): Promise<ViewAudioBootstrap> {
  const seed = opts.seed ?? 0xBEEF;
  const audioRng = new Crand(seed);
  const runtimeDir = defaultRuntimeDir();
  let config: CrimsonConfig;
  try {
    config = ensureCrimsonCfg(runtimeDir);
  } catch {
    return new ViewAudioBootstrap(null, null, null, audioRng);
  }

  const console = new ConsoleState({
    baseDir: runtimeDir,
    log: new ConsoleLog(runtimeDir),
    assetsDir,
  });
  try {
    downloadMissingPaqs(assetsDir, console);
  } catch (exc) {
    console.log.log(`assets: download failed: ${exc instanceof Error ? exc.message : String(exc)}`);
    console.log.flush();
  }

  try {
    const audio = await initAudioState(config, assetsDir);
    return new ViewAudioBootstrap(config, console, audio, audioRng);
  } catch {
    return new ViewAudioBootstrap(config, console, null, audioRng);
  }
}
