import * as THREE from 'three';
import { TM } from '../physics/materials';
import type { Theme } from '../data/types';
import { toonGradient } from '../render/toon';
import { fbm } from './noise';
import type { TerrainData } from './terrainGen';

const PALETTES: Record<Theme, Record<string, number>> = {
  grass: { grass: 0x5fcd3c, fairway: 0x86e35f, rough: 0x3b9e37, sand: 0xf3d58a, dirt: 0xc07a3f, under: 0xe8c77a },
  beach: { grass: 0x78d84c, fairway: 0x96e86a, rough: 0x4fae3c, sand: 0xfbe3a4, dirt: 0xc98a4b, under: 0xf0d48c },
  sky: { grass: 0x72dd55, fairway: 0x98ec74, rough: 0x4cb848, sand: 0xfbe3a4, dirt: 0xb3784a, under: 0xc89a6a },
};

export function buildTerrainMesh(data: TerrainData, theme: Theme, stripeDir: THREE.Vector2): THREE.Mesh {
  const hf = data.hf;
  const { nx, nz } = hf;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const fair = new Float32Array(nx * nz);
  const pal = PALETTES[theme];
  const c = new THREE.Color();
  const cs = {
    grass: new THREE.Color(pal.grass),
    fairway: new THREE.Color(pal.fairway),
    rough: new THREE.Color(pal.rough),
    sand: new THREE.Color(pal.sand),
    dirt: new THREE.Color(pal.dirt),
    under: new THREE.Color(pal.under),
    dirtDark: new THREE.Color(pal.dirt).multiplyScalar(0.72),
    rock: new THREE.Color(0x8d6f9e),
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const idx = j * nx + i;
      const x = hf.vertexX(i);
      const z = hf.vertexZ(j);
      const h = hf.heights[idx];
      pos[idx * 3] = x;
      pos[idx * 3 + 1] = h;
      pos[idx * 3 + 2] = z;
      const m = hf.mats[idx];
      switch (m) {
        case TM.fairway:
          c.copy(cs.fairway);
          break;
        case TM.rough:
          c.copy(cs.rough);
          break;
        case TM.sand:
          c.copy(cs.sand);
          if (data.waterLevel !== null && h < data.waterLevel) c.copy(cs.under).multiplyScalar(Math.max(0.55, 1 + h * 0.12));
          break;
        case TM.dirt: {
          // Cliff strata.
          const band = Math.floor((h + 100) / 1.6) % 2;
          c.copy(band ? cs.dirt : cs.dirtDark);
          if (h < -14) c.lerp(cs.rock, Math.min(1, (-14 - h) / 20));
          break;
        }
        default:
          c.copy(cs.grass);
      }
      const v = 1 + fbm(x * 0.06, z * 0.06, 99) * 0.07;
      c.multiplyScalar(v);
      col[idx * 3] = c.r;
      col[idx * 3 + 1] = c.g;
      col[idx * 3 + 2] = c.b;
      fair[idx] = data.fair[idx];
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const cc = a + nx;
      const d = cc + 1;
      // Same split as Heightfield: (a, c, b) and (b, c, d)
      index.push(a, cc, b, b, cc, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFair', new THREE.BufferAttribute(fair, 1));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const dir = stripeDir.clone().normalize();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStripeDir = { value: dir };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFair;\nvarying float vFair;\nvarying vec3 vWPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFair = aFair;\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uStripeDir;\nvarying float vFair;\nvarying vec3 vWPos;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float stripe = sin(dot(vWPos.xz, uStripeDir) * 0.85);
        float sw = smoothstep(-0.08, 0.08, stripe) * 2.0 - 1.0;
        diffuseColor.rgb *= 1.0 + vFair * 0.075 * sw;
        float tile = sin(vWPos.x * 1.3) * sin(vWPos.z * 1.3);
        diffuseColor.rgb *= 1.0 + (1.0 - vFair) * 0.025 * sign(tile);`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-stripes';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  return mesh;
}
