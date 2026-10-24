import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Procedural low-poly models built from primitives with baked vertex colours. */

function colored(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  g.userData.shared = true;
  return g;
}

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return g;
}

function sphere(r: number, x: number, y: number, z: number, color: number, sy = 1, seg = 16): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.floor(seg * 0.7)));
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return colored(g, color);
}

function cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, color: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1);
  g.translate(x, y + h / 2, z);
  return colored(g, color);
}

function cone(r: number, h: number, x: number, y: number, z: number, color: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(x, y + h / 2, z);
  return colored(g, color);
}

export const TREE_DIMS = {
  round: { trunkR: 0.42, trunkH: 3.3, leaves: [{ x: 0, y: 4.5, z: 0, r: 2.5 }, { x: 1.3, y: 3.8, z: 0.5, r: 1.7 }, { x: -1.3, y: 3.9, z: -0.4, r: 1.6 }] },
  lollipop: { trunkR: 0.3, trunkH: 4.6, leaves: [{ x: 0, y: 5.8, z: 0, r: 1.9 }] },
  pine: { trunkR: 0.38, trunkH: 2.2, leaves: [{ x: 0, y: 3.6, z: 0, r: 2.3 }, { x: 0, y: 5.6, z: 0, r: 1.6 }] },
  cloud: { trunkR: 0.34, trunkH: 3.6, leaves: [{ x: 0, y: 4.8, z: 0, r: 2.2 }, { x: 1.2, y: 4.2, z: 0.3, r: 1.5 }, { x: -1.1, y: 4.4, z: -0.3, r: 1.5 }] },
};

export function roundTreeGeo(variant: number): THREE.BufferGeometry {
  return cached(`roundtree${variant}`, () => {
    const greens = [
      [0x3fc44a, 0x33b23f, 0x52d45b],
      [0x5bcf3a, 0x4cb931, 0x74dc4f],
      [0x2fb36a, 0x27a05c, 0x45c47c],
    ][variant % 3];
    const d = TREE_DIMS.round;
    return merge([
      cyl(0.48, 0.34, d.trunkH, 0, 0, 0, 0x9b5a2e, 10),
      sphere(d.leaves[0].r, d.leaves[0].x, d.leaves[0].y, d.leaves[0].z, greens[0], 1, 18),
      sphere(d.leaves[1].r, d.leaves[1].x, d.leaves[1].y, d.leaves[1].z, greens[1], 1, 14),
      sphere(d.leaves[2].r, d.leaves[2].x, d.leaves[2].y, d.leaves[2].z, greens[2], 1, 14),
    ]);
  });
}

export function lollipopTreeGeo(variant: number): THREE.BufferGeometry {
  return cached(`lollipop${variant}`, () => {
    const tops = [0xff7eb6, 0xffa24c, 0x6fdc5a, 0xc58bff][variant % 4];
    const d = TREE_DIMS.lollipop;
    return merge([
      cyl(0.32, 0.24, d.trunkH, 0, 0, 0, 0xf6e7c8, 10),
      sphere(d.leaves[0].r, 0, d.leaves[0].y, 0, tops, 1, 18),
    ]);
  });
}

export function pineTreeGeo(): THREE.BufferGeometry {
  return cached('pine', () =>
    merge([
      cyl(0.42, 0.3, 2.4, 0, 0, 0, 0x8a4f2a, 10),
      cone(2.6, 2.8, 0, 1.9, 0, 0x2f9e48, 14),
      cone(2.1, 2.5, 0, 3.4, 0, 0x37ae52, 14),
      cone(1.5, 2.2, 0, 4.9, 0, 0x45c160, 14),
    ]),
  );
}

export function cloudTreeGeo(variant: number): THREE.BufferGeometry {
  return cached(`cloudtree${variant}`, () => {
    const tones = [
      [0xffffff, 0xffeaf6, 0xfff6fb],
      [0xffe4f2, 0xffd0e9, 0xfff0f8],
      [0xe6f0ff, 0xd6e6ff, 0xf4f8ff],
    ][variant % 3];
    const d = TREE_DIMS.cloud;
    return merge([
      cyl(0.38, 0.28, d.trunkH, 0, 0, 0, 0xc98fd1, 10),
      sphere(d.leaves[0].r, d.leaves[0].x, d.leaves[0].y, d.leaves[0].z, tones[0], 1, 16),
      sphere(d.leaves[1].r, d.leaves[1].x, d.leaves[1].y, d.leaves[1].z, tones[1], 1, 14),
      sphere(d.leaves[2].r, d.leaves[2].x, d.leaves[2].y, d.leaves[2].z, tones[2], 1, 14),
    ]);
  });
}

/** Curved palm: returns geometry plus the trunk centreline for colliders. */
export const PALM_SEGMENTS = 6;
export function palmTreeGeo(): THREE.BufferGeometry {
  return cached('palm', () => {
    const parts: THREE.BufferGeometry[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < PALM_SEGMENTS; i++) {
      const h = 1.0;
      const r = 0.36 - i * 0.03;
      const g = new THREE.CylinderGeometry(r * 0.92, r, h, 9, 1);
      g.translate(0, h / 2, 0);
      g.rotateZ(-0.05 * i);
      g.translate(x, y, 0);
      parts.push(colored(g, i % 2 ? 0xd7a662 : 0xb98544));
      x += Math.sin(0.05 * i) * h + 0.06 * i;
      y += Math.cos(0.05 * i) * h;
    }
    const top = new THREE.Vector3(x, y, 0);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const leaf = new THREE.SphereGeometry(1, 10, 6);
      leaf.scale(1.9, 0.14, 0.42);
      leaf.translate(1.6, 0, 0);
      leaf.rotateZ(-0.45);
      leaf.rotateY(a);
      leaf.translate(top.x, top.y + 0.1, top.z);
      parts.push(colored(leaf, k % 2 ? 0x3fbf4a : 0x56d35a));
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      parts.push(sphere(0.22, top.x + Math.cos(a) * 0.3, top.y - 0.25, top.z + Math.sin(a) * 0.3, 0x7a4a22, 1, 8));
    }
    return merge(parts);
  });
}

