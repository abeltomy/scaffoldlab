/**
 * Binary-mask → polygon contour extraction.
 *
 * Given a 2D occupancy mask (1 = building material present in this cell), we
 * emit every cell edge that separates a filled cell from an empty one, then
 * stitch those edges into closed loops. Because the edges live exactly on the
 * integer cell-corner lattice, stitching is exact — no floating-point
 * tolerance games — and every loop is guaranteed closed.
 *
 * Edges are emitted with the filled cell on the LEFT of travel, which makes
 * outer loops come out counter-clockwise (positive shoelace area) and holes
 * clockwise. That lets `largestLoop` pick the building's outer silhouette and
 * discard courtyards/holes.
 */

import type { Vec2 } from '../types';
import { signedArea } from './polygon';

export interface MaskView {
  data: Uint8Array;
  nx: number;
  nz: number;
}

/** Trace all closed loops of a binary mask, in cell-corner (grid) coordinates. */
export function traceContours(mask: MaskView): Vec2[][] {
  const { data, nx, nz } = mask;
  const at = (ix: number, iz: number) =>
    ix < 0 || iz < 0 || ix >= nx || iz >= nz ? 0 : data[iz * nx + ix];

  // key(x, y) packs a lattice point into one integer for O(1) stitching.
  const stride = nx + 2;
  const key = (x: number, y: number) => y * stride + x;
  const next = new Map<number, number[]>(); // start point -> list of end points

  const addEdge = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = next.get(k);
    if (list) list.push(key(x1, y1));
    else next.set(k, [key(x1, y1)]);
  };

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      if (!at(ix, iz)) continue;
      if (!at(ix, iz - 1)) addEdge(ix, iz, ix + 1, iz); // south face
      if (!at(ix + 1, iz)) addEdge(ix + 1, iz, ix + 1, iz + 1); // east face
      if (!at(ix, iz + 1)) addEdge(ix + 1, iz + 1, ix, iz + 1); // north face
      if (!at(ix - 1, iz)) addEdge(ix, iz + 1, ix, iz); // west face
    }
  }

  const loops: Vec2[][] = [];
  const unkey = (k: number): Vec2 => [k % stride, Math.floor(k / stride)];

  for (const startKey of Array.from(next.keys())) {
    let outgoing = next.get(startKey);
    while (outgoing && outgoing.length) {
      const loop: Vec2[] = [];
      let cur = startKey;
      let guard = 0;
      const limit = nx * nz * 4 + 16;
      while (guard++ < limit) {
        const list = next.get(cur);
        if (!list || !list.length) break;
        // Prefer continuing straight to avoid zig-zag when two loops touch at
        // a diagonal — pop() is fine for the common case.
        const nxt = list.pop()!;
        loop.push(unkey(cur));
        cur = nxt;
        if (cur === startKey) break;
      }
      if (loop.length >= 4) loops.push(loop);
      outgoing = next.get(startKey);
    }
  }
  return loops;
}

/** The loop enclosing the largest positive (counter-clockwise) area. */
export function largestLoop(loops: Vec2[][]): Vec2[] | null {
  let best: Vec2[] | null = null;
  let bestArea = 0;
  for (const loop of loops) {
    const a = signedArea(loop);
    if (a > bestArea) {
      bestArea = a;
      best = loop;
    }
  }
  return best;
}

/** Map grid-lattice coordinates to world XZ metres. */
export function latticeToWorld(
  loop: Vec2[],
  originX: number,
  originZ: number,
  cell: number,
): Vec2[] {
  return loop.map(([x, z]) => [originX + x * cell, originZ + z * cell] as Vec2);
}
