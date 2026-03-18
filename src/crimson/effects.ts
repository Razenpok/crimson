// Port of crimson/effects.py — particle, sprite effect, and effect pools + FX queues

import { RGBA } from '../grim/color.ts';
import { Vec2 } from '../grim/geom.ts';
import { clamp } from '../grim/math.ts';
import type { CallerStatic, CrandLike } from '../grim/rand.ts';
import { Crand } from '../grim/rand.ts';
import { creatureLifecycleIsCollidable } from './creatures/lifecycle.ts';
import { EffectId } from './effects-atlas.ts';
import { f32 } from './math-parity.ts';
import { OwnerRef } from './owner-ref.ts';
import type { CreatureDamageApplier } from './projectiles/types.ts';
import { RngCallerStatic } from './rng-caller-static.ts';

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

// Minimal creature interface for particle collision — full type in creatures/runtime.ts
export interface CreatureStateLike {
  active: boolean;
  pos: Vec2;
  size: number;
  hp: number;
  lifecycleStage: number;
  tint: RGBA;
  flags: number;
  plagueInfected: boolean;
}

// --- Particle ---

export class Particle {
  active = false;
  renderFlag = false;
  pos = new Vec2();
  vel = new Vec2();
  scaleX = 1.0;
  scaleY = 1.0;
  scaleZ = 1.0;
  age = 0.0;
  intensity = 0.0;
  angle = 0.0;
  spin = 0.0;
  styleId: ParticleStyleId = ParticleStyleId.FLAMETHROWER;
  targetId = -1;
  owner: OwnerRef = OwnerRef.fromLocalPlayer(0);
}

export class ParticlePool {
  private _entries: Particle[];
  private _rng: CrandLike;
  private _creatureDamageApplier: CreatureDamageApplier | null;

