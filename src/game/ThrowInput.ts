import * as THREE from 'three';
import type { DiscType } from '../data/discs';
import { launchFrame } from '../physics/launch';
import type { CameraRig } from './CameraRig';
import { analyzePull, type PullAnalysis } from './swipe';

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
  /** 0..1 how far from the centre the launch line passed */
  spinFactor: number;
  grazed: boolean;
}

export interface ThrowInputDeps {
  rig: CameraRig;
  canvas: HTMLCanvasElement;
  layer: HTMLElement;
  sensitivity: () => number;
  onThrow: (r: ThrowResult) => void;
  onMiss: (reason: string) => void;
  onAimPreview?: (hx: number, hz: number) => void;
  sfx: (name: 'click' | 'tick' | 'swipe' | 'back') => void;
  /** Whether to show the animated gesture hints (first throws). */
  hints: () => boolean;
  /** Moves the preview disc back while it is being pulled (world offset). */
  onPull: (dx: number, dz: number) => void;
  /** Disc pose preview: called whenever angle/tilt change. */
  onPose: (quat: [number, number, number, number]) => void;
}

const ANGLE_MIN = -60;
const ANGLE_MAX = 85;
const DEFAULT_ANGLE = 10;
/** Drawn disc size relative to its physical radius (matches DiscView). */
const VISUAL_SCALE = 1.1;

type Mode = 'none' | 'pull' | 'orient';

/** Shortest drag (px) that counts as a pull. */
const MIN_PULL_PX = 14;

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Aiming and throwing from a single view behind the disc.
 * - Two-finger drag (or right-drag / Shift-drag / arrow keys) turns the disc:
 *   vertical = launch angle, horizontal or twisting = tilt (all the way round).
 * - Grabbing the disc with one finger, pulling back and letting go throws it.
 */
export class ThrowInput {
  angleDeg = DEFAULT_ANGLE;
  tiltDeg = 0;
  active = false;

  private origin = new THREE.Vector3();
  private aim = new THREE.Vector2(0, -1);
  private disc: DiscType | null = null;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private panel: HTMLDivElement;
  private sideGauge!: HTMLCanvasElement;
  private backGauge!: HTMLCanvasElement;
  private readout!: HTMLDivElement;
  private helpers = new THREE.Group();
  private arrow: THREE.Group;
  private aimLine: THREE.Mesh;
  private previewLine: THREE.Mesh;
  private pointers = new Map<number, { x: number; y: number }>();
  private mode: Mode = 'none';
  private orientPrev: { cx: number; cy: number; ang: number } | null = null;
  private accA = 0;
  private accT = 0;
  private grab: { sx: number; sy: number; x: number; z: number; cx: number; cy: number } | null = null;
  private pullFade: { until: number; from: [number, number]; to: [number, number]; label: string } | null = null;
  private raf = 0;
  private hintDone = new Set<'orient' | 'pull'>();
  /** Diagnostics for the most recent pull (inspected by automated tests). */
  lastSwipe: { pts: number[][]; dd: number; offset: number } | null = null;
  private boundDown = (e: PointerEvent) => this.down(e);
  private boundMove = (e: PointerEvent) => this.move(e);
  private boundUp = (e: PointerEvent) => this.up(e);
  private boundKey = (e: KeyboardEvent) => this.key(e);
  private boundMenu = (e: Event) => e.preventDefault();

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
    this.buildPanel();

