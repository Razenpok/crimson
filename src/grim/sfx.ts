// Port of grim/sfx.py

import { SFX_SPECS, SFX_NATIVE_ORDER, type SfxId } from './sfx-map.ts';
import { fetchPaq } from './paq.ts';

const SFX_PAQ_NAME = 'sfx.paq';
const DEFAULT_VOICE_COUNT = 4;
const SFX_RATE_BASE_HZ = 44100;
const SFX_RATE_MIN_HZ = 22050;

/** Minimum seconds between triggers of the same sample; retriggers within this window are skipped. */
const SFX_DEDUP_WINDOW = 0.02;
/** Seconds over which stacked sounds ramp back to full volume. */
const SFX_STACK_RAMP = 0.08;
/** Minimum gain multiplier for a stacked sound. */
const SFX_STACK_MIN_GAIN = 0.45;

const _f32buf = new Float32Array(1);

function f32(v: number): number {
  _f32buf[0] = v;
  return _f32buf[0];
}

function nextRateScaleHz(currentRateScaleHz: number, reflexBoostTimer: number): number {
  const reflexF32 = f32(reflexBoostTimer);
  if (reflexF32 <= 0.0) return SFX_RATE_BASE_HZ;
  if (reflexF32 <= 1.0) {
    if (reflexF32 < 1.0) {
      const rateExpr = f32((f32(1.0) - reflexF32 + f32(1.0)) * f32(SFX_RATE_MIN_HZ));
      return Math.round(rateExpr);
    }
    return currentRateScaleHz;
  }
  return SFX_RATE_MIN_HZ;
}

function pitchScaleFromRateHz(rateScaleHz: number): number {
  return f32(rateScaleHz / SFX_RATE_BASE_HZ);
}

interface SfxVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  playing: boolean;
}

interface SfxSample {
  entryName: string;
  buffer: AudioBuffer;
  voices: SfxVoice[];
  nextVoice: number;
  lastPlayTime: number;
}

export interface SfxState {
  ready: boolean;
  enabled: boolean;
  volume: number;
  voiceCount: number;
  samples: Map<SfxId, SfxSample>;
  rateScaleHz: number;
}

export function initSfxState(ready: boolean, enabled: boolean, volume: number, voiceCount: number = DEFAULT_VOICE_COUNT): SfxState {
  return {
    ready,
    enabled,
    volume,
    voiceCount: Math.max(1, voiceCount),
    samples: new Map(),
    rateScaleHz: SFX_RATE_BASE_HZ,
  };
}

export async function loadSfxIndex(state: SfxState, audioCtx: AudioContext, assetsUrl: string): Promise<void> {
  if (!state.ready || !state.enabled) return;

  const allEntries = await fetchPaq(`${assetsUrl}/${SFX_PAQ_NAME}`);

  // Filter to audio entries only (.ogg, .wav)
  const entries = new Map<string, Uint8Array>();
  for (const [name, data] of allEntries) {
    const normalized = name.replace(/\\/g, '/');
    const ext = normalized.slice(normalized.lastIndexOf('.')).toLowerCase();
    if (ext === '.ogg' || ext === '.wav') {
      entries.set(normalized, data);
    }
  }

  // Validate all declared entries exist before loading
  const missingEntries: string[] = [];
  for (const spec of SFX_SPECS.values()) {
    if (!entries.has(spec.entryName)) {
      missingEntries.push(spec.entryName);
    }
  }
  if (missingEntries.length > 0) {
    throw new Error(`audio: missing declared sfx assets in ${SFX_PAQ_NAME}: ${missingEntries.sort().join(', ')}`);
  }

  const loadedByEntryName = new Map<string, SfxSample>();
  state.samples.clear();

  for (const [sfxId, spec] of SFX_SPECS) {
    let sample = loadedByEntryName.get(spec.entryName);
    if (!sample) {
      const data = entries.get(spec.entryName)!;
      const buffer = await audioCtx.decodeAudioData(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
      );
      sample = { entryName: spec.entryName, buffer, voices: [], nextVoice: 0, lastPlayTime: 0 };
      loadedByEntryName.set(spec.entryName, sample);
    }
    state.samples.set(sfxId, sample);
  }
}

export function playSfx(
  state: SfxState | null,
  audioCtx: AudioContext | null,
  sfxId: SfxId,
  reflexBoostTimer: number = 0.0,
): void {
  if (!state || !audioCtx || !state.ready || !state.enabled) return;

  const sample = state.samples.get(sfxId);
  if (!sample) return;

  state.rateScaleHz = nextRateScaleHz(state.rateScaleHz, reflexBoostTimer);
  const pitch = pitchScaleFromRateHz(state.rateScaleHz);

  const now = audioCtx.currentTime;
  const elapsed = now - sample.lastPlayTime;

  // Hard dedup: skip if the exact same sample just played
  if (elapsed < SFX_DEDUP_WINDOW) return;

  // Polyphony limiting: find a non-playing voice slot, or round-robin
  const voiceCount = state.voiceCount;
  sample.voices = sample.voices.filter(v => v.playing);
  if (sample.voices.length >= voiceCount) {
    const idx = sample.nextVoice % sample.voices.length;
    sample.nextVoice++;
    const old = sample.voices[idx];
    old.source.stop();
    old.playing = false;
    sample.voices.splice(idx, 1);
  }

  // Attenuate stacked sounds: ramp from SFX_STACK_MIN_GAIN back to 1.0
  let stackGain = 1.0;
  if (elapsed < SFX_STACK_RAMP) {
    stackGain = SFX_STACK_MIN_GAIN + (1.0 - SFX_STACK_MIN_GAIN) * (elapsed / SFX_STACK_RAMP);
  }

  sample.lastPlayTime = now;

  const source = audioCtx.createBufferSource();
  source.buffer = sample.buffer;
  source.playbackRate.value = pitch;

  const gain = audioCtx.createGain();
  gain.gain.value = state.volume * stackGain;
  source.connect(gain);
  gain.connect(audioCtx.destination);

  const voice: SfxVoice = { source, gain, playing: true };
  source.onended = () => { voice.playing = false; };
  sample.voices.push(voice);
  source.start();
}

export function sfxIdForNativeId(sfxId: number): SfxId | null {
  if (sfxId < 0 || sfxId >= SFX_NATIVE_ORDER.length) return null;
  return SFX_NATIVE_ORDER[sfxId];
}

export function playSfxId(
  state: SfxState | null,
  audioCtx: AudioContext | null,
  sfxId: number,
): void {
  const resolved = sfxIdForNativeId(sfxId);
  if (resolved === null) return;
  playSfx(state, audioCtx, resolved);
}

export function setSfxVolume(state: SfxState | null, volume: number): void {
  if (!state) return;
  state.volume = Math.max(0.0, Math.min(1.0, volume));
  // Update volume on all currently playing voices
  const seen = new Set<SfxSample>();
  for (const sample of state.samples.values()) {
    if (seen.has(sample)) continue;
    seen.add(sample);
    for (const voice of sample.voices) {
      if (voice.playing) {
        voice.gain.gain.value = state.volume;
      }
    }
  }
}

export function shutdownSfx(state: SfxState): void {
  if (!state.ready) return;
  state.samples.clear();
}
