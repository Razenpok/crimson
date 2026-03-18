// Port of crimson/render/terrain_fx.py

import { GlTexture } from '@grim/webgl.ts';
import { GroundRenderer, GroundDecal, GroundCorpseDecal } from '@grim/terrain-render.ts';
import { effectSrcRect } from '@crimson/effects-atlas.ts';
import { TerrainFxBatch } from '@crimson/sim/terrain-fx.ts';

export interface FxQueueTextures {
  readonly particles: GlTexture;
  readonly bodyset: GlTexture;
}

export function bakeTerrainFxBatch(
  ground: GroundRenderer,
  batch: TerrainFxBatch,
  textures: FxQueueTextures,
  corpseFrameForType: (creatureTypeId: number) => number,
): [boolean, boolean] {
  const decals: GroundDecal[] = [];
  for (const entry of batch.decals) {
    const src = effectSrcRect(
      entry.effectId,
      textures.particles.width,
      textures.particles.height,
    );
    if (src === null) continue;
    decals.push({
      texture: textures.particles,
      srcRect: src,
      pos: entry.pos,
      width: entry.width,
      height: entry.height,
      rotationRad: entry.rotation,
      tint: entry.color.toTuple(),
    });
  }

  const corpseDecals: GroundCorpseDecal[] = [];
  for (const entry of batch.corpses) {
    corpseDecals.push({
      bodysetFrame: corpseFrameForType(entry.creatureTypeId),
      topLeft: entry.topLeft,
      size: entry.scale,
      rotationRad: entry.rotation,
      tint: entry.color.toTuple(),
    });
  }

  const bakedFx = ground.bakeDecals(decals);
  const bakedCorpses = ground.bakeCorpseDecals(textures.bodyset, corpseDecals);
  return [bakedFx, bakedCorpses];
}
