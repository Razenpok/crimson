// Port of grim/music.py — Web Audio API music playback

import { type CrandLike } from './rand.ts';
import { fetchPaq } from './paq.ts';

const MUSIC_PAQ_NAME = 'music.paq';

const MUSIC_TRACKS: Record<string, string[]> = {
  intro: ['music/intro.ogg', 'intro.ogg'],
  shortie_monk: ['music/shortie_monk.ogg', 'shortie_monk.ogg'],
  crimson_theme: ['music/crimson_theme.ogg', 'crimson_theme.ogg'],
  crimsonquest: ['music/crimsonquest.ogg', 'crimsonquest.ogg'],
  gt1_ingame: ['music/gt1_ingame.ogg', 'gt1_ingame.ogg'],
  gt2_harppen: ['music/gt2_harppen.ogg', 'gt2_harppen.ogg'],
};

const MUSIC_MAX_DT = 0.1;
const MUSIC_FADE_IN_PER_SEC = 1.0;
const MUSIC_FADE_OUT_PER_SEC = 0.5;

interface TrackPlayback {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  volume: number;
  muted: boolean;
  playing: boolean;
}

export interface MusicState {
  ready: boolean;
  enabled: boolean;
  volume: number;
  tracks: Map<string, AudioBuffer>;
  activeTrack: string | null;
  playbacks: Map<string, TrackPlayback>;
  queue: string[];
  gameTuneStarted: boolean;
  gameTuneTrack: string | null;
  trackIds: Map<string, number>;
  nextTrackId: number;
  paqEntries: Map<string, Uint8Array> | null;
}

export function initMusicState(ready: boolean, enabled: boolean, volume: number): MusicState {
  return {
    ready,
    enabled,
    volume,
    tracks: new Map(),
    activeTrack: null,
    playbacks: new Map(),
    queue: [],
    gameTuneStarted: false,
    gameTuneTrack: null,
    trackIds: new Map(),
    nextTrackId: 0,
    paqEntries: null,
  };
}

