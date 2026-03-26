// Port of crimson/world/render_resources.py

import {
  type RuntimeResources,
  type TextureId,
  getTexture,
  runtimeResourcesFor,
} from '@grim/assets.ts';
import { TextureId as TId } from '@grim/assets.ts';
import type { CrimsonConfig } from '@grim/config.ts';
import { Vec2 } from '@grim/geom.ts';
import { GroundRenderer } from '@grim/terrain-render.ts';
import * as wgl from '@wgl';
import { creatureCorpseFrameForType } from '@crimson/creatures/anim.ts';
import type { CreaturePool } from '@crimson/creatures/runtime.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import type { RenderFrame } from '@crimson/render/frame.ts';
import type { RtxRenderMode } from '@crimson/render/rtx/mode.ts';
import {
  type FxQueueTextures,
  bakeTerrainFxBatch,
} from '@crimson/render/terrain-fx.ts';
import type { TerrainFxBatch } from '@crimson/sim/terrain-fx.ts';
import { terrainFxBatchIsEmpty } from '@crimson/sim/terrain-fx.ts';

export class RenderResources {
  private _assetsUrl: string;
  worldSize: number;
  config: CrimsonConfig | null;

  ground: GroundRenderer | null = null;
  fxTextures: FxQueueTextures | null = null;
  private _pendingTerrainFxBatches: TerrainFxBatch[] = [];
  private _resources: RuntimeResources | null = null;

  constructor(worldSize: number = 1024.0, config: CrimsonConfig | null = null, assetsUrl: string = './assets') {
    this._assetsUrl = assetsUrl;
    this.worldSize = worldSize;
    this.config = config;
  }

  get resources(): RuntimeResources {
    if (this._resources !== null) return this._resources;
    return runtimeResourcesFor(this._assetsUrl);
  }

  set resources(value: RuntimeResources | null) {
    this._resources = value;
  }

  registryTexture(textureId: TextureId): wgl.Texture {
    return getTexture(this.resources, textureId);
  }

  syncGroundSettings(): void {
    if (this.ground === null) return;
    if (this.config === null) {
      this.ground.textureScale = 1.0;
      return;
    }
    this.ground.textureScale = this.config.display.textureScale;
  }

  setGroundTextures(opts: { base: wgl.Texture; overlay: wgl.Texture; detail: wgl.Texture }): void {
    const { base, overlay, detail } = opts;
    this.clearPendingTerrainFx();
    if (this.ground === null) {
      this.ground = new GroundRenderer(
        base,
        overlay,
        detail,
      );
      this.ground.width = int(this.worldSize);
      this.ground.height = int(this.worldSize);
      this.ground.textureScale = 1.0;
    } else {
      this.ground.texture = base;
      this.ground.overlay = overlay;
      this.ground.overlayDetail = detail;
    }
    this.syncGroundSettings();
  }

  scheduleGroundGeneration(opts: { seed: number }): void {
    const { seed } = opts;
    if (this.ground === null) return;
    this.ground.scheduleGenerate(seed);
  }

  processGroundPending(): void {
    if (this.ground === null) return;
    this.ground.processPending();
    if (this.ground.textureFailed) {
      this.clearPendingTerrainFx();
      return;
    }
    if (!this.ground.renderTargetReady()) return;
    if (this.fxTextures === null || this._pendingTerrainFxBatches.length === 0) return;

    const pending = [...this._pendingTerrainFxBatches];
    this._pendingTerrainFxBatches.length = 0;
    for (const batch of pending) {
      this._bakeTerrainFxBatch(batch, creatureCorpseFrameForType);
    }
  }

  open(opts: { terrainSeed: number }): void {
    const { terrainSeed } = opts;
    this.close();
    const resources = this.resources;

    const base = getTexture(resources, TId.TER_Q1_BASE);
    const overlay = getTexture(resources, TId.TER_Q1_OVERLAY);
    this.setGroundTextures({ base, overlay, detail: base });
    this.scheduleGroundGeneration({ seed: terrainSeed });
    this.fxTextures = {
      particles: getTexture(resources, TId.PARTICLES),
      bodyset: getTexture(resources, TId.BODYSET),
    };
  }

  close(): void {
    if (this.ground !== null) {
      this.ground.destroy();
    }
    this.ground = null;

    this._resources = null;
    this.fxTextures = null;
    this.clearPendingTerrainFx();
  }

  clearPendingTerrainFx(): void {
    this._pendingTerrainFxBatches.length = 0;
  }

  private _bakeTerrainFxBatch(
    batch: TerrainFxBatch,
    corpseFrameForType: (creatureTypeId: number) => number = creatureCorpseFrameForType,
  ): void {
    if (this.ground === null || this.fxTextures === null) return;
    if (terrainFxBatchIsEmpty(batch)) return;
    bakeTerrainFxBatch(this.ground, { batch, textures: this.fxTextures, corpseFrameForType });
  }

  consumeTerrainFxBatch(
    batch: TerrainFxBatch,
    opts: { corpseFrameForType?: (creatureTypeId: number) => number } = {},
  ): void {
    const corpseFrameForType = opts.corpseFrameForType ?? creatureCorpseFrameForType;
    if (terrainFxBatchIsEmpty(batch)) return;
    const ground = this.ground;
    if (ground === null || ground.textureFailed || this.fxTextures === null) return;
    if (ground.renderTargetReady()) {
      this._bakeTerrainFxBatch(batch, corpseFrameForType);
      return;
    }
    this._pendingTerrainFxBatches.push(batch);
  }

  buildRenderFrame(opts: {
    state: GameplayState;
    players: PlayerState[];
    creatures: CreaturePool;
    camera: Vec2;
    demoModeActive: boolean;
    elapsedMs: number;
    bonusAnimPhase: number;
    lanPlayerRingsEnabled: boolean;
    lanLocalAimIndicatorsOnly: boolean;
    lanLocalPlayerSlotIndex: number;
    rtxMode: RtxRenderMode;
  }): RenderFrame {
    return {
      worldSize: this.worldSize,
      demoModeActive: Boolean(opts.demoModeActive),
      config: this.config,
      camera: opts.camera,
      ground: this.ground,
      state: opts.state,
      players: opts.players,
      creatures: opts.creatures,
      resources: this.resources,
      elapsedMs: opts.elapsedMs,
      bonusAnimPhase: opts.bonusAnimPhase,
      lanPlayerRingsEnabled: Boolean(opts.lanPlayerRingsEnabled),
      lanLocalAimIndicatorsOnly: Boolean(opts.lanLocalAimIndicatorsOnly),
      lanLocalPlayerSlotIndex: int(opts.lanLocalPlayerSlotIndex),
      rtxMode: opts.rtxMode,
    };
  }
}
