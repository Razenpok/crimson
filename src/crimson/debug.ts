// Port of crimson/debug.py

let debugOverride: boolean | null = null;

export function setDebugEnabled(enabled: boolean): void {
  debugOverride = enabled;
}

export function debugEnabled(): boolean {
  if (debugOverride !== null) {
    return debugOverride;
  }
  return false;
}
