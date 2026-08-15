/**
 * Application state.
 *
 * The store owns the pipeline:
 *   model → analysis (worker) → scale → scaffold generation → estimate
 * Each stage is invalidated by the stage above it. UI components only read
 * state and call actions; no geometry logic lives in React.
 */

import * as THREE from 'three';
import { create } from 'zustand';
import type {
  BuildingAnalysis,
  BuildingModel,
  ComponentType,
  MaterialSpec,
  ScaffoldComponent,
  ScaffoldConfiguration,
  ScaffoldEstimate,
  ScaffoldModel,
  ScaleUnit,
} from '../scaffolding/types';
import { scaleAnalysis } from '../scaffolding/geometry/buildingAnalyzer';
import { generateScaffold } from '../scaffolding/geometry/scaffoldGenerator';
import { calculateQuantities } from '../scaffolding/calculations/quantityCalculator';
import {
  BUILTIN_MATERIALS,
  DECK_SPECS,
  defaultDeckForSystem,
  defaultMaterialForSystem,
  findMaterial,
  findSheeting,
} from '../scaffolding/materials/materialLibrary';
import { findSample } from '../three/sampleBuildings';
import { extractTriangles, hasGeometry, loadModelFile, normalizeTransform } from '../three/modelLoader';
import type { AnalysisRequest, AnalysisResponse } from '../workers/analysis.worker';

export type ColorMode = 'normal' | 'type' | 'height' | 'material';
export type ViewportTool = 'orbit' | 'measure' | 'select';

export const DEFAULT_CONFIG: ScaffoldConfiguration = {
  system: 'steel-tube',
  horizontalSpacing: 1.8,
  verticalSpacing: 2.0,
  buildingOffset: 0.3,
  scaffoldRows: 1,
  platformWidth: 0.75,
  standardLength: 3.0,
  horizontalMemberLength: 2.5,
  braceMode: 'every2',
  braceEveryNLevels: 2,
  braceEveryNBays: 4,
  topExtension: 1.5,
  baseHeight: 0,
  heightFraction: 1,
  platformEveryNLevels: 1,
  toeBoards: true,
  guardRails: true,
  sheeting: 'none',
  disabledLevels: [],
};

export const UNIT_SCALES: Record<Exclude<ScaleUnit, 'custom'>, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  in: 0.0254,
  ft: 0.3048,
};

interface Measurement {
  id: number;
  a: [number, number, number];
  b: [number, number, number];
}

interface AppState {
  /* --- model ------------------------------------------------------- */
  object: THREE.Object3D | null;
  building: BuildingModel | null;
  /** Analysis in raw model units — scaled on demand. */
  rawAnalysis: BuildingAnalysis | null;
  analysis: BuildingAnalysis | null;
  status: 'idle' | 'loading' | 'analysing' | 'generating' | 'ready';
  /** Which built-in sample is loaded, if any. */
  sampleId: string | null;
  error: string | null;
  notices: string[];

  /* --- configuration ----------------------------------------------- */
  config: ScaffoldConfiguration;
  materials: MaterialSpec[];
  materialId: string;
  deckId: string;

  /* --- results ------------------------------------------------------ */
  scaffold: ScaffoldModel | null;
  estimate: ScaffoldEstimate | null;
  autoUpdate: boolean;

  /* --- viewport ----------------------------------------------------- */
  showBuilding: boolean;
  showScaffold: boolean;
  showGrid: boolean;
  buildingOpacity: number;
  scaffoldOpacity: number;
  /**
   * Display-only thickness multiplier for scaffold members. A 48 mm tube on a
   * 380 m tower is sub-pixel, so members are drawn exaggerated by default.
   * 0 = auto (derived from building height). Quantities are never affected.
   */
  memberDisplayScale: number;
  colorMode: ColorMode;
  visibleTypes: Record<ComponentType, boolean>;
  tool: ViewportTool;
  measurements: Measurement[];
  pendingPoint: [number, number, number] | null;
  clipEnabled: boolean;
  clipAxis: 'x' | 'y' | 'z';
  clipPosition: number;
  clipFlip: boolean;
  selected: ScaffoldComponent | null;
  cameraCommand: { kind: string; token: number } | null;

