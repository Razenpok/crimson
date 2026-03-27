// Port of crimson/creatures/ai.py

import { Vec2 } from '@grim/geom.ts';
import { CrandLike } from '@grim/rand.ts';

import { NATIVE_PI, f32, f32Vec2, headingFromDeltaF32 } from '@crimson/math-parity.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import { CreatureAiMode, CreatureFlags } from './spawn-ids.ts';

const _FLAG_AI7_LINK_TIMER = CreatureFlags.AI7_LINK_TIMER as number;

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

export interface CreatureAIUpdate {
  readonly moveScale: number;
  readonly selfDamage: number | null;
}

export function creatureAi7TickLinkTimer(
  creature: CreatureAIStateLike,
  opts: { dtMs: number; rng: CrandLike },
): void {
  if (((creature.flags as number) & _FLAG_AI7_LINK_TIMER) === 0) {
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
  const dx = f32(b.x - a.x);
  const dy = f32(b.y - a.y);
  const dist_sq = dx * dx + dy * dy;
  return f32(Math.sqrt(dist_sq));
}

function _orbitTargetF32(
  player_pos: Vec2,
  orbit_phase: number,
  dist: number,
  scale: number,
): Vec2 {
  const orbit_dist = f32(f32(dist) * f32(scale));
  const phase = f32(orbit_phase);
  const px = f32(player_pos.x);
  const py = f32(player_pos.y);
  const orbit_x = f32(Math.cos(phase));
  const orbit_y = f32(Math.sin(phase));
  return new Vec2(
    f32(f32(orbit_x * orbit_dist) + px),
    f32(f32(orbit_y * orbit_dist) + py),
  );
}

function _linkTargetF32(link_pos: Vec2, offset: Vec2): Vec2 {
  return new Vec2(
    f32(link_pos.x + offset.x),
    f32(link_pos.y + offset.y),
  );
}

export function creatureAiUpdateTarget(
  creature: CreatureAIStateLike,
  opts: { playerPos: Vec2; creatures: readonly CreatureAIStateLike[]; dt: number },
): CreatureAIUpdate {
  const dist_to_player = _distanceF32(creature.pos, opts.playerPos);
  const orbit_phase = f32(f32(int(creature.phaseSeed) * f32(3.7)) * NATIVE_PI);
  let move_scale: number = 1.0;
  let self_damage: number | null = null;

  creature.forceTarget = 0;

  let ai_mode = creature.aiMode;
  if (ai_mode === CreatureAiMode.ORBIT_PLAYER) {
    if (dist_to_player > 800.0) {
      creature.target = f32Vec2(opts.playerPos);
    } else {
      creature.target = _orbitTargetF32(opts.playerPos, orbit_phase, dist_to_player, 0.85);
    }
  } else if (ai_mode === CreatureAiMode.ORBIT_PLAYER_WIDE) {
    creature.target = _orbitTargetF32(opts.playerPos, orbit_phase, dist_to_player, 0.9);
  } else if (ai_mode === CreatureAiMode.ORBIT_PLAYER_TIGHT) {
    if (dist_to_player > 800.0) {
      creature.target = f32Vec2(opts.playerPos);
    } else {
      creature.target = _orbitTargetF32(opts.playerPos, orbit_phase, dist_to_player, 0.55);
    }
  } else if (ai_mode === CreatureAiMode.FOLLOW_LINK) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link !== null) {
      creature.target = _linkTargetF32(link.pos, creature.targetOffset ?? new Vec2());
    } else {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
    }
  } else if (ai_mode === CreatureAiMode.FOLLOW_LINK_TETHERED) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link !== null) {
      creature.target = _linkTargetF32(link.pos, creature.targetOffset ?? new Vec2());
      const dist_to_target = _distanceF32(creature.pos, creature.target);
      if (dist_to_target <= 64.0) {
        move_scale = f32(dist_to_target * 0.015625);
      }
    } else {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
      self_damage = 1000.0;
    }
  }

  ai_mode = creature.aiMode;
  if (ai_mode === CreatureAiMode.LINK_GUARD) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link === null) {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
      self_damage = 1000.0;
    } else if (dist_to_player > 800.0) {
      creature.target = f32Vec2(opts.playerPos);
    } else {
      creature.target = _orbitTargetF32(opts.playerPos, orbit_phase, dist_to_player, 0.85);
    }
  } else if (ai_mode === CreatureAiMode.HOLD_TIMER) {
    if ((creature.flags & CreatureFlags.AI7_LINK_TIMER) && creature.linkIndex > 0) {
      creature.target = f32Vec2(creature.pos);
    } else if (!(creature.flags & CreatureFlags.AI7_LINK_TIMER) && creature.orbitRadius > 0.0) {
      creature.target = f32Vec2(creature.pos);
      creature.orbitRadius = f32(creature.orbitRadius - opts.dt);
    } else {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
    }
  } else if (ai_mode === CreatureAiMode.ORBIT_LINK) {
    const link = resolveLiveLink(opts.creatures, creature.linkIndex);
    if (link === null) {
      creature.aiMode = CreatureAiMode.ORBIT_PLAYER;
    } else {
      const angle = creature.orbitAngle + creature.heading;
      const orbit_radius = creature.orbitRadius;
      creature.target = new Vec2(
        f32(Math.cos(angle) * orbit_radius + link.pos.x),
        f32(Math.sin(angle) * orbit_radius + link.pos.y),
      );
    }
  }

  const dist_to_target = _distanceF32(creature.pos, creature.target);
  if (dist_to_target < 40.0 || dist_to_target > 400.0) {
    creature.forceTarget = 1;
  }

  if (creature.forceTarget || creature.aiMode === CreatureAiMode.CHASE_PLAYER) {
    creature.target = f32Vec2(opts.playerPos);
  }

  const dx = f32(creature.target.x - creature.pos.x);
  const dy = f32(creature.target.y - creature.pos.y);
  creature.targetHeading = headingFromDeltaF32({ dx, dy });
  return { moveScale: f32(move_scale), selfDamage: self_damage };
}
