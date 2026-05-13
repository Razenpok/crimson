// Port of crimson/sim/world_defs.py

import { CreatureTypeId } from '@crimson/creatures/spawn-ids.ts';
import { ProjectileTemplateId } from '@crimson/projectiles/types.ts';

export class CreatureAnimInfo {
  constructor(
    public readonly base: number,
    public readonly animRate: number,
    public readonly mirror: boolean,
  ) {
    Object.freeze(this);
  }
}

export const CREATURE_ANIM = new Map<CreatureTypeId, CreatureAnimInfo>([
  [CreatureTypeId.ZOMBIE, new CreatureAnimInfo(0x20, 1.2, false)],
  [CreatureTypeId.LIZARD, new CreatureAnimInfo(0x10, 1.6, true)],
  [CreatureTypeId.ALIEN, new CreatureAnimInfo(0x20, 1.35, false)],
  [CreatureTypeId.SPIDER_SP1, new CreatureAnimInfo(0x10, 1.5, true)],
  [CreatureTypeId.SPIDER_SP2, new CreatureAnimInfo(0x10, 1.5, true)],
  [CreatureTypeId.TROOPER, new CreatureAnimInfo(0x00, 1.0, false)],
]);

export const CREATURE_ASSET = new Map<CreatureTypeId, string>([
  [CreatureTypeId.ZOMBIE, 'zombie'],
  [CreatureTypeId.LIZARD, 'lizard'],
  [CreatureTypeId.ALIEN, 'alien'],
  [CreatureTypeId.SPIDER_SP1, 'spider_sp1'],
  [CreatureTypeId.SPIDER_SP2, 'spider_sp2'],
  [CreatureTypeId.TROOPER, 'trooper'],
]);

export const KNOWN_PROJ_FRAMES = new Map<number, [number, number]>([
  // Based on docs/atlas.md (projectile `type_id` values index the weapon table).
  [ProjectileTemplateId.PULSE_GUN, [2, 0]],
  [ProjectileTemplateId.SPLITTER_GUN, [4, 3]],
  [ProjectileTemplateId.BLADE_GUN, [4, 6]],
  [ProjectileTemplateId.ION_MINIGUN, [4, 2]],
  [ProjectileTemplateId.ION_CANNON, [4, 2]],
  [ProjectileTemplateId.SHRINKIFIER, [4, 2]],
  [ProjectileTemplateId.FIRE_BULLETS, [4, 2]],
  [ProjectileTemplateId.ION_RIFLE, [4, 2]],
]);

export const PLASMA_PARTICLE_TYPES: ReadonlySet<number> = new Set([
  ProjectileTemplateId.PLASMA_RIFLE,
  ProjectileTemplateId.PLASMA_MINIGUN,
  ProjectileTemplateId.PLASMA_CANNON,
  ProjectileTemplateId.SPIDER_PLASMA,
  ProjectileTemplateId.SHRINKIFIER,
]);

export const ION_TYPES: ReadonlySet<number> = new Set([
  ProjectileTemplateId.ION_RIFLE,
  ProjectileTemplateId.ION_MINIGUN,
  ProjectileTemplateId.ION_CANNON,
]);

export const FIRE_BULLETS_TYPES: ReadonlySet<number> = new Set([
  ProjectileTemplateId.FIRE_BULLETS,
]);

// "Beam" in the original renderer is really the Ion/Fire streak + chain UV family.
export const BEAM_TYPES: ReadonlySet<number> = new Set([
  ...ION_TYPES,
  ...FIRE_BULLETS_TYPES,
]);