  constructor(
    size: number = PARTICLE_POOL_SIZE,
    rng: CrandLike | null = null,
    creatureDamageApplier: CreatureDamageApplier | null = null,
  ) {
    this._entries = Array.from({ length: size }, () => new Particle());
    this._rng = rng ?? new Crand(0);
    this._creatureDamageApplier = creatureDamageApplier;
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

  private _allocSlot(caller: CallerStatic = null): number {
    for (let i = 0; i < this._entries.length; i++) {
      if (!this._entries[i].active) return i;
    }
    if (this._entries.length === 0) throw new Error('Particle pool has zero entries');
    return this._rng.rand(caller) % this._entries.length;
  }

  spawnParticle(
    pos: Vec2,
    angle: number,
    intensity = 1.0,
    owner: OwnerRef = OwnerRef.fromLocalPlayer(0),
  ): number {
    const idx = this._allocSlot(RngCallerStatic.FX_SPAWN_PARTICLE_ALLOC);
    const entry = this._entries[idx];
    entry.active = true;
    entry.renderFlag = true;
    entry.pos = pos;
    entry.vel = Vec2.fromAngle(angle).mul(90.0);
    entry.scaleX = 1.0;
    entry.scaleY = 1.0;
    entry.scaleZ = 1.0;
    entry.age = 0.0;
    entry.intensity = intensity;
    entry.angle = angle;
    entry.spin = (this._rng.rand(RngCallerStatic.FX_SPAWN_PARTICLE_SPIN) % 628) * 0.01;
    entry.styleId = ParticleStyleId.FLAMETHROWER;
    entry.targetId = -1;
    entry.owner = owner;
    return idx;
  }

  spawnParticleSlow(
    pos: Vec2,
    angle: number,
    owner: OwnerRef = OwnerRef.fromLocalPlayer(0),
  ): number {
    const idx = this._allocSlot(RngCallerStatic.FX_SPAWN_PARTICLE_SLOW_ALLOC);
    const entry = this._entries[idx];
    entry.active = true;
    entry.renderFlag = true;
    entry.pos = pos;
    entry.vel = Vec2.fromAngle(angle).mul(30.0);
    entry.scaleX = 1.0;
    entry.scaleY = 1.0;
    entry.scaleZ = 1.0;
    entry.age = 0.0;
    entry.intensity = 1.0;
    entry.angle = angle;
    entry.spin = (this._rng.rand(RngCallerStatic.FX_SPAWN_PARTICLE_SLOW_SPIN) % 628) * 0.01;
    entry.styleId = ParticleStyleId.BUBBLEGUN;
    entry.targetId = -1;
    entry.owner = owner;
    return idx;
  }

  iterActive(): Particle[] {
    return this._entries.filter((e) => e.active);
  }

  update(
    dt: number,
    creatures: CreatureStateLike[] | null = null,
    applyCreatureDamage: CreatureDamageApplier | null = null,
    killCreature: CreatureKillHandler | null = null,
    fxQueue: FxQueue | null = null,
    spriteEffects: SpriteEffectPool | null = null,
  ): number[] {
    if (dt <= 0.0) return [];
    dt = f32(dt);
    const damageApplier = applyCreatureDamage ?? this._creatureDamageApplier;

    const creatureFindInRadius = (pos: Vec2, radius: number): number => {
      if (creatures === null) return -1;
      const maxIndex = Math.min(creatures.length, 0x180);
      radius = f32(radius);

      for (let ci = 0; ci < maxIndex; ci++) {
        const creature = creatures[ci];
        if (!creature.active) continue;
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

      const style = (entry.styleId as number) & 0xff;

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
          const targetId = entry.targetId;
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
        let jitterCaller: number = RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_JITTER_ALT;
        if (style === ParticleStyleId.FLAMETHROWER) {
          jitterCaller = RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_JITTER_FLAMETHROWER;
        } else if (style === ParticleStyleId.BUBBLEGUN) {
          jitterCaller = RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_JITTER_BUBBLEGUN;
        }
        let jitter = f32(
          (rng.rand(jitterCaller) % 100 - 50) * 0.06 * Math.max(entry.intensity, 0.0) * dt,
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

      if (
        style === ParticleStyleId.BUBBLEGUN &&
        !entry.renderFlag &&
        entry.targetId !== -1 &&
        creatures !== null
      ) {
        const targetId = entry.targetId;
        if (targetId >= 0 && targetId < creatures.length && creatures[targetId].active) {
          entry.pos = creatures[targetId].pos;
        }
      }

      if (entry.renderFlag && creatures !== null) {
        const hitIdx = creatureFindInRadius(entry.pos, Math.max(entry.intensity, 0.0) * 8.0);
        if (hitIdx !== -1) {
          entry.renderFlag = false;
          const creature = creatures[hitIdx];
          if (style === ParticleStyleId.BUBBLEGUN) {
            entry.targetId = hitIdx;
            entry.pos = creature.pos;
            entry.vel = new Vec2();
          } else {
            entry.angle = entry.angle % (Math.PI * 2);
            const hitAngle = new Vec2(
              entry.pos.x - entry.vel.x * dt - creature.pos.x,
              entry.pos.y - entry.vel.y * dt - creature.pos.y,
            ).toAngle() % (Math.PI * 2);
            const deflectStep = Math.PI * 2 * 0.2;
            if (entry.angle <= hitAngle) {
              entry.angle = f32(entry.angle + deflectStep);
            } else {
              entry.angle = f32(entry.angle - deflectStep);
            }

            const bounceVelocity = Vec2.fromAngle(entry.angle).mul(82.0);
            const speedScale = f32(
              (rng.rand(RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_BOUNCE_SPEED_SCALE) % 10) * 0.1,
            );
            entry.vel = new Vec2(
              f32(bounceVelocity.x * speedScale),
              f32(bounceVelocity.y * speedScale),
            );

            const damage = Math.max(0.0, entry.intensity * 10.0);
            if (damage > 0.0) {
              if (damageApplier !== null) {
                damageApplier(hitIdx, damage, 4, new Vec2(), entry.owner);
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
                rng.rand(RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_SPRITE_VEL_X) % 60 - 30,
                rng.rand(RngCallerStatic.PROJECTILE_UPDATE_PARTICLE_SPRITE_VEL_Y) % 60 - 30,
              );
              spriteEffects.spawn(creature.pos, spriteVel, 13.0, new RGBA(1.0, 1.0, 1.0, 0.7));
            }

            if (fxQueue !== null) {
              fxQueue.addRandom(creature.pos, rng);
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

// --- SpriteEffect ---

export class SpriteEffect {
  active = false;
  color: RGBA = new RGBA(1.0, 1.0, 1.0, 0.0);
  rotation = 0.0;
  pos = new Vec2();
  vel = new Vec2();
  scale = 1.0;
}

export class SpriteEffectPool {
  private _entries: SpriteEffect[];
  private _rng: CrandLike;

  constructor(size: number = SPRITE_EFFECT_POOL_SIZE, rng: CrandLike | null = null) {
    this._entries = Array.from({ length: size }, () => new SpriteEffect());
    this._rng = rng ?? new Crand(0);
  }

  get entries(): SpriteEffect[] {
    return this._entries;
  }

  reset(): void {
    for (const entry of this._entries) entry.active = false;
  }

  spawn(
    pos: Vec2,
    vel: Vec2,
    scale = 1.0,
    color: RGBA | null = null,
  ): number {
    let idx: number | null = null;
    for (let i = 0; i < this._entries.length; i++) {
      if (!this._entries[i].active) {
        idx = i;
        break;
      }
    }
    if (idx === null) {
      if (this._entries.length === 0) throw new Error('Sprite effect pool has zero entries');
      idx = this._rng.rand(RngCallerStatic.FX_SPAWN_SPRITE_ALLOC) % this._entries.length;
    }

    const entry = this._entries[idx];
    entry.active = true;
    entry.color = color ?? new RGBA();
    entry.rotation = (this._rng.rand(RngCallerStatic.FX_SPAWN_SPRITE_ROTATION) % 628) * 0.01;
    entry.pos = pos;
    entry.vel = vel;
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

// --- FxQueue ---

export class FxQueueEntry {
  effectId = 0;
  rotation = 0.0;
  pos = new Vec2();
  height = 0.0;
  width = 0.0;
  color: RGBA = new RGBA();
}

export class FxQueue {
  private _entries: FxQueueEntry[];
  private _count = 0;
  private _maxCount: number;
  violenceDisabled = 0;

  constructor(capacity: number = FX_QUEUE_CAPACITY, maxCount: number = FX_QUEUE_MAX_COUNT) {
    capacity = Math.max(0, capacity);
    maxCount = Math.max(0, Math.min(maxCount, capacity));
    this._entries = Array.from({ length: capacity }, () => new FxQueueEntry());
    this._maxCount = maxCount;
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

  add(
    effectId: number,
    pos: Vec2,
    width: number,
    height: number,
    rotation: number,
    rgba: RGBA,
  ): boolean {
    if (this._count >= this._maxCount) return false;

    const entry = this._entries[this._count];
    entry.effectId = effectId;
    entry.rotation = rotation;
    entry.pos = pos;
    entry.height = height;
    entry.width = width;
    entry.color = rgba;
    this._count++;
    return true;
  }

  addRandom(pos: Vec2, rng: CrandLike): boolean {
    if (this.violenceDisabled !== 0) return false;
    const gray = (rng.rand(RngCallerStatic.FX_QUEUE_ADD_RANDOM_GRAY) & 0xf) * 0.01 + 0.84;
    const w = (rng.rand(RngCallerStatic.FX_QUEUE_ADD_RANDOM_WIDTH) % 24 - 12) + 30.0;
    const rotation = (rng.rand(RngCallerStatic.FX_QUEUE_ADD_RANDOM_ROTATION) % 628) * 0.01;
    const effectId = (rng.rand(RngCallerStatic.FX_QUEUE_ADD_RANDOM_EFFECT_ID) % 5) + 3;
    return this.add(effectId, pos, w, w, rotation, new RGBA(gray, gray, gray, 1.0));
  }
}

// --- FxQueueRotated ---

export class FxQueueRotatedEntry {
  topLeft = new Vec2();
  color: RGBA = new RGBA();
  rotation = 0.0;
  scale = 1.0;
  creatureTypeId = 0;
}

export class FxQueueRotated {
  private _entries: FxQueueRotatedEntry[];
  private _count = 0;
  private _maxCount: number;

  constructor(
    capacity: number = FX_QUEUE_ROTATED_CAPACITY,
    maxCount: number = FX_QUEUE_ROTATED_MAX_COUNT,
  ) {
    capacity = Math.max(0, capacity);
    maxCount = Math.max(0, Math.min(maxCount, capacity));
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

  add(
    topLeft: Vec2,
    rgba: RGBA,
    rotation: number,
    scale: number,
    creatureTypeId: number,
    terrainBodiesTransparency = 0.0,
    terrainTextureFailed = false,
  ): boolean {
    if (terrainTextureFailed) return false;
    if (this._count >= this._maxCount) return false;

    let a = rgba.a;
    if (terrainBodiesTransparency !== 0.0) {
      a = a / terrainBodiesTransparency;
    } else {
      a = a * 0.8;
    }

    const entry = this._entries[this._count];
    entry.topLeft = topLeft;
    entry.color = rgba.withAlpha(a);
    entry.rotation = rotation;
    entry.scale = scale;
    entry.creatureTypeId = creatureTypeId;

    this._count++;
    return true;
  }
}

// --- EffectEntry + EffectPool ---

export class EffectEntry {
  pos = new Vec2();
  effectId = 0;
  vel = new Vec2();
  rotation = 0.0;
  scale = 1.0;
  halfWidth = 0.0;
  halfHeight = 0.0;
  age = 0.0;
  lifetime = 0.0;
  flags = 0;
  color: RGBA = new RGBA();
  rotationStep = 0.0;
  scaleStep = 0.0;
}

export class EffectPool {
  private _entries: EffectEntry[];
  private _free: number[];
  private _detailToggle = 0;
  private _overwriteCursor = 0;

  constructor(size: number = EFFECT_POOL_SIZE) {
    size = Math.max(0, size);
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

  private _allocSlot(detailPreset: number): number | null {
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

  spawn(
    effectId: number,
    pos: Vec2,
    vel: Vec2,
    rotation: number,
    scale: number,
    halfWidth: number,
    halfHeight: number,
    age: number,
    lifetime: number,
    flags: number,
    color: RGBA,
    rotationStep: number,
    scaleStep: number,
    detailPreset: number,
  ): number | null {
    const idx = this._allocSlot(detailPreset);
    if (idx === null) return null;

    const entry = this._entries[idx];
    entry.pos = pos;
    entry.effectId = effectId;
    entry.vel = vel;
    entry.rotation = rotation;
    entry.scale = scale;
    entry.halfWidth = halfWidth;
    entry.halfHeight = halfHeight;
    entry.age = age;
    entry.lifetime = lifetime;
    entry.flags = flags;
    entry.color = color;
    entry.rotationStep = rotationStep;
    entry.scaleStep = scaleStep;
    return idx;
  }

  free(idx: number): void {
    if (idx < 0 || idx >= this._entries.length) return;
    this._entries[idx].flags = 0;
    this._free.push(idx);
  }

  update(dt: number, fxQueue: FxQueue | null = null): void {
    if (dt <= 0.0) return;

    for (let idx = 0; idx < this._entries.length; idx++) {
      const entry = this._entries[idx];
      const flags = entry.flags;
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
        const alpha = (flags & 0x100) ? 0.35 : 0.8;
        fxQueue.add(
          entry.effectId,
          entry.pos,
          entry.halfWidth * 2.0,
          entry.halfHeight * 2.0,
          entry.rotation,
          entry.color.withAlpha(alpha),
        );
      }

      this.free(idx);
    }
  }

  spawnShellCasing(
    pos: Vec2,
    aimHeading: number,
    draws: [number, number, number, number],
    detailPreset: number,
  ): void {
    const [angleDraw, speedDraw, rotationDraw, rotationStepDraw] = draws;

    const angle = aimHeading + (angleDraw & 0x3f) * 0.01;
    const speed = (speedDraw & 0x3f) * 0.022727273 + 1.0;
    const velocity = Vec2.fromAngle(angle).mul(speed * 100.0);

    const rotation = ((rotationDraw & 0x3f) - 0x20) * 0.1;
    const rotationStep = ((rotationStepDraw % 20) * 0.1 - 1.0) * 14.0;

    this.spawn(
      EffectId.CASING, pos, velocity, rotation, 1.0,
      2.0, 2.0, 0.0, 0.15, 0x1c5,
      new RGBA(1.0, 1.0, 1.0, 0.6), rotationStep, 0.0, detailPreset,
    );
  }

  spawnBloodSplatter(
    pos: Vec2,
    angle: number,
    age: number,
    rng: CrandLike,
    detailPreset: number,
    violenceDisabled: number,
  ): void {
    if (violenceDisabled !== 0) return;

    const lifetime = 0.25 - age;
    const base = angle + Math.PI;
    const direction = Vec2.fromAngle(base);

    for (let i = 0; i < 2; i++) {
      const r0 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_ROTATION);
      const rotation = ((r0 & 0x3f) - 0x20) * 0.1 + base;
      const r1 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_HALF);
      const half = (r1 & 7) + 1;
      const r2 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_SPEED_X);
      const speedX = (r2 & 0x3f) + 100;
      const r3 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_SPEED_Y);
      const speedY = (r3 & 0x3f) + 100;
      const velocity = new Vec2(direction.x * speedX, direction.y * speedY);
      const r4 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BLOOD_SPLATTER_SCALE_STEP);
      const scaleStep = (r4 & 0x7f) * 0.03 + 0.1;

      this.spawn(
        EffectId.BLOOD_SPLATTER, pos, velocity, rotation, 1.0,
        half, half, age, lifetime, 0xc9,
        new RGBA(1.0, 1.0, 1.0, 0.5), 0.0, scaleStep, detailPreset,
      );
    }
  }

  spawnBurst(
    pos: Vec2,
    count: number,
    rng: CrandLike,
    detailPreset: number,
    lifetime = 0.5,
    scaleStep: number | null = null,
    color: RGBA = new RGBA(0.4, 0.5, 1.0, 0.5),
  ): void {
    count = Math.max(0, count);
    for (let i = 0; i < count; i++) {
      const r0 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BURST_ROTATION);
      const r1 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BURST_VEL_X);
      const r2 = rng.rand(RngCallerStatic.EFFECT_SPAWN_BURST_VEL_Y);
      let sampledScaleStep: number | null = null;
      if (scaleStep === null) {
        sampledScaleStep = rng.rand(RngCallerStatic.EFFECT_SPAWN_BURST_SCALE_STEP);
      }

      this.spawnBurstParticle(
        pos, r0, r1, r2, sampledScaleStep, scaleStep, lifetime, color, detailPreset,
      );
    }
  }

  spawnBurstParticle(
    pos: Vec2,
    rotationDraw: number,
    velXDraw: number,
    velYDraw: number,
    scaleStepDraw: number | null = null,
    scaleStep: number | null = null,
    lifetime: number = 0.5,
    color: RGBA = new RGBA(0.4, 0.5, 1.0, 0.5),
    detailPreset: number = 5,
  ): void {
    const rotation = (rotationDraw & 0x7f) * 0.049087387;
    const velocity = new Vec2(
      (velXDraw & 0x7f) - 0x40,
      (velYDraw & 0x7f) - 0x40,
    );
    let step: number;
    if (scaleStep === null) {
      step = (scaleStepDraw! % 100) * 0.01 + 0.1;
    } else {
      step = scaleStep;
    }

    this.spawn(
      EffectId.BURST, pos, velocity, rotation, 1.0,
      32.0, 32.0, 0.0, lifetime, 0x1d,
      color, 0.0, step, detailPreset,
    );
  }

  spawnRing(
    pos: Vec2,
    detailPreset: number,
    color: RGBA,
    lifetime = 0.25,
    scaleStep = 50.0,
  ): void {
    this.spawn(
      EffectId.RING, pos, new Vec2(), 0.0, 1.0,
      32.0, 32.0, 0.0, lifetime, 0x19,
      color, 0.0, scaleStep, detailPreset,
    );
  }

  spawnFreezeShard(
    pos: Vec2,
    angle: number,
    rng: CrandLike,
    detailPreset: number,
  ): void {
    const lifetime = (rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_LIFETIME) & 0xf) * 0.01 + 0.2;
    const base = angle + Math.PI;

    const rotation = (rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_ROTATION) % 100) * 0.01 + base;
    const half = (rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_HALF) % 5) + 7;

    const velocity = Vec2.fromAngle(base).mul(114.0);

    const rotationStep = ((rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_ROTATION_STEP) % 20) * 0.1 - 1.0) * 4.0;
    const scaleStep = -(rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_SCALE_STEP) & 0xf) * 0.1;

    const effectId = (rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHARD_EFFECT_ID) % 3) + 8;
    this.spawn(
      effectId, pos, velocity, rotation, 1.0,
      half, half, 0.0, lifetime, 0x1cd,
      new RGBA(1.0, 1.0, 1.0, 0.5), rotationStep, scaleStep, detailPreset,
    );
  }

  spawnFreezeShatter(
    pos: Vec2,
    angle: number,
    rng: CrandLike,
    detailPreset: number,
  ): void {
    const lifetime = 1.1;
    for (let i = 0; i < 4; i++) {
      const rotation = i * (Math.PI / 2.0) + angle;
      const velocity = Vec2.fromAngle(rotation).mul(42.0);
      const half = (rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHATTER_HALF) % 10) + 18;
      const rotationStep = ((rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHATTER_ROTATION_STEP) % 20) * 0.1 - 1.0) * 1.9;

      this.spawn(
        EffectId.FREEZE_SHATTER, pos, velocity, rotation, 1.0,
        half, half, 0.0, lifetime, 0x5d,
        new RGBA(1.0, 1.0, 1.0, 0.5), rotationStep, 0.0, detailPreset,
      );
    }

    for (let i = 0; i < 4; i++) {
      const shardAngle = (rng.rand(RngCallerStatic.EFFECT_SPAWN_FREEZE_SHATTER_SHARD_ANGLE) % 612) * 0.01;
      this.spawnFreezeShard(pos, shardAngle, rng, detailPreset);
    }
  }

