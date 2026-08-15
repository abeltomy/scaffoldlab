/**
 * Quantity take-off.
 *
 * Every line records not just the number but the derivation behind it, so the
 * UI can show "how was this calculated?" — the estimate must be auditable,
 * because it is a planning figure someone will price work against.
 *
 * Piece counts: members are cut from stock lengths, so
 *   pieces = Σ ceil(memberLength / stockLength)   … for members longer than stock
 * and members shorter than stock consume one piece each. That is the
 * purchasing/hire figure, not the number of drawn members.
 */

import type {
  ComponentType,
  MaterialSpec,
  QuantityLine,
  ScaffoldComponent,
  ScaffoldConfiguration,
  ScaffoldEstimate,
  ScaffoldModel,
  SheetingSpec,
} from '../types';
import type { DeckSpec } from '../materials/materialLibrary';

const LABELS: Record<ComponentType, string> = {
  standard: 'Vertical standards',
  ledger: 'Horizontal ledgers',
  transom: 'Transoms / putlogs',
  brace: 'Diagonal braces',
  platform: 'Working platforms',
  toeboard: 'Toe boards',
  guardrail: 'Guard rails',
  sheeting: 'Façade sheeting',
};

interface Bucket {
  length: number;
  area: number;
  count: number;
  pieces: number;
  maxLen: number;
  minLen: number;
}

function emptyBucket(): Bucket {
  return { length: 0, area: 0, count: 0, pieces: 0, maxLen: 0, minLen: Infinity };
}

/** `stock <= 0` means the item is bought whole (a deck, a sheeting panel). */
function piecesFor(length: number, stock: number): number {
  if (stock <= 0) return 1;
  return Math.max(1, Math.ceil(length / stock - 1e-9));
}

export interface QuantityInput {
  model: ScaffoldModel;
  config: ScaffoldConfiguration;
  material: MaterialSpec;
  deck: DeckSpec;
  sheeting: SheetingSpec;
  buildingHeight: number;
}

