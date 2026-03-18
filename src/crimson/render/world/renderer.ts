// Port of crimson/render/world/renderer.py

import { CrimsonConfig } from '@grim/config.ts';
import { Vec2 } from '@grim/geom.ts';
import { type WebGLContext } from '@grim/webgl.ts';
import type { RenderFrame } from '@crimson/render/frame.ts';
import * as viewport from './viewport.ts';
import { buildWorldRenderCtx } from './context.ts';
import { drawWorld } from './draw.ts';

export class WorldRenderer {
  worldSize: number;
  config: CrimsonConfig | null;
  camera: Vec2;
  private _gl: WebGLContext;

  constructor(gl: WebGLContext, worldSize: number = 0, config: CrimsonConfig | null = null, camera: Vec2 = new Vec2()) {
    this._gl = gl;
    this.worldSize = worldSize;
    this.config = config;
    this.camera = camera;
  }

  syncViewport(worldSize: number, config: CrimsonConfig | null, camera: Vec2): void {
    this.worldSize = worldSize;
    this.config = config;
    this.camera = camera;
  }

  draw(renderFrame: RenderFrame, drawAimIndicators: boolean = true, entityAlpha: number = 1.0): void {
    this.syncViewport(renderFrame.worldSize, renderFrame.config, renderFrame.camera);
    const renderCtx = buildWorldRenderCtx(this, renderFrame, this._gl);
    drawWorld(renderCtx, drawAimIndicators, entityAlpha);
  }

  cameraScreenSize(runtimeW?: number, runtimeH?: number): Vec2 {
    const outW = runtimeW ?? this._gl.screenWidth;
    const outH = runtimeH ?? this._gl.screenHeight;
    return viewport.cameraScreenSize(this.worldSize, this.config, outW, outH);
  }

  clampCamera(camera: Vec2, screenSize: Vec2): Vec2 {
    return viewport.clampCamera(this.worldSize, camera, screenSize);
  }

  worldParams(): [Vec2, Vec2] {
    const outSize = new Vec2(this._gl.screenWidth, this._gl.screenHeight);
    const [camera, viewScale] = viewport.viewTransform(
      this.worldSize,
      this.config,
      this.camera,
      outSize,
    );
    return [camera, viewScale];
  }

  worldToScreen(pos: Vec2): Vec2 {
    const [camera, viewScale] = this.worldParams();
    return viewport.worldToScreenWith(pos, camera, viewScale);
  }

  screenToWorld(pos: Vec2): Vec2 {
    const [camera, viewScale] = this.worldParams();
    return viewport.screenToWorldWith(pos, camera, viewScale);
  }
}
