// Port of crimson/effects.py

import { RGBA } from '@grim/color.ts';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';
import type { CallerStatic, CrandLike } from '@grim/rand.ts';
import { Crand } from '@grim/rand.ts';
import { creatureLifecycleIsCollidable } from './creatures/lifecycle.ts';
import { EffectId } from './effects-atlas.ts';
import { f32 } from './math-parity.ts';
import { OwnerRef } from './owner-ref.ts';
import type { CreatureDamageApplier } from './projectiles/types.ts';
import { RngCallerStatic } from './rng-caller-static.ts';
import type { CreatureState } from './creatures/runtime.ts';

export const EFFECT_POOL_SIZE = 0x200;
export const PARTICLE_POOL_SIZE = 0x80;
export const SPRITE_EFFECT_POOL_SIZE = 0x180;

export const FX_QUEUE_CAPACITY = 0x80;
export const FX_QUEUE_MAX_COUNT = 0x7f;

export const FX_QUEUE_ROTATED_CAPACITY = 0x40;
export const FX_QUEUE_ROTATED_MAX_COUNT = 0x3f;

export enum ParticleStyleId {
  FLAMETHROWER = 0,
  BLOW_TORCH = 1,
  HR_FLAMER = 2,
  BUBBLEGUN = 8,
}

export type CreatureKillHandler = (creatureIndex: number, owner: OwnerRef) => void;

export class Particle {
  active: boolean;
  renderFlag: boolean;
  pos: Vec2;
  vel: Vec2;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  age: number;
  intensity: number;
  angle: number;
  spin: number;
  styleId: ParticleStyleId;
  targetId: number;
  owner: OwnerRef;

  constructor(opts: {
    active?: boolean;
    renderFlag?: boolean;
    pos?: Vec2;
    vel?: Vec2;
    scaleX?: number;
    scaleY?: number;
    scaleZ?: number;
    age?: number;
    intensity?: number;
    angle?: number;
    spin?: number;
    styleId?: ParticleStyleId;
    targetId?: number;
    owner?: OwnerRef;
  } = {}) {
    this.active = opts.active ?? false;
    this.renderFlag = opts.renderFlag ?? false;
    this.pos = opts.pos ?? new Vec2();
    this.vel = opts.vel ?? new Vec2();
    this.scaleX = opts.scaleX ?? 1.0;
    this.scaleY = opts.scaleY ?? 1.0;
    this.scaleZ = opts.scaleZ ?? 1.0;
    this.age = opts.age ?? 0.0;
    this.intensity = opts.intensity ?? 0.0;
    this.angle = opts.angle ?? 0.0;
    this.spin = opts.spin ?? 0.0;
    this.styleId = opts.styleId ?? ParticleStyleId.FLAMETHROWER;
    this.targetId = opts.targetId ?? -1;
    this.owner = opts.owner ?? OwnerRef.fromLocalPlayer(0);
  }
}

export class ParticlePool {
  private _entries: Particle[];
  private _rng: CrandLike;
  private _creatureDamageApplier: CreatureDamageApplier | null;

  constructor(opts: {
    size?: number;
    rng?: CrandLike | null;
    creatureDamageApplier?: CreatureDamageApplier | null;
  } = {}) {
    const size = Math.max(0, int(opts.size ?? PARTICLE_POOL_SIZE));
    this._entries = Array.from({ length: size }, () => new Particle());
    this._rng = opts.rng ?? new Crand(0);
    this._creatureDamageApplier = opts.creatureDamageApplier ?? null;
  }

  get entries(): Particle[] {
    return this._entries;
  }

  get creatureDamageApplier(): CreatureDamageApplier | null {
    return this._creatureDamageApplier;
  }

  set creatureDamageApplier(value: CreatureDamageApplier | null) {
    this._creatureDamageApplier = value;
  }

  reset(): void {
    for (const entry of this._entries) entry.active = false;
  }

  private _allocSlot(opts: { caller?: CallerStatic } = {}): number {
    for (let i = 0; i < this._entries.length; i++) {
      if (!this._entries[i].active) return i;
    }
    if (this._entries.length === 0) throw new Error('Particle pool has zero entries');
    // Native: `crt_rand() & 0x7f` (pool size is 0x80).
    return this._rng.rand({ caller: opts.caller ?? null }) % this._entries.length;
  }

  spawnParticle(opts: {
    pos: Vec2;
    angle: number;
    intensity?: number;
    owner?: OwnerRef;
  }): number {
    // Port of `fx_spawn_particle` (0x00420130).

    const intensity = opts.intensity ?? 1.0;
    const owner = opts.owner ?? OwnerRef.fromLocalPlayer(0);
    const idx = this._allocSlot({ caller: RngCallerStatic.FX_SPAWN_PARTICLE_ALLOC });
    const entry = this._entries[idx];
    entry.active = true;
    entry.renderFlag = true;
    entry.pos = opts.pos;
    entry.vel = Vec2.fromAngle(opts.angle).mul(90.0);
    entry.scaleX = 1.0;
    entry.scaleY = 1.0;
    entry.scaleZ = 1.0;
    entry.age = 0.0;
    entry.intensity = intensity;
    entry.angle = opts.angle;
    entry.spin = (this._rng.rand({ caller: RngCallerStatic.FX_SPAWN_PARTICLE_SPIN }) % 628) * 0.01;
    entry.styleId = ParticleStyleId.FLAMETHROWER;
    entry.targetId = -1;
    entry.owner = owner;
    return idx;
  }

