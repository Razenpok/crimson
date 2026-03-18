// Port of crimson/world/terrain_runtime.py

import type { TextureId } from '../../engine/assets.ts';
import type { TerrainSlotTriplet } from '../terrain-slots.ts';
import { resolveTerrainSlots } from '../terrain-slots.ts';
import type { RenderResources } from './render-resources.ts';

export class TerrainRuntime {
  worldSize: number;
  renderResources: RenderResources;

  constructor(worldSize: number, renderResources: RenderResources) {
    this.worldSize = worldSize;
    this.renderResources = renderResources;
  }

  applyTerrainSetup(terrainSlots: TerrainSlotTriplet, seed: number): void {
    const [base, overlay, detail] = resolveTerrainSlots(
      terrainSlots,
      (textureId: TextureId) => this.renderResources.registryTexture(textureId),
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