export async function loadMusicTracks(state: MusicState, audioCtx: AudioContext, assetsUrl: string): Promise<void> {
  if (!state.ready || !state.enabled) return;

  const entries = await fetchPaq(`${assetsUrl}/${MUSIC_PAQ_NAME}`);

  for (const [trackName, candidates] of Object.entries(MUSIC_TRACKS)) {
    let data: Uint8Array | undefined;
    for (const candidate of candidates) {
      data = entries.get(candidate);
      if (data) break;
    }
    if (!data) throw new Error(`Missing music entry for track '${trackName}'`);
    const buffer = await audioCtx.decodeAudioData(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    state.tracks.set(trackName, buffer);
  }

  // Build track ID map
  let idx = 0;
  for (const name of state.tracks.keys()) {
    state.trackIds.set(name, idx++);
  }
  state.nextTrackId = idx;
  state.paqEntries = entries;
}

export function playMusic(state: MusicState, audioCtx: AudioContext | null, trackName?: string): void {
  if (!state.ready || !state.enabled || !audioCtx) return;
  if (trackName === undefined) {
    trackName = state.activeTrack ?? undefined;
  }
  if (!trackName) return;

  const buffer = state.tracks.get(trackName);
  if (!buffer) return;

  // Mute all other tracks
  for (const [key, pb] of state.playbacks) {
    if (key !== trackName && !pb.muted) {
      pb.muted = true;
    }
  }

  let pb = state.playbacks.get(trackName);
  if (!pb) {
    pb = { buffer, source: null, gainNode: null, volume: 0.0, muted: true, playing: false };
    state.playbacks.set(trackName, pb);
  }

  if (pb.volume <= 0.0) {
    pb.muted = false;
    pb.volume = state.volume;
    _startPlayback(pb, audioCtx, state.volume);
  }

  state.activeTrack = trackName;
}

function _startPlayback(pb: TrackPlayback, audioCtx: AudioContext, volume: number): void {
  if (pb.source) {
    try { pb.source.stop(); } catch {}
  }
  const source = audioCtx.createBufferSource();
  source.buffer = pb.buffer;
  source.loop = true;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start();
  pb.source = source;
  pb.gainNode = gainNode;
  pb.playing = true;
}

export function queueTrack(state: MusicState, trackKey: string): void {
  if (!state.ready || !state.enabled) return;
  state.queue.push(trackKey);
}

function _normalizeTrackKey(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (name.toLowerCase().endsWith('.ogg')) return name.slice(0, -4);
  return name;
}

export async function loadMusicTrack(
  state: MusicState,
  audioCtx: AudioContext,
  assetsUrl: string,
  relPath: string,
): Promise<[string, number] | null> {
  const normalized = relPath.replace(/\\/g, '/');
  if (!state.ready || !state.enabled) return null;

  const key = _normalizeTrackKey(normalized);
  const existingId = state.trackIds.get(key);
  if (existingId !== undefined) return [key, existingId];

  if (state.tracks.has(key)) {
    const trackId = state.nextTrackId++;
    state.trackIds.set(key, trackId);
    return [key, trackId];
  }

  // Try loading from paq entries
  let data: Uint8Array | undefined;
  if (state.paqEntries) {
    data = state.paqEntries.get(normalized);
    if (!data) {
      const baseName = normalized.slice(normalized.lastIndexOf('/') + 1);
      data = state.paqEntries.get(baseName);
    }
  }

  if (!data) return null;

  const buffer = await audioCtx.decodeAudioData(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  );
  const trackId = state.nextTrackId++;
  state.tracks.set(key, buffer);
  state.trackIds.set(key, trackId);
  return [key, trackId];
}

export function stopMusic(state: MusicState): void {
  if (!state.ready || !state.enabled) return;
  for (const pb of state.playbacks.values()) {
    pb.muted = true;
  }
  state.activeTrack = null;
  state.gameTuneStarted = false;
  state.gameTuneTrack = null;
}

export function triggerGameTune(state: MusicState, audioCtx: AudioContext | null, rng: CrandLike): string | null {
  if (!state.ready || !state.enabled || !audioCtx) return null;
  if (state.gameTuneStarted) return null;
  if (state.queue.length === 0) return null;

  const idx = rng.rand() % state.queue.length;
  const trackKey = state.queue[idx];
  if (!state.tracks.has(trackKey)) return null;

  playMusic(state, audioCtx, trackKey);
  state.gameTuneStarted = true;
  state.gameTuneTrack = trackKey;
  return trackKey;
}

export function updateMusic(state: MusicState, audioCtx: AudioContext | null, dt: number): void {
  if (!state.ready || !state.enabled || !audioCtx) return;
  let frameDt = dt;
  if (frameDt <= 0.0) return;
  if (frameDt > MUSIC_MAX_DT) frameDt = MUSIC_MAX_DT;

  const targetVolume = state.volume;
  if (targetVolume <= 0.0) {
    for (const [key, pb] of state.playbacks) {
      if (pb.gainNode) pb.gainNode.gain.value = 0.0;
      if (pb.source) { try { pb.source.stop(); } catch {} }
      pb.playing = false;
    }
    state.playbacks.clear();
    return;
  }

  for (const [key, pb] of [...state.playbacks]) {
    const muted = pb.muted || targetVolume <= 0.0;
    if (muted) {
      pb.volume -= frameDt * MUSIC_FADE_OUT_PER_SEC;
      if (pb.volume <= 0.0) {
        pb.volume = 0.0;
        if (pb.gainNode) pb.gainNode.gain.value = 0.0;
        if (pb.source) { try { pb.source.stop(); } catch {} }
        pb.playing = false;
        state.playbacks.delete(key);
        continue;
      }
      if (pb.gainNode) pb.gainNode.gain.value = pb.volume;
      continue;
    }

    // Unmuted: ensure playing
    if (!pb.playing) {
      _startPlayback(pb, audioCtx, pb.volume);
    }

    if (pb.volume > targetVolume) {
      pb.volume = targetVolume;
    } else if (pb.volume < targetVolume) {
      pb.volume = Math.min(targetVolume, pb.volume + frameDt * MUSIC_FADE_IN_PER_SEC);
    }
    if (pb.gainNode) pb.gainNode.gain.value = pb.volume;
  }
}

export function setMusicVolume(state: MusicState, volume: number): void {
  volume = Math.max(0.0, Math.min(1.0, volume));
  state.volume = volume;
  if (!state.ready || !state.enabled) return;
  for (const pb of state.playbacks.values()) {
    if (pb.muted) continue;
    if (pb.volume > state.volume) pb.volume = state.volume;
    if (pb.gainNode) pb.gainNode.gain.value = pb.volume;
  }
}

export function shutdownMusic(state: MusicState): void {
  if (!state.ready) return;
  for (const pb of state.playbacks.values()) {
    if (pb.source) { try { pb.source.stop(); } catch {} }
  }
  state.playbacks.clear();
  state.tracks.clear();
  state.trackIds.clear();
  state.nextTrackId = 0;
  state.paqEntries = null;
  state.activeTrack = null;
  state.gameTuneStarted = false;
  state.gameTuneTrack = null;
}