  spawnParticleSlow(opts: {
    pos: Vec2;
    angle: number;
    owner?: OwnerRef;
  }): number {
    // Port of `fx_spawn_particle_slow` (0x00420240).

    const owner = opts.owner ?? OwnerRef.fromLocalPlayer(0);
    const idx = this._allocSlot({ caller: RngCallerStatic.FX_SPAWN_PARTICLE_SLOW_ALLOC });
    const entry = this._entries[idx];
    entry.active = true;
    entry.renderFlag = true;
    entry.pos = opts.pos;
    entry.vel = Vec2.fromAngle(opts.angle).mul(30.0);
    entry.scaleX = 1.0;
    entry.scaleY = 1.0;
    entry.scaleZ = 1.0;
    entry.age = 0.0;
    entry.intensity = 1.0;
    entry.angle = opts.angle;
    entry.spin = (this._rng.rand({ caller: RngCallerStatic.FX_SPAWN_PARTICLE_SLOW_SPIN }) % 628) * 0.01;
    entry.styleId = ParticleStyleId.BUBBLEGUN;
    entry.targetId = -1;
    entry.owner = owner;
    return idx;
  }

  iterActive(): Particle[] {
    return this._entries.filter((e) => e.active);
  }

  update(dt: number, opts?: {
    creatures?: CreatureState[] | null;
    applyCreatureDamage?: CreatureDamageApplier | null;
    killCreature?: CreatureKillHandler | null;
    fxQueue?: FxQueue | null;
    spriteEffects?: SpriteEffectPool | null;
  }): number[] {
    // Advance particles and deactivate expired entries.
    //
    // This is a minimal port of the particle loop inside `projectile_update`
    // (0x00420b90). It captures the per-style decay/movement rules that drive
    // visual lifetimes and the weapon-driven collision damage.
    //
    // Returns indices of particles that were deactivated this tick.

    const creatures = opts?.creatures ?? null;
    const killCreature = opts?.killCreature ?? null;
    const fxQueue = opts?.fxQueue ?? null;
    const spriteEffects = opts?.spriteEffects ?? null;
    if (dt <= 0.0) return [];
    dt = f32(dt);
    const damageApplier = (opts?.applyCreatureDamage ?? null) ?? this._creatureDamageApplier;

    const creatureFindInRadius = (opts: { pos: Vec2; radius: number }): number => {
      if (creatures === null) return -1;
      const maxIndex = Math.min(creatures.length, 0x180);
      const pos = opts.pos;
      const radius = f32(opts.radius);

      for (let ci = 0; ci < maxIndex; ci++) {
        const creature = creatures[ci];
        if (!creature.active) continue;
        // Native particle `creature_find_in_radius` is hitbox-gated, not
        // HP-gated: freshly killed creatures (hp<=0, hitbox>5) can still
        // receive same-tick style-0 damage callbacks.
        if (!creatureLifecycleIsCollidable(creature.lifecycleStage)) continue;

        const size = f32(creature.size);
        const dx = f32(creature.pos.x - pos.x);
        const dy = f32(creature.pos.y - pos.y);
        const distSq = f32(f32(dx * dx) + f32(dy * dy));
        const dist = f32(f32(Math.sqrt(distSq)) - radius);
        const threshold = f32(f32(size * 0.14285715) + 3.0);
        if (threshold < dist) continue;
        return ci;
      }
      return -1;
    };

    const expired: number[] = [];
    const rng = this._rng;

    for (let idx = 0; idx < this._entries.length; idx++) {
      const entry = this._entries[idx];
      if (!entry.active) continue;

      const style = int(entry.styleId) & 0xff;

      if (style === ParticleStyleId.BUBBLEGUN) {
        entry.intensity = f32(entry.intensity - dt * 0.11);
        entry.spin = f32(entry.spin + dt * 5.0);
        let moveScale = entry.intensity;
        if (moveScale <= 0.15) moveScale *= 0.55;
        const move = entry.vel.mul(dt * moveScale);
        entry.pos = new Vec2(f32(entry.pos.x + move.x), f32(entry.pos.y + move.y));
      } else {
        entry.intensity = f32(entry.intensity - dt * 0.9);
        entry.spin = f32(entry.spin + dt);
        const moveScale = Math.max(entry.intensity, 0.15) * 2.5;
        const move = entry.vel.mul(dt * moveScale);
        entry.pos = new Vec2(f32(entry.pos.x + move.x), f32(entry.pos.y + move.y));
      }

      const alive = entry.intensity > (style === ParticleStyleId.FLAMETHROWER ? 0.0 : 0.8);
      if (!alive) {
        entry.active = false;
        expired.push(idx);
        if (style === ParticleStyleId.BUBBLEGUN && entry.targetId !== -1) {
          const targetId = int(entry.targetId);
          entry.targetId = -1;
          if (killCreature !== null) {
            killCreature(targetId, entry.owner);
          } else if (creatures !== null && targetId >= 0 && targetId < creatures.length) {
            creatures[targetId].hp = -1.0;
            creatures[targetId].active = false;
          }
        }
        continue;
      }

      if (entry.renderFlag) {
        // Random walk drift (native adjusts angle based on `crt_rand`).
        let jitterCaller: number = RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_JITTER_ALT;
        if (style === ParticleStyleId.FLAMETHROWER) {
          jitterCaller = RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_JITTER_FLAMETHROWER;
        } else if (style === ParticleStyleId.BUBBLEGUN) {
          jitterCaller = RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_JITTER_BUBBLEGUN;
        }
        let jitter = f32(
          (rng.rand({ caller: jitterCaller }) % 100 - 50) * 0.06 * Math.max(entry.intensity, 0.0) * dt,
        );
        let speed: number;
        if (style === ParticleStyleId.FLAMETHROWER) {
          jitter = f32(jitter * 1.96);
          speed = 82.0;
        } else if (style === ParticleStyleId.BUBBLEGUN) {
          jitter = f32(jitter * 1.1);
          speed = 62.0;
        } else {
          jitter = f32(jitter * 1.1);
          speed = 82.0;
        }
        entry.angle = f32(entry.angle - jitter);
        const vel = Vec2.fromAngle(entry.angle).mul(speed);
        entry.vel = new Vec2(f32(vel.x), f32(vel.y));
      }

      const alpha = clamp(entry.intensity, 0.0, 1.0);
      const shade = 1.0 - Math.max(entry.intensity, 0.0) * 0.95;
      entry.age = alpha;
      entry.scaleX = shade;
      entry.scaleY = shade;
      // Native only updates scale_x/scale_y; scale_z stays at its spawn value (1.0).

      if (
        style === ParticleStyleId.BUBBLEGUN &&
        !entry.renderFlag &&
        entry.targetId !== -1 &&
        creatures !== null
      ) {
        const targetId = int(entry.targetId);
        if (targetId >= 0 && targetId < creatures.length && creatures[targetId].active) {
          entry.pos = creatures[targetId].pos;
        }
      }

      if (entry.renderFlag && creatures !== null) {
        const hitIdx = creatureFindInRadius({ pos: entry.pos, radius: Math.max(entry.intensity, 0.0) * 8.0 });
        if (hitIdx !== -1) {
          entry.renderFlag = false;
          const creature = creatures[hitIdx];
          if (style === ParticleStyleId.BUBBLEGUN) {
            entry.targetId = int(hitIdx);
            entry.pos = creature.pos;
            entry.vel = new Vec2();
          } else {
            const tau = Math.PI * 2;
            entry.angle = ((entry.angle % tau) + tau) % tau;
            let hitAngle = new Vec2(
              entry.pos.x - entry.vel.x * dt - creature.pos.x,
              entry.pos.y - entry.vel.y * dt - creature.pos.y,
            ).toAngle();
            hitAngle = ((hitAngle % tau) + tau) % tau;
            const deflectStep = tau * 0.2;
            if (entry.angle <= hitAngle) {
              entry.angle = f32(entry.angle + deflectStep);
            } else {
              entry.angle = f32(entry.angle - deflectStep);
            }

            const bounceVelocity = Vec2.fromAngle(entry.angle).mul(82.0);
            const speedScale = f32(
              (rng.rand({ caller: RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_BOUNCE_SPEED_SCALE }) % 10) * 0.1,
            );
            entry.vel = new Vec2(
              f32(bounceVelocity.x * speedScale),
              f32(bounceVelocity.y * speedScale),
            );

            const damage = Math.max(0.0, entry.intensity * 10.0);
            if (damage > 0.0) {
              if (damageApplier !== null) {
                damageApplier(int(hitIdx), damage, 4, new Vec2(), entry.owner);
              } else {
                creature.hp -= damage;
              }
            }

            const tint = creature.tint;
            const tintSum = tint.r + tint.g + tint.b;
            if (tintSum > 1.6) {
              const factor = 1.0 - entry.intensity * 0.01;
              creature.tint = tint.scaled(factor).clamped();
            }

            if (spriteEffects !== null && idx % 3 === 0) {
              const spriteVel = new Vec2(
                rng.rand({ caller: RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_SPRITE_VEL_X }) % 60 - 30,
                rng.rand({ caller: RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_SPRITE_VEL_Y }) % 60 - 30,
              );
              spriteEffects.spawn({ pos: creature.pos, vel: spriteVel, scale: 13.0, color: new RGBA(1.0, 1.0, 1.0, 0.7) });
            }

            if (fxQueue !== null) {
              fxQueue.addRandom({ pos: creature.pos, rng });
            }

            creature.pos = new Vec2(
              f32(creature.pos.x + entry.vel.x * dt),
              f32(creature.pos.y + entry.vel.y * dt),
            );
          }
        }
      }
    }

    return expired;
  }
}