export function palmTop(): THREE.Vector3 {
  let x = 0;
  let y = 0;
  for (let i = 0; i < PALM_SEGMENTS; i++) {
    x += Math.sin(0.05 * i) * 1.0 + 0.06 * i;
    y += Math.cos(0.05 * i) * 1.0;
  }
  return new THREE.Vector3(x, y, 0);
}

export function bushGeo(): THREE.BufferGeometry {
  return cached('bush', () =>
    merge([
      sphere(1.0, 0, 0.55, 0, 0x45c44f, 0.85, 14),
      sphere(0.8, 0.9, 0.45, 0.1, 0x3bb546, 0.85, 12),
      sphere(0.8, -0.9, 0.45, -0.1, 0x52d05a, 0.85, 12),
    ]),
  );
}

export function rockGeo(variant: number): THREE.BufferGeometry {
  return cached(`rock${variant}`, () => {
    const g = new THREE.DodecahedronGeometry(1, 0);
    const pos = g.attributes.position;
    const seed = variant * 1.7 + 0.3;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.85 + 0.25 * Math.abs(Math.sin(i * 12.9898 + seed));
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.75, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    return merge([colored(g, [0xa79bbf, 0x9d93ae, 0xb7aac6][variant % 3])]);
  });
}

export function flowerPetalGeo(): THREE.BufferGeometry {
  return cached('flowerpetal', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const p = new THREE.SphereGeometry(0.11, 8, 6);
      p.scale(1, 0.5, 1);
      p.translate(Math.cos(a) * 0.12, 0.38, Math.sin(a) * 0.12);
      parts.push(colored(p, 0xffffff));
    }
    return merge(parts);
  });
}

export function flowerCoreGeo(): THREE.BufferGeometry {
  return cached('flowercore', () => merge([cyl(0.03, 0.03, 0.35, 0, 0, 0, 0x2f9e3a, 5), sphere(0.08, 0, 0.4, 0, 0xffd23f, 1, 8)]));
}

export function tuftGeo(): THREE.BufferGeometry {
  return cached('tuft', () =>
    merge([
      cone(0.08, 0.5, 0, 0, 0, 0x3aa53a, 5),
      cone(0.07, 0.4, 0.1, 0, 0.05, 0x46b743, 5),
      cone(0.07, 0.42, -0.09, 0, -0.04, 0x339a34, 5),
    ]),
  );
}

export function mushroomGeo(cap: number): { stem: THREE.BufferGeometry; cap: THREE.BufferGeometry } {
  const stem = cached('mstem', () =>
    merge([cyl(0.62, 0.5, 1.6, 0, 0, 0, 0xfff1d6, 14), sphere(0.2, 0.18, 1.05, 0.48, 0x2a1f35, 1.6, 8), sphere(0.2, -0.18, 1.05, 0.48, 0x2a1f35, 1.6, 8)]),
  );
  const capGeo = cached(`mcap${cap}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const g = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(2.0, 1.15, 2.0);
    parts.push(colored(g, cap));
    const under = new THREE.CylinderGeometry(2.0, 1.7, 0.12, 24);
    parts.push(colored(under, 0xffe8c4));
    const spots: [number, number, number][] = [
      [0, 1.12, 0],
      [1.3, 0.75, 0.5],
      [-1.2, 0.8, -0.6],
      [0.3, 0.85, -1.3],
      [-0.4, 0.75, 1.35],
      [1.0, 0.6, -1.2],
      [-1.5, 0.5, 0.7],
    ];
    for (const [x, y, z] of spots) {
      const s = new THREE.SphereGeometry(0.36, 10, 8);
      s.scale(1, 0.35, 1);
      const n = new THREE.Vector3(x / 2.0, y / 1.15, z / 2.0).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      s.applyQuaternion(q);
      s.translate(x, y, z);
      parts.push(colored(s, 0xffffff));
    }
    return merge(parts);
  });
  return { stem, cap: capGeo };
}

export function pipeGeo(h: number, r: number, color: number): THREE.BufferGeometry {
  const dark = new THREE.Color(color).multiplyScalar(0.75).getHex();
  const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35).getHex();
  const parts = [
    cyl(r, r, h - 0.6, 0, 0, 0, color, 20),
    cyl(r + 0.18, r + 0.18, 0.6, 0, h - 0.6, 0, light, 20),
    cyl(r - 0.05, r - 0.05, 0.02, 0, h, 0, dark, 20),
  ];
  return merge(parts);
}

export function umbrellaGeo(color: number): THREE.BufferGeometry {
  return cached(`umbrella${color}`, () => {
    const parts: THREE.BufferGeometry[] = [cyl(0.05, 0.05, 2.4, 0, 0, 0, 0xffffff, 6)];
    for (let k = 0; k < 8; k++) {
      const g = new THREE.ConeGeometry(1.6, 0.7, 8, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4);
      g.translate(0, 2.55, 0);
      parts.push(colored(g, k % 2 ? 0xffffff : color));
    }
    return merge(parts);
  });
}
