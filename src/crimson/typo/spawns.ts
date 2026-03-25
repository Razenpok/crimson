// Port of crimson/typo/spawns.py

import { Vec2 } from '@grim/geom.ts';
import { RGBA } from '@grim/color.ts';
import { clamp } from '@grim/math.ts';
import { CreatureTypeId } from '@crimson/creatures/spawn-ids.ts';

export interface TypoSpawnCall {
  readonly pos: Vec2;
  readonly typeId: CreatureTypeId;
  readonly tintRgba: RGBA;
}

export function tickTypoSpawns(
  opts: { elapsedMs: number; spawnCooldownMs: number; frameDtMs: number; playerCount: number; worldWidth: number; worldHeight: number },
): [number, TypoSpawnCall[]] {
  let elapsedMs = opts.elapsedMs | 0;
  let cooldown = opts.spawnCooldownMs | 0;
  const dtMs = opts.frameDtMs | 0;
  let playerCount = Math.max(1, opts.playerCount | 0);

  cooldown -= dtMs * playerCount;

  const spawns: TypoSpawnCall[] = [];
  while (cooldown < 0) {
    cooldown += 3500 - ((elapsedMs / 800) | 0);
    cooldown = Math.max(100, cooldown);

    const t = elapsedMs * 0.001;
    const y = Math.cos(t) * 256.0 + opts.worldHeight * 0.5;

    const tintT = elapsedMs + 1;
    const tintR = clamp(tintT * 0.0000083333334 + 0.3, 0.0, 1.0);
    const tintG = clamp(tintT * 10000.0 + 0.3, 0.0, 1.0);
    const tintB = clamp(Math.sin(tintT * 0.0001) + 0.3, 0.0, 1.0);
    const tint = new RGBA(tintR, tintG, tintB, 1.0);

    spawns.push({
      pos: new Vec2(opts.worldWidth + 64.0, y),
      typeId: CreatureTypeId.SPIDER_SP2,
      tintRgba: tint,
    });
    spawns.push({
      pos: new Vec2(-64.0, y),
      typeId: CreatureTypeId.ALIEN,
      tintRgba: tint,
    });
  }

  return [cooldown, spawns];
}
