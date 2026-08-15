/**
 * Core data structures for the scaffolding domain.
 *
 * Deliberately free of any Three.js types: the whole `scaffolding/` folder is a
 * pure-TypeScript calculation engine that operates on plain numeric data. That
 * keeps it usable from a Web Worker, a Node server, a mobile app or a future
 * BIM/API integration without dragging a renderer along.
 *
 * Coordinate convention (matches Three.js world space):
 *   X = east/west, Z = north/south, Y = up. Ground plane is Y = 0.
 * All lengths are METRES unless a field name says otherwise.
 */

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/* ------------------------------------------------------------------ */
/* Building                                                            */
/* ------------------------------------------------------------------ */

export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

/** Result of analysing an imported (or generated) building mesh. */
export interface BuildingAnalysis {
  /** Bounding box in real-world metres, already scaled and ground-aligned. */
  bbox: BoundingBox;
  height: number;
  width: number; // X extent
  depth: number; // Z extent
  /** Area of the ground-level footprint (m²), from the occupancy raster. */
  footprintArea: number;
  /** Perimeter of the ground-level footprint (m). */
  footprintPerimeter: number;
  /** Sum of triangle areas of outward-ish faces — approximate façade area (m²). */
  exteriorArea: number;
  /** Triangles whose normal is within ~30° of horizontal, grouped by direction. */
  majorFaces: number;
  triangleCount: number;
  highestPoint: number;
  lowestPoint: number;
  /** Vertical occupancy raster used by the scaffold generator. */
  raster: OccupancyRaster;
  /** Non-fatal problems detected while analysing (shown in the UI). */
  warnings: string[];
}

/**
 * A stack of horizontal binary slices of the building.
 *
 * The building is voxelised once, at a resolution independent of the scaffold
 * configuration, so that changing spacing/offset only re-runs the cheap
 * contour+offset step rather than the expensive triangle rasterisation.
 *
 * `data` is a bit-per-cell array of `slabCount * nx * nz` bytes (1 byte/cell for
 * simplicity), indexed as: slab * nx * nz + iz * nx + ix.
 */
export interface OccupancyRaster {
  data: Uint8Array;
  nx: number;
  nz: number;
  slabCount: number;
  /** XZ cell size in metres. */
  cell: number;
  /** Vertical slab thickness in metres. */
  slabHeight: number;
  /** World-space origin of cell (0,0) — the raster's min corner. */
  originX: number;
  originZ: number;
  /** World Y of the bottom of slab 0. */
  originY: number;
}

export type ScaleUnit = 'm' | 'cm' | 'mm' | 'in' | 'ft' | 'custom';

export interface BuildingModel {
  id: string;
  name: string;
  source: 'demo' | 'upload' | 'public';
  format: string;
  /** Metres per model unit. */
  scale: number;
  scaleUnit: ScaleUnit;
  analysis: BuildingAnalysis | null;
}

/* ------------------------------------------------------------------ */
/* Scaffold configuration                                              */
/* ------------------------------------------------------------------ */

export type ScaffoldSystem = 'steel-tube' | 'bamboo' | 'aluminium';
export type BraceMode = 'none' | 'every' | 'every2' | 'every3' | 'custom';

export interface ScaffoldConfiguration {
  system: ScaffoldSystem;
  /** Bay length — distance between vertical standards along the façade. */
  horizontalSpacing: number;
  /** Lift height — distance between scaffold levels. */
  verticalSpacing: number;
  /** Clear distance between the building surface and the inner standards. */
  buildingOffset: number;
  /** Number of standard rows (bays deep). 1 = single-row façade scaffold. */
  scaffoldRows: number;
  /** Deck width of one row. */
  platformWidth: number;
  /** Purchasable length of a vertical standard — drives piece counts. */
  standardLength: number;
  /** Purchasable length of a horizontal member — drives piece counts. */
  horizontalMemberLength: number;
  braceMode: BraceMode;
  /** Used when braceMode === 'custom': brace every N levels. */
  braceEveryNLevels: number;
  /** Brace every N bays around the perimeter (façade bracing density). */
  braceEveryNBays: number;
  /** Extra scaffold height above the building (guard-rail lift). */
  topExtension: number;
  /** Scaffold does not start below this height (e.g. clear a canopy). */
  baseHeight: number;
  /** Fraction of building height to scaffold (1 = full height). */
  heightFraction: number;
  /** Decks on every Nth level only (1 = every level). */
  platformEveryNLevels: number;
  toeBoards: boolean;
  /** Double guard rail (top + mid) on the outer face of every decked lift. */
  guardRails: boolean;
  /** Façade sheeting applied to the outer face — also a priced material. */
  sheeting: SheetingKind;
  /** Manual per-level overrides from interactive editing. */
  disabledLevels: number[];
}

