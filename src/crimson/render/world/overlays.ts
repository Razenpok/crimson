// Port of crimson/render/world/overlays.py

import { TextureId, getTexture } from '../../../grim/assets.ts';
import { Vec2 } from '../../../grim/geom.ts';
import { clamp } from '../../../grim/math.ts';
import { BlendMode } from '../../../grim/webgl.ts';
import { RAD_TO_DEG } from './constants.ts';
import { WorldRenderCtx } from './context.ts';

function circleSegmentsFilled(radius: number): number {
  return Math.max(3, (radius * 0.125 + 12.0) | 0);
}

function circleSegmentsOutline(radius: number): number {
  return Math.max(3, (radius * 0.2 + 14.0) | 0);
}

export function drawAimCircle(
  renderCtx: WorldRenderCtx,
  center: Vec2,
  radius: number,
  alpha: number = 1.0,
): void {
  if (radius <= 1e-3) return;
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const fillA = clamp((77 / 255) * alpha, 0, 1);
  const outlineA = clamp((255 * 0.55 / 255) * alpha, 0, 1);

  const ctx = renderCtx.gl;
  ctx.setBlendMode(BlendMode.ALPHA);

  const white = ctx.whiteTexture;

  // Filled circle via degenerate quads (triangle fan)
  const fillSegs = Math.max(circleSegmentsFilled(radius), 64, radius | 0);
  const step = (Math.PI * 2) / fillSegs;

  ctx.beginQuads(white);
  ctx.texCoord2f(0.5, 0.5);
  ctx.color4f(0, 0, 26 / 255, fillA);

  for (let i = 0; i < fillSegs; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    // Degenerate quad: v0=center, v1=center, v2=circ[i], v3=circ[i+1]
    // Index pattern 0,1,2, 2,3,0 gives triangles:
    //   (center, center, circ[i]) = degenerate
    //   (circ[i], circ[i+1], center) = visible
    ctx.vertex2f(center.x, center.y);
    ctx.vertex2f(center.x, center.y);
    ctx.vertex2f(center.x + Math.cos(a0) * radius, center.y + Math.sin(a0) * radius);
    ctx.vertex2f(center.x + Math.cos(a1) * radius, center.y + Math.sin(a1) * radius);
  }
  ctx.endQuads();

  // Outline ring (2px thick) via quad strip
  const outlineSegs = Math.max(circleSegmentsOutline(radius), fillSegs);
  const outStep = (Math.PI * 2) / outlineSegs;
  const innerR = radius;
  const outerR = radius + 2.0;

  ctx.beginQuads(white);
  ctx.texCoord2f(0.5, 0.5);
  ctx.color4f(1, 1, 1, outlineA);

  for (let i = 0; i < outlineSegs; i++) {
    const a0 = i * outStep;
    const a1 = (i + 1) * outStep;
    const cos0 = Math.cos(a0);
    const sin0 = Math.sin(a0);
    const cos1 = Math.cos(a1);
    const sin1 = Math.sin(a1);
    // Quad: inner[i], outer[i], outer[i+1], inner[i+1]
    ctx.vertex2f(center.x + cos0 * innerR, center.y + sin0 * innerR);
    ctx.vertex2f(center.x + cos0 * outerR, center.y + sin0 * outerR);
    ctx.vertex2f(center.x + cos1 * outerR, center.y + sin1 * outerR);
    ctx.vertex2f(center.x + cos1 * innerR, center.y + sin1 * innerR);
  }
  ctx.endQuads();

  ctx.setBlendMode(BlendMode.ALPHA);
}

export function drawClockGauge(
  renderCtx: WorldRenderCtx,
  pos: Vec2,
  ms: number,
  scale: number,
  alpha: number = 1.0,
): void {
  const resources = renderCtx.frame.resources;
  const table = getTexture(resources, TextureId.UI_CLOCK_TABLE);
  const pointer = getTexture(resources, TextureId.UI_CLOCK_POINTER);
  const size = 32.0 * scale;
  if (size <= 1e-3) return;

  const tintA = clamp(alpha, 0.0, 1.0);
  const tint: [number, number, number, number] = [1, 1, 1, tintA];
  const half = size * 0.5;

  const tableSrc: [number, number, number, number] = [0, 0, table.width, table.height];
  const tableDst: [number, number, number, number] = [pos.x, pos.y, size, size];
  renderCtx.gl.drawTexturePro(table, tableSrc, tableDst, [0, 0], 0.0, tint);

  const seconds = (ms / 1000) | 0;
  const pointerSrc: [number, number, number, number] = [0, 0, pointer.width, pointer.height];
  const pointerDst: [number, number, number, number] = [pos.x + half, pos.y + half, size, size];
  const origin: [number, number] = [half, half];
  const rotationDeg = seconds * 6.0;
  renderCtx.gl.drawTexturePro(pointer, pointerSrc, pointerDst, origin, rotationDeg, tint);
}

export function directionArrowEnabled(renderCtx: WorldRenderCtx, playerIndex: number): boolean {
  const config = renderCtx.frame.config;
  if (config === null) return true;
  return config.controls.players[playerIndex]?.showDirectionArrow ?? true;
}

export function directionArrowTint(
  renderCtx: WorldRenderCtx,
  playerIndex: number,
  alpha: number,
): [number, number, number, number] {
  alpha = clamp(alpha, 0.0, 1.0);
  if (renderCtx.frame.players.length === 2) {
    if (playerIndex === 0) {
      return [204 / 255, 230 / 255, 255 / 255, (153 / 255) * alpha];
    }
    return [255 / 255, 230 / 255, 204 / 255, (153 / 255) * alpha];
  }
  return [1, 1, 1, (77 / 255) * alpha];
}

export function drawDirectionArrows(
  renderCtx: WorldRenderCtx,
  camera: Vec2,
  viewScale: Vec2,
  scale: number,
  alpha: number = 1.0,
): void {
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const arrow = getTexture(renderCtx.frame.resources, TextureId.ARROW);
  const src: [number, number, number, number] = [0, 0, arrow.width, arrow.height];
  const width = Math.max(1.0, arrow.width * scale);
  const height = Math.max(1.0, arrow.height * scale);
  const origin: [number, number] = [width * 0.5, height * 0.5];

  for (const player of renderCtx.frame.players) {
    if (player.health <= 0.0) continue;
    const index = player.index;
    if (!directionArrowEnabled(renderCtx, index)) continue;

    const heading = player.heading;
    const markerPos = player.pos.add(Vec2.fromHeading(heading).mul(60.0));
    const screen = WorldRenderCtx.worldToScreenWith(markerPos, camera, viewScale);
    const dst: [number, number, number, number] = [screen.x, screen.y, width, height];
    const tint = directionArrowTint(renderCtx, index, alpha);
    renderCtx.gl.drawTexturePro(arrow, src, dst, origin, heading * RAD_TO_DEG, tint);
  }
}