export class SpriteEffect {
  active: boolean;
  color: RGBA;
  rotation: number;
  pos: Vec2;
  vel: Vec2;
  scale: number;

  constructor(opts: {
    active?: boolean;
    color?: RGBA;
    rotation?: number;
    pos?: Vec2;
    vel?: Vec2;
    scale?: number;
  } = {}) {
    this.active = opts.active ?? false;
    this.color = opts.color ?? new RGBA(1.0, 1.0, 1.0, 0.0);
    this.rotation = opts.rotation ?? 0.0;
    this.pos = opts.pos ?? new Vec2();
    this.vel = opts.vel ?? new Vec2();
    this.scale = opts.scale ?? 1.0;
  }
}

export class SpriteEffectPool {
  private _entries: SpriteEffect[];
  private _rng: CrandLike;

  constructor(opts: { size?: number; rng?: CrandLike | null } = {}) {
    const size = Math.max(0, int(opts.size ?? SPRITE_EFFECT_POOL_SIZE));
    this._entries = Array.from({ length: size }, () => new SpriteEffect());
    this._rng = opts.rng ?? new Crand(0);
  }

  get entries(): SpriteEffect[] {
    return this._entries;
  }

  reset(): void {
    for (const entry of this._entries) entry.active = false;
  }

  spawn(opts: {
    pos: Vec2;
    vel: Vec2;
    scale?: number;
    color?: RGBA | null;
  }): number {
    // Port of `fx_spawn_sprite` (0x0041fbb0).

    const scale = opts.scale ?? 1.0;
    const color = opts.color ?? null;
    let idx: number | null = null;
    for (let i = 0; i < this._entries.length; i++) {
      if (!this._entries[i].active) {
        idx = i;
        break;
      }
    }
    if (idx === null) {
      if (this._entries.length === 0) throw new Error('Sprite effect pool has zero entries');
      idx = this._rng.rand({ caller: RngCallerStatic.FX_SPAWN_SPRITE_ALLOC }) % this._entries.length;
    }

    const entry = this._entries[idx];
    entry.active = true;
    entry.color = color ?? new RGBA();
    entry.rotation = (this._rng.rand({ caller: RngCallerStatic.FX_SPAWN_SPRITE_ROTATION }) % 628) * 0.01;
    entry.pos = opts.pos;
    entry.vel = opts.vel;
    entry.scale = scale;
    return idx;
  }

