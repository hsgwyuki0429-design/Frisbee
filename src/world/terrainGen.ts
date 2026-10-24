import { Heightfield } from '../physics/Heightfield';
import { TM } from '../physics/materials';
import type { StageDef } from '../data/types';
import { distToPolyline, fbm, smoothstep } from './noise';

export interface TerrainData {
  hf: Heightfield;
  /** Fairway weight per vertex (0..1) for the stripe shader. */
  fair: Float32Array;
  /** Signed distance to the coastline per vertex (negative = inland). */
  coast: Float32Array;
  waterLevel: number | null;
  sky: boolean;
}

const CELL = 1.25;

/** Signed distance to the union of land shapes (negative inside). */
export function landDistance(def: StageDef, x: number, z: number): number {
  let d = Infinity;
  for (const s of def.land) {
    const v = s.kind === 'path' ? distToPolyline(x, z, s.pts) - s.width / 2 : Math.hypot(x - s.x, z - s.z) - s.r;
    if (v < d) d = v;
  }
  return d;
}

export function generateTerrain(def: StageDef): TerrainData {
  const sky = def.theme === 'sky';
  const seed = def.seed ?? 7;
  // Bounds of the land shapes.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of def.land) {
    if (s.kind === 'path') {
      for (const [x, z] of s.pts) {
        minX = Math.min(minX, x - s.width);
        maxX = Math.max(maxX, x + s.width);
        minZ = Math.min(minZ, z - s.width);
        maxZ = Math.max(maxZ, z + s.width);
      }
    } else {
      minX = Math.min(minX, s.x - s.r);
      maxX = Math.max(maxX, s.x + s.r);
      minZ = Math.min(minZ, s.z - s.r);
      maxZ = Math.max(maxZ, s.z + s.r);
    }
  }
  const margin = sky ? 8 : 22;
  minX = Math.floor((minX - margin) / CELL) * CELL;
  minZ = Math.floor((minZ - margin) / CELL) * CELL;
  maxX = Math.ceil((maxX + margin) / CELL) * CELL;
  maxZ = Math.ceil((maxZ + margin) / CELL) * CELL;
  const nx = Math.round((maxX - minX) / CELL) + 1;
  const nz = Math.round((maxZ - minZ) / CELL) + 1;
  const outside = sky ? -60 : -4;
  const hf = new Heightfield(minX, minZ, CELL, nx, nz, outside);
  const fair = new Float32Array(nx * nz);
  const coast = new Float32Array(nx * nz);
  const landH = def.landHeight ?? (sky ? 0 : def.theme === 'beach' ? 0.9 : 1.2);
  const shore = def.theme === 'beach' ? 6.5 : 6;

  const rawHeight = (x: number, z: number): { h: number; d: number } => {
    const n = fbm(x * 0.045, z * 0.045, seed);
    const d = landDistance(def, x, z) + n * (sky ? 1.5 : 3.5);
    let h: number;
    if (sky) {
      if (d < 0) {
        h = landH + smoothstep(0, -6, d) * 0.4 + fbm(x * 0.08, z * 0.08, seed + 3) * 0.35 * smoothstep(0, -8, d);
      } else {
        h = landH - 1.2 - d * 6;
        if (d > 1.6) h = outside;
      }
    } else {
      const inland = smoothstep(shore * 0.25, -shore, d);
      h = -3.2 + (landH + 3.2) * Math.pow(inland, 0.85);
      h += fbm(x * 0.07, z * 0.07, seed + 5) * 0.35 * inland;
    }
    const inland = sky ? (d < 0 ? 1 : 0) : smoothstep(shore * 0.25, -shore, d);
    for (const hl of def.hills ?? []) {
      const dd = Math.hypot(x - hl.x, z - hl.z) / hl.r;
      if (dd < 2.5) h += hl.h * Math.exp(-dd * dd * 1.6) * inland;
    }
    for (const p of def.ponds ?? []) {
      const dd = Math.hypot(x - p.x, z - p.z);
      const w = smoothstep(p.r, p.r * 0.55, dd + fbm(x * 0.2, z * 0.2, seed + 9) * 1.2);
      h = h * (1 - w) + -1.6 * w;
    }
    for (const s of def.sand ?? []) {
      const dd = Math.hypot(x - s.x, z - s.z);
      h -= 0.35 * smoothstep(s.r, s.r * 0.5, dd);
    }
    return { h, d };
  };

  const flatten: { x: number; z: number; r0: number; r1: number; h: number }[] = [];
  const tee = rawHeight(def.tee[0], def.tee[1]);
  flatten.push({ x: def.tee[0], z: def.tee[1], r0: 3.5, r1: 6.5, h: Math.max(tee.h, (def.landHeight ?? landH) - 0.2) });
  for (const b of [def.basket, ...(def.extraBaskets ?? [])]) {
    if (!b) continue;
    const r = rawHeight(b[0], b[1]);
    flatten.push({ x: b[0], z: b[1], r0: 4, r1: 9, h: r.h });
  }
  for (const o of def.objects) {
    if (o.t !== 'target') continue;
    flatten.push({ x: o.x, z: o.z, r0: o.r + 0.8, r1: o.r + 4, h: rawHeight(o.x, o.z).h });
  }

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = minX + i * CELL;
      const z = minZ + j * CELL;
      let { h, d } = rawHeight(x, z);
      for (const f of flatten) {
        const w = smoothstep(f.r1, f.r0, Math.hypot(x - f.x, z - f.z));
        h = h * (1 - w) + f.h * w;
      }
      const idx = j * nx + i;
      hf.heights[idx] = h;
      coast[idx] = d;

      // Materials.
      let mat: number = TM.grass;
      if (sky) {
        if (h < landH - 0.6) mat = TM.dirt;
      } else if (h < 0.35) {
        mat = TM.sand;
      } else if (def.theme === 'beach' && d > -shore * 0.55) {
        mat = TM.sand;
      } else if (d > -4.5) {
        mat = TM.rough;
      }
      for (const s of def.sand ?? []) {
        const dd = Math.hypot(x - s.x, z - s.z) + fbm(x * 0.3, z * 0.3, seed + 11) * 1.2;
        if (dd < s.r * 0.85) mat = TM.sand;
      }
      for (const r of def.rough ?? []) {
        const dd = Math.hypot(x - r.x, z - r.z) + fbm(x * 0.25, z * 0.25, seed + 13) * 2;
        if (dd < r.r && mat === TM.grass) mat = TM.rough;
      }
      let fw = 0;
      if (def.fairway && mat !== TM.sand && mat !== TM.dirt) {
        const fd = distToPolyline(x, z, def.fairway.pts) + fbm(x * 0.12, z * 0.12, seed + 21) * 1.5;
        fw = smoothstep(def.fairway.width / 2 + 0.8, def.fairway.width / 2 - 0.8, fd);
        if (fw > 0.5) mat = TM.fairway;
      }
      // Basket greens are always fairway.
      for (const f of flatten) {
        if (Math.hypot(x - f.x, z - f.z) < f.r0 + 1) {
          if (mat !== TM.sand) {
            mat = TM.fairway;
            fw = Math.max(fw, 1);
          }
        }
      }
      fair[idx] = fw;
      hf.mats[idx] = mat;
    }
  }

  return { hf, fair, coast, waterLevel: sky ? null : 0, sky };
}
