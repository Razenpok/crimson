// Port of crimson/render/world/renderer.py

import * as wgl from '@wgl';
import { CrimsonConfig } from '@grim/config.ts';
import { Vec2 } from '@grim/geom.ts';
import type { RenderFrame } from '@crimson/render/frame.ts';
import * as viewport from './viewport.ts';
import { buildWorldRenderCtx } from './context.ts';
import { drawWorld } from './draw.ts';

export class WorldRenderer {
  constructor(
    public worldSize: number = 0,
    public config: CrimsonConfig | null = null,
    public camera: Vec2 = new Vec2()
  ) {
  }

  syncViewport(worldSize: number, config: CrimsonConfig | null, camera: Vec2): void {
    this.worldSize = worldSize;
    this.config = config;
    this.camera = camera;
  }

  draw(renderFrame: RenderFrame, drawAimIndicators: boolean = true, entityAlpha: number = 1.0): void {
    this.syncViewport(renderFrame.worldSize, renderFrame.config, renderFrame.camera);
    const renderCtx = buildWorldRenderCtx(this, renderFrame);
    drawWorld(renderCtx, drawAimIndicators, entityAlpha);
  }

  cameraScreenSize(runtimeW?: number, runtimeH?: number): Vec2 {
    const outW = runtimeW ?? wgl.getScreenWidth();
    const outH = runtimeH ?? wgl.getScreenHeight();
    return viewport.cameraScreenSize(this.worldSize, this.config, outW, outH);
  }

  clampCamera(camera: Vec2, screenSize: Vec2): Vec2 {
    return viewport.clampCamera(this.worldSize, camera, screenSize);
  }

  worldParams(): [Vec2, Vec2] {
    const outSize = new Vec2(wgl.getScreenWidth(), wgl.getScreenHeight());
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