  iterActive(): SpriteEffect[] {
    return this._entries.filter((e) => e.active);
  }

  update(dt: number): number[] {
    if (dt <= 0.0) return [];

    const expired: number[] = [];
    for (let idx = 0; idx < this._entries.length; idx++) {
      const entry = this._entries[idx];
      if (!entry.active) continue;
      entry.pos = entry.pos.add(entry.vel.mul(dt));
      entry.rotation += dt * 3.0;
      entry.color = entry.color.withAlpha(entry.color.a - dt);
      entry.scale += dt * 60.0;
      if (entry.color.a <= 0.0) {
        entry.active = false;
        expired.push(idx);
      }
    }
    return expired;
  }
}

export class FxQueueEntry {
  effectId: number;
  rotation: number;
  pos: Vec2;
  height: number;
  width: number;
  color: RGBA;

  constructor(opts: {
    effectId?: number;
    rotation?: number;
    pos?: Vec2;
    height?: number;
    width?: number;
    color?: RGBA;
  } = {}) {
    this.effectId = opts.effectId ?? 0;
    this.rotation = opts.rotation ?? 0.0;
    this.pos = opts.pos ?? new Vec2();
    this.height = opts.height ?? 0.0;
    this.width = opts.width ?? 0.0;
    this.color = opts.color ?? new RGBA();
  }
}

export class FxQueue {
  // Per-frame terrain decal queue (`fx_queue` / `fx_queue_add`).

  private _entries: FxQueueEntry[];
  private _count = 0;
  private _maxCount: number;
  violenceDisabled: number;

  constructor(opts: { capacity?: number; maxCount?: number } = {}) {
    let capacity = opts.capacity ?? FX_QUEUE_CAPACITY;
    let maxCount = opts.maxCount ?? FX_QUEUE_MAX_COUNT;
    capacity = Math.max(0, int(capacity));
    maxCount = Math.max(0, Math.min(int(maxCount), capacity));
    this._entries = Array.from({ length: capacity }, () => new FxQueueEntry());
    this._maxCount = maxCount;
    // Mirrors native `config_violence_disabled` gate in `fx_queue_add_random`.
    // Nonzero suppresses violence-linked random decals.
    this.violenceDisabled = 0;
  }

  get entries(): FxQueueEntry[] {
    return this._entries;
  }

  get count(): number {
    return this._count;
  }

  clear(): void {
    this._count = 0;
  }

  iterActive(): FxQueueEntry[] {
    return this._entries.slice(0, this._count);
  }

  add(opts: {
    effectId: number;
    pos: Vec2;
    width: number;
    height: number;
    rotation: number;
    rgba: RGBA;
  }): boolean {
    // Port of `fx_queue_add` (0x0041e840).

    if (this._count >= this._maxCount) return false;

    const entry = this._entries[this._count];
    entry.effectId = int(opts.effectId);
    entry.rotation = opts.rotation;
    entry.pos = opts.pos;
    entry.height = opts.height;
    entry.width = opts.width;
    entry.color = opts.rgba;
    this._count++;
    return true;
  }

