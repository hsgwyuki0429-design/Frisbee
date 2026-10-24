import * as THREE from 'three';
import type { DiscBody } from '../physics/DiscBody';

type Mode = 'pose' | 'follow' | 'orbit' | 'path';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: Mode = 'pose';
  ground: ((x: number, z: number) => number) | null = null;
  /** Moves a camera point out of foliage toward what it is looking at. */
  unblock: ((cam: THREE.Vector3, target: THREE.Vector3) => THREE.Vector3) | null = null;

  private pos = new THREE.Vector3(0, 5, 10);
  private look = new THREE.Vector3();
  private fov = 55;
  private fromPos = new THREE.Vector3();
  private fromLook = new THREE.Vector3();
  private fromFov = 55;
  private goalPos = new THREE.Vector3();
  private goalLook = new THREE.Vector3();
  private goalFov = 55;
  private tt = 1;
  private dur = 0.6;
  private shakeAmt = 0;
  private shakeT = 0;
  private up = new THREE.Vector3(0, 1, 0);
  private goalUp = new THREE.Vector3(0, 1, 0);
  private fromUp = new THREE.Vector3(0, 1, 0);

  // follow
  private disc: DiscBody | null = null;
  private fdir = new THREE.Vector3(0, 0, -1);
  // orbit
  private orbitCenter = new THREE.Vector3();
  private orbitAngle = 0;
  private orbitRadius = 8;
  private orbitHeight = 4;
  private orbitSpeed = 0.15;
  // path
  private pathPos: THREE.CatmullRomCurve3 | null = null;
  private pathLook: THREE.CatmullRomCurve3 | null = null;
  private pathT = 0;
  private pathDur = 3;
  onPathDone: (() => void) | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.03, 3000);
  }

  get position(): THREE.Vector3 {
    return this.pos;
  }

  get target(): THREE.Vector3 {
    return this.look;
  }

  snap(pos: THREE.Vector3, look: THREE.Vector3, fov = this.fov, up = new THREE.Vector3(0, 1, 0)): void {
    this.mode = 'pose';
    this.pos.copy(pos);
    this.look.copy(look);
    this.fov = fov;
    this.goalPos.copy(pos);
    this.goalLook.copy(look);
    this.goalFov = fov;
    this.up.copy(up);
    this.goalUp.copy(up);
    this.tt = 1;
    this.apply();
  }

  setPose(pos: THREE.Vector3, look: THREE.Vector3, fov = 55, dur = 0.7, up = new THREE.Vector3(0, 1, 0)): void {
    this.mode = 'pose';
    this.fromPos.copy(this.pos);
    this.fromLook.copy(this.look);
    this.fromFov = this.fov;
    this.fromUp.copy(this.up);
    this.goalPos.copy(pos);
    this.goalLook.copy(look);
    this.goalFov = fov;
    this.goalUp.copy(up).normalize();
    this.dur = Math.max(0.001, dur);
    this.tt = dur <= 0 ? 1 : 0;
  }

  /** Updates the goal of the current pose without restarting the transition. */
  retarget(pos: THREE.Vector3, look: THREE.Vector3): void {
    this.goalPos.copy(pos);
    this.goalLook.copy(look);
  }

  follow(disc: DiscBody, dir: THREE.Vector3): void {
    this.mode = 'follow';
    this.disc = disc;
    this.fdir.copy(dir).setY(0).normalize();
    this.goalUp.set(0, 1, 0);
    this.goalFov = 68;
  }

  orbit(center: THREE.Vector3, radius: number, height: number, startAngle: number, speed = 0.15): void {
    this.mode = 'orbit';
    this.orbitCenter.copy(center);
    this.orbitRadius = radius;
    this.orbitHeight = height;
    this.orbitAngle = startAngle;
    this.orbitSpeed = speed;
    this.goalUp.set(0, 1, 0);
    this.goalFov = 64;
  }

  path(points: THREE.Vector3[], looks: THREE.Vector3[], duration: number, onDone?: () => void): void {
    this.mode = 'path';
    this.pathPos = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.pathLook = new THREE.CatmullRomCurve3(looks, false, 'centripetal');
    this.pathT = 0;
    this.pathDur = duration;
    this.onPathDone = onDone ?? null;
    this.goalUp.set(0, 1, 0);
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(1, this.shakeAmt + amount);
  }

  update(dt: number): void {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    switch (this.mode) {
      case 'pose': {
        if (this.tt < 1) {
          this.tt = Math.min(1, this.tt + dt / this.dur);
          const e = ease(this.tt);
          this.pos.lerpVectors(this.fromPos, this.goalPos, e);
          this.look.lerpVectors(this.fromLook, this.goalLook, e);
          this.fov = this.fromFov + (this.goalFov - this.fromFov) * e;
          this.up.lerpVectors(this.fromUp, this.goalUp, e).normalize();
        } else {
          this.pos.lerp(this.goalPos, k(12));
          this.look.lerp(this.goalLook, k(12));
          this.up.lerp(this.goalUp, k(12)).normalize();
        }
        break;
      }
      case 'follow': {
        const d = this.disc!;
        const v = new THREE.Vector3(d.vx, 0, d.vz);
        const sp = Math.hypot(d.vx, d.vy, d.vz);
        if (v.lengthSq() > 0.5) this.fdir.lerp(v.normalize(), k(sp > 4 ? 2.2 : 0.6)).normalize();
        const discPos = new THREE.Vector3(d.x, d.y, d.z);
        // Close behind the frisbee so its wobble and curve are easy to follow.
        const dist = 1.9 + Math.min(sp, 20) * 0.08;
        const height = 0.75 + Math.min(sp, 20) * 0.03;
        this.goalPos.copy(discPos).addScaledVector(this.fdir, -dist);
        this.goalPos.y += height;
        if (this.ground) this.goalPos.y = Math.max(this.goalPos.y, this.ground(this.goalPos.x, this.goalPos.z) + 0.6);
        if (this.unblock) this.goalPos.copy(this.unblock(this.goalPos, discPos));
        this.goalLook.copy(discPos).addScaledVector(this.fdir, 1.6);
        this.pos.lerp(this.goalPos, k(4.5));
        this.look.lerp(this.goalLook, k(9));
        this.fov += (this.goalFov - this.fov) * k(2);
        this.up.lerp(this.goalUp, k(6)).normalize();
        break;
      }
      case 'orbit': {
        this.orbitAngle += this.orbitSpeed * dt;
        this.goalPos.set(
          this.orbitCenter.x + Math.cos(this.orbitAngle) * this.orbitRadius,
          this.orbitCenter.y + this.orbitHeight,
          this.orbitCenter.z + Math.sin(this.orbitAngle) * this.orbitRadius,
        );
        if (this.ground) this.goalPos.y = Math.max(this.goalPos.y, this.ground(this.goalPos.x, this.goalPos.z) + 1.5);
        this.goalLook.copy(this.orbitCenter);
        this.pos.lerp(this.goalPos, k(2.5));
        this.look.lerp(this.goalLook, k(4));
        this.fov += (this.goalFov - this.fov) * k(2);
        this.up.lerp(this.goalUp, k(6)).normalize();
        break;
      }
      case 'path': {
        this.pathT = Math.min(1, this.pathT + dt / this.pathDur);
        const e = ease(this.pathT);
        this.pathPos!.getPoint(e, this.pos);
        this.pathLook!.getPoint(e, this.look);
        this.up.lerp(this.goalUp, k(6)).normalize();
        if (this.pathT >= 1) {
          const cb = this.onPathDone;
          this.onPathDone = null;
          this.mode = 'pose';
          this.goalPos.copy(this.pos);
          this.goalLook.copy(this.look);
          this.tt = 1;
          cb?.();
        }
        break;
      }
    }
    this.apply(dt);
  }

  private apply(dt = 0): void {
    const cam = this.camera;
    cam.position.copy(this.pos);
    if (this.shakeAmt > 0.001) {
      this.shakeT += dt * 40;
      const a = this.shakeAmt * 0.12;
      cam.position.x += Math.sin(this.shakeT * 1.3) * a;
      cam.position.y += Math.sin(this.shakeT * 1.7 + 1) * a;
      this.shakeAmt *= Math.exp(-dt * 5);
    }
    cam.up.copy(this.up);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
