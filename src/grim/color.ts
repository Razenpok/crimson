// Port of grim/color.py

import * as wgl from '@wgl';
import { clamp } from './math.ts';

export class RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;

  constructor(opts?: { r?: number; g?: number; b?: number; a?: number });
  constructor(r?: number, g?: number, b?: number, a?: number);
  constructor(
    optsOrR: { r?: number; g?: number; b?: number; a?: number } | number = {},
    g: number = 1.0,
    b: number = 1.0,
    a: number = 1.0,
  ) {
    if (typeof optsOrR === 'number') {
      this.r = optsOrR;
      this.g = g;
      this.b = b;
      this.a = a;
      return;
    }
    this.r = optsOrR.r ?? 1.0;
    this.g = optsOrR.g ?? 1.0;
    this.b = optsOrR.b ?? 1.0;
    this.a = optsOrR.a ?? 1.0;
  }

  static fromRgba(value: RGBA | readonly [number, number, number, number]): RGBA {
    if (value instanceof RGBA) return value;
    return new RGBA({ r: value[0], g: value[1], b: value[2], a: value[3] });
  }

  static fromRl(value: wgl.Color): RGBA {
    const inv255 = 1.0 / 255.0;
    return new RGBA({
      r: value.r * inv255,
      g: value.g * inv255,
      b: value.b * inv255,
      a: value.a * inv255,
    });
  }

  static lerp(a: RGBA, b: RGBA, t: number): RGBA {
    return new RGBA({
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: a.a + (b.a - a.a) * t,
    });
  }

  toTuple(): [number, number, number, number] {
    return [this.r, this.g, this.b, this.a];
  }

  *[Symbol.iterator](): Iterator<number> {
    yield this.r;
    yield this.g;
    yield this.b;
    yield this.a;
  }

  toWgl(): wgl.Color {
    return wgl.makeColor(
      clamp(this.r, 0.0, 1.0),
      clamp(this.g, 0.0, 1.0),
      clamp(this.b, 0.0, 1.0),
      clamp(this.a, 0.0, 1.0),
    );
  }

  clamped(): RGBA {
    return new RGBA({
      r: clamp(this.r, 0.0, 1.0),
      g: clamp(this.g, 0.0, 1.0),
      b: clamp(this.b, 0.0, 1.0),
      a: clamp(this.a, 0.0, 1.0),
    });
  }

  replace(opts: { r?: number; g?: number; b?: number; a?: number }): RGBA {
    return new RGBA({
      r: opts.r !== undefined ? opts.r : this.r,
      g: opts.g !== undefined ? opts.g : this.g,
      b: opts.b !== undefined ? opts.b : this.b,
      a: opts.a !== undefined ? opts.a : this.a,
    });
  }

  withAlpha(alpha: number): RGBA {
    return this.replace({ a: alpha });
  }

  scaled(factor: number): RGBA {
    return new RGBA({
      r: this.r * factor,
      g: this.g * factor,
      b: this.b * factor,
      a: this.a * factor,
    });
  }

  scaledAlpha(factor: number): RGBA {
    return this.withAlpha(this.a * factor);
  }

  toRl(): wgl.Color {
    const c = this.clamped();
    return wgl.makeColor(
      int(c.r * 255.0 + 0.5) / 255.0,
      int(c.g * 255.0 + 0.5) / 255.0,
      int(c.b * 255.0 + 0.5) / 255.0,
      int(c.a * 255.0 + 0.5) / 255.0,
    );
  }
}
