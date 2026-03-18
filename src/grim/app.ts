// Port of grim/app.py — main loop using requestAnimationFrame

import { type WebGLContext } from './webgl.ts';
import { type View } from './view.ts';
import { InputState } from './input.ts';

export interface AppConfig {
  width?: number;
  height?: number;
  title?: string;
  targetFps?: number;
}

export class App {
  private _ctx: WebGLContext;
  private _view: View | null = null;
  private _running = false;
  private _lastTime = 0;
  private _targetFps: number;
  private _frameId = 0;

  constructor(ctx: WebGLContext, config?: AppConfig) {
    this._ctx = ctx;
    this._targetFps = config?.targetFps ?? 60;

    if (config?.title) {
      document.title = config.title;
    }

    const width = config?.width ?? 1280;
    const height = config?.height ?? 720;
    ctx.resize(width, height);
  }

  get ctx(): WebGLContext { return this._ctx; }

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

    // Handle canvas resize
    const canvas = this._ctx.canvas;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      this._ctx.resize(displayWidth, displayHeight);
    }

    try {
      this._view.update(dt);
      this._view.draw();
      this._ctx.flush();

      InputState.endFrame();

      this._frameId = requestAnimationFrame(this._loop);
    } catch (e) {
      this.stop();
      throw e;
    }
  };
}
