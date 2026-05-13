// Port of crimson/render/sink.py

import { type RenderPresent, type RenderSink, WindowSink } from '@grim/render-pipeline.ts';

export { type RenderPresent, type RenderSink, WindowSink };

/** Headless sink used for determinism-only verification paths. */
export class NullSink implements RenderSink {
  open(): void {}
  present(): void {}
  flush(): void {}
  close(): void {}
}

/** Video-export sink. Fail-fast by policy: presentation errors abort rendering. */
export class VideoSink implements RenderSink {
  outputPath: string;
  private _openTransport: (() => void) | null;
  private _presentFrame: RenderPresent | null;
  private _flushTransport: (() => void) | null;
  private _closeTransport: (() => void) | null;
  private _opened = false;
  private _flushed = false;

  constructor(opts: {
    outputPath: string;
    openTransport?: (() => void) | null;
    presentFrame?: RenderPresent | null;
    flushTransport?: (() => void) | null;
    closeTransport?: (() => void) | null;
  }) {
    this.outputPath = String(opts.outputPath);
    this._openTransport = opts.openTransport ?? null;
    this._presentFrame = opts.presentFrame ?? null;
    this._flushTransport = opts.flushTransport ?? null;
    this._closeTransport = opts.closeTransport ?? null;
  }

  open(): void {
    // Browser WebGL has no filesystem mkdir; callers provide transport setup.
    if (this._openTransport !== null) {
      this._openTransport();
    }
    this._opened = true;
    this._flushed = false;
  }

  present(): void {
    if (this._presentFrame !== null) {
      this._presentFrame();
    }
  }

  flush(): void {
    if (!this._opened || this._flushed) {
      return;
    }
    if (this._flushTransport !== null) {
      this._flushTransport();
    }
    this._flushed = true;
  }

  close(): void {
    if (!this._opened) {
      return;
    }
    if (this._closeTransport !== null) {
      this._closeTransport();
    }
    this._opened = false;
  }
}
