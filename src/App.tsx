/**
 * Application shell: top bar, two collapsible sidebars, viewport, bottom bar.
 * Desktop-first, but both sidebars collapse into overlay sheets under 1100 px.
 */

import { useEffect, useState } from 'react';
import { Viewer } from './three/Viewer';
import { TopBar } from './ui/TopBar';
import { LeftSidebar } from './ui/LeftSidebar';
import { RightSidebar } from './ui/RightSidebar';
import { BottomBar } from './ui/BottomBar';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const loadDemo = useAppStore((s) => s.loadDemo);
  const loadFile = useAppStore((s) => s.loadFile);
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const dismissError = useAppStore((s) => s.dismissError);
  const object = useAppStore((s) => s.object);

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [dragging, setDragging] = useState(false);

  // Demo building loads automatically so the app is useful on first paint.
  useEffect(() => {
    void loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex h-full flex-col bg-ink-950"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void loadFile(file);
      }}
    >
      <TopBar />

      <div className="relative flex min-h-0 flex-1">
        <Sidebar side="left" open={leftOpen} onToggle={() => setLeftOpen((o) => !o)}>
          <LeftSidebar />
        </Sidebar>

        <main className="relative min-w-0 flex-1">
          <Viewer />

          {!object && status !== 'loading' && status !== 'analysing' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="rounded-lg border border-ink-700 bg-ink-900/90 px-6 py-4 text-center">
                <div className="text-[14px] font-medium">No building loaded</div>
                <div className="mt-1 text-[11.5px] text-ink-400">
                  Drop a GLB / GLTF / OBJ / STL / FBX file here, or load the demo tower.
                </div>
              </div>
            </div>
          )}

          {(status === 'loading' || status === 'analysing' || status === 'generating') && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-accent-600/50 bg-ink-900/95 px-3 py-1.5 text-[11.5px] text-accent-400">
              {status === 'loading' && 'Loading model…'}
              {status === 'analysing' && 'Analysing building geometry…'}
              {status === 'generating' && 'Generating scaffold…'}
            </div>
          )}

          {dragging && (
            <div className="absolute inset-0 z-30 grid place-items-center border-4 border-dashed border-accent-500 bg-ink-950/80">
              <div className="text-[15px] font-semibold text-accent-400">Drop model to load</div>
            </div>
          )}
        </main>

        <Sidebar side="right" open={rightOpen} onToggle={() => setRightOpen((o) => !o)}>
          <RightSidebar />
        </Sidebar>
      </div>

      <BottomBar />

      {error && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[min(560px,90vw)] -translate-x-1/2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="text-[12px] font-semibold text-red-700">Could not complete</div>
              <div className="mt-0.5 text-[11.5px] text-red-600">{error}</div>
            </div>
            <button type="button" className="btn shrink-0" onClick={dismissError}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({
  side,
  open,
  onToggle,
  children,
}: {
  side: 'left' | 'right';
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <aside
        className={`absolute inset-y-0 z-20 w-[300px] shrink-0 border-ink-800 bg-ink-900 transition-transform duration-200 lg:relative lg:translate-x-0 ${
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
        } ${open ? 'translate-x-0' : side === 'left' ? '-translate-x-full lg:hidden' : 'translate-x-full lg:hidden'}`}
      >
        {children}
      </aside>
      <button
        type="button"
        onClick={onToggle}
        title={`${open ? 'Hide' : 'Show'} ${side} panel`}
        className={`absolute top-1/2 z-20 h-14 w-4 -translate-y-1/2 rounded-sm border border-ink-700 bg-ink-850 text-[9px] text-ink-400 transition hover:bg-ink-700 hover:text-ink-100 ${
          side === 'left'
            ? open
              ? 'left-[300px]'
              : 'left-0'
            : open
              ? 'right-[300px]'
              : 'right-0'
        }`}
      >
        {side === 'left' ? (open ? '‹' : '›') : open ? '›' : '‹'}
      </button>
    </>
  );
}
