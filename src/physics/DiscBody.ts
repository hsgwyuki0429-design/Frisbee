/**
 * Rigid-body flight model for a spinning disc.
 *
 * State is integrated with RK4 on (position, velocity, orientation, world angular
 * momentum). Integrating angular momentum instead of angular velocity keeps the
 * gyroscopic terms exact, so pitching moments turn into roll precession the way
 * a real disc turns and fades. The aerodynamic model follows the classic
 * linear lift / quadratic drag / linear pitching-moment fit, blended into a
 * flat-plate model past stall so tumbling discs behave sensibly.
 */

export interface AeroCoefficients {
  CL0: number;
  CLa: number;
  CD0: number;
  CDa: number;
  /** Angle of attack of minimum drag (rad). */
  alpha0: number;
  CM0: number;
  CMa: number;
  /** Pitch/roll rate damping coefficient (per rad/s, scaled by q·A·d). */
  CMq: number;
  /** Spin damping coefficient (per rad/s, scaled by q·A·d). */
  CNr: number;
}

export interface DiscSpec {
  mass: number;
  radius: number;
  thickness: number;
  /** Iz = izFactor · m · r² (rim-weighted discs are around 0.6). */
  izFactor: number;
  aero: AeroCoefficients;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const STALL_START = 0.42;
const STALL_BLEND = 0.35;

export class DiscBody {
  /** px py pz vx vy vz qx qy qz qw Lx Ly Lz */
  readonly s = new Float64Array(13);
  readonly mass: number;
  readonly radius: number;
  readonly halfThickness: number;
  readonly Iz: number;
  readonly Ixy: number;
  readonly area: number;
  readonly diameter: number;
  aero: AeroCoefficients;

  airDensity = 1.225;
  gravity = 9.81;
  readonly wind: Vec3Like = { x: 0, y: 0, z: 0 };

  /** Extra drag rates (1/s) applied by volumes such as foliage or basket chains. */
  zoneLinDrag = 0;
  zoneAngDrag = 0;

  // Derived quantities, refreshed by refresh().
  readonly n: Vec3Like = { x: 0, y: 1, z: 0 };
  readonly w: Vec3Like = { x: 0, y: 0, z: 0 };
  /** Row-major rotation matrix. */
  readonly R = new Float64Array(9);

  // Telemetry from the last derivative evaluation (for HUD / audio).
  alpha = 0;
  airspeed = 0;

  private readonly k1 = new Float64Array(13);
  private readonly k2 = new Float64Array(13);
  private readonly k3 = new Float64Array(13);
  private readonly k4 = new Float64Array(13);
  private readonly tmp = new Float64Array(13);

  constructor(spec: DiscSpec) {
    this.mass = spec.mass;
    this.radius = spec.radius;
    this.halfThickness = spec.thickness / 2;
    this.Iz = spec.izFactor * spec.mass * spec.radius * spec.radius;
    // Thin rim-weighted disc: in-plane moment is about half the axial one.
    this.Ixy = this.Iz * 0.5 + (spec.mass * spec.thickness * spec.thickness) / 12;
    this.area = Math.PI * spec.radius * spec.radius;
    this.diameter = spec.radius * 2;
    this.aero = spec.aero;
    this.s[9] = 1;
    this.refresh();
  }

  get x(): number {
    return this.s[0];
  }
  get y(): number {
    return this.s[1];
  }
  get z(): number {
    return this.s[2];
  }
  get vx(): number {
    return this.s[3];
  }
  get vy(): number {
    return this.s[4];
  }
  get vz(): number {
    return this.s[5];
  }

  speed(): number {
    const s = this.s;
    return Math.hypot(s[3], s[4], s[5]);
  }

  /** Spin rate about the disc normal in rad/s (positive = counter-clockwise seen from the top face). */
  spin(): number {
    const n = this.n;
    const w = this.w;
    return w.x * n.x + w.y * n.y + w.z * n.z;
  }

  angularSpeed(): number {
    return Math.hypot(this.w.x, this.w.y, this.w.z);
  }

  setPosition(x: number, y: number, z: number): void {
    this.s[0] = x;
    this.s[1] = y;
    this.s[2] = z;
  }

  setVelocity(x: number, y: number, z: number): void {
    this.s[3] = x;
    this.s[4] = y;
    this.s[5] = z;
  }

  setOrientation(qx: number, qy: number, qz: number, qw: number): void {
    const len = Math.hypot(qx, qy, qz, qw) || 1;
    this.s[6] = qx / len;
    this.s[7] = qy / len;
    this.s[8] = qz / len;
    this.s[9] = qw / len;
    this.refresh();
  }

