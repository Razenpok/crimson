// Port of crimson/render/terrain_fx.py

import * as wgl from '@wgl';
import { GroundRenderer, GroundDecal, GroundCorpseDecal } from '@grim/terrain-render.ts';
import { effectSrcRect } from '@crimson/effects-atlas.ts';
import { TerrainFxBatch } from '@crimson/sim/terrain-fx.ts';

export interface FxQueueTextures {
  readonly particles: wgl.Texture;
  readonly bodyset: wgl.Texture;
}

export function bakeTerrainFxBatch(
  ground: GroundRenderer,
  opts: { batch: TerrainFxBatch; textures: FxQueueTextures; corpseFrameForType: (creatureTypeId: number) => number },
): [boolean, boolean] {
  // Bake terrain FX batch into the ground render target (port of `fx_queue_render`).

  const decals: GroundDecal[] = [];
  for (const entry of opts.batch.decals) {
    const src = effectSrcRect(
      entry.effectId,
      { textureWidth: opts.textures.particles.width, textureHeight: opts.textures.particles.height },
    );
    if (src === null) continue;
    decals.push({
      texture: opts.textures.particles,
      srcRect: src,
      pos: entry.pos,
      width: entry.width,
      height: entry.height,
      rotationRad: entry.rotation,
      tint: entry.color.toWgl(),
    });
  }

  const corpseDecals: GroundCorpseDecal[] = [];
  for (const entry of opts.batch.corpses) {
    corpseDecals.push({
      bodysetFrame: opts.corpseFrameForType(entry.creatureTypeId),
      topLeft: entry.topLeft,
      size: entry.scale,
      rotationRad: entry.rotation,
      tint: entry.color.toWgl(),
    });
  }

  const bakedFx = ground.bakeDecals(decals);
  const bakedCorpses = ground.bakeCorpseDecals(opts.textures.bodyset, corpseDecals);
  return [bakedFx, bakedCorpses];
}
