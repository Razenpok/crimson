// Port of crimson/wire/float32_wire.py

import { f32 } from '@crimson/math-parity.ts';

function _fieldLabel(field: string | null = null): string {
  if (field && String(field).trim()) {
    return String(field);
  }
  return 'value';
}

export function wireF32(value: number, opts: { field?: string | null } = {}): number {
  const label = _fieldLabel(opts.field ?? null);
  const narrowed = f32(value);
  if (!Number.isFinite(narrowed)) {
    throw new Error(`${label} must be finite`);
  }
  return narrowed;
}

export function wireF32Opt(value: number | null, opts: { field?: string | null } = {}): number | null {
  if (value === null) return null;
  return wireF32(value, opts);
}

export function assertWireF32(value: number, opts: { field?: string | null } = {}): number {
  const label = _fieldLabel(opts.field ?? null);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  const narrowed = f32(value);
  if (value !== narrowed) {
    throw new Error(`${label} must be f32-canonical`);
  }
  return value;
}
