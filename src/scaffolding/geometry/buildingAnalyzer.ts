/**
 * Building geometry analysis.
 *
 * Takes a flat triangle soup (world-space, model units) and produces:
 *   - overall dimensions / bounding box
 *   - approximate exterior (façade) area and a count of "major faces"
 *   - a vertical stack of binary occupancy slices (the OccupancyRaster)
 *
 * The raster is the bridge between "some arbitrary mesh a user dropped in" and
 * the scaffold generator: rather than trying to understand the building's
 * topology, we sample it into voxels and then extract, per scaffold lift, the
 * silhouette of the building at that height. That is what allows the scaffold
 * to follow setbacks, wings and curved façades instead of being a box.
 *
 * The raster is computed in MODEL UNITS and scaled afterwards, so that changing
 * the model scale is instant and never re-runs the expensive rasterisation.
 */

import type { BoundingBox, BuildingAnalysis, OccupancyRaster, Vec2 } from '../types';
import { largestLoop, latticeToWorld, traceContours } from './contour';
import { perimeter as polyPerimeter, simplifyClosed } from './polygon';

export interface AnalyzeOptions {
  /** Target number of raster cells across the longest horizontal dimension. */
  targetGrid?: number;
  /** Maximum number of vertical slabs. */
  maxSlabs?: number;
  /** Hard cap on total raster cells, to bound memory on huge models. */
  maxCells?: number;
}

const DEFAULTS: Required<AnalyzeOptions> = {
  targetGrid: 150,
  maxSlabs: 260,
  maxCells: 9_000_000,
};

/**
 * Rasterise + measure. `positions` is xyz triplets already transformed into a
 * single world space, with Y up. The result is expressed in model units; the
 * caller applies the scale via {@link scaleAnalysis}.
 */
export function analyzeTriangles(
  positions: Float32Array,
  options: AnalyzeOptions = {},
): BuildingAnalysis {
  const opts = { ...DEFAULTS, ...options };
  const warnings: string[] = [];
  const triCount = Math.floor(positions.length / 9);

  if (triCount === 0) {
    throw new Error('Model contains no triangles — nothing to analyse.');
  }

  /* ---- bounding box ---------------------------------------------------- */
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxY)) {
    throw new Error('Model geometry contains only invalid (NaN/Infinite) vertices.');
  }

  const width = Math.max(maxX - minX, 1e-6);
  const depth = Math.max(maxZ - minZ, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);

  /* ---- raster resolution ----------------------------------------------- */
  const span = Math.max(width, depth);
  let cell = span / opts.targetGrid;
  let nx = Math.max(4, Math.ceil(width / cell) + 2);
  let nz = Math.max(4, Math.ceil(depth / cell) + 2);
  let slabHeight = Math.max(height / opts.maxSlabs, cell * 0.5);
  let slabCount = Math.max(1, Math.ceil(height / slabHeight));

  // Bound memory: coarsen uniformly until the raster fits the cell budget.
  let cells = nx * nz * slabCount;
  if (cells > opts.maxCells) {
    const factor = Math.cbrt(cells / opts.maxCells);
    cell *= factor;
    slabHeight *= factor;
    nx = Math.max(4, Math.ceil(width / cell) + 2);
    nz = Math.max(4, Math.ceil(depth / cell) + 2);
    slabCount = Math.max(1, Math.ceil(height / slabHeight));
    cells = nx * nz * slabCount;
    warnings.push(
      `Large model — analysis resolution reduced to ${cell.toFixed(2)} model units per cell.`,
    );
  }

  const originX = minX - cell;
  const originZ = minZ - cell;
  const data = new Uint8Array(cells);
  const layerSize = nx * nz;

  /* ---- triangle rasterisation ------------------------------------------
   * Each triangle is sampled on a barycentric lattice fine enough that the
   * gap between samples is under half a cell, guaranteeing every cell the
   * triangle passes through gets marked (a conservative-enough surface
   * voxelisation). Interior voids are irrelevant: only the outer silhouette
   * is ever read back out.
   */
  const sampleStep = Math.min(cell, slabHeight) * 0.5;
  let exteriorArea = 0;
  let totalArea = 0;
  const azimuthBins = new Float64Array(24);

  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = positions[o],
      ay = positions[o + 1],
      az = positions[o + 2];
    const bx = positions[o + 3],
      by = positions[o + 4],
      bz = positions[o + 5];
    const cx = positions[o + 6],
      cy = positions[o + 7],
      cz = positions[o + 8];

    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    // Cross product magnitude / 2 = triangle area; the normal tells us whether
    // this is a façade (vertical-ish) or a roof/floor (horizontal-ish) face.
    const nxv = e1y * e2z - e1z * e2y;
    const nyv = e1z * e2x - e1x * e2z;
    const nzv = e1x * e2y - e1y * e2x;
    const nlen = Math.hypot(nxv, nyv, nzv);
    const triArea = nlen * 0.5;
    if (!Number.isFinite(triArea) || triArea <= 0) continue;
    totalArea += triArea;
    const verticality = 1 - Math.abs(nyv / nlen);
    if (verticality > 0.5) {
      exteriorArea += triArea;
      const azimuth = Math.atan2(nzv, nxv);
      const bin = Math.floor(((azimuth + Math.PI) / (Math.PI * 2)) * azimuthBins.length);
      azimuthBins[Math.min(azimuthBins.length - 1, Math.max(0, bin))] += triArea;
    }

    const len1 = Math.hypot(e1x, e1y, e1z);
    const len2 = Math.hypot(e2x, e2y, e2z);
    const steps = Math.min(256, Math.max(1, Math.ceil(Math.max(len1, len2) / sampleStep)));
    const inv = 1 / steps;
    for (let i = 0; i <= steps; i++) {
      const u = i * inv;
      for (let j = 0; j <= steps - i; j++) {
        const v = j * inv;
        const px = ax + e1x * u + e2x * v;
        const py = ay + e1y * u + e2y * v;
        const pz = az + e1z * u + e2z * v;
        const ix = Math.floor((px - originX) / cell);
        const iz = Math.floor((pz - originZ) / cell);
        const iy = Math.floor((py - minY) / slabHeight);
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) continue;
        const slab = iy < 0 ? 0 : iy >= slabCount ? slabCount - 1 : iy;
        data[slab * layerSize + iz * nx + ix] = 1;
      }
    }
  }

  let majorFaces = 0;
  for (let i = 0; i < azimuthBins.length; i++) {
    if (azimuthBins[i] > exteriorArea * 0.03) majorFaces++;
  }

  const raster: OccupancyRaster = {
    data,
    nx,
    nz,
    slabCount,
    cell,
    slabHeight,
    originX,
    originZ,
    originY: 0, // the model is ground-aligned by subtracting minY below
  };

  /* ---- ground footprint ------------------------------------------------ */
  const groundMask = sliceMask(raster, 0, Math.max(1, Math.ceil(slabCount * 0.02)));
  let filled = 0;
  for (let i = 0; i < groundMask.length; i++) filled += groundMask[i];
  const footprintArea = filled * cell * cell;
  const loop = largestLoop(traceContours({ data: groundMask, nx, nz }));
  const footprintPerimeter = loop
    ? polyPerimeter(simplifyClosed(latticeToWorld(loop, originX, originZ, cell), cell * 1.2))
    : 2 * (width + depth);

  if (exteriorArea <= 0) {
    warnings.push('No vertical faces detected — the model may be flat or incorrectly oriented.');
  }
  if (triCount > 800_000) {
    warnings.push(`Very dense mesh (${triCount.toLocaleString()} triangles) — analysis simplified.`);
  }

  const bbox: BoundingBox = {
    min: [minX, 0, minZ],
    max: [maxX, height, maxZ],
  };

  return {
    bbox,
    height,
    width,
    depth,
    footprintArea,
    footprintPerimeter,
    exteriorArea,
    majorFaces,
    triangleCount: triCount,
    highestPoint: height,
    lowestPoint: 0,
    raster,
    warnings,
  };
}