  /* --- actions ------------------------------------------------------ */
  loadDemo: () => Promise<void>;
  loadSample: (id: string) => Promise<void>;
  loadFile: (file: File) => Promise<void>;
  setScale: (scale: number, unit?: ScaleUnit) => void;
  calibrateToHeight: (heightMeters: number) => void;
  /**
   * @param live pass true while a slider is being dragged — regeneration is
   * then throttled to the model's own generation cost instead of running on
   * every pixel of drag.
   */
  setConfig: (patch: Partial<ScaffoldConfiguration>, live?: boolean) => void;
  setSystem: (system: ScaffoldConfiguration['system']) => void;
  setMaterialId: (id: string) => void;
  setDeckId: (id: string) => void;
  upsertMaterial: (material: MaterialSpec) => void;
  removeMaterial: (id: string) => void;
  generate: () => void;
  recalculate: () => void;
  setView: (patch: Partial<AppState>) => void;
  toggleType: (type: ComponentType) => void;
  addMeasurePoint: (p: [number, number, number]) => void;
  clearMeasurements: () => void;
  select: (component: ScaffoldComponent | null) => void;
  deleteSelected: () => void;
  toggleLevel: (level: number) => void;
  runCamera: (kind: string) => void;
  dismissError: () => void;
  applySnapshot: (snapshot: ProjectSnapshot) => void;
}

export interface ProjectSnapshot {
  version: 1;
  savedAt: string;
  name: string;
  config: ScaffoldConfiguration;
  materials: MaterialSpec[];
  materialId: string;
  deckId: string;
  scale: number;
  scaleUnit: ScaleUnit;
  buildingSource: BuildingModel['source'];
  buildingName: string;
}

let worker: Worker | null = null;
let requestId = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

function analyzeInWorker(positions: Float32Array): Promise<BuildingAnalysis> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const w = getWorker();
    const onMessage = (event: MessageEvent<AnalysisResponse>) => {
      if (event.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (event.data.ok) resolve(event.data.analysis);
      else reject(new Error(event.data.error));
    };
    const onError = (event: ErrorEvent) => {
      w.removeEventListener('error', onError);
      reject(new Error(event.message || 'Analysis worker failed.'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError, { once: true });
    const request: AnalysisRequest = { id, positions };
    w.postMessage(request, [positions.buffer]);
  });
}

/**
 * Configuration keys that change the generated geometry. Everything else (stock
 * lengths, for instance) only feeds the take-off, so it re-runs the calculator
 * without regenerating a single member.
 */
const GEOMETRY_KEYS = new Set<keyof ScaffoldConfiguration>([
  'horizontalSpacing',
  'verticalSpacing',
  'buildingOffset',
  'scaffoldRows',
  'platformWidth',
  'braceMode',
  'braceEveryNLevels',
  'braceEveryNBays',
  'topExtension',
  'baseHeight',
  'heightFraction',
  'platformEveryNLevels',
  'toeBoards',
  'guardRails',
  'sheeting',
  'disabledLevels',
  'system',
]);

/**
 * Live-drag regeneration throttle.
 *
 * A slider fires far faster than a 90 000-member scaffold can be rebuilt, so
 * regeneration is coalesced and paced by how long the last generation actually
 * took: cheap models update almost every frame, expensive ones settle down to a
 * few updates a second, and the final value always lands via the trailing run.
 */
let regenTimer: ReturnType<typeof setTimeout> | null = null;
let lastGenerationCost = 40;

function scheduleGenerate(run: () => void) {
  if (regenTimer !== null) return;
  const delay = Math.min(400, Math.max(16, lastGenerationCost * 1.2));
  regenTimer = setTimeout(() => {
    regenTimer = null;
    run();
  }, delay);
}

