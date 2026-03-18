import { Vec2 } from '../engine/geom.ts';

export const UI_BASE_WIDTH = 640.0;
export const UI_BASE_HEIGHT = 480.0;

export interface DropdownLayoutBase {
  readonly pos: Vec2;
  readonly width: number;
  readonly header_h: number;
  readonly row_h: number;
  readonly rows_y0: number;
  readonly full_h: number;
}

export function uiScale(screenW: number, screenH: number): number {
  return 1.0;
}

export function uiOrigin(screenW: number, screenH: number, scale: number): Vec2 {
  return new Vec2();
}

export function menuWidescreenYShift(layoutW: number): number {
  return (layoutW / UI_BASE_WIDTH) * 150.0 - 150.0;
}
