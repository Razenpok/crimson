// Port of crimson/debug.py

let debugOverride: boolean | null = null;

export function setDebugEnabled(enabled: boolean): void {
  debugOverride = enabled;
}

export function debugEnabled(): boolean {
  if (debugOverride !== null) {
    return debugOverride;
  }
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.CRIMSON_DEBUG === '1';
}
