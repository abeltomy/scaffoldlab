/**
 * Export helpers — CSV / JSON / printable report / scaffold geometry.
 * Pure data in, Blob out: nothing here knows about React.
 */

import type {
  BuildingAnalysis,
  MaterialSpec,
  ScaffoldConfiguration,
  ScaffoldEstimate,
  ScaffoldModel,
} from '../types';
import { DISCLAIMER } from '../types';

export interface ReportData {
  projectName: string;
  buildingName: string;
  analysis: BuildingAnalysis;
  config: ScaffoldConfiguration;
  material: MaterialSpec;
  estimate: ScaffoldEstimate;
  scale: number;
  screenshot?: string | null;
  generatedAt?: string;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const csvEscape = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function estimateToCsv(data: ReportData): string {
  const rows: (string | number)[][] = [
    ['ScaffoldLab — preliminary scaffold estimate'],
    ['Generated', data.generatedAt ?? new Date().toISOString()],
    ['Project', data.projectName],
    ['Building', data.buildingName],
    [],
    ['BUILDING'],
    ['Height (m)', data.analysis.height.toFixed(2)],
    ['Width (m)', data.analysis.width.toFixed(2)],
    ['Depth (m)', data.analysis.depth.toFixed(2)],
    ['Footprint area (m²)', data.analysis.footprintArea.toFixed(1)],
    ['Footprint perimeter (m)', data.analysis.footprintPerimeter.toFixed(1)],
    ['Approx. façade area (m²)', data.analysis.exteriorArea.toFixed(1)],
    ['Model scale (m per unit)', data.scale],
    [],
    ['SCAFFOLD CONFIGURATION'],
    ['System', data.config.system],
    ['Material', data.material.name],
    ['Bay length (m)', data.config.horizontalSpacing],
    ['Lift height (m)', data.config.verticalSpacing],
    ['Building offset (m)', data.config.buildingOffset],
    ['Rows', data.config.scaffoldRows],
    ['Deck width per row (m)', data.config.platformWidth],
    ['Brace mode', data.config.braceMode],
    ['Guard rails', data.config.guardRails ? 'yes' : 'no'],
    ['Sheeting', data.config.sheeting],
    [],
    ['SCAFFOLD TOTALS'],
    ['Scaffold height (m)', data.estimate.scaffoldHeight.toFixed(2)],
    ['Max ring perimeter (m)', data.estimate.maxPerimeter.toFixed(2)],
    ['Scaffold face area (m²)', data.estimate.scaffoldSurface.toFixed(1)],
    ['Lifts', data.estimate.levels],
    ['Total tube/pole length (m)', data.estimate.totalTubeLength.toFixed(1)],
    ['Deck area (m²)', data.estimate.totalDeckArea.toFixed(1)],
    ['Sheeting area (m²)', data.estimate.totalSheetingArea.toFixed(1)],
    ['Connections', data.estimate.connectors],
    ['Estimated weight (kg)', data.estimate.totalWeightKg.toFixed(0)],
    [],
    ['COMPONENT', 'MEMBERS', 'LENGTH (m)', 'AREA (m²)', 'PIECES', 'WEIGHT (kg)'],
  ];

  for (const line of data.estimate.lines) {
    rows.push([
      line.label,
      data.estimate.componentCounts[line.key as keyof typeof data.estimate.componentCounts] ?? '',
      line.totalLength.toFixed(1),
      line.totalArea ? line.totalArea.toFixed(1) : '',
      line.pieces,
      line.weightKg.toFixed(0),
    ]);
  }

  rows.push([], ['DISCLAIMER'], [DISCLAIMER]);
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function estimateToJson(data: ReportData): string {
  return JSON.stringify(
    {
      schema: 'scaffoldlab.estimate/1',
      generatedAt: data.generatedAt ?? new Date().toISOString(),
      project: data.projectName,
      building: {
        name: data.buildingName,
        scale: data.scale,
        height: data.analysis.height,
        width: data.analysis.width,
        depth: data.analysis.depth,
        bbox: data.analysis.bbox,
        footprintArea: data.analysis.footprintArea,
        footprintPerimeter: data.analysis.footprintPerimeter,
        exteriorArea: data.analysis.exteriorArea,
        majorFaces: data.analysis.majorFaces,
        triangleCount: data.analysis.triangleCount,
      },
      configuration: data.config,
      material: data.material,
      estimate: {
        scaffoldHeight: data.estimate.scaffoldHeight,
        maxPerimeter: data.estimate.maxPerimeter,
        scaffoldSurface: data.estimate.scaffoldSurface,
        levels: data.estimate.levels,
        totalTubeLength: data.estimate.totalTubeLength,
        totalDeckArea: data.estimate.totalDeckArea,
        totalSheetingArea: data.estimate.totalSheetingArea,
        connectors: data.estimate.connectors,
        totalWeightKg: data.estimate.totalWeightKg,
        componentCounts: data.estimate.componentCounts,
        lines: data.estimate.lines,
      },
      disclaimer: DISCLAIMER,
    },
    null,
    2,
  );
}

/** Full component list — one row per member, for downstream tooling. */
export function componentsToCsv(model: ScaffoldModel): string {
  const head = ['id', 'type', 'level', 'row', 'bay', 'x', 'y', 'z', 'dx', 'dy', 'dz', 'length', 'width'];
  const rows = model.components.map((c) => [
    c.id,
    c.type,
    c.level,
    c.row,
    c.bay,
    c.position[0].toFixed(3),
    c.position[1].toFixed(3),
    c.position[2].toFixed(3),
    c.direction[0].toFixed(4),
    c.direction[1].toFixed(4),
    c.direction[2].toFixed(4),
    c.length.toFixed(3),
    c.width.toFixed(3),
  ]);
  return [head, ...rows].map((r) => r.join(',')).join('\n');
}

/**
 * Printable report. Opens a styled document and triggers the browser's print
 * dialog, where "Save as PDF" produces the deliverable — no PDF library and no
 * server round-trip needed.
 */
export function openPrintableReport(data: ReportData) {
  const win = window.open('', '_blank', 'width=1100,height=900');
  if (!win) {
    throw new Error('Pop-up blocked — allow pop-ups for this site to export the PDF report.');
  }
  const num = (v: number, d = 0) =>
    v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const rows = data.estimate.lines
    .map(
      (l) => `<tr>
        <td>${l.label}</td>
        <td class="n">${num(
          data.estimate.componentCounts[l.key as keyof typeof data.estimate.componentCounts] ?? 0,
        )}</td>
        <td class="n">${l.totalLength ? num(l.totalLength, 1) + ' m' : '—'}</td>
        <td class="n">${l.totalArea ? num(l.totalArea, 1) + ' m²' : '—'}</td>
        <td class="n">${num(l.pieces)}</td>
        <td class="n">${num(l.weightKg)} kg</td>
      </tr>`,
    )
    .join('');

  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>Scaffold estimate — ${escapeHtml(data.buildingName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #14181f; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 2px; }
    h2 { font-size: 14px; margin: 22px 0 6px; text-transform: uppercase; letter-spacing: .08em; color: #55606f; border-bottom: 1px solid #d8dee7; padding-bottom: 4px; }
    .sub { color: #6b7686; margin-bottom: 18px; }
    img { width: 100%; border: 1px solid #d8dee7; border-radius: 6px; margin: 8px 0 4px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { padding: 5px 8px; border-bottom: 1px solid #e6ebf1; text-align: left; }
    th { background: #f4f6f9; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
    .n { text-align: right; font-variant-numeric: tabular-nums; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .card { border: 1px solid #e0e6ee; border-radius: 6px; padding: 8px 10px; }
    .card b { display: block; font-size: 16px; }
    .card span { color: #6b7686; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
    .total td { font-weight: 700; border-top: 2px solid #14181f; }
    .disclaimer { margin-top: 24px; padding: 10px 12px; border: 1px solid #e8b23a; background: #fdf6e6; border-radius: 6px; font-size: 11px; }
    @media print { body { margin: 14mm; } }
  </style></head><body>
  <h1>Preliminary scaffold estimate</h1>
  <div class="sub">${escapeHtml(data.projectName)} — ${escapeHtml(data.buildingName)} · ${new Date().toLocaleString()}</div>
  ${data.screenshot ? `<img src="${data.screenshot}" alt="3D view">` : ''}
  <h2>Building</h2>
  <div class="grid">
    <div class="card"><span>Height</span><b>${num(data.analysis.height, 1)} m</b></div>
    <div class="card"><span>Width</span><b>${num(data.analysis.width, 1)} m</b></div>
    <div class="card"><span>Depth</span><b>${num(data.analysis.depth, 1)} m</b></div>
    <div class="card"><span>Façade area</span><b>${num(data.analysis.exteriorArea)} m²</b></div>
  </div>
  <h2>Scaffold configuration</h2>
  <table>
    <tr><td>System / material</td><td class="n">${escapeHtml(data.config.system)} — ${escapeHtml(data.material.name)}</td></tr>
    <tr><td>Bay length × lift height</td><td class="n">${data.config.horizontalSpacing} m × ${data.config.verticalSpacing} m</td></tr>
    <tr><td>Offset from building</td><td class="n">${data.config.buildingOffset} m</td></tr>
    <tr><td>Rows × deck width</td><td class="n">${data.config.scaffoldRows} × ${data.config.platformWidth} m</td></tr>
    <tr><td>Bracing</td><td class="n">${escapeHtml(data.config.braceMode)} (every ${data.config.braceEveryNBays} bays)</td></tr>
  </table>
  <h2>Quantities</h2>
  <table>
    <tr><th>Component</th><th class="n">Members</th><th class="n">Length</th><th class="n">Area</th><th class="n">Pieces</th><th class="n">Weight</th></tr>
    ${rows}
    <tr class="total"><td>Total tube / pole</td><td class="n">—</td><td class="n">${num(data.estimate.totalTubeLength, 1)} m</td><td class="n">${num(data.estimate.totalDeckArea, 1)} m²</td><td class="n">${num(data.estimate.connectors)} conn.</td><td class="n">${num(data.estimate.totalWeightKg)} kg</td></tr>
  </table>
  <div class="disclaimer"><b>Disclaimer.</b> ${DISCLAIMER}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 350));</script>
  </body></html>`);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
