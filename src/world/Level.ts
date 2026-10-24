import * as THREE from 'three';
import type { ObjDef, StageDef } from '../data/types';
import type { FXHub } from '../game/fxTypes';
import { createBasketPhysics, type BasketPhysics } from '../physics/basket';
import {
  BoxCollider,
  CylinderCollider,
  EllipsoidCollider,
  SphereCollider,
  TorusCollider,
  type Collider,
} from '../physics/Colliders';
import type { DiscBody } from '../physics/DiscBody';
import { MATERIALS, TM } from '../physics/materials';
import type { PhysEvent, PhysicsWorld, Trigger, Volume } from '../physics/PhysicsWorld';
import { Batcher, setInstanceMatrix, type InstanceRef } from '../render/Batcher';
import { brickTexture, luckyTexture, stoneTexture, targetTexture, usedBlockTexture } from '../render/textures';
import { addOutline, disposeTree, outlineMaterial, toon } from '../render/toon';
import { Environment } from './Environment';
import {
  bushGeo,
  cloudTreeGeo,
  flowerCoreGeo,
  flowerPetalGeo,
  lollipopTreeGeo,
  mushroomGeo,
  palmTop,
  palmTreeGeo,
  pineTreeGeo,
  pipeGeo,
  rockGeo,
  roundTreeGeo,
  TREE_DIMS,
  tuftGeo,
  umbrellaGeo,
} from './models';
import { landDistance, generateTerrain, type TerrainData } from './terrainGen';
import { buildTerrainMesh } from './TerrainMesh';
import { mulberry32 } from './noise';
import { buildBasket, buildCoin, buildMarker, buildRing, buildTee, type BasketModel } from './props';

const OUTLINE = 0x2a2140;

interface CoinObj {
  mesh: THREE.Mesh;
  trigger: Trigger;
  collected: boolean;
  spin: number;
  baseY: number;
  pop: number;
}
interface RingObj {
  group: THREE.Group;
  trigger: Trigger;
  kind: 'coin' | 'boost';
  flash: number;
  passed: boolean;
}
interface LuckyObj {
  mesh: THREE.Mesh;
  used: boolean;
  bump: number;
  baseY: number;
}
interface Shaker {
  ref?: InstanceRef;
  obj?: THREE.Object3D;
  t: number;
  amp: number;
  baseScale?: THREE.Vector3;
  kind: 'wobble' | 'squish';
}

export interface LevelOptions {
  quality: 'low' | 'mid' | 'high';
  shadows: boolean;
  shadowSize: number;
  holeLabel?: string;
  /** Distance shown on the tee sign. */
  showSign?: boolean;
}

export class Level {
  readonly root = new THREE.Group();
  readonly terrain: TerrainData;
  readonly env: Environment;
  readonly teePos: THREE.Vector3;
  readonly basketPos: THREE.Vector3 | null = null;
  basketPhys: BasketPhysics | null = null;
  basketModel: BasketModel | null = null;
  readonly extraBaskets: { pos: THREE.Vector3; phys: BasketPhysics; model: BasketModel }[] = [];
  readonly colliders: Collider[] = [];
  readonly volumes: Volume[] = [];
  readonly triggers: Trigger[] = [];
  readonly coins: CoinObj[] = [];
  readonly rings: RingObj[] = [];
  readonly targets: { pos: THREE.Vector3; r: number; mesh: THREE.Mesh }[] = [];
  readonly landHeight: number;
  totalCoins = 0;

  private luckies = new Map<string, LuckyObj>();
  private shakers: Shaker[] = [];
  private treeRefs = new Map<string, InstanceRef>();
  private mushrooms = new Map<string, THREE.Object3D>();
  private animated: ((dt: number, t: number) => void)[] = [];
  private time = 0;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(
    scene: THREE.Scene,
    readonly def: StageDef,
    private opts: LevelOptions,
  ) {
    this.terrain = generateTerrain(def);
    const sky = def.theme === 'sky';
    this.landHeight = def.landHeight ?? (sky ? 0 : def.theme === 'beach' ? 0.9 : 1.2);
    const hf = this.terrain.hf;

    const tee = def.tee;
    this.teePos = new THREE.Vector3(tee[0], hf.heightAt(tee[0], tee[1]), tee[1]);
    const aim = def.basket ? new THREE.Vector2(def.basket[0] - tee[0], def.basket[1] - tee[1]) : new THREE.Vector2(0, -1);
    const center = def.basket
      ? new THREE.Vector3((tee[0] + def.basket[0]) / 2, 0, (tee[1] + def.basket[1]) / 2)
      : this.teePos.clone();

    this.env = new Environment(scene, def.theme, this.terrain, { enabled: opts.shadows, size: opts.shadowSize }, center, def.seed ?? 3);

    const terrainMesh = buildTerrainMesh(this.terrain, def.theme, aim.clone().normalize());
    this.root.add(terrainMesh);

    // Tee.
    const yaw = Math.atan2(-aim.x, -aim.y);
    const dist = def.basket ? aim.length() : null;
    const teeModel = buildTee(opts.holeLabel ?? def.name, def.par ?? null, opts.showSign === false ? null : dist, yaw);
    teeModel.position.copy(this.teePos);
    this.root.add(teeModel);

    // Baskets.
    if (def.basket) {
      const [bx, bz] = def.basket;
      const by = hf.heightAt(bx, bz);
      this.basketPos = new THREE.Vector3(bx, by, bz);
      this.basketPhys = createBasketPhysics('main', bx, by, bz);
      this.basketModel = buildBasket(opts.holeLabel?.replace(/[^0-9]/g, '') || '★');
      this.basketModel.root.position.copy(this.basketPos);
      this.root.add(this.basketModel.root);
      this.colliders.push(...this.basketPhys.colliders);
      this.volumes.push(this.basketPhys.chains);
    }
    (def.extraBaskets ?? []).forEach(([bx, bz], i) => {
      const by = hf.heightAt(bx, bz);
      const pos = new THREE.Vector3(bx, by, bz);
      const phys = createBasketPhysics(`extra${i}`, bx, by, bz);
      const model = buildBasket(`${Math.round(Math.hypot(bx - tee[0], bz - tee[1]))}`, ['#3ec46d', '#4a8fe0', '#ff9a3c', '#a77bff'][i % 4]);
      model.root.position.copy(pos);
      this.root.add(model.root);
      this.colliders.push(...phys.colliders);
      this.volumes.push(phys.chains);
      this.extraBaskets.push({ pos, phys, model });
    });

    const batch = new Batcher();
    const rnd = mulberry32((def.seed ?? 3) * 977 + 11);
    def.objects.forEach((o, i) => this.addObject(o, i, batch, rnd));
    this.addDecor(batch, rnd);
    batch.build(this.root);

    scene.add(this.root);
  }

