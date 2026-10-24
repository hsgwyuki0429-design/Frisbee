import * as THREE from 'three';
import { skinCanvas, type Skin } from '../data/skins';
import type { DiscBody } from '../physics/DiscBody';
import { outlineMaterial, toon, toonGradient } from '../render/toon';

const R = 0.106;

/** Disc golf disc profile (radius, height) from the top centre around the rim to the underside. */
function profile(): THREE.Vector2[] {
  const pts: [number, number][] = [
    [0.0, 0.0125],
    [0.04, 0.0122],
    [0.07, 0.0112],
    [0.09, 0.0095],
    [0.1, 0.0075],
    [0.1048, 0.004],
    [0.106, 0.0],
    [0.1052, -0.005],
    [0.1015, -0.0085],
    [0.095, -0.0095],
    [0.0905, -0.007],
    [0.089, -0.002],
    [0.085, 0.0012],
    [0.06, 0.0028],
    [0.0, 0.0035],
  ];
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

function domeY(r: number): number {
  const p = profile();
  for (let i = 0; i < 6; i++) {
    if (r <= p[i + 1].x) {
      const t = (r - p[i].x) / (p[i + 1].x - p[i].x);
      return p[i].y + (p[i + 1].y - p[i].y) * t;
    }
  }
  return 0;
}

export class DiscView {
  readonly root = new THREE.Group();
  /** Visual scale multiplier (the disc is shown a little larger than life for readability). */
  readonly visualScale = 1.25;
  private body: THREE.Mesh;
  private top: THREE.Mesh;
  private topMat: THREE.MeshToonMaterial;
  private bodyMat: THREE.MeshToonMaterial;
  private trail: Trail;
  private shadowBlob: THREE.Mesh;
  skin!: Skin;

  constructor(scene: THREE.Scene, skin: Skin) {
    const lathe = new THREE.LatheGeometry(profile(), 48);
    this.bodyMat = toon(0xffffff).clone();
    this.bodyMat.userData = {};
    this.body = new THREE.Mesh(lathe, this.bodyMat);
    this.body.castShadow = true;
    const ol = new THREE.Mesh(lathe, outlineMaterial(0x2a2140, 0.004));
    this.body.add(ol);

    const cap = new THREE.CircleGeometry(R * 0.985, 48);
    cap.rotateX(-Math.PI / 2);
    const pos = cap.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      pos.setY(i, domeY(r) + 0.0004);
    }
    cap.computeVertexNormals();
    this.topMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() });
    this.top = new THREE.Mesh(cap, this.topMat);
    this.top.castShadow = false;

    this.root.add(this.body, this.top);
    this.root.scale.setScalar(this.visualScale);
    scene.add(this.root);

    this.trail = new Trail(scene);

    // Fake contact shadow that stays readable even without shadow maps.
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(R * 1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x1a2a10, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 3;
    this.shadowBlob = blob;
    scene.add(blob);

    this.setSkin(skin);
  }

  setSkin(skin: Skin): void {
    this.skin = skin;
    const c = skinCanvas(skin, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.topMat.map?.dispose();
    this.topMat.map = tex;
    this.topMat.needsUpdate = true;
    this.bodyMat.color.setHex(skin.rim);
    this.trail.setColors(skin.trail[0], skin.trail[1]);
  }

  sync(disc: DiscBody, groundY: number | null): void {
    this.root.position.set(disc.x, disc.y, disc.z);
    const s = disc.s;
    this.root.quaternion.set(s[6], s[7], s[8], s[9]);
    if (groundY !== null) {
      const h = disc.y - groundY;
      this.shadowBlob.visible = h < 25 && h > -0.5;
      this.shadowBlob.position.set(disc.x, groundY + 0.03, disc.z);
      const k = Math.max(0.4, 1 + h * 0.05);
      this.shadowBlob.scale.setScalar(k);
      (this.shadowBlob.material as THREE.MeshBasicMaterial).opacity = Math.max(0.05, 0.3 - h * 0.012);
    } else {
      this.shadowBlob.visible = false;
    }
  }

  /** Enlarges the disc with camera distance so it stays readable in flight. */
  setDistanceScale(camDist: number | null): void {
    const k = camDist === null ? 1 : THREE.MathUtils.clamp(camDist * 0.2, 1, 2.6);
    this.root.scale.setScalar(this.visualScale * k);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
    this.shadowBlob.visible = v;
  }

  trailPush(disc: DiscBody): void {
    this.trail.push(disc);
  }

  trailClear(): void {
    this.trail.clear();
  }

  trailFade(dt: number): void {
    this.trail.fade(dt);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    scene.remove(this.shadowBlob);
    this.trail.dispose(scene);
  }
}

const TRAIL_N = 46;

/** Flat ribbon that follows the disc in its own plane. */
class Trail {
  private mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private pts: { p: THREE.Vector3; side: THREE.Vector3; age: number }[] = [];
  private c0 = new THREE.Color();
  private c1 = new THREE.Color();
  private fadeT = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(TRAIL_N * 2 * 3);
    this.col = new Float32Array(TRAIL_N * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  setColors(a: number, b: number): void {
    this.c0.setHex(a);
    this.c1.setHex(b);
  }

  clear(): void {
    this.pts.length = 0;
    this.fadeT = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  push(disc: DiscBody): void {
    const p = new THREE.Vector3(disc.x, disc.y, disc.z);
    const last = this.pts[this.pts.length - 1];
    if (last && last.p.distanceToSquared(p) < 0.09) return;
    const v = new THREE.Vector3(disc.vx, disc.vy, disc.vz);
    const n = new THREE.Vector3(disc.n.x, disc.n.y, disc.n.z);
    const side = v.cross(n);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    this.pts.push({ p, side, age: 0 });
    if (this.pts.length > TRAIL_N) this.pts.shift();
    this.fadeT = 0;
    this.rebuild();
  }

  fade(dt: number): void {
    if (!this.pts.length) return;
    this.fadeT += dt;
    if (this.fadeT > 2.5) {
      this.clear();
      return;
    }
    this.rebuild();
  }

  private rebuild(): void {
    const n = this.pts.length;
    const c = new THREE.Color();
    const globalA = Math.max(0, 1 - this.fadeT / 2.5);
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const w = 0.02 + 0.08 * t;
      const { p, side } = this.pts[i];
      this.pos.set([p.x + side.x * w, p.y + side.y * w, p.z + side.z * w], i * 6);
      this.pos.set([p.x - side.x * w, p.y - side.y * w, p.z - side.z * w], i * 6 + 3);
      c.copy(this.c1).lerp(this.c0, t);
      const a = t * t * 0.7 * globalA;
      this.col.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], i * 8);
    }
    const geo = this.mesh.geometry;
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
