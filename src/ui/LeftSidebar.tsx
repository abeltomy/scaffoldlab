/** Left sidebar: building, scale, scaffold configuration, materials. */

import { useState } from 'react';
import {
  DEFAULT_CONFIG,
  UNIT_SCALES,
  selectMaterial,
  useAppStore,
} from '../store/useAppStore';
import {
  DECK_SPECS,
  DENSITIES,
  SHEETING_SPECS,
  tubeWeightPerMeter,
} from '../scaffolding/materials/materialLibrary';
import type { MaterialSpec, ScaffoldSystem, ScaleUnit } from '../scaffolding/types';
import {
  fmt,
  NumberInput,
  Row,
  Section,
  Select,
  SliderField,
  Stat,
  Toggle,
} from './primitives';

export function LeftSidebar() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <BuildingPanel />
      <ScalePanel />
      <ScaffoldPanel />
      <MaterialPanel />
    </div>
  );
}

function BuildingPanel() {
  const building = useAppStore((s) => s.building);
  const analysis = useAppStore((s) => s.analysis);
  const notices = useAppStore((s) => s.notices);

  return (
    <Section title="Building" defaultOpen>
      {!building && <p className="text-[11px] text-ink-400">No model loaded.</p>}
      {building && analysis && (
        <>
          <div className="rounded-md border border-ink-700 bg-ink-850 px-2.5 py-2">
            <div className="truncate text-[12px] font-medium text-ink-100">{building.name}</div>
            <div className="mt-0.5 flex gap-2 text-[10px] text-ink-400">
              <span className="rounded bg-ink-700 px-1.5 py-0.5 uppercase">{building.format}</span>
              <span>{fmt(analysis.triangleCount)} tris</span>
              <span>{analysis.majorFaces} major faces</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Height" value={fmt(analysis.height, 1)} unit="m" accent />
            <Stat label="Width" value={fmt(analysis.width, 1)} unit="m" />
            <Stat label="Depth" value={fmt(analysis.depth, 1)} unit="m" />
            <Stat label="Footprint" value={fmt(analysis.footprintArea)} unit="m²" />
            <Stat label="Perimeter" value={fmt(analysis.footprintPerimeter, 1)} unit="m" />
            <Stat label="Façade area" value={fmt(analysis.exteriorArea)} unit="m²" />
          </div>
          <div className="rounded-md border border-ink-800 bg-ink-900 px-2.5 py-1.5 font-mono text-[10.5px] text-ink-400">
            bbox&nbsp;X {fmt(analysis.bbox.min[0], 1)} … {fmt(analysis.bbox.max[0], 1)}
            <br />
            bbox&nbsp;Y {fmt(analysis.bbox.min[1], 1)} … {fmt(analysis.bbox.max[1], 1)}
            <br />
            bbox&nbsp;Z {fmt(analysis.bbox.min[2], 1)} … {fmt(analysis.bbox.max[2], 1)}
          </div>
          {notices.length > 0 && (
            <ul className="space-y-1 text-[10.5px] text-ink-400">
              {notices.slice(0, 4).map((n) => (
                <li key={n} className="flex gap-1.5">
                  <span className="text-accent-500">›</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

function ScalePanel() {
  const building = useAppStore((s) => s.building);
  const raw = useAppStore((s) => s.rawAnalysis);
  const setScale = useAppStore((s) => s.setScale);
  const calibrate = useAppStore((s) => s.calibrateToHeight);
  const [knownHeight, setKnownHeight] = useState(381);

  if (!building || !raw) return null;
  const units: { value: ScaleUnit; label: string }[] = [
    { value: 'm', label: '1 unit = 1 metre' },
    { value: 'cm', label: '1 unit = 1 centimetre' },
    { value: 'mm', label: '1 unit = 1 millimetre' },
    { value: 'in', label: '1 unit = 1 inch' },
    { value: 'ft', label: '1 unit = 1 foot' },
    { value: 'custom', label: 'Custom factor' },
  ];

  return (
    <Section title="Model scale">
      <div className="rounded-md border border-accent-600/40 bg-accent-500/10 px-2.5 py-1.5">
        <div className="panel-label text-accent-500/90">Current scale</div>
        <div className="font-mono text-[13px] text-accent-400">
          1 unit = {building.scale.toPrecision(4)} m
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-ink-400">
          raw height {raw.height.toPrecision(5)} units → {fmt(raw.height * building.scale, 1)} m
        </div>
      </div>
      <Row label="Unit">
        <Select
          value={building.scaleUnit}
          options={units}
          onChange={(u) => {
            if (u === 'custom') setScale(building.scale, 'custom');
            else setScale(UNIT_SCALES[u], u);
          }}
        />
      </Row>
      <Row label="Factor (m/unit)">
        <NumberInput value={building.scale} step={0.001} onChange={(v) => setScale(v, 'custom')} />
      </Row>
      <div className="rounded-md border border-ink-700 bg-ink-850 p-2">
        <div className="panel-label mb-1.5">Calibrate by known height</div>
        <div className="flex gap-1.5">
          <NumberInput value={knownHeight} step={1} onChange={setKnownHeight} suffix="m" />
          <button type="button" className="btn shrink-0" onClick={() => calibrate(knownHeight)}>
            Apply
          </button>
        </div>
        <p className="mt-1 text-[10px] text-ink-400">
          Sets scale = known height ÷ model height ({raw.height.toPrecision(4)} units).
        </p>
      </div>
    </Section>
  );
}

const SYSTEMS: { value: ScaffoldSystem; label: string }[] = [
  { value: 'steel-tube', label: 'Steel tube & fitting' },
  { value: 'bamboo', label: 'Bamboo (HK style)' },
  { value: 'aluminium', label: 'Aluminium' },
];

function ScaffoldPanel() {
  const config = useAppStore((s) => s.config);
  const setConfig = useAppStore((s) => s.setConfig);
  const setSystem = useAppStore((s) => s.setSystem);
  const generate = useAppStore((s) => s.generate);
  const autoUpdate = useAppStore((s) => s.autoUpdate);
  const setView = useAppStore((s) => s.setView);
  const analysis = useAppStore((s) => s.analysis);

  return (
    <Section
      title="Scaffold"
      right={
        <button type="button" className="btn px-1.5 py-0.5 text-[10px]" onClick={() => setConfig(DEFAULT_CONFIG)}>
          Reset
        </button>
      }
    >
      <Row label="System">
        <Select value={config.system} options={SYSTEMS} onChange={setSystem} />
      </Row>

      <SliderField
        label="Bay length (horizontal spacing)"
        value={config.horizontalSpacing}
        min={0.5}
        max={3}
        step={0.05}
        presets={[0.75, 1.0, 1.2, 1.5, 1.8, 2.0]}
        onChange={(v, live) => setConfig({ horizontalSpacing: v }, live)}
      />

      <SliderField
        label="Lift height (vertical spacing)"
        value={config.verticalSpacing}
        min={1}
        max={3}
        step={0.05}
        presets={[1.5, 1.8, 2.0, 2.5]}
        onChange={(v, live) => setConfig({ verticalSpacing: v }, live)}
      />

      <SliderField
        label="Building offset"
        value={config.buildingOffset}
        min={0.05}
        max={2}
        step={0.05}
        presets={[0.15, 0.3, 0.5, 0.8, 1.0]}
        onChange={(v, live) => setConfig({ buildingOffset: v }, live)}
      />

      <SliderField
        label="Rows (bays deep)"
        value={config.scaffoldRows}
        min={1}
        max={4}
        step={1}
        unit="rows"
        digits={0}
        onChange={(v, live) => setConfig({ scaffoldRows: Math.round(v) }, live)}
      />

      <SliderField
        label="Deck width per row"
        value={config.platformWidth}
        min={0.3}
        max={2}
        step={0.05}
        presets={[0.6, 0.75, 1.0, 1.2]}
        onChange={(v, live) => setConfig({ platformWidth: v }, live)}
      />

      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-1">
          <span className="panel-label">Standard length</span>
          <NumberInput
            value={config.standardLength}
            step={0.5}
            suffix="m"
            onChange={(v) => setConfig({ standardLength: Math.max(0.5, v) })}
          />
        </label>
        <label className="space-y-1">
          <span className="panel-label">Horizontal length</span>
          <NumberInput
            value={config.horizontalMemberLength}
            step={0.5}
            suffix="m"
            onChange={(v) => setConfig({ horizontalMemberLength: Math.max(0.5, v) })}
          />
        </label>
      </div>
      <p className="text-[10px] text-ink-500">
        Stock lengths drive piece counts only — changing them re-prices without regenerating.
      </p>

      <Row label="Bracing">
        <Select
          value={config.braceMode}
          options={[
            { value: 'none', label: 'No braces' },
            { value: 'every', label: 'Every level' },
            { value: 'every2', label: 'Every 2 levels' },
            { value: 'every3', label: 'Every 3 levels' },
            { value: 'custom', label: 'Custom…' },
          ]}
          onChange={(v) => setConfig({ braceMode: v })}
        />
      </Row>
      {config.braceMode === 'custom' && (
        <SliderField
          label="Brace every N lifts"
          value={config.braceEveryNLevels}
          min={1}
          max={8}
          step={1}
          unit="lifts"
          digits={0}
          onChange={(v, live) => setConfig({ braceEveryNLevels: Math.round(v) }, live)}
        />
      )}
      <SliderField
        label="Brace every N bays"
        value={config.braceEveryNBays}
        min={1}
        max={10}
        step={1}
        unit="bays"
        digits={0}
        onChange={(v, live) => setConfig({ braceEveryNBays: Math.round(v) }, live)}
      />

      <SliderField
        label="Deck every N lifts"
        value={config.platformEveryNLevels}
        min={1}
        max={6}
        step={1}
        unit="lifts"
        digits={0}
        onChange={(v, live) => setConfig({ platformEveryNLevels: Math.round(v) }, live)}
      />

      <SliderField
        label={`Scaffolded height${
          analysis
            ? ` — ${fmt(analysis.height * config.heightFraction + config.topExtension, 1)} m`
            : ''
        }`}
        value={config.heightFraction * 100}
        min={5}
        max={100}
        step={1}
        unit="%"
        digits={0}
        onChange={(v, live) => setConfig({ heightFraction: v / 100 }, live)}
      />

      <SliderField
        label="Base height (start above ground)"
        value={config.baseHeight}
        min={0}
        max={Math.max(10, analysis ? analysis.height * 0.5 : 20)}
        step={0.5}
        onChange={(v, live) => setConfig({ baseHeight: v }, live)}
      />

      <SliderField
        label="Top extension (guard-rail lift)"
        value={config.topExtension}
        min={0}
        max={6}
        step={0.25}
        onChange={(v, live) => setConfig({ topExtension: v }, live)}
      />

      <Row label="Façade sheeting">
        <Select
          value={config.sheeting}
          options={SHEETING_SPECS.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => setConfig({ sheeting: v })}
        />
      </Row>

      <Toggle
        checked={config.guardRails}
        onChange={(v) => setConfig({ guardRails: v })}
        label="Guard rails (top + mid)"
      />
      <Toggle
        checked={config.toeBoards}
        onChange={(v) => setConfig({ toeBoards: v })}
        label="Toe boards"
      />
      <Toggle
        checked={autoUpdate}
        onChange={(v) => setView({ autoUpdate: v })}
        label="Auto-regenerate on change"
      />
      {!autoUpdate && (
        <button type="button" className="btn-primary w-full" onClick={generate}>
          Regenerate scaffold
        </button>
      )}
    </Section>
  );
}

function MaterialPanel() {
  const materials = useAppStore((s) => s.materials);
  const materialId = useAppStore((s) => s.materialId);
  const setMaterialId = useAppStore((s) => s.setMaterialId);
  const upsert = useAppStore((s) => s.upsertMaterial);
  const remove = useAppStore((s) => s.removeMaterial);
  const deckId = useAppStore((s) => s.deckId);
  const setDeckId = useAppStore((s) => s.setDeckId);
  const material = useAppStore(selectMaterial);

  const patch = (p: Partial<MaterialSpec>) => upsert({ ...material, ...p });

  const duplicate = () => {
    const copy: MaterialSpec = {
      ...material,
      id: `custom-${Date.now()}`,
      name: `${material.name} (copy)`,
      builtIn: false,
    };
    upsert(copy);
    setMaterialId(copy.id);
  };

  return (
    <Section title="Material">
      <Row label="Member material">
        <Select
          value={materialId}
          options={materials.map((m) => ({ value: m.id, label: m.name }))}
          onChange={setMaterialId}
        />
      </Row>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="space-y-1">
          <span className="panel-label">Diameter</span>
          <NumberInput
            value={material.diameterMm}
            step={0.1}
            suffix="mm"
            onChange={(v) => patch({ diameterMm: v })}
          />
        </label>
        <label className="space-y-1">
          <span className="panel-label">Wall</span>
          <NumberInput
            value={material.wallThicknessMm}
            step={0.1}
            suffix="mm"
            onChange={(v) => patch({ wallThicknessMm: v })}
          />
        </label>
        <label className="space-y-1">
          <span className="panel-label">Weight</span>
          <NumberInput
            value={material.weightPerMeter}
            step={0.01}
            suffix="kg/m"
            onChange={(v) => patch({ weightPerMeter: v })}
          />
        </label>
        <label className="space-y-1">
          <span className="panel-label">Price</span>
          <NumberInput
            value={material.pricePerMeter}
            step={0.1}
            suffix="/m"
            onChange={(v) => patch({ pricePerMeter: v })}
          />
        </label>
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn flex-1"
          onClick={() =>
            patch({
              weightPerMeter:
                Math.round(
                  tubeWeightPerMeter(
                    material.diameterMm,
                    material.wallThicknessMm,
                    DENSITIES[material.kind] ?? 1000,
                  ) * 100,
                ) / 100,
            })
          }
          title="Compute kg/m from the section geometry and material density"
        >
          Weight from section
        </button>
        <button type="button" className="btn" onClick={duplicate}>
          Duplicate
        </button>
        {!material.builtIn && (
          <button type="button" className="btn" onClick={() => remove(material.id)}>
            Delete
          </button>
        )}
      </div>
      <div className="text-[10px] text-ink-400">
        Stock lengths: {material.standardLengths.join(' / ')} m
      </div>
      <Row label="Deck type">
        <Select
          value={deckId}
          options={DECK_SPECS.map((d) => ({ value: d.id, label: d.name }))}
          onChange={setDeckId}
        />
      </Row>
    </Section>
  );
}
