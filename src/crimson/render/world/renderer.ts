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

  syncViewport(opts: { worldSize: number; config: CrimsonConfig | null; camera: Vec2 }): void {
    this.worldSize = opts.worldSize;
    this.config = opts.config;
    this.camera = opts.camera;
  }

  draw(opts: { renderFrame: RenderFrame; drawAimIndicators?: boolean; entityAlpha?: number }): void {
    const drawAimIndicators = opts.drawAimIndicators ?? true;
    const entityAlpha = opts.entityAlpha ?? 1.0;
    this.syncViewport({ worldSize: opts.renderFrame.worldSize, config: opts.renderFrame.config, camera: opts.renderFrame.camera });
    const renderCtx = buildWorldRenderCtx(this, { renderFrame: opts.renderFrame });
    drawWorld(renderCtx, { drawAimIndicators, entityAlpha });
  }

  private cameraScreenSize(runtimeW?: number, runtimeH?: number): Vec2 {
    const outW = runtimeW ?? wgl.getScreenWidth();
    const outH = runtimeH ?? wgl.getScreenHeight();
    return viewport.cameraScreenSize({ worldSize: this.worldSize, config: this.config, runtimeW: outW, runtimeH: outH });
  }

  private clampCamera(camera: Vec2, screenSize: Vec2): Vec2 {
    return viewport.clampCamera({ worldSize: this.worldSize, camera, screenSize });
  }

  private worldParams(): [Vec2, Vec2] {
    const outSize = new Vec2(wgl.getScreenWidth(), wgl.getScreenHeight());
    const [camera, viewScale] = viewport.viewTransform({
      worldSize: this.worldSize,
      config: this.config,
      camera: this.camera,
      outSize,
    });
    return [camera, viewScale];
  }

  worldToScreen(pos: Vec2): Vec2 {
    const [camera, viewScale] = this.worldParams();
    return viewport.worldToScreenWith(pos, { camera, viewScale });
  }

  screenToWorld(pos: Vec2): Vec2 {
    const [camera, viewScale] = this.worldParams();
    return viewport.screenToWorldWith(pos, { camera, viewScale });
  }
}
