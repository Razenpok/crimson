// Port of grim/geom.py

import { clamp } from './math.ts';

export interface SupportsXY {
  x: number;
  y: number;
}

export class Vec2 {
  readonly x: number;
  readonly y: number;

  constructor(x: number = 0.0, y: number = 0.0) {
    this.x = x;
    this.y = y;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  mul(scalar: number): Vec2 {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  div(scalar: number): Vec2 {
    return new Vec2(this.x / scalar, this.y / scalar);
  }

  mulComponents(other: Vec2): Vec2 {
    return new Vec2(this.x * other.x, this.y * other.y);
  }

  divComponents(other: Vec2): Vec2 {
    return new Vec2(this.x / other.x, this.y / other.y);
  }

  avgComponent(): number {
    return (this.x + this.y) * 0.5;
  }

  normalized(): Vec2 {
    const magnitudeSq = this.lengthSq();
    if (magnitudeSq <= 0.0) return new Vec2();
    const invMagnitude = 1.0 / Math.sqrt(magnitudeSq);
    return new Vec2(this.x * invMagnitude, this.y * invMagnitude);
  }

  normalizedWithLength(epsilon: number = 1e-6): [Vec2, number] {
    const magnitude = this.length();
    if (magnitude <= epsilon) return [new Vec2(), 0.0];
    return [this.div(magnitude), magnitude];
  }

  distanceTo(other: Vec2): number {
    return other.sub(this).length();
  }

  directionTo(other: Vec2, epsilon: number = 1e-6): Vec2 {
    const [direction] = other.sub(this).normalizedWithLength(epsilon);
    return direction;
  }

  static fromAngle(theta: number): Vec2 {
    return new Vec2(Math.cos(theta), Math.sin(theta));
  }

  static fromPolar(theta: number, radius: number = 1.0): Vec2 {
    return Vec2.fromAngle(theta).mul(radius);
  }

  static fromXY(value: SupportsXY): Vec2 {
    return new Vec2(value.x, value.y);
  }

  static fromHeading(heading: number): Vec2 {
    return Vec2.fromAngle(heading - Math.PI / 2.0);
  }

  toAngle(): number {
    return Math.atan2(this.y, this.x);
  }

  toHeading(): number {
    return this.toAngle() + Math.PI / 2.0;
  }

  toPolar(): [number, number] {
    return [this.toAngle(), this.length()];
  }

  offset(dx: number = 0.0, dy: number = 0.0): Vec2 {
    return new Vec2(this.x + dx, this.y + dy);
  }

  perpLeft(): Vec2 {
    return new Vec2(-this.y, this.x);
  }

  perpRight(): Vec2 {
    return new Vec2(this.y, -this.x);
  }

  toDict(ndigits?: number): { x: number; y: number } {
    if (ndigits === undefined) {
      return { x: this.x, y: this.y };
    }
    const factor = Math.pow(10, ndigits);
    return {
      x: Math.round(this.x * factor) / factor,
      y: Math.round(this.y * factor) / factor,
    };
  }

  rotated(theta: number): Vec2 {
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    return new Vec2(
      this.x * cosTheta - this.y * sinTheta,
      this.x * sinTheta + this.y * cosTheta,
    );
  }

  clampRect(minX: number, minY: number, maxX: number, maxY: number): Vec2 {
    return new Vec2(
      clamp(this.x, minX, maxX),
      clamp(this.y, minY, maxY),
    );
  }

  static distanceSq(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  }

  static lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return new Vec2(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
    );
  }
}

export class Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;

  constructor(x: number = 0.0, y: number = 0.0, w: number = 0.0, h: number = 0.0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  static fromXywh(value: { x: number; y: number; width: number; height: number }): Rect {
    return new Rect(value.x, value.y, value.width, value.height);
  }

  static fromTopLeft(topLeft: SupportsXY, width: number, height: number): Rect {
    return new Rect(topLeft.x, topLeft.y, width, height);
  }

  static fromPosSize(pos: Vec2, size: Vec2): Rect {
    return new Rect(pos.x, pos.y, size.x, size.y);
  }

  get left(): number { return this.x; }
  get top(): number { return this.y; }

  get topLeft(): Vec2 { return new Vec2(this.x, this.y); }
  get topRight(): Vec2 { return new Vec2(this.right, this.y); }
  get bottomLeft(): Vec2 { return new Vec2(this.x, this.bottom); }
  get bottomRight(): Vec2 { return new Vec2(this.right, this.bottom); }

  get size(): Vec2 { return new Vec2(this.w, this.h); }
  get width(): number { return this.w; }
  get height(): number { return this.h; }

  get right(): number { return this.x + this.w; }
  get bottom(): number { return this.y + this.h; }

  get center(): Vec2 {
    return new Vec2(this.x + this.w * 0.5, this.y + this.h * 0.5);
  }

  static fromCenter(center: SupportsXY, width: number, height: number): Rect {
    return new Rect(
      center.x - width * 0.5,
      center.y - height * 0.5,
      width,
      height,
    );
  }

  offset(dx: number = 0.0, dy: number = 0.0): Rect {
    return new Rect(this.x + dx, this.y + dy, this.w, this.h);
  }

  inset(dx: number = 0.0, dy: number = 0.0): Rect {
    return new Rect(
      this.x + dx,
      this.y + dy,
      Math.max(0.0, this.w - 2.0 * dx),
      Math.max(0.0, this.h - 2.0 * dy),
    );
  }

  contains(point: SupportsXY): boolean {
    const px = point.x;
    const py = point.y;
    return this.x <= px && px <= this.right && this.y <= py && py <= this.bottom;
  }
}
