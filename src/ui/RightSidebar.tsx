/** Right sidebar: quantity take-off and the selected component. */

import { Fragment, useState } from 'react';
import { selectMaterial, useAppStore } from '../store/useAppStore';
import {
  CONNECTOR_EXPLANATION,
  couplerMass,
} from '../scaffolding/calculations/quantityCalculator';
import { DISCLAIMER } from '../scaffolding/types';
import { fmt, Section, Stat } from './primitives';
import { TYPE_COLORS } from '../three/ScaffoldView';

export function RightSidebar() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <EstimatePanel />
      <SelectionPanel />
      <DisclaimerPanel />
    </div>
  );
}

function EstimatePanel() {
  const estimate = useAppStore((s) => s.estimate);
  const scaffold = useAppStore((s) => s.scaffold);
  const material = useAppStore(selectMaterial);
  const generate = useAppStore((s) => s.generate);
  const recalculate = useAppStore((s) => s.recalculate);
  const [open, setOpen] = useState<string | null>(null);

  if (!estimate || !scaffold) {
    return (
      <Section title="Scaffold estimate">
        <p className="text-[11px] text-ink-400">
          No scaffold generated yet. Use <b className="text-ink-200">Generate scaffold</b> in the top
          bar.
        </p>
        <button type="button" className="btn-primary w-full" onClick={generate}>
          Generate scaffold
        </button>
      </Section>
    );
  }

  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  return (
    <Section
      title="Scaffold estimate"
      right={
        <button className="btn px-1.5 py-0.5 text-[10px]" type="button" onClick={recalculate}>
          Calculate
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Scaffold height" value={fmt(estimate.scaffoldHeight, 1)} unit="m" accent />
        <Stat label="Lifts" value={fmt(estimate.levels)} />
        <Stat label="Max perimeter" value={fmt(estimate.maxPerimeter, 1)} unit="m" />
        <Stat label="Face area" value={fmt(estimate.scaffoldSurface)} unit="m²" />
        <Stat label="Total tube" value={fmt(estimate.totalTubeLength)} unit="m" accent />
        <Stat
          label={estimate.totalSheetingArea > 0 ? 'Deck / sheeting' : 'Deck area'}
          value={
            estimate.totalSheetingArea > 0
              ? `${fmt(estimate.totalDeckArea)} / ${fmt(estimate.totalSheetingArea)}`
              : fmt(estimate.totalDeckArea)
          }
          unit="m²"
        />
      </div>

      <div className="mt-1 overflow-hidden rounded-md border border-ink-700">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-ink-800 text-ink-400">
              <th className="px-2 py-1 text-left font-medium">Component</th>
              <th className="px-2 py-1 text-right font-medium">Qty</th>
              <th className="px-2 py-1 text-right font-medium">Length / area</th>
              <th className="px-2 py-1 text-right font-medium">Pieces</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lines.map((line) => (
              <Fragment key={line.key}>
                <tr
                  className="cursor-pointer border-t border-ink-800 hover:bg-ink-800/60"
                  onClick={() => toggle(line.key)}
                  title="Show how this was calculated"
                >
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ background: TYPE_COLORS[line.key as keyof typeof TYPE_COLORS] }}
                      />
                      {line.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-ink-300">
                    {fmt(
                      estimate.componentCounts[
                        line.key as keyof typeof estimate.componentCounts
                      ] ?? 0,
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {line.totalArea
                      ? `${fmt(line.totalArea, 1)} m²`
                      : `${fmt(line.totalLength, 1)} m`}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-accent-400">
                    {fmt(line.pieces)}
                  </td>
                </tr>
                {open === line.key && (
                  <tr className="bg-ink-900">
                    <td colSpan={4} className="px-2.5 py-2">
                      <div className="panel-label mb-1">How this was calculated</div>
                      <ul className="space-y-0.5 font-mono text-[10.5px] text-ink-300">
                        {line.explanation.map((e) => (
                          <li key={e}>= {e}</li>
                        ))}
                        <li className="text-ink-400">
                          weight = {fmt(line.weightKg)} kg
                          {line.totalLength > 0 && ` (${material.weightPerMeter} kg/m)`}
                        </li>
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => toggle('connectors')}
        className="w-full rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-left transition hover:border-accent-500/50"
      >
        <div className="flex items-center justify-between">
          <span className="panel-label">Connections / couplers</span>
          <span className="font-mono text-[14px] text-accent-400">{fmt(estimate.connectors)}</span>
        </div>
        {open === 'connectors' && (
          <ul className="mt-1.5 space-y-0.5 font-mono text-[10.5px] text-ink-300">
            {CONNECTOR_EXPLANATION.map((e) => (
              <li key={e}>= {e}</li>
            ))}
            <li className="text-ink-400">
              coupler mass {couplerMass(material)} kg ⇒{' '}
              {fmt(estimate.connectors * couplerMass(material))} kg
            </li>
          </ul>
        )}
      </button>

      <div className="rounded-md border border-accent-600/40 bg-accent-500/10 px-2.5 py-2">
        <div className="panel-label text-accent-500/90">Estimated total weight</div>
        <div className="font-mono text-[19px] text-accent-400">
          {fmt(estimate.totalWeightKg)} <span className="text-[11px]">kg</span>
          <span className="ml-2 text-[11px] text-ink-300">
            ({fmt(estimate.totalWeightKg / 1000, 2)} t)
          </span>
        </div>
      </div>

      <div className="text-[10px] text-ink-500">
        {fmt(scaffold.components.length)} members generated in {scaffold.generationMs.toFixed(0)} ms
      </div>
      {scaffold.warnings.length > 0 && (
        <ul className="space-y-1 text-[10.5px] text-accent-400/90">
          {scaffold.warnings.slice(0, 3).map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function SelectionPanel() {
  const selected = useAppStore((s) => s.selected);
  const material = useAppStore(selectMaterial);
  const deleteSelected = useAppStore((s) => s.deleteSelected);
  const toggleLevel = useAppStore((s) => s.toggleLevel);
  const disabled = useAppStore((s) => s.config.disabledLevels);
  if (!selected) return null;

  const weight =
    selected.type === 'platform'
      ? selected.length * selected.width * 19.5
      : selected.length * material.weightPerMeter;

  return (
    <Section title="Selected component">
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Type" value={selected.type} accent />
        <Stat label="Length" value={fmt(selected.length, 2)} unit="m" />
        <Stat label="Level" value={String(selected.level + 1)} />
        <Stat label="Row / bay" value={`${selected.row + 1} / ${selected.bay + 1}`} />
        <Stat label="Weight" value={fmt(weight, 2)} unit="kg" />
        <Stat label="Material" value={material.kind} />
      </div>
      <div className="font-mono text-[10.5px] text-ink-400">
        pos {selected.position.map((v) => v.toFixed(2)).join(', ')}
      </div>
      <div className="flex gap-1.5">
        <button type="button" className="btn flex-1" onClick={deleteSelected}>
          Delete member
        </button>
        <button type="button" className="btn flex-1" onClick={() => toggleLevel(selected.level)}>
          {disabled.includes(selected.level) ? 'Enable' : 'Disable'} level {selected.level + 1}
        </button>
      </div>
    </Section>
  );
}

function DisclaimerPanel() {
  return (
    <div className="mt-auto border-t border-ink-800 p-3">
      <div className="rounded-md border border-accent-600/40 bg-accent-500/5 p-2.5">
        <div className="panel-label mb-1 text-accent-500">Engineering disclaimer</div>
        <p className="text-[10.5px] leading-relaxed text-ink-300">{DISCLAIMER}</p>
      </div>
    </div>
  );
}