  /** Lifts a camera point clear of terrain, foliage and solid props. */
  clearance(p: THREE.Vector3, margin = 1.2): THREE.Vector3 {
    const out = p.clone();
    out.y = Math.max(out.y, this.groundY(out.x, out.z) + margin);
    for (const v of this.volumes) {
      const top = v.kind === 'sphere' ? v.y + v.r : (v.y1 ?? v.y);
      if (Math.hypot(out.x - v.x, out.z - v.z) < v.r + margin && out.y < top + margin) out.y = top + margin;
    }
    for (const c of this.colliders) {
      if (out.x > c.minX - margin && out.x < c.maxX + margin && out.z > c.minZ - margin && out.z < c.maxZ + margin && out.y < c.maxY + margin && out.y > c.minY - margin) {
        out.y = c.maxY + margin;
      }
    }
    return out;
  }

  /** True when a tree trunk, pipe or wall stands between two points. */
  lineBlocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    for (const c of this.colliders) {
      if (!(c instanceof CylinderCollider) && !(c instanceof BoxCollider)) continue;
      if (c.tag === 'pole' || c.tag === 'tray' || c.tag === 'band') continue;
      const cx = (c.minX + c.maxX) / 2;
      const cz = (c.minZ + c.maxZ) / 2;
      const r = Math.max(c.maxX - c.minX, c.maxZ - c.minZ) / 2 + 0.25;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((cx - a.x) * dx + (cz - a.z) * dz) / l2, 0, 1);
      const y = a.y + (b.y - a.y) * t;
      if (Math.hypot(a.x + dx * t - cx, a.z + dz * t - cz) < r && y > c.minY && y < c.maxY + 0.3) return true;
    }
    return false;
  }

  /** Slides a camera point toward its target until it is out of any tree canopy. */
  cameraSafe(cam: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const inside = (p: THREE.Vector3) =>
      this.volumes.some((v) => v.kind === 'sphere' && v.id.startsWith('leaves:') && p.distanceToSquared(new THREE.Vector3(v.x, v.y, v.z)) < (v.r + 0.3) ** 2);
    if (!inside(cam)) return cam;
    const q = new THREE.Vector3();
    for (let t = 0.15; t < 0.95; t += 0.15) {
      q.lerpVectors(cam, target, t);
      if (!inside(q)) return q.clone();
    }
    return q.lerpVectors(cam, target, 0.9).clone();
  }

  /** Height of the terrain under (x, z). */
  groundY(x: number, z: number): number {
    return this.terrain.hf.heightAt(x, z);
  }

  /** Lowest ground height under a footprint, so props don't float on slopes. */
  private footY(x: number, z: number, r: number): number {
    const hf = this.terrain.hf;
    let h = hf.heightAt(x, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      h = Math.min(h, hf.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
    return h;
  }

  attach(world: PhysicsWorld): void {
    world.clear();
    world.terrain = this.terrain.hf;
    world.waterLevel = this.terrain.waterLevel;
    world.fallLimit = this.terrain.sky ? -22 : -12;
    for (const c of this.colliders) world.addCollider(c);
    world.volumes.push(...this.volumes);
    world.triggers.push(...this.triggers);
  }

  private addObject(o: ObjDef, i: number, batch: Batcher, rnd: () => number): void {
    const hf = this.terrain.hf;
    const base = this.landHeight;
    const m4 = new THREE.Matrix4();
    switch (o.t) {
      case 'tree': {
        const s = o.s ?? 0.85 + rnd() * 0.35;
        const v = o.v ?? (this.def.theme === 'beach' ? 'palm' : this.def.theme === 'sky' ? 'cloud' : 'round');
        const y = this.footY(o.x, o.z, 0.5 * s);
        const rotY = rnd() * Math.PI * 2;
        m4.compose(new THREE.Vector3(o.x, y, o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, s, s));
        const id = `tree${i}`;
        let geo: THREE.BufferGeometry;
        let dims: { trunkR: number; trunkH: number; leaves: { x: number; y: number; z: number; r: number }[] };
        let solidTop = false;
        if (v === 'palm') {
          geo = palmTreeGeo();
          const top = palmTop();
          dims = { trunkR: 0.36, trunkH: 2.2, leaves: [{ x: top.x, y: top.y, z: 0, r: 2.1 }] };
          // Extra trunk segments along the lean.
          const lean = new THREE.Vector3(top.x, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).multiplyScalar(s);
          this.colliders.push(
            new CylinderCollider(o.x + lean.x * 0.35, o.z + lean.z * 0.35, y + 2.0 * s, y + 4.2 * s, 0.3 * s, MATERIALS.wood, `trunk:${id}`),
            new CylinderCollider(o.x + lean.x * 0.75, o.z + lean.z * 0.75, y + 4.0 * s, y + top.y * s, 0.26 * s, MATERIALS.wood, `trunk:${id}`),
          );
        } else if (v === 'pine') {
          geo = pineTreeGeo();
          dims = { trunkR: 0.38, trunkH: 2.0, leaves: [{ x: 0, y: 3.2, z: 0, r: 2.4 }, { x: 0, y: 5.4, z: 0, r: 1.6 }] };
        } else if (v === 'lollipop') {
          geo = lollipopTreeGeo(i);
          dims = TREE_DIMS.lollipop;
          solidTop = true;
        } else if (v === 'cloud') {
          geo = cloudTreeGeo(i);
          dims = TREE_DIMS.cloud;
        } else {
          geo = roundTreeGeo(i);
          dims = TREE_DIMS.round;
        }
        const ref = batch.add(`tree-${v}-${geo.uuid}`, geo, toon(0xffffff, { vertexColors: true }), m4, {
          outline: { color: OUTLINE, thickness: 0.05 },
        });
        this.treeRefs.set(id, ref);
        this.colliders.push(new CylinderCollider(o.x, o.z, y - 0.5, y + dims.trunkH * s, dims.trunkR * s, MATERIALS.wood, `trunk:${id}`));
        const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        dims.leaves.forEach((lf, k) => {
          const p = new THREE.Vector3(lf.x, lf.y, lf.z).multiplyScalar(s).applyQuaternion(rot).add(new THREE.Vector3(o.x, y, o.z));
          if (solidTop) {
            this.colliders.push(new SphereCollider(p.x, p.y, p.z, lf.r * s, MATERIALS.stone, `trunk:${id}`));
          } else if (k === 0 || lf.r > 1.55) {
            this.volumes.push({
              id: `leaves:${id}`,
              kind: 'sphere',
              x: p.x,
              y: p.y,
              z: p.z,
              r: lf.r * s * 1.05,
              linDrag: 3.2,
              quadDrag: 0.22,
              angDrag: 4,
            });
          }
        });
        break;
      }
      case 'bush': {
        const s = o.s ?? 1;
        const y = this.footY(o.x, o.z, 0.8 * s);
        m4.compose(new THREE.Vector3(o.x, y, o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), new THREE.Vector3(s, s, s));
        const ref = batch.add('bush', bushGeo(), toon(0xffffff, { vertexColors: true }), m4, { outline: { color: OUTLINE, thickness: 0.04 } });
        const id = `bush${i}`;
        this.treeRefs.set(id, ref);
        this.volumes.push({ id: `leaves:${id}`, kind: 'sphere', x: o.x, y: y + 0.5 * s, z: o.z, r: 1.35 * s, linDrag: 5, quadDrag: 0.4, angDrag: 6 });
        break;
      }
      case 'rock': {
        const s = o.s ?? 0.8 + rnd() * 0.6;
        const y = this.footY(o.x, o.z, 0.6 * s);
        m4.compose(new THREE.Vector3(o.x, y + 0.25 * s, o.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)), new THREE.Vector3(s, s, s));
        batch.add(`rock${i % 3}`, rockGeo(i % 3), toon(0xffffff, { vertexColors: true }), m4, { outline: { color: OUTLINE, thickness: 0.04 } });
        this.colliders.push(new SphereCollider(o.x, y + 0.2 * s, o.z, 0.85 * s, MATERIALS.stone, 'rock'));
        break;
      }
      case 'block': {
        const n = o.n ?? 1;
        const yaw = o.yaw ?? 0;
        const size = 1.6;
        const dir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * size;
          const x = o.x + dir.x * off;
          const z = o.z + dir.z * off;
          const y = base + o.y;
          const v = o.v ?? 'brick';
          const tex = v === 'lucky' ? luckyTexture() : v === 'stone' ? stoneTexture() : brickTexture();
          const mesh = new THREE.Mesh(blockGeo(), toon(0xffffff, { map: tex }));
          mesh.position.set(x, y, z);
          mesh.rotation.y = yaw;
          mesh.castShadow = true;
          const ol = new THREE.Mesh(blockGeo(), outlineMaterial(OUTLINE, 0));
          ol.scale.setScalar(1.06);
          mesh.add(ol);
          this.root.add(mesh);
          const tag = v === 'lucky' ? `lucky:${i}-${k}` : 'block';
          if (v === 'lucky') this.luckies.set(tag, { mesh, used: false, bump: 0, baseY: y });
          this.colliders.push(new BoxCollider(x, y, z, size / 2, size / 2, size / 2, yaw, MATERIALS.stone, tag));
        }
        break;
      }
      case 'wall': {
        const d = o.d ?? 1.2;
        const yaw = o.yaw ?? 0;
        const y = this.footY(o.x, o.z, Math.max(o.w, d) / 2) - 0.3;
        const v = o.v ?? 'brick';
        const tex = (v === 'stone' ? stoneTexture() : brickTexture()).clone();
        tex.userData = {};
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(o.w / 1.6, (o.h + 0.3) / 1.6);
        tex.needsUpdate = true;
        const mat = v === 'wood' ? toon(0xc98a4b) : toon(0xffffff, { map: tex });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h + 0.3, d), mat);
        mesh.position.set(o.x, y + (o.h + 0.3) / 2, o.z);
        mesh.rotation.y = yaw;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const ol = new THREE.Mesh(mesh.geometry, outlineMaterial(OUTLINE, 0));
        ol.scale.set(1 + 0.08 / o.w, 1 + 0.08 / o.h, 1 + 0.08 / d);
        mesh.add(ol);
        this.root.add(mesh);
        this.colliders.push(new BoxCollider(o.x, y + (o.h + 0.3) / 2, o.z, o.w / 2, (o.h + 0.3) / 2, d / 2, yaw, v === 'wood' ? MATERIALS.wood : MATERIALS.stone, 'wall'));
        break;
      }
      case 'mushroom': {
        const s = o.s ?? 1;
        const y = this.footY(o.x, o.z, 0.6 * s);
        const color = o.c ?? [0xff4d5e, 0xff8a3d, 0xb36bff, 0x3fa9ff][i % 4];
        const g = mushroomGeo(color);
        const grp = new THREE.Group();
        const stem = new THREE.Mesh(g.stem, toon(0xffffff, { vertexColors: true }));
        stem.castShadow = true;
        addOutline(stem, OUTLINE, 0.04);
        const cap = new THREE.Mesh(g.cap, toon(0xffffff, { vertexColors: true }));
        cap.position.y = 1.6;
        cap.castShadow = true;
        addOutline(cap, OUTLINE, 0.05);
        grp.add(stem, cap);
        grp.position.set(o.x, y, o.z);
        grp.scale.setScalar(s);
        grp.rotation.y = rnd() * 6.28;
        this.root.add(grp);
        const id = `mushroom:${i}`;
        this.mushrooms.set(id, cap);
        this.colliders.push(
          new CylinderCollider(o.x, o.z, y - 0.3, y + 1.6 * s, 0.55 * s, MATERIALS.wood, `stem:${i}`),
          new EllipsoidCollider(o.x, y + 1.62 * s, o.z, 2.0 * s, 1.15 * s, 2.0 * s, MATERIALS.bouncy, id),
        );
        break;
      }
      case 'pipe': {
        const r = o.r ?? 0.9;
        const y = this.footY(o.x, o.z, r) - 0.2;
        const color = o.c ?? 0x3fd06b;
        const mesh = new THREE.Mesh(pipeGeo(o.h + 0.2, r, color), toon(0xffffff, { vertexColors: true }));
        mesh.position.set(o.x, y, o.z);
        mesh.castShadow = true;
        addOutline(mesh, OUTLINE, 0.05);
        this.root.add(mesh);
        this.colliders.push(new CylinderCollider(o.x, o.z, y - 0.5, y + o.h + 0.2, r + 0.18, MATERIALS.stone, 'pipe'));
        break;
      }
      case 'ring': {
        const r = o.r ?? 1.7;
        const kind = o.v ?? 'coin';
        const yaw = o.yaw ?? 0;
        const grp = buildRing(r, kind);
        const y = base + o.y;
        grp.position.set(o.x, y, o.z);
        grp.rotation.y = yaw;
        this.root.add(grp);
        const ax = Math.sin(yaw);
        const az = Math.cos(yaw);
        const trig: Trigger = { id: `ring${i}`, kind: 'ring', x: o.x, y, z: o.z, r: r - 0.1, ax, ay: 0, az, once: kind === 'coin', data: { ring: i } };
        this.triggers.push(trig);
        this.colliders.push(new TorusCollider(o.x, y, o.z, ax, 0, az, r, kind === 'coin' ? 0.14 : 0.17, MATERIALS.metal, 'ring'));
        this.rings.push({ group: grp, trigger: trig, kind, flash: 0, passed: false });
        if (kind === 'coin') this.totalCoins += 5;
        break;
      }
      case 'coin':
        this.addCoin(o.x, base + o.y, o.z);
        break;
      case 'coins': {
        for (let k = 0; k < o.n; k++) {
          const t = o.n === 1 ? 0.5 : k / (o.n - 1);
          this.addCoin(
            o.from[0] + (o.to[0] - o.from[0]) * t,
            base + o.from[1] + (o.to[1] - o.from[1]) * t,
            o.from[2] + (o.to[2] - o.from[2]) * t,
          );
        }
        break;
      }
      case 'flowers': {
        for (let k = 0; k < o.n; k++) {
          const a = rnd() * Math.PI * 2;
          const rr = Math.sqrt(rnd()) * o.r;
          this.addFlower(batch, o.x + Math.cos(a) * rr, o.z + Math.sin(a) * rr, rnd);
        }
        break;
      }
      case 'umbrella': {
        const y = this.footY(o.x, o.z, 0.2);
        const color = o.c ?? [0xff5a7a, 0x3fa9ff, 0xffb43f][i % 3];
        const mesh = new THREE.Mesh(umbrellaGeo(color), toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
        mesh.position.set(o.x, y, o.z);
        mesh.rotation.z = 0.12;
        mesh.castShadow = true;
        this.root.add(mesh);
        this.colliders.push(
          new CylinderCollider(o.x, o.z, y - 0.3, y + 2.5, 0.06, MATERIALS.wood, 'umbrella'),
          new EllipsoidCollider(o.x, y + 2.45, o.z, 1.6, 0.4, 1.6, MATERIALS.bouncy, `umbrella:${i}`),
        );
        break;
      }
      case 'cloudpad': {
        const y = base + o.y;
        const grp = new THREE.Group();
        const mat = toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.2 });
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const sp = new THREE.Mesh(sphereGeo(), mat);
          sp.scale.set(o.r * 0.5, o.r * 0.32, o.r * 0.5);
          sp.position.set(Math.cos(a) * o.r * 0.55, 0, Math.sin(a) * o.r * 0.55);
          grp.add(sp);
        }
        const mid = new THREE.Mesh(sphereGeo(), mat);
        mid.scale.set(o.r * 0.7, o.r * 0.4, o.r * 0.7);
        grp.add(mid);
        grp.position.set(o.x, y, o.z);
        this.root.add(grp);
        this.animated.push((_dt, t) => {
          grp.position.y = y + Math.sin(t * 1.2 + i) * 0.15;
        });
        this.colliders.push(new EllipsoidCollider(o.x, y, o.z, o.r * 1.05, o.r * 0.38, o.r * 1.05, MATERIALS.cloud, 'cloudpad'));
        break;
      }
      case 'target': {
        const y = hf.heightAt(o.x, o.z) + 0.03;
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(o.r, 48), new THREE.MeshToonMaterial({ map: targetTexture(), transparent: true }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(o.x, y, o.z);
        mesh.receiveShadow = true;
        mesh.renderOrder = 1;
        (mesh.material as THREE.Material).polygonOffset = true;
        (mesh.material as THREE.Material).polygonOffsetFactor = -2;
        this.root.add(mesh);
        this.targets.push({ pos: new THREE.Vector3(o.x, y, o.z), r: o.r, mesh });
        break;
      }
      case 'marker': {
        const y = hf.heightAt(o.x, o.z);
        const mk = buildMarker(o.text, o.c ?? 0xff4f6d);
        mk.position.set(o.x, y, o.z);
        this.root.add(mk);
        break;
      }
    }
  }

  private addCoin(x: number, y: number, z: number): void {
    const mesh = buildCoin();
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    const trig: Trigger = { id: `coin${this.coins.length}`, kind: 'sphere', x, y, z, r: 0.8, once: true };
    this.triggers.push(trig);
    this.coins.push({ mesh, trigger: trig, collected: false, spin: Math.random() * 6, baseY: y, pop: 0 });
    this.totalCoins += 1;
  }

  private addFlower(batch: Batcher, x: number, z: number, rnd: () => number): void {
    const y = this.terrain.hf.heightAt(x, z);
    const s = 0.8 + rnd() * 0.6;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), new THREE.Vector3(s, s, s));
    const colors = [0xff5a7a, 0xffffff, 0xffd23f, 0xb46bff, 0xff8a3d, 0x5cb8ff];
    batch.add('flowerpetal', flowerPetalGeo(), toon(0xffffff, { vertexColors: true }), m, {
      color: new THREE.Color(colors[Math.floor(rnd() * colors.length)]),
      castShadow: false,
    });
    batch.add('flowercore', flowerCoreGeo(), toon(0xffffff, { vertexColors: true }), m, { castShadow: false });
  }

  /** Scatter flowers, grass tufts and small rocks on open ground. */
  private addDecor(batch: Batcher, rnd: () => number): void {
    const def = this.def;
    const hf = this.terrain.hf;
    const q = this.opts.quality === 'high' ? 1 : this.opts.quality === 'mid' ? 0.6 : 0.3;
    const area = hf.width * hf.depth;
    const attempts = Math.floor((area / 30) * (def.decor ?? 1) * q);
    const keep: [number, number, number][] = [[def.tee[0], def.tee[1], 6]];
    if (def.basket) keep.push([def.basket[0], def.basket[1], 7]);
    for (const b of def.extraBaskets ?? []) keep.push([b[0], b[1], 5]);
    for (const o of def.objects) if ('x' in o && 'z' in o) keep.push([o.x, o.z, 2.2]);
    for (let k = 0; k < attempts; k++) {
      const x = hf.x0 + rnd() * hf.width;
      const z = hf.z0 + rnd() * hf.depth;
      if (landDistance(def, x, z) > -3) continue;
      const mat = hf.materialIdAt(x, z);
      if (mat !== TM.grass && mat !== TM.rough) continue;
      if (keep.some(([kx, kz, r]) => (x - kx) ** 2 + (z - kz) ** 2 < r * r)) continue;
      const y = hf.heightAt(x, z);
      if (this.terrain.waterLevel !== null && y < 0.3) continue;
      const roll = rnd();
      if (roll < 0.35) {
        this.addFlower(batch, x, z, rnd);
      } else if (roll < 0.97) {
        const s = 0.7 + rnd() * 0.8;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), new THREE.Vector3(s, s, s));
        batch.add('tuft', tuftGeo(), toon(0xffffff, { vertexColors: true }), m, { castShadow: false });
      } else {
        const s = 0.25 + rnd() * 0.3;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.05, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), new THREE.Vector3(s, s, s));
        batch.add('pebble', rockGeo(1), toon(0xffffff, { vertexColors: true }), m, { castShadow: false });
      }
    }
  }

  /** Reacts to a physics event visually and returns gameplay rewards. */
  handleEvent(e: PhysEvent, disc: DiscBody, fx: FXHub): { coins: number; boost: number } {
    const res = { coins: 0, boost: 0 };
    const p = new THREE.Vector3(disc.x, disc.y, disc.z);
    if (e.type === 'trigger') {
      const coin = this.coins.find((c) => c.trigger === e.trigger);
      if (coin && !coin.collected) {
        coin.collected = true;
        coin.pop = 0.001;
        res.coins += 1;
        fx.sfx('coin');
        fx.burst('sparkle', coin.mesh.position, 8, 0xffe14a, 3);
        fx.popup('+1', coin.mesh.position, 'coin');
        return res;
      }
      const ring = this.rings.find((r) => r.trigger === e.trigger);
      if (ring) {
        ring.flash = 1;
        if (ring.kind === 'coin') {
          if (!ring.passed) {
            ring.passed = true;
            res.coins += 5;
            fx.sfx('ring');
            fx.burst('star', ring.group.position, 18, 0xfff27a, 6);
            fx.popup('NICE! +5', ring.group.position, 'nice');
          }
        } else {
          res.boost = 1.35;
          fx.sfx('boost');
          fx.burst('sparkle', ring.group.position, 16, 0x7fdcff, 7);
          fx.popup('BOOST!', ring.group.position, 'nice');
          fx.shake(0.25);
        }
      }
      return res;
    }
    if (e.type === 'enterVolume') {
      const id = e.volume.id;
      if (id.startsWith('leaves:')) {
        const key = id.slice(7);
        const ref = this.treeRefs.get(key);
        if (ref) this.shakers.push({ ref, t: 0, amp: Math.min(0.14, 0.03 + e.speed * 0.006), kind: 'wobble' });
        fx.sfx('leaves', { vol: Math.min(1, 0.3 + e.speed / 20) });
        fx.burst('leaf', p, Math.min(14, 4 + Math.floor(e.speed)), this.def.theme === 'sky' ? 0xffd6ef : 0x5ccf4a, 2.5);
      } else if (id.endsWith('-chains')) {
        const b = id.startsWith('main') ? this.basketModel : this.extraBaskets.find((x) => id === x.phys.chains.id)?.model;
        b?.shake(0.06 + e.speed * 0.02);
        fx.sfx('chains', { vol: Math.min(1, 0.4 + e.speed / 12) });
      }
      return res;
    }
    if (e.type === 'impact') {
      const tag = e.tag;
      const vol = Math.min(1, e.speed / 9);
      if (tag.startsWith('lucky:')) {
        const lb = this.luckies.get(tag);
        if (lb && !lb.used && e.speed > 1.2) {
          lb.used = true;
          lb.bump = 1;
          (lb.mesh.material as THREE.MeshToonMaterial).map = usedBlockTexture();
          (lb.mesh.material as THREE.MeshToonMaterial).needsUpdate = true;
          res.coins += 3;
          fx.sfx('lucky');
          const top = lb.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          fx.burst('star', top, 14, 0xffe14a, 5);
          fx.popup('+3', top, 'coin');
        } else {
          fx.sfx('stone', { vol });
        }
      } else if (tag.startsWith('mushroom:') || tag.startsWith('umbrella:')) {
        const cap = this.mushrooms.get(tag);
        if (cap) this.shakers.push({ obj: cap, t: 0, amp: 0.25, kind: 'squish', baseScale: new THREE.Vector3(1, 1, 1) });
        fx.sfx('boing', { vol: Math.max(0.5, vol) });
        fx.burst('star', new THREE.Vector3(e.x, e.y, e.z), 8, 0xffffff, 3);
      } else if (tag.startsWith('trunk:')) {
        const ref = this.treeRefs.get(tag.slice(6));
        if (ref) this.shakers.push({ ref, t: 0, amp: Math.min(0.1, 0.02 + e.speed * 0.005), kind: 'wobble' });
        fx.sfx('wood', { vol });
        fx.burst('leaf', p.clone().add(new THREE.Vector3(0, 2, 0)), 5, 0x5ccf4a, 2);
      } else if (tag === 'pole' || tag === 'band' || tag === 'tray' || tag === 'ring') {
        fx.sfx('clank', { vol });
        if (tag !== 'ring') this.basketNear(p)?.shake(0.05 + e.speed * 0.01);
      } else if (tag === 'ground') {
        const s = e.mat.sound;
        if (e.speed > 1.2) {
          fx.sfx(s === 'sand' ? 'sand' : s === 'snow' ? 'snow' : s === 'cloud' ? 'cloud' : 'thud', { vol });
          fx.burst(s === 'sand' ? 'dust' : 'dust', new THREE.Vector3(e.x, e.y, e.z), Math.min(10, 2 + Math.floor(e.speed)), s === 'sand' ? 0xf5dc9a : 0xd8f5c0, 1.5);
        }
      } else if (tag === 'cloudpad') {
        fx.sfx('cloud', { vol });
        fx.burst('cloud', new THREE.Vector3(e.x, e.y, e.z), 6, 0xffffff, 1.5);
      } else {
        fx.sfx(e.mat.sound === 'wood' ? 'wood' : e.mat.sound === 'metal' ? 'clank' : 'stone', { vol });
      }
      return res;
    }
    if (e.type === 'water') {
      fx.sfx('splash');
      fx.burst('splash', new THREE.Vector3(e.x, e.y, e.z), 22, 0xffffff, 5);
    }
    return res;
  }

  private basketNear(p: THREE.Vector3): BasketModel | null {
    if (this.basketPos && this.basketModel && p.distanceTo(this.basketPos) < 3) return this.basketModel;
    for (const b of this.extraBaskets) if (p.distanceTo(b.pos) < 3) return b.model;
    return null;
  }

  /** True when the disc rests inside any basket. Returns which. */
  basketHolding(disc: DiscBody): BasketPhysics | null {
    if (this.basketPhys?.holds(disc)) return this.basketPhys;
    for (const b of this.extraBaskets) if (b.phys.holds(disc)) return b.phys;
    return null;
  }

  /** Re-arms per-throw triggers (boost rings). */
  resetThrow(): void {
    for (const r of this.rings) if (r.kind === 'boost') r.trigger.fired = false;
  }

  /** Resets all collectables (for retrying a stage). */
  resetCollectables(): void {
    for (const c of this.coins) {
      c.collected = false;
      c.pop = 0;
      c.trigger.fired = false;
      c.mesh.visible = true;
      c.mesh.scale.setScalar(1);
    }
    for (const r of this.rings) {
      r.passed = false;
      r.trigger.fired = false;
    }
  }

  /** Nudges a throwing spot out of solid objects. */
  freeSpot(x: number, z: number): [number, number] {
    const blocked = (px: number, pz: number) => {
      const y = this.groundY(px, pz) + 1;
      for (const c of this.colliders) {
        if (c.overlapsSphere(px, y, pz, 0.45)) return true;
      }
      for (const v of this.volumes) {
        if (v.id.startsWith('leaves:bush') && Math.hypot(px - v.x, pz - v.z) < v.r) return true;
      }
      return false;
    };
    if (!blocked(x, z)) return [x, z];
    for (let r = 0.6; r < 8; r += 0.5) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (!blocked(px, pz) && (this.terrain.waterLevel === null || this.groundY(px, pz) > 0.2)) return [px, pz];
      }
    }
    return [x, z];
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const t = this.time;
    this.env.update(dt, camera);
    this.basketModel?.update(dt, t);
    for (const b of this.extraBaskets) b.model.update(dt, t);
    for (const c of this.coins) {
      if (!c.mesh.visible) continue;
      c.spin += dt * 3;
      c.mesh.rotation.y = c.spin;
      if (c.collected) {
        c.pop += dt;
        c.mesh.position.y = c.baseY + c.pop * 4;
        c.mesh.rotation.y += dt * 20;
        c.mesh.scale.setScalar(Math.max(0, 1 - c.pop * 2.5));
        if (c.pop > 0.4) c.mesh.visible = false;
      } else {
        c.mesh.position.y = c.baseY + Math.sin(t * 2 + c.spin * 0.1) * 0.08;
      }
    }
    for (const r of this.rings) {
      if (r.flash > 0) {
        r.flash = Math.max(0, r.flash - dt * 1.5);
        const s = 1 + Math.sin((1 - r.flash) * Math.PI) * 0.25;
        r.group.scale.setScalar(s);
      }
      if (r.kind === 'coin') r.group.children.forEach((ch, k) => (ch.rotation.z += k < 12 ? dt * 0.6 : 0));
    }
    for (const lb of this.luckies.values()) {
      if (lb.bump > 0) {
        lb.bump = Math.max(0, lb.bump - dt * 4);
        lb.mesh.position.y = lb.baseY + Math.sin(lb.bump * Math.PI) * 0.35;
      }
    }
    for (let i = this.shakers.length - 1; i >= 0; i--) {
      const s = this.shakers[i];
      s.t += dt;
      const decay = Math.exp(-s.t * 4);
      if (s.kind === 'wobble' && s.ref) {
        const a = Math.sin(s.t * 18) * s.amp * decay;
        this.tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0.6).normalize(), a);
        this.tmpM.makeRotationFromQuaternion(this.tmpQ);
        const m = s.ref.base.clone();
        const pos = new THREE.Vector3().setFromMatrixPosition(m);
        m.setPosition(0, 0, 0);
        m.premultiply(this.tmpM);
        m.setPosition(pos);
        setInstanceMatrix(s.ref, m);
      } else if (s.kind === 'squish' && s.obj) {
        const k = Math.sin(s.t * 22) * s.amp * decay;
        s.obj.scale.set(1 + k * 0.6, 1 - k, 1 + k * 0.6);
      }
      if (s.t > 1.4) {
        if (s.ref) setInstanceMatrix(s.ref, s.ref.base);
        if (s.obj) s.obj.scale.set(1, 1, 1);
        this.shakers.splice(i, 1);
      }
    }
    for (const a of this.animated) a(dt, t);
  }

  /** Draws a top-down map image of the stage. */
  renderMinimap(size: number): { canvas: HTMLCanvasElement; toMap: (x: number, z: number) => [number, number] } {
    const hf = this.terrain.hf;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // Fit tee and baskets with margin, oriented so the basket is at the top.
    const tee = this.def.tee;
    const goal = this.def.basket ?? [tee[0], tee[1] - 60];
    const ang = Math.atan2(goal[0] - tee[0], -(goal[1] - tee[1]));
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const cx = (tee[0] + goal[0]) / 2;
    const cz = (tee[1] + goal[1]) / 2;
    const len = Math.hypot(goal[0] - tee[0], goal[1] - tee[1]);
    const span = Math.max(50, len * 1.25 + 20);
    const scale = size / span;
    const toMap = (x: number, z: number): [number, number] => {
      const dx = x - cx;
      const dz = z - cz;
      const rx = dx * cos + dz * sin;
      const rz = -dx * sin + dz * cos;
      return [size / 2 + rx * scale, size / 2 + rz * scale];
    };
    const img = ctx.createImageData(size, size);
    const colors: Record<number, [number, number, number]> = {
      [TM.grass]: [96, 200, 70],
      [TM.fairway]: [140, 226, 100],
      [TM.rough]: [62, 150, 58],
      [TM.sand]: [246, 220, 150],
      [TM.dirt]: [180, 125, 80],
    };
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const rx = (px - size / 2) / scale;
        const rz = (py - size / 2) / scale;
        const x = cx + rx * cos - rz * sin;
        const z = cz + rx * sin + rz * cos;
        const h = hf.heightAt(x, z);
        let c: [number, number, number];
        if (!hf.contains(x, z) || (this.terrain.waterLevel !== null && h < this.terrain.waterLevel)) {
          c = this.terrain.sky ? [250, 226, 248] : [60, 170, 235];
        } else if (this.terrain.sky && h < this.landHeight - 3) {
          c = [250, 226, 248];
        } else {
          c = colors[hf.materialIdAt(x, z)] ?? colors[TM.grass];
        }
        const o = (py * size + px) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Obstacles.
    for (const o of this.def.objects) {
      if (o.t === 'tree' || o.t === 'bush') {
        const [mx, my] = toMap(o.x, o.z);
        ctx.fillStyle = 'rgba(30,110,40,0.95)';
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(2, 2.4 * scale * (o.t === 'bush' ? 0.6 : 1)), 0, Math.PI * 2);
        ctx.fill();
      } else if (o.t === 'mushroom') {
        const [mx, my] = toMap(o.x, o.z);
        ctx.fillStyle = '#ff5a6a';
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(2, 2 * scale), 0, Math.PI * 2);
        ctx.fill();
      } else if (o.t === 'block' || o.t === 'wall' || o.t === 'pipe') {
        const [mx, my] = toMap(o.x, o.z);
        ctx.fillStyle = '#a0522d';
        ctx.fillRect(mx - 2, my - 2, 4, 4);
      } else if (o.t === 'target') {
        const [mx, my] = toMap(o.x, o.z);
        ctx.strokeStyle = '#ff5a5a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, Math.max(3, o.r * scale), 0, Math.PI * 2);
        ctx.stroke();
      } else if (o.t === 'ring') {
        const [mx, my] = toMap(o.x, o.z);
        ctx.strokeStyle = o.v === 'boost' ? '#39c6ff' : '#ffd23f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const drawBasket = (x: number, z: number) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4f6d';
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI * 2);
      ctx.fill();
    };
    if (this.def.basket) drawBasket(this.def.basket[0], this.def.basket[1]);
    for (const b of this.def.extraBaskets ?? []) drawBasket(b[0], b[1]);
    const [tx, ty] = toMap(tee[0], tee[1]);
    ctx.fillStyle = '#ff86b4';
    ctx.fillRect(tx - 4, ty - 4, 8, 8);
    return { canvas, toMap };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    disposeTree(this.root);
    this.env.dispose();
  }
}

let _blockGeo: THREE.BoxGeometry | null = null;
function blockGeo(): THREE.BoxGeometry {
  if (!_blockGeo) {
    _blockGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    _blockGeo.userData.shared = true;
  }
  return _blockGeo;
}

let _sphereGeo: THREE.SphereGeometry | null = null;
function sphereGeo(): THREE.SphereGeometry {
  if (!_sphereGeo) {
    _sphereGeo = new THREE.SphereGeometry(1, 16, 12);
    _sphereGeo.userData.shared = true;
  }
  return _sphereGeo;
}
