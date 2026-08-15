/**
 * Renders the imported/demo building with a neutral material so the scaffold
 * always reads as the foreground object, and applies the model scale as a
 * group transform (the analysis uses the same factor, so the two stay in sync).
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useAppStore } from '../store/useAppStore';

export function BuildingView({ clippingPlanes }: { clippingPlanes: THREE.Plane[] }) {
  const object = useAppStore((s) => s.object);
  const scale = useAppStore((s) => s.building?.scale ?? 1);
  const visible = useAppStore((s) => s.showBuilding);
  const opacity = useAppStore((s) => s.buildingOpacity);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // Light warm grey: pale enough to sit back on a light page, but a clear
        // step lighter than the steel tube so the scaffold stays the subject.
        color: '#c4cbd5',
        roughness: 0.82,
        metalness: 0.04,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.opacity = opacity;
    material.transparent = opacity < 0.999;
    material.depthWrite = opacity > 0.95;
    material.clippingPlanes = clippingPlanes;
    material.clipIntersection = false;
    material.needsUpdate = true;
  }, [material, opacity, clippingPlanes]);

  useEffect(() => {
    if (!object) return;
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [object, material]);

  if (!object) return null;
  return (
    <group scale={scale} visible={visible}>
      <primitive object={object} />
    </group>
  );
}
