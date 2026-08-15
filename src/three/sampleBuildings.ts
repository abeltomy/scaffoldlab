/**
 * Sample building library.
 *
 * All geometry is generated procedurally — no third-party models — and each
 * sample deliberately exercises a different case of the scaffold generator:
 *
 *   terrace     small, human-scale: the one where you can actually SEE a bay,
 *               a deck, guard rails and a brace at real proportions
 *   setback     progressive setbacks + an asymmetric wing (the Empire-State-like
 *               demo): proves the ring shrinks lift by lift
 *   lshape      re-entrant corner: proves the offset polygon handles concavity
 *   cylinder    curved façade: proves a curve is approximated by straight bays
 *   crossTower  four wings: many corners per ring
 *   warehouse   long low shed with a pitched roof: mostly one big flat façade
 */

import * as THREE from 'three';

export interface SampleBuilding {
  id: string;
  name: string;
  /**
   * Real height in metres, shown in the sample menu. Must match what the
   * analyser measures — verify against the Building panel after changing any
   * sample's geometry.
   */
  height: number;
  description: string;
  build: () => THREE.Group;
}

const mat = () => new THREE.MeshStandardMaterial();

function box(
  group: THREE.Group,
  w: number,
  h: number,
  d: number,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat());
  mesh.position.set(x, y + h / 2, z);
  group.add(mesh);
  return mesh;
}


/**
 * Triangular-prism pitched roof with an exact height.
 *
 * Built explicitly rather than by rotating a 4-sided cone: the cone's radius
 * maps to the roof height through the rotation and scale, which made the real
 * building height hard to predict (and got two samples wrong).
 * Ridge runs along X at `height` above the eaves.
 */
function pitchedRoof(width: number, depth: number, height: number): THREE.Mesh {
  const w = width / 2;
  const d = depth / 2;
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  const ridgeL = [-w, height, 0];
  const ridgeR = [w, height, 0];
  // Front and back slopes (two triangles each).
  tri([-w, 0, d], [w, 0, d], ridgeR);
  tri([-w, 0, d], ridgeR, ridgeL);
  tri([w, 0, -d], [-w, 0, -d], ridgeL);
  tri([w, 0, -d], ridgeL, ridgeR);
  // Gable ends.
  tri([-w, 0, -d], [-w, 0, d], ridgeL);
  tri([w, 0, d], [w, 0, -d], ridgeR);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, mat());
}

/* ------------------------------------------------------------------ */

function buildSetbackTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'setback-tower';
  const blocks: [number, number, number, number, number, number][] = [
    // w, h, d, x, y, z
    [126, 26, 56, 0, 0, 0],
    [40, 20, 34, -60, 0, -34], // asymmetric wing
    [96, 28, 50, 0, 26, 0],
    [68, 24, 44, 0, 54, 0],
    [44, 154, 36, 0, 78, 0],
    [34, 40, 30, 0, 232, 0],
    [24, 34, 22, 0, 272, 0],
    [15, 20, 14, 0, 306, 0],
  ];
  for (const [w, h, d, x, y, z] of blocks) box(g, w, h, d, x, y, z);
  // Parapet ledges at each setback.
  for (const [w, h, d, x, y, z] of blocks.slice(0, 6)) {
    box(g, w + 1.6, 1.2, d + 1.6, x, y + h - 1.2, z);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 4.5, 55, 16), mat());
  mast.position.set(0, 326 + 27.5, 0);
  g.add(mast);
  return g;
}

function buildTerrace(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'terrace';
  // Four terraced houses, 6 m wide each, with a stepped roofline and a rear
  // extension — small enough that one bay of scaffold is clearly readable.
  const heights = [11.5, 11.5, 12.8, 11.5];
  let x = -12;
  for (const h of heights) {
    box(g, 6, h, 9, x + 3, 0, 0);
    const roof = pitchedRoof(6, 9, 2.2);
    roof.position.set(x + 3, h, 0);
    g.add(roof);
    // Chimney
    box(g, 0.9, 2.2, 0.9, x + 5, h + 1.4, 2.4);
    x += 6;
  }
  box(g, 9, 3.2, 4, -1.5, 0, -6.5); // rear extension
  return g;
}

function buildLShape(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'l-block';
  // Two wings meeting at a re-entrant corner, plus a taller stair core.
  box(g, 46, 24, 18, 0, 0, 0);
  box(g, 18, 24, 40, -14, 0, -29);
  box(g, 12, 33, 12, -14, 0, -5);
  box(g, 48, 1.0, 20, 0, 24, 0); // parapets
  box(g, 20, 1.0, 42, -14, 24, -29);
  return g;
}

function buildCylinder(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'round-tower';
  // Curved façade — the generator has to approximate the circle with bays.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, 62, 48), mat());
  shaft.position.set(0, 31, 0);
  g.add(shaft);
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 8, 48), mat());
  podium.position.set(0, 4, 0);
  g.add(podium);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(15, 13, 3, 48), mat());
  cap.position.set(0, 63.5, 0);
  g.add(cap);
  return g;
}

function buildCrossTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cross-tower';
  // Cruciform plan: 12 corners per ring, and the wings stop before the core.
  box(g, 54, 62, 16, 0, 0, 0);
  box(g, 16, 62, 54, 0, 0, 0);
  box(g, 22, 88, 22, 0, 0, 0);
  box(g, 24, 1.2, 24, 0, 88, 0);
  box(g, 56, 1.2, 18, 0, 62, 0);
  box(g, 18, 1.2, 56, 0, 62, 0);
  return g;
}

function buildWarehouse(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'warehouse';
  box(g, 62, 9.5, 26, 0, 0, 0);
  const roof = pitchedRoof(62, 26, 4);
  roof.position.set(0, 9.5, 0);
  g.add(roof);
  box(g, 8, 11.5, 8, -35, 0, 0); // office annexe
  return g;
}

export const SAMPLE_BUILDINGS: SampleBuilding[] = [
  {
    id: 'terrace',
    name: 'Terrace houses',
    height: 16.4,
    description: 'Four houses — best view of individual bays and rails',
    build: buildTerrace,
  },
  {
    id: 'lshape',
    name: 'L-shaped block',
    height: 33,
    description: 'Re-entrant corner + stair core',
    build: buildLShape,
  },
  {
    id: 'warehouse',
    name: 'Warehouse shed',
    height: 13.5,
    description: 'Long low façade with a pitched roof',
    build: buildWarehouse,
  },
  {
    id: 'cylinder',
    name: 'Round tower',
    height: 65,
    description: 'Curved façade approximated by straight bays',
    build: buildCylinder,
  },
  {
    id: 'cross',
    name: 'Cruciform tower',
    height: 89.2,
    description: 'Four wings — many corners per ring',
    build: buildCrossTower,
  },
  {
    id: 'setback',
    name: 'Setback high-rise',
    height: 381,
    description: 'Progressive setbacks, wing and mast',
    build: buildSetbackTower,
  },
];

export function findSample(id: string): SampleBuilding {
  return SAMPLE_BUILDINGS.find((s) => s.id === id) ?? SAMPLE_BUILDINGS[0];
}
