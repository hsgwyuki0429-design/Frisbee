import { TERRAIN_MATS, type SurfaceMaterial } from './materials';

/**
 * Regular-grid terrain. Heights are sampled per vertex and interpolated on the
 * same triangle split the render mesh uses, so physics and visuals line up.
 * Cell (i, j) is split along the diagonal from (i+1, j) to (i, j+1).
 */
export class Heightfield {
  readonly heights: Float32Array;
  readonly mats: Uint8Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly cell: number,
    readonly nx: number,
    readonly nz: number,
    /** Height reported outside the grid (sea floor / void). */
    readonly outside = -40,
  ) {
    this.heights = new Float32Array(nx * nz);
    this.mats = new Uint8Array(nx * nz);
  }

  get width(): number {
    return (this.nx - 1) * this.cell;
  }

  get depth(): number {
    return (this.nz - 1) * this.cell;
  }

  index(i: number, j: number): number {
    return j * this.nx + i;
  }

  vertexX(i: number): number {
    return this.x0 + i * this.cell;
  }

  vertexZ(j: number): number {
    return this.z0 + j * this.cell;
  }

  contains(x: number, z: number): boolean {
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    return fx >= 0 && fz >= 0 && fx <= this.nx - 1 && fz <= this.nz - 1;
  }

  heightAt(x: number, z: number): number {
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    if (fx < 0 || fz < 0 || fx > this.nx - 1 || fz > this.nz - 1) return this.outside;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i >= this.nx - 1) i = this.nx - 2;
    if (j >= this.nz - 1) j = this.nz - 2;
    const u = fx - i;
    const v = fz - j;
    const h = this.heights;
    const nx = this.nx;
    const ha = h[j * nx + i];
    const hb = h[j * nx + i + 1];
    const hc = h[(j + 1) * nx + i];
    const hd = h[(j + 1) * nx + i + 1];
    if (u + v <= 1) return ha + (hb - ha) * u + (hc - ha) * v;
    return hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  }

  /** Writes the surface normal into out (x, y, z). */
  normalAt(x: number, z: number, out: { x: number; y: number; z: number }): void {
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    if (fx < 0 || fz < 0 || fx > this.nx - 1 || fz > this.nz - 1) {
      out.x = 0;
      out.y = 1;
      out.z = 0;
      return;
    }
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (i >= this.nx - 1) i = this.nx - 2;
    if (j >= this.nz - 1) j = this.nz - 2;
    const u = fx - i;
    const v = fz - j;
    const h = this.heights;
    const nx = this.nx;
    const ha = h[j * nx + i];
    const hb = h[j * nx + i + 1];
    const hc = h[(j + 1) * nx + i];
    const hd = h[(j + 1) * nx + i + 1];
    let dx: number;
    let dz: number;
    if (u + v <= 1) {
      dx = (hb - ha) / this.cell;
      dz = (hc - ha) / this.cell;
    } else {
      dx = (hd - hc) / this.cell;
      dz = (hd - hb) / this.cell;
    }
    const len = Math.sqrt(dx * dx + 1 + dz * dz);
    out.x = -dx / len;
    out.y = 1 / len;
    out.z = -dz / len;
  }

  materialAt(x: number, z: number): SurfaceMaterial {
    const i = Math.round((x - this.x0) / this.cell);
    const j = Math.round((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return TERRAIN_MATS[0];
    return TERRAIN_MATS[this.mats[j * this.nx + i]] ?? TERRAIN_MATS[0];
  }

  materialIdAt(x: number, z: number): number {
    const i = Math.round((x - this.x0) / this.cell);
    const j = Math.round((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return 0;
    return this.mats[j * this.nx + i];
  }
}