  addRandom(opts: { pos: Vec2; rng: CrandLike }): boolean {
    // Port of `fx_queue_add_random` (effect ids 3..7 with grayscale tint).

    if (int(this.violenceDisabled) !== 0) return false;
    // Native `fx_queue_add_random` always consumes RNG even when the queue is
    // full, then lets `fx_queue_add` fail silently.
    const gray = (opts.rng.rand({ caller: RngCallerStatic.FX_QUEUE_ADD_RANDOM_GRAY }) & 0xf) * 0.01 + 0.84;
    const w = (opts.rng.rand({ caller: RngCallerStatic.FX_QUEUE_ADD_RANDOM_WIDTH }) % 24 - 12) + 30.0;
    const rotation = (opts.rng.rand({ caller: RngCallerStatic.FX_QUEUE_ADD_RANDOM_ROTATION }) % 628) * 0.01;
    const effectId = (opts.rng.rand({ caller: RngCallerStatic.FX_QUEUE_ADD_RANDOM_EFFECT_ID }) % 5) + 3;
    return this.add({ effectId, pos: opts.pos, width: w, height: w, rotation, rgba: new RGBA(gray, gray, gray, 1.0) });
  }
}

export class FxQueueRotatedEntry {
  topLeft: Vec2;
  color: RGBA;
  rotation: number;
  scale: number;
  creatureTypeId: number;

  constructor(opts: {
    topLeft?: Vec2;
    color?: RGBA;
    rotation?: number;
    scale?: number;
    creatureTypeId?: number;
  } = {}) {
    this.topLeft = opts.topLeft ?? new Vec2();
    this.color = opts.color ?? new RGBA();
    this.rotation = opts.rotation ?? 0.0;
    this.scale = opts.scale ?? 1.0;
    this.creatureTypeId = opts.creatureTypeId ?? 0;
  }
}

export class FxQueueRotated {
  // Rotated corpse queue (`fx_queue_rotated` / `fx_queue_add_rotated`).

  private _entries: FxQueueRotatedEntry[];
  private _count = 0;
  private _maxCount: number;

  constructor(opts: { capacity?: number; maxCount?: number } = {}) {
    let capacity = opts.capacity ?? FX_QUEUE_ROTATED_CAPACITY;
    let maxCount = opts.maxCount ?? FX_QUEUE_ROTATED_MAX_COUNT;
    capacity = Math.max(0, int(capacity));
    maxCount = Math.max(0, Math.min(int(maxCount), capacity));
    this._entries = Array.from({ length: capacity }, () => new FxQueueRotatedEntry());
    this._maxCount = maxCount;
  }

  get entries(): FxQueueRotatedEntry[] {
    return this._entries;
  }

  get count(): number {
    return this._count;
  }

  clear(): void {
    this._count = 0;
  }

  iterActive(): FxQueueRotatedEntry[] {
    return this._entries.slice(0, this._count);
  }

  add(opts: {
    topLeft: Vec2;
    rgba: RGBA;
    rotation: number;
    scale: number;
    creatureTypeId: number;
    terrainBodiesTransparency?: number;
    terrainTextureFailed?: boolean;
  }): boolean {
    // Port of `fx_queue_add_rotated` (0x00427840).

    const terrainBodiesTransparency = opts.terrainBodiesTransparency ?? 0.0;
    const terrainTextureFailed = opts.terrainTextureFailed ?? false;
    if (terrainTextureFailed) return false;
    if (this._count >= this._maxCount) return false;

    let a = opts.rgba.a;
    if (terrainBodiesTransparency !== 0.0) {
      a = a / terrainBodiesTransparency;
    } else {
      a = a * 0.8;
    }

    const entry = this._entries[this._count];
    entry.topLeft = opts.topLeft;
    entry.color = opts.rgba.withAlpha(a);
    entry.rotation = opts.rotation;
    entry.scale = opts.scale;
    entry.creatureTypeId = int(opts.creatureTypeId);

    this._count++;
    return true;
  }
}

export class EffectEntry {
  pos: Vec2;
  effectId: number;
  vel: Vec2;
  rotation: number;
  scale: number;
  halfWidth: number;
  halfHeight: number;
  age: number;
  lifetime: number;
  flags: number;
  color: RGBA;
  rotationStep: number;
  scaleStep: number;

  constructor(opts: {
    pos?: Vec2;
    effectId?: number;
    vel?: Vec2;
    rotation?: number;
    scale?: number;
    halfWidth?: number;
    halfHeight?: number;
    age?: number;
    lifetime?: number;
    flags?: number;
    color?: RGBA;
    rotationStep?: number;
    scaleStep?: number;
  } = {}) {
    this.pos = opts.pos ?? new Vec2();
    this.effectId = opts.effectId ?? 0;
    this.vel = opts.vel ?? new Vec2();
    this.rotation = opts.rotation ?? 0.0;
    this.scale = opts.scale ?? 1.0;
    this.halfWidth = opts.halfWidth ?? 0.0;
    this.halfHeight = opts.halfHeight ?? 0.0;
    this.age = opts.age ?? 0.0;
    this.lifetime = opts.lifetime ?? 0.0;
    this.flags = opts.flags ?? 0;
    this.color = opts.color ?? new RGBA();
    this.rotationStep = opts.rotationStep ?? 0.0;
    this.scaleStep = opts.scaleStep ?? 0.0;
  }
}

export class EffectPool {
  // Effect pool (`effect_spawn`, `effects_update`).
  //
  // This pool renders transient particle quads and can optionally enqueue decals
  // into `FxQueue` on expiry (flags bit `0x80`).

  private _entries: EffectEntry[];
  private _free: number[];
  private _detailToggle = 0;
  private _overwriteCursor = 0;