export type SheetingKind = 'none' | 'netting' | 'shrinkwrap' | 'banner';

export interface SheetingSpec {
  id: SheetingKind;
  name: string;
  weightPerSqm: number;
  pricePerSqm: number;
  color: string;
  opacity: number;
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

export interface MaterialSpec {
  id: string;
  name: string;
  kind: 'steel' | 'bamboo' | 'aluminium' | 'timber' | 'custom';
  /** Outer diameter in mm (tube/pole). */
  diameterMm: number;
  /** Wall thickness in mm — 0 for solid members such as bamboo. */
  wallThicknessMm: number;
  /** Linear mass, kg per metre. */
  weightPerMeter: number;
  /** Currency units per metre. */
  pricePerMeter: number;
  /** Stock lengths available for purchase (m). */
  standardLengths: number[];
  /** Render colour (hex). */
  color: string;
  /** 0..1 — feeds the PBR material of the 3D view. */
  roughness: number;
  metalness: number;
  builtIn: boolean;
}

/* ------------------------------------------------------------------ */
/* Generated scaffold                                                  */
/* ------------------------------------------------------------------ */

export type ComponentType =
  | 'standard'
  | 'ledger'
  | 'transom'
  | 'brace'
  | 'platform'
  | 'toeboard'
  | 'guardrail'
  | 'sheeting';

export interface ScaffoldComponent {
  id: number;
  type: ComponentType;
  /** Mid-point of the member, world space. */
  position: Vec3;
  /** Unit vector along the member's length. */
  direction: Vec3;
  length: number;
  /** Cross-member width — only meaningful for platforms. */
  width: number;
  level: number;
  row: number;
  bay: number;
  materialId: string;
}

export interface ScaffoldLevel {
  index: number;
  /** World Y of the deck/ledger plane of this level. */
  elevation: number;
  liftHeight: number;
  /** Node positions of the innermost row, closed loop. */
  nodes: Vec2[];
  /** Outward unit normal at each node. */
  normals: Vec2[];
  perimeter: number;
}

export interface ScaffoldModel {
  components: ScaffoldComponent[];
  levels: ScaffoldLevel[];
  /** Wall-clock milliseconds the generation took — surfaced in the UI. */
  generationMs: number;
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Estimation                                                          */
/* ------------------------------------------------------------------ */

/** A single line of the quantity take-off, with its own audit trail. */
export interface QuantityLine {
  key: string;
  label: string;
  /** Total member length (m) — 0 for area-based lines. */
  totalLength: number;
  /** Total deck area (m²) — 0 for length-based lines. */
  totalArea: number;
  pieces: number;
  weightKg: number;
  /** Human-readable derivation, e.g. "133 bays × 125 levels × 1 row". */
  explanation: string[];
}

export interface ScaffoldEstimate {
  lines: QuantityLine[];
  scaffoldHeight: number;
  maxPerimeter: number;
  /** Sum of (perimeter × lift height) over all levels — the façade area. */
  scaffoldSurface: number;
  levels: number;
  totalTubeLength: number;
  totalDeckArea: number;
  totalSheetingArea: number;
  connectors: number;
  totalWeightKg: number;
  componentCounts: Record<ComponentType, number>;
}

export const DISCLAIMER =
  'Scaffolding quantities generated by this application are preliminary planning estimates only. ' +
  'They are not a substitute for structural engineering, site assessment, manufacturer requirements, ' +
  'local regulations, or a certified scaffolding design.';