  /** Sets world angular velocity; converts to angular momentum with the current orientation. */
  setAngularVelocity(wx: number, wy: number, wz: number): void {
    const n = this.n;
    const wn = wx * n.x + wy * n.y + wz * n.z;
    // L = Ixy (w - (w·n)n) + Iz (w·n) n
    this.s[10] = this.Ixy * (wx - wn * n.x) + this.Iz * wn * n.x;
    this.s[11] = this.Ixy * (wy - wn * n.y) + this.Iz * wn * n.y;
    this.s[12] = this.Ixy * (wz - wn * n.z) + this.Iz * wn * n.z;
    this.refresh();
  }

  /** Recomputes normal, rotation matrix and angular velocity from the state vector. */
  refresh(): void {
    const s = this.s;
    const qx = s[6];
    const qy = s[7];
    const qz = s[8];
    const qw = s[9];
    const R = this.R;
    R[0] = 1 - 2 * (qy * qy + qz * qz);
    R[1] = 2 * (qx * qy - qz * qw);
    R[2] = 2 * (qx * qz + qy * qw);
    R[3] = 2 * (qx * qy + qz * qw);
    R[4] = 1 - 2 * (qx * qx + qz * qz);
    R[5] = 2 * (qy * qz - qx * qw);
    R[6] = 2 * (qx * qz - qy * qw);
    R[7] = 2 * (qy * qz + qx * qw);
    R[8] = 1 - 2 * (qx * qx + qy * qy);
    this.n.x = R[1];
    this.n.y = R[4];
    this.n.z = R[7];
    this.invInertia(s[10], s[11], s[12], this.w);
  }

  /** out = I_world⁻¹ · v */
  invInertia(vx: number, vy: number, vz: number, out: Vec3Like): void {
    const n = this.n;
    const a = 1 / this.Ixy;
    const b = 1 / this.Iz - a;
    const vn = (vx * n.x + vy * n.y + vz * n.z) * b;
    out.x = a * vx + vn * n.x;
    out.y = a * vy + vn * n.y;
    out.z = a * vz + vn * n.z;
  }

  /** Applies an impulse J at world point p. */
  applyImpulse(px: number, py: number, pz: number, jx: number, jy: number, jz: number): void {
    const s = this.s;
    const im = 1 / this.mass;
    s[3] += jx * im;
    s[4] += jy * im;
    s[5] += jz * im;
    const rx = px - s[0];
    const ry = py - s[1];
    const rz = pz - s[2];
    s[10] += ry * jz - rz * jy;
    s[11] += rz * jx - rx * jz;
    s[12] += rx * jy - ry * jx;
    this.invInertia(s[10], s[11], s[12], this.w);
  }

  /** Velocity of a world point attached to the body. */
  pointVelocity(px: number, py: number, pz: number, out: Vec3Like): void {
    const s = this.s;
    const w = this.w;
    const rx = px - s[0];
    const ry = py - s[1];
    const rz = pz - s[2];
    out.x = s[3] + (w.y * rz - w.z * ry);
    out.y = s[4] + (w.z * rx - w.x * rz);
    out.z = s[5] + (w.x * ry - w.y * rx);
  }

  /** Transforms a body-space point to world space. */
  toWorld(bx: number, by: number, bz: number, out: Vec3Like): void {
    const R = this.R;
    const s = this.s;
    out.x = s[0] + R[0] * bx + R[1] * by + R[2] * bz;
    out.y = s[1] + R[3] * bx + R[4] * by + R[5] * bz;
    out.z = s[2] + R[6] * bx + R[7] * by + R[8] * bz;
  }

  integrate(dt: number): void {
    const s = this.s;
    const t = this.tmp;
    this.deriv(s, this.k1);
    for (let i = 0; i < 13; i++) t[i] = s[i] + this.k1[i] * dt * 0.5;
    this.deriv(t, this.k2);
    for (let i = 0; i < 13; i++) t[i] = s[i] + this.k2[i] * dt * 0.5;
    this.deriv(t, this.k3);
    for (let i = 0; i < 13; i++) t[i] = s[i] + this.k3[i] * dt;
    this.deriv(t, this.k4);
    for (let i = 0; i < 13; i++) {
      s[i] += (dt / 6) * (this.k1[i] + 2 * this.k2[i] + 2 * this.k3[i] + this.k4[i]);
    }
    const ql = Math.hypot(s[6], s[7], s[8], s[9]) || 1;
    s[6] /= ql;
    s[7] /= ql;
    s[8] /= ql;
    s[9] /= ql;

    // Zone drag (foliage, chains) is applied as an exact exponential decay.
    if (this.zoneLinDrag > 0) {
      const f = Math.exp(-this.zoneLinDrag * dt);
      s[3] *= f;
      s[4] *= f;
      s[5] *= f;
    }
    if (this.zoneAngDrag > 0) {
      const f = Math.exp(-this.zoneAngDrag * dt);
      s[10] *= f;
      s[11] *= f;
      s[12] *= f;
    }
    this.refresh();
  }

