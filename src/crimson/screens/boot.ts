// Port of crimson/screens/boot.py

import * as wgl from '@wgl';
import { type RuntimeResources, TextureId, getTexture, loadRuntimeResources } from '@grim/assets.ts';
import { audioPlayMusic, audioShutdown, audioStopMusic, audioUpdate, initAudioState } from '@grim/audio.ts';
import { queueTrack } from '@grim/music.ts';
import { InputState } from '@grim/input.ts';
import { type GameState } from '@crimson/game/types.ts';

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
const MOUSE_BUTTON_LEFT = 0;
const MOUSE_BUTTON_RIGHT = 2;

function clamp01(value: number): number {
  if (value < 0.0) return 0.0;
  if (value > 1.0) return 1.0;
  return value;
}

export class BootView {
  state: GameState;
  private _bootTime: number = 0.5;
  private _fadeOutReady: boolean = false;
  private _fadeOutDone: boolean = false;
  private _logoDelayTicks: number = 0;
  private _logoSkip: boolean = false;
  private _logoActive: boolean = false;
  private _introStarted: boolean = false;
  private _themeStarted: boolean = false;
  private _loadingHoldRemaining: number = 0.0;

  constructor(state: GameState) {
    this.state = state;
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
    this._loadingHoldRemaining = 0.0;
    this._loadResources();
  }

  private _loadResources(): void {
    const state = this.state;

    Promise.all([
      state.resources === null
        ? loadRuntimeResources(state.assetsUrl)
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

  draw(): void {
    wgl.clearBackground(wgl.makeColor(0, 0, 0, 1));
    const resources = this.state.resources;
    if (resources === null) {
      return;
    }
    if (!this._fadeOutDone) {
      this._drawSplash(resources, this._splashAlpha());
      return;
    }
    if (this._logoActive && !this._themeStarted) {
      this._drawCompanyLogoSequence();
    }
  }

  close(): void {
    // Shut down audio and unload resources (matching Python close())
    if (this.state.audio !== null) {
      audioShutdown(this.state.audio);
      this.state.audio = null;
    }
    this.state.resources = null;
  }

  isThemeStarted(): boolean {
    return this._themeStarted;
  }

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

  private _drawCompanyLogoSequence(): void {
    const resources = this.state.resources;
    if (resources === null) return;
    const t = this._bootTime - LOGO_TIME_OFFSET;
    const logoState = this._logoState(t);
    if (logoState === null) return;
    const [textureId, alpha] = logoState;
    const tex = getTexture(resources, textureId);
    const texW = tex.width;
    const texH = tex.height;
    const x = (wgl.getScreenWidth() - texW) * 0.5;
    const y = (wgl.getScreenHeight() - texH) * 0.5;
    const tint = wgl.makeColor(1, 1, 1, alpha);
    wgl.drawTexturePro(
      tex,
      wgl.makeRectangle(0, 0, texW, texH),
      wgl.makeRectangle(x, y, texW, texH),
      wgl.makeVector2(0, 0),
      0.0,
      tint,
    );
  }

  private _splashAlpha(): number {
    return clamp01(this._bootTime * SPLASH_ALPHA_SCALE);
  }

  private _drawSplash(resources: RuntimeResources, alpha: number): void {
    const screenW = wgl.getScreenWidth();
    const screenH = wgl.getScreenHeight();
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
    wgl.drawRectangle(
      int(Math.round(bandLeft)),
      int(Math.round(bandTop)),
      int(Math.round(bandRight - bandLeft)),
      1,
      wgl.makeColor(lr, lg, lb, lineAlpha),
    );
    // Bottom border line
    wgl.drawRectangle(
      int(Math.round(bandLeft)),
      int(Math.round(bandBottom)),
      int(Math.round(bandRight - bandLeft)),
      1,
      wgl.makeColor(lr, lg, lb, lineAlpha),
    );
    // Left border line
    wgl.drawRectangle(
      int(Math.round(bandLeft)),
      int(Math.round(bandTop)),
      1,
      int(Math.round(bandHeight)),
      wgl.makeColor(lr, lg, lb, lineAlpha),
    );
    // Right border line
    wgl.drawRectangle(
      int(Math.round(bandRight)),
      int(Math.round(bandTop)),
      1,
      int(Math.round(bandHeight)),
      wgl.makeColor(lr, lg, lb, lineAlpha),
    );

    const tint = wgl.makeColor(1, 1, 1, alpha);

    const logoW = logo.width;
    const logoHf = logo.height;
    const logoX = (screenW - logoW) * 0.5;
    const logoY = (screenH - logoHf) * 0.5;
    wgl.drawTexturePro(
      logo,
      wgl.makeRectangle(0, 0, logoW, logoHf),
      wgl.makeRectangle(logoX, logoY, logoW, logoHf),
      wgl.makeVector2(0, 0),
      0.0,
      tint,
    );

    const loading = getTexture(resources, TextureId.LOADING);
    const loadingX = screenW * 0.5 + 128.0;
    const loadingY = screenH * 0.5 + 16.0;
    wgl.drawTexturePro(
      loading,
      wgl.makeRectangle(0, 0, loading.width, loading.height),
      wgl.makeRectangle(loadingX, loadingY, loading.width, loading.height),
      wgl.makeVector2(0, 0),
      0.0,
      tint,
    );

    const esrb = getTexture(resources, TextureId.LOGO_ESRB);
    const esrbW = esrb.width;
    const esrbH = esrb.height;
    const esrbX = screenW - esrbW - 1.0;
    const esrbY = screenH - esrbH - 1.0;
    wgl.drawTexturePro(
      esrb,
      wgl.makeRectangle(0, 0, esrbW, esrbH),
      wgl.makeRectangle(esrbX, esrbY, esrbW, esrbH),
      wgl.makeVector2(0, 0),
      0.0,
      tint,
    );
  }
}
