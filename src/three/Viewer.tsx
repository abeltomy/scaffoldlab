/**
 * The 3D viewport: camera rig, lighting, clipping planes, measurement overlay
 * and the two scene layers (building + scaffold).
 */

import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  GizmoHelper,
  GizmoViewcube,
  Grid,
  Html,
  Line,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';
import { BuildingView } from './BuildingView';
import { ScaffoldView } from './ScaffoldView';

let canvasElement: HTMLCanvasElement | null = null;
/** Used by the PDF/report exporter to grab a still of the scene. */
export function getViewportCanvas(): HTMLCanvasElement | null {
  return canvasElement;
}

export function Viewer() {
  const orthographic = useAppStore((s) => s.orthographic);
  const showGrid = useAppStore((s) => s.showGrid);
  const analysis = useAppStore((s) => s.analysis);
  const tool = useAppStore((s) => s.tool);
  const addMeasurePoint = useAppStore((s) => s.addMeasurePoint);
  const select = useAppStore((s) => s.select);

  const size = analysis ? Math.max(analysis.height, analysis.width, analysis.depth) : 100;

  const clippingPlanes = useClippingPlanes();

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (tool !== 'measure') return;
    event.stopPropagation();
    const p = event.point;
    addMeasurePoint([p.x, p.y, p.z]);
  };

  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: true, localClippingEnabled: true }}
      raycaster={{ near: 0, far: Number.MAX_SAFE_INTEGER }} // see <RaycastRange>
      onCreated={(state) => {
        const { gl, scene } = state;
        canvasElement = gl.domElement;
        if (import.meta.env.DEV) {
          (window as unknown as { r3f: unknown }).r3f = state;
        }
        gl.localClippingEnabled = true;
        scene.background = new THREE.Color('#e6eaf0');
      }}
      onPointerMissed={() => {
        if (tool === 'select') select(null);
      }}
    >
      <RaycastRange />
      <SceneFog size={size} />
      <CameraRig size={size} orthographic={orthographic} />
      {/* Sky/ground bounce, warm key from the front-right, cool fill from behind
          and a low rim so tubes read against a dark building. */}
      <hemisphereLight args={['#ffffff', '#b9c2ce', 1.15]} />
      <directionalLight position={[size, size * 1.6, size * 0.7]} intensity={1.9} color="#fff6e8" />
      <directionalLight position={[-size, size * 0.6, -size]} intensity={0.55} color="#cfe0ff" />
      <directionalLight position={[0, -size * 0.2, size * 1.4]} intensity={0.25} color="#ffffff" />

      <Suspense fallback={null}>
        {/* Handler attached only while measuring — see ScaffoldView for why. */}
        <group onPointerDown={tool === 'measure' ? handlePointerDown : undefined}>
          <BuildingView clippingPlanes={clippingPlanes} />
          <ScaffoldView clippingPlanes={clippingPlanes} />
        </group>
      </Suspense>

      {showGrid && (
        <Grid
          position={[0, -0.02, 0]}
          args={[size * 6, size * 6]}
          cellSize={Math.max(1, Math.round(size / 40))}
          cellThickness={0.6}
          cellColor="#cbd3de"
          sectionSize={Math.max(5, Math.round(size / 8))}
          sectionThickness={1.1}
          sectionColor="#aab5c4"
          fadeDistance={size * 6}
          fadeStrength={1.2}
          infiniteGrid
          followCamera={false}
        />
      )}

      <MeasurementOverlay />
      <ClipPlaneVisual planes={clippingPlanes} size={size} />

      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewcube
          color="#f2f5f9"
          strokeColor="#9aa5b4"
          textColor="#26313f"
          hoverColor="#e8951b"
        />
      </GizmoHelper>
      <AxisIndicator size={size} />
    </Canvas>
  );
}

/**
 * Depth fog, kept proportional to the model.
 *
 * This cannot live in `onCreated`: that fires once, when the first model may
 * still be loading and `size` is the 100 m placeholder — which would then fog
 * out a 380 m tower — and it would never follow a switch to another building.
 */
function SceneFog({ size }: { size: number }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new THREE.Fog('#e6eaf0', size * 3, size * 9);
    return () => {
      scene.fog = null;
    };
  }, [scene, size]);
  return null;
}

/**
 * R3F leaves the raycaster's `far` unset (null) on mount, and three's
 * `distance > raycaster.far` test then rejects every intersection — component
 * picking would silently never work. Re-assert the range after mount, where it
 * survives R3F's own prop application.
 */
function RaycastRange() {
  const raycaster = useThree((s) => s.raycaster);
  useEffect(() => {
    raycaster.near = 0;
    raycaster.far = Number.MAX_SAFE_INTEGER;
  }, [raycaster]);
  return null;
}

/** Clipping planes derived from the section-tool state and the model bounds. */
function useClippingPlanes(): THREE.Plane[] {
  const enabled = useAppStore((s) => s.clipEnabled);
  const axis = useAppStore((s) => s.clipAxis);
  const position = useAppStore((s) => s.clipPosition);
  const flip = useAppStore((s) => s.clipFlip);
  const analysis = useAppStore((s) => s.analysis);

  return useMemo(() => {
    if (!enabled || !analysis) return [];
    const { min, max } = analysis.bbox;
    const pad = Math.max(analysis.width, analysis.depth) * 0.6;
    const ranges: Record<string, [number, number]> = {
      x: [min[0] - pad, max[0] + pad],
      y: [min[1] - 2, max[1] + 20],
      z: [min[2] - pad, max[2] + pad],
    };
    const [lo, hi] = ranges[axis];
    const at = lo + (hi - lo) * position;
    const normal = new THREE.Vector3(
      axis === 'x' ? 1 : 0,
      axis === 'y' ? 1 : 0,
      axis === 'z' ? 1 : 0,
    ).multiplyScalar(flip ? 1 : -1);
    return [new THREE.Plane(normal, flip ? -at : at)];
  }, [enabled, axis, position, flip, analysis]);
}

