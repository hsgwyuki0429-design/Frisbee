import { describe, expect, it } from 'vitest';
import { DISC_TYPES, discById } from '../src/data/discs';
import { createBasketPhysics } from '../src/physics/basket';
import { BoxCollider, CylinderCollider, EllipsoidCollider } from '../src/physics/Colliders';
import { DiscBody } from '../src/physics/DiscBody';
import { Heightfield } from '../src/physics/Heightfield';
import { applyLaunch, launchFrame } from '../src/physics/launch';
import { MATERIALS } from '../src/physics/materials';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';

const DT = 1 / 360;

function world(discId = 'midrange') {
  const disc = new DiscBody(discById(discId).spec);
  const w = new PhysicsWorld(disc);
  const hf = new Heightfield(-200, -200, 2, 201, 201);
  hf.mats.fill(1);
  w.terrain = hf;
  return { disc, w };
}

function run(w: PhysicsWorld, seconds: number) {
  const events: string[] = [];
  for (let t = 0; t < seconds && !w.sleeping; t += DT) {
    w.step(DT);
    for (const e of w.events) events.push(e.type);
    w.events.length = 0;
  }
  return events;
}

function throwDisc(id: string, speed: number, angleDeg: number, tiltDeg: number, advance: number, discId = 'midrange') {
  const { disc, w } = world(discId);
  const spec = discById(discId).spec;
  applyLaunch(disc, 0, 1, 0, {
    hx: 0,
    hz: -1,
    angle: (angleDeg * Math.PI) / 180,
    tilt: (tiltDeg * Math.PI) / 180,
    speed,
    spin: (advance * speed) / spec.radius,
  });
  w.launch();
  void id;
  run(w, 30);
  return { x: disc.x, z: disc.z, disc, w };
}

describe('launch frame', () => {
  it('produces an orthonormal frame with zero angle of attack', () => {
    const f = launchFrame(0.6, -0.8, 0.2, 0.3);
    const dot = f.forward[0] * f.normal[0] + f.forward[1] * f.normal[1] + f.forward[2] * f.normal[2];
    expect(Math.abs(dot)).toBeLessThan(1e-9);
    expect(Math.hypot(...f.normal)).toBeCloseTo(1, 9);
    expect(Math.hypot(...f.quat)).toBeCloseTo(1, 9);
  });

  it('positive tilt drops the right edge', () => {
    const f = launchFrame(0, -1, 0, 0.4);
    // heading -z, right is +x, the normal leans toward the lowered side
    expect(f.normal[0]).toBeGreaterThan(0.3);
  });
});

describe('flight', () => {
  it('a well spun midrange throw flies a long way', () => {
    const r = throwDisc('flat', 14, 8, 0, -0.5);
    expect(-r.z).toBeGreaterThan(30);
  });

  it('spin direction mirrors the flight', () => {
    const cw = throwDisc('cw', 14, 8, 0, -0.5);
    const ccw = throwDisc('ccw', 14, 8, 0, 0.5);
    expect(cw.x).toBeCloseTo(-ccw.x, 1);
    expect(cw.z).toBeCloseTo(ccw.z, 1);
  });

  it('bank angle steers the disc', () => {
    const left = throwDisc('l', 14, 8, -20, -0.5);
    const right = throwDisc('r', 14, 8, 20, -0.5);
    expect(left.x).toBeLessThan(-5);
    expect(right.x).toBeGreaterThan(5);
  });

  it('no spin makes the disc tumble and fall short', () => {
    const spun = throwDisc('s', 14, 8, 0, -0.5);
    const flat = throwDisc('n', 14, 8, 0, 0);
    expect(-flat.z).toBeLessThan(-spun.z * 0.5);
  });

  it('driver outflies putter at full power', () => {
    const drv = DISC_TYPES.find((d) => d.id === 'driver')!;
    const put = DISC_TYPES.find((d) => d.id === 'putter')!;
    const a = throwDisc('d', drv.maxSpeed, 9, -5, -0.5, 'driver');
    const b = throwDisc('p', put.maxSpeed, 9, -5, -0.5, 'putter');
    expect(-a.z).toBeGreaterThan(-b.z * 1.15);
  });

  it('headwind shortens the throw', () => {
    const { disc, w } = world();
    disc.wind.z = 4; // blowing toward +z, i.e. into the thrower's face
    applyLaunch(disc, 0, 1, 0, { hx: 0, hz: -1, angle: 0.14, tilt: 0, speed: 14, spin: -60 });
    w.launch();
    run(w, 30);
    const calm = throwDisc('c', 14, 8, 0, (-60 * 0.1175) / 14);
    expect(-disc.z).toBeLessThan(-calm.z);
  });
});