    // Launch arrow along the current throwing direction.
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff4f6d, depthTest: false, transparent: true, opacity: 0.85 });
    this.arrow = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 8), arrowMat);
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.x = 0.5;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 12), arrowMat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.9;
    this.arrow.add(shaft, head);
    shaft.renderOrder = 20;
    head.renderOrder = 20;

    const lineGeo = new THREE.PlaneGeometry(0.12, 1);
    lineGeo.translate(0, 0.5, 0);
    lineGeo.rotateX(-Math.PI / 2);
    this.aimLine = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ map: dashTexture('#ffffff'), transparent: true, depthWrite: false }));
    this.aimLine.renderOrder = 4;
    this.previewLine = new THREE.Mesh(lineGeo.clone(), new THREE.MeshBasicMaterial({ map: dashTexture('#ffd23f'), transparent: true, depthWrite: false }));
    this.previewLine.renderOrder = 4;
    this.helpers.add(this.arrow, this.aimLine, this.previewLine);
    this.helpers.visible = false;
    scene.add(this.helpers);

    deps.canvas.addEventListener('pointerdown', this.boundDown);
    deps.canvas.addEventListener('contextmenu', this.boundMenu);
    window.addEventListener('pointermove', this.boundMove);
    window.addEventListener('pointerup', this.boundUp);
    window.addEventListener('pointercancel', this.boundUp);
    window.addEventListener('keydown', this.boundKey);
    // iOS Safari pinch/rotate gestures would otherwise zoom the page.
    document.addEventListener('gesturestart', this.boundMenu);
    document.addEventListener('gesturechange', this.boundMenu);
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

  private get visualR(): number {
    return (this.disc?.spec.radius ?? 0.1175) * VISUAL_SCALE;
  }

  /** Starts aiming from origin toward aim (horizontal). */
  begin(origin: THREE.Vector3, aim: THREE.Vector2, disc: DiscType, groundY: number): void {
    this.origin.copy(origin);
    this.aim.copy(aim).normalize();
    this.disc = disc;
    this.active = true;
    this.helpers.visible = true;
    this.mode = 'none';
    this.pointers.clear();
    const yaw = Math.atan2(this.aim.x, this.aim.y);
    this.aimLine.position.set(origin.x, groundY + 0.04, origin.z);
    this.aimLine.rotation.set(0, yaw + Math.PI, 0);
    this.aimLine.scale.set(1, 1, 14);
    this.previewLine.visible = false;
    this.applyCamera(0.9);
    this.updatePose();
    this.panel.classList.remove('hidden');
  }

  setDisc(disc: DiscType): void {
    this.disc = disc;
  }

  end(): void {
    this.active = false;
    this.helpers.visible = false;
    this.panel.classList.add('hidden');
    this.cancelPull();
    this.mode = 'none';
    this.pointers.clear();
  }

  private frame() {
    return launchFrame(this.aim.x, this.aim.y, (this.angleDeg * Math.PI) / 180, (this.tiltDeg * Math.PI) / 180);
  }

  /** Camera a little behind and above the disc, looking down the throwing line. */
  private applyCamera(dur: number): void {
    const o = this.origin;
    const fwd = new THREE.Vector3(this.aim.x, 0, this.aim.y);
    const portrait = window.innerHeight > window.innerWidth;
    // Shallow enough to see down the course, with the disc just above the panel.
    // Close to the disc (room below it to pull back), course ahead in the upper part.
    const fov = portrait ? 78 : 68;
    const back = portrait ? 0.82 : 0.72;
    const up = portrait ? 0.46 : 0.38;
    const pos = o.clone().addScaledVector(fwd, -back).add(new THREE.Vector3(0, up, 0));
    const look = o.clone().addScaledVector(fwd, portrait ? 0.15 : 0.32);
    this.deps.rig.setPose(pos, look, fov, dur);
  }

  private updatePose(): void {
    const fr = this.frame();
    this.deps.onPose(fr.quat);
    const yaw = Math.atan2(-this.aim.y, this.aim.x);
    const a = (this.angleDeg * Math.PI) / 180;
    this.arrow.position.copy(this.origin);
    this.arrow.rotation.set(0, yaw, a, 'YXZ');
    this.drawGauges();
  }

  // ---------------------------------------------------------------- panel

  private buildPanel(): void {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.panel.innerHTML = `<div class="aim-row">
        <canvas class="gauge side" width="112" height="112"></canvas>
        <canvas class="gauge back" width="112" height="112"></canvas>
        <div class="aim-read"></div>
        <button class="btn small" data-act="reset" aria-label="リセット">↺</button>
      </div>
      <div class="aim-help">${
        coarse
          ? '<b>2本指ドラッグ</b>：角度・傾き　<b>ディスクをつかんで引っぱって離す</b>：投げる'
          : '<b>右ドラッグ</b>（Shift＋ドラッグ・矢印キー）：角度と傾き　<b>ディスクを引っぱって離す</b>：投げる'
      }</div>`;
    this.sideGauge = this.panel.querySelector('.gauge.side')!;
    this.backGauge = this.panel.querySelector('.gauge.back')!;
    this.readout = this.panel.querySelector('.aim-read')!;
    this.panel.querySelector('[data-act=reset]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deps.sfx('back');
      this.angleDeg = DEFAULT_ANGLE;
      this.tiltDeg = 0;
      this.updatePose();
    });
    this.panel.querySelector('button')!.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /** Two little dials: the disc seen from the side (angle) and from behind (tilt). */
  private drawGauges(): void {
    const draw = (cv: HTMLCanvasElement, deg: number, title: string, showUp: boolean) => {
      const g = cv.getContext('2d')!;
      const s = cv.width;
      const c = s / 2;
      g.clearRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.strokeStyle = '#2a2140';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(c, c, c - 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.setLineDash([5, 5]);
      g.strokeStyle = 'rgba(42,33,64,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(10, c);
      g.lineTo(s - 10, c);
      g.stroke();
      g.setLineDash([]);
      g.save();
      g.translate(c, c);
      g.rotate((-deg * Math.PI) / 180 * (showUp ? 1 : -1));
      // disc edge-on
      g.fillStyle = '#ff5a2a';
      g.strokeStyle = '#2a2140';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, s * 0.3, s * 0.07, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (showUp) {
        g.strokeStyle = '#ff4f6d';
        g.fillStyle = '#ff4f6d';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(s * 0.12, 0);
        g.lineTo(s * 0.38, 0);
        g.stroke();
        g.beginPath();
        g.moveTo(s * 0.44, 0);
        g.lineTo(s * 0.34, -8);
        g.lineTo(s * 0.34, 8);
        g.closePath();
        g.fill();
      } else {
        // top-face marker so upside-down reads clearly
        g.fillStyle = '#ffd23f';
        g.beginPath();
        g.arc(0, -s * 0.1, 6, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      g.restore();
      g.fillStyle = '#2a2140';
      g.font = '900 18px "M PLUS Rounded 1c", sans-serif';
      g.textAlign = 'center';
      g.fillText(title, c, s - 14);
    };
    if (!this.sideGauge) return;
    draw(this.sideGauge, this.angleDeg, '角度', true);
    draw(this.backGauge, this.tiltDeg, '傾き', false);
    const t = this.tiltDeg;
    const tilt = t === 0 ? '0°' : Math.abs(t) > 150 ? `うら ${180 - Math.abs(t)}°` : `${t > 0 ? '右' : '左'}${Math.abs(t)}°`;
    const curve = Math.abs(t) < 4 ? 'まっすぐ' : Math.abs(t) > 90 ? 'うら投げ！' : t > 0 ? '右へカーブ' : '左へカーブ';
    this.readout.innerHTML = `<div>角度 <b>${this.angleDeg}°</b></div><div>傾き <b>${tilt}</b></div><small>${curve}</small>`;
  }

  private setAngle(v: number): void {
    const nv = Math.round(THREE.MathUtils.clamp(v, ANGLE_MIN, ANGLE_MAX));
    if (nv !== this.angleDeg) {
      if (Math.floor(nv / 5) !== Math.floor(this.angleDeg / 5)) this.deps.sfx('tick');
      this.angleDeg = nv;
      this.updatePose();
    }
  }

  private setTilt(v: number): void {
    const nv = Math.round(wrap180(v));
    if (nv !== this.tiltDeg) {
      if (Math.floor(nv / 5) !== Math.floor(this.tiltDeg / 5)) this.deps.sfx('tick');
      this.tiltDeg = nv;
      this.updatePose();
    }
  }

  private turn(dAngle: number, dTilt: number): void {
    this.accA += dAngle;
    this.accT += dTilt;
    const a = Math.trunc(this.accA);
    const t = Math.trunc(this.accT);
    if (a) {
      this.accA -= a;
      this.setAngle(this.angleDeg + a);
    }
    if (t) {
      this.accT -= t;
      this.setTilt(this.tiltDeg + t);
    }
  }

  private key(e: KeyboardEvent): void {
    if (!this.active) return;
    if (e.key === 'ArrowUp') this.setAngle(this.angleDeg + 1);
    else if (e.key === 'ArrowDown') this.setAngle(this.angleDeg - 1);
    else if (e.key === 'ArrowRight') this.setTilt(this.tiltDeg + 2);
    else if (e.key === 'ArrowLeft') this.setTilt(this.tiltDeg - 2);
    else return;
    this.hintDone.add('orient');
    e.preventDefault();
  }

  // ---------------------------------------------------------------- pointers

  private down(e: PointerEvent): void {
    if (!this.active) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const mouseOrient = e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey || e.altKey);
    if (this.pointers.size >= 2 || mouseOrient) {
      // A second finger turns the gesture into rotating the disc.
      this.mode = 'orient';
      this.cancelPull();
      this.orientPrev = this.pinch();
      this.hintDone.add('orient');
      return;
    }
    if (e.button > 0) return;
    const g = this.toPlane(e.clientX, e.clientY);
    if (!g || Math.hypot(g.x - this.origin.x, g.z - this.origin.z) > this.visualR * 1.35) {
      this.mode = 'none';
      this.deps.onMiss('ディスクをつかんで、うしろに引っぱって離そう！');
      return;
    }
    this.mode = 'pull';
    this.grab = { sx: e.clientX, sy: e.clientY, x: g.x, z: g.z, cx: e.clientX, cy: e.clientY };
    this.pullFade = null;
    this.deps.sfx('tick');
  }

  private cancelPull(): void {
    this.grab = null;
    this.previewLine.visible = false;
    this.deps.onPull(0, 0);
  }

  /** Centroid and finger angle of the active pointers. */
  private pinch(): { cx: number; cy: number; ang: number } {
    const ps = [...this.pointers.values()];
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
    const cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    const ang = ps.length >= 2 ? Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x) : 0;
    return { cx, cy, ang };
  }

  private move(e: PointerEvent): void {
    if (!this.active || !this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.mode === 'orient') {
      const now = this.pinch();
      const prev = this.orientPrev ?? now;
      let twist = now.ang - prev.ang;
      if (twist > Math.PI) twist -= Math.PI * 2;
      if (twist < -Math.PI) twist += Math.PI * 2;
      const k = Math.min(window.innerWidth, window.innerHeight) / 700;
      this.turn((-(now.cy - prev.cy) * 0.3) / k, ((now.cx - prev.cx) * 0.35) / k + (this.pointers.size >= 2 ? (twist * 180) / Math.PI : 0));
      this.orientPrev = now;
    } else if (this.mode === 'pull' && this.grab) {
      this.grab.cx = e.clientX;
      this.grab.cy = e.clientY;
      this.updatePull();
    }
  }

  private up(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (!this.active) return;
    if (this.mode === 'orient') {
      if (this.pointers.size === 0) this.mode = 'none';
      else this.orientPrev = this.pinch();
      return;
    }
    if (this.mode !== 'pull' || !this.grab) return;
    this.mode = 'none';
    this.grab.cx = e.clientX;
    this.grab.cy = e.clientY;
    this.release();
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

  /** Pull length in pixels needed for full power. */
  private fullPull(): number {
    return (Math.min(window.innerWidth, window.innerHeight) * 0.34) / this.deps.sensitivity();
  }

  /** Current pull state: power from the drag length, direction/spin from the geometry. */
  private pullState(): { power: number; a: PullAnalysis } | null {
    const g = this.grab;
    if (!g) return null;
    const r = this.toPlane(g.cx, g.cy);
    if (!r) return null;
    const px = Math.hypot(g.cx - g.sx, g.cy - g.sy);
    const power = THREE.MathUtils.clamp((px - MIN_PULL_PX) / (this.fullPull() - MIN_PULL_PX), 0, 1);
    const a = analyzePull(g.x, g.z, r.x, r.z, this.origin.x, this.origin.z, this.visualR, px < MIN_PULL_PX ? Infinity : 1e-4);
    return { power, a };
  }

  private updatePull(): void {
    const st = this.pullState();
    if (!st || !st.a.ok) {
      this.previewLine.visible = false;
      this.deps.onPull(0, 0);
      return;
    }
    const { a, power } = st;
    // The disc leans back with the pull.
    const back = 0.06 + power * 0.12;
    this.deps.onPull(-a.dirX * back, -a.dirZ * back);
    this.previewLine.visible = true;
    this.previewLine.position.copy(this.aimLine.position).add(new THREE.Vector3(0, 0.005, 0));
    this.previewLine.rotation.set(0, Math.atan2(a.dirX, a.dirZ) + Math.PI, 0);
    this.previewLine.scale.set(1.2, 1, 4 + power * 10);
    this.deps.onAimPreview?.(a.dirX, a.dirZ);
  }

  private release(): void {
    const st = this.pullState();
    const g = this.grab;
    this.cancelPull();
    if (!st || !g || !this.disc) return;
    const { a, power } = st;
    this.lastSwipe = { pts: [[g.sx, g.sy], [g.cx, g.cy]], dd: power, offset: a.offset };
    if (!a.ok) {
      this.deps.sfx('back');
      return; // released without pulling: cancel
    }
    this.hintDone.add('pull');
    const dt = this.disc;
    const speed = dt.minSpeed + (dt.maxSpeed - dt.minSpeed) * Math.pow(power, 1.1);
    const spin = a.spinSign * dt.maxAdvance * a.spinFactor * (speed / dt.spec.radius);
    const c = this.origin;
    this.pullFade = {
      until: performance.now() + 1100,
      from: this.toScreen(c),
      to: this.toScreen(new THREE.Vector3(a.footX, c.y, a.footZ)),
      label: `${Math.round(Math.abs(spin) * 9.549)} rpm`,
    };
    this.deps.sfx('swipe');
    this.deps.onThrow({
      hx: a.dirX,
      hz: a.dirZ,
      angle: (this.angleDeg * Math.PI) / 180,
      tilt: (this.tiltDeg * Math.PI) / 180,
      speed,
      spin,
      power,
      spinFactor: a.spinFactor,
      grazed: false,
    });
  }

  // ---------------------------------------------------------------- overlay

  /** Outline of the disc's hit area on the horizontal plane, in screen space. */
  private hitOutline(scale: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      out.push(this.toScreen(this.origin.clone().add(new THREE.Vector3(Math.cos(a) * this.visualR * scale, 0, Math.sin(a) * this.visualR * scale))));
    }
    return out;
  }

  private drawOverlay(): void {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    if (this.active) {
      const ring = this.hitOutline(1.12);
      ctx.save();
      const pulse = 0.5 + 0.5 * Math.sin(now / 300);
      ctx.strokeStyle = this.mode === 'orient' ? 'rgba(255,210,63,0.95)' : `rgba(255,255,255,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.setLineDash([]);
      const [cx, cy] = this.toScreen(this.origin);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (this.mode === 'orient') {
        label(ctx, `角度 ${this.angleDeg}°　傾き ${this.tiltDeg}°`, w / 2, h * 0.16, 20);
        for (const p of this.pointers.values()) {
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      if (this.mode === 'pull' && this.grab) this.drawPull(ctx, w, h);
      if (this.mode === 'none' && this.deps.hints()) this.drawHint(ctx, now);
    }
    const f = this.pullFade;
    if (f && now < f.until) {
      const k = Math.min(1, ((f.until - now) / 1000) * 1.5);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(f.from[0], f.from[1]);
      ctx.lineTo(f.to[0], f.to[1]);
      ctx.stroke();
      ctx.restore();
      label(ctx, f.label, (f.from[0] + f.to[0]) / 2, (f.from[1] + f.to[1]) / 2 - 24, 18, k);
    } else if (f) {
      this.pullFade = null;
    }
  }

  /** Rubber band from the disc rim to the finger, plus power and spin readouts. */
  private drawPull(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const g = this.grab!;
    const st = this.pullState();
    const [cx, cy] = this.toScreen(this.origin);
    const edge = this.toScreen(this.origin.clone().add(new THREE.Vector3(this.visualR, 0, 0)));
    const r = Math.max(20, Math.hypot(edge[0] - cx, edge[1] - cy));
    const dx = g.cx - cx;
    const dy = g.cy - cy;
    const len = Math.hypot(dx, dy) || 1;
    // Band anchors on the rim, perpendicular to the pull.
    const nx = -dy / len;
    const ny = dx / len;
    const power = st?.power ?? 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = power > 0 ? `hsl(${120 - power * 120}, 85%, 55%)` : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 5 + power * 4;
    ctx.beginPath();
    ctx.moveTo(cx + nx * r, cy + ny * r);
    ctx.lineTo(g.cx, g.cy);
    ctx.lineTo(cx - nx * r, cy - ny * r);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(42,33,64,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    gauge(ctx, w, h, power);
    if (st && st.a.ok) {
      const spinTxt = st.a.spinFactor < 0.08 ? '回転なし' : `${st.a.spinSign > 0 ? '↺' : '↻'} 回転 ${Math.round(st.a.spinFactor * 100)}%`;
      label(ctx, spinTxt, w / 2, h * 0.14 + 62, 16);
    }
  }

  /** Ghost fingers demonstrating the gestures (alternating two-finger turn and pull). */
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const cycle = Math.floor(now / 1700);
    const wantOrient = !this.hintDone.has('orient');
    const wantSwipe = !this.hintDone.has('pull');
    if (!wantOrient && !wantSwipe) return;
    const showOrient = wantOrient && (!wantSwipe || cycle % 2 === 1);
    const t = (now % 1700) / 1700;
    const k = t < 0.15 ? 0 : t > 0.85 ? 1 : (t - 0.15) / 0.7;
    const e = k * k * (3 - 2 * k);
    const alpha = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
    const [cx, cy] = this.toScreen(this.origin);
    const edge = this.toScreen(this.origin.clone().add(new THREE.Vector3(this.visualR, 0, 0)));
    const r = Math.max(30, Math.hypot(edge[0] - cx, edge[1] - cy));
    const fingers: [number, number, number, number][] = showOrient
      ? [
          [cx - r * 1.6, cy - r * 0.2, cx - r * 1.6, cy - r * 1.6],
          [cx + r * 1.6, cy - r * 0.2, cx + r * 1.6, cy - r * 1.6],
        ]
      : [[cx + r * 0.5, cy, cx + r * 0.9, cy + r * 3.2]];
    ctx.save();
    for (const [x0, y0, x1, y1] of fingers) {
      const x = x0 + (x1 - x0) * e;
      const y = y0 + (y1 - y0) * e;
      ctx.globalAlpha = alpha * 0.9;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(42,33,64,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    label(ctx, showOrient ? '2本指で角度・傾き' : 'つかんで引っぱって、はなす！', cx, cy - r * 2.2, 17, alpha);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.deps.canvas.removeEventListener('pointerdown', this.boundDown);
    this.deps.canvas.removeEventListener('contextmenu', this.boundMenu);
    window.removeEventListener('pointermove', this.boundMove);
    window.removeEventListener('pointerup', this.boundUp);
    window.removeEventListener('pointercancel', this.boundUp);
    window.removeEventListener('keydown', this.boundKey);
    document.removeEventListener('gesturestart', this.boundMenu);
    document.removeEventListener('gesturechange', this.boundMenu);
    this.overlay.remove();
    this.panel.remove();
    this.scene.remove(this.helpers);
  }
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
