import { Collider, type ContactSink, type DiscSamples } from './Colliders';
import { DiscBody, type Vec3Like } from './DiscBody';
import { Heightfield } from './Heightfield';
import type { SurfaceMaterial } from './materials';

export type PhysEvent =
  | { type: 'impact'; mat: SurfaceMaterial; tag: string; speed: number; x: number; y: number; z: number }
  | { type: 'enterVolume'; volume: Volume; speed: number }
  | { type: 'trigger'; trigger: Trigger }
  | { type: 'water'; x: number; y: number; z: number; speed: number }
  | { type: 'fell' }
  | { type: 'rest' };

/** Soft region that slows the disc down (foliage, basket chains). */
export interface Volume {
  id: string;
  kind: 'sphere' | 'cylinder';
  x: number;
  y: number;
  z: number;
  /** sphere radius or cylinder radius */
  r: number;
  /** cylinder height range */
  y0?: number;
  y1?: number;
  linDrag: number;
  angDrag: number;
  /** Additional drag proportional to speed (1/m). */
  quadDrag?: number;
  inside?: boolean;
  enabled?: boolean;
}

/** Pass-through detector (coins, rings, goal planes). */
export interface Trigger {
  id: string;
  kind: 'sphere' | 'ring';
  x: number;
  y: number;
  z: number;
  r: number;
  /** ring plane normal (unit) */
  ax?: number;
  ay?: number;
  az?: number;
  once: boolean;
  fired?: boolean;
  enabled?: boolean;
  data?: unknown;
}

interface Contact {
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  depth: number;
  mat: SurfaceMaterial;
  tag: string;
  rx: number;
  ry: number;
  rz: number;
  target: number;
  kn: number;
  jn: number;
  jtx: number;
  jty: number;
  jtz: number;
}

const BOUNCE_THRESHOLD = 1.1;
const MAX_CONTACTS = 160;

/**
 * Collision detection and impulse-based response for the disc against the
 * terrain heightfield and static colliders, plus soft volumes and triggers.
 */
export class PhysicsWorld implements ContactSink {
  terrain: Heightfield | null = null;
  readonly colliders: Collider[] = [];
  readonly volumes: Volume[] = [];
  readonly triggers: Trigger[] = [];
  waterLevel: number | null = null;
  /** Disc is considered lost below this height. */
  fallLimit = -25;

  readonly disc: DiscBody;
  readonly events: PhysEvent[] = [];

  time = 0;
  flightTime = 0;
  inContact = false;
  touchedGround = false;
  firstContactTime = -1;
  restTimer = 0;
  sleeping = true;
  inWater = false;
  lastContactTag = '';
  lastContactMat: SurfaceMaterial | null = null;
  /** Force rest this many seconds after the first ground touch. */
  maxRollTime = 9;

  private readonly contacts: Contact[] = [];
  private contactCount = 0;
  private readonly samples: DiscSamples;
  private readonly bodyPts: Float64Array;
  private readonly tmpV: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly tmpN: Vec3Like = { x: 0, y: 1, z: 0 };
  private readonly impactCooldown = new Map<string, number>();

