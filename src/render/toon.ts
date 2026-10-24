import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** Three-band ramp for the cel-shaded look. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export interface ToonOptions {
  emissive?: number;
  emissiveIntensity?: number;
  map?: THREE.Texture;
  transparent?: boolean;
  opacity?: number;
  vertexColors?: boolean;
  side?: THREE.Side;
}

/** Shared cel-shaded material. Cached by color unless a texture is given. */
export function toon(color: number, opts: ToonOptions = {}): THREE.MeshToonMaterial {
  const key = opts.map
    ? ''
    : `${color}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.transparent ? opts.opacity : 1}|${opts.vertexColors ? 1 : 0}|${opts.side ?? 0}`;
  if (key) {
    const cached = toonCache.get(key);
    if (cached) return cached;
  }
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    map: opts.map ?? null,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    vertexColors: opts.vertexColors ?? false,
    side: opts.side ?? THREE.FrontSide,
  });
  if (key) {
    m.userData.shared = true;
    toonCache.set(key, m);
  }
  return m;
}

const outlineCache = new Map<string, THREE.Material>();

/**
 * Back-face outline material that pushes vertices out along their normals.
 * Works with instanced meshes because the offset happens before instancing.
 */
export function outlineMaterial(color = 0x2a2140, thickness = 0.04): THREE.Material {
  const key = `${color}|${thickness}`;
  const cached = outlineCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineThickness;');
  };
  m.customProgramCacheKey = () => `outline-${thickness}`;
  m.userData.shared = true;
  outlineCache.set(key, m);
  return m;
}

/** Adds an outline shell to a mesh (shares geometry). */
export function addOutline(mesh: THREE.Mesh, color = 0x2a2140, thickness = 0.04): THREE.Mesh {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(color, thickness));
  o.castShadow = false;
  o.receiveShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

export function basic(color: number, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, ...opts });
}

/** Disposes geometries and non-shared materials/textures under a root. */
export function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData.shared) geos.add(mesh.geometry);
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => mats.add(m));
    else if (mat) mats.add(mat);
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => {
    if (m.userData.shared) return;
    const anyM = m as THREE.Material & { map?: THREE.Texture | null };
    if (anyM.map && !anyM.map.userData.shared) anyM.map.dispose();
    m.dispose();
  });
}
