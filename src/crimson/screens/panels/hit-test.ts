// Port of crimson/screens/panels/hit_test.py

import { type SupportsXY } from '@grim/geom.ts';

export function mouseInsideRectWithPadding(
  mouse: SupportsXY,
  opts: { pos: SupportsXY; width: number; height: number; leftPad?: number; topPad?: number },
): boolean {
  const leftPad = opts.leftPad ?? 10.0;
  const topPad = opts.topPad ?? 2.0;
  const x = opts.pos.x;
  const y = opts.pos.y;
  return (
    x - leftPad <= mouse.x &&
    mouse.x <= x + opts.width &&
    y - topPad <= mouse.y &&
    mouse.y <= y + opts.height
  );
}
