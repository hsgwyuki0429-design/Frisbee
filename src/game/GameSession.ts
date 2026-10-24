import * as THREE from 'three';
import { audio, type TrackName } from '../audio/Audio';
import { DISC_TYPES, discById, type DiscType } from '../data/discs';
import { skinById } from '../data/skins';
import { DISTANCE_FIELD_HALF } from '../data/stages';
import type { StageDef } from '../data/types';
import { DiscBody } from '../physics/DiscBody';
import { applyLaunch } from '../physics/launch';
import { PhysicsWorld, type PhysEvent } from '../physics/PhysicsWorld';
import { save, update as updateSave, type Settings } from '../save';
import type { Hud } from '../ui/Hud';
import { vibrate } from '../ui/dom';
import { puffSprite } from '../render/textures';
import { Level } from '../world/Level';
import { mulberry32 } from '../world/noise';
import { CameraRig } from './CameraRig';
import { DiscView } from './DiscView';
import type { FXHub, ParticleKind, PopupStyle, SfxName } from './fxTypes';
import { Particles } from './Particles';
import { ThrowInput, type ThrowResult } from './ThrowInput';

export type SessionMode = 'course' | 'distance' | 'target' | 'rings' | 'practice' | 'demo';

export interface SessionConfig {
  mode: SessionMode;
  stages: StageDef[];
  worldId?: string;
  /** Hole number of the first stage (for labels). */
  firstHoleNumber?: number;
}

export interface HoleScore {
  id: string;
  name: string;
  par: number;
  strokes: number;
  coins: number;
}

export interface StageResult {
  hole: HoleScore;
  index: number;
  count: number;
  scoreName: string;
  diff: number;
  best: number | null;
  newBest: boolean;
}

export interface SessionResult {
  mode: SessionMode;
  worldId?: string;
  holes: HoleScore[];
  coins: number;
  score: number;
  best: number;
  newRecord: boolean;
  medal: 0 | 1 | 2 | 3;
  lines: string[];
  unit: string;
}

export interface SessionHost {
  scene: THREE.Scene;
  onStageLoaded(): void;
  canvas: HTMLCanvasElement;
  hud: Hud;
  settings(): Settings;
  onPause(): void;
  onStageResult(r: StageResult, next: () => void): void;
  onSessionEnd(r: SessionResult): void;
}

type State = 'intro' | 'aim' | 'flight' | 'settle' | 'holed' | 'done';

const PHYS_DT = 1 / 360;
const MAX_STROKES = 10;
const RELEASE_H = 1.0;

export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'ホールインワン！！';
  const d = strokes - par;
  if (d <= -3) return 'アルバトロス！';
  if (d === -2) return 'イーグル！';
  if (d === -1) return 'バーディー！';
  if (d === 0) return 'パー';
  if (d === 1) return 'ボギー';
  if (d === 2) return 'ダブルボギー';
  if (d === 3) return 'トリプルボギー';
  return `+${d}`;
}

export class GameSession implements FXHub {
  readonly rig: CameraRig;
  private world: PhysicsWorld;
  private disc: DiscBody;
  private discType: DiscType;
  private view: DiscView;
  private level: Level | null = null;
  private particles: Particles;
  private input: ThrowInput | null = null;
  private state: State = 'intro';
  private stageIdx = 0;
  private stage!: StageDef;
  private paused = false;
  private acc = 0;
  private timeScale = 1;
  private fastForward = false;
  private stateTimer = 0;
  private holdTimer = 0;
  private pendingEnd: { reason: 'water' | 'ob'; t: number } | null = null;

  // Per stage.
  private strokes = 0;
  private lie: [number, number] = [0, 0];
  private prevLie: [number, number] = [0, 0];
  private stageCoins = 0;
  private holeScores: HoleScore[] = [];
  private sessionCoins = 0;

  // Per throw.
  private origin = new THREE.Vector3();
  private lastThrow: ThrowResult | null = null;
  private maxHeight = 0;
  private flightPath: THREE.Vector3[] = [];
  private ghost: THREE.Points | null = null;
  private landed = false;
  private manualDisc = false;

  // Challenge state.
  private throwsDone = 0;
  private scoreTotal = 0;
  private bestThrow = 0;
  private targetIdx = 0;
  private ringsPassed = new Set<string>();
  private practiceFromTee = true;
  private rnd = mulberry32(Date.now() & 0xffff);
  private hudTimer = 0;

  constructor(
    private host: SessionHost,
    readonly config: SessionConfig,
  ) {
    const s = save();
    this.discType = discById(config.mode === 'distance' ? 'driver' : s.lastDisc);
    this.disc = new DiscBody(this.discType.spec);
    this.world = new PhysicsWorld(this.disc);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.view = new DiscView(host.scene, skinById(s.skin));
    this.view.setRadius(this.discType.spec.radius);
    this.particles = new Particles(host.scene);
    const hud = host.hud;
    if (config.mode !== 'demo') {
      this.input = new ThrowInput(host.scene, {
        rig: this.rig,
        canvas: host.canvas,
        layer: hud.aimLayer,
        sensitivity: () => host.settings().sensitivity,
        onThrow: (r) => this.launch(r),
        onMiss: (msg) => {
          hud.toast(msg, 1800);
          audio.play('miss');
        },
        onAimPreview: (hx, hz) => this.drawMap([hx, hz]),
        sfx: (n) => audio.play(n),
        hints: () => save().stats.throws < 3,
        onPose: (q) => this.posePreview(q),
        onPull: (dx, dz) => {
          this.pullOffset.set(dx, 0, dz);
          this.view.sync(this.disc, this.level!.groundY(this.origin.x, this.origin.z));
          this.view.root.position.add(this.pullOffset);
        },
      });
      hud.onPause = () => this.host.onPause();
      hud.onSkip = () => {
        if (this.state === 'flight') {
          this.fastForward = true;
          hud.showSkip(false);
        }
      };
      hud.onPickDisc = (d) => this.pickDisc(d, true);
      hud.show(true);
      hud.clear();
      hud.setCoins(s.coins);
    }
    window.addEventListener('pointerdown', this.onTap);
    this.loadStage(0);
  }

