/** Bottom bar: camera, visibility, colour mode, section tool, measurement. */

import {
  selectMemberScale,
  useAppStore,
  type ColorMode,
  type ViewportTool,
} from '../store/useAppStore';
import type { ComponentType } from '../scaffolding/types';
import { TYPE_COLORS } from '../three/ScaffoldView';

const VIEWS = [
  ['reset', 'Home'],
  ['top', 'Top'],
  ['front', 'Front'],
  ['back', 'Back'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['corner', 'Corner'],
] as const;

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'type', label: 'Component type' },
  { value: 'height', label: 'Height' },
  { value: 'material', label: 'Material' },
];

const TYPES: ComponentType[] = [
  'standard',
  'ledger',
  'transom',
  'brace',
  'guardrail',
  'platform',
  'toeboard',
  'sheeting',
];

export function BottomBar() {
  const s = useAppStore();
  const memberScale = useAppStore(selectMemberScale);
  const chip = (active: boolean) =>
    `rounded border px-2 py-1 text-[10.5px] transition ${
      active
        ? 'border-accent-500 bg-accent-500/15 text-accent-400'
        : 'border-ink-700 bg-ink-850 text-ink-300 hover:border-ink-500 hover:text-ink-100'
    }`;

  return (
    <div className="z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-800 bg-ink-900 px-3 py-2">
      <Group label="Camera">
        {VIEWS.map(([kind, label]) => (
          <button key={kind} type="button" className={chip(false)} onClick={() => s.runCamera(kind)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          className={chip(s.orthographic)}
          onClick={() => s.setView({ orthographic: !s.orthographic })}
        >
          {s.orthographic ? 'Orthographic' : 'Perspective'}
        </button>
      </Group>

      <Group label="Show">
        <button
          type="button"
          className={chip(s.showBuilding)}
          onClick={() => s.setView({ showBuilding: !s.showBuilding })}
        >
          Building
        </button>
        <button
          type="button"
          className={chip(s.showScaffold)}
          onClick={() => s.setView({ showScaffold: !s.showScaffold })}
        >
          Scaffold
        </button>
        <button
          type="button"
          className={chip(s.showGrid)}
          onClick={() => s.setView({ showGrid: !s.showGrid })}
        >
          Grid
        </button>
        <label className="flex items-center gap-1 text-[10px] text-ink-400">
          bldg
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={s.buildingOpacity}
            className="w-16"
            onChange={(e) => s.setView({ buildingOpacity: parseFloat(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-ink-400">
          scaf
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={s.scaffoldOpacity}
            className="w-16"
            onChange={(e) => s.setView({ scaffoldOpacity: parseFloat(e.target.value) })}
          />
        </label>
      </Group>

      <Group label="Member size">
        <button
          type="button"
          className={chip(s.memberDisplayScale === 0)}
          onClick={() => s.setView({ memberDisplayScale: 0 })}
          title="Scale member thickness automatically with building size"
        >
          auto ×{memberScale.toFixed(1)}
        </button>
        <input
          type="range"
          min={1}
          max={10}
          step={0.5}
          value={s.memberDisplayScale || memberScale}
          className="w-24"
          title="Display thickness only — quantities are unaffected"
          onChange={(e) => s.setView({ memberDisplayScale: parseFloat(e.target.value) })}
        />
        <span className="font-mono text-[10px] text-ink-400">display only</span>
      </Group>

      <Group label="Colour">
        {COLOR_MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={chip(s.colorMode === m.value)}
            onClick={() => s.setView({ colorMode: m.value })}
          >
            {m.label}
          </button>
        ))}
      </Group>

      <Group label="Members">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={chip(s.visibleTypes[t])}
            onClick={() => s.toggleType(t)}
          >
            <span
              className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
              style={{ background: TYPE_COLORS[t], opacity: s.visibleTypes[t] ? 1 : 0.3 }}
            />
            {t}
          </button>
        ))}
      </Group>

      <Group label="Tools">
        {(['orbit', 'select', 'measure'] as ViewportTool[]).map((t) => (
          <button
            key={t}
            type="button"
            className={chip(s.tool === t)}
            onClick={() => s.setView({ tool: t, selected: null, pendingPoint: null })}
          >
            {t}
          </button>
        ))}
        {s.measurements.length > 0 && (
          <button type="button" className={chip(false)} onClick={s.clearMeasurements}>
            clear {s.measurements.length}
          </button>
        )}
        {s.tool === 'measure' && (
          <span className="text-[10px] text-accent-400">
            {s.pendingPoint ? 'click second point' : 'click first point'}
          </span>
        )}
      </Group>

      <Group label="Section">
        <button
          type="button"
          className={chip(s.clipEnabled)}
          onClick={() => s.setView({ clipEnabled: !s.clipEnabled })}
        >
          {s.clipEnabled ? 'on' : 'off'}
        </button>
        {(['x', 'y', 'z'] as const).map((a) => (
          <button
            key={a}
            type="button"
            className={chip(s.clipAxis === a)}
            onClick={() => s.setView({ clipAxis: a, clipEnabled: true })}
          >
            {a.toUpperCase()}
          </button>
        ))}
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={s.clipPosition}
          className="w-28"
          onChange={(e) => s.setView({ clipPosition: parseFloat(e.target.value) })}
        />
        <button
          type="button"
          className={chip(s.clipFlip)}
          onClick={() => s.setView({ clipFlip: !s.clipFlip })}
        >
          flip
        </button>
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="panel-label mr-0.5">{label}</span>
      {children}
    </div>
  );
}
