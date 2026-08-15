/**
 * Material library.
 *
 * Built-in entries use published nominal figures for common scaffold tube:
 *  - EN 39 steel tube: 48.3 mm OD × 3.2 mm wall ≈ 3.56 kg/m
 *  - Aluminium tube:   48.3 mm OD × 4.0 mm wall ≈ 1.67 kg/m
 *  - Bamboo (Kao Jue): ~75 mm OD culm, ~3.0 kg/m air-dried
 * Users can override every number and add their own materials.
 */

import type { MaterialSpec, SheetingKind, SheetingSpec } from '../types';

export const BUILTIN_MATERIALS: MaterialSpec[] = [
  {
    id: 'steel-48-3',
    name: 'Steel tube 48.3 × 3.2',
    kind: 'steel',
    diameterMm: 48.3,
    wallThicknessMm: 3.2,
    weightPerMeter: 3.56,
    pricePerMeter: 4.2,
    standardLengths: [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 6.0],
    color: '#68747f',
    roughness: 0.45,
    metalness: 0.85,
    builtIn: true,
  },
  {
    id: 'aluminium-48-3',
    name: 'Aluminium tube 48.3 × 4.0',
    kind: 'aluminium',
    diameterMm: 48.3,
    wallThicknessMm: 4.0,
    weightPerMeter: 1.67,
    pricePerMeter: 9.5,
    standardLengths: [1.0, 1.5, 2.0, 2.5, 3.0, 4.0],
    color: '#8b98a6',
    roughness: 0.3,
    metalness: 0.95,
    builtIn: true,
  },
  {
    id: 'bamboo-kao-jue',
    name: 'Bamboo — Kao Jue 75 mm',
    kind: 'bamboo',
    diameterMm: 75,
    wallThicknessMm: 10,
    weightPerMeter: 3.0,
    pricePerMeter: 1.6,
    standardLengths: [3.0, 4.0, 5.0, 6.0, 7.0],
    color: '#b58724',
    roughness: 0.75,
    metalness: 0.0,
    builtIn: true,
  },
  {
    id: 'bamboo-mao-jue',
    name: 'Bamboo — Mao Jue 40 mm',
    kind: 'bamboo',
    diameterMm: 40,
    wallThicknessMm: 6,
    weightPerMeter: 1.4,
    pricePerMeter: 0.9,
    standardLengths: [3.0, 4.0, 5.0, 6.0],
    color: '#c69a3f',
    roughness: 0.8,
    metalness: 0.0,
    builtIn: true,
  },
];

/** Deck material is priced/weighed by area, not by length. */
export interface DeckSpec {
  id: string;
  name: string;
  weightPerSqm: number;
  pricePerSqm: number;
  color: string;
}

export const DECK_SPECS: DeckSpec[] = [
  { id: 'steel-deck', name: 'Steel deck 0.32 m', weightPerSqm: 19.5, pricePerSqm: 26, color: '#5f6a78' },
  { id: 'timber-board', name: 'Timber board 38 mm', weightPerSqm: 22.0, pricePerSqm: 14, color: '#96703f' },
  { id: 'bamboo-mat', name: 'Bamboo mat deck', weightPerSqm: 9.0, pricePerSqm: 7, color: '#a98c46' },
  { id: 'alu-deck', name: 'Aluminium deck', weightPerSqm: 11.5, pricePerSqm: 42, color: '#93a0ad' },
];

/**
 * Façade sheeting. Weights are typical published figures for scaffold wrap:
 * debris netting ~0.06 kg/m², shrink-wrap ~0.25 kg/m², printed banner ~0.4 kg/m².
 */
export const SHEETING_SPECS: SheetingSpec[] = [
  { id: 'none', name: 'None', weightPerSqm: 0, pricePerSqm: 0, color: '#000000', opacity: 0 },
  {
    id: 'netting',
    name: 'Debris netting',
    weightPerSqm: 0.06,
    pricePerSqm: 2.4,
    color: '#3f7f5f',
    opacity: 0.34,
  },
  {
    id: 'shrinkwrap',
    name: 'Shrink-wrap',
    weightPerSqm: 0.25,
    pricePerSqm: 8.5,
    color: '#c8d2dc',
    opacity: 0.55,
  },
  {
    id: 'banner',
    name: 'Printed banner',
    weightPerSqm: 0.4,
    pricePerSqm: 14,
    color: '#2f5f9e',
    opacity: 0.82,
  },
];

export function findSheeting(id: SheetingKind): SheetingSpec {
  return SHEETING_SPECS.find((s) => s.id === id) ?? SHEETING_SPECS[0];
}

export function findMaterial(list: MaterialSpec[], id: string): MaterialSpec {
  return list.find((m) => m.id === id) ?? list[0] ?? BUILTIN_MATERIALS[0];
}

export function defaultMaterialForSystem(system: string): string {
  if (system === 'bamboo') return 'bamboo-kao-jue';
  if (system === 'aluminium') return 'aluminium-48-3';
  return 'steel-48-3';
}

export function defaultDeckForSystem(system: string): string {
  if (system === 'bamboo') return 'bamboo-mat';
  if (system === 'aluminium') return 'alu-deck';
  return 'steel-deck';
}

/**
 * Weight of a hollow circular section, kg/m, from geometry + density.
 * Useful when a user types a diameter/wall but not a mass.
 *   m/l = ρ · π/4 · (D² − (D − 2t)²)
 */
export function tubeWeightPerMeter(
  diameterMm: number,
  wallMm: number,
  densityKgM3: number,
): number {
  const d = diameterMm / 1000;
  const inner = Math.max(0, d - (2 * wallMm) / 1000);
  const areaM2 = (Math.PI / 4) * (d * d - inner * inner);
  return areaM2 * densityKgM3;
}

export const DENSITIES: Record<string, number> = {
  steel: 7850,
  aluminium: 2700,
  bamboo: 700,
  timber: 550,
  custom: 1000,
};
