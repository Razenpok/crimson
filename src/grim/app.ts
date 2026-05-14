// Port of grim/app.py

import * as wgl from '@wgl';
import { type View } from './view.ts';
import { InputState } from './input.ts';
import { RenderPipeline, WindowSink } from './render-pipeline.ts';

export const SCREENSHOT_DIR = 'screenshots';
export const SCREENSHOT_KEY = 'F12';

function _falseHook(): boolean {
  return false;
}

export class RunViewHooks {
  readonly shouldClose: () => boolean;
  readonly consumeScreenshotRequest: () => boolean;

  constructor(opts: { shouldClose?: () => boolean; consumeScreenshotRequest?: () => boolean } = {}) {
    this.shouldClose = opts.shouldClose ?? _falseHook;
    this.consumeScreenshotRequest = opts.consumeScreenshotRequest ?? _falseHook;
  }
}

export interface AppConfig {
  width?: number;
  height?: number;
  title?: string;
  targetFps?: number;
}

export class App {
  private _view: View | null = null;
  private _running = false;
  private _lastTime = 0;
  private _targetFps: number;
  private _frameId = 0;

  constructor(config?: AppConfig) {
    this._targetFps = config?.targetFps ?? 60;

    if (config?.title) {
      document.title = config.title;
    }

    const width = config?.width ?? 1280;
    const height = config?.height ?? 720;
    wgl.resize(width, height);
  }

  run(view: View): void {
    this._view = view;
    this._running = true;
    view.open();
    this._lastTime = performance.now();
    this._frameId = requestAnimationFrame(this._loop);
  }

  stop(): void {
    this._running = false;
    if (this._frameId) {
      cancelAnimationFrame(this._frameId);
      this._frameId = 0;
    }
    if (this._view) {
      this._view.close();
      this._view = null;
    }
  }

  private _loop = (now: number): void => {
    if (!this._running || !this._view) return;

    const dt = Math.min((now - this._lastTime) / 1000.0, 0.1);
    this._lastTime = now;
    wgl.updateFps(now);

    // Handle canvas resize
    const canvas = wgl.getCanvas();
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      wgl.resize(displayWidth, displayHeight);
    }

    try {
      this._view.update(dt);
      this._view.draw();
      wgl.flush();

      InputState.endFrame();

      this._frameId = requestAnimationFrame(this._loop);
    } catch (e) {
      this.stop();
      throw e;
    }
  };
}

export function runView(
  view: View,
  opts: {
    width?: number;
    height?: number;
    title?: string;
    fps?: number;
    configFlags?: number;
    exitKey?: number | null;
    hooks?: RunViewHooks | null;
  } = {},
): App {
  void opts.configFlags;
  void opts.exitKey;
  const app = new App({
    width: opts.width ?? 1280,
    height: opts.height ?? 720,
    title: opts.title ?? 'Crimsonland',
    targetFps: opts.fps ?? 60,
  });
  const runHooks = opts.hooks ?? new RunViewHooks();
  const renderPipeline = new RenderPipeline({
    sink: new WindowSink(),
    beginEndDrawing: false,
  });
  const wrappedView: View = {
    open(): void {
      view.open();
    },
    update(dt: number): void {
      view.update(dt);
      void runHooks.consumeScreenshotRequest();
      if (runHooks.shouldClose()) {
        app.stop();
      }
    },
    draw(): void {
      renderPipeline.draw({
        drawFrame: () => view.draw(),
        width: wgl.getScreenWidth(),
        height: wgl.getScreenHeight(),
      });
      renderPipeline.present();
    },
    close(): void {
      try {
        view.close();
      } finally {
        renderPipeline.close();
      }
    },
  };
  app.run(wrappedView);
  return app;
}

export function runWindow(width = 1280, height = 720, title = 'Crimsonland', fps = 60): App {
  const emptyView: View = {
    open(): void {},
    update(_dt: number): void {},
    draw(): void {
      wgl.clearBackground(wgl.makeColor(0.0, 0.0, 0.0, 1.0));
    },
    close(): void {},
  };
  return runView(emptyView, { width, height, title, fps });
}
