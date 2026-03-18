// Port of crimson/screens/transitions.py

import type { WebGLContext } from '@grim/webgl.ts';
import type { GameState } from '@crimson/game/types.ts';

export const SCREEN_FADE_OUT_RATE = 2.0;
export const SCREEN_FADE_IN_RATE = 10.0;

export function updateScreenFade(state: GameState, dt: number): void {
  if (state.screenFadeRamp) {
    state.screenFadeAlpha += dt * SCREEN_FADE_IN_RATE;
  } else {
    state.screenFadeAlpha -= dt * SCREEN_FADE_OUT_RATE;
  }
  if (state.screenFadeAlpha < 0.0) state.screenFadeAlpha = 0.0;
  else if (state.screenFadeAlpha > 1.0) state.screenFadeAlpha = 1.0;
}

export function drawScreenFade(ctx: WebGLContext, state: Pick<GameState, 'screenFadeAlpha'>, screenW: number, screenH: number): void {
  const alpha = state.screenFadeAlpha;
  if (alpha <= 0.0) return;
  const shade = Math.max(0, Math.min(1, alpha));
  ctx.drawRectangle(0, 0, screenW, screenH, 0, 0, 0, shade);
}