  /** Evaluates the state derivative: gravity + aerodynamic forces and moments. */
  private deriv(st: Float64Array, out: Float64Array): void {
    const qx = st[6];
    const qy = st[7];
    const qz = st[8];
    const qw = st[9];
    const ql = Math.hypot(qx, qy, qz, qw) || 1;
    const ix = qx / ql;
    const iy = qy / ql;
    const iz = qz / ql;
    const iw = qw / ql;
    // Disc normal = R · (0, 1, 0)
    const nx = 2 * (ix * iy - iz * iw);
    const ny = 1 - 2 * (ix * ix + iz * iz);
    const nz = 2 * (iy * iz + ix * iw);

    const Lx = st[10];
    const Ly = st[11];
    const Lz = st[12];
    const a = 1 / this.Ixy;
    const b = 1 / this.Iz - a;
    const Ln = (Lx * nx + Ly * ny + Lz * nz) * b;
    const wx = a * Lx + Ln * nx;
    const wy = a * Ly + Ln * ny;
    const wz = a * Lz + Ln * nz;

    let fx = 0;
    let fy = -this.gravity * this.mass;
    let fz = 0;
    let tx = 0;
    let ty = 0;
    let tz = 0;

    const vx = st[3] - this.wind.x;
    const vy = st[4] - this.wind.y;
    const vz = st[5] - this.wind.z;
    const V2 = vx * vx + vy * vy + vz * vz;
    const V = Math.sqrt(V2);
    this.airspeed = V;

    if (V > 0.05) {
      const ae = this.aero;
      const ux = vx / V;
      const uy = vy / V;
      const uz = vz / V;
      const vn = vx * nx + vy * ny + vz * nz;
      const px = vx - vn * nx;
      const py = vy - vn * ny;
      const pz = vz - vn * nz;
      const vp = Math.sqrt(px * px + py * py + pz * pz);
      const alpha = Math.atan2(-vn, vp);
      this.alpha = alpha;

      const absA = Math.abs(alpha);
      let blend = 0;
      if (absA > STALL_START) {
        const t = Math.min(1, (absA - STALL_START) / STALL_BLEND);
        blend = t * t * (3 - 2 * t);
      }
      const s2a = Math.sin(2 * alpha);
      const sa = Math.sin(alpha);
      const da = alpha - ae.alpha0;
      const CL = (ae.CL0 + ae.CLa * alpha) * (1 - blend) + 0.95 * s2a * blend;
      const CD = (ae.CD0 + ae.CDa * da * da) * (1 - blend) + (ae.CD0 + 1.25 * sa * sa) * blend;
      const CM = (ae.CM0 + ae.CMa * alpha) * (1 - blend) + 0.04 * s2a * blend;

      const q = 0.5 * this.airDensity * V2;
      const qA = q * this.area;

      // Lift: perpendicular to the airflow, in the plane of airflow and normal.
      const nu = nx * ux + ny * uy + nz * uz;
      let lx = nx - nu * ux;
      let ly = ny - nu * uy;
      let lz = nz - nu * uz;
      const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
      if (ll > 1e-6) {
        lx /= ll;
        ly /= ll;
        lz /= ll;
        fx += qA * CL * lx;
        fy += qA * CL * ly;
        fz += qA * CL * lz;
      }
      fx -= qA * CD * ux;
      fy -= qA * CD * uy;
      fz -= qA * CD * uz;

      const qAd = qA * this.diameter;
      if (vp > 1e-4) {
        // Pitch axis = forward × normal (positive moment lifts the leading edge).
        const fwx = px / vp;
        const fwy = py / vp;
        const fwz = pz / vp;
        const ax = fwy * nz - fwz * ny;
        const ay = fwz * nx - fwx * nz;
        const az = fwx * ny - fwy * nx;
        tx += qAd * CM * ax;
        ty += qAd * CM * ay;
        tz += qAd * CM * az;
      }
      // Rate damping on wobble/precession and on spin.
      const wn = wx * nx + wy * ny + wz * nz;
      const wpx = wx - wn * nx;
      const wpy = wy - wn * ny;
      const wpz = wz - wn * nz;
      tx += qAd * ae.CMq * wpx + qAd * ae.CNr * wn * nx;
      ty += qAd * ae.CMq * wpy + qAd * ae.CNr * wn * ny;
      tz += qAd * ae.CMq * wpz + qAd * ae.CNr * wn * nz;
    }

    const im = 1 / this.mass;
    out[0] = st[3];
    out[1] = st[4];
    out[2] = st[5];
    out[3] = fx * im;
    out[4] = fy * im;
    out[5] = fz * im;
    // dq/dt = ½ ω ⊗ q
    out[6] = 0.5 * (wx * qw + wy * qz - wz * qy);
    out[7] = 0.5 * (-wx * qz + wy * qw + wz * qx);
    out[8] = 0.5 * (wx * qy - wy * qx + wz * qw);
    out[9] = 0.5 * (-wx * qx - wy * qy - wz * qz);
    out[10] = tx;
    out[11] = ty;
    out[12] = tz;
  }
}
