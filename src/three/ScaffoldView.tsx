/**
 * Scaffold rendering.
 *
 * Every component type is drawn as a single InstancedMesh: a 150 000-member
 * scaffold is then ~6 draw calls instead of 150 000 objects. Matrices are built
 * once per generation from the plain component data (mid-point + unit direction
 * + length), which is also why the calculation engine never needs Three.js.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ComponentType, ScaffoldComponent } from '../scaffolding/types';
import { findSheeting } from '../scaffolding/materials/materialLibrary';
import {
  selectDeck,
  selectMaterial,
  selectMemberScale,
  useAppStore,
  type ColorMode,
} from '../store/useAppStore';

/** Legend palette — saturated enough to separate on a light background. */
export const TYPE_COLORS: Record<ComponentType, string> = {
  standard: '#d97706',
  ledger: '#0d7fa8',
  transom: '#0f8a5f',
  brace: '#c0392b',
  platform: '#96703f',
  toeboard: '#6b7787',
  guardrail: '#7a4fb5',
  sheeting: '#2f7d5a',
};

const UP = new THREE.Vector3(0, 1, 0);

interface TypeGroup {
  type: ComponentType;
  mesh: THREE.InstancedMesh;
  components: ScaffoldComponent[];
}

function heightColor(t: number, target: THREE.Color): THREE.Color {
  // Cool-to-warm ramp: blue → cyan → yellow → red as the lift rises.
  const hue = (1 - Math.min(1, Math.max(0, t))) * 0.62;
  return target.setHSL(hue, 0.72, 0.45);
}

export function ScaffoldView({ clippingPlanes }: { clippingPlanes: THREE.Plane[] }) {
  const scaffold = useAppStore((s) => s.scaffold);
  const show = useAppStore((s) => s.showScaffold);
  const opacity = useAppStore((s) => s.scaffoldOpacity);
  const colorMode = useAppStore((s) => s.colorMode);
  const visibleTypes = useAppStore((s) => s.visibleTypes);
  const material = useAppStore(selectMaterial);
  const deck = useAppStore(selectDeck);
  const sheeting = useAppStore((s) => findSheeting(s.config.sheeting));
  const tool = useAppStore((s) => s.tool);
  const select = useAppStore((s) => s.select);
  const selected = useAppStore((s) => s.selected);

  // Display-only exaggeration — quantities always use the real diameter.
  const memberScale = useAppStore(selectMemberScale);
  const tubeRadius = Math.max(0.012, material.diameterMm / 2000) * memberScale;
  const deckThickness = 0.05 * Math.max(1, memberScale * 0.6);

  const groups = useMemo<TypeGroup[]>(() => {
    if (!scaffold) return [];
    const byType = new Map<ComponentType, ScaffoldComponent[]>();
    for (const c of scaffold.components) {
      const list = byType.get(c.type);
      if (list) list.push(c);
      else byType.set(c.type, [c]);
    }

    const maxY = scaffold.levels.reduce((m, l) => Math.max(m, l.elevation), 1);
    const out: TypeGroup[] = [];
    const quat = new THREE.Quaternion();
    const dir = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const mat4 = new THREE.Matrix4();
    const color = new THREE.Color();
    const xAxis = new THREE.Vector3();
    const zAxis = new THREE.Vector3();

    for (const [type, list] of byType) {
      const isDeck = type === 'platform';
      const isSheet = type === 'sheeting';
      const isBoard = type === 'toeboard';
      // Sheeting is a vertical panel; decks and boards are flat slabs; the rest
      // are tubes. Standards get more radial segments — they are the members you
      // look along, so faceting shows there first.
      const flat = isDeck || isBoard || isSheet;
      const geometry = flat
        ? new THREE.BoxGeometry(1, 1, 1)
        : new THREE.CylinderGeometry(0.5, 0.5, 1, type === 'standard' ? 10 : 6, 1, true);

      const meshMaterial = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        roughness: isDeck ? 0.85 : isSheet ? 0.95 : material.roughness,
        metalness: isDeck || isSheet ? 0.05 : material.metalness,
        transparent: true,
        opacity: isSheet ? sheeting.opacity : 1,
        depthWrite: !isSheet,
        side: isSheet ? THREE.DoubleSide : flat ? THREE.FrontSide : THREE.DoubleSide,
      });

      const mesh = new THREE.InstancedMesh(geometry, meshMaterial, list.length);
      mesh.name = `scaffold-${type}`;
      mesh.castShadow = !isDeck && !isSheet;
      mesh.renderOrder = isSheet ? 1 : 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        pos.set(c.position[0], c.position[1], c.position[2]);
        dir.set(c.direction[0], c.direction[1], c.direction[2]).normalize();

        if (flat) {
          // Board-like members: X along the run, Y up, Z across the deck.
          xAxis.copy(dir);
          zAxis.crossVectors(xAxis, UP).normalize();
          if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1);
          mat4.makeBasis(xAxis, UP, zAxis);
          if (isSheet) {
            // `width` carries the panel height for sheeting.
            scl.set(c.length, c.width, 0.01);
          } else {
            scl.set(
              c.length,
              isDeck ? deckThickness : 0.15 * memberScale,
              isDeck ? c.width : 0.03 * memberScale,
            );
          }
          mat4.scale(scl);
          mat4.setPosition(pos);
        } else {
          quat.setFromUnitVectors(UP, dir);
          const r = type === 'guardrail' ? tubeRadius * 0.85 : tubeRadius;
          scl.set(r * 2, c.length, r * 2);
          mat4.compose(pos, quat, scl);
        }
        mesh.setMatrixAt(i, mat4);
        instanceColor(c, colorMode, maxY, material.color, deck.color, sheeting.color, color);
        // Slight per-instance value jitter: a scaffold of thousands of identical
        // members reads as a flat mass without it.
        if (!isSheet) {
          const jitter = 0.88 + ((c.id * 2654435761) % 1000) / 1000 * 0.24;
          color.multiplyScalar(jitter);
        }
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      out.push({ type, mesh, components: list });
    }
    return out;
  }, [scaffold, colorMode, material, deck, sheeting, tubeRadius, deckThickness, memberScale]);

  // Dispose GPU resources when the scaffold is regenerated.
  useEffect(
    () => () => {
      for (const g of groups) {
        g.mesh.geometry.dispose();
        (g.mesh.material as THREE.Material).dispose();
        g.mesh.dispose();
      }
    },
    [groups],
  );

  useEffect(() => {
    for (const g of groups) {
      const m = g.mesh.material as THREE.MeshStandardMaterial;
      // Sheeting has its own base transparency; the viewport slider scales it
      // rather than replacing it.
      const base = g.type === 'sheeting' ? sheeting.opacity : 1;
      m.opacity = opacity * base;
      m.transparent = m.opacity < 0.999;
      m.depthWrite = m.opacity > 0.9;
      m.clippingPlanes = clippingPlanes;
      m.needsUpdate = true;
    }
  }, [groups, opacity, clippingPlanes, sheeting]);

  if (!scaffold || !show) return null;

  return (
    <group>
      {groups.map((g) => (
        <primitive
          key={g.type}
          object={g.mesh}
          visible={visibleTypes[g.type]}
          // Only interactive in select mode: an object with an event handler is
          // raycast on every pointer move, which is expensive at 100k instances.
          onClick={
            tool === 'select'
              ? (event: { stopPropagation: () => void; instanceId?: number }) => {
                  event.stopPropagation();
                  const c = g.components[event.instanceId ?? -1];
                  if (c) select(c);
                }
              : undefined
          }
        />
      ))}
      {selected && <SelectionHighlight component={selected} radius={tubeRadius} />}
    </group>
  );
}

