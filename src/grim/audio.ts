// Port of grim/audio.py

import { type CrimsonConfig } from './config.ts';
import { type CrandLike } from './rand.ts';
import { type SfxId } from './sfx-map.ts';
import { type MusicState, initMusicState, loadMusicTracks, playMusic, stopMusic, triggerGameTune, updateMusic, setMusicVolume, shutdownMusic } from './music.ts';
import { type SfxState, initSfxState, loadSfxIndex, playSfx, setSfxVolume, shutdownSfx } from './sfx.ts';
import { resolveAssetsUrl } from './assets.ts';

export interface AudioState {
  ready: boolean;
  audioContext: AudioContext | null;
  music: MusicState;
  sfx: SfxState;
}

export async function initAudioState(config: CrimsonConfig, assetsUrl: string): Promise<AudioState> {
  // Resolve to local or CDN fallback (cached after first call)
  assetsUrl = await resolveAssetsUrl(assetsUrl);

  const musicDisabled = config.audio.musicDisabled;
  const soundDisabled = config.audio.soundDisabled;
  const musicVolume = config.audio.musicVolume;
  const sfxVolume = config.audio.sfxVolume;

  const musicEnabled = !musicDisabled;
  const sfxEnabled = !soundDisabled;

  if (!musicEnabled && !sfxEnabled) {
    return {
      ready: false,
      audioContext: null,
      music: initMusicState(false, false, musicVolume),
      sfx: initSfxState(false, false, sfxVolume),
    };
  }

  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContext();
  } catch {
    return {
      ready: false,
      audioContext: null,
      music: initMusicState(false, false, musicVolume),
      sfx: initSfxState(false, false, sfxVolume),
    };
  }

  const state: AudioState = {
    ready: true,
    audioContext,
    music: initMusicState(true, musicEnabled, musicVolume),
    sfx: initSfxState(true, sfxEnabled, sfxVolume),
  };

  await loadSfxIndex(state.sfx, audioContext, assetsUrl);
  await loadMusicTracks(state.music, audioContext, assetsUrl);

  return state;
}

export function audioPlayMusic(state: AudioState, trackName: string): void {
  playMusic(state.music, state.audioContext, trackName);
}

export function audioStopMusic(state: AudioState | null): void {
  if (!state) return;
  stopMusic(state.music);
}

export function audioTriggerGameTune(state: AudioState, rng: CrandLike): string | null {
  return triggerGameTune(state.music, state.audioContext, rng);
}

export function audioPlaySfx(state: AudioState | null, sfxId: SfxId, reflexBoostTimer: number = 0.0): void {
  if (!state) return;
  playSfx(state.sfx, state.audioContext, sfxId, reflexBoostTimer);
}

export function audioSetSfxVolume(state: AudioState | null, volume: number): void {
  if (!state) return;
  setSfxVolume(state.sfx, volume);
}

export function audioSetMusicVolume(state: AudioState | null, volume: number): void {
  if (!state) return;
  setMusicVolume(state.music, volume);
}

export function audioUpdate(state: AudioState, dt: number): void {
  updateMusic(state.music, state.audioContext, dt);
}

// Unused in WebGL port: browser handles AudioContext cleanup on page unload
export function audioShutdown(state: AudioState): void {
  if (!state.ready) return;
  shutdownSfx(state.sfx);
  shutdownMusic(state.music);
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }
}
