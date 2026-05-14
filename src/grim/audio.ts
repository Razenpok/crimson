// Port of grim/audio.py

import { type CrimsonConfig } from './config.ts';
import { type CrandLike } from './rand.ts';
import { type SfxId } from './sfx-map.ts';
import { type MusicState, initMusicState, loadMusicTracks, playMusic as musicPlayMusic, stopMusic as musicStopMusic, triggerGameTune as musicTriggerGameTune, updateMusic, setMusicVolume as musicSetMusicVolume, shutdownMusic } from './music.ts';
import { type SfxState, initSfxState, loadSfxIndex, playSfx as sfxPlaySfx, setSfxVolume as sfxSetSfxVolume, shutdownSfx } from './sfx.ts';
import { resolveAssetsUrl } from './assets.ts';
import { type ConsoleState } from './console.ts';

export class AudioState {
  ready: boolean;
  audioContext: AudioContext | null;
  music: MusicState;
  sfx: SfxState;

  constructor(opts: { ready: boolean; audioContext?: AudioContext | null; music: MusicState; sfx: SfxState }) {
    this.ready = opts.ready;
    this.audioContext = opts.audioContext ?? null;
    this.music = opts.music;
    this.sfx = opts.sfx;
  }
}

export async function initAudioState(config: CrimsonConfig, assetsUrl: string, console?: ConsoleState | null): Promise<AudioState> {
  // Resolve to local or CDN fallback (cached after first call)
  assetsUrl = await resolveAssetsUrl(assetsUrl);

  const musicDisabled = config.audio.musicDisabled;
  const soundDisabled = config.audio.soundDisabled;
  const musicVolume = config.audio.musicVolume;
  const sfxVolume = config.audio.sfxVolume;

  const musicEnabled = !musicDisabled;
  const sfxEnabled = !soundDisabled;

  if (!musicEnabled && !sfxEnabled) {
    console?.log.log('audio: disabled (music + sfx)');
    console?.log.flush();
    return new AudioState({
      ready: false,
      audioContext: null,
      music: initMusicState({ ready: false, enabled: false, volume: musicVolume }),
      sfx: initSfxState({ ready: false, enabled: false, volume: sfxVolume }),
    });
  }

  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContext();
  } catch {
    console?.log.log('audio: device init failed');
    console?.log.flush();
    return new AudioState({
      ready: false,
      audioContext: null,
      music: initMusicState({ ready: false, enabled: false, volume: musicVolume }),
      sfx: initSfxState({ ready: false, enabled: false, volume: sfxVolume }),
    });
  }

  const state = new AudioState({
    ready: true,
    audioContext,
    music: initMusicState({ ready: true, enabled: musicEnabled, volume: musicVolume }),
    sfx: initSfxState({ ready: true, enabled: sfxEnabled, volume: sfxVolume }),
  });

  await loadSfxIndex(state.sfx, audioContext, assetsUrl);
  await loadMusicTracks(state.music, audioContext, assetsUrl);

  return state;
}

export function playMusic(state: AudioState, trackName: string): void {
  musicPlayMusic(state.music, state.audioContext, trackName);
}

export function stopMusic(state: AudioState | null): void {
  if (!state) return;
  musicStopMusic(state.music);
}

export function triggerGameTune(state: AudioState, opts: { rng: CrandLike }): string | null {
  return musicTriggerGameTune(state.music, state.audioContext, { rng: opts.rng });
}

export function playSfx(state: AudioState | null, sfxId: SfxId, opts: { reflexBoostTimer?: number } = {}): void {
  const reflexBoostTimer = opts.reflexBoostTimer ?? 0.0;
  if (!state) return;
  sfxPlaySfx(state.sfx, state.audioContext, sfxId, { reflexBoostTimer });
}

export function setSfxVolume(state: AudioState | null, volume: number): void {
  if (!state) return;
  sfxSetSfxVolume(state.sfx, volume);
}

export function setMusicVolume(state: AudioState | null, volume: number): void {
  if (!state) return;
  musicSetMusicVolume(state.music, volume);
}

export function updateAudio(state: AudioState, dt: number): void {
  updateMusic(state.music, state.audioContext, dt);
}

// Unused in WebGL port: browser handles AudioContext cleanup on page unload
export function shutdownAudio(state: AudioState): void {
  if (!state.ready) return;
  shutdownSfx(state.sfx);
  shutdownMusic(state.music);
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }
}

export const audioPlayMusic = playMusic;
export const audioStopMusic = stopMusic;
export const audioTriggerGameTune = triggerGameTune;
export const audioPlaySfx = playSfx;
export const audioSetSfxVolume = setSfxVolume;
export const audioSetMusicVolume = setMusicVolume;
export const audioUpdate = updateAudio;
export const audioShutdown = shutdownAudio;
