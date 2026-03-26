// Port of grim/geom.py

import * as wgl from '@wgl';
import { clamp } from './math.ts';

export interface SupportsXY {
  x: number;
  y: number;
}

export class Vec2 {
  constructor(
    public readonly x: number = 0.0,
    public readonly y: number = 0.0
  ) {
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  length() {
    return Math.sqrt(this.lengthSq());
  }

  add(other: Vec2) {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vec2) {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  mul(scalar: number) {
    return new Vec2(this.x * scalar, this.y * scalar);
  }

  div(scalar: number) {
    return new Vec2(this.x / scalar, this.y / scalar);
  }

  mulComponents(other: Vec2) {
    return new Vec2(this.x * other.x, this.y * other.y);
  }

  divComponents(other: Vec2) {
    return new Vec2(this.x / other.x, this.y / other.y);
  }

  avgComponent() {
    return (this.x + this.y) * 0.5;
  }

  normalized() {
    const magnitudeSq = this.lengthSq();
    if (magnitudeSq <= 0.0) return new Vec2();
    const invMagnitude = 1.0 / Math.sqrt(magnitudeSq);
    return new Vec2(this.x * invMagnitude, this.y * invMagnitude);
  }

  normalizedWithLength(opts: { epsilon?: number } = {}): [Vec2, number] {
    const epsilon = opts.epsilon ?? 1e-6;
    const magnitude = this.length();
    if (magnitude <= epsilon) return [new Vec2(), 0.0];
    return [this.div(magnitude), magnitude];
  }

  distanceTo(other: Vec2) {
    return other.sub(this).length();
  }

  directionTo(other: Vec2, opts: { epsilon?: number } = {}) {
    const [direction] = other.sub(this).normalizedWithLength({ epsilon: opts.epsilon ?? 1e-6 });
    return direction;
  }

  static fromAngle(theta: number) {
    return new Vec2(Math.cos(theta), Math.sin(theta));
  }

  static fromPolar(theta: number, radius: number = 1.0) {
    return Vec2.fromAngle(theta).mul(radius);
  }

  static fromXY(value: SupportsXY) {
    return new Vec2(value.x, value.y);
  }

  static fromHeading(heading: number) {
    return Vec2.fromAngle(heading - Math.PI / 2.0);
  }

  toAngle() {
    return Math.atan2(this.y, this.x);
  }

  toHeading() {
    return this.toAngle() + Math.PI / 2.0;
  }

  toPolar(): [number, number] {
    return [this.toAngle(), this.length()];
  }

  offset(opts: { dx?: number; dy?: number } = {}) {
    const dx = opts.dx ?? 0.0;
    const dy = opts.dy ?? 0.0;
    return new Vec2(this.x + dx, this.y + dy);
  }

  perpLeft() {
    return new Vec2(-this.y, this.x);
  }

  perpRight() {
    return new Vec2(this.y, -this.x);
  }

  toWgl() {
    return wgl.makeVector2(this.x, this.y);
  }

  toDict(opts: { ndigits?: number } = {}) {
    const ndigits = opts.ndigits;
    if (ndigits === undefined) {
      return { x: this.x, y: this.y };
    }
    const factor = Math.pow(10, ndigits);
    return {
      x: Math.round(this.x * factor) / factor,
      y: Math.round(this.y * factor) / factor,
    };
  }

  rotated(theta: number) {
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    return new Vec2(
      this.x * cosTheta - this.y * sinTheta,
      this.x * sinTheta + this.y * cosTheta,
    );
  }

  clampRect(minX: number, minY: number, maxX: number, maxY: number) {
    return new Vec2(
      clamp(this.x, minX, maxX),
      clamp(this.y, minY, maxY),
    );
  }

  static distanceSq(a: Vec2, b: Vec2) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  }

  static lerp(a: Vec2, b: Vec2, t: number) {
    return new Vec2(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
    );
  }
}

export class Rect {
  constructor(
    public readonly x: number = 0.0,
    public readonly y: number = 0.0,
    public readonly w: number = 0.0,
    public readonly h: number = 0.0
  ) {
  }

  static fromXywh(value: { x: number; y: number; width: number; height: number }) {
    return new Rect(value.x, value.y, value.width, value.height);
  }

  static fromTopLeft(topLeft: SupportsXY, width: number, height: number) {
    return new Rect(topLeft.x, topLeft.y, width, height);
  }

  static fromPosSize(pos: Vec2, size: Vec2) {
    return new Rect(pos.x, pos.y, size.x, size.y);
  }

  get left() { return this.x; }
  get top() { return this.y; }

  get topLeft() { return new Vec2(this.x, this.y); }
  get topRight() { return new Vec2(this.right, this.y); }
  get bottomLeft() { return new Vec2(this.x, this.bottom); }
  get bottomRight() { return new Vec2(this.right, this.bottom); }

  get size() { return new Vec2(this.w, this.h); }
  get width() { return this.w; }
  get height() { return this.h; }

  get right() { return this.x + this.w; }
  get bottom() { return this.y + this.h; }

  get center() {
    return new Vec2(this.x + this.w * 0.5, this.y + this.h * 0.5);
  }

  static fromCenter(center: SupportsXY, width: number, height: number) {
    return new Rect(
      center.x - width * 0.5,
      center.y - height * 0.5,
      width,
      height,
    );
  }

  offset(opts: { dx?: number; dy?: number } = {}) {
    const dx = opts.dx ?? 0.0;
    const dy = opts.dy ?? 0.0;
    return new Rect(this.x + dx, this.y + dy, this.w, this.h);
  }

  inset(opts: { dx?: number; dy?: number } = {}) {
    const dx = opts.dx ?? 0.0;
    const dy = opts.dy ?? 0.0;
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