  private onTap = (e: PointerEvent) => {
    if (this.paused) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (this.state === 'intro') this.finishIntro();
  };

  get mode(): SessionMode {
    return this.config.mode;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) audio.flight(0);
  }

  // ------------------------------------------------------------------ FXHub

  sfx(name: SfxName, opts?: { vol?: number; rate?: number }): void {
    if (this.config.mode === 'demo') return;
    audio.play(name, opts);
  }

  burst(kind: ParticleKind, pos: THREE.Vector3, count: number, color?: number, speed?: number): void {
    const q = this.host.settings().quality;
    const n = q === 'low' ? Math.ceil(count / 2) : count;
    this.particles.burst(kind, pos, n, color, speed);
  }

  popup(text: string, pos: THREE.Vector3, style: PopupStyle = 'info'): void {
    if (this.config.mode === 'demo') return;
    const v = pos.clone().project(this.rig.camera);
    if (v.z > 1) return;
    this.host.hud.popup(text, ((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight, style);
  }

  shake(amount: number): void {
    this.rig.shake(amount);
  }

  // ------------------------------------------------------------------ stages

  private trackFor(def: StageDef): TrackName {
    if (this.config.mode === 'demo') return 'title';
    if (this.config.mode === 'distance' || this.config.mode === 'target' || this.config.mode === 'rings') return 'challenge';
    return def.theme;
  }

  private loadStage(i: number): void {
    const host = this.host;
    this.level?.dispose(host.scene);
    this.particles.clear();
    this.stageIdx = i;
    this.stage = this.config.stages[i];
    const st = host.settings();
    const holeNo = (this.config.firstHoleNumber ?? 1) + i;
    this.level = new Level(host.scene, this.stage, {
      quality: st.quality,
      shadows: st.quality !== 'low',
      shadowSize: st.quality === 'high' ? 2048 : 1024,
      holeLabel: this.config.mode === 'course' ? `HOLE ${holeNo}` : this.stage.name,
    });
    this.level.attach(this.world);
    this.rig.ground = (x, z) => this.level!.groundY(x, z);
    this.rig.unblock = (cam, target) => this.level!.cameraSafe(cam, target);
    audio.music(this.trackFor(this.stage));

    // Wind.
    const [w0, w1] = this.stage.wind;
    const ws = w0 + (w1 - w0) * this.rnd();
    const wd = this.stage.windDir ?? this.rnd() * Math.PI * 2;
    this.disc.wind.x = Math.sin(wd) * ws;
    this.disc.wind.z = -Math.cos(wd) * ws;

    this.strokes = 0;
    this.stageCoins = 0;
    this.lie = [this.stage.tee[0], this.stage.tee[1]];
    this.prevLie = [...this.lie];
    this.throwsDone = 0;
    this.scoreTotal = 0;
    this.bestThrow = 0;
    this.targetIdx = 0;
    this.ringsPassed.clear();
    this.manualDisc = false;
    this.clearGhost();
    this.view.trailClear();

    if (this.config.mode !== 'demo') {
      const map = this.level.renderMinimap(220);
      host.hud.setMap(map.canvas, map.toMap);
      host.hud.clear();
      host.hud.showMap(true);
    }
    this.placeDiscAtLie();
    this.startIntro();
    if (i > 0) this.host.onStageLoaded();
  }

  private startIntro(): void {
    this.state = 'intro';
    const lv = this.level!;
    const tee = lv.teePos;
    const goal = this.goalPoint();
    const dir = goal.clone().sub(tee).setY(0);
    const len = Math.max(10, dir.length());
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const mid = tee.clone().lerp(goal, 0.5);
    const pts = [
      goal.clone().addScaledVector(side, 9).add(new THREE.Vector3(0, 6, 0)).addScaledVector(dir, 6),
      mid.clone().addScaledVector(side, -10).add(new THREE.Vector3(0, 10 + len * 0.08, 0)),
      tee.clone().addScaledVector(dir, -7).add(new THREE.Vector3(0, 3.2, 0)),
    ];
    for (let k = 0; k < pts.length; k++) pts[k] = lv.clearance(pts[k], 1.5);
    const looks = [goal.clone().add(new THREE.Vector3(0, 1, 0)), mid.clone(), tee.clone().addScaledVector(dir, 12)];
    const dur = this.config.mode === 'demo' ? 6 : Math.min(4.5, 2.4 + len / 60);
    this.rig.snap(pts[0], looks[0], 64);
    this.rig.path(pts, looks, dur, () => this.finishIntro());

    if (this.config.mode === 'demo') return;
    const hud = this.host.hud;
    const holeNo = (this.config.firstHoleNumber ?? 1) + this.stageIdx;
    const ws = Math.hypot(this.disc.wind.x, this.disc.wind.z);
    let title = this.stage.name;
    let sub = '';
    if (this.config.mode === 'course') {
      title = `HOLE ${holeNo}`;
      sub = `${this.stage.name}<br>PAR ${this.stage.par} ・ ${Math.round(len)}m ・ 風 ${ws.toFixed(1)}m/s`;
    } else if (this.config.mode === 'distance') {
      sub = '3回投げて最長記録をねらえ！';
    } else if (this.config.mode === 'target') {
      sub = '5つのまとを順番にねらおう！';
    } else if (this.config.mode === 'rings') {
      sub = '3投でリングをできるだけくぐろう！';
    } else if (this.config.mode === 'practice') {
      sub = '自由に投げて練習しよう';
    }
    hud.banner(title, sub + '<div class="tap-hint">タップでスキップ</div>', 'intro', 0);
    this.updateHud();
    this.drawMap(null);
  }

  private finishIntro(): void {
    if (this.state !== 'intro') return;
    this.host.hud.hideBanner();
    if (!save().tutorialDone && this.config.mode === 'course') {
      this.host.hud.toast('<b>2本指ドラッグ</b>で角度と傾き → ディスクを<b>つかんで引っぱって離す</b>と飛ぶよ！', 5200);
      updateSave((d) => (d.tutorialDone = true));
    }
    this.beginAim();
  }

  private goalPoint(): THREE.Vector3 {
    const lv = this.level!;
    if (this.config.mode === 'target' && lv.targets.length) return lv.targets[Math.min(this.targetIdx, lv.targets.length - 1)].pos.clone();
    if (lv.basketPos) return lv.basketPos.clone();
    if (this.config.mode === 'rings') {
      const next = lv.rings.find((r) => !this.ringsPassed.has(r.trigger.id));
      if (next) return next.group.position.clone();
    }
    if (lv.extraBaskets.length) return lv.extraBaskets[0].pos.clone();
    return lv.teePos.clone().add(new THREE.Vector3(0, 0, -60));
  }

  private placeDiscAtLie(): void {
    const lv = this.level!;
    const [x, z] = lv.freeSpot(this.lie[0], this.lie[1]);
    this.lie = [x, z];
    const y = lv.groundY(x, z) + RELEASE_H;
    this.origin.set(x, y, z);
    this.disc.setPosition(x, y, z);
    this.disc.setVelocity(0, 0, 0);
    this.disc.setAngularVelocity(0, 0, 0);
    this.world.sleeping = true;
  }

  private aimDir(): THREE.Vector2 {
    const g = this.goalPoint();
    const v = new THREE.Vector2(g.x - this.origin.x, g.z - this.origin.z);
    if (v.lengthSq() < 0.01) v.set(0, -1);
    return v.normalize();
  }

  private beginAim(): void {
    this.state = 'aim';
    this.placeDiscAtLie();
    this.view.setVisible(true);
    this.view.trailClear();
    const lv = this.level!;
    if (this.config.mode === 'demo') {
      this.stateTimer = 0.8;
      this.rig.setPose(
        this.origin.clone().add(new THREE.Vector3(this.aimDir().x * -5, 2.5, this.aimDir().y * -5)),
        this.origin.clone().add(new THREE.Vector3(this.aimDir().x * 10, 0, this.aimDir().y * 10)),
        55,
        1.2,
      );
      return;
    }
    // Suggest a disc for the distance unless the player picked one this hole.
    const dist = this.goalPoint().setY(0).distanceTo(this.origin.clone().setY(0));
    if (!this.manualDisc && this.config.mode !== 'distance') {
      const id = dist < 12 ? 'putter' : dist < 36 ? 'midrange' : 'driver';
      this.pickDisc(discById(id), false);
    }
    this.input!.begin(this.origin, this.aimDir(), this.discType, lv.groundY(this.origin.x, this.origin.z));
    this.host.hud.showPicker(true, this.discType.id);
    this.updateHud();
    this.drawMap(null);
  }

  private pullOffset = new THREE.Vector3();

  private posePreview(q: [number, number, number, number]): void {
    this.disc.setPosition(this.origin.x, this.origin.y, this.origin.z);
    this.disc.setOrientation(q[0], q[1], q[2], q[3]);
    this.view.sync(this.disc, this.level!.groundY(this.origin.x, this.origin.z));
    this.view.root.position.add(this.pullOffset);
  }

  private pickDisc(d: DiscType, manual: boolean): void {
    if (d.id === this.discType.id) {
      this.host.hud.showPicker(true, d.id);
      return;
    }
    this.discType = d;
    if (manual) {
      this.manualDisc = true;
      audio.play('select');
      updateSave((s) => (s.lastDisc = d.id));
    }
    // Rebuild the body with the new spec but keep the pose.
    const old = this.disc;
    const nd = new DiscBody(d.spec);
    nd.s.set(old.s);
    nd.wind.x = old.wind.x;
    nd.wind.z = old.wind.z;
    nd.refresh();
    this.disc = nd;
    const w = new PhysicsWorld(nd);
    this.world = w;
    this.level!.attach(w);
    this.input?.setDisc(d);
    this.view.setRadius(d.spec.radius);
    this.host.hud.showPicker(this.config.mode !== 'demo', d.id);
    if (manual) this.host.hud.toast(`${d.name}：${d.description}`, 2000);
  }

  // ------------------------------------------------------------------ throwing

  private launch(r: ThrowResult): void {
    if (this.state !== 'aim') return;
    this.input?.end();
    this.lastThrow = r;
    applyLaunch(this.disc, this.origin.x, this.origin.y, this.origin.z, r);
    this.world.launch();
    this.level!.resetThrow();
    this.prevLie = [...this.lie];
    this.strokes++;
    this.throwsDone++;
    this.state = 'flight';
    this.landed = false;
    this.holdTimer = 0;
    this.pendingEnd = null;
    this.fastForward = false;
    this.timeScale = 1;
    this.acc = 0;
    this.maxHeight = this.origin.y;
    this.flightPath = [this.origin.clone()];
    this.clearGhost();
    this.rig.follow(this.disc, new THREE.Vector3(r.hx, 0, r.hz));
    updateSave((s) => s.stats.throws++);
    if (this.config.mode !== 'demo') {
      const hud = this.host.hud;
      hud.showPicker(false);
      hud.showSkip(true);
      const rpm = Math.round(Math.abs(r.spin) * 9.549);
      const dir = r.spin > 0.5 ? '左回り' : r.spin < -0.5 ? '右回り' : '回転なし';
      hud.toast(
        `<b>${r.speed.toFixed(1)}</b>m/s ・ 回転 <b>${rpm}</b>rpm（${dir}）${r.grazed ? ' ・ <span class="warn">かすった！</span>' : ''}${
          Math.abs(r.spin) < 15 ? '<br><span class="warn">回転が少ない！ディスクの端をなぞろう</span>' : ''
        }`,
        2600,
      );
      audio.play('throw');
      if (this.host.settings().vibration) vibrate(15);
      this.updateHud();
    }
  }

  private endThrow(reason: 'rest' | 'water' | 'ob' | 'basket'): void {
    if (this.state !== 'flight') return;
    this.state = 'settle';
    this.fastForward = false;
    this.timeScale = 1;
    audio.flight(0);
    const hud = this.host.hud;
    hud.showSkip(false);
    hud.setFlight(null);
    this.saveGhost();
    const restPos = new THREE.Vector3(this.disc.x, this.disc.y, this.disc.z);
    const thrown = Math.hypot(restPos.x - this.origin.x, restPos.z - this.origin.z);
    if (reason !== 'water' && reason !== 'ob') updateSave((s) => (s.stats.longest = Math.max(s.stats.longest, thrown)));
    const center = reason === 'basket' && this.basketPosFor() ? this.basketPosFor()! : restPos;
    this.rig.orbit(center, 2.4, 1.1, this.clearOrbitAngle(center, Math.atan2(this.origin.z - restPos.z, this.origin.x - restPos.x)), 0.25);
    this.stateTimer = 1.6;

    switch (this.config.mode) {
      case 'demo':
        this.stateTimer = 2.5;
        this.lie = [this.stage.tee[0], this.stage.tee[1]];
        break;
      case 'course':
        this.endCourseThrow(reason, thrown);
        break;
      case 'practice':
        this.endPracticeThrow(reason, thrown);
        break;
      case 'distance':
        this.endDistanceThrow(reason, restPos);
        break;
      case 'target':
        this.endTargetThrow(reason, restPos);
        break;
      case 'rings':
        this.endRingThrow(reason);
        break;
    }
  }

  /** Orbit start angle near `preferred` from which nothing hides the target. */
  private clearOrbitAngle(center: THREE.Vector3, preferred: number): number {
    const lv = this.level!;
    for (let i = 0; i < 12; i++) {
      const a = preferred + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
      const cam = new THREE.Vector3(center.x + Math.cos(a) * 2.4, center.y + 1.1, center.z + Math.sin(a) * 2.4);
      if (!lv.lineBlocked(cam, center.clone().add(new THREE.Vector3(0, 0.2, 0)))) return a;
    }
    return preferred;
  }

  private basketPosFor(): THREE.Vector3 | null {
    const lv = this.level!;
    if (lv.basketPos) return lv.basketPos;
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const b of lv.extraBaskets) {
      const d = Math.hypot(b.pos.x - this.disc.x, b.pos.z - this.disc.z);
      if (d < bd) {
        bd = d;
        best = b.pos;
      }
    }
    return best;
  }

  private obMessage(reason: 'water' | 'ob'): void {
    const hud = this.host.hud;
    hud.banner(reason === 'water' ? 'ポチャン！' : 'OB！', this.config.mode === 'course' ? '+1 ペナルティ' : 'もとの位置から', 'bad', 1800);
    audio.play('ob');
  }

  private endCourseThrow(reason: 'rest' | 'water' | 'ob' | 'basket', thrown: number): void {
    const hud = this.host.hud;
    if (reason === 'basket') {
      this.holeOut();
      return;
    }
    if (reason === 'water' || reason === 'ob') {
      this.strokes++;
      this.lie = [...this.prevLie];
      this.obMessage(reason);
      this.stateTimer = 2.0;
    } else {
      this.lie = [this.disc.x, this.disc.z];
      const remain = this.basketDist();
      hud.banner(`${thrown.toFixed(1)}m`, `のこり ${remain.toFixed(1)}m`, 'small', 1500);
    }
    if (this.strokes >= MAX_STROKES) {
      this.strokes = MAX_STROKES;
      hud.banner('ギブアップ', `${MAX_STROKES}打で終了`, 'bad', 2000);
      this.state = 'holed';
      this.stateTimer = 2.2;
    }
    this.updateHud();
  }

  private holeOut(): void {
    const hud = this.host.hud;
    const par = this.stage.par ?? 3;
    const name = scoreName(this.strokes, par);
    const diff = this.strokes - par;
    const style = this.strokes === 1 ? 'gold' : diff < 0 ? 'good' : diff === 0 ? 'par' : 'meh';
    hud.banner(name, diff === 0 ? '' : diff > 0 ? `+${diff}` : `${diff}`, `score ${style}`, 2400);
    audio.play(this.strokes === 1 || diff <= -2 ? 'holeIn' : diff <= 0 ? 'fanfare' : 'star');
    const bp = this.level!.basketPos!;
    this.burst('confetti', bp.clone().add(new THREE.Vector3(0, 1.6, 0)), diff <= 0 ? 60 : 24, 0xffffff, 7);
    this.burst('star', bp.clone().add(new THREE.Vector3(0, 1.4, 0)), 16, 0xffe14a, 5);
    if (this.host.settings().vibration) vibrate([30, 40, 30]);
    this.state = 'holed';
    this.stateTimer = 2.6;
    this.updateHud();
  }

  private finishHole(): void {
    const par = this.stage.par ?? 3;
    const id = this.stage.id;
    const prev = save().holeBest[id] ?? null;
    const newBest = prev === null || this.strokes < prev;
    updateSave((s) => {
      if (newBest) s.holeBest[id] = this.strokes;
      s.stats.holes++;
      if (this.strokes === 1) s.stats.holeInOnes++;
    });
    const hole: HoleScore = { id, name: this.stage.name, par, strokes: this.strokes, coins: this.stageCoins };
    this.holeScores.push(hole);
    const res: StageResult = {
      hole,
      index: this.stageIdx,
      count: this.config.stages.length,
      scoreName: scoreName(this.strokes, par),
      diff: this.strokes - par,
      best: prev,
      newBest,
    };
    this.state = 'done';
    this.host.onStageResult(res, () => {
      if (this.stageIdx + 1 < this.config.stages.length) this.loadStage(this.stageIdx + 1);
      else this.finishCourse();
    });
  }

  private finishCourse(): void {
    const total = this.holeScores.reduce((a, h) => a + h.strokes, 0);
    const par = this.holeScores.reduce((a, h) => a + h.par, 0);
    const wid = this.config.worldId ?? 'all';
    const prev = save().worldBest[wid] ?? Infinity;
    const newRecord = total < prev;
    updateSave((s) => {
      if (newRecord) s.worldBest[wid] = total;
      if (!s.worldsCleared.includes(wid)) s.worldsCleared.push(wid);
    });
    const diff = total - par;
    const medal: 0 | 1 | 2 | 3 = diff <= -2 ? 3 : diff <= 0 ? 2 : diff <= 3 ? 1 : 0;
    this.host.onSessionEnd({
      mode: 'course',
      worldId: wid,
      holes: this.holeScores,
      coins: this.sessionCoins,
      score: total,
      best: Math.min(prev, total),
      newRecord,
      medal,
      lines: [],
      unit: '打',
    });
  }

  private endPracticeThrow(reason: 'rest' | 'water' | 'ob' | 'basket', thrown: number): void {
    const hud = this.host.hud;
    const r = this.lastThrow!;
    if (reason === 'basket') {
      hud.banner('IN！', `${thrown.toFixed(1)}m`, 'score good', 1800);
      audio.play('fanfare');
      const bp = this.basketPosFor();
      if (bp) this.burst('confetti', bp.clone().add(new THREE.Vector3(0, 1.6, 0)), 40, 0xffffff, 6);
    } else if (reason === 'water' || reason === 'ob') {
      this.obMessage(reason);
    } else {
      hud.banner(`${thrown.toFixed(1)}m`, '', 'small', 1400);
    }
    this.lie = this.practiceFromTee || reason !== 'rest' ? [this.stage.tee[0], this.stage.tee[1]] : [this.disc.x, this.disc.z];
    const rows = [
      ['初速', `${r.speed.toFixed(1)} m/s`],
      ['パワー', `${Math.round(r.power * 100)}%`],
      ['回転', `${Math.round(Math.abs(r.spin) * 9.549)} rpm ${r.spin > 0.5 ? '↺' : r.spin < -0.5 ? '↻' : ''}`],
      ['角度', `${Math.round((r.angle * 180) / Math.PI)}°`],
      ['傾き', `${Math.round((r.tilt * 180) / Math.PI)}°`],
      ['飛距離', reason === 'rest' || reason === 'basket' ? `${thrown.toFixed(1)} m` : '—'],
      ['最高点', `${(this.maxHeight - this.origin.y + RELEASE_H).toFixed(1)} m`],
      ['滞空', `${this.world.flightTime.toFixed(1)} 秒`],
    ];
    this.showPracticePanel(rows);
    this.stateTimer = 1.8;
  }

  private showPracticePanel(rows: string[][] | null): void {
    const table = rows
      ? `<div class="stats-card">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`
      : '';
    this.host.hud.setExtra(
      `${table}<button class="btn small toggle-lie">投げる位置：${this.practiceFromTee ? 'ティー' : '落下地点'}</button>`,
      (t) => {
        if (t.closest('.toggle-lie')) {
          this.practiceFromTee = !this.practiceFromTee;
          audio.play('click');
          if (this.practiceFromTee && this.state === 'aim') {
            this.lie = [this.stage.tee[0], this.stage.tee[1]];
            this.input?.end();
            this.beginAim();
          }
          const btn = this.host.hud.root.querySelector('.toggle-lie');
          if (btn) btn.textContent = `投げる位置：${this.practiceFromTee ? 'ティー' : '落下地点'}`;
        }
      },
    );
  }

  private endDistanceThrow(reason: 'rest' | 'water' | 'ob' | 'basket', rest: THREE.Vector3): void {
    const hud = this.host.hud;
    const tee = this.stage.tee;
    const fwd = tee[1] - rest.z;
    const inField = Math.abs(rest.x - tee[0]) < DISTANCE_FIELD_HALF;
    let d = 0;
    if (reason === 'water' || reason === 'ob' || !inField) {
      this.obMessage(reason === 'rest' ? 'ob' : (reason as 'water' | 'ob'));
    } else {
      d = Math.max(0, fwd);
      const isBest = d > this.bestThrow;
      this.bestThrow = Math.max(this.bestThrow, d);
      hud.banner(`${d.toFixed(1)}m`, isBest && this.throwsDone > 1 ? 'ベスト更新！' : '', isBest ? 'score good' : 'small', 1800);
      if (isBest) audio.play('star');
    }
    this.lie = [tee[0], tee[1]];
    this.updateHud();
    if (this.throwsDone >= 3) {
      this.state = 'holed';
      this.stateTimer = 2.2;
    }
  }

  private targetPoints(d: number, r: number): number {
    const k = d / r;
    if (k <= 0.2) return 100;
    if (k <= 0.4) return 70;
    if (k <= 0.6) return 50;
    if (k <= 0.8) return 30;
    if (k <= 1.0) return 10;
    return 0;
  }

  private endTargetThrow(reason: 'rest' | 'water' | 'ob' | 'basket', rest: THREE.Vector3): void {
    const hud = this.host.hud;
    const lv = this.level!;
    const tg = lv.targets[this.targetIdx];
    let pts = 0;
    if (reason === 'water' || reason === 'ob') {
      this.obMessage(reason);
    } else {
      const d = Math.hypot(rest.x - tg.pos.x, rest.z - tg.pos.z);
      pts = this.targetPoints(d, tg.r);
      hud.banner(pts === 100 ? 'ど真ん中！' : pts > 0 ? `${pts}点` : 'ざんねん', `のこり ${d.toFixed(1)}m`, pts >= 70 ? 'score gold' : pts > 0 ? 'score good' : 'meh', 1800);
      audio.play(pts >= 70 ? 'fanfare' : pts > 0 ? 'star' : 'miss');
      if (pts > 0) this.burst('star', tg.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), pts / 5, 0xffe14a, 5);
    }
    this.scoreTotal += pts;
    this.targetIdx++;
    this.lie = [this.stage.tee[0], this.stage.tee[1]];
    this.updateHud();
    if (this.targetIdx >= lv.targets.length) {
      this.state = 'holed';
      this.stateTimer = 2.2;
    }
  }

  private endRingThrow(reason: 'rest' | 'water' | 'ob' | 'basket'): void {
    const lv = this.level!;
    if (reason === 'water' || reason === 'ob') {
      this.obMessage(reason);
      this.lie = [...this.prevLie];
    } else {
      this.lie = [this.disc.x, this.disc.z];
      this.host.hud.banner(`${this.ringsPassed.size} / ${lv.rings.length}`, 'リング', 'small', 1500);
    }
    this.updateHud();
    if (this.throwsDone >= 3 || this.ringsPassed.size >= lv.rings.length) {
      this.state = 'holed';
      this.stateTimer = 2.2;
    }
  }

  private finishChallenge(): void {
    const mode = this.config.mode as 'distance' | 'target' | 'rings';
    let score = 0;
    let medal: 0 | 1 | 2 | 3 = 0;
    let unit = '';
    const lines: string[] = [];
    if (mode === 'distance') {
      score = Math.round(this.bestThrow * 10) / 10;
      medal = score >= 45 ? 3 : score >= 35 ? 2 : score >= 25 ? 1 : 0;
      unit = 'm';
      lines.push('🥉 25m　🥈 35m　🥇 45m');
    } else if (mode === 'target') {
      score = this.scoreTotal;
      medal = score >= 350 ? 3 : score >= 250 ? 2 : score >= 150 ? 1 : 0;
      unit = '点';
      lines.push('🥉 150点　🥈 250点　🥇 350点');
    } else {
      score = this.ringsPassed.size;
      medal = score >= 10 ? 3 : score >= 7 ? 2 : score >= 4 ? 1 : 0;
      unit = 'こ';
      lines.push('🥉 4こ　🥈 7こ　🥇 10こ');
    }
    const prev = save().challenge[mode];
    const newRecord = score > prev;
    updateSave((s) => {
      if (newRecord) s.challenge[mode] = score;
    });
    const bonus = medal * 10;
    if (bonus) {
      updateSave((s) => {
        s.coins += bonus;
        s.totalCoinsEarned += bonus;
      });
      lines.push(`メダルボーナス +${bonus} コイン`);
    }
    this.state = 'done';
    this.host.onSessionEnd({ mode, holes: [], coins: this.sessionCoins + bonus, score, best: Math.max(prev, score), newRecord, medal, lines, unit });
  }

  // ------------------------------------------------------------------ loop

  update(dt: number): void {
    if (this.paused) return;
    const lv = this.level;
    if (!lv) return;
    switch (this.state) {
      case 'aim':
        if (this.config.mode === 'demo') {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) this.demoThrow();
        }
        break;
      case 'flight':
        this.stepFlight(dt);
        break;
      case 'settle':
        this.stateTimer -= dt;
        this.view.trailFade(dt);
        if (this.stateTimer <= 0) {
          this.host.hud.hideBanner();
          this.beginAim();
        }
        break;
      case 'holed':
        this.stateTimer -= dt;
        this.view.trailFade(dt);
        if (this.stateTimer <= 0) {
          if (this.config.mode === 'course') this.finishHole();
          else this.finishChallenge();
        }
        break;
      default:
        break;
    }
    if (this.state !== 'aim' && this.state !== 'intro') this.view.sync(this.disc, lv.groundY(this.disc.x, this.disc.z));
    this.view.setDistanceScale(this.state === 'flight' || this.state === 'settle' || this.state === 'holed' ? this.rig.camera.position.distanceTo(new THREE.Vector3(this.disc.x, this.disc.y, this.disc.z)) : null);
    this.rig.update(dt);
    const focus = this.state === 'aim' || this.state === 'intro' ? this.rig.target : new THREE.Vector3(this.disc.x, this.disc.y, this.disc.z);
    lv.env.focus(focus);
    lv.update(dt, this.rig.camera);
    this.particles.update(dt);
    if (this.config.mode !== 'demo') this.updateWindHud();
  }

  private stepFlight(dt: number): void {
    const lv = this.level!;
    const disc = this.disc;
    // Slow motion near the basket.
    let target = this.fastForward ? 4 : 1;
    if (!this.fastForward && this.host.settings().slowmo && this.config.mode !== 'demo') {
      const bp = this.basketPosFor();
      if (bp) {
        const dx = bp.x - disc.x;
        const dz = bp.z - disc.z;
        const d = Math.hypot(dx, dz);
        const closing = (disc.vx * dx + disc.vz * dz) / Math.max(0.01, d);
        if (d < 4.5 && closing > 3 && disc.y - bp.y < 3.5) target = 0.38;
      }
    }
    this.timeScale += (target - this.timeScale) * Math.min(1, dt * 8);
    this.acc += Math.min(0.05, dt) * this.timeScale;
    let steps = 0;
    while (this.acc >= PHYS_DT && steps < 400) {
      this.acc -= PHYS_DT;
      steps++;
      this.world.step(PHYS_DT);
      if (this.world.events.length) this.processEvents();
      if (this.state !== 'flight') return;
      // Basket catch.
      if (lv.basketHolding(disc) && disc.speed() < 2.2) {
        this.holdTimer += PHYS_DT;
        if (this.holdTimer > 0.25) {
          this.endThrow('basket');
          return;
        }
      } else {
        this.holdTimer = 0;
      }
      if (this.pendingEnd) {
        this.pendingEnd.t -= PHYS_DT;
        if (this.pendingEnd.t <= 0) {
          this.endThrow(this.pendingEnd.reason);
          return;
        }
      }
    }
    this.maxHeight = Math.max(this.maxHeight, disc.y);
    const p = new THREE.Vector3(disc.x, disc.y, disc.z);
    const lastP = this.flightPath[this.flightPath.length - 1];
    if (!lastP || lastP.distanceToSquared(p) > 0.6) this.flightPath.push(p);
    if (!this.world.touchedGround) this.view.trailPush(disc);
    else this.view.trailFade(dt * 2);
    const sp = disc.speed();
    this.hudTimer -= dt;
    if (this.config.mode !== 'demo' && this.hudTimer <= 0) {
      this.hudTimer = 0.08;
      audio.flight(this.world.touchedGround ? Math.min(sp, 6) : sp);
      const h = disc.y - lv.groundY(disc.x, disc.z);
      const d = Math.hypot(disc.x - this.origin.x, disc.z - this.origin.z);
      this.host.hud.setFlight(`<b>${sp.toFixed(1)}</b>m/s　高さ <b>${Math.max(0, h).toFixed(1)}</b>m　<b>${d.toFixed(1)}</b>m`);
      this.updateDist();
      this.drawMap(null);
    }
  }

  private processEvents(): void {
    const lv = this.level!;
    const evs = this.world.events.splice(0);
    for (const e of evs) {
      this.handleEvent(e, lv);
      if (this.state !== 'flight') return;
    }
  }

  private handleEvent(e: PhysEvent, lv: Level): void {
    const r = lv.handleEvent(e, this.disc, this);
    if (r.coins > 0 && this.config.mode !== 'demo') {
      this.stageCoins += r.coins;
      this.sessionCoins += r.coins;
      updateSave((s) => {
        s.coins += r.coins;
        s.totalCoinsEarned += r.coins;
      });
      this.host.hud.setCoins(save().coins);
    }
    if (e.type === 'trigger' && this.config.mode === 'rings' && e.trigger.kind === 'ring') {
      if (!this.ringsPassed.has(e.trigger.id)) {
        this.ringsPassed.add(e.trigger.id);
        this.updateHud();
      }
    }
    if (r.boost > 0) {
      const s = this.disc.s;
      const sp = Math.hypot(s[3], s[4], s[5]);
      const k = Math.min(r.boost, 38 / Math.max(1, sp));
      s[3] *= k;
      s[4] *= k;
      s[5] *= k;
      // Keep the advance ratio: spin up too.
      s[10] *= k;
      s[11] *= k;
      s[12] *= k;
      this.disc.refresh();
    }
    switch (e.type) {
      case 'impact':
        if (!this.landed && e.tag === 'ground') this.landed = true;
        if (e.speed > 6 && this.host.settings().vibration && this.config.mode !== 'demo') vibrate(12);
        if (e.speed > 7) this.rig.shake(Math.min(0.3, e.speed * 0.02));
        break;
      case 'water':
        if (!this.pendingEnd) this.pendingEnd = { reason: 'water', t: 1.1 };
        break;
      case 'fell':
        this.endThrow('ob');
        break;
      case 'rest':
        this.endThrow(lv.basketHolding(this.disc) ? 'basket' : 'rest');
        break;
      default:
        break;
    }
  }

  private demoThrow(): void {
    const g = this.goalPoint();
    const D = Math.hypot(g.x - this.origin.x, g.z - this.origin.z);
    const dt = DISC_TYPES[D < 12 ? 0 : D < 36 ? 1 : 2];
    if (dt.id !== this.discType.id) this.pickDisc(dt, false);
    const aim = this.aimDir();
    const jitter = (this.rnd() - 0.5) * 0.12;
    const hx = aim.x * Math.cos(jitter) - aim.y * Math.sin(jitter);
    const hz = aim.x * Math.sin(jitter) + aim.y * Math.cos(jitter);
    const speed = Math.min(dt.maxSpeed, 4 + Math.sqrt(D) * 1.7);
    const res: ThrowResult = {
      hx,
      hz,
      angle: THREE.MathUtils.degToRad(8 + this.rnd() * 6),
      tilt: THREE.MathUtils.degToRad((this.rnd() - 0.5) * 16),
      speed,
      spin: -0.5 * (speed / dt.spec.radius),
      power: 0.7,
      spinFactor: 0.8,
      grazed: false,
    };
    this.launch(res);
  }

  // ------------------------------------------------------------------ HUD

  private basketDist(): number {
    const g = this.goalPoint();
    return Math.hypot(g.x - this.disc.x, g.z - this.disc.z);
  }

  private updateDist(): void {
    const hud = this.host.hud;
    const mode = this.config.mode;
    if (mode === 'course' || mode === 'target' || (mode === 'practice' && this.state === 'aim')) {
      const p = this.state === 'aim' ? this.origin : new THREE.Vector3(this.disc.x, 0, this.disc.z);
      const g = this.goalPoint();
      const d = Math.hypot(g.x - p.x, g.z - p.z);
      hud.setDist(`<small>${mode === 'target' ? 'まとまで' : mode === 'practice' ? 'バスケットまで' : 'のこり'}</small><b>${d.toFixed(1)}</b>m`);
    } else if (mode === 'distance') {
      const d = this.state === 'flight' ? Math.max(0, this.stage.tee[1] - this.disc.z) : this.bestThrow;
      hud.setDist(`<small>${this.state === 'flight' ? 'きょり' : 'ベスト'}</small><b>${d.toFixed(1)}</b>m`);
    } else {
      hud.setDist('');
    }
  }

  private updateHud(): void {
    if (this.config.mode === 'demo') return;
    const hud = this.host.hud;
    const mode = this.config.mode;
    const holeNo = (this.config.firstHoleNumber ?? 1) + this.stageIdx;
    if (mode === 'course') {
      hud.setInfo({
        title: `HOLE ${holeNo} <span>/ PAR ${this.stage.par}</span>`,
        sub: this.stage.name,
        strokes: this.state === 'aim' ? `${this.strokes + 1}打目` : `${this.strokes}打`,
        dist: '',
      });
    } else if (mode === 'distance') {
      hud.setInfo({ title: 'ロングドライブ', sub: `ベスト ${save().challenge.distance.toFixed(1)}m`, strokes: `${Math.min(3, this.throwsDone + (this.state === 'aim' ? 1 : 0))} / 3 投`, dist: '' });
    } else if (mode === 'target') {
      hud.setInfo({ title: 'まとあて', sub: `スコア ${this.scoreTotal}点`, strokes: `まと ${Math.min(5, this.targetIdx + 1)} / 5`, dist: '' });
    } else if (mode === 'rings') {
      hud.setInfo({ title: 'リングくぐり', sub: `リング ${this.ringsPassed.size} / ${this.level!.rings.length}`, strokes: `${Math.min(3, this.throwsDone + (this.state === 'aim' ? 1 : 0))} / 3 投`, dist: '' });
    } else if (mode === 'practice') {
      hud.setInfo({ title: 'れんしゅう', sub: '自由に投げよう', strokes: `${this.throwsDone}投`, dist: '' });
      if (this.throwsDone === 0) this.showPracticePanel(null);
    }
    this.updateDist();
  }

  private updateWindHud(): void {
    const cam = this.rig.camera;
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const w = this.disc.wind;
    const ws = Math.hypot(w.x, w.z);
    const ang = Math.atan2(w.x * r.x + w.z * r.z, w.x * f.x + w.z * f.z);
    this.host.hud.setWind(ang, ws);
  }

  private drawMap(preview: [number, number] | null): void {
    if (this.config.mode === 'demo') return;
    const hud = this.host.hud;
    const trail = this.flightPath.map((p): [number, number] => [p.x, p.z]);
    if (this.state === 'aim') {
      const a = this.aimDir();
      hud.drawMap([this.origin.x, this.origin.z], [this.origin.x, this.origin.z], preview ?? [a.x, a.y], this.ghostPath);
    } else {
      hud.drawMap([this.disc.x, this.disc.z], null, null, trail);
    }
  }

  private ghostPath: [number, number][] = [];

  private saveGhost(): void {
    this.ghostPath = this.flightPath.map((p): [number, number] => [p.x, p.z]);
    if (!this.host.settings().ghost || this.config.mode === 'demo' || this.flightPath.length < 2) return;
    const pts: THREE.Vector3[] = [];
    const curve = this.flightPath;
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i];
      const b = curve[i + 1];
      const n = Math.max(1, Math.round(a.distanceTo(b) / 0.8));
      for (let k = 0; k < n; k++) pts.push(a.clone().lerp(b, k / n));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, map: puffSprite(), transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true });
    this.ghost = new THREE.Points(geo, mat);
    this.ghost.renderOrder = 4;
    this.host.scene.add(this.ghost);
  }

  private clearGhost(): void {
    if (this.ghost) {
      this.host.scene.remove(this.ghost);
      this.ghost.geometry.dispose();
      (this.ghost.material as THREE.Material).dispose();
      this.ghost = null;
    }
  }

  // ------------------------------------------------------------------ control

  restartStage(): void {
    if (this.config.mode === 'course') {
      this.holeScores = this.holeScores.slice(0, this.stageIdx);
    }
    this.input?.end();
    audio.flight(0);
    this.loadStage(this.stageIdx);
  }

  setSkin(id: string): void {
    this.view.setSkin(skinById(id));
  }

  resize(): void {
    this.rig.resize(window.innerWidth / window.innerHeight);
    this.input?.resize();
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.onTap);
    audio.flight(0);
    this.input?.dispose();
    this.clearGhost();
    this.level?.dispose(this.host.scene);
    this.level = null;
    this.view.dispose(this.host.scene);
    this.particles.dispose(this.host.scene);
    if (this.config.mode !== 'demo') {
      this.host.hud.clear();
      this.host.hud.show(false);
    }
  }
}
