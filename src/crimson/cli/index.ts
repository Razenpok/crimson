// Port of crimson/cli/__init__.py

import { app } from './root.ts';

export { app };
export * as root from './root.ts';

export const replayApp = null;
export const dbgApp = null;
export const netApp = null;
export const relayApp = null;

export function replayRenderProgressCallback(_opts: { totalTicks: number; renderAudio: boolean }): never {
  throw new Error('replay rendering CLI progress is unavailable in the browser WebGL build');
}

export function main(_argv: string[] | null = null): never {
  throw new Error('desktop CLI entrypoint is unavailable in the browser WebGL build');
}