function ClipPlaneVisual({ planes, size }: { planes: THREE.Plane[]; size: number }) {
  if (!planes.length) return null;
  const plane = planes[0];
  const n = plane.normal;
  const point = n.clone().multiplyScalar(-plane.constant);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return (
    <mesh position={point} quaternion={quaternion}>
      <planeGeometry args={[size * 2.2, size * 2.2]} />
      <meshBasicMaterial
        color="#0d7fa8"
        transparent
        opacity={0.08}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function CameraRig({ size, orthographic }: { size: number; orthographic: boolean }) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const command = useAppStore((s) => s.cameraCommand);
  const { camera } = useThree();

  const home = useMemo<[number, number, number]>(
    () => [size * 1.15, size * 0.72, size * 1.25],
    [size],
  );
  const target = useMemo(() => new THREE.Vector3(0, size * 0.38, 0), [size]);

  const applyView = useCallback(
    (kind: string) => {
      const c = controls.current;
      if (!c) return;
      const d = size * 1.7;
      const views: Record<string, [number, number, number]> = {
        reset: home,
        iso: home,
        top: [0.001, d * 1.3, 0.001],
        front: [0, size * 0.4, d],
        back: [0, size * 0.4, -d],
        left: [-d, size * 0.4, 0],
        right: [d, size * 0.4, 0],
        corner: [d * 0.7, size * 0.9, d * 0.7],
      };
      const p = views[kind] ?? home;
      camera.position.set(p[0], p[1], p[2]);
      c.target.copy(target);
      camera.lookAt(target);
      // Damped OrbitControls keeps its own spherical state; update() re-derives
      // it from the camera's new position, so the jump sticks.
      c.update();
    },
    [camera, home, size, target],
  );

  useEffect(() => {
    if (command) applyView(command.kind);
  }, [command, applyView]);

  useEffect(() => {
    // Re-frame whenever the model's overall size changes (new import/scale).
    applyView('reset');
  }, [applyView]);

  return (
    <>
      {/* No `position` prop: the rig owns the camera transform, otherwise R3F
          would re-apply the home position on every re-render. */}
      {orthographic ? (
        <OrthographicCamera
          makeDefault
          zoom={Math.max(0.6, 420 / size)}
          near={-size * 20}
          far={size * 40}
        />
      ) : (
        <PerspectiveCamera makeDefault fov={45} near={size / 400} far={size * 60} />
      )}
      <OrbitControls
        ref={controls}
        makeDefault
        target={target}
        enableDamping
        dampingFactor={0.09}
        maxDistance={size * 12}
        minDistance={size / 200}
        maxPolarAngle={Math.PI * 0.499}
      />
    </>
  );
}

function MeasurementOverlay() {
  const measurements = useAppStore((s) => s.measurements);
  const pending = useAppStore((s) => s.pendingPoint);
  const size = useAppStore((s) => s.analysis?.height ?? 100);

  return (
    <group>
      {pending && (
        <mesh position={pending}>
          <sphereGeometry args={[size * 0.006, 12, 12]} />
          <meshBasicMaterial color="#a45c06" />
        </mesh>
      )}
      {measurements.map((m) => {
        const a = new THREE.Vector3(...m.a);
        const b = new THREE.Vector3(...m.b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const d = a.distanceTo(b);
        const dy = Math.abs(a.y - b.y);
        const dh = Math.hypot(a.x - b.x, a.z - b.z);
        return (
          <group key={m.id}>
            <Line points={[a, b]} color="#a45c06" lineWidth={2} depthTest={false} />
            <mesh position={a}>
              <sphereGeometry args={[size * 0.005, 10, 10]} />
              <meshBasicMaterial color="#a45c06" />
            </mesh>
            <mesh position={b}>
              <sphereGeometry args={[size * 0.005, 10, 10]} />
              <meshBasicMaterial color="#a45c06" />
            </mesh>
            <Html position={mid} center distanceFactor={size * 1.2} zIndexRange={[10, 0]}>
              <div className="pointer-events-none whitespace-nowrap rounded border border-accent-500/60 bg-ink-950/90 px-2 py-1 font-mono text-[11px] text-accent-400 shadow-lg">
                {d.toFixed(2)} m
                <span className="ml-2 text-ink-300">
                  ↕ {dy.toFixed(2)} ↔ {dh.toFixed(2)}
                </span>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/** Small XYZ triad at the world origin. */
function AxisIndicator({ size }: { size: number }) {
  const len = size * 0.22;
  const axes: Array<{ dir: [number, number, number]; color: string; label: string }> = [
    { dir: [1, 0, 0], color: '#c62828', label: 'X' },
    { dir: [0, 1, 0], color: '#1f7a35', label: 'Y' },
    { dir: [0, 0, 1], color: '#1f5fd0', label: 'Z' },
  ];
  return (
    <group>
      {axes.map((a) => {
        const end = new THREE.Vector3(...a.dir).multiplyScalar(len);
        return (
          <group key={a.label}>
            <Line points={[new THREE.Vector3(0, 0, 0), end]} color={a.color} lineWidth={1.6} />
            <Html position={end} center distanceFactor={size * 1.6}>
              <span className="font-mono text-[11px] font-bold" style={{ color: a.color }}>
                {a.label}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
