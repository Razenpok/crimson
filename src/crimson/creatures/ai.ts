// Port of crimson/creatures/ai.py

import { Vec2 } from '@grim/geom.ts';
import type { CrandLike } from '@grim/rand.ts';

import { NATIVE_PI, f32, f32Vec2, headingFromDeltaF32 } from '@crimson/math-parity.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import { CreatureAiMode, CreatureFlags } from './spawn.ts';

// Creature AI helpers.
//
// Ported from `creature_update_all` (`FUN_00426220`).

const _FLAG_AI7_LINK_TIMER = int(CreatureFlags.AI7_LINK_TIMER);

export interface CreatureAIStateLike {
  pos: Vec2;
  hp: number;
  flags: CreatureFlags;
  aiMode: CreatureAiMode;
  linkIndex: number;
  targetOffset: Vec2 | null;
  phaseSeed: number;
  orbitAngle: number;
  orbitRadius: number;
  heading: number;

  target: Vec2;
  targetHeading: number;
  forceTarget: number;
}

export class CreatureAIUpdate {
  constructor(
    public readonly moveScale: number,
    public readonly selfDamage: number | null = null,
  ) {
    Object.freeze(this);
  }
}

export function creatureAi7TickLinkTimer(
  creature: CreatureAIStateLike,
  opts: { dtMs: number; rng: CrandLike },
): void {
  // Update AI7's link-index timer behavior (flag 0x80).
  //
  // In the original, this runs regardless of the current ai_mode; when the timer
  // flips from negative to non-negative, ai_mode is forced to 7 for a short hold.
  if ((int(creature.flags) & _FLAG_AI7_LINK_TIMER) === 0) {
    return;
  }

  if (creature.linkIndex < 0) {
    creature.linkIndex += opts.dtMs;
    if (creature.linkIndex >= 0) {
      creature.aiMode = CreatureAiMode.HOLD_TIMER;
      creature.linkIndex =
        (opts.rng.rand({ caller: RngCallerStatic.CREATURE_UPDATE_ALL_AI7_LINK_TIMER_HOLD }) & 0x1FF) + 500;
    }
    return;
  }

  creature.linkIndex -= opts.dtMs;
  if (creature.linkIndex < 1) {
    creature.linkIndex =
      -700 -
      (opts.rng.rand({ caller: RngCallerStatic.CREATURE_UPDATE_ALL_AI7_LINK_TIMER_RESET }) & 0x3FF);
  }
}

export function resolveLiveLink(
  creatures: readonly CreatureAIStateLike[],
  linkIndex: number,
): CreatureAIStateLike | null {
  if (linkIndex >= 0 && linkIndex < creatures.length && creatures[linkIndex].hp > 0.0) {
    return creatures[linkIndex];
  }
  return null;
}

function _distanceF32(a: Vec2, b: Vec2): number {
  // Native computes deltas into float locals, then runs the distance math in
  // x87 precision and stores only the final sqrt back to float.
  const dx = f32(b.x - a.x);
  const dy = f32(b.y - a.y);
  const distSq = dx * dx + dy * dy;
  return f32(Math.sqrt(distSq));
}

function _orbitTargetF32(
  playerPos: Vec2,
  orbitPhase: number,
  dist: number,
  scale: number,
): Vec2 {
  const orbitDist = f32(f32(dist) * f32(scale));
  const phase = f32(orbitPhase);
  const px = f32(playerPos.x);
  const py = f32(playerPos.y);
  const orbitX = f32(Math.cos(phase));
  const orbitY = f32(Math.sin(phase));
  return new Vec2(
    f32(f32(orbitX * orbitDist) + px),
    f32(f32(orbitY * orbitDist) + py),
  );
}

function _linkTargetF32(linkPos: Vec2, offset: Vec2): Vec2 {
  return new Vec2(
    f32(linkPos.x + offset.x),
    f32(linkPos.y + offset.y),
  );
}

