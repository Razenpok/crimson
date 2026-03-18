// Port of crimson/screens/boot.py — Boot/splash screen with company logos

import { type WebGLContext } from '../engine/webgl.ts';
import { type RuntimeResources, TextureId, getTexture, loadRuntimeResources } from '../engine/assets.ts';
import { audioPlayMusic, audioStopMusic, audioUpdate, initAudioState } from '../engine/audio.ts';
import { queueTrack } from '../engine/music.ts';
import { InputState } from '../engine/input.ts';
import { type GameState } from '../game/types.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SPLASH_ALPHA_SCALE = 2.0;
export const LOGO_TIME_SCALE = 1.1;
export const LOGO_TIME_OFFSET = 2.0;
export const LOGO_SKIP_ACCEL = 4.0;
export const LOGO_SKIP_JUMP = 16.0;
export const LOGO_THEME_TRIGGER = 14.0;
export const LOGO_10_IN_START = 1.0;
export const LOGO_10_IN_END = 2.0;
export const LOGO_10_HOLD_END = 4.0;
export const LOGO_10_OUT_END = 5.0;
export const LOGO_REF_IN_START = 7.0;
export const LOGO_REF_IN_END = 8.0;
export const LOGO_REF_HOLD_END = 10.0;
export const LOGO_REF_OUT_END = 11.0;
export const DEBUG_LOADING_HOLD_ENV = 'CRIMSON_DEBUG_LOADING_HOLD_SECONDS';

type Color = [number, number, number, number];

const MOUSE_BUTTON_LEFT = 0;
const MOUSE_BUTTON_RIGHT = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function debugLoadingHoldSeconds(): number {
  // In browser context, no env vars; always 0.
  return 0.0;
}

function clamp01(value: number): number {
  if (value < 0.0) return 0.0;
  if (value > 1.0) return 1.0;
  return value;
}

// ---------------------------------------------------------------------------
// BootView
// ---------------------------------------------------------------------------

export class BootView {
  state: GameState;
  private _ctx: WebGLContext;
  private _bootTime: number = 0.5;
  private _fadeOutReady: boolean = false;
  private _fadeOutDone: boolean = false;
  private _logoDelayTicks: number = 0;
  private _logoSkip: boolean = false;
  private _logoActive: boolean = false;
  private _introStarted: boolean = false;
  private _themeStarted: boolean = false;
  private _loadingHoldRemaining: number = 0.0;

  constructor(ctx: WebGLContext, state: GameState) {
    this._ctx = ctx;
    this.state = state;
    this._loadingHoldRemaining = debugLoadingHoldSeconds();
  }

  open(): void {
    this._bootTime = 0.5;
    this._fadeOutReady = false;
    this._fadeOutDone = false;
    this._logoDelayTicks = 0;
    this._logoSkip = false;
    this._logoActive = false;
    this._introStarted = false;
    this._themeStarted = false;
    this._loadingHoldRemaining = debugLoadingHoldSeconds();
    this._loadResources();
  }

  private _loadResources(): void {
    const state = this.state;
    const ctx = this._ctx;

    Promise.all([
      state.resources === null
        ? loadRuntimeResources(ctx, state.assetsUrl)
        : Promise.resolve(state.resources),
      state.audio === null
        ? initAudioState(state.config, state.assetsUrl)
        : Promise.resolve(state.audio),
    ]).then(([resources, audio]) => {
      state.resources = resources;
      state.audio = audio;
      // Queue game tunes (matches Python: exec music/game_tunes.txt)
      queueTrack(audio.music, 'gt1_ingame');
      queueTrack(audio.music, 'gt2_harppen');
      const loaded = resources.textures.size;
      state.console.log.log(`runtime resources loaded: ${loaded} textures`);
      this._fadeOutReady = true;
    }).catch((err) => {
      state.console.log.log(`boot: failed to load resources: ${err}`);
      console.error('boot: failed to load resources', err);
    });
  }

