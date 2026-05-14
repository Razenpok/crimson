// Port of crimson/world/terrain_runtime.py

import type { TerrainSlotTriplet } from '@crimson/terrain-slots.ts';
import { resolveTerrainSlots } from '@crimson/terrain-slots.ts';
import type { RenderResources } from './render-resources.ts';

export class TerrainRuntime {
  worldSize: number;
  renderResources: RenderResources;

  constructor(opts: { worldSize?: number; renderResources: RenderResources }) {
    this.worldSize = opts.worldSize ?? 1024.0;
    this.renderResources = opts.renderResources;
  }

  applyTerrainSetup(opts: { terrainSlots: TerrainSlotTriplet; seed: number }): void {
    const [base, overlay, detail] = resolveTerrainSlots(
      opts.terrainSlots,
      (textureId) => this.renderResources.registryTexture(textureId),
    );
    this.renderResources.setGroundTextures({ base, overlay, detail });
    this.renderResources.scheduleGroundGeneration({ seed: opts.seed });
  }

  scheduleFromRngSeed(opts: { seed: number }): void {
    this.renderResources.scheduleGroundGeneration({ seed: opts.seed });
  }

  processPending(): void {
    this.renderResources.processGroundPending();
  }
}
