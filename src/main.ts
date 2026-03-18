// Crimsonland WebGL — Entry Point

import { WebGLContext } from './grim/webgl.ts';
import { App } from './grim/app.ts';
import { InputState } from './grim/input.ts';
import { type View } from './grim/view.ts';
import { runGame } from './crimson/game/runtime.ts';
import { type GameConfig } from './crimson/game/types.ts';

/**
 * Minimal boot view that loads assets asynchronously, then switches to the
 * real game loop once resources are available.
 *
 * Since App doesn't have a setView method, we wrap the game loop view and
 * forward calls once it's ready.
 */
class BootStrapView implements View {
  private _ctx: WebGLContext;
  private _config: GameConfig;
  private _loading = false;
  private _gameView: View | null = null;

  constructor(ctx: WebGLContext, config: GameConfig) {
    this._ctx = ctx;
    this._config = config;
  }

  open(): void {
    console.log('Crimsonland WebGL — booting');
    this._startLoading();
  }

  private _startLoading(): void {
    if (this._loading) return;
    this._loading = true;

    // runGame creates the GameState + GameLoopView synchronously.
    // Asset loading happens inside the boot screen asynchronously.
    try {
      const result = runGame(this._ctx, this._config);
      this._gameView = result.view;
      this._gameView.open();
    } catch (err) {
      console.error('Failed to initialize game:', err);
    }
  }

  update(dt: number): void {
    if (this._gameView) {
      this._gameView.update(dt);
    }
  }

  draw(): void {
    if (this._gameView) {
      this._gameView.draw();
    } else {
      this._ctx.clearBackground(0.05, 0.02, 0.01, 1.0);
    }
  }

  close(): void {
    if (this._gameView) {
      this._gameView.close();
    }
  }
}

function main(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
  if (!canvas) {
    const c = document.createElement('canvas');
    c.id = 'game-canvas';
    c.style.width = '100%';
    c.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#000';
    document.body.appendChild(c);
    return main();
  }

  const TARGET_ASPECT = 1024 / 768; // 4:3
  const cvs = canvas; // non-null after guard above

  function fitCanvas(): void {
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const winAspect = winW / winH;
    let w: number, h: number;
    if (winAspect > TARGET_ASPECT) {
      // Window is wider — letterbox sides
      h = winH;
      w = Math.round(winH * TARGET_ASPECT);
    } else {
      // Window is taller — letterbox top/bottom
      w = winW;
      h = Math.round(winW / TARGET_ASPECT);
    }
    cvs.width = w;
    cvs.height = h;
    cvs.style.width = `${w}px`;
    cvs.style.height = `${h}px`;
    cvs.style.position = 'absolute';
    cvs.style.left = `${Math.round((winW - w) / 2)}px`;
    cvs.style.top = `${Math.round((winH - h) / 2)}px`;
  }

  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  const ctx = new WebGLContext(canvas);
  InputState.init(canvas);

  const config: GameConfig = {
    assetsUrl: './assets',
    width: canvas.width,
    height: canvas.height,
    fps: 60,
    seed: null,
    demoEnabled: false,
    noIntro: false,
    debug: false,
    rtx: false,
    preserveBugs: false,
  };

  const app = new App(ctx, {
    width: canvas.width,
    height: canvas.height,
    title: 'Crimsonland',
    targetFps: 60,
  });

  // Browser requires a user gesture before AudioContext can play.
  // Show a prompt overlay and wait for interaction before booting.
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,0.9);cursor:pointer;z-index:1000;';
  const label = document.createElement('div');
  label.textContent = 'Click to Start';
  label.style.cssText =
    'color:#95afc6;font-family:monospace;font-size:20px;' +
    'letter-spacing:2px;user-select:none;';
  overlay.appendChild(label);

  const start = () => {
    overlay.removeEventListener('click', start);
    document.removeEventListener('keydown', start);
    overlay.remove();
    app.run(new BootStrapView(ctx, config));
  };
  overlay.addEventListener('click', start);
  document.addEventListener('keydown', start);
  document.body.appendChild(overlay);
}

main();
