// Port of crimson/render/world/creatures.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';
import { type GlTexture } from '@grim/webgl.ts';
import { creatureAnimSelectFrame } from '@crimson/creatures/anim.ts';
import { CreatureFlags, CreatureTypeId } from '@crimson/creatures/spawn.ts';
import { CREATURE_ANIM } from '@crimson/sim/world-defs.ts';
import { RAD_TO_DEG } from './constants.ts';
import { WorldRenderCtx } from './context.ts';

export function drawCreatureSprite(
  renderCtx: WorldRenderCtx,
  texture: GlTexture,
  typeId: CreatureTypeId,
  flags: CreatureFlags,
  phase: number,
  mirrorLong: boolean | null = null,
  shadowAlpha: number | null = null,
  pos: Vec2,
  screenPos: Vec2 | null = null,
  rotationRad: number,
  scale: number,
  sizeScale: number,
  tint: wgl.Color,
  shadow: boolean = false,
): void {
  const info = CREATURE_ANIM.get(typeId);
  if (info === undefined) return;

  const mirrorFlag = mirrorLong === null ? info.mirror : mirrorLong;
  // Long-strip mirroring is handled by frame index selection, not texture flips.
  const [index] = creatureAnimSelectFrame(phase, {
    baseFrame: info.base,
    mirrorLong: mirrorFlag,
    flags,
  });
  if (index < 0) return;

  if (screenPos === null) {
    screenPos = renderCtx.worldToScreen(pos);
  }

  const cellWf = texture.width / 8.0;
  const cellHf = texture.height / 8.0;
  const width = cellWf * sizeScale * scale;
  const height = cellHf * sizeScale * scale;
  const cellW = (texture.width / 8) | 0;
  const cellH = (texture.height / 8) | 0;
  const srcX = (index % 8) * cellW;
  const srcY = ((index / 8) | 0) * cellH;
  const src = wgl.makeRectangle(srcX, srcY, cellWf, cellHf);

  const rotationDeg = rotationRad * RAD_TO_DEG;

  if (shadow) {
    // In the original exe this is a "darken" blend pass gated by fx_detail_0
    // (creature_render_type). We approximate it with a black silhouette draw.
    // The observed pass is slightly bigger than the main sprite and offset
    // down-right by ~1px at default sizes.
    const alpha = shadowAlpha !== null
      ? shadowAlpha / 255
      : clamp(tint[3] * 0.4, 0.0, 1.0);
    const shadowTint = wgl.makeColor(0, 0, 0, alpha);
    const shadowScale = 1.07;
    const shadowW = width * shadowScale;
    const shadowH = height * shadowScale;
    const offset = width * 0.035 - 0.7 * scale;
    const shadowDst = wgl.makeRectangle(
      screenPos.x + offset, screenPos.y + offset, shadowW, shadowH,
    );
    const shadowOrigin = wgl.makeVector2(shadowW * 0.5, shadowH * 0.5);
    renderCtx.gl.drawTexturePro(texture, src, shadowDst, shadowOrigin, rotationDeg, shadowTint);
  }

  const dst = wgl.makeRectangle(screenPos.x, screenPos.y, width, height);
  const origin = wgl.makeVector2(width * 0.5, height * 0.5);
  renderCtx.gl.drawTexturePro(texture, src, dst, origin, rotationDeg, tint);
}
