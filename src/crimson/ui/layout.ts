// Port of crimson/ui/layout.py

import { Vec2 } from '@grim/geom.ts';

export const UI_BASE_WIDTH = 640.0;
export const UI_BASE_HEIGHT = 480.0;

export class DropdownLayoutBase {
  constructor(
    public readonly pos: Vec2,
    public readonly width: number,
    public readonly headerH: number,
    public readonly rowH: number,
    public readonly rowsY0: number,
    public readonly fullH: number,
  ) {
  }
}

export function uiScale(screenW: number, screenH: number): number {
  // Classic UI-space: draw in backbuffer pixels.
  return 1.0;
}

export function uiOrigin(screenW: number, screenH: number, scale: number): Vec2 {
  return new Vec2();
}

export function menuWidescreenYShift(layoutW: number): number {
  // ui_menu_layout_init: pos_y += (screen_width / 640.0) * 150.0 - 150.0
  return (layoutW / UI_BASE_WIDTH) * 150.0 - 150.0;
}
