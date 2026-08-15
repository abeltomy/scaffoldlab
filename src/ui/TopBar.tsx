/** Top bar: brand, model import, samples, generate/calculate, save, export. */

import { useRef, useState } from 'react';
import { selectMaterial, useAppStore, type ProjectSnapshot } from '../store/useAppStore';
import {
  componentsToCsv,
  download,
  estimateToCsv,
  estimateToJson,
  openPrintableReport,
  type ReportData,
} from '../scaffolding/export/exporters';
import { exportScaffoldGltf, exportScaffoldObj } from '../three/geometryExport';
import { getViewportCanvas } from '../three/Viewer';
import {
  deleteProject,
  listProjects,
  parseProjectFile,
  projectToBlob,
  saveProject,
  type StoredProject,
} from '../store/projectStorage';
import { SUPPORTED_EXTENSIONS } from '../three/modelLoader';
import { SAMPLE_BUILDINGS } from '../three/sampleBuildings';

export function TopBar() {
  const loadFile = useAppStore((s) => s.loadFile);
  const generate = useAppStore((s) => s.generate);
  const recalculate = useAppStore((s) => s.recalculate);
  const status = useAppStore((s) => s.status);
  const scaffold = useAppStore((s) => s.scaffold);
  const fileInput = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<'export' | 'project' | 'import' | 'samples' | null>(null);
  const busy = status === 'loading' || status === 'analysing' || status === 'generating';

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900 px-3">
      {/* Relative href: the planner is served at ./app.html, so "./" is the
          landing page in dev and on GitHub Pages alike. */}
      <a href="./" className="flex items-center gap-2 pr-2" title="Back to the ScaffoldLab home page">
        <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden="true">
        <path d="M7.5 21V10.5h5.5V7.5h4V21z" fill="#aeb7c3" />
        <g stroke="#4f5b67" strokeWidth="1.6" strokeLinecap="round">
        <path d="M4.6 21.4V9.6M12 21.4V9.6M19.4 21.4V6.4" />
        </g>
        <g stroke="#d4890f" strokeWidth="2.4" strokeLinecap="round">
        <path d="M3.8 16.4h15.8" />
        <path d="M3.8 11.4h15.8" />
        </g>
        </svg>
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-tight">ScaffoldLab</div>
          <div className="text-[9.5px] text-ink-400">3D scaffolding planning &amp; estimation</div>
        </div>
      </a>

      <div className="mx-1 h-6 w-px bg-ink-700" />

      <input
        ref={fileInput}
        type="file"
        accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
          e.target.value = '';
        }}
      />
      <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
        Import model
      </button>
      <Menu
        label="Public source"
        open={menu === 'import'}
        onToggle={() => setMenu(menu === 'import' ? null : 'import')}
      >
        <div className="w-72 p-3 text-[11px] text-ink-300">
          <div className="panel-label mb-1.5">Import from public source</div>
          <p className="mb-2 leading-relaxed">
            Planned providers: open GLB/GLTF repositories, OpenStreetMap-derived building
            geometry, and open GIS/city datasets — each behind an official API or a publicly
            permitted download.
          </p>
          <p className="text-ink-400">
            The provider interface is already isolated in the model-loading layer; v1 ships with
            local file import only.
          </p>
        </div>
      </Menu>
      <SampleMenu
        open={menu === 'samples'}
        onToggle={() => setMenu(menu === 'samples' ? null : 'samples')}
        busy={busy}
      />

      <div className="mx-1 h-6 w-px bg-ink-700" />

      <button type="button" className="btn-primary" onClick={generate} disabled={busy}>
        {busy ? 'Working…' : 'Generate scaffold'}
      </button>
      <button type="button" className="btn" onClick={recalculate} disabled={!scaffold}>
        Calculate materials
      </button>

      <div className="ml-auto flex items-center gap-2">
        <StatusChip />
        <ProjectMenu
          open={menu === 'project'}
          onToggle={() => setMenu(menu === 'project' ? null : 'project')}
        />
        <ExportMenu
          open={menu === 'export'}
          onToggle={() => setMenu(menu === 'export' ? null : 'export')}
        />
      </div>
    </header>
  );
}