function instanceColor(
  c: ScaffoldComponent,
  mode: ColorMode,
  maxY: number,
  materialColor: string,
  deckColor: string,
  sheetColor: string,
  target: THREE.Color,
): THREE.Color {
  if (c.type === 'sheeting') return target.set(mode === 'type' ? TYPE_COLORS.sheeting : sheetColor);
  switch (mode) {
    case 'type':
      return target.set(TYPE_COLORS[c.type]);
    case 'height':
      return heightColor(c.position[1] / Math.max(1, maxY), target);
    case 'material':
      return target.set(c.type === 'platform' ? deckColor : materialColor);
    default:
      switch (c.type) {
        case 'platform':
          return target.set(deckColor);
        case 'toeboard':
          return target.set('#b07d1c'); // painted board, reads against the tube
        case 'guardrail':
          return target.set(materialColor).lerp(new THREE.Color('#1c2530'), 0.22);
        default:
          return target.set(materialColor);
      }
  }
}

function SelectionHighlight({
  component,
  radius,
}: {
  component: ScaffoldComponent;
  radius: number;
}) {
  const { position, quaternion, scale, flat } = useMemo(() => {
    const dir = new THREE.Vector3(...component.direction).normalize();
    // Decks, toe boards and sheeting are all box-shaped: aligning a cylinder to
    // their run direction drew a tube lying across the bay instead.
    const isDeck = component.type === 'platform';
    const isSheet = component.type === 'sheeting';
    const flat = isDeck || isSheet || component.type === 'toeboard';
    let q: THREE.Quaternion;
    if (flat) {
      // Match the deck's basis (X along the run, Y up) rather than aligning the
      // box's Y axis with the run direction.
      const zAxis = new THREE.Vector3().crossVectors(dir, UP).normalize();
      if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1);
      q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(dir, UP, zAxis),
      );
    } else {
      q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    }
    return {
      flat,
      position: new THREE.Vector3(...component.position),
      quaternion: q,
      scale: isSheet
        ? new THREE.Vector3(component.length, component.width, 0.08)
        : isDeck
          ? new THREE.Vector3(component.length, 0.12, component.width)
          : flat
            ? new THREE.Vector3(component.length, 0.22, 0.12)
            : new THREE.Vector3(radius * 5, component.length * 1.02, radius * 5),
    };
  }, [component, radius]);

  return (
    <mesh position={position} quaternion={quaternion} scale={scale} renderOrder={2}>
      {flat ? <boxGeometry args={[1, 1, 1]} /> : <cylinderGeometry args={[0.5, 0.5, 1, 10]} />}
      <meshBasicMaterial color="#0d7fa8" transparent opacity={0.45} depthTest={false} />
    </mesh>
  );
}