  spawnExplosionBurst(
    pos: Vec2,
    scale: number,
    rng: CrandLike,
    detailPreset: number,
  ): void {
    // Shockwave ring.
    this.spawn(
      EffectId.RING, pos, new Vec2(), 0.0, 1.0,
      32.0, 32.0, -0.1, 0.35, 0x19,
      new RGBA(0.6, 0.6, 0.6, 1.0), 0.0, scale * 25.0, detailPreset,
    );

    // Dark explosion puffs (high detail only).
    if (detailPreset > 3) {
      for (let i = 0; i < 2; i++) {
        const puffAge = i * 0.2 - 0.5;
        const puffLifetime = i * 0.2 + 0.6;
        const puffRotation =
          (rng.rand(RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_PUFF_ROTATION) % 614) * 0.02;
        this.spawn(
          EffectId.EXPLOSION_PUFF, pos, new Vec2(), puffRotation, 1.0,
          32.0, 32.0, puffAge, puffLifetime, 0x5d,
          new RGBA(0.1, 0.1, 0.1, 1.0), 1.4, scale * 5.0, detailPreset,
        );
      }
    }

    // Bright flash.
    this.spawn(
      EffectId.BURST, pos, new Vec2(), 0.0, 1.0,
      32.0, 32.0, 0.0, 0.3, 0x19,
      new RGBA(1.0, 1.0, 1.0, 1.0), 0.0, scale * 45.0, detailPreset,
    );

    let count: number;
    if (detailPreset < 2) {
      count = 1;
    } else {
      count = 3 + (detailPreset > 3 ? 1 : 0);
    }

    for (let i = 0; i < count; i++) {
      const rotation =
        (rng.rand(RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_ROTATION) % 314) * 0.02;
      const velocity = new Vec2(
        (rng.rand(RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_VEL_X) & 0x3f) * 2 - 0x40,
        (rng.rand(RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_VEL_Y) & 0x3f) * 2 - 0x40,
      );
      const burstScaleStep =
        ((rng.rand(RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_SCALE_STEP) - 3) & 7) * scale;
      const rotStep =
        (rng.rand(RngCallerStatic.EFFECT_SPAWN_EXPLOSION_BURST_ROTATION_STEP) + 3) & 7;
      this.spawn(
        EffectId.EXPLOSION_BURST, pos, velocity, rotation, 1.0,
        32.0, 32.0, 0.0, 0.7, 0x1d,
        new RGBA(1.0, 1.0, 1.0, 1.0), rotStep, burstScaleStep, detailPreset,
      );
    }
  }
}
