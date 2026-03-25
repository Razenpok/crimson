// Port of grim/color.py

import * as wgl from '@wgl';
import { clamp } from './math.ts';

export class RGBA {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;

  constructor(r: number = 1.0, g: number = 1.0, b: number = 1.0, a: number = 1.0) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  static fromRgba(value: RGBA | wgl.Color): RGBA {
    if (value instanceof RGBA) return value;
    return new RGBA(value[0], value[1], value[2], value[3]);
  }

  static fromBytes(r: number, g: number, b: number, a: number): RGBA {
    const inv255 = 1.0 / 255.0;
    return new RGBA(r * inv255, g * inv255, b * inv255, a * inv255);
  }

  static lerp(a: RGBA, b: RGBA, t: number): RGBA {
    return new RGBA(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t,
      a.a + (b.a - a.a) * t,
    );
  }

  toWgl(): wgl.Color {
    return wgl.makeColor(this.r, this.g, this.b, this.a);
  }

  clamped(): RGBA {
    return new RGBA(
      clamp(this.r, 0.0, 1.0),
      clamp(this.g, 0.0, 1.0),
      clamp(this.b, 0.0, 1.0),
      clamp(this.a, 0.0, 1.0),
    );
  }

  replace(opts: { r?: number; g?: number; b?: number; a?: number }): RGBA {
    return new RGBA(
      opts.r !== undefined ? opts.r : this.r,
      opts.g !== undefined ? opts.g : this.g,
      opts.b !== undefined ? opts.b : this.b,
      opts.a !== undefined ? opts.a : this.a,
    );
  }

  withAlpha(alpha: number): RGBA {
    return this.replace({ a: alpha });
  }

  scaled(factor: number): RGBA {
    return new RGBA(
      this.r * factor,
      this.g * factor,
      this.b * factor,
      this.a * factor,
    );
  }

  scaledAlpha(factor: number): RGBA {
    return this.withAlpha(this.a * factor);
  }

  /** Convert to [r255, g255, b255, a255] byte values */
  toBytes(): [number, number, number, number] {
    const c = this.clamped();
    return [
      (c.r * 255.0 + 0.5) | 0,
      (c.g * 255.0 + 0.5) | 0,
      (c.b * 255.0 + 0.5) | 0,
      (c.a * 255.0 + 0.5) | 0,
    ];
  }
}
