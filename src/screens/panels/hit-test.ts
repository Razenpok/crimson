// Port of crimson/screens/panels/hit_test.py

import { type SupportsXY } from '../../engine/geom.ts';

export function mouseInsideRectWithPadding(
  mouse: SupportsXY,
  pos: SupportsXY,
  width: number,
  height: number,
  leftPad: number = 10.0,
  topPad: number = 2.0,
): boolean {
  const x = pos.x;
  const y = pos.y;
  return (
    x - leftPad <= mouse.x &&
    mouse.x <= x + width &&
    y - topPad <= mouse.y &&
    mouse.y <= y + height
  );
}