export const useAppStore = create<AppState>((set, get) => ({
  object: null,
  building: null,
  rawAnalysis: null,
  analysis: null,
  status: 'idle',
  sampleId: null,
  error: null,
  notices: [],

  config: DEFAULT_CONFIG,
  materials: BUILTIN_MATERIALS,
  materialId: 'steel-48-3',
  deckId: 'steel-deck',

  scaffold: null,
  estimate: null,
  autoUpdate: true,

  showBuilding: true,
  showScaffold: true,
  showGrid: true,
  buildingOpacity: 1,
  scaffoldOpacity: 1,
  memberDisplayScale: 0,
  colorMode: 'normal',
  visibleTypes: {
    standard: true,
    ledger: true,
    transom: true,
    brace: true,
    platform: true,
    toeboard: true,
    guardrail: true,
    sheeting: true,
  },
  tool: 'orbit',
  measurements: [],
  pendingPoint: null,
  clipEnabled: false,
  clipAxis: 'y',
  clipPosition: 0.5,
  clipFlip: false,
  selected: null,
  cameraCommand: null,

  /* ------------------------------------------------------------------ */

  loadDemo() {
    // The terrace is the sample where a bay, a deck and a guard rail are
    // legible at true member size — a better first impression than the tower.
    return get().loadSample('terrace');
  },

  async loadSample(id: string) {
    set({ status: 'loading', error: null, notices: [], scaffold: null, estimate: null });
    try {
      const sample = findSample(id);
      const object = sample.build();
      normalizeTransform(object);
      const { positions, sampled } = extractTriangles(object);
      set({ status: 'analysing' });
      const raw = await analyzeInWorker(positions);
      // Samples are authored in metres, so their scale factor is exactly 1.
      const scale = 1;
      const analysis = scaleAnalysis(raw, scale);
      set({
        object,
        building: {
          id: `sample-${sample.id}`,
          name: sample.name,
          source: 'demo',
          format: 'procedural',
          scale,
          scaleUnit: 'm',
          analysis,
        },
        sampleId: sample.id,
        rawAnalysis: raw,
        analysis,
        status: 'ready',
        notices: [
          ...raw.warnings,
          ...(sampled ? ['Mesh subsampled for analysis.'] : []),
          `${sample.name}: ${sample.description}.`,
        ],
      });
      get().generate();
    } catch (error) {
      set({ status: 'idle', error: error instanceof Error ? error.message : String(error) });
    }
  },

  async loadFile(file: File) {
    set({ status: 'loading', error: null, notices: [], scaffold: null, estimate: null });
    try {
      const object = await loadModelFile(file);
      if (!hasGeometry(object)) {
        throw new Error('No usable geometry found in this file.');
      }
      normalizeTransform(object);
      const { positions, sampled, triangleCount } = extractTriangles(object);
      if (triangleCount === 0) throw new Error('Model contains no triangles.');
      set({ status: 'analysing' });
      const raw = await analyzeInWorker(positions);

      // Heuristic unit guess: a building 2 model units tall is almost certainly
      // not 2 m, and one 300 000 units tall is millimetres, not metres.
      const guess = guessScale(raw.height);
      const analysis = scaleAnalysis(raw, guess.scale);
      const notices = [...raw.warnings];
      if (sampled) notices.push('Large mesh — subsampled for analysis.');
      if (guess.note) notices.push(guess.note);

      set({
        object,
        building: {
          id: `upload-${Date.now()}`,
          name: file.name,
          source: 'upload',
          format: file.name.split('.').pop()?.toUpperCase() ?? '',
          scale: guess.scale,
          scaleUnit: guess.unit,
          analysis,
        },
        sampleId: null,
        rawAnalysis: raw,
        analysis,
        status: 'ready',
        notices,
      });
      get().generate();
    } catch (error) {
      set({
        status: get().object ? 'ready' : 'idle',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  setScale(scale, unit = 'custom') {
    const raw = get().rawAnalysis;
    const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
    if (!raw) return;
    const analysis = scaleAnalysis(raw, safe);
    const building = get().building;
    set({
      analysis,
      building: building ? { ...building, scale: safe, scaleUnit: unit, analysis } : building,
    });
    if (get().autoUpdate && get().scaffold) get().generate();
  },

  calibrateToHeight(heightMeters) {
    const raw = get().rawAnalysis;
    if (!raw || !(heightMeters > 0)) return;
    // scale = desired real height / height in model units
    get().setScale(heightMeters / raw.height, 'custom');
  },

  setConfig(patch, live = false) {
    set((s) => ({ config: { ...s.config, ...patch }, selected: null }));
    const keys = Object.keys(patch) as (keyof ScaffoldConfiguration)[];
    const needsGeometry = keys.some((k) => GEOMETRY_KEYS.has(k));
    if (!needsGeometry) {
      get().recalculate();
      return;
    }
    if (!get().autoUpdate || !get().scaffold) return;
    if (live) scheduleGenerate(() => get().generate());
    else get().generate();
  },

  setSystem(system) {
    const materialId = defaultMaterialForSystem(system);
    const deckId = defaultDeckForSystem(system);
    // Each system carries its own typical grid and stock lengths. Applying the
    // whole set (rather than forcing some fields and preserving others) keeps
    // switching systems symmetric: steel → bamboo → steel returns to steel.
    const presets: Record<string, Partial<ScaffoldConfiguration>> = {
      bamboo: {
        horizontalSpacing: 1.2,
        verticalSpacing: 1.5,
        standardLength: 6,
        horizontalMemberLength: 5,
      },
      'steel-tube': {
        horizontalSpacing: 1.8,
        verticalSpacing: 2.0,
        standardLength: 3,
        horizontalMemberLength: 2.5,
      },
      aluminium: {
        horizontalSpacing: 1.8,
        verticalSpacing: 2.0,
        standardLength: 3,
        horizontalMemberLength: 2.5,
      },
    };
    set((s) => ({
      config: { ...s.config, system, ...(presets[system] ?? {}) },
      materialId,
      deckId,
    }));
    if (get().scaffold) get().generate();
  },

  setMaterialId(id) {
    set({ materialId: id });
    get().recalculate();
  },
  setDeckId(id) {
    set({ deckId: id });
    get().recalculate();
  },
  upsertMaterial(material) {
    set((s) => {
      const idx = s.materials.findIndex((m) => m.id === material.id);
      const materials = s.materials.slice();
      if (idx >= 0) materials[idx] = material;
      else materials.push(material);
      return { materials };
    });
    get().recalculate();
  },
  removeMaterial(id) {
    set((s) => {
      const materials = s.materials.filter((m) => m.id !== id || m.builtIn);
      return {
        materials,
        // Fall back to a material that still exists after the removal.
        materialId: materials.some((m) => m.id === s.materialId)
          ? s.materialId
          : (materials[0]?.id ?? 'steel-48-3'),
      };
    });
    get().recalculate();
  },

  generate() {
    const { analysis, config, materialId } = get();
    if (!analysis) return;
    set({ status: 'generating', selected: null });
    try {
      const scaffold = generateScaffold(analysis.raster, analysis.height, config, materialId);
      lastGenerationCost = scaffold.generationMs;
      set({ scaffold, status: 'ready' });
      get().recalculate();
    } catch (error) {
      set({ status: 'ready', error: error instanceof Error ? error.message : String(error) });
    }
  },

  recalculate() {
    const { scaffold, config, materials, materialId, deckId, analysis } = get();
    if (!scaffold || !analysis) return;
    const material = findMaterial(materials, materialId);
    const deck = DECK_SPECS.find((d) => d.id === deckId) ?? DECK_SPECS[0];
    const sheeting = findSheeting(config.sheeting);
    const estimate = calculateQuantities({
      model: scaffold,
      config,
      material,
      deck,
      sheeting,
      buildingHeight: analysis.height,
    });
    set({ estimate });
  },

  setView(patch) {
    set(patch as Partial<AppState>);
  },
  toggleType(type) {
    set((s) => ({ visibleTypes: { ...s.visibleTypes, [type]: !s.visibleTypes[type] } }));
  },
  addMeasurePoint(p) {
    const pending = get().pendingPoint;
    if (!pending) {
      set({ pendingPoint: p });
    } else {
      set((s) => ({
        measurements: [...s.measurements, { id: Date.now(), a: pending, b: p }],
        pendingPoint: null,
      }));
    }
  },
  clearMeasurements() {
    set({ measurements: [], pendingPoint: null });
  },
  select(component) {
    set({ selected: component });
  },
  deleteSelected() {
    const { selected, scaffold } = get();
    if (!selected || !scaffold) return;
    const components = scaffold.components.filter((c) => c.id !== selected.id);
    set({ scaffold: { ...scaffold, components }, selected: null });
    get().recalculate();
  },
  toggleLevel(level) {
    const disabled = new Set(get().config.disabledLevels);
    if (disabled.has(level)) disabled.delete(level);
    else disabled.add(level);
    get().setConfig({ disabledLevels: Array.from(disabled).sort((a, b) => a - b) });
    if (!get().autoUpdate) get().generate();
  },
  runCamera(kind) {
    set({ cameraCommand: { kind, token: Date.now() } });
  },
  dismissError() {
    set({ error: null });
  },
  applySnapshot(snapshot) {
    set({
      config: { ...DEFAULT_CONFIG, ...snapshot.config },
      materials: snapshot.materials?.length ? snapshot.materials : BUILTIN_MATERIALS,
      materialId: snapshot.materialId,
      deckId: snapshot.deckId,
    });
    const raw = get().rawAnalysis;
    if (raw && snapshot.scale > 0) get().setScale(snapshot.scale, snapshot.scaleUnit);
    get().generate();
  },
}));

/**
 * Guess the model's units from its raw height.
 * Real buildings are 3–900 m tall; anything far outside that band tells us the
 * file is authored in another unit (or in "arbitrary" units).
 */
function guessScale(rawHeight: number): { scale: number; unit: ScaleUnit; note?: string } {
  if (rawHeight >= 3 && rawHeight <= 900) return { scale: 1, unit: 'm' };
  if (rawHeight > 900 && rawHeight <= 900_000) {
    if (rawHeight <= 90_000)
      return {
        scale: 0.01,
        unit: 'cm',
        note: `Model is ${rawHeight.toFixed(0)} units tall — assumed centimetres. Check the scale panel.`,
      };
    return {
      scale: 0.001,
      unit: 'mm',
      note: `Model is ${rawHeight.toFixed(0)} units tall — assumed millimetres. Check the scale panel.`,
    };
  }
  if (rawHeight < 3 && rawHeight > 0) {
    const scale = 30 / rawHeight;
    return {
      scale,
      unit: 'custom',
      note: `Model is only ${rawHeight.toFixed(3)} units tall — normalised to a 30 m building. Calibrate to the real height.`,
    };
  }
  return { scale: 1, unit: 'm' };
}

export const selectMaterial = (s: AppState): MaterialSpec => findMaterial(s.materials, s.materialId);

/**
 * Effective member thickness multiplier. Auto mode scales with the building so
 * a 30 m façade draws members near true size while a 380 m tower exaggerates
 * them enough to stay visible — a planning view, not a rendering.
 */
export const selectMemberScale = (s: AppState): number => {
  if (s.memberDisplayScale > 0) return s.memberDisplayScale;
  const h = s.analysis?.height ?? 60;
  return Math.min(6, Math.max(1, h / 60));
};
export const selectDeck = (s: AppState) => DECK_SPECS.find((d) => d.id === s.deckId) ?? DECK_SPECS[0];
