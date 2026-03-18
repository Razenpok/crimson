// Port of crimson/wire/float32_wire.py

import { f32 } from '@crimson/math-parity.ts';

export function wireF32(value: number, field?: string): number {
  const narrowed = f32(value);
  if (!Number.isFinite(narrowed)) {
    throw new Error(`${field ?? 'value'} must be finite`);
  }
  return narrowed;
}

// Unused in WebGL port: networking/rollback excluded
export function wireF32Opt(value: number | null, field?: string): number | null {
  if (value === null) return null;
  return wireF32(value, field);
}

// Unused in WebGL port: networking/rollback excluded
export function assertWireF32(value: number, field?: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field ?? 'value'} must be finite`);
  }
  const narrowed = f32(value);
  if (value !== narrowed) {
    throw new Error(`${field ?? 'value'} must be f32-canonical`);
  }
  return value;
}
