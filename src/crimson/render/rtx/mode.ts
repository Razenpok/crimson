// Port of crimson/render/rtx/mode.py

export enum RtxRenderMode {
  CLASSIC = 'classic',
  RTX = 'rtx',
}

export function parseRtxRenderMode(raw: string): RtxRenderMode {
  const value = raw.trim().toLowerCase();
  if (value === 'classic') return RtxRenderMode.CLASSIC;
  if (value === 'rtx') return RtxRenderMode.RTX;
  throw new Error(`unsupported render mode '${raw}'; expected classic|rtx`);
}

export function modeFromRtxFlag(enabled: boolean): RtxRenderMode {
  return enabled ? RtxRenderMode.RTX : RtxRenderMode.CLASSIC;
}

export function cycleRtxRenderMode(mode: RtxRenderMode): RtxRenderMode {
  return mode === RtxRenderMode.RTX ? RtxRenderMode.CLASSIC : RtxRenderMode.RTX;
}
