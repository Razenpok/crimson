// Port of crimson/paths.py

export const APP_NAME = 'banteg/crimsonland';

function _expandUser(path: string, env: Record<string, string | undefined> | undefined): string {
  const home = env?.HOME ?? env?.USERPROFILE;
  if (path === '~') {
    return home ?? path;
  }
  if (path.startsWith('~/')) {
    if (home !== undefined) {
      return `${home}${path.slice(1)}`;
    }
  }
  return path;
}

function _platformDirsUserDataPath(appname: string, env: Record<string, string | undefined> | undefined): string {
  const platform = globalThis.process?.platform ?? '';
  if (platform === 'win32') {
    const base = env?.LOCALAPPDATA ?? env?.APPDATA ?? env?.USERPROFILE;
    if (base !== undefined) {
      return `${base.replace(/[\\/]+$/g, '')}\\${appname.replace(/\//g, '\\')}`;
    }
  }
  if (platform === 'darwin') {
    const home = env?.HOME;
    if (home !== undefined) {
      return `${home.replace(/\/+$/g, '')}/Library/Application Support/${appname}`;
    }
  }
  const xdgDataHome = env?.XDG_DATA_HOME;
  if (xdgDataHome !== undefined) {
    return `${xdgDataHome.replace(/\/+$/g, '')}/${appname}`;
  }
  const home = env?.HOME;
  if (home !== undefined) {
    return `${home.replace(/\/+$/g, '')}/.local/share/${appname}`;
  }
  // PlatformDirs is not available in the WebGL runtime.
  return appname;
}

export function defaultRuntimeDir(): string {
  // Return the default per-user runtime directory.
  //
  // This is intended for saves/config/logs (e.g. `game.cfg`, `crimson.cfg`, highscores).
  // Override with `CRIMSON_RUNTIME_DIR` (or legacy `CRIMSON_BASE_DIR`).

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const override = env?.CRIMSON_RUNTIME_DIR || env?.CRIMSON_BASE_DIR;
  if (override) {
    return _expandUser(override, env);
  }

  return _platformDirsUserDataPath(APP_NAME, env);
}
