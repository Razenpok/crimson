// Port of crimson/assets_fetch.py

import type { ConsoleState } from '@grim/console.ts';

export const ASSET_BASE_URL = 'https://paq.crimson.banteg.xyz/v1.9.93';
export const DEFAULT_PAQ_FILES: readonly string[] = Object.freeze(['crimson.paq', 'music.paq', 'sfx.paq']);

export class DownloadResult {
  readonly name: string;
  readonly ok: boolean;
  readonly error: string | null;

  constructor(opts: { name: string; ok: boolean; error?: string | null }) {
    this.name = opts.name;
    this.ok = opts.ok;
    this.error = opts.error ?? null;
    Object.freeze(this);
  }
}

function _downloadFile(_url: string, _dest: string): void {
  // urllib/tempfile filesystem download is not available in the WebGL runtime.
  throw new Error('assets: filesystem download is not available in the WebGL runtime');
}

export function downloadMissingPaqs(
  assetsDir: string,
  console: ConsoleState,
  opts: {
    baseUrl?: string;
    names?: readonly string[];
  } = {},
): readonly DownloadResult[] {
  const baseUrl = opts.baseUrl ?? ASSET_BASE_URL;
  const names = opts.names ?? DEFAULT_PAQ_FILES;
  void assetsDir;
  void console;
  void baseUrl;
  void names;
  // Path.mkdir/is_file and tempfile replace are not available in the WebGL runtime.
  // Browser asset loading resolves PAQs by URL, so there are no local files to download.
  return [];
}
