// Port of crimson/world/runtime.py

import type { AudioState } from '../../grim/audio.ts';
import type { CrimsonConfig } from '../../grim/config.ts';
import { Vec2 } from '../../grim/geom.ts';
import type { CrandLike } from '../../grim/rand.ts';
import type { WebGLContext } from '../../grim/webgl.ts';
import type { RenderFrame } from '../render/frame.ts';
import { RtxRenderMode } from '../render/rtx/mode.ts';
import * as viewport from '../render/world/viewport.ts';
import { WorldRenderer } from '../render/world/renderer.ts';
import { AudioBridge } from './audio-bridge.ts';
import { RenderResources } from './render-resources.ts';
import { SimWorldState } from './sim-world-state.ts';
import { TerrainRuntime } from './terrain-runtime.ts';

export class WorldRuntime {
  private _ctx: WebGLContext;
  worldSize: number;
  demoModeActive: boolean;
  questFailRetryCount: number;
  hardcore: boolean;
  preserveBugs: boolean;
  config: CrimsonConfig | null;
  audio: AudioState | null;
  audioRng: CrandLike;
  rtxMode: RtxRenderMode;

  simWorld: SimWorldState;
  renderResources: RenderResources;
  audioBridge: AudioBridge;
  terrainRuntime: TerrainRuntime;

  camera: Vec2;
  lanPlayerRingsEnabled = false;
  lanLocalAimIndicatorsOnly = false;
  lanLocalPlayerSlotIndex = 0;
  renderer: WorldRenderer;

  constructor(ctx: WebGLContext, opts: {
    worldSize?: number;
    demoModeActive?: boolean;
    questFailRetryCount?: number;
    hardcore?: boolean;
    preserveBugs?: boolean;
    config?: CrimsonConfig | null;
    audioRng: CrandLike;
    audio?: AudioState | null;
    rtxMode?: RtxRenderMode;
  }) {
    this._ctx = ctx;
    this.worldSize = opts.worldSize ?? 1024.0;
    this.demoModeActive = opts.demoModeActive ?? false;
    this.questFailRetryCount = opts.questFailRetryCount ?? 0;
    this.hardcore = opts.hardcore ?? false;
    this.preserveBugs = opts.preserveBugs ?? false;
    this.config = opts.config ?? null;
    this.audio = opts.audio ?? null;
    this.audioRng = opts.audioRng;
    this.rtxMode = opts.rtxMode ?? RtxRenderMode.CLASSIC;

    this.simWorld = new SimWorldState({
      worldSize: this.worldSize,
      demoModeActive: this.demoModeActive,
      hardcore: this.hardcore,
      questFailRetryCount: this.questFailRetryCount,
      preserveBugs: this.preserveBugs,
    });

    const renderResources = new RenderResources(ctx, this.worldSize, this.config);
    this.renderResources = renderResources;

    this.audioBridge = new AudioBridge({
      demoModeActive: this.demoModeActive,
      reflexBoostTimerSource: () => Number(this.simWorld.state.bonuses.reflexBoost),
      audio: this.audio,
      audioRng: this.audioRng,
    });

    this.terrainRuntime = new TerrainRuntime(this.worldSize, renderResources);

    this.camera = new Vec2(-1.0, -1.0);
    this.renderer = new WorldRenderer(
      ctx,
      this.worldSize,
      this.config,
      this.camera,
    );

    this._syncWorldSizeOwnership();
    this.syncAudioBridgeState();
  }

  // ------------------------------------------------------------------
  // Shared lifecycle methods
  // ------------------------------------------------------------------

  syncWorldSize(): void {
    this._syncWorldSizeOwnership();
  }

  private _syncWorldSizeOwnership(): void {
    const worldSize = this.worldSize;
    this.simWorld.worldSize = worldSize;
    this.renderResources.worldSize = worldSize;
    this.terrainRuntime.worldSize = worldSize;
    this.renderer.syncViewport(worldSize, this.config, this.camera);
    const ground = this.renderResources.ground;
    if (ground !== null) {
      const side = Math.max(0, Math.floor(worldSize));
      ground.width = side;
      ground.height = side;
    }
  }

  reset(seed: number = 0xBEEF, playerCount: number = 1, spawnPos: Vec2 | null = null): void {
    this._syncWorldSizeOwnership();
    this.simWorld.demoModeActive = Boolean(this.demoModeActive);
    this.simWorld.hardcore = Boolean(this.hardcore);
    this.simWorld.questFailRetryCount = this.questFailRetryCount | 0;
    this.simWorld.preserveBugs = Boolean(this.preserveBugs);
    this.simWorld.reset(seed | 0, playerCount | 0, spawnPos);
    this.renderResources.clearPendingTerrainFx();
    this.camera = new Vec2(-1.0, -1.0);
    this.renderer.syncViewport(this.worldSize, this.config, this.camera);
    if (this.renderResources.ground !== null) {
      const terrainSeed = this.simWorld.state.rng.state;
      this.terrainRuntime.scheduleFromRngSeed(terrainSeed);
    }
  }

  openRuntime(): void {
    this.renderResources.config = this.config;
    this.renderResources.open(this.simWorld.state.rng.state);
  }

  closeRuntime(): void {
    this.renderResources.close();
    this.simWorld.closeSession();
  }

  syncAudioBridgeState(): void {
    this.audioBridge.sync(
      this.audio,
      this.audioRng,
      Boolean(this.demoModeActive),
    );
  }

  updateCamera(_dt: number): void {
    if (this.simWorld.players.length === 0) return;

    const screenSize = viewport.cameraScreenSize(
      this.worldSize,
      this.config,
      this._ctx.screenWidth,
      this._ctx.screenHeight,
    );
    const alive = this.simWorld.players.filter((player) => player.health > 0.0);
    let camera: Vec2;
    if (alive.length > 0) {
      const invAlive = 1.0 / alive.length;
      const focus = new Vec2(
        alive.reduce((sum, p) => sum + p.pos.x, 0.0) * invAlive,
        alive.reduce((sum, p) => sum + p.pos.y, 0.0) * invAlive,
      );
      camera = screenSize.mul(0.5).sub(focus);
    } else {
      camera = this.camera;
    }

    camera = camera.add(this.simWorld.state.cameraShakeOffset);
    this.camera = viewport.clampCamera(this.worldSize, camera, screenSize);
    this.renderer.syncViewport(this.worldSize, this.config, this.camera);
  }

  draw(drawAimIndicators = true, entityAlpha = 1.0): void {
    this.renderer.draw(
      this.buildRenderFrame(),
      drawAimIndicators,
      entityAlpha,
    );
  }

  buildRenderFrame(): RenderFrame {
    return this.renderResources.buildRenderFrame({
      state: this.simWorld.state,
      players: this.simWorld.players,
      creatures: this.simWorld.creatures,
      camera: this.camera,
      demoModeActive: Boolean(this.demoModeActive),
      elapsedMs: this.simWorld.presentationElapsedMs,
      bonusAnimPhase: this.simWorld.bonusAnimPhase,
      lanPlayerRingsEnabled: Boolean(this.lanPlayerRingsEnabled),
      lanLocalAimIndicatorsOnly: Boolean(this.lanLocalAimIndicatorsOnly),
      lanLocalPlayerSlotIndex: this.lanLocalPlayerSlotIndex | 0,
      rtxMode: this.rtxMode,
    });
  }
}
