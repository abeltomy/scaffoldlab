/** Small presentational building blocks shared by the side panels. */

import { useState, type ReactNode } from 'react';

export function Section({
  title,
  children,
  right,
  defaultOpen = true,
  dense = false,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  dense?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-ink-800">
      <header className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1.5 text-left panel-label hover:text-ink-200"
        >
          <span
            className={`inline-block text-[9px] transition-transform ${open ? 'rotate-90' : ''}`}
          >
            ▶
          </span>
          {title}
        </button>
        {right}
      </header>
      {open && <div className={dense ? 'px-3 pb-3' : 'space-y-2.5 px-3 pb-3'}>{children}</div>}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-ink-300">{label}</span>
      <div className="w-[52%] shrink-0">{children}</div>
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  step = 0.05,
  min = 0,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        className="field pr-7 font-mono"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        // Scrolling the sidebar must never silently re-spec the scaffold:
        // blur so the wheel scrolls the panel instead of stepping the value.
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      className="field"
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find((o) => String(o.value) === raw);
        if (match) onChange(match.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 rounded px-0.5 py-0.5 text-[11px] text-ink-300 hover:text-ink-100"
    >
      <span>{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition ${checked ? 'bg-accent-500' : 'bg-ink-600'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-ink-900 shadow-sm transition-all ${
            checked ? 'left-3.5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Labelled slider with a live value readout, optional preset chips and a
 * numeric box for exact entry.
 *
 * `onChange` receives `live = true` while the handle is being dragged and
 * `false` on release, so the store can throttle expensive work during the drag
 * and always finish on the released value.
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 0.05,
  unit = 'm',
  presets,
  digits = 2,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  presets?: number[];
  digits?: number;
  onChange: (value: number, live: boolean) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <span className="panel-label">{label}</span>
        <span className="font-mono text-[11.5px] text-accent-400">
          {value.toFixed(digits)}
          <span className="ml-0.5 text-[9.5px] text-ink-400">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)), true)}
        onPointerUp={(e) => onChange(clamp(parseFloat(e.currentTarget.value)), false)}
        onKeyUp={(e) => onChange(clamp(parseFloat(e.currentTarget.value)), false)}
      />
      {presets && (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p, false)}
              className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] transition ${
                Math.abs(p - value) < 1e-6
                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                  : 'border-ink-600 text-ink-300 hover:border-ink-500 hover:text-ink-100'
              }`}
            >
              {p}
            </button>
          ))}
          <input
            type="number"
            className="ml-auto w-16 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-right font-mono text-[10.5px] text-ink-100 outline-none focus:border-accent-500/70"
            value={value}
            min={min}
            max={max}
            step={step}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(clamp(v), false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function Stat({
  label,
  value,
  unit,
  accent = false,
  onClick,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`w-full rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-left transition ${
        onClick ? 'hover:border-accent-500/60 hover:bg-ink-800' : ''
      }`}
    >
      <div className="panel-label">{label}</div>
      <div
        className={`font-mono text-[15px] leading-tight ${accent ? 'text-accent-400' : 'text-ink-100'}`}
      >
        {value}
        {unit && <span className="ml-1 text-[10px] text-ink-400">{unit}</span>}
      </div>
    </Tag>
  );
}

export function fmt(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
