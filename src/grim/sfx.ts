// Port of grim/sfx.py

import { type ConsoleState } from './console.ts';
import { fetchPaq } from './paq.ts';
import { SFX_NATIVE_ORDER, SFX_SPECS, type SfxId } from './sfx-map.ts';

const SFX_PAK_NAME = 'sfx.paq';
const DEFAULT_VOICE_COUNT = 4;
const SFX_RATE_BASE_HZ = 44100;
const SFX_RATE_MIN_HZ = 22050;

const _f32buf = new Float32Array(1);

export class SfxVoice {
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null = null;
  gain: GainNode | null = null;
  playing = false;
  pitch = 1.0;
  volume = 1.0;

  constructor(opts: { buffer: AudioBuffer }) {
    this.buffer = opts.buffer;
  }
}

function stopSoundSafe(sound: SfxVoice): boolean {
  try {
    sound.source?.stop();
    sound.playing = false;
    return true;
  } catch {
    return false;
  }
}

function unloadSoundAliasSafe(sound: SfxVoice): boolean {
  try {
    stopSoundSafe(sound);
    sound.source = null;
    sound.gain = null;
    return true;
  } catch {
    return false;
  }
}

function unloadSoundSafe(sound: SfxVoice): boolean {
  try {
    stopSoundSafe(sound);
    sound.source = null;
    sound.gain = null;
    return true;
  } catch {
    return false;
  }
}

function setSoundPitchSafe(sound: SfxVoice, pitch: number): boolean {
  try {
    sound.pitch = pitch;
    if (sound.source !== null) {
      sound.source.playbackRate.value = pitch;
    }
    return true;
  } catch {
    return false;
  }
}

function f32(value: number): number {
  _f32buf[0] = value;
  return _f32buf[0];
}

function pyRound(value: number): number {
  const floorValue = Math.floor(value);
  const frac = value - floorValue;
  if (frac < 0.5) return floorValue;
  if (frac > 0.5) return floorValue + 1;
  return floorValue % 2 === 0 ? floorValue : floorValue + 1;
}

function nextRateScaleHz(opts: { currentRateScaleHz: number; reflexBoostTimer: number }): number {
  // Native `sfx_play` / `sfx_play_panned` update a global rate scalar from
  // `bonus_reflex_boost_timer` before each voice start.
  const reflexF32 = f32(opts.reflexBoostTimer);
  if (reflexF32 <= 0.0) {
    return int(SFX_RATE_BASE_HZ);
  }
  if (reflexF32 <= 1.0) {
    if (reflexF32 < 1.0) {
      const rateExpr = f32((f32(1.0) - reflexF32 + f32(1.0)) * f32(SFX_RATE_MIN_HZ));
      // `__ftol` follows host FP rounding mode (nearest on native defaults).
      return int(pyRound(rateExpr));
    }
    // Native keeps prior `sfx_rate_scale` when timer is exactly 1.0.
    return int(opts.currentRateScaleHz);
  }
  return int(SFX_RATE_MIN_HZ);
}

function pitchScaleFromRateHz(rateScaleHz: number): number {
  return f32(rateScaleHz / SFX_RATE_BASE_HZ);
}

export class SfxSample {
  entryName: string;
  source: SfxVoice;
  aliases: SfxVoice[];
  nextVoice: number;

  constructor(opts: { entryName: string; source: SfxVoice; aliases: SfxVoice[]; nextVoice?: number }) {
    this.entryName = opts.entryName;
    this.source = opts.source;
    this.aliases = opts.aliases;
    this.nextVoice = opts.nextVoice ?? 0;
  }

  *voices(): Generator<SfxVoice> {
    yield this.source;
    yield* this.aliases;
  }

  acquireVoice(): SfxVoice {
    for (const voice of this.voices()) {
      if (!voice.playing) {
        return voice;
      }
    }
    const voices = [this.source, ...this.aliases];
    const idx = this.nextVoice % voices.length;
    this.nextVoice += 1;
    return voices[idx];
  }
}

export class SfxState {
  ready: boolean;
  enabled: boolean;
  volume: number;
  voiceCount: number;
  samples: Map<SfxId, SfxSample>;
  rateScaleHz: number;

  constructor(opts: {
    ready: boolean;
    enabled: boolean;
    volume: number;
    voiceCount: number;
    samples: Map<SfxId, SfxSample>;
    rateScaleHz: number;
  }) {
    this.ready = opts.ready;
    this.enabled = opts.enabled;
    this.volume = opts.volume;
    this.voiceCount = opts.voiceCount;
    this.samples = opts.samples;
    this.rateScaleHz = opts.rateScaleHz;
  }

  sample(sfxId: SfxId): SfxSample {
    const sample = this.samples.get(sfxId);
    if (sample === undefined) {
      const entryName = SFX_SPECS.get(sfxId)!.entryName;
      throw new Error(`runtime sfx is not available: ${entryName}`);
    }
    return sample;
  }
}

export function initSfxState(opts: { ready: boolean; enabled: boolean; volume: number; voiceCount?: number }): SfxState {
  return new SfxState({
    ready: opts.ready,
    enabled: opts.enabled,
    volume: opts.volume,
    voiceCount: Math.max(1, int(opts.voiceCount ?? DEFAULT_VOICE_COUNT)),
    samples: new Map(),
    rateScaleHz: int(SFX_RATE_BASE_HZ),
  });
}

