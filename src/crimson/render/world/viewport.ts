// Port of crimson/render/world/viewport.py

import { Vec2 } from '@grim/geom.ts';
import { CrimsonConfig } from '@grim/config.ts';

export interface WorldViewportState {
  readonly worldSize: number;
  readonly config: CrimsonConfig | null;
  readonly camera: Vec2;
}

export function cameraScreenSize(
  opts: { worldSize: number; config: CrimsonConfig | null; runtimeW: number; runtimeH: number },
): Vec2 {
  let screenW: number;
  let screenH: number;

  if (opts.runtimeW > 0.0 && opts.runtimeH > 0.0) {
    // Prefer live framebuffer dimensions. Config values can lag behind
    // the actual game window resolution during launcher/state handoff.
    screenW = opts.runtimeW;
    screenH = opts.runtimeH;
  } else if (opts.config !== null) {
    screenW = opts.config.display.width;
    screenH = opts.config.display.height;
  } else {
    screenW = Math.max(1.0, opts.runtimeW);
    screenH = Math.max(1.0, opts.runtimeH);
  }

  const world = opts.worldSize;
  if (world <= 0.0) {
    return new Vec2(Math.max(1.0, screenW), Math.max(1.0, screenH));
  }

  const outW = Math.max(1.0, screenW);
  const outH = Math.max(1.0, screenH);
  const scale = Math.max(outW / world, outH / world, 1.0);
  return new Vec2(Math.min(world, outW / scale), Math.min(world, outH / scale));
}

export function clampCamera(opts: { worldSize: number; camera: Vec2; screenSize: Vec2 }): Vec2 {
  let camX = opts.camera.x;
  let camY = opts.camera.y;

  if (camX > -1.0) camX = -1.0;
  if (camY > -1.0) camY = -1.0;

  const minX = opts.screenSize.x - opts.worldSize;
  const minY = opts.screenSize.y - opts.worldSize;

  if (camX < minX) camX = minX;
  if (camY < minY) camY = minY;

  return new Vec2(camX, camY);
}

export function viewTransform(
  opts: { worldSize: number; config: CrimsonConfig | null; camera: Vec2; outSize: Vec2 },
): [Vec2, Vec2, Vec2] {
  const screenSize = cameraScreenSize({ worldSize: opts.worldSize, config: opts.config, runtimeW: opts.outSize.x, runtimeH: opts.outSize.y });
  const clampedCamera = clampCamera({ worldSize: opts.worldSize, camera: opts.camera, screenSize });
  const scaleX = screenSize.x > 0.0 ? opts.outSize.x / screenSize.x : 1.0;
  const scaleY = screenSize.y > 0.0 ? opts.outSize.y / screenSize.y : 1.0;
  return [clampedCamera, new Vec2(scaleX, scaleY), screenSize];
}

export function worldToScreenWith(pos: Vec2, opts: { camera: Vec2; viewScale: Vec2 }): Vec2 {
  return pos.add(opts.camera).mulComponents(opts.viewScale);
}

export function screenToWorldWith(pos: Vec2, opts: { camera: Vec2; viewScale: Vec2 }): Vec2 {
  const safeScale = new Vec2(
    opts.viewScale.x > 0.0 ? opts.viewScale.x : 1.0,
    opts.viewScale.y > 0.0 ? opts.viewScale.y : 1.0,
  );
  return pos.divComponents(safeScale).sub(opts.camera);
}

export function viewScaleAvg(viewScale: Vec2): number {
  return viewScale.avgComponent();
}
