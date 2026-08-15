/**
 * Model import + triangle extraction.
 *
 * Supported: GLB/GLTF (preferred), OBJ, STL, FBX. Everything is normalised to a
 * single ground-aligned, XZ-centred Object3D and then flattened into a triangle
 * soup for the analyser.
 */

import * as THREE from 'three';

export const SUPPORTED_EXTENSIONS = ['glb', 'gltf', 'obj', 'stl', 'fbx'] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/** Above this we subsample when building the triangle soup for analysis. */
const ANALYSIS_TRIANGLE_BUDGET = 600_000;

export function extensionOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export async function loadModelFile(file: File): Promise<THREE.Object3D> {
  const ext = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension)) {
    throw new Error(
      `Unsupported format ".${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(', ').toUpperCase()}.`,
    );
  }
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error('File is empty.');

  // Loaders are imported per format so the initial bundle carries none of them.
  try {
    switch (ext) {
      case 'glb':
      case 'gltf': {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader().parseAsync(buffer, '');
        return gltf.scene;
      }
      case 'obj': {
        const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
        return new OBJLoader().parse(new TextDecoder().decode(buffer));
      }
      case 'stl': {
        const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
        return new THREE.Mesh(new STLLoader().parse(buffer), new THREE.MeshStandardMaterial());
      }
      case 'fbx': {
        const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
        return new FBXLoader().parse(buffer, '');
      }
      default:
        throw new Error(`Unsupported format ".${ext}".`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${file.name}: ${detail}`);
  }
}

/** True if any mesh in the tree carries usable position data. */
export function hasGeometry(object: THREE.Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry?.getAttribute('position')?.count) found = true;
  });
  return found;
}

/**
 * Ground-align and centre the model: min Y → 0, XZ bounding-box centre → origin.
 * Returns the applied translation so callers can undo it if they need the
 * model's original coordinates (e.g. for GIS georeferencing later).
 */
export function normalizeTransform(object: THREE.Object3D): THREE.Vector3 {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x)) {
    throw new Error('Model has no measurable bounding box.');
  }
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
  object.position.add(offset);
  object.updateMatrixWorld(true);
  return offset;
}

/**
 * Flatten every mesh into a world-space triangle soup.
 *
 * Non-indexed and indexed geometry are both handled; when the mesh exceeds the
 * analysis budget we take a uniform stride through the triangles. A silhouette
 * raster does not need every triangle — it needs enough samples to cover the
 * façades, and a stride keeps the sampling unbiased across the whole model.
 */
export function extractTriangles(object: THREE.Object3D): {
  positions: Float32Array;
  triangleCount: number;
  sampled: boolean;
} {
  object.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  let total = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos || pos.count < 3) return;
    meshes.push(mesh);
    total += mesh.geometry.index ? mesh.geometry.index.count / 3 : pos.count / 3;
  });
  if (!meshes.length) throw new Error('Model contains no renderable meshes.');

  const stride = Math.max(1, Math.ceil(total / ANALYSIS_TRIANGLE_BUDGET));
  const kept = Math.ceil(total / stride);
  const out = new Float32Array(kept * 9);
  const v = new THREE.Vector3();
  let w = 0;
  let counter = 0;

  for (const mesh of meshes) {
    const geom = mesh.geometry;
    const pos = geom.getAttribute('position');
    const index = geom.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const matrix = mesh.matrixWorld;
    for (let t = 0; t < triCount; t++) {
      if (counter++ % stride !== 0) continue;
      if (w + 9 > out.length) break;
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(t * 3 + k) : t * 3 + k;
        v.fromBufferAttribute(pos as THREE.BufferAttribute, vi).applyMatrix4(matrix);
        out[w++] = v.x;
        out[w++] = v.y;
        out[w++] = v.z;
      }
    }
  }

  return {
    positions: w === out.length ? out : out.subarray(0, w).slice(),
    triangleCount: Math.floor(w / 9),
    sampled: stride > 1,
  };
}
