// Port of crimson/world/terrain_runtime.py

import type { TerrainSlotTriplet } from '@crimson/terrain-slots.ts';
import { resolveTerrainSlots } from '@crimson/terrain-slots.ts';
import type { RenderResources } from './render-resources.ts';

export class TerrainRuntime {
  constructor(
    public worldSize: number = 1024,
    public renderResources: RenderResources
  ) {
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