export function creatureAiUpdateTarget(
  creature: CreatureAIStateLike,
  opts: { playerPos: Vec2; creatures: readonly CreatureAIStateLike[]; dt: number },
): CreatureAIUpdate {
  // Compute the target position + heading for one creature.
  //
  // Updates:
  // - `target`
  // - `target_heading`
  // - `force_target`
  // - `ai_mode` (may reset to 0 in some modes)
  // - `orbit_radius` (AI7 non-link timer uses it as a countdown)
  const distToPlayer = _distanceF32(creature.pos, opts.playerPos);
  const orbitPhase = f32(f32(int(creature.phaseSeed) * f32(3.7)) * NATIVE_PI);
  let moveScale: number = 1.0;
  let selfDamage: number | null = null;

  creature.forceTarget = 0;

  let aiMode = creature.aiMode;
  if (aiMode === CreatureAiMode.ORBIT_PLAYER) {
    if (distToPlayer > 800.0) {
      creature.target = f32Vec2(opts.playerPos);
    } else {
      creature.target = _orbitTargetF32(opts.playerPos, orbitPhase, distToPlayer, 0.85);
    }
  } else if (aiMode === CreatureAiMode.ORBIT_PLAYER_WIDE) {
    creature.target = _orbitTargetF32(opts.playerPos, orbitPhase, distToPlayer, 0.9);
  } else if (aiMode === CreatureAiMode.ORBIT_PLAYER_TIGHT) {
    if (distToPlayer > 800.0) {
      creature.target = f32Vec2(opts.playerPos);
    } else {
      creature.target = _orbitTargetF32(opts.playerPos, orbitPhase, distToPlayer, 0.55);
    }
  } else if (aiMode === CreatureAiMode.FOLLOW_LINK) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link !== null) {
      creature.target = _linkTargetF32(link.pos, creature.targetOffset ?? new Vec2());
    } else {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
    }
  } else if (aiMode === CreatureAiMode.FOLLOW_LINK_TETHERED) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link !== null) {
      creature.target = _linkTargetF32(link.pos, creature.targetOffset ?? new Vec2());
      const distToTarget = _distanceF32(creature.pos, creature.target);
      if (distToTarget <= 64.0) {
        moveScale = f32(distToTarget * 0.015625);
      }
    } else {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
      selfDamage = 1000.0;
    }
  }

  aiMode = creature.aiMode;
  if (aiMode === CreatureAiMode.LINK_GUARD) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link === null) {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
      selfDamage = 1000.0;
    } else if (distToPlayer > 800.0) {
      creature.target = f32Vec2(opts.playerPos);
    } else {
      creature.target = _orbitTargetF32(opts.playerPos, orbitPhase, distToPlayer, 0.85);
    }
  } else if (aiMode === CreatureAiMode.HOLD_TIMER) {
    if ((creature.flags & CreatureFlags.AI7_LINK_TIMER) && creature.linkIndex > 0) {
      creature.target = f32Vec2(creature.pos);
    } else if (!(creature.flags & CreatureFlags.AI7_LINK_TIMER) && creature.orbitRadius > 0.0) {
      creature.target = f32Vec2(creature.pos);
      creature.orbitRadius = f32(creature.orbitRadius - opts.dt);
    } else {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
    }
  } else if (aiMode === CreatureAiMode.ORBIT_LINK) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link === null) {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
    } else {
      const angle = creature.orbitAngle + creature.heading;
      const orbitRadius = creature.orbitRadius;
      creature.target = new Vec2(
        f32(Math.cos(angle) * orbitRadius + link.pos.x),
        f32(Math.sin(angle) * orbitRadius + link.pos.y),
      );
    }
  }

  const distToTarget = _distanceF32(creature.pos, creature.target);
  if (distToTarget < 40.0 || distToTarget > 400.0) {
    creature.forceTarget = 1;
  }

  if (creature.forceTarget || creature.aiMode === CreatureAiMode.CHASE_PLAYER) {
    creature.target = f32Vec2(opts.playerPos);
  }

  // Native stores dx/dy deltas into float locals before calling atan2.
  const dx = f32(creature.target.x - creature.pos.x);
  const dy = f32(creature.target.y - creature.pos.y);
  creature.targetHeading = headingFromDeltaF32({ dx, dy });
  return new CreatureAIUpdate(f32(moveScale), selfDamage);
}