async function loadSampleFromData(
  state: SfxState,
  audioCtx: AudioContext,
  opts: { entryName: string; data: Uint8Array },
): Promise<SfxSample> {
  const audioData = new ArrayBuffer(opts.data.byteLength);
  new Uint8Array(audioData).set(opts.data);
  const buffer = await audioCtx.decodeAudioData(audioData);
  const source = new SfxVoice({ buffer });
  const aliases = Array.from({ length: Math.max(1, state.voiceCount) - 1 }, () => new SfxVoice({ buffer }));
  const sample = new SfxSample({ entryName: opts.entryName, source, aliases });
  for (const voice of sample.voices()) {
    voice.volume = state.volume;
  }
  return sample;
}

export async function loadSfxIndex(
  state: SfxState,
  audioCtx: AudioContext,
  assetsUrl: string,
  console: ConsoleState,
): Promise<void> {
  if (!state.ready || !state.enabled) {
    return;
  }

  const allEntries = await fetchPaq(`${assetsUrl}/${SFX_PAK_NAME}`);

  const paqEntries = new Map<string, Uint8Array>();
  for (const [name, data] of allEntries) {
    const normalized = name.replace(/\\/g, '/');
    const ext = normalized.slice(normalized.lastIndexOf('.')).toLowerCase();
    if (ext !== '.ogg' && ext !== '.wav') {
      continue;
    }
    paqEntries.set(normalized, data);
  }

  const missingEntries: string[] = [];
  for (const spec of SFX_SPECS.values()) {
    if (!paqEntries.has(spec.entryName)) {
      missingEntries.push(spec.entryName);
    }
  }
  if (missingEntries.length > 0) {
    const missing = missingEntries.sort().join(', ');
    throw new Error(`audio: missing declared sfx assets in ${SFX_PAK_NAME}: ${missing}`);
  }

  const loadedByEntryName = new Map<string, SfxSample>();
  state.samples.clear();
  for (const [sfxId, spec] of SFX_SPECS) {
    let sample = loadedByEntryName.get(spec.entryName);
    if (sample === undefined) {
      const data = paqEntries.get(spec.entryName);
      if (data === undefined) {
        throw new Error(`audio: missing declared sfx assets in ${SFX_PAK_NAME}: ${spec.entryName}`);
      }
      sample = await loadSampleFromData(state, audioCtx, { entryName: spec.entryName, data });
      loadedByEntryName.set(spec.entryName, sample);
    }
    state.samples.set(sfxId, sample);
  }

  console.log.log(`audio: sfx loaded ${loadedByEntryName.size} samples for ${state.samples.size} ids from ${SFX_PAK_NAME}`);
  console.log.flush();
}

function playSound(audioCtx: AudioContext, voice: SfxVoice): void {
  stopSoundSafe(voice);
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = voice.buffer;
  source.playbackRate.value = voice.pitch;
  gain.gain.value = voice.volume;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  voice.source = source;
  voice.gain = gain;
  voice.playing = true;
  source.onended = () => {
    voice.playing = false;
  };
  source.start();
}

export function playSfx(
  state: SfxState | null,
  audioCtx: AudioContext | null,
  sfx: SfxId,
  opts: { reflexBoostTimer?: number } = {},
): void {
  const reflexBoostTimer = opts.reflexBoostTimer ?? 0.0;
  if (state === null || audioCtx === null || !state.ready || !state.enabled) {
    return;
  }

  const sample = state.sample(sfx);
  state.rateScaleHz = nextRateScaleHz({
    currentRateScaleHz: int(state.rateScaleHz),
    reflexBoostTimer,
  });
  const voice = sample.acquireVoice();
  setSoundPitchSafe(voice, pitchScaleFromRateHz(int(state.rateScaleHz)));
  playSound(audioCtx, voice);
}

export function sfxIdForNativeId(sfxId: number): SfxId | null {
  if (sfxId < 0) {
    return null;
  }
  if (sfxId >= SFX_NATIVE_ORDER.length) {
    return null;
  }
  return SFX_NATIVE_ORDER[sfxId];
}

export function playSfxId(
  state: SfxState | null,
  audioCtx: AudioContext | null,
  sfxId: number,
): void {
  const resolved = sfxIdForNativeId(int(sfxId));
  if (resolved === null) {
    return;
  }
  playSfx(state, audioCtx, resolved);
}

export function setSfxVolume(state: SfxState | null, volume: number): void {
  if (state === null) {
    return;
  }
  let normalizedVolume = volume;
  if (normalizedVolume < 0.0) {
    normalizedVolume = 0.0;
  }
  if (normalizedVolume > 1.0) {
    normalizedVolume = 1.0;
  }
  state.volume = normalizedVolume;
  const seen = new Set<SfxSample>();
  for (const sample of state.samples.values()) {
    if (seen.has(sample)) {
      continue;
    }
    seen.add(sample);
    for (const voice of sample.voices()) {
      voice.volume = state.volume;
      if (voice.gain !== null) {
        voice.gain.gain.value = state.volume;
      }
    }
  }
}

export function shutdownSfx(state: SfxState): void {
  if (!state.ready) {
    return;
  }
  const seen = new Set<SfxSample>();
  for (const sample of state.samples.values()) {
    if (seen.has(sample)) {
      continue;
    }
    seen.add(sample);
    for (const alias of sample.aliases) {
      stopSoundSafe(alias);
      unloadSoundAliasSafe(alias);
    }
    stopSoundSafe(sample.source);
    unloadSoundSafe(sample.source);
  }
  state.samples.clear();
}