  constructor(opts: { size?: number } = {}) {
    let size = opts.size ?? EFFECT_POOL_SIZE;
    size = Math.max(0, int(size));
    this._entries = Array.from({ length: size }, () => new EffectEntry());
    this._free = [];
    for (let i = size - 1; i >= 0; i--) this._free.push(i);
  }

  get entries(): EffectEntry[] {
    return this._entries;
  }

  reset(): void {
    for (const entry of this._entries) entry.flags = 0;
    this._free = [];
    for (let i = this._entries.length - 1; i >= 0; i--) this._free.push(i);
    this._detailToggle = 0;
    this._overwriteCursor = 0;
  }

  iterActive(): EffectEntry[] {
    return this._entries.filter((e) => e.flags !== 0);
  }

  private _allocSlot(opts: { detailPreset: number }): number | null {
    // Native: if detail_preset < 3, skip every other spawn attempt.
    const detailPreset = int(opts.detailPreset);
    if (detailPreset < 3) {
      const skip = this._detailToggle & 1;
      this._detailToggle++;
      if (skip) return null;
    }

    if (this._free.length > 0) return this._free.pop()!;

    if (this._entries.length === 0) return null;

    const idx = this._overwriteCursor % this._entries.length;
    this._overwriteCursor = idx + 1;
    return idx;
  }

  spawn(opts: {
    effectId: number;
    pos: Vec2;
    vel: Vec2;
    rotation: number;
    scale: number;
    halfWidth: number;
    halfHeight: number;
    age: number;
    lifetime: number;
    flags: number;
    color: RGBA;
    rotationStep: number;
    scaleStep: number;
    detailPreset: number;
  }): number | null {
    const idx = this._allocSlot({ detailPreset: int(opts.detailPreset) });
    if (idx === null) return null;

    const entry = this._entries[idx];
    entry.pos = opts.pos;
    entry.effectId = int(opts.effectId);
    entry.vel = opts.vel;
    entry.rotation = opts.rotation;
    entry.scale = opts.scale;
    entry.halfWidth = opts.halfWidth;
    entry.halfHeight = opts.halfHeight;
    entry.age = opts.age;
    entry.lifetime = opts.lifetime;
    entry.flags = int(opts.flags);
    entry.color = opts.color;
    entry.rotationStep = opts.rotationStep;
    entry.scaleStep = opts.scaleStep;
    return idx;
  }

  free(idx: number): void {
    if (idx < 0 || idx >= this._entries.length) return;
    this._entries[idx].flags = 0;
    this._free.push(idx);
  }

  update(dt: number, opts?: { fxQueue?: FxQueue | null }): void {
    // Advance active effects and enqueue terrain decals on expiry.

    const fxQueue = opts?.fxQueue ?? null;
    if (dt <= 0.0) return;

    for (let idx = 0; idx < this._entries.length; idx++) {
      const entry = this._entries[idx];
      const flags = int(entry.flags);
      if (!flags) continue;

      const age = entry.age + dt;
      entry.age = age;
      const lifetime = entry.lifetime;

      if (age < lifetime) {
        if (age >= 0.0) {
          entry.pos = entry.pos.add(entry.vel.mul(dt));
          if (flags & 0x4) entry.rotation += entry.rotationStep * dt;
          if (flags & 0x8) entry.scale += entry.scaleStep * dt;
          if (flags & 0x10) {
            const nextAlpha = lifetime > 1e-9 ? 1.0 - age / lifetime : 0.0;
            entry.color = entry.color.withAlpha(nextAlpha);
          }
        }
        continue;
      }

      if (fxQueue !== null && (flags & 0x80)) {
        // On expiry, the native code overrides alpha before queuing.
        const alpha = (flags & 0x100) ? 0.35 : 0.8;
        fxQueue.add({
          effectId: int(entry.effectId),
          pos: entry.pos,
          width: entry.halfWidth * 2.0,
          height: entry.halfHeight * 2.0,
          rotation: entry.rotation,
          rgba: entry.color.withAlpha(alpha),
        });
      }

      this.free(idx);
    }
  }

  spawnShellCasing(opts: {
    pos: Vec2;
    aimHeading: number;
    draws: [number, number, number, number];
    detailPreset: number;
  }): void {
    // Port of the casing spawn in native gameplay fire (`effect_id 0x12`).

    const [angleDraw, speedDraw, rotationDraw, rotationStepDraw] = opts.draws;

    const angle = opts.aimHeading + (int(angleDraw) & 0x3f) * 0.01;
    const speed = (int(speedDraw) & 0x3f) * 0.022727273 + 1.0;
    const velocity = Vec2.fromAngle(angle).mul(speed * 100.0);

    const rotation = ((int(rotationDraw) & 0x3f) - 0x20) * 0.1;
    const rotationStep = ((int(rotationStepDraw) % 20) * 0.1 - 1.0) * 14.0;

    this.spawn({
      effectId: EffectId.CASING, pos: opts.pos, vel: velocity, rotation, scale: 1.0,
      halfWidth: 2.0, halfHeight: 2.0, age: 0.0, lifetime: 0.15, flags: 0x1c5,
      color: new RGBA(1.0, 1.0, 1.0, 0.6), rotationStep, scaleStep: 0.0, detailPreset: int(opts.detailPreset),
    });
  }