/** OR together a range of slabs into a single 2D mask. */
export function sliceMask(raster: OccupancyRaster, slabFrom: number, slabTo: number): Uint8Array {
  const layer = raster.nx * raster.nz;
  const out = new Uint8Array(layer);
  const from = Math.max(0, Math.min(raster.slabCount - 1, slabFrom));
  const to = Math.max(from + 1, Math.min(raster.slabCount, slabTo));
  for (let s = from; s < to; s++) {
    const base = s * layer;
    for (let i = 0; i < layer; i++) {
      if (raster.data[base + i]) out[i] = 1;
    }
  }
  return out;
}

/**
 * Return a copy of the analysis expressed in metres.
 *
 * Every length scales linearly, areas quadratically. The raster's `data` is
 * shared (not copied) — only its metadata changes — which is what makes the
 * scale slider feel instant even on a 500k-triangle model.
 */
export function scaleAnalysis(a: BuildingAnalysis, scale: number): BuildingAnalysis {
  const s = scale;
  return {
    ...a,
    bbox: {
      min: [a.bbox.min[0] * s, a.bbox.min[1] * s, a.bbox.min[2] * s],
      max: [a.bbox.max[0] * s, a.bbox.max[1] * s, a.bbox.max[2] * s],
    },
    height: a.height * s,
    width: a.width * s,
    depth: a.depth * s,
    footprintArea: a.footprintArea * s * s,
    footprintPerimeter: a.footprintPerimeter * s,
    exteriorArea: a.exteriorArea * s * s,
    highestPoint: a.highestPoint * s,
    lowestPoint: a.lowestPoint * s,
    raster: {
      ...a.raster,
      cell: a.raster.cell * s,
      slabHeight: a.raster.slabHeight * s,
      originX: a.raster.originX * s,
      originZ: a.raster.originZ * s,
      originY: a.raster.originY * s,
    },
  };
}

/** Convenience: the world-space silhouette polygon at a given height band. */
export function silhouetteAt(
  raster: OccupancyRaster,
  yFrom: number,
  yTo: number,
  simplifyTolerance = raster.cell * 1.25,
): Vec2[] | null {
  const from = Math.floor((yFrom - raster.originY) / raster.slabHeight);
  const to = Math.ceil((yTo - raster.originY) / raster.slabHeight);
  const mask = sliceMask(raster, from, to);
  const loop = largestLoop(traceContours({ data: mask, nx: raster.nx, nz: raster.nz }));
  if (!loop) return null;
  const world = latticeToWorld(loop, raster.originX, raster.originZ, raster.cell);
  const simplified = simplifyClosed(world, simplifyTolerance);
  return simplified.length >= 3 ? simplified : world;
}