export function calculateQuantities(input: QuantityInput): ScaffoldEstimate {
  const { model, config, material, deck, sheeting } = input;
  const buckets = new Map<ComponentType, Bucket>();
  const componentCounts: Record<ComponentType, number> = {
    standard: 0,
    ledger: 0,
    transom: 0,
    brace: 0,
    platform: 0,
    toeboard: 0,
    guardrail: 0,
    sheeting: 0,
  };

  /**
   * Stock length a member is cut from. Decks and sheeting panels are bought as
   * whole units, not cut from tube — `0` means "one piece per item".
   */
  const stockFor = (type: ComponentType): number => {
    if (type === 'standard') return config.standardLength;
    if (type === 'platform' || type === 'sheeting') return 0;
    return config.horizontalMemberLength;
  };

  for (const c of model.components as ScaffoldComponent[]) {
    let b = buckets.get(c.type);
    if (!b) {
      b = emptyBucket();
      buckets.set(c.type, b);
    }
    b.count++;
    b.length += c.length;
    // Area-based lines carry their second dimension in `width`: deck width for
    // a platform, lift height for a sheeting panel.
    if (c.type === 'platform' || c.type === 'sheeting') b.area += c.length * c.width;
    b.pieces += piecesFor(c.length, stockFor(c.type));
    if (c.length > b.maxLen) b.maxLen = c.length;
    if (c.length < b.minLen) b.minLen = c.length;
    componentCounts[c.type]++;
  }

  const levels = model.levels.length;
  const maxPerimeter = model.levels.reduce((m, l) => Math.max(m, l.perimeter), 0);
  const scaffoldHeight = model.levels.length
    ? Math.max(...model.levels.map((l) => l.elevation))
    : 0;
  // Façade area of the scaffold itself = Σ (ring perimeter × lift height).
  const scaffoldSurface = model.levels.reduce((s, l) => s + l.perimeter * l.liftHeight, 0);

  const rows = Math.max(1, Math.round(config.scaffoldRows));
  const avgBays = levels ? Math.round(model.levels.reduce((s, l) => s + l.nodes.length, 0) / levels) : 0;

  const lines: QuantityLine[] = [];
  const order: ComponentType[] = [
    'standard',
    'ledger',
    'transom',
    'brace',
    'guardrail',
    'platform',
    'toeboard',
    'sheeting',
  ];

  for (const type of order) {
    const b = buckets.get(type);
    if (!b || b.count === 0) continue;
    const isDeck = type === 'platform';
    const isSheet = type === 'sheeting';
    const weightKg = isDeck
      ? b.area * deck.weightPerSqm
      : isSheet
        ? b.area * sheeting.weightPerSqm
        : b.length * material.weightPerMeter;
    const stock = stockFor(type);
    const explanation: string[] = [];

    switch (type) {
      case 'standard':
        explanation.push(
          `${avgBays} standards per ring (avg) × ${levels} lifts × ${rows} row${rows > 1 ? 's' : ''} = ${b.count.toLocaleString()} members`,
          `Each member spans one lift of ${config.verticalSpacing.toFixed(2)} m → ${b.length.toFixed(1)} m total`,
          `Cut from ${stock.toFixed(1)} m stock → ${b.pieces.toLocaleString()} pieces`,
        );
        break;
      case 'ledger':
        explanation.push(
          `One ledger per bay: ${avgBays} bays (avg) × ${levels} lifts × ${rows} row${rows > 1 ? 's' : ''} = ${b.count.toLocaleString()} members`,
          `Bay length ${b.minLen.toFixed(2)}–${b.maxLen.toFixed(2)} m (nominal ${config.horizontalSpacing.toFixed(2)} m) → ${b.length.toFixed(1)} m total`,
          `Cut from ${stock.toFixed(1)} m stock → ${b.pieces.toLocaleString()} pieces`,
        );
        break;
      case 'transom':
        explanation.push(
          `One transom per node per lift: ${avgBays} nodes × ${levels} lifts = ${b.count.toLocaleString()} members`,
          `Length = deck width ${(rows * config.platformWidth).toFixed(2)} m (${rows} row${rows > 1 ? 's' : ''} × ${config.platformWidth.toFixed(2)} m)`,
          `Total ${b.length.toFixed(1)} m → ${b.pieces.toLocaleString()} pieces`,
        );
        break;
      case 'brace':
        explanation.push(
          `Braced every ${braceEveryLabel(config)} on every ${config.braceEveryNBays} bay(s) of the outer row = ${b.count.toLocaleString()} braces`,
          `Diagonal length = √(bay² + lift²) ≈ ${(b.length / Math.max(1, b.count)).toFixed(2)} m each`,
          `Total ${b.length.toFixed(1)} m → ${b.pieces.toLocaleString()} pieces`,
        );
        break;
      case 'platform':
        explanation.push(
          `Decked bays: ${b.count.toLocaleString()} (every ${config.platformEveryNLevels} lift(s)) — one deck unit each`,
          `Each deck ≈ bay length × ${(rows * config.platformWidth).toFixed(2)} m width → ${b.area.toFixed(1)} m²`,
          `Deck type ${deck.name} at ${deck.weightPerSqm} kg/m² → ${weightKg.toFixed(0)} kg`,
        );
        break;
      case 'toeboard':
        explanation.push(
          `One toe board per decked bay on the outer edge: ${b.count.toLocaleString()} pieces`,
          `Total run ${b.length.toFixed(1)} m`,
        );
        break;
      case 'guardrail':
        explanation.push(
          `Double rail (top at 1.00 m, mid at 0.50 m) on every decked bay: ${b.count.toLocaleString()} rails`,
          `2 rails × ${(b.count / 2).toLocaleString()} bays → ${b.length.toFixed(1)} m total`,
          `Cut from ${stock.toFixed(1)} m stock → ${b.pieces.toLocaleString()} pieces`,
        );
        break;
      case 'sheeting':
        explanation.push(
          `${sheeting.name} over the outer face: ${b.count.toLocaleString()} panels`,
          `Σ (bay length × lift height) = ${b.area.toFixed(1)} m²`,
          `At ${sheeting.weightPerSqm} kg/m² → ${weightKg.toFixed(0)} kg`,
          'Lashing ties are not counted as couplers',
        );
        break;
    }

    lines.push({
      key: type,
      label: LABELS[type],
      totalLength: b.length,
      totalArea: b.area,
      pieces: b.pieces,
      weightKg,
      explanation,
    });
  }

  const tubeTypes: ComponentType[] = ['standard', 'ledger', 'transom', 'brace', 'guardrail'];
  const totalTubeLength = tubeTypes.reduce((s, t) => s + (buckets.get(t)?.length ?? 0), 0);
  const totalDeckArea = buckets.get('platform')?.area ?? 0;
  const totalSheetingArea = buckets.get('sheeting')?.area ?? 0;
  const connectors = estimateConnectors(componentCounts);
  const totalWeightKg = lines.reduce((s, l) => s + l.weightKg, 0) + connectors * couplerMass(material);

  return {
    lines,
    scaffoldHeight,
    maxPerimeter,
    scaffoldSurface,
    levels,
    totalTubeLength,
    totalDeckArea,
    totalSheetingArea,
    connectors,
    totalWeightKg,
    componentCounts,
  };
}

function braceEveryLabel(config: ScaffoldConfiguration): string {
  switch (config.braceMode) {
    case 'none':
      return 'never';
    case 'every':
      return 'lift';
    case 'every2':
      return '2nd lift';
    case 'every3':
      return '3rd lift';
    default:
      return `${config.braceEveryNLevels} lifts`;
  }
}

/**
 * Connection count.
 *
 * Each ledger/transom end lands on a standard and needs one right-angle
 * coupler (2 per member); each brace end needs one swivel coupler (2 per
 * member); each standard needs a joint pin/sleeve where it meets the lift
 * below (1 per standard); each deck is clipped at both ends (2 per deck).
 *
 * Sheeting is deliberately EXCLUDED: it is lashed on with plastic ties, and
 * counting those as ~1 kg forged couplers added over a tonne of phantom steel
 * to a netted scaffold.
 */
export function estimateConnectors(counts: Record<ComponentType, number>): number {
  return (
    counts.ledger * 2 +
    counts.transom * 2 +
    counts.brace * 2 +
    counts.guardrail * 2 +
    counts.standard * 1 +
    counts.platform * 2 +
    counts.toeboard * 2
  );
}

/** Typical coupler mass: 1.0–1.3 kg forged steel; bamboo uses nylon/bamboo ties. */
export function couplerMass(material: MaterialSpec): number {
  if (material.kind === 'bamboo') return 0.02;
  if (material.kind === 'aluminium') return 0.55;
  return 1.05;
}

export const CONNECTOR_EXPLANATION = [
  'Right-angle couplers: 2 per ledger + 2 per transom',
  'Swivel couplers: 2 per brace',
  'Joint pins / sleeves: 1 per standard (lift-to-lift joint)',
  'Deck & toe-board clips: 2 per unit',
];
