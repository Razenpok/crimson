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
  if (names.length === 0) {
    return [];
  }
  console.log.log(`assets: missing ${names.join(', ')} (downloading)`);
  const results: DownloadResult[] = [];
  for (const name of names) {
    const url = `${baseUrl}/${name}`;
    const dest = `${assetsDir}/${name}`;
    try {
      _downloadFile(url, dest);
    } catch (exc) {
      const error = String(exc instanceof Error ? exc.message : exc);
      results.push(new DownloadResult({ name, ok: false, error }));
      console.log.log(`assets: failed to download ${name}: ${error}`);
      continue;
    }
    results.push(new DownloadResult({ name, ok: true }));
    console.log.log(`assets: downloaded ${name}`);
  }
  console.log.flush();
  return results;
}
