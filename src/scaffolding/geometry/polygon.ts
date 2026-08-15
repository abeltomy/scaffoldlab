/**
 * 2D polygon utilities used by the perimeter/scaffold generators.
 * Everything here operates on closed polygons stored as an open vertex list
 * (last vertex is implicitly connected back to the first) in the XZ plane.
 */

import type { Vec2 } from '../types';

export const EPS = 1e-9;

/** Signed area (shoelace). Positive = counter-clockwise in a right-handed XZ plane. */
export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function area(poly: Vec2[]): number {
  return Math.abs(signedArea(poly));
}

export function perimeter(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    s += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return s;
}

/** Force a given winding so that "outward" normals are unambiguous. */
export function ensureWinding(poly: Vec2[], counterClockwise = true): Vec2[] {
  const ccw = signedArea(poly) > 0;
  return ccw === counterClockwise ? poly : poly.slice().reverse();
}

/** Drop consecutive duplicates (within `tol`). */
export function dedupe(poly: Vec2[], tol = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > tol) out.push(p);
  }
  while (
    out.length > 1 &&
    Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tol
  ) {
    out.pop();
  }
  return out;
}

/**
 * Ramer–Douglas–Peucker simplification for a *closed* polygon.
 *
 * The contour coming out of marching squares has one vertex per raster cell
 * edge, which is far more detail than a scaffold needs. Simplifying to a
 * tolerance of roughly one cell collapses the staircase back into the straight
 * façade runs (and keeps genuine corners), which is what makes the generated
 * scaffold follow the building instead of hugging every voxel.
 */
export function simplifyClosed(poly: Vec2[], tolerance: number): Vec2[] {
  if (poly.length < 4) return poly;
  // Anchor on the two mutually most distant vertices so the closed loop can be
  // treated as two open polylines.
  let ai = 0;
  let bi = 0;
  let best = -1;
  for (let i = 1; i < poly.length; i++) {
    const d = dist2(poly[0], poly[i]);
    if (d > best) {
      best = d;
      bi = i;
    }
  }
  best = -1;
  for (let i = 0; i < poly.length; i++) {
    const d = dist2(poly[bi], poly[i]);
    if (d > best) {
      best = d;
      ai = i;
    }
  }
  const rotated = poly.slice(ai).concat(poly.slice(0, ai));
  const split = (bi - ai + poly.length) % poly.length;
  const first = rdp(rotated.slice(0, split + 1), tolerance);
  const second = rdp(rotated.slice(split).concat([rotated[0]]), tolerance);
  return dedupe(first.concat(second.slice(1, -1)));
}

function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function rdp(points: Vec2[], tol: number): Vec2[] {
  if (points.length < 3) return points.slice();
  const first = points[0];
  const last = points[points.length - 1];
  let index = -1;
  let maxDist = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointSegmentDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > tol && index > 0) {
    const left = rdp(points.slice(0, index + 1), tol);
    const right = rdp(points.slice(index), tol);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Miter-offset a closed polygon outward by `d` metres.
 *
 * Each edge is pushed along its outward normal; the new vertex is the
 * intersection of the two displaced edges, which for a convex corner of
 * interior angle θ sits at distance d / sin(θ/2) along the angle bisector.
 * Very sharp corners would send that to infinity, so the miter length is
 * clamped (`miterLimit`), matching what a real scaffold does at a re-entrant
 * corner: it bevels rather than sticking out a spike.
 */
export function offsetPolygon(poly: Vec2[], d: number, miterLimit = 2.5): Vec2[] {
  const p = ensureWinding(dedupe(poly), true);
  const n = p.length;
  if (n < 3 || Math.abs(d) < EPS) return p;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = p[(i - 1 + n) % n];
    const cur = p[i];
    const next = p[(i + 1) % n];
    const n1 = outwardNormal(prev, cur);
    const n2 = outwardNormal(cur, next);
    // Bisector of the two edge normals.
    let bx = n1[0] + n2[0];
    let by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by);
    if (bl < 1e-6) {
      // 180° reversal (a spike) — just push along one normal.
      out.push([cur[0] + n1[0] * d, cur[1] + n1[1] * d]);
      continue;
    }
    bx /= bl;
    by /= bl;
    const cos = bx * n1[0] + by * n1[1]; // = sin(θ/2)
    let scale = 1 / Math.max(cos, 1e-3);
    scale = Math.min(scale, miterLimit);
    out.push([cur[0] + bx * d * scale, cur[1] + by * d * scale]);
  }
  return dedupe(out, Math.abs(d) * 0.05 + 1e-4);
}

/**
 * Outward normal of edge a→b for a counter-clockwise polygon in the XZ plane.
 * With CCW winding (shoelace > 0) the outside lies to the right of travel,
 * i.e. the normal is (dy, -dx) normalised.
 */
export function outwardNormal(a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dy / l, -dx / l];
}

/** Per-vertex outward normal (average of the two adjacent edge normals). */
export function vertexNormals(poly: Vec2[]): Vec2[] {
  const n = poly.length;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const n1 = outwardNormal(poly[(i - 1 + n) % n], poly[i]);
    const n2 = outwardNormal(poly[i], poly[(i + 1) % n]);
    let x = n1[0] + n2[0];
    let y = n1[1] + n2[1];
    const l = Math.hypot(x, y);
    if (l < 1e-6) {
      x = n1[0];
      y = n1[1];
    } else {
      x /= l;
      y /= l;
    }
    out.push([x, y]);
  }
  return out;
}

/**
 * Resample a closed polygon into bays of approximately `spacing` metres.
 *
 * Corners are preserved as nodes (a scaffold always has a standard at a
 * corner), and each straight run between corners is divided into the whole
 * number of bays that lands closest to the requested spacing. Bay length
 * therefore varies slightly from the nominal spacing — exactly as on site.
 */
export function resampleWithCorners(poly: Vec2[], spacing: number, maxNodes = 4000): Vec2[] {
  const p = dedupe(poly);
  const n = p.length;
  if (n < 3) return p;
  const nodes: Vec2[] = [];
  const total = perimeter(p);
  const budget = Math.min(maxNodes, Math.max(4, Math.ceil(total / Math.max(spacing, 0.05))));
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bays = Math.max(1, Math.round(len / spacing));
    const capped = Math.max(1, Math.min(bays, Math.ceil((len / total) * budget) + 1));
    for (let k = 0; k < capped; k++) {
      const t = k / capped;
      nodes.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dedupe(nodes, spacing * 0.15);
}

/** Convex hull (monotone chain) — the fallback perimeter for noisy meshes. */
export function convexHull(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Squared Hausdorff-ish similarity used to detect "the plan changed" between levels. */
export function polygonSimilarity(a: Vec2[], b: Vec2[]): number {
  if (!a.length || !b.length) return 0;
  const areaA = area(a);
  const areaB = area(b);
  if (areaA < EPS || areaB < EPS) return 0;
  return Math.min(areaA, areaB) / Math.max(areaA, areaB);
}
