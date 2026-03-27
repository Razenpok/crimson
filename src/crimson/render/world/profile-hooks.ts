// Port of crimson/render/world/profile_hooks.py

export interface RenderProfileSink {
  onPassDuration(passName: string, durationMs: number): void;
}

let _activeSink: RenderProfileSink | null = null;
const _passStack: Array<[string, number]> = [];

// Unused in WebGL port: replay render telemetry excluded
export function setActiveSink(sink: RenderProfileSink | null): RenderProfileSink | null {
  const prev = _activeSink;
  _activeSink = sink;
  return prev;
}

// Unused in WebGL port: replay render telemetry excluded
export function clearPassStack(): void {
  _passStack.length = 0;
}

// Unused in WebGL port: replay render telemetry excluded
export function currentPassName(): string | null {
  if (_passStack.length === 0) return null;
  return _passStack[_passStack.length - 1][0];
}

export function beginPass(name: string): void {
  _passStack.push([name, performance.now()]);
}

export function endPass(_name: string): void {
  if (_passStack.length === 0) return;
  const [passName, startMs] = _passStack.pop()!;
  const durationMs = Math.max(0, performance.now() - startMs);
  if (_activeSink === null) return;
  _activeSink.onPassDuration(passName, durationMs);
}

export function profilePass(name: string): () => void {
  beginPass(name);
  return () => endPass(name);
}
