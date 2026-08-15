/**
 * Scaffold generation engine.
 *
 * Turns the per-lift node rings from the perimeter generator into individual
 * scaffold members. Nothing here touches Three.js — components are plain data
 * (mid-point, unit direction, length), which the renderer converts into
 * instanced-mesh matrices and the calculator converts into quantities.
 *
 * Member layout per lift `k`, bay `i`, row `r`:
 *
 *        row 0 (inner)      row 1 …
 *   building │            │            │
 *   ─────────┤ standard   ┤ standard   ┤   ← verticals, one per node per row
 *            ├── ledger ──┼── ledger ──┤   ← along the façade at lift top
 *            └─ transom ──┴────────────┘   ← across the rows at each node
 *              [ platform deck spans all rows of a bay ]
 *              ╲ brace ╱  (façade plane of the outer row)
 */

import type {
  ScaffoldComponent,
  ScaffoldConfiguration,
  ScaffoldModel,
  Vec2,
  Vec3,
} from '../types';
import type { OccupancyRaster } from '../types';
import { generateLevels } from './perimeterGenerator';

/** Above this many members we stop generating and ask the user to coarsen. */
export const MAX_COMPONENTS = 400_000;

export function braceInterval(config: ScaffoldConfiguration): number {
  switch (config.braceMode) {
    case 'none':
      return 0;
    case 'every':
      return 1;
    case 'every2':
      return 2;
    case 'every3':
      return 3;
    case 'custom':
      return Math.max(1, Math.round(config.braceEveryNLevels));
  }
}

