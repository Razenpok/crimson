// Port of crimson/world/terrain_runtime.py

import type { TextureId } from '@grim/assets.ts';
import type { TerrainSlotTriplet } from '@crimson/terrain-slots.ts';
import { resolveTerrainSlots } from '@crimson/terrain-slots.ts';
import type { RenderResources } from './render-resources.ts';

export class TerrainRuntime {
  constructor(
    public worldSize: number = 1024,
    public renderResources: RenderResources
  ) {
  }

  applyTerrainSetup(terrainSlots: TerrainSlotTriplet, seed: number): void {
    const [base, overlay, detail] = resolveTerrainSlots(
      terrainSlots,
      (textureId) => this.renderResources.registryTexture(textureId),
    );
    this.renderResources.setGroundTextures(base, overlay, detail);
    this.renderResources.scheduleGroundGeneration(seed);
  }

  scheduleFromRngSeed(seed: number): void {
    this.renderResources.scheduleGroundGeneration(seed);
  }

  processPending(): void {
    this.renderResources.processGroundPending();
  }
}
