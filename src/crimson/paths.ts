// Port of crimson/paths.py

export const APP_NAME = 'banteg/crimsonland';

export function defaultRuntimeDir(): string {
  // Return the default per-user runtime directory.
  //
  // This is intended for saves/config/logs (e.g. `game.cfg`, `crimson.cfg`, highscores).
  // Override with `CRIMSON_RUNTIME_DIR` (or legacy `CRIMSON_BASE_DIR`).

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const override = env?.CRIMSON_RUNTIME_DIR || env?.CRIMSON_BASE_DIR;
  if (override) {
    return override;
  }

  // PlatformDirs is not available in the WebGL runtime.
  return APP_NAME;
}