export function generateScaffold(
  raster: OccupancyRaster,
  buildingHeight: number,
  config: ScaffoldConfiguration,
  materialId: string,
): ScaffoldModel {
  const t0 = (globalThis.performance ?? Date).now();
  const { levels, warnings } = generateLevels(raster, config, buildingHeight);
  const components: ScaffoldComponent[] = [];
  let id = 0;

  const rows = Math.max(1, Math.round(config.scaffoldRows));
  const rowDepth = Math.max(0.3, config.platformWidth);
  const braceEvery = braceInterval(config);
  const braceBays = Math.max(1, Math.round(config.braceEveryNBays));
  const platformEvery = Math.max(1, Math.round(config.platformEveryNLevels));
  const disabled = new Set(config.disabledLevels);
  const deckWidth = rows * rowDepth;

  const push = (
    type: ScaffoldComponent['type'],
    position: Vec3,
    direction: Vec3,
    length: number,
    level: number,
    row: number,
    bay: number,
    width = 0,
  ) => {
    components.push({
      id: id++,
      type,
      position,
      direction,
      length,
      width,
      level,
      row,
      bay,
      materialId,
    });
  };

  let truncated = false;

  for (const level of levels) {
    if (disabled.has(level.index)) continue;
    if (components.length > MAX_COMPONENTS) {
      truncated = true;
      break;
    }
    const { nodes, normals } = level;
    const n = nodes.length;
    const yTop = level.elevation;
    const yBottom = yTop - level.liftHeight;
    const yMid = (yTop + yBottom) / 2;

    // Node position of row r = inner node pushed outward along its normal.
    const rowNode = (i: number, r: number): Vec2 => [
      nodes[i][0] + normals[i][0] * rowDepth * r,
      nodes[i][1] + normals[i][1] * rowDepth * r,
    ];

    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < n; i++) {
        const p = rowNode(i, r);
        const q = rowNode((i + 1) % n, r);

        /* --- vertical standard ---------------------------------------- */
        push('standard', [p[0], yMid, p[1]], [0, 1, 0], level.liftHeight, level.index, r, i);

        /* --- ledger: along the façade at lift top ---------------------- */
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const bayLen = Math.hypot(dx, dz);
        if (bayLen > 1e-3) {
          push(
            'ledger',
            [(p[0] + q[0]) / 2, yTop, (p[1] + q[1]) / 2],
            [dx / bayLen, 0, dz / bayLen],
            bayLen,
            level.index,
            r,
            i,
          );
        }

        /* --- transom: across the rows at each node ---------------------
         * With one row there is still a transom: it is the putlog reaching
         * back to the building face, so it always exists and always has
         * length = deck width.
         */
        if (r === 0) {
          const nrm = normals[i];
          const inner: Vec2 = [p[0] - nrm[0] * rowDepth * 0.5, p[1] - nrm[1] * rowDepth * 0.5];
          const outer: Vec2 = [
            inner[0] + nrm[0] * deckWidth,
            inner[1] + nrm[1] * deckWidth,
          ];
          push(
            'transom',
            [(inner[0] + outer[0]) / 2, yTop, (inner[1] + outer[1]) / 2],
            [nrm[0], 0, nrm[1]],
            deckWidth,
            level.index,
            0,
            i,
          );
        }

        /* --- diagonal brace on the outer row --------------------------- */
        if (
          braceEvery > 0 &&
          r === rows - 1 &&
          level.index % braceEvery === 0 &&
          i % braceBays === 0 &&
          bayLen > 1e-3
        ) {
          // Runs from the foot of node i to the head of node i+1: length is the
          // hypotenuse of (bay length, lift height).
          const diag = Math.hypot(bayLen, level.liftHeight);
          push(
            'brace',
            [(p[0] + q[0]) / 2, yMid, (p[1] + q[1]) / 2],
            [dx / diag, level.liftHeight / diag, dz / diag],
            diag,
            level.index,
            r,
            i,
          );
        }
      }
    }

    /* --- decks and toe boards, one per bay across all rows ------------- */
    if (level.index % platformEvery === 0) {
      for (let i = 0; i < n; i++) {
        const p = nodes[i];
        const q = nodes[(i + 1) % n];
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const bayLen = Math.hypot(dx, dz);
        if (bayLen <= 1e-3) continue;
        const nrm: Vec2 = [
          (normals[i][0] + normals[(i + 1) % n][0]) / 2,
          (normals[i][1] + normals[(i + 1) % n][1]) / 2,
        ];
        const nl = Math.hypot(nrm[0], nrm[1]) || 1;
        nrm[0] /= nl;
        nrm[1] /= nl;
        // Deck centre sits half a deck-width outboard of the inner row line.
        const cx = (p[0] + q[0]) / 2 + nrm[0] * (deckWidth / 2 - rowDepth * 0.5);
        const cz = (p[1] + q[1]) / 2 + nrm[1] * (deckWidth / 2 - rowDepth * 0.5);
        push(
          'platform',
          [cx, yTop + 0.02, cz],
          [dx / bayLen, 0, dz / bayLen],
          bayLen,
          level.index,
          0,
          i,
          deckWidth,
        );
        // Outer edge of the deck — where the toe board and guard rails sit.
        const ox = (p[0] + q[0]) / 2 + nrm[0] * (deckWidth - rowDepth * 0.5);
        const oz = (p[1] + q[1]) / 2 + nrm[1] * (deckWidth - rowDepth * 0.5);
        const along: Vec3 = [dx / bayLen, 0, dz / bayLen];

        if (config.toeBoards) {
          push('toeboard', [ox, yTop + 0.13, oz], along, bayLen, level.index, rows - 1, i);
        }
        // Double guard rail: top rail at 1.0 m, mid rail at 0.5 m above the deck
        // — the most recognisable part of a real scaffold, and a real quantity.
        if (config.guardRails) {
          push('guardrail', [ox, yTop + 0.5, oz], along, bayLen, level.index, rows - 1, i);
          push('guardrail', [ox, yTop + 1.0, oz], along, bayLen, level.index, rows - 1, i);
        }
      }
    }

    /* --- façade sheeting: one panel per bay, full lift height ---------- */
    if (config.sheeting !== 'none') {
      for (let i = 0; i < n; i++) {
        const p = rowNode(i, rows - 1);
        const q = rowNode((i + 1) % n, rows - 1);
        const dx = q[0] - p[0];
        const dz = q[1] - p[1];
        const bayLen = Math.hypot(dx, dz);
        if (bayLen <= 1e-3) continue;
        const nrm = normals[i];
        push(
          'sheeting',
          [(p[0] + q[0]) / 2 + nrm[0] * 0.06, yMid, (p[1] + q[1]) / 2 + nrm[1] * 0.06],
          [dx / bayLen, 0, dz / bayLen],
          bayLen,
          level.index,
          rows - 1,
          i,
          level.liftHeight, // `width` carries the panel height for area take-off
        );
      }
    }
  }

  if (truncated) {
    warnings.push(
      `Component limit reached (${MAX_COMPONENTS.toLocaleString()}). Increase spacing or reduce scaffold height for a complete model.`,
    );
  }

  const t1 = (globalThis.performance ?? Date).now();
  return { components, levels, generationMs: t1 - t0, warnings };
}
