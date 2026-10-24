import type { DiscBody } from './DiscBody';

export interface ThrowParams {
  /** Horizontal unit heading (x, z). */
  hx: number;
  hz: number;
  /** Launch elevation in radians (side view). */
  angle: number;
  /** Bank about the launch direction in radians; positive drops the right edge. */
  tilt: number;
  /** Launch speed in m/s. */
  speed: number;
  /** Spin in rad/s about the disc normal; positive = counter-clockwise seen from above. */
  spin: number;
  /** Extra nose-up angle relative to the launch direction (radians). */
  nose?: number;
}

export interface LaunchFrame {
  forward: [number, number, number];
  right: [number, number, number];
  normal: [number, number, number];
  quat: [number, number, number, number];
}

/** Builds the disc orientation for a launch. Body +Y is the disc normal, body −Z is forward. */
export function launchFrame(hx: number, hz: number, angle: number, tilt: number, nose = 0): LaunchFrame {
  const hl = Math.hypot(hx, hz) || 1;
  hx /= hl;
  hz /= hl;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const f: [number, number, number] = [ca * hx, sa, ca * hz];
  const right: [number, number, number] = [-hz, 0, hx];
  // n0 = right × f
  let n: [number, number, number] = [
    right[1] * f[2] - right[2] * f[1],
    right[2] * f[0] - right[0] * f[2],
    right[0] * f[1] - right[1] * f[0],
  ];
  // Nose angle: pitch the disc up about the right axis.
  if (nose !== 0) {
    const cn = Math.cos(nose);
    const sn = Math.sin(nose);
    // rotate n toward -f
    n = [n[0] * cn - f[0] * sn, n[1] * cn - f[1] * sn, n[2] * cn - f[2] * sn];
  }
  // Bank: rotate n about f by tilt (Rodrigues; f ⟂ n).
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const fxn: [number, number, number] = [
    f[1] * n[2] - f[2] * n[1],
    f[2] * n[0] - f[0] * n[2],
    f[0] * n[1] - f[1] * n[0],
  ];
  const fn = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
  n = [
    n[0] * ct + fxn[0] * st + f[0] * fn * (1 - ct),
    n[1] * ct + fxn[1] * st + f[1] * fn * (1 - ct),
    n[2] * ct + fxn[2] * st + f[2] * fn * (1 - ct),
  ];
  const nl = Math.hypot(n[0], n[1], n[2]);
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  // In-plane forward (f projected onto the disc plane).
  const dn = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
  let fp: [number, number, number] = [f[0] - dn * n[0], f[1] - dn * n[1], f[2] - dn * n[2]];
  const fl = Math.hypot(fp[0], fp[1], fp[2]) || 1;
  fp = [fp[0] / fl, fp[1] / fl, fp[2] / fl];
  // Basis: bx = fp × n, by = n, bz = -fp
  const bx: [number, number, number] = [
    fp[1] * n[2] - fp[2] * n[1],
    fp[2] * n[0] - fp[0] * n[2],
    fp[0] * n[1] - fp[1] * n[0],
  ];
  const by = n;
  const bz: [number, number, number] = [-fp[0], -fp[1], -fp[2]];
  const quat = quatFromBasis(bx, by, bz);
  const r2: [number, number, number] = [bx[0], bx[1], bx[2]];
  return { forward: f, right: r2, normal: n, quat };
}

/** Quaternion (x, y, z, w) from orthonormal basis columns. */
export function quatFromBasis(
  bx: readonly number[],
  by: readonly number[],
  bz: readonly number[],
): [number, number, number, number] {
  const m00 = bx[0], m01 = by[0], m02 = bz[0];
  const m10 = bx[1], m11 = by[1], m12 = bz[1];
  const m20 = bx[2], m21 = by[2], m22 = bz[2];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  return [x, y, z, w];
}

/** Puts the disc into its launch state at (x, y, z). */
export function applyLaunch(disc: DiscBody, x: number, y: number, z: number, p: ThrowParams): LaunchFrame {
  const fr = launchFrame(p.hx, p.hz, p.angle, p.tilt, p.nose ?? 0);
  disc.setPosition(x, y, z);
  disc.setOrientation(fr.quat[0], fr.quat[1], fr.quat[2], fr.quat[3]);
  disc.setVelocity(fr.forward[0] * p.speed, fr.forward[1] * p.speed, fr.forward[2] * p.speed);
  disc.setAngularVelocity(fr.normal[0] * p.spin, fr.normal[1] * p.spin, fr.normal[2] * p.spin);
  return fr;
}
