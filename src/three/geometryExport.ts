/**
 * Scaffold geometry export (GLB / GLTF / OBJ).
 *
 * The scene is rebuilt from the component data rather than reusing the
 * viewport's InstancedMeshes: exporters handle plain merged meshes far more
 * reliably, and downstream CAD/BIM tools prefer one mesh per component type.
 */

import * as THREE from 'three';
import type { ComponentType, MaterialSpec, ScaffoldModel } from '../scaffolding/types';

const UP = new THREE.Vector3(0, 1, 0);

/** Rebuild the scaffold as instanced meshes in a throwaway scene. */
export function buildScaffoldScene(model: ScaffoldModel, material: MaterialSpec): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = 'scaffold';
  const radius = Math.max(0.012, material.diameterMm / 2000);
  const byType = new Map<ComponentType, typeof model.components>();
  for (const c of model.components) {
    const list = byType.get(c.type);
    if (list) list.push(c);
    else byType.set(c.type, [c]);
  }

  const quat = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const zAxis = new THREE.Vector3();

  for (const [type, list] of byType) {
    const board = type === 'platform' || type === 'toeboard';
    const geometry = board
      ? new THREE.BoxGeometry(1, 1, 1)
      : new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: material.color }),
      list.length,
    );
    mesh.name = type;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      pos.set(c.position[0], c.position[1], c.position[2]);
      dir.set(c.direction[0], c.direction[1], c.direction[2]).normalize();
      if (board) {
        zAxis.crossVectors(dir, UP).normalize();
        if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1);
        m.makeBasis(dir, UP, zAxis);
        m.scale(
          scl.set(c.length, type === 'platform' ? 0.05 : 0.15, type === 'platform' ? c.width : 0.03),
        );
        m.setPosition(pos);
      } else {
        quat.setFromUnitVectors(UP, dir);
        m.compose(pos, quat, scl.set(radius * 2, c.length, radius * 2));
      }
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
  return scene;
}

// The exporters are only needed when the user actually exports, so they are
// loaded on demand rather than shipped in the initial bundle.
export async function exportScaffoldGltf(
  model: ScaffoldModel,
  material: MaterialSpec,
  binary: boolean,
): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const scene = buildScaffoldScene(model, material);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, { binary });
  disposeScene(scene);
  return binary
    ? new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
    : new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
}

export async function exportScaffoldObj(
  model: ScaffoldModel,
  material: MaterialSpec,
): Promise<Blob> {
  const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
  const scene = buildScaffoldScene(model, material);
  const text = new OBJExporter().parse(scene);
  disposeScene(scene);
  return new Blob([text], { type: 'text/plain' });
}

function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
}