/** Gallery of the built-in procedural buildings. */
function SampleMenu({
  open,
  onToggle,
  busy,
}: {
  open: boolean;
  onToggle: () => void;
  busy: boolean;
}) {
  const loadSample = useAppStore((s) => s.loadSample);
  const current = useAppStore((s) => s.sampleId);
  return (
    <Menu label="Sample buildings" open={open} onToggle={onToggle}>
      <div className="w-80 py-1">
        {SAMPLE_BUILDINGS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => void loadSample(s.id)}
            className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-ink-700 disabled:opacity-40 ${
              current === s.id ? 'bg-accent-500/10' : ''
            }`}
          >
            <span className="min-w-0">
              <span
                className={`block text-[12px] ${current === s.id ? 'text-accent-400' : 'text-ink-100'}`}
              >
                {s.name}
              </span>
              <span className="block text-[10px] leading-snug text-ink-400">{s.description}</span>
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-300">{s.height} m</span>
          </button>
        ))}
        <p className="border-t border-ink-700 px-3 py-2 text-[10px] leading-snug text-ink-400">
          All samples are generated procedurally — no third-party geometry. Start with the terrace
          houses to see bays, decks and guard rails at readable size.
        </p>
      </div>
    </Menu>
  );
}

function StatusChip() {
  const status = useAppStore((s) => s.status);
  const label: Record<string, string> = {
    idle: 'No model',
    loading: 'Loading model…',
    analysing: 'Analysing geometry…',
    generating: 'Generating scaffold…',
    ready: 'Ready',
  };
  const busy = status !== 'ready' && status !== 'idle';
  return (
    <span
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] ${
        busy
          ? 'border-accent-600/50 bg-accent-500/10 text-accent-400'
          : 'border-ink-700 bg-ink-850 text-ink-300'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${busy ? 'animate-pulse bg-accent-500' : 'bg-emerald-400'}`}
      />
      {label[status]}
    </span>
  );
}

function Menu({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button type="button" className="btn" onClick={onToggle}>
        {label} <span className="text-[9px] text-ink-400">▼</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 shadow-2xl shadow-black/50">
          {children}
        </div>
      )}
    </div>
  );
}

function useReportData(): ReportData | null {
  const analysis = useAppStore((s) => s.analysis);
  const estimate = useAppStore((s) => s.estimate);
  const config = useAppStore((s) => s.config);
  const building = useAppStore((s) => s.building);
  const material = useAppStore(selectMaterial);
  if (!analysis || !estimate || !building) return null;
  return {
    projectName: 'ScaffoldLab project',
    buildingName: building.name,
    analysis,
    config,
    material,
    estimate,
    scale: building.scale,
  };
}