  constructor(disc: DiscBody) {
    this.disc = disc;
    for (let i = 0; i < MAX_CONTACTS; i++) {
      this.contacts.push({
        px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, depth: 0,
        mat: null as unknown as SurfaceMaterial, tag: '',
        rx: 0, ry: 0, rz: 0, target: 0, kn: 0, jn: 0, jtx: 0, jty: 0, jtz: 0,
      });
    }
    const pts: number[] = [];
    const r = disc.radius;
    const h = disc.halfThickness;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(Math.cos(a) * r, h, Math.sin(a) * r);
      pts.push(Math.cos(a) * r, -h, Math.sin(a) * r);
    }
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      pts.push(Math.cos(a) * r * 0.58, h, Math.sin(a) * r * 0.58);
      pts.push(Math.cos(a) * r * 0.58, -h, Math.sin(a) * r * 0.58);
    }
    pts.push(0, h, 0, 0, -h, 0);
    this.bodyPts = new Float64Array(pts);
    this.samples = { disc, pts: new Float64Array(pts.length), count: pts.length / 3 };
  }

  add(px: number, py: number, pz: number, nx: number, ny: number, nz: number, depth: number, mat: SurfaceMaterial, tag: string): void {
    if (this.contactCount >= MAX_CONTACTS) return;
    const c = this.contacts[this.contactCount++];
    c.px = px;
    c.py = py;
    c.pz = pz;
    c.nx = nx;
    c.ny = ny;
    c.nz = nz;
    c.depth = depth;
    c.mat = mat;
    c.tag = tag;
  }

  addCollider(c: Collider): void {
    this.colliders.push(c);
  }

  clear(): void {
    this.colliders.length = 0;
    this.volumes.length = 0;
    this.triggers.length = 0;
    this.terrain = null;
    this.waterLevel = null;
  }

  /** Resets per-throw state and wakes the disc. */
  launch(): void {
    this.sleeping = false;
    this.flightTime = 0;
    this.touchedGround = false;
    this.firstContactTime = -1;
    this.restTimer = 0;
    this.inWater = false;
    this.inContact = false;
    this.lastContactTag = '';
    this.lastContactMat = null;
    this.impactCooldown.clear();
    for (const v of this.volumes) v.inside = false;
    for (const t of this.triggers) if (!t.once) t.fired = false;
  }

  step(dt: number): void {
    if (this.sleeping) return;
    const disc = this.disc;
    this.time += dt;
    this.flightTime += dt;
    const px = disc.x;
    const py = disc.y;
    const pz = disc.z;

    // Soft volumes.
    disc.zoneLinDrag = 0;
    disc.zoneAngDrag = 0;
    const speed = disc.speed();
    for (const v of this.volumes) {
      if (v.enabled === false) continue;
      const inside = this.insideVolume(v, disc.x, disc.y, disc.z);
      if (inside) {
        disc.zoneLinDrag += v.linDrag + (v.quadDrag ?? 0) * speed;
        disc.zoneAngDrag += v.angDrag;
        if (!v.inside) this.events.push({ type: 'enterVolume', volume: v, speed });
      }
      v.inside = inside;
    }
    if (this.inWater) {
      disc.zoneLinDrag += 3.5;
      disc.zoneAngDrag += 3.5;
    }

    disc.integrate(dt);

    if (this.inWater && this.waterLevel !== null) {
      // Float on the surface.
      const s = disc.s;
      const target = this.waterLevel - 0.005;
      if (s[1] < target) {
        s[1] += (target - s[1]) * Math.min(1, dt * 8);
        if (s[4] < 0) s[4] *= 0.5;
      }
    }

    this.checkTriggers(px, py, pz);
    this.solveCollisions(dt);

    // Water.
    if (!this.inWater && this.waterLevel !== null && disc.y - disc.halfThickness < this.waterLevel) {
      const ground = this.terrain ? this.terrain.heightAt(disc.x, disc.z) : -Infinity;
      if (ground < this.waterLevel - 0.03) {
        this.inWater = true;
        this.events.push({ type: 'water', x: disc.x, y: this.waterLevel, z: disc.z, speed: disc.speed() });
      }
    }
    if (disc.y < this.fallLimit) {
      this.events.push({ type: 'fell' });
      this.sleeping = true;
      return;
    }

    // Resting.
    const v = disc.speed();
    const w = disc.angularSpeed();
    if ((this.inContact || this.inWater) && v < 0.12 && w < 0.8) {
      this.restTimer += dt;
    } else {
      this.restTimer = Math.max(0, this.restTimer - dt * 2);
    }
    const rolledTooLong = this.firstContactTime >= 0 && this.time - this.firstContactTime > this.maxRollTime;
    if (this.restTimer > 0.35 || rolledTooLong || this.flightTime > 40) {
      this.sleeping = true;
      disc.setVelocity(0, 0, 0);
      disc.setAngularVelocity(0, 0, 0);
      this.events.push({ type: 'rest' });
    }
  }

  private insideVolume(v: Volume, x: number, y: number, z: number): boolean {
    const dx = x - v.x;
    const dz = z - v.z;
    if (v.kind === 'sphere') {
      const dy = y - v.y;
      return dx * dx + dy * dy + dz * dz < v.r * v.r;
    }
    return dx * dx + dz * dz < v.r * v.r && y >= (v.y0 ?? -Infinity) && y <= (v.y1 ?? Infinity);
  }

  private checkTriggers(px: number, py: number, pz: number): void {
    const disc = this.disc;
    const x = disc.x;
    const y = disc.y;
    const z = disc.z;
    for (const t of this.triggers) {
      if (t.enabled === false || (t.once && t.fired)) continue;
      if (t.kind === 'sphere') {
        // Closest approach of the step segment to the trigger centre.
        const sx = x - px;
        const sy = y - py;
        const sz = z - pz;
        const len2 = sx * sx + sy * sy + sz * sz;
        let u = 0;
        if (len2 > 1e-12) u = Math.max(0, Math.min(1, ((t.x - px) * sx + (t.y - py) * sy + (t.z - pz) * sz) / len2));
        const cx = px + sx * u - t.x;
        const cy = py + sy * u - t.y;
        const cz = pz + sz * u - t.z;
        if (cx * cx + cy * cy + cz * cz < t.r * t.r) {
          t.fired = true;
          this.events.push({ type: 'trigger', trigger: t });
        }
      } else {
        const ax = t.ax ?? 0;
        const ay = t.ay ?? 0;
        const az = t.az ?? 1;
        const d0 = (px - t.x) * ax + (py - t.y) * ay + (pz - t.z) * az;
        const d1 = (x - t.x) * ax + (y - t.y) * ay + (z - t.z) * az;
        if ((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0)) {
          const u = d0 / (d0 - d1);
          const hx = px + (x - px) * u - t.x;
          const hy = py + (y - py) * u - t.y;
          const hz = pz + (z - pz) * u - t.z;
          if (hx * hx + hy * hy + hz * hz < t.r * t.r) {
            t.fired = true;
            this.events.push({ type: 'trigger', trigger: t });
          }
        }
      }
    }
  }

  private updateSamples(): void {
    const disc = this.disc;
    const R = disc.R;
    const b = this.bodyPts;
    const o = this.samples.pts;
    const x = disc.x;
    const y = disc.y;
    const z = disc.z;
    for (let i = 0; i < b.length; i += 3) {
      const bx = b[i];
      const by = b[i + 1];
      const bz = b[i + 2];
      o[i] = x + R[0] * bx + R[1] * by + R[2] * bz;
      o[i + 1] = y + R[3] * bx + R[4] * by + R[5] * bz;
      o[i + 2] = z + R[6] * bx + R[7] * by + R[8] * bz;
    }
  }

  private solveCollisions(dt: number): void {
    const disc = this.disc;
    this.contactCount = 0;
    this.updateSamples();

    // Terrain.
    const tf = this.terrain;
    if (tf) {
      const p = this.samples.pts;
      const n = this.tmpN;
      const ground = tf.heightAt(disc.x, disc.z);
      if (disc.y - disc.radius - 0.05 < ground + 0.5 || disc.y < ground + 2) {
        for (let i = 0; i < this.samples.count; i++) {
          const x = p[i * 3];
          const y = p[i * 3 + 1];
          const z = p[i * 3 + 2];
          const h = tf.heightAt(x, z);
          if (y < h && h - y < 1.5) {
            tf.normalAt(x, z, n);
            this.add(x, y, z, n.x, n.y, n.z, (h - y) * n.y, tf.materialAt(x, z), 'ground');
          }
        }
      }
    }

    const reach = disc.radius + 0.06;
    for (const c of this.colliders) {
      if (!c.enabled || !c.overlapsSphere(disc.x, disc.y, disc.z, reach)) continue;
      c.collide(this.samples, this);
    }

    this.inContact = this.contactCount > 0;
    if (!this.inContact) return;

    if (this.firstContactTime < 0) this.firstContactTime = this.time;

    const count = this.contactCount;
    const cs = this.contacts;
    const v = this.tmpV;
    const im = 1 / disc.mass;
    const s = disc.s;
    let maxImpact = 0;
    let impactContact: Contact | null = null;
    let linDamp = 0;
    let angDamp = 0;
    let groundTouch = false;

    // Prepare.
    for (let i = 0; i < count; i++) {
      const c = cs[i];
      c.rx = c.px - s[0];
      c.ry = c.py - s[1];
      c.rz = c.pz - s[2];
      c.jn = 0;
      c.jtx = 0;
      c.jty = 0;
      c.jtz = 0;
      // Effective mass along the normal.
      const cx = c.ry * c.nz - c.rz * c.ny;
      const cy = c.rz * c.nx - c.rx * c.nz;
      const cz = c.rx * c.ny - c.ry * c.nx;
      disc.invInertia(cx, cy, cz, v);
      const kx = v.y * c.rz - v.z * c.ry;
      const ky = v.z * c.rx - v.x * c.rz;
      const kz = v.x * c.ry - v.y * c.rx;
      c.kn = im + (kx * c.nx + ky * c.ny + kz * c.nz);
      disc.pointVelocity(c.px, c.py, c.pz, v);
      const vn = v.x * c.nx + v.y * c.ny + v.z * c.nz;
      c.target = 0;
      if (vn < -BOUNCE_THRESHOLD) {
        c.target = -c.mat.restitution * disc.restitutionScale * vn;
        if (c.mat.boost) c.target = Math.max(c.target, c.mat.boost);
      }
      // Gentle penetration recovery bias.
      c.target = Math.max(c.target, Math.min(0.6, (c.depth - 0.002) * 12));
      if (-vn > maxImpact) {
        maxImpact = -vn;
        impactContact = c;
      }
      linDamp = Math.max(linDamp, c.mat.linDamp);
      angDamp = Math.max(angDamp, c.mat.angDamp);
      if (c.tag === 'ground') groundTouch = true;
    }

    // Sequential impulses.
    for (let iter = 0; iter < 10; iter++) {
      for (let i = 0; i < count; i++) {
        const c = cs[i];
        disc.pointVelocity(c.px, c.py, c.pz, v);
        const vn = v.x * c.nx + v.y * c.ny + v.z * c.nz;
        let dj = (c.target - vn) / c.kn;
        const old = c.jn;
        c.jn = Math.max(0, old + dj);
        dj = c.jn - old;
        if (dj !== 0) disc.applyImpulse(c.px, c.py, c.pz, c.nx * dj, c.ny * dj, c.nz * dj);

        // Friction (isotropic, clamped by the accumulated normal impulse).
        disc.pointVelocity(c.px, c.py, c.pz, v);
        const vn2 = v.x * c.nx + v.y * c.ny + v.z * c.nz;
        const tx = v.x - vn2 * c.nx;
        const ty = v.y - vn2 * c.ny;
        const tz = v.z - vn2 * c.nz;
        const tl = Math.hypot(tx, ty, tz);
        if (tl < 1e-7) continue;
        const ux = tx / tl;
        const uy = ty / tl;
        const uz = tz / tl;
        const cx = c.ry * uz - c.rz * uy;
        const cy = c.rz * ux - c.rx * uz;
        const cz = c.rx * uy - c.ry * ux;
        const iv = this.tmpN;
        disc.invInertia(cx, cy, cz, iv);
        const kx = iv.y * c.rz - iv.z * c.ry;
        const ky = iv.z * c.rx - iv.x * c.rz;
        const kz = iv.x * c.ry - iv.y * c.rx;
        const kt = im + (kx * ux + ky * uy + kz * uz);
        const jt = tl / kt;
        let nx = c.jtx - ux * jt;
        let ny = c.jty - uy * jt;
        let nz = c.jtz - uz * jt;
        const maxF = c.mat.friction * c.jn;
        const nl = Math.hypot(nx, ny, nz);
        if (nl > maxF) {
          const k = maxF / (nl || 1);
          nx *= k;
          ny *= k;
          nz *= k;
        }
        const djx = nx - c.jtx;
        const djy = ny - c.jty;
        const djz = nz - c.jtz;
        c.jtx = nx;
        c.jty = ny;
        c.jtz = nz;
        if (djx !== 0 || djy !== 0 || djz !== 0) disc.applyImpulse(c.px, c.py, c.pz, djx, djy, djz);
      }
    }

    // Positional correction along the contact normals.
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < count; i++) {
        const c = cs[i];
        const already = ox * c.nx + oy * c.ny + oz * c.nz;
        const need = c.depth - 0.001 - already;
        if (need > 0) {
          ox += c.nx * need;
          oy += c.ny * need;
          oz += c.nz * need;
        }
      }
    }
    s[0] += ox * 0.8;
    s[1] += oy * 0.8;
    s[2] += oz * 0.8;

    // Surface drag (grass, sand...).
    if (linDamp > 0) {
      const f = Math.exp(-linDamp * dt);
      s[3] *= f;
      s[5] *= f;
      if (s[4] > 0) s[4] *= f;
    }
    if (angDamp > 0) {
      const f = Math.exp(-angDamp * dt);
      s[10] *= f;
      s[11] *= f;
      s[12] *= f;
    }
    disc.refresh();

    if (groundTouch) this.touchedGround = true;
    if (impactContact) {
      this.lastContactTag = impactContact.tag;
      this.lastContactMat = impactContact.mat;
    }
    if (impactContact && maxImpact > 0.6) {
      const key = impactContact.tag;
      const last = this.impactCooldown.get(key) ?? -1;
      if (this.time - last > 0.08) {
        this.impactCooldown.set(key, this.time);
        this.events.push({
          type: 'impact',
          mat: impactContact.mat,
          tag: impactContact.tag,
          speed: maxImpact,
          x: impactContact.px,
          y: impactContact.py,
          z: impactContact.pz,
        });
      }
    }
  }
}
