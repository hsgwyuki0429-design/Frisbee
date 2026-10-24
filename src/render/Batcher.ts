import * as THREE from 'three';
import { outlineMaterial } from './toon';

export interface InstanceRef {
  mesh: THREE.InstancedMesh | null;
  outline: THREE.InstancedMesh | null;
  index: number;
  base: THREE.Matrix4;
}

interface Bucket {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  outline: { color: number; thickness: number } | null;
  items: { m: THREE.Matrix4; c: THREE.Color | null; ref: InstanceRef }[];
}

/** Collects many copies of the same geometry and emits InstancedMeshes. */
export class Batcher {
  private buckets = new Map<string, Bucket>();

  add(
    key: string,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrix: THREE.Matrix4,
    opts: { color?: THREE.Color; castShadow?: boolean; receiveShadow?: boolean; outline?: { color: number; thickness: number } } = {},
  ): InstanceRef {
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        geo,
        mat,
        castShadow: opts.castShadow ?? true,
        receiveShadow: opts.receiveShadow ?? false,
        outline: opts.outline ?? null,
        items: [],
      };
      this.buckets.set(key, b);
    }
    const ref: InstanceRef = { mesh: null, outline: null, index: b.items.length, base: matrix.clone() };
    b.items.push({ m: matrix.clone(), c: opts.color ?? null, ref });
    return ref;
  }

  build(parent: THREE.Object3D): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    for (const b of this.buckets.values()) {
      const n = b.items.length;
      if (!n) continue;
      const mesh = new THREE.InstancedMesh(b.geo, b.mat, n);
      mesh.castShadow = b.castShadow;
      mesh.receiveShadow = b.receiveShadow;
      let outline: THREE.InstancedMesh | null = null;
      if (b.outline) {
        outline = new THREE.InstancedMesh(b.geo, outlineMaterial(b.outline.color, b.outline.thickness), n);
        outline.castShadow = false;
      }
      b.items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (it.c) mesh.setColorAt(i, it.c);
        outline?.setMatrixAt(i, it.m);
        it.ref.mesh = mesh;
        it.ref.outline = outline;
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
      out.push(mesh);
      if (outline) {
        outline.computeBoundingSphere();
        parent.add(outline);
        out.push(outline);
      }
    }
    this.buckets.clear();
    return out;
  }
}

export function setInstanceMatrix(ref: InstanceRef, m: THREE.Matrix4): void {
  if (!ref.mesh) return;
  ref.mesh.setMatrixAt(ref.index, m);
  ref.mesh.instanceMatrix.needsUpdate = true;
  if (ref.outline) {
    ref.outline.setMatrixAt(ref.index, m);
    ref.outline.instanceMatrix.needsUpdate = true;
  }
}
