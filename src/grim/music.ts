// Port of grim/music.py

import { fetchPaq } from './paq.ts';
import { type ConsoleState } from './console.ts';
import { type CrandLike } from './rand.ts';

export const MUSIC_PAK_NAME = 'music.paq';

export const MUSIC_TRACKS: Record<string, string[]> = {
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

export class TrackPlayback {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  volume: number;
  muted: boolean;
  playing: boolean;

  constructor(opts: {
    buffer: AudioBuffer;
    source?: AudioBufferSourceNode | null;
    gainNode?: GainNode | null;
    volume: number;
    muted: boolean;
    playing?: boolean;
  }) {
    this.buffer = opts.buffer;
    this.source = opts.source ?? null;
    this.gainNode = opts.gainNode ?? null;
    this.volume = opts.volume;
    this.muted = opts.muted;
    this.playing = opts.playing ?? false;
  }
}

export class MusicState {
  ready: boolean;
  enabled: boolean;
  volume: number;
  tracks: Map<string, AudioBuffer>;
  activeTrack: string | null;
  playbacks: Map<string, TrackPlayback>;
  queue: string[];
  // Mirrors the original game's "start a random game tune on first hit" gate.
  gameTuneStarted: boolean;
  gameTuneTrack: string | null;
  trackIds: Map<string, number>;
  nextTrackId: number;
  paqEntries: Map<string, Uint8Array> | null;

  constructor(opts: {
    ready: boolean;
    enabled: boolean;
    volume: number;
    tracks: Map<string, AudioBuffer>;
    activeTrack: string | null;
    playbacks?: Map<string, TrackPlayback>;
    queue?: string[];
    gameTuneStarted?: boolean;
    gameTuneTrack?: string | null;
    trackIds?: Map<string, number>;
    nextTrackId?: number;
    paqEntries?: Map<string, Uint8Array> | null;
  }) {
    this.ready = opts.ready;
    this.enabled = opts.enabled;
    this.volume = opts.volume;
    this.tracks = opts.tracks;
    this.activeTrack = opts.activeTrack;
    this.playbacks = opts.playbacks ?? new Map();
    this.queue = opts.queue ?? [];
    this.gameTuneStarted = opts.gameTuneStarted ?? false;
    this.gameTuneTrack = opts.gameTuneTrack ?? null;
    this.trackIds = opts.trackIds ?? new Map();
    this.nextTrackId = opts.nextTrackId ?? 0;
    this.paqEntries = opts.paqEntries ?? null;
  }
}

function arrayBufferFromBytes(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

export function initMusicState(opts: { ready: boolean; enabled: boolean; volume: number }): MusicState {
  const ready = opts.ready;
  const enabled = opts.enabled;
  const volume = opts.volume;
  return new MusicState({
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
  });
}

export async function loadMusicTracks(state: MusicState, audioCtx: AudioContext, assetsUrl: string, console: ConsoleState): Promise<void> {
  if (!state.ready || !state.enabled) return;

  const entries = await fetchPaq(`${assetsUrl}/${MUSIC_PAK_NAME}`);

  let loaded = 0;
  for (const [trackName, candidates] of Object.entries(MUSIC_TRACKS)) {
    let data: Uint8Array | undefined;
    for (const candidate of candidates) {
      data = entries.get(candidate);
      if (data) break;
    }
    if (!data) throw new Error(`Missing music entry for track '${trackName}'`);
    const buffer = await audioCtx.decodeAudioData(arrayBufferFromBytes(data));
    state.tracks.set(trackName, buffer);
    loaded += 1;
  }

  let idx = 0;
  for (const name of state.tracks.keys()) {
    state.trackIds.set(name, idx++);
  }
  state.nextTrackId = idx;
  state.paqEntries = entries;

  console.log.log(`audio: music tracks loaded ${loaded}/${Object.keys(MUSIC_TRACKS).length} from ${assetsUrl}/${MUSIC_PAK_NAME}`);
  console.log.flush();
}

export function playMusic(state: MusicState, audioCtx: AudioContext | null, trackName: string): void {
  if (!state.ready || !state.enabled || !audioCtx) return;
  if (!trackName) return;

  const buffer = state.tracks.get(trackName);
  if (!buffer) return;

  // Original behavior uses an "exclusive" music channel: requesting a track
  // mutes (fades out) any other currently-unmuted music ids.
  for (const [key, pb] of state.playbacks) {
    if (key !== trackName && !pb.muted) {
      pb.muted = true;
    }
  }

  let pb = state.playbacks.get(trackName);
  if (!pb) {
    pb = new TrackPlayback({ buffer, volume: 0.0, muted: true, playing: false });
    state.playbacks.set(trackName, pb);
  }

  // Mirror `sfx_play_exclusive`: only arm/unmute the requested track when its
  // tracked volume has already faded to silence.
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

async function _ensureMusicEntries(state: MusicState, assetsUrl: string): Promise<Map<string, Uint8Array> | null> {
  if (state.paqEntries !== null) return state.paqEntries;
  try {
    const entries = await fetchPaq(`${assetsUrl}/${MUSIC_PAK_NAME}`);
    state.paqEntries = entries;
    return entries;
  } catch {
    return null;
  }
}

export async function loadMusicTrack(
  state: MusicState,
  audioCtx: AudioContext,
  assetsUrl: string,
  relPath: string,
  opts?: { console?: ConsoleState | null },
): Promise<[string, number] | null> {
  const normalized = relPath.replace(/\\/g, '/');
  const console = opts?.console ?? null;
  if (!state.ready || !state.enabled) {
    if (console !== null) {
      console.log.log(`SFX Tune ${state.nextTrackId} <- '${normalized}' FAILED`);
    }
    return null;
  }

  const key = _normalizeTrackKey(normalized);
  const existingId = state.trackIds.get(key);
  if (existingId !== undefined) {
    if (console !== null) {
      console.log.log(`SFX Tune ${existingId} <- '${normalized}' ok`);
    }
    return [key, existingId];
  }

  if (state.tracks.has(key)) {
    const trackId = state.nextTrackId++;
    state.trackIds.set(key, trackId);
    if (console !== null) {
      console.log.log(`SFX Tune ${trackId} <- '${normalized}' ok`);
    }
    return [key, trackId];
  }

  let data: Uint8Array | undefined;
  try {
    const response = await fetch(`${assetsUrl}/${normalized}`);
    if (response.ok) {
      data = new Uint8Array(await response.arrayBuffer());
    }
  } catch {
  }
  if (!data) {
    const entries = await _ensureMusicEntries(state, assetsUrl);
    data = entries?.get(normalized);
    if (!data) {
      const baseName = normalized.slice(normalized.lastIndexOf('/') + 1);
      data = entries?.get(baseName);
    }
  }

  if (!data) {
    if (console !== null) {
      console.log.log(`SFX Tune ${state.nextTrackId} <- '${normalized}' FAILED`);
    }
    return null;
  }

  let buffer: AudioBuffer;
  try {
    buffer = await audioCtx.decodeAudioData(
      arrayBufferFromBytes(data),
    );
  } catch {
    if (console !== null) {
      console.log.log(`SFX Tune ${state.nextTrackId} <- '${normalized}' FAILED`);
    }
    return null;
  }
  const trackId = state.nextTrackId++;
  state.tracks.set(key, buffer);
  state.trackIds.set(key, trackId);
  if (console !== null) {
    console.log.log(`SFX Tune ${trackId} <- '${normalized}' ok`);
  }
  return [key, trackId];
}

export function stopMusic(state: MusicState): void {
  if (!state.ready || !state.enabled) return;
  // Mirror `sfx_mute_all`: mark everything muted and let `updateMusic` ramp it down.
  for (const pb of state.playbacks.values()) {
    pb.muted = true;
  }
  state.activeTrack = null;
  state.gameTuneStarted = false;
  state.gameTuneTrack = null;
}

export function triggerGameTune(state: MusicState, audioCtx: AudioContext | null, opts: { rng: CrandLike }): string | null {
  // Start a random queued game tune, if it hasn't been triggered yet.
  //
  // Returns the track key if playback started, otherwise null.
  const rng = opts.rng;
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
    // Original behavior: global music volume at 0 stops playback immediately.
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

    // Unmuted track: ensure it stays playing and ramp toward target volume.
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
  // Mirror original: volume decreases take effect immediately; increases are ramped
  // by `updateMusic`.
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
