import * as THREE from 'three';
import { leafSprite, puffSprite, sparkSprite, squareSprite, starSprite } from '../render/textures';
import type { ParticleKind } from './fxTypes';

interface P {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grav: number;
  drag: number;
  size: number;
  grow: number;
  spin: number;
  active: boolean;
}

/** Pooled sprite particles. */
export class Particles {
  private pool: P[] = [];
  private mats = new Map<ParticleKind, THREE.SpriteMaterial>();
  private root = new THREE.Group();

  constructor(scene: THREE.Scene, size = 260) {
    scene.add(this.root);
    const tex: Record<ParticleKind, THREE.Texture> = {
      sparkle: sparkSprite(),
      dust: puffSprite(),
      leaf: leafSprite(),
      splash: puffSprite(),
      confetti: squareSprite(),
      star: starSprite(),
      cloud: puffSprite(),
    };
    for (const k of Object.keys(tex) as ParticleKind[]) {
      this.mats.set(k, new THREE.SpriteMaterial({ map: tex[k], transparent: true, depthWrite: false, fog: true }));
    }
    for (let i = 0; i < size; i++) {
      const s = new THREE.Sprite(this.mats.get('sparkle')!.clone());
      s.visible = false;
      s.renderOrder = 6;
      this.root.add(s);
      this.pool.push({ sprite: s, vel: new THREE.Vector3(), life: 0, max: 1, grav: 0, drag: 0, size: 1, grow: 0, spin: 0, active: false });
    }
  }

  burst(kind: ParticleKind, pos: THREE.Vector3, count: number, color = 0xffffff, speed = 3): void {
    const src = this.mats.get(kind)!;
    for (let i = 0; i < count; i++) {
      const p = this.pool.find((q) => !q.active);
      if (!p) return;
      p.active = true;
      const m = p.sprite.material as THREE.SpriteMaterial;
      m.map = src.map;
      m.color.setHex(color);
      if (kind === 'confetti') m.color.setHSL(Math.random(), 0.85, 0.6);
      m.opacity = 1;
      m.rotation = Math.random() * Math.PI * 2;
      p.sprite.visible = true;
      p.sprite.position.copy(pos);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      p.vel.copy(dir).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.life = 0;
      p.spin = (Math.random() - 0.5) * 8;
      switch (kind) {
        case 'sparkle':
          p.max = 0.5 + Math.random() * 0.3;
          p.grav = 2;
          p.drag = 3;
          p.size = 0.35 + Math.random() * 0.25;
          p.grow = -0.4;
          break;
        case 'star':
          p.max = 0.8 + Math.random() * 0.4;
          p.grav = 6;
          p.drag = 1.5;
          p.size = 0.35 + Math.random() * 0.3;
          p.grow = -0.2;
          break;
        case 'dust':
          p.max = 0.7 + Math.random() * 0.4;
          p.grav = -0.6;
          p.drag = 4;
          p.size = 0.3 + Math.random() * 0.3;
          p.grow = 1.2;
          m.opacity = 0.75;
          break;
        case 'cloud':
          p.max = 1 + Math.random() * 0.5;
          p.grav = -0.3;
          p.drag = 3;
          p.size = 0.6 + Math.random() * 0.4;
          p.grow = 1;
          break;
        case 'leaf':
          p.max = 1.4 + Math.random() * 0.8;
          p.grav = 2.2;
          p.drag = 2.5;
          p.size = 0.25 + Math.random() * 0.15;
          p.grow = 0;
          m.color.offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.15);
          break;
        case 'splash':
          p.max = 0.8 + Math.random() * 0.4;
          p.grav = 12;
          p.drag = 0.5;
          p.size = 0.25 + Math.random() * 0.25;
          p.grow = 0.6;
          p.vel.y = Math.abs(p.vel.y) * 2 + 2;
          m.color.setHex(Math.random() < 0.5 ? 0xffffff : 0xbfeaff);
          break;
        case 'confetti':
          p.max = 2.2 + Math.random();
          p.grav = 3;
          p.drag = 1.8;
          p.size = 0.16 + Math.random() * 0.1;
          p.grow = 0;
          p.vel.y = Math.abs(p.vel.y) * 1.6 + 2;
          break;
      }
      p.sprite.scale.setScalar(p.size);
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.sprite.position.addScaledVector(p.vel, dt);
      const m = p.sprite.material as THREE.SpriteMaterial;
      m.rotation += p.spin * dt;
      const t = p.life / p.max;
      m.opacity = t < 0.7 ? m.opacity : Math.max(0, (1 - t) / 0.3);
      const s = Math.max(0.01, p.size * (1 + p.grow * t));
      p.sprite.scale.setScalar(s);
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.sprite.visible = false;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    for (const p of this.pool) (p.sprite.material as THREE.Material).dispose();
    this.mats.forEach((m) => m.dispose());
  }
}
