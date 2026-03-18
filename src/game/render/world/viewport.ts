// Port of crimson/render/world/viewport.py

import { Vec2 } from '../../../engine/geom.ts';
import { CrimsonConfig } from '../../../engine/config.ts';

export interface WorldViewportState {
  readonly worldSize: number;
  readonly config: CrimsonConfig | null;
  readonly camera: Vec2;
}

export function cameraScreenSize(
  worldSize: number,
  config: CrimsonConfig | null,
  runtimeW: number,
  runtimeH: number,
): Vec2 {
  let screenW: number;
  let screenH: number;

  if (runtimeW > 0.0 && runtimeH > 0.0) {
    screenW = runtimeW;
    screenH = runtimeH;
  } else if (config !== null) {
    screenW = config.display.width;
    screenH = config.display.height;
  } else {
    screenW = Math.max(1.0, runtimeW);
    screenH = Math.max(1.0, runtimeH);
  }

  const world = worldSize;
  if (world <= 0.0) {
    return new Vec2(Math.max(1.0, screenW), Math.max(1.0, screenH));
  }

  const outW = Math.max(1.0, screenW);
  const outH = Math.max(1.0, screenH);
  const scale = Math.max(outW / world, outH / world, 1.0);
  return new Vec2(Math.min(world, outW / scale), Math.min(world, outH / scale));
}

export function clampCamera(worldSize: number, camera: Vec2, screenSize: Vec2): Vec2 {
  let camX = camera.x;
  let camY = camera.y;

  if (camX > -1.0) camX = -1.0;
  if (camY > -1.0) camY = -1.0;

  const minX = screenSize.x - worldSize;
  const minY = screenSize.y - worldSize;

  if (camX < minX) camX = minX;
  if (camY < minY) camY = minY;

  return new Vec2(camX, camY);
}

export function viewTransform(
  worldSize: number,
  config: CrimsonConfig | null,
  camera: Vec2,
  outSize: Vec2,
): [Vec2, Vec2, Vec2] {
  const screenSize = cameraScreenSize(worldSize, config, outSize.x, outSize.y);
  const clampedCamera = clampCamera(worldSize, camera, screenSize);
  const scaleX = screenSize.x > 0.0 ? outSize.x / screenSize.x : 1.0;
  const scaleY = screenSize.y > 0.0 ? outSize.y / screenSize.y : 1.0;
  return [clampedCamera, new Vec2(scaleX, scaleY), screenSize];
}

export function worldToScreenWith(pos: Vec2, camera: Vec2, viewScale: Vec2): Vec2 {
  return pos.add(camera).mulComponents(viewScale);
}

export function screenToWorldWith(pos: Vec2, camera: Vec2, viewScale: Vec2): Vec2 {
  const safeScale = new Vec2(
    viewScale.x > 0.0 ? viewScale.x : 1.0,
    viewScale.y > 0.0 ? viewScale.y : 1.0,
  );
  return pos.divComponents(safeScale).sub(camera);
}

export function viewScaleAvg(viewScale: Vec2): number {
  return viewScale.avgComponent();
}
