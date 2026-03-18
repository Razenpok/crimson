// Port of crimson/modes/components/perk_prompt_controller.py

import { type WebGLContext } from '../../engine/webgl.ts';
import { type RuntimeResources } from '../../engine/assets.ts';
import { type CrimsonConfig } from '../../engine/config.ts';
import { type Vec2 } from '../../engine/geom.ts';
import { clamp } from '../../engine/math.ts';
import { inputCodeIsDown, inputCodeIsPressed, inputPrimaryJustPressed } from '../../game/input-codes.ts';
import { PerkPromptUi, PERK_PROMPT_MAX_TIMER_MS, type UiTextWidthFn } from './perk-prompt-ui.ts';

export interface PerkMenuUiContext {
  resources: RuntimeResources;
  mouse: Vec2;
  screenW?: number;
}

export class PerkPromptState {
  timerMs = 0.0;
  hover = false;
  pulse = 0.0;

  reset(): void {
    this.timerMs = 0.0;
    this.hover = false;
    this.pulse = 0.0;
  }

  resetIfPending(pendingCount: number): void {
    if (Math.floor(pendingCount) > 0) {
      this.reset();
    }
  }

  beginFrame(): void {
    this.hover = false;
  }

  pollOpenRequest(opts: {
    ctx: PerkMenuUiContext;
    config: CrimsonConfig;
    pendingCount: number;
    playerCount: number;
    anyAlive: boolean;
    paused: boolean;
    menuActive: boolean;
    promptScale?: number;
  }): boolean {
    const {
      ctx,
      config,
      pendingCount,
      playerCount,
      anyAlive,
      paused,
      menuActive,
      promptScale = 1.0,
    } = opts;

    if (Math.floor(pendingCount) <= 0 || !anyAlive || paused || menuActive) {
      return false;
    }

    const label = PerkPromptUi.label(config, Math.floor(pendingCount));
    if (label) {
      const screenW = ctx.screenW ?? 1024;
      const rect = PerkPromptUi.rect(ctx.resources, screenW, promptScale);
      this.hover = rect.contains(ctx.mouse);
    }

    if (this._promptOpenRequested(config, Math.floor(playerCount))) {
      this.pulse = 1000.0;
      return true;
    }
    return false;
  }

  tickTimer(opts: {
    pendingCount: number;
    anyAlive: boolean;
    paused: boolean;
    menuActive: boolean;
    dtUiMs: number;
  }): void {
    const { pendingCount, anyAlive, paused, menuActive, dtUiMs } = opts;
    const promptVisible = Math.floor(pendingCount) > 0 && anyAlive && !paused && !menuActive;
    const timerDelta = promptVisible ? dtUiMs : -dtUiMs;
    this.timerMs = clamp(this.timerMs + timerDelta, 0.0, PERK_PROMPT_MAX_TIMER_MS);
  }

  tickPulse(dtUiMs: number): void {
    const pulseDelta = dtUiMs * (this.hover ? 6.0 : -2.0);
    this.pulse = clamp(this.pulse + pulseDelta, 0.0, 1000.0);
  }

  draw(
    ctx: WebGLContext,
    opts: {
      uiCtx: PerkMenuUiContext;
      pendingCount: number;
      anyAlive: boolean;
      menuActive: boolean;
      config: CrimsonConfig;
      uiTextWidth: UiTextWidthFn;
      textColor: [number, number, number, number];
      promptScale?: number;
    },
  ): void {
    const {
      uiCtx,
      pendingCount,
      anyAlive,
      menuActive,
      config,
      uiTextWidth,
      textColor,
      promptScale = 1.0,
    } = opts;

    if (menuActive || !anyAlive) {
      return;
    }
    if (Math.floor(pendingCount) <= 0) {
      return;
    }
    const label = PerkPromptUi.label(config, Math.floor(pendingCount));
    if (!label) {
      return;
    }
    PerkPromptUi.draw(ctx, {
      resources: uiCtx.resources,
      label,
      timerMs: this.timerMs,
      pulse: this.pulse,
      uiTextWidth,
      textColor,
      scale: promptScale,
    });
  }

  private _promptOpenRequested(config: CrimsonConfig, playerCount: number): boolean {
    const fireKey = config.controls.players[0].fireCode;
    const pickKey = config.controls.pickPerkCode;
    if (inputCodeIsPressed(pickKey, 0) && !inputCodeIsDown(fireKey, 0)) {
      return true;
    }
    const fireCodes = [
      config.controls.players[0].fireCode,
      config.controls.players[1].fireCode,
      config.controls.players[2].fireCode,
      config.controls.players[3].fireCode,
    ];
    return this.hover && inputPrimaryJustPressed(fireCodes, playerCount);
  }
}