  spawnBloodSplatter(opts: {
    pos: Vec2;
    angle: number;
    age: number;
    rng: CrandLike;
    detailPreset: number;
    violenceDisabled: number;
  }): void {
    // Port of `effect_spawn_blood_splatter` (0x0042eb10).

    if (int(opts.violenceDisabled) !== 0) return;

    const lifetime = 0.25 - opts.age;
    const base = opts.angle + Math.PI;
    const direction = Vec2.fromAngle(base);

    for (let i = 0; i < 2; i++) {
      const r0 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_ROTATION });
      const rotation = ((r0 & 0x3f) - 0x20) * 0.1 + base;
      const r1 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_HALF });
      const half = (r1 & 7) + 1;
      const r2 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_SPEED_X });
      const speedX = (r2 & 0x3f) + 100;
      const r3 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_SPEED_Y });
      const speedY = (r3 & 0x3f) + 100;
      const velocity = new Vec2(direction.x * speedX, direction.y * speedY);
      const r4 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_SCALE_STEP });
      const scaleStep = (r4 & 0x7f) * 0.03 + 0.1;

      this.spawn({
        effectId: EffectId.BLOOD_SPLATTER, pos: opts.pos, vel: velocity, rotation, scale: 1.0,
        halfWidth: half, halfHeight: half, age: opts.age, lifetime, flags: 0xc9,
        color: new RGBA(1.0, 1.0, 1.0, 0.5), rotationStep: 0.0, scaleStep, detailPreset: int(opts.detailPreset),
      });
    }
  }

  spawnBurst(opts: {
    pos: Vec2;
    count: number;
    rng: CrandLike;
    detailPreset: number;
    lifetime?: number;
    scaleStep?: number | null;
    color?: RGBA;
  }): void {
    // Port of `effect_spawn_burst` (0x0042ef60).

    const lifetime = opts.lifetime ?? 0.5;
    const scaleStep = opts.scaleStep ?? null;
    const color = opts.color ?? new RGBA(0.4, 0.5, 1.0, 0.5);
    const count = Math.max(0, int(opts.count));
    for (let i = 0; i < count; i++) {
      const r0 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BURST_ROTATION });
      const r1 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BURST_VEL_X });
      const r2 = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BURST_VEL_Y });
      let sampledScaleStep: number | null = null;
      if (scaleStep === null) {
        sampledScaleStep = opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_BURST_SCALE_STEP });
      }

      this.spawnBurstParticle({
        pos: opts.pos, rotationDraw: r0, velXDraw: r1, velYDraw: r2, scaleStepDraw: sampledScaleStep, scaleStep, lifetime, color, detailPreset: int(opts.detailPreset),
      });
    }
  }

  spawnBurstParticle(opts: {
    pos: Vec2;
    rotationDraw: number;
    velXDraw: number;
    velYDraw: number;
    scaleStepDraw?: number | null;
    scaleStep?: number | null;
    lifetime?: number;
    color?: RGBA;
    detailPreset: number;
  }): void {
    const scaleStepDraw = opts.scaleStepDraw ?? null;
    const scaleStep = opts.scaleStep ?? null;
    const lifetime = opts.lifetime ?? 0.5;
    const color = opts.color ?? new RGBA(0.4, 0.5, 1.0, 0.5);
    const rotation = (int(opts.rotationDraw) & 0x7f) * 0.049087387;
    const velocity = new Vec2(
      (int(opts.velXDraw) & 0x7f) - 0x40,
      (int(opts.velYDraw) & 0x7f) - 0x40,
    );
    let step: number;
    if (scaleStep === null) {
      step = (int(scaleStepDraw!) % 100) * 0.01 + 0.1;
    } else {
      step = scaleStep;
    }

    this.spawn({
      effectId: EffectId.BURST, pos: opts.pos, vel: velocity, rotation, scale: 1.0,
      halfWidth: 32.0, halfHeight: 32.0, age: 0.0, lifetime, flags: 0x1d,
      color, rotationStep: 0.0, scaleStep: step, detailPreset: int(opts.detailPreset),
    });
  }

  spawnRing(opts: {
    pos: Vec2;
    detailPreset: number;
    color: RGBA;
    lifetime?: number;
    scaleStep?: number;
  }): void {
    // Ring/halo burst used by bonus pickup effects (`bonus_apply`).

    const lifetime = opts.lifetime ?? 0.25;
    const scaleStep = opts.scaleStep ?? 50.0;
    this.spawn({
      effectId: EffectId.RING, pos: opts.pos, vel: new Vec2(), rotation: 0.0, scale: 1.0,
      halfWidth: 32.0, halfHeight: 32.0, age: 0.0, lifetime, flags: 0x19,
      color: opts.color, rotationStep: 0.0, scaleStep, detailPreset: int(opts.detailPreset),
    });
  }

  spawnFreezeShard(opts: {
    pos: Vec2;
    angle: number;
    rng: CrandLike;
    detailPreset: number;
  }): void {
    // Port of `effect_spawn_freeze_shard` (0x0042ec80).

    const lifetime = (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_LIFETIME }) & 0xf) * 0.01 + 0.2;
    const base = opts.angle + Math.PI;

    const rotation = (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_ROTATION }) % 100) * 0.01 + base;
    const half = (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_HALF }) % 5) + 7;

    const velocity = Vec2.fromAngle(base).mul(114.0);

    const rotationStep = ((opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_ROTATION_STEP }) % 20) * 0.1 - 1.0) * 4.0;
    const scaleStep = -(opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_SCALE_STEP }) & 0xf) * 0.1;

    const effectId = (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_EFFECT_ID }) % 3) + 8;
    this.spawn({
      effectId, pos: opts.pos, vel: velocity, rotation, scale: 1.0,
      halfWidth: half, halfHeight: half, age: 0.0, lifetime, flags: 0x1cd,
      color: new RGBA(1.0, 1.0, 1.0, 0.5), rotationStep, scaleStep, detailPreset: int(opts.detailPreset),
    });
  }

  spawnFreezeShatter(opts: {
    pos: Vec2;
    angle: number;
    rng: CrandLike;
    detailPreset: number;
  }): void {
    // Port of `effect_spawn_freeze_shatter` (0x0042ee00).

    const lifetime = 1.1;
    for (let i = 0; i < 4; i++) {
      const rotation = i * (Math.PI / 2.0) + opts.angle;
      const velocity = Vec2.fromAngle(rotation).mul(42.0);
      const half = (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHATTER_HALF }) % 10) + 18;
      const rotationStep = ((opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHATTER_ROTATION_STEP }) % 20) * 0.1 - 1.0) * 1.9;

      this.spawn({
        effectId: EffectId.FREEZE_SHATTER, pos: opts.pos, vel: velocity, rotation, scale: 1.0,
        halfWidth: half, halfHeight: half, age: 0.0, lifetime, flags: 0x5d,
        color: new RGBA(1.0, 1.0, 1.0, 0.5), rotationStep, scaleStep: 0.0, detailPreset: int(opts.detailPreset),
      });
    }

    for (let i = 0; i < 4; i++) {
      const shardAngle = (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_FREEZE_SHATTER_SHARD_ANGLE }) % 612) * 0.01;
      this.spawnFreezeShard({ pos: opts.pos, angle: shardAngle, rng: opts.rng, detailPreset: int(opts.detailPreset) });
    }
  }

  spawnExplosionBurst(opts: {
    pos: Vec2;
    scale: number;
    rng: CrandLike;
    detailPreset: number;
  }): void {
    // Port of `effect_spawn_explosion_burst` (0x0042f6c0).

    const detailPreset = int(opts.detailPreset);
    const scale = opts.scale;

    // Shockwave ring.
    this.spawn({
      effectId: EffectId.RING, pos: opts.pos, vel: new Vec2(), rotation: 0.0, scale: 1.0,
      halfWidth: 32.0, halfHeight: 32.0, age: -0.1, lifetime: 0.35, flags: 0x19,
      color: new RGBA(0.6, 0.6, 0.6, 1.0), rotationStep: 0.0, scaleStep: scale * 25.0, detailPreset,
    });

    // Dark explosion puffs (high detail only).
    if (detailPreset > 3) {
      for (let i = 0; i < 2; i++) {
        const puffAge = i * 0.2 - 0.5;
        const puffLifetime = i * 0.2 + 0.6;
        const puffRotation =
          (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_PUFF_ROTATION }) % 614) * 0.02;
        this.spawn({
          effectId: EffectId.EXPLOSION_PUFF, pos: opts.pos, vel: new Vec2(), rotation: puffRotation, scale: 1.0,
          halfWidth: 32.0, halfHeight: 32.0, age: puffAge, lifetime: puffLifetime, flags: 0x5d,
          color: new RGBA(0.1, 0.1, 0.1, 1.0), rotationStep: 1.4, scaleStep: scale * 5.0, detailPreset,
        });
      }
    }

    // Bright flash.
    this.spawn({
      effectId: EffectId.BURST, pos: opts.pos, vel: new Vec2(), rotation: 0.0, scale: 1.0,
      halfWidth: 32.0, halfHeight: 32.0, age: 0.0, lifetime: 0.3, flags: 0x19,
      color: new RGBA(1.0, 1.0, 1.0, 1.0), rotationStep: 0.0, scaleStep: scale * 45.0, detailPreset,
    });

    let count: number;
    if (detailPreset < 2) {
      count = 1;
    } else {
      count = 3 + (detailPreset > 3 ? 1 : 0);
    }

    // Extra shockwave particles.
    for (let i = 0; i < count; i++) {
      const rotation =
        (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_ROTATION }) % 314) * 0.02;
      const velocity = new Vec2(
        (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_VEL_X }) & 0x3f) * 2 - 0x40,
        (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_VEL_Y }) & 0x3f) * 2 - 0x40,
      );
      const burstScaleStep =
        ((opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_SCALE_STEP }) - 3) & 7) * scale;
      const rotStep =
        (opts.rng.rand({ caller: RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_ROTATION_STEP }) + 3) & 7;
      this.spawn({
        effectId: EffectId.EXPLOSION_BURST, pos: opts.pos, vel: velocity, rotation, scale: 1.0,
        halfWidth: 32.0, halfHeight: 32.0, age: 0.0, lifetime: 0.7, flags: 0x1d,
        color: new RGBA(1.0, 1.0, 1.0, 1.0), rotationStep: rotStep, scaleStep: burstScaleStep, detailPreset,
      });
    }
  }
}