describe('contacts', () => {
  it('comes to rest lying on the ground', () => {
    const { disc, w } = world();
    applyLaunch(disc, 0, 0.5, 0, { hx: 0, hz: -1, angle: 0, tilt: 0, speed: 0.5, spin: 5 });
    w.launch();
    const ev = run(w, 10);
    expect(ev).toContain('rest');
    expect(disc.y).toBeGreaterThan(-0.005);
    expect(disc.y).toBeLessThan(0.05);
    expect(Math.abs(disc.n.y)).toBeGreaterThan(0.95);
  });

  it('does not pass through a tree trunk', () => {
    const { disc, w } = world();
    w.addCollider(new CylinderCollider(0, -10, -1, 6, 0.3, MATERIALS.wood, 'trunk'));
    applyLaunch(disc, 0, 1, 0, { hx: 0, hz: -1, angle: 0.05, tilt: 0, speed: 25, spin: -120 });
    w.launch();
    run(w, 20);
    expect(disc.z).toBeGreaterThan(-10);
  });

  it('does not tunnel through a thin pole at full speed', () => {
    const { disc, w } = world('driver');
    w.addCollider(new CylinderCollider(0.03, -6, -1, 6, 0.03, MATERIALS.metal, 'pole'));
    applyLaunch(disc, 0, 1, 0, { hx: 0, hz: -1, angle: 0, tilt: 0, speed: 30, spin: -140 });
    w.launch();
    run(w, 20);
    expect(disc.z).toBeGreaterThan(-6);
  });

  it('lands and rests on top of a box', () => {
    const { disc, w } = world();
    w.addCollider(new BoxCollider(0, 0.75, 0, 1, 0.75, 1, 0.3, MATERIALS.stone));
    applyLaunch(disc, 0, 2.2, 0, { hx: 0, hz: -1, angle: 0, tilt: 0, speed: 0.3, spin: 3 });
    w.launch();
    run(w, 8);
    expect(disc.y).toBeGreaterThan(1.49);
    expect(disc.y).toBeLessThan(1.56);
  });

  it('bouncy mushrooms launch the disc upward', () => {
    const { disc, w } = world();
    w.addCollider(new EllipsoidCollider(0, 1.5, 0, 2, 1, 2, MATERIALS.bouncy, 'mushroom'));
    applyLaunch(disc, 0.2, 4, 0, { hx: 0, hz: -1, angle: 0, tilt: 0, speed: 0.1, spin: 20 });
    w.launch();
    let maxUp = -Infinity;
    for (let i = 0; i < 360 * 1.5; i++) {
      w.step(DT);
      maxUp = Math.max(maxUp, disc.vy);
    }
    expect(maxUp).toBeGreaterThan(5);
  });

  it('basket chains catch a soft putt', () => {
    const { disc, w } = world('putter');
    const basket = createBasketPhysics('b', 0, 0, -5);
    basket.colliders.forEach((c) => w.addCollider(c));
    w.volumes.push(basket.chains);
    applyLaunch(disc, 0, 1.0, 0, { hx: 0, hz: -1, angle: 0.16, tilt: 0, speed: 8.5, spin: -60 });
    w.launch();
    const ev = run(w, 10);
    expect(ev).toContain('enterVolume');
    expect(basket.holds(disc)).toBe(true);
  });

  it('a hard drive through the basket is not caught', () => {
    const { disc, w } = world('driver');
    const basket = createBasketPhysics('b', 0.25, 0, -5);
    basket.colliders.forEach((c) => w.addCollider(c));
    w.volumes.push(basket.chains);
    applyLaunch(disc, 0, 1.15, 0, { hx: 0, hz: -1, angle: 0.0, tilt: 0, speed: 28, spin: -140 });
    w.launch();
    run(w, 15);
    expect(basket.holds(disc)).toBe(false);
  });
});