function ExportMenu({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const report = useReportData();
  const scaffold = useAppStore((s) => s.scaffold);
  const material = useAppStore(selectMaterial);
  const [error, setError] = useState<string | null>(null);

  const guard = (fn: () => void | Promise<void>) => async () => {
    try {
      setError(null);
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const items: { label: string; hint: string; run: () => void | Promise<void> }[] = [
    {
      label: 'Estimate — CSV',
      hint: 'Summary + quantities',
      run: () => {
        if (!report) return;
        download(new Blob([estimateToCsv(report)], { type: 'text/csv' }), 'scaffold-estimate.csv');
      },
    },
    {
      label: 'Estimate — JSON',
      hint: 'Full structured payload',
      run: () => {
        if (!report) return;
        download(
          new Blob([estimateToJson(report)], { type: 'application/json' }),
          'scaffold-estimate.json',
        );
      },
    },
    {
      label: 'Component list — CSV',
      hint: 'One row per member',
      run: () => {
        if (!scaffold) return;
        download(
          new Blob([componentsToCsv(scaffold)], { type: 'text/csv' }),
          'scaffold-components.csv',
        );
      },
    },
    {
      label: 'PDF report',
      hint: 'Print dialog → Save as PDF',
      run: () => {
        if (!report) return;
        const canvas = getViewportCanvas();
        openPrintableReport({
          ...report,
          screenshot: canvas ? canvas.toDataURL('image/png') : null,
          generatedAt: new Date().toISOString(),
        });
      },
    },
    {
      label: 'Scaffold geometry — GLB',
      hint: 'Binary glTF',
      run: async () => {
        if (!scaffold) return;
        download(await exportScaffoldGltf(scaffold, material, true), 'scaffold.glb');
      },
    },
    {
      label: 'Scaffold geometry — GLTF',
      hint: 'JSON glTF',
      run: async () => {
        if (!scaffold) return;
        download(await exportScaffoldGltf(scaffold, material, false), 'scaffold.gltf');
      },
    },
    {
      label: 'Scaffold geometry — OBJ',
      hint: 'Wavefront',
      run: async () => {
        if (!scaffold) return;
        download(await exportScaffoldObj(scaffold, material), 'scaffold.obj');
      },
    },
  ];

  return (
    <Menu label="Export" open={open} onToggle={onToggle}>
      <div className="w-64 py-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={!report}
            onClick={guard(item.run)}
            className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[11.5px] text-ink-200 transition hover:bg-ink-700 disabled:opacity-40"
          >
            <span>{item.label}</span>
            <span className="text-[10px] text-ink-400">{item.hint}</span>
          </button>
        ))}
        {error && <div className="px-3 py-1.5 text-[10.5px] text-red-400">{error}</div>}
      </div>
    </Menu>
  );
}

function ProjectMenu({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [projects, setProjects] = useState<StoredProject[]>(() => listProjects());
  const [name, setName] = useState('Untitled project');
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Read lazily: the menu only needs a snapshot at the moment the user acts,
  // so subscribing to the whole store here would re-render on every slider move.
  const applySnapshot = useAppStore((s) => s.applySnapshot);

  const snapshot = (): ProjectSnapshot => {
    const store = useAppStore.getState();
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      name,
      config: store.config,
      materials: store.materials,
      materialId: store.materialId,
      deckId: store.deckId,
      scale: store.building?.scale ?? 1,
      scaleUnit: store.building?.scaleUnit ?? 'm',
      buildingSource: store.building?.source ?? 'demo',
      buildingName: store.building?.name ?? 'Unnamed',
    };
  };

  return (
    <Menu label="Project" open={open} onToggle={onToggle}>
      <div className="w-80 p-3">
        <div className="panel-label mb-1.5">Save project (browser storage)</div>
        <div className="flex gap-1.5">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            type="button"
            className="btn-primary shrink-0"
            onClick={() => {
              try {
                saveProject(name, snapshot());
                setProjects(listProjects());
                setMessage('Saved.');
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Save
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className="btn flex-1"
            onClick={() => download(projectToBlob(snapshot()), `${name}.scaffoldlab.json`)}
          >
            Download .json
          </button>
          <button type="button" className="btn flex-1" onClick={() => fileInput.current?.click()}>
            Open file…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                applySnapshot(parseProjectFile(await file.text()));
                setMessage('Project loaded.');
              } catch (err) {
                setMessage(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </div>

        {projects.length > 0 && (
          <>
            <div className="panel-label mb-1 mt-3">Saved projects</div>
            <ul className="max-h-52 space-y-1 overflow-y-auto">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded border border-ink-700 bg-ink-900 px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px]">{p.name}</div>
                    <div className="text-[10px] text-ink-400">
                      {new Date(p.savedAt).toLocaleString()} · {p.snapshot.buildingName}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn px-1.5 py-0.5 text-[10px]"
                    onClick={() => {
                      applySnapshot(p.snapshot);
                      setMessage(`Loaded "${p.name}".`);
                    }}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    className="btn px-1.5 py-0.5 text-[10px]"
                    onClick={() => {
                      deleteProject(p.id);
                      setProjects(listProjects());
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-2 text-[10px] text-ink-400">
          Projects store the scaffold configuration, materials and scale. Imported model files
          must be re-selected — browsers cannot re-open a local file without the user.
        </p>
        {message && <div className="mt-1.5 text-[10.5px] text-accent-400">{message}</div>}
      </div>
    </Menu>
  );
}