  update(dt: number): void {
    const frameDt = Math.min(dt, 0.1);
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, frameDt);
    }
    if (this._themeStarted) {
      return;
    }

    if (!this._fadeOutReady) {
      return;
    }

    if (this._fadeOutReady && !this._fadeOutDone) {
      if (this._loadingHoldRemaining > 0.0) {
        this._loadingHoldRemaining = Math.max(0.0, this._loadingHoldRemaining - frameDt);
        return;
      }
      this._bootTime -= frameDt;
      if (this._bootTime <= 0.0) {
        this._bootTime = 0.0;
        this._fadeOutDone = true;
      }
      return;
    }

    if (this.state.skipIntro) {
      this._startTheme();
      return;
    }

    if (this._logoDelayTicks < 5) {
      this._logoDelayTicks += 1;
      return;
    }

    this._logoActive = true;
    if (this._bootTime > LOGO_THEME_TRIGGER) {
      this._startTheme();
      return;
    }
    if (!this._introStarted && this.state.audio !== null) {
      this.state.audio.music.activeTrack = 'intro';
      audioPlayMusic(this.state.audio, 'intro');
      this._introStarted = true;
    }
    if (!this._logoSkip && this._skipTriggered()) {
      this._logoSkip = true;
    }
    this._bootTime += frameDt * LOGO_TIME_SCALE;
    let t = this._bootTime - LOGO_TIME_OFFSET;
    if (this._logoSkip) {
      if (t < LOGO_10_IN_START || (LOGO_10_OUT_END <= t && (t < LOGO_REF_IN_START || LOGO_REF_OUT_END <= t))) {
        t = LOGO_SKIP_JUMP;
      } else {
        t += frameDt * LOGO_SKIP_ACCEL;
      }
      this._bootTime = t + LOGO_TIME_OFFSET;
    }
  }

  draw(ctx: WebGLContext): void {
    ctx.clearBackground(0, 0, 0, 1);
    const resources = this.state.resources;
    if (resources === null) {
      return;
    }
    if (!this._fadeOutDone) {
      this._drawSplash(ctx, resources, this._splashAlpha());
      return;
    }
    if (this._logoActive && !this._themeStarted) {
      this._drawCompanyLogoSequence(ctx);
    }
  }

  close(): void {
    // In the Python port, this shuts down audio and unloads resources.
    // In the WebGL port, the app manages resource lifetimes separately.
  }

  takeAction(): string | null {
    return null;
  }

  isThemeStarted(): boolean {
    return this._themeStarted;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _startTheme(): void {
    if (this._themeStarted) return;
    if (this.state.audio !== null) {
      audioStopMusic(this.state.audio);
      const theme = this.state.demoEnabled ? 'crimsonquest' : 'crimson_theme';
      this.state.audio.music.activeTrack = theme;
      audioPlayMusic(this.state.audio, theme);
    }
    this._themeStarted = true;
  }

  private _skipTriggered(): boolean {
    if (InputState.firstKeyPressed() !== null) {
      return true;
    }
    if (InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      return true;
    }
    if (InputState.wasMouseButtonPressed(MOUSE_BUTTON_RIGHT)) {
      return true;
    }
    return false;
  }

  private _logoState(t: number): [TextureId, number] | null {
    if (LOGO_10_IN_START <= t && t < LOGO_10_OUT_END) {
      let alpha: number;
      if (t < LOGO_10_IN_END) {
        alpha = t - LOGO_10_IN_START;
      } else if (t < LOGO_10_HOLD_END) {
        alpha = 1.0;
      } else {
        alpha = 1.0 - (t - LOGO_10_HOLD_END);
      }
      return [TextureId.SPLASH_10TONS, clamp01(alpha)];
    }
    if (LOGO_REF_IN_START <= t && t < LOGO_REF_OUT_END) {
      let alpha: number;
      if (t < LOGO_REF_IN_END) {
        alpha = t - LOGO_REF_IN_START;
      } else if (t < LOGO_REF_HOLD_END) {
        alpha = 1.0;
      } else {
        alpha = 1.0 - (t - LOGO_REF_HOLD_END);
      }
      return [TextureId.SPLASH_REFLEXIVE, clamp01(alpha)];
    }
    return null;
  }

  private _drawCompanyLogoSequence(ctx: WebGLContext): void {
    const resources = this.state.resources;
    if (resources === null) return;
    const t = this._bootTime - LOGO_TIME_OFFSET;
    const logoState = this._logoState(t);
    if (logoState === null) return;
    const [textureId, alpha] = logoState;
    const tex = getTexture(resources, textureId);
    const texW = tex.width;
    const texH = tex.height;
    const x = (ctx.screenWidth - texW) * 0.5;
    const y = (ctx.screenHeight - texH) * 0.5;
    const tint: Color = [1, 1, 1, alpha];
    ctx.drawTexturePro(
      tex,
      [0, 0, texW, texH],
      [x, y, texW, texH],
      [0, 0],
      0.0,
      tint,
    );
  }

  private _splashAlpha(): number {
    return clamp01(this._bootTime * SPLASH_ALPHA_SCALE);
  }

  private _drawSplash(ctx: WebGLContext, resources: RuntimeResources, alpha: number): void {
    const screenW = ctx.screenWidth;
    const screenH = ctx.screenHeight;
    if (alpha <= 0.0) return;

    const logo = getTexture(resources, TextureId.CL_LOGO);
    const logoH = logo.height;
    const bandHeight = logoH * 2.0;
    const bandTop = (screenH - bandHeight) * 0.5 - 4.0;
    const bandBottom = bandTop + bandHeight;
    const bandLeft = -4.0;
    const bandRight = screenW + 4.0;

    const lineAlpha = clamp01(alpha * 0.7);
    const lr = 149 / 255;
    const lg = 175 / 255;
    const lb = 198 / 255;

    // Top border line
    ctx.drawRectangle(
      Math.round(bandLeft),
      Math.round(bandTop),
      Math.round(bandRight - bandLeft),
      1,
      lr, lg, lb, lineAlpha,
    );
    // Bottom border line
    ctx.drawRectangle(
      Math.round(bandLeft),
      Math.round(bandBottom),
      Math.round(bandRight - bandLeft),
      1,
      lr, lg, lb, lineAlpha,
    );
    // Left border line
    ctx.drawRectangle(
      Math.round(bandLeft),
      Math.round(bandTop),
      1,
      Math.round(bandHeight),
      lr, lg, lb, lineAlpha,
    );
    // Right border line
    ctx.drawRectangle(
      Math.round(bandRight),
      Math.round(bandTop),
      1,
      Math.round(bandHeight),
      lr, lg, lb, lineAlpha,
    );

    const tint: Color = [1, 1, 1, alpha];

    const logoW = logo.width;
    const logoHf = logo.height;
    const logoX = (screenW - logoW) * 0.5;
    const logoY = (screenH - logoHf) * 0.5;
    ctx.drawTexturePro(
      logo,
      [0, 0, logoW, logoHf],
      [logoX, logoY, logoW, logoHf],
      [0, 0],
      0.0,
      tint,
    );

    const loading = getTexture(resources, TextureId.LOADING);
    const loadingX = screenW * 0.5 + 128.0;
    const loadingY = screenH * 0.5 + 16.0;
    ctx.drawTexturePro(
      loading,
      [0, 0, loading.width, loading.height],
      [loadingX, loadingY, loading.width, loading.height],
      [0, 0],
      0.0,
      tint,
    );

    const esrb = getTexture(resources, TextureId.LOGO_ESRB);
    const esrbW = esrb.width;
    const esrbH = esrb.height;
    const esrbX = screenW - esrbW - 1.0;
    const esrbY = screenH - esrbH - 1.0;
    ctx.drawTexturePro(
      esrb,
      [0, 0, esrbW, esrbH],
      [esrbX, esrbY, esrbW, esrbH],
      [0, 0],
      0.0,
      tint,
    );
  }
}
