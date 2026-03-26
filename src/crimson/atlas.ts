// Port of crimson/atlas.py

// Atlas slicing used by the Crimsonland renderer.
//
// Findings from decompiled code:
// - FUN_0041fed0 precomputes UV grids for 2x2, 4x4, 8x8, 16x16 (steps 0.5/0.25/0.125/0.0625).
// - FUN_0042e0a0 reads a table at VA 0x004755F0 with pairs (cell_code, group_id).
//   cell_code maps to grid size: 0x80->2, 0x40->4, 0x20->8, 0x10->16.
//   group_id is passed to the renderer alongside the grid size; semantics unknown.
// - FUN_0042e120 uses the selected UV grid to build quad UVs by frame index.
//
// This module replicates the atlas cutting: given a grid size and frame index,
// compute UVs or pixel rects.

const GRID_SIZE_BY_CODE: Readonly<Record<number, number>> = {
  0x80: 2,
  0x40: 4,
  0x20: 8,
  0x10: 16,
};

// DAT_004755f0 table (index -> [cell_code, group_id]) extracted from crimsonland.exe
const SPRITE_TABLE: readonly (readonly [number, number])[] = [
  [0x80, 0x2],
  [0x80, 0x3],
  [0x20, 0x0],
  [0x20, 0x1],
  [0x20, 0x2],
  [0x20, 0x3],
  [0x20, 0x4],
  [0x20, 0x5],
  [0x20, 0x8],
  [0x20, 0x9],
  [0x20, 0xa],
  [0x20, 0xb],
  [0x40, 0x5],
  [0x40, 0x3],
  [0x40, 0x4],
  [0x40, 0x5],
  [0x40, 0x6],
];

export function gridSizeFromCode(code: number) {
  const size = GRID_SIZE_BY_CODE[code];
  if (size === undefined) {
    throw new Error(`Unknown atlas code: 0x${code.toString(16)}`);
  }
  return size;
}

export function gridSizeForIndex(index: number) {
  const [code] = SPRITE_TABLE[index];
  return gridSizeFromCode(code);
}

/**
 * Compute UV coordinates for a frame within an NxN atlas grid.
 */
export function uvForIndex(grid: number, index: number): [u0: number, v0: number, u1: number, v1: number] {
  const row = Math.floor(index / grid);
  const col = index % grid;
  const step = 1.0 / grid;
  const u0 = col * step;
  const v0 = row * step;
  const u1 = u0 + step;
  const v1 = v0 + step;
  return [u0, v0, u1, v1];
}

/**
 * Compute pixel rectangle for a frame within an NxN atlas grid.
 * Returns [x0, y0, x1, y1] (top-left to bottom-right).
 */
export function rectForIndex(
  width: number,
  height: number,
  grid: number,
  index: number,
): [x0: number, y0: number, x1: number, y1: number] {
  const row = Math.floor(index / grid);
  const col = index % grid;
  const cellW = Math.floor(width / grid);
  const cellH = Math.floor(height / grid);
  const x0 = col * cellW;
  const y0 = row * cellH;
  return [x0, y0, x0 + cellW, y0 + cellH];
}
