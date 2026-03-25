// Port of grim/render_pipeline.py

export type RenderDraw = () => void;
export type RenderPresent = () => void;

export interface RenderSink {
  open(): void;
  present(): void;
  flush(): void;
  close(): void;
}

export class WindowSink implements RenderSink {
  private _presentFrame: RenderPresent | null;
  private _opened = false;

  constructor(presentFrame?: RenderPresent) {
    this._presentFrame = presentFrame ?? null;
  }

  open(): void { this._opened = true; }

  present(): void {
    if (this._presentFrame) this._presentFrame();
  }

  flush(): void {}
  close(): void { this._opened = false; }
}

export class RenderPipeline {
  private _sink: RenderSink;
  private _onResize: ((w: number, h: number) => void) | null;
  private _beginEndDrawing: boolean;
  private _beginDraw: (() => void) | null;
  private _endDraw: (() => void) | null;
  private _opened = false;
  private _width = -1;
  private _height = -1;

  constructor(opts: {
    sink: RenderSink;
    onResize?: (w: number, h: number) => void;
    beginEndDrawing?: boolean;
    beginDraw?: () => void;
    endDraw?: () => void;
  }) {
    this._sink = opts.sink;
    this._onResize = opts.onResize ?? null;
    this._beginEndDrawing = opts.beginEndDrawing ?? false;
    this._beginDraw = opts.beginDraw ?? null;
    this._endDraw = opts.endDraw ?? null;
    if (this._beginEndDrawing && (!this._beginDraw || !this._endDraw)) {
      throw new Error('beginDraw and endDraw are required when beginEndDrawing=true');
    }
  }

  open(opts: { width: number; height: number }): void {
    if (this._opened) return;
    const w = Math.max(0, opts.width | 0);
    const h = Math.max(0, opts.height | 0);
    try {
      if (this._onResize) this._onResize(w, h);
      this._sink.open();
    } catch (e) {
      try { this._sink.close(); } catch {}
      this._opened = false;
      this._width = -1;
      this._height = -1;
      throw e;
    }
    this._opened = true;
    this._width = w;
    this._height = h;
  }

  private _ensureOpen(width: number, height: number): void {
    if (!this._opened) this.open({ width, height });
  }

  private _resizeIfNeeded(width: number, height: number): void {
    const w = Math.max(0, width | 0);
    const h = Math.max(0, height | 0);
    if (w === this._width && h === this._height) return;
    if (this._onResize) this._onResize(w, h);
    this._width = w;
    this._height = h;
  }

  draw(opts: { drawFrame: RenderDraw; width: number; height: number }): void {
    this._ensureOpen(opts.width, opts.height);
    this._resizeIfNeeded(opts.width, opts.height);
    if (this._beginEndDrawing) {
      this._beginDraw!();
      try {
        opts.drawFrame();
      } finally {
        this._endDraw!();
      }
      return;
    }
    opts.drawFrame();
  }

  present(): void {
    if (!this._opened) return;
    this._sink.present();
  }

  render(opts: { drawFrame: RenderDraw; width: number; height: number }): void {
    this.draw({ drawFrame: opts.drawFrame, width: opts.width, height: opts.height });
    this.present();
  }

  flush(): void {
    if (!this._opened) return;
    this._sink.flush();
  }

  close(): void {
    if (!this._opened) return;
    try {
      this._sink.close();
    } finally {
      this._opened = false;
      this._width = -1;
      this._height = -1;
    }
  }
}
