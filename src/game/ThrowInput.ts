import * as THREE from 'three';
import type { DiscType } from '../data/discs';
import { launchFrame } from '../physics/launch';
import type { CameraRig } from './CameraRig';
import { analyzeSwipe, powerFromSpeed, swipeSpeed, type SwipeSample } from './swipe';

export type AimPhase = 'angle' | 'tilt' | 'swipe';

export interface ThrowResult {
  /** Horizontal heading (unit). */
  hx: number;
  hz: number;
  angle: number;
  tilt: number;
  speed: number;
  /** rad/s about the disc normal, + = counter-clockwise from above */
  spin: number;
  power: number;
  /** 0..1 how far from the centre the swipe passed */
  spinFactor: number;
  grazed: boolean;
}

export interface ThrowInputDeps {
  rig: CameraRig;
  canvas: HTMLCanvasElement;
  layer: HTMLElement;
  sensitivity: () => number;
  onPhase: (p: AimPhase) => void;
  onThrow: (r: ThrowResult) => void;
  onMiss: (reason: string) => void;
  onAimPreview?: (hx: number, hz: number) => void;
  sfx: (name: 'click' | 'tick' | 'swipe' | 'back') => void;
  /** Disc pose preview: called whenever angle/tilt change. */
  onPose: (quat: [number, number, number, number]) => void;
}

const ANGLE_MIN = -10;
const ANGLE_MAX = 50;
const TILT_MAX = 60;
const VISUAL_R = 0.106 * 1.25;
const PHYS_R = 0.106;

interface Pt {
  x: number;
  y: number;
  t: number;
}

export class ThrowInput {
  phase: AimPhase = 'angle';
  angleDeg = 10;
  tiltDeg = 0;
  active = false;

  private origin = new THREE.Vector3();
  private aim = new THREE.Vector2(0, -1);
  private disc: DiscType | null = null;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private panel: HTMLDivElement;
  private helpers = new THREE.Group();
  private arrow: THREE.Group;
  private arc: THREE.Mesh;
  private horizon: THREE.Line;
  private aimLine: THREE.Mesh;
  private previewLine: THREE.Mesh;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private swipePts: Pt[] = [];
  private swipeFade: { pts: Pt[]; until: number; offset?: [Pt, Pt]; label?: string; color: string } | null = null;
  private pointerType = 'mouse';
  private livePower = 0;
  private raf = 0;
  private boundDown = (e: PointerEvent) => this.down(e);
  private boundMove = (e: PointerEvent) => this.move(e);
  private boundUp = (e: PointerEvent) => this.up(e);
  private boundKey = (e: KeyboardEvent) => this.key(e);

  constructor(
    private scene: THREE.Scene,
    private deps: ThrowInputDeps,
  ) {
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'aim-overlay';
    deps.layer.appendChild(this.overlay);
    this.ctx = this.overlay.getContext('2d')!;
    this.panel = document.createElement('div');
    this.panel.className = 'aim-panel hidden';
    deps.layer.appendChild(this.panel);

    // Launch arrow.
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff4f6d, depthTest: false, transparent: true });
    this.arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 8), arrowMat);
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.x = 0.5;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12), arrowMat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 1.06;
    this.arrow.add(shaft, head);
    this.arrow.renderOrder = 20;
    shaft.renderOrder = 20;
    head.renderOrder = 20;
    this.arc = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.45, 32, 1, 0, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    this.arc.renderOrder = 19;
    this.horizon = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(1.4, 0, 0)]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.05, gapSize: 0.04, depthTest: false, transparent: true }),
    );
    this.horizon.computeLineDistances();
    this.horizon.renderOrder = 19;

    const lineGeo = new THREE.PlaneGeometry(0.12, 1);
    lineGeo.translate(0, 0.5, 0);
    lineGeo.rotateX(-Math.PI / 2);
    this.aimLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: dashTexture('#ffffff'), transparent: true, depthWrite: false }));
    this.aimLine.renderOrder = 4;
    this.previewLine = new THREE.Mesh(lineGeo.clone(), new THREE.MeshBasicMaterial({ map: dashTexture('#ffd23f'), transparent: true, depthWrite: false }));
    this.previewLine.renderOrder = 4;
    this.helpers.add(this.arrow, this.arc, this.horizon, this.aimLine, this.previewLine);
    this.helpers.visible = false;
    scene.add(this.helpers);

    deps.canvas.addEventListener('pointerdown', this.boundDown);
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
    window.addEventListener('pointercancel', this.boundUp);
    window.addEventListener('keydown', this.boundKey);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.drawOverlay();
    };
    loop();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.overlay.width = Math.round(window.innerWidth * dpr);
    this.overlay.height = Math.round(window.innerHeight * dpr);
    this.overlay.style.width = `${window.innerWidth}px`;
    this.overlay.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.active) this.applyCamera(0.2);
  }

  /** Starts aiming from origin toward aim (horizontal). */
  begin(origin: THREE.Vector3, aim: THREE.Vector2, disc: DiscType, groundY: number): void {
    this.origin.copy(origin);
    this.aim.copy(aim).normalize();
    this.disc = disc;
    this.active = true;
    this.helpers.visible = true;
    // Aim line on the ground.
    const yaw = Math.atan2(this.aim.x, this.aim.y);
    this.aimLine.position.set(origin.x, groundY + 0.04, origin.z);
    this.aimLine.rotation.set(0, yaw + Math.PI, 0);
    this.aimLine.scale.set(1, 1, 14);
    this.previewLine.visible = false;
    this.setPhase('angle', 0.9);
  }

  setDisc(disc: DiscType): void {
    this.disc = disc;
    this.renderPanel();
  }

  end(): void {
    this.active = false;
    this.helpers.visible = false;
    this.panel.classList.add('hidden');
    this.swipePts = [];
    this.dragging = false;
  }

  setPhase(p: AimPhase, dur = 0.6): void {
    this.phase = p;
    this.deps.onPhase(p);
    this.arrow.visible = p === 'angle';
    this.arc.visible = p === 'angle';
    this.horizon.visible = p === 'angle';
    this.aimLine.visible = p === 'swipe';
    this.previewLine.visible = false;
    this.applyCamera(dur);
    this.updatePose();
    this.renderPanel();
    this.panel.classList.remove('hidden');
    this.panel.classList.toggle('swipe', p === 'swipe');
  }

  private frame() {
    return launchFrame(this.aim.x, this.aim.y, (this.angleDeg * Math.PI) / 180, (this.tiltDeg * Math.PI) / 180);
  }

  private applyCamera(dur: number): void {
    const o = this.origin;
    const ax = this.aim.x;
    const az = this.aim.y;
    const right = new THREE.Vector3(-az, 0, ax);
    const fwd = new THREE.Vector3(ax, 0, az);
    const rig = this.deps.rig;
    const portrait = window.innerHeight > window.innerWidth;
    if (this.phase === 'angle') {
      const dist = portrait ? 2.3 : 1.55;
      const pos = o.clone().addScaledVector(right, dist).addScaledVector(fwd, 0.45).add(new THREE.Vector3(0, 0.22, 0));
      const look = o.clone().addScaledVector(fwd, 0.45).add(new THREE.Vector3(0, 0.12, 0));
      rig.setPose(pos, look, 45, dur);
    } else if (this.phase === 'tilt') {
      const f = this.frame().forward;
      const fv = new THREE.Vector3(f[0], f[1], f[2]);
      const dist = portrait ? 1.75 : 1.3;
      const pos = o.clone().addScaledVector(fv, -dist).add(new THREE.Vector3(0, 0.08, 0));
      const look = o.clone().addScaledVector(fv, 2);
      rig.setPose(pos, look, 40, dur);
    } else {
      // Close top-down view; distance chosen so the disc fills a comfortable area of the screen.
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      const targetR = Math.max(70, Math.min(150, minDim * 0.17));
      const fov = 50;
      const d = (VISUAL_R * window.innerHeight) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * targetR);
      const pitch = THREE.MathUtils.degToRad(74);
      const pos = o.clone().addScaledVector(fwd, -Math.cos(pitch) * d).add(new THREE.Vector3(0, Math.sin(pitch) * d, 0));
      // Look at the disc itself so it sits mid-screen, clear of the bottom panel.
      const look = o.clone().addScaledVector(fwd, d * 0.06);
      rig.setPose(pos, look, fov, dur, fwd);
    }
  }

  private updatePose(): void {
    const fr = this.frame();
    this.deps.onPose(fr.quat);
    // Arrow along the launch direction, lying in the vertical plane of the aim.
    const yaw = Math.atan2(-this.aim.y, this.aim.x);
    const a = (this.angleDeg * Math.PI) / 180;
    this.arrow.position.copy(this.origin);
    this.arrow.rotation.set(0, yaw, a, 'YXZ');
    this.horizon.position.copy(this.origin);
    this.horizon.rotation.set(0, yaw, 0, 'YXZ');
    this.arc.position.copy(this.origin);
    this.arc.rotation.set(0, yaw, 0, 'YXZ');
    const g = new THREE.RingGeometry(0.42, 0.46, 32, 1, Math.min(0, a), Math.max(0.001, Math.abs(a)));
    this.arc.geometry.dispose();
    this.arc.geometry = g;
  }

  private renderPanel(): void {
    const p = this.phase;
    const step = (n: number, label: string, key: AimPhase) =>
      `<div class="aim-step ${p === key ? 'on' : ''} ${(['angle', 'tilt', 'swipe'] as AimPhase[]).indexOf(key) < (['angle', 'tilt', 'swipe'] as AimPhase[]).indexOf(p) ? 'done' : ''}"><b>${n}</b>${label}</div>`;
    let body = '';
    if (p === 'angle') {
      body = `<div class="aim-value">${this.angleDeg}<small>°</small></div>
        <div class="aim-hint">上下にドラッグして<b>投げる角度</b>を決めよう</div>
        <div class="aim-buttons"><button class="btn round" data-act="minus">−</button><button class="btn round" data-act="plus">＋</button><button class="btn primary" data-act="next">つぎへ ▶</button></div>`;
    } else if (p === 'tilt') {
      const t = this.tiltDeg;
      const curve = Math.abs(t) < 4 ? 'まっすぐ' : t > 0 ? '右へカーブ' : '左へカーブ';
      body = `<div class="aim-value">${t > 0 ? '右' : t < 0 ? '左' : ''}${Math.abs(t)}<small>°</small></div>
        <div class="aim-hint">左右にドラッグして<b>ディスクの傾き</b>を決めよう（${curve}）</div>
        <div class="aim-buttons"><button class="btn" data-act="back">◀ もどる</button><button class="btn round" data-act="minus">◀</button><button class="btn round" data-act="plus">▶</button><button class="btn primary" data-act="next">つぎへ ▶</button></div>`;
    } else {
      body = `<div class="aim-row"><button class="btn small" data-act="back">◀</button><div><div class="aim-hint big">ディスクを<b>スワイプ</b>して投げよう！</div>
        <div class="aim-hint">速さ＝パワー ／ 中心からズラすほど回転アップ</div></div></div>`;
    }
    this.panel.innerHTML = `<div class="aim-steps">${step(1, '角度', 'angle')}${step(2, '傾き', 'tilt')}${step(3, 'スワイプ', 'swipe')}</div>${body}`;
    this.panel.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.action((b as HTMLElement).dataset.act!);
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
  }

  private action(act: string): void {
    if (!this.active) return;
    if (act === 'next') {
      this.deps.sfx('click');
      this.setPhase(this.phase === 'angle' ? 'tilt' : 'swipe');
    } else if (act === 'back') {
      this.deps.sfx('back');
      this.setPhase(this.phase === 'swipe' ? 'tilt' : 'angle');
    } else if (act === 'plus' || act === 'minus') {
      const d = act === 'plus' ? 1 : -1;
      if (this.phase === 'angle') this.setAngle(this.angleDeg + d);
      else if (this.phase === 'tilt') this.setTilt(this.tiltDeg + d * 2);
    }
  }

  private setAngle(v: number): void {
    const nv = Math.round(THREE.MathUtils.clamp(v, ANGLE_MIN, ANGLE_MAX));
    if (nv !== this.angleDeg) {
      this.angleDeg = nv;
      this.deps.sfx('tick');
      this.updatePose();
      this.renderPanelValue();
    }
  }

  private setTilt(v: number): void {
    const nv = Math.round(THREE.MathUtils.clamp(v, -TILT_MAX, TILT_MAX));
    if (nv !== this.tiltDeg) {
      this.tiltDeg = nv;
      this.deps.sfx('tick');
      this.updatePose();
      this.renderPanelValue();
      this.applyCamera(0);
    }
  }

  private renderPanelValue(): void {
    const v = this.panel.querySelector('.aim-value');
    const h = this.panel.querySelectorAll('.aim-hint')[0];
    if (!v) return;
    if (this.phase === 'angle') {
      v.innerHTML = `${this.angleDeg}<small>°</small>`;
    } else if (this.phase === 'tilt') {
      const t = this.tiltDeg;
      v.innerHTML = `${t > 0 ? '右' : t < 0 ? '左' : ''}${Math.abs(t)}<small>°</small>`;
      const curve = Math.abs(t) < 4 ? 'まっすぐ' : t > 0 ? '右へカーブ' : '左へカーブ';
      if (h) h.innerHTML = `左右にドラッグして<b>ディスクの傾き</b>を決めよう（${curve}）`;
    }
  }

  private key(e: KeyboardEvent): void {
    if (!this.active) return;
    if (e.key === 'ArrowUp' && this.phase === 'angle') this.setAngle(this.angleDeg + 1);
    else if (e.key === 'ArrowDown' && this.phase === 'angle') this.setAngle(this.angleDeg - 1);
    else if (e.key === 'ArrowRight' && this.phase === 'tilt') this.setTilt(this.tiltDeg + 2);
    else if (e.key === 'ArrowLeft' && this.phase === 'tilt') this.setTilt(this.tiltDeg - 2);
    else if (e.key === 'Enter' || e.key === ' ') {
      if (this.phase !== 'swipe') this.action('next');
    } else if (e.key === 'Backspace' || e.key === 'Escape') {
      if (this.phase !== 'angle') this.action('back');
    } else return;
    e.preventDefault();
  }

  private down(e: PointerEvent): void {
    if (!this.active || e.button > 0) return;
    this.dragging = true;
    this.pointerType = e.pointerType || 'mouse';
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.phase === 'swipe') {
      this.swipePts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      this.swipeFade = null;
      this.livePower = 0;
    }
  }

  private move(e: PointerEvent): void {
    if (!this.active || !this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (this.phase === 'angle') {
      this.accum += -dy * 0.22 + 0 * dx;
      const steps = Math.trunc(this.accum);
      if (steps !== 0) {
        this.accum -= steps;
        this.setAngle(this.angleDeg + steps);
      }
    } else if (this.phase === 'tilt') {
      this.accum += dx * 0.3;
      const steps = Math.trunc(this.accum);
      if (steps !== 0) {
        this.accum -= steps;
        this.setTilt(this.tiltDeg + steps);
      }
    } else {
      const pts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const p of pts.length ? pts : [e]) this.swipePts.push({ x: p.clientX, y: p.clientY, t: p.timeStamp || performance.now() });
      if (this.swipePts.length > 400) this.swipePts.splice(0, this.swipePts.length - 400);
      this.livePower = this.measurePower(this.swipePts).power;
      this.updatePreview();
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }
  private accum = 0;
  /** Diagnostics for the most recent swipe (inspected by automated tests). */
  lastSwipe: { pts: number[][]; dd: number; offset: number; closest: number } | null = null;

  private up(e: PointerEvent): void {
    if (!this.active || !this.dragging) return;
    this.dragging = false;
    this.accum = 0;
    if (this.phase !== 'swipe') return;
    this.swipePts.push({ x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() });
    this.previewLine.visible = false;
    this.resolveSwipe();
  }

  /** Projects a screen point onto the horizontal plane at the disc height. */
  private toPlane(x: number, y: number): THREE.Vector3 | null {
    const cam = this.deps.rig.camera;
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.origin.y);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out);
  }

  private toScreen(p: THREE.Vector3): [number, number] {
    const v = p.clone().project(this.deps.rig.camera);
    return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
  }

  /** Converts screen samples to points on the disc's horizontal plane. */
  private toSamples(pts: Pt[]): SwipeSample[] {
    const out: SwipeSample[] = [];
    for (const p of pts) {
      const w = this.toPlane(p.x, p.y);
      if (w) out.push({ x: w.x, z: w.z, t: p.t });
    }
    return out;
  }

  private fullSpeed(): number {
    return (this.pointerType === 'touch' ? 21 : 13) / this.deps.sensitivity();
  }

  private measurePower(pts: Pt[]): { power: number; dd: number } {
    let start = pts.length - 1;
    while (start > 0 && pts[pts.length - 1].t - pts[start - 1].t < 700) start--;
    const dd = swipeSpeed(this.toSamples(pts.slice(start)), VISUAL_R);
    return { power: powerFromSpeed(dd, this.fullSpeed()), dd };
  }

  private updatePreview(): void {
    const pts = this.swipePts;
    if (pts.length < 3) return;
    const a = this.toPlane(pts[Math.max(0, pts.length - 6)].x, pts[Math.max(0, pts.length - 6)].y);
    const b = this.toPlane(pts[pts.length - 1].x, pts[pts.length - 1].y);
    if (!a || !b) return;
    const d = b.clone().sub(a).setY(0);
    if (d.lengthSq() < 1e-6) return;
    d.normalize();
    this.previewLine.visible = true;
    this.previewLine.position.copy(this.aimLine.position).add(new THREE.Vector3(0, 0.005, 0));
    this.previewLine.rotation.set(0, Math.atan2(d.x, d.z) + Math.PI, 0);
    this.previewLine.scale.set(1.2, 1, 10);
    this.deps.onAimPreview?.(d.x, d.z);
  }

  private resolveSwipe(): void {
    const pts = this.swipePts;
    this.swipePts = [];
    if (pts.length < 2 || !this.disc) return;
    const c = this.origin;
    const a = analyzeSwipe(this.toSamples(pts), c.x, c.z, VISUAL_R, this.fullSpeed());
    this.lastSwipe = { pts: pts.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.t)]), dd: a.dd, offset: a.offset, closest: 0 };
    if (a.reason === 'tap') return;
    if (!a.ok) {
      this.deps.sfx('back');
      this.swipeFade = { pts, until: performance.now() + 900, color: '#ff5a5a' };
      this.deps.onMiss(a.reason === 'miss' ? 'ディスクの上をなぞるようにスワイプしよう！' : 'もっと素早くシュッとスワイプ！');
      return;
    }
    const dt = this.disc;
    const speed = dt.minSpeed + (dt.maxSpeed - dt.minSpeed) * Math.pow(a.power, 1.15);
    const spin = a.spinSign * dt.maxAdvance * a.spinFactor * (speed / PHYS_R);
    const sA = this.toScreen(new THREE.Vector3(a.footX, c.y, a.footZ));
    const sC = this.toScreen(c);
    this.swipeFade = {
      pts,
      until: performance.now() + 1100,
      offset: [
        { x: sC[0], y: sC[1], t: 0 },
        { x: sA[0], y: sA[1], t: 0 },
      ],
      label: `${Math.round(Math.abs(spin) * 9.549)} rpm`,
      color: '#ffffff',
    };
    this.deps.sfx('swipe');
    this.deps.onThrow({
      hx: a.dirX,
      hz: a.dirZ,
      angle: (this.angleDeg * Math.PI) / 180,
      tilt: (this.tiltDeg * Math.PI) / 180,
      speed,
      spin,
      power: a.power,
      spinFactor: a.spinFactor,
      grazed: a.grazed,
    });
  }

  private drawOverlay(): void {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    if (this.active && this.phase === 'angle') {
      // Angle label next to the arc.
      const a = (this.angleDeg * Math.PI) / 180;
      const fwd = new THREE.Vector3(this.aim.x, 0, this.aim.y);
      const p = this.origin.clone().addScaledVector(fwd, Math.cos(a / 2) * 0.62).add(new THREE.Vector3(0, Math.sin(a / 2) * 0.62, 0));
      const [x, y] = this.toScreen(p);
      label(ctx, `${this.angleDeg}°`, x + 18, y, 22);
    }
    if (this.active && this.phase === 'tilt') {
      const [cx, cy] = this.toScreen(this.origin);
      const R = Math.min(w, h) * 0.32;
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.arc(cx, cy, R, Math.PI + 0.35, -0.35);
      ctx.stroke();
      for (let d = -60; d <= 60; d += 15) {
        const ang = -Math.PI / 2 + (d * Math.PI) / 180;
        const inner = d % 30 === 0 ? R - 16 : R - 9;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
        ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
        ctx.stroke();
      }
      const ang = -Math.PI / 2 + (this.tiltDeg * Math.PI) / 180;
      ctx.strokeStyle = '#ff4f6d';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (R - 26), cy + Math.sin(ang) * (R - 26));
      ctx.lineTo(cx + Math.cos(ang) * (R + 8), cy + Math.sin(ang) * (R + 8));
      ctx.stroke();
      // Level line through the disc, rotated by the tilt.
      const t = (this.tiltDeg * Math.PI) / 180;
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.9, cy);
      ctx.lineTo(cx + R * 0.9, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,79,109,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(t) * R * 0.75, cy - Math.sin(t) * R * 0.75);
      ctx.lineTo(cx + Math.cos(t) * R * 0.75, cy + Math.sin(t) * R * 0.75);
      ctx.stroke();
      label(ctx, 'L', cx - R - 6, cy - 14, 18);
      label(ctx, 'R', cx + R + 6, cy - 14, 18);
      // Curve hint.
      if (Math.abs(this.tiltDeg) >= 4) {
        const dirS = this.tiltDeg > 0 ? 1 : -1;
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(cx, cy - R * 0.45);
        ctx.quadraticCurveTo(cx, cy - R * 0.85, cx + dirS * R * 0.42, cy - R * 0.95);
        ctx.stroke();
        const ex = cx + dirS * R * 0.42;
        const ey = cy - R * 0.95;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(ex + dirS * 14, ey);
        ctx.lineTo(ex - dirS * 4, ey - 10);
        ctx.lineTo(ex - dirS * 4, ey + 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (this.active && this.phase === 'swipe') {
      const [cx, cy] = this.toScreen(this.origin);
      const edge = this.toScreen(this.origin.clone().add(new THREE.Vector3(VISUAL_R, 0, 0)));
      const edge2 = this.toScreen(this.origin.clone().add(new THREE.Vector3(0, 0, VISUAL_R)));
      const r = Math.max(Math.hypot(edge[0] - cx, edge[1] - cy), Math.hypot(edge2[0] - cx, edge2[1] - cy));
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(now / 300);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Live swipe trail + power gauge.
      if (this.swipePts.length > 1) {
        drawTrail(ctx, this.swipePts, '#ffffff', 1);
        gauge(ctx, w, h, this.livePower);
      }
    }
    if (this.swipeFade && now < this.swipeFade.until) {
      const k = (this.swipeFade.until - now) / 1000;
      drawTrail(ctx, this.swipeFade.pts, this.swipeFade.color, Math.min(1, k * 1.5));
      if (this.swipeFade.offset) {
        const [a, b] = this.swipeFade.offset;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
        if (this.swipeFade.label) label(ctx, this.swipeFade.label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 22, 18, Math.min(1, k * 1.5));
      }
    } else if (this.swipeFade && now >= this.swipeFade.until) {
      this.swipeFade = null;
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.deps.canvas.removeEventListener('pointerdown', this.boundDown);
    window.removeEventListener('pointermove', this.boundMove);
    window.removeEventListener('pointerup', this.boundUp);
    window.removeEventListener('pointercancel', this.boundUp);
    window.removeEventListener('keydown', this.boundKey);
    this.overlay.remove();
    this.panel.remove();
    this.scene.remove(this.helpers);
  }
}

function drawTrail(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const t = i / pts.length;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 + t * 9;
    ctx.globalAlpha = alpha * (0.25 + 0.75 * t);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function gauge(ctx: CanvasRenderingContext2D, w: number, h: number, p: number): void {
  const gw = Math.min(260, w * 0.6);
  const x = (w - gw) / 2;
  const y = h * 0.14;
  ctx.save();
  ctx.fillStyle = 'rgba(40,20,60,0.55)';
  roundRect(ctx, x - 4, y - 4, gw + 8, 22, 11);
  ctx.fill();
  const grad = ctx.createLinearGradient(x, 0, x + gw, 0);
  grad.addColorStop(0, '#6be36b');
  grad.addColorStop(0.6, '#ffd23f');
  grad.addColorStop(1, '#ff4f5e');
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, Math.max(14, gw * p), 14, 7);
  ctx.fill();
  ctx.restore();
  label(ctx, `POWER ${Math.round(p * 100)}%`, w / 2, y + 36, 16);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px "Fredoka", "M PLUS Rounded 1c", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(42,33,64,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function dashTexture(color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(2, 0, 12, 36);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 14);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
