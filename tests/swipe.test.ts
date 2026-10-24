import { describe, expect, it } from 'vitest';
import { analyzePull, analyzeSwipe, swipeSpeed, type SwipeSample } from '../src/game/swipe';

const R = 0.13;
const FULL = 21;

/** Straight swipe from (x0, z0) to (x1, z1) over `ms`, sampled every 8 ms. */
function line(x0: number, z0: number, x1: number, z1: number, ms: number, holdMs = 0): SwipeSample[] {
  const out: SwipeSample[] = [];
  const n = Math.max(2, Math.round(ms / 8));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, t: 1000 + t * ms });
  }
  if (holdMs > 0) out.push({ x: x1, z: z1, t: 1000 + ms + holdMs });
  return out;
}

describe('swipe analysis', () => {
  it('launches parallel to the swipe, whatever the offset', () => {
    const a = analyzeSwipe(line(0.06 - 0.15, 0.4, 0.06 + 0.15, -0.4, 80), 0, 0, R, FULL);
    expect(a.ok).toBe(true);
    const len = Math.hypot(0.3, -0.8);
    expect(a.dirX).toBeCloseTo(0.3 / len, 5);
    expect(a.dirZ).toBeCloseTo(-0.8 / len, 5);
  });

  it('a swipe through the centre gives no spin', () => {
    const a = analyzeSwipe(line(0, 0.4, 0, -0.4, 80), 0, 0, R, FULL);
    expect(a.ok).toBe(true);
    expect(a.offset).toBeLessThan(1e-6);
    expect(a.spinFactor).toBeLessThan(1e-6);
  });

  it('spin grows with the distance from the centre', () => {
    const near = analyzeSwipe(line(0.02, 0.4, 0.02, -0.4, 80), 0, 0, R, FULL);
    const far = analyzeSwipe(line(0.11, 0.4, 0.11, -0.4, 80), 0, 0, R, FULL);
    expect(near.spinFactor).toBeCloseTo(0.02 / R, 5);
    expect(far.spinFactor).toBeCloseTo(0.11 / R, 5);
    expect(far.spinFactor).toBeGreaterThan(near.spinFactor);
  });

  it('the side of the centre sets the spin direction', () => {
    // Throwing toward -z: +x is the thrower's right.
    const right = analyzeSwipe(line(0.08, 0.4, 0.08, -0.4, 80), 0, 0, R, FULL);
    const left = analyzeSwipe(line(-0.08, 0.4, -0.08, -0.4, 80), 0, 0, R, FULL);
    expect(right.spinSign).toBe(1); // counter-clockwise seen from above
    expect(left.spinSign).toBe(-1);
  });

  it('faster swipes give more power', () => {
    const slow = analyzeSwipe(line(0.05, 0.4, 0.05, -0.4, 400), 0, 0, R, FULL);
    const fast = analyzeSwipe(line(0.05, 0.4, 0.05, -0.4, 80), 0, 0, R, FULL);
    expect(slow.ok && fast.ok).toBe(true);
    expect(fast.power).toBeGreaterThan(slow.power);
    expect(fast.power).toBeLessThanOrEqual(1);
  });

  it('holding still before release fades the power', () => {
    const flick = swipeSpeed(line(0, 0.4, 0, -0.4, 80), R);
    const held = swipeSpeed(line(0, 0.4, 0, -0.4, 80, 600), R);
    expect(held).toBeLessThan(flick * 0.1);
  });

  it('grazing the rim keeps full spin but loses power', () => {
    const rim = analyzeSwipe(line(0.125, 0.4, 0.125, -0.4, 80), 0, 0, R, FULL);
    const graze = analyzeSwipe(line(0.155, 0.4, 0.155, -0.4, 80), 0, 0, R, FULL);
    expect(graze.ok).toBe(true);
    expect(graze.grazed).toBe(true);
    expect(graze.spinFactor).toBe(1);
    expect(graze.power).toBeLessThan(rim.power);
  });

  it('rejects swipes that miss the disc', () => {
    expect(analyzeSwipe(line(0.4, 0.4, 0.4, -0.4, 80), 0, 0, R, FULL).reason).toBe('miss');
    // Parallel and on target, but far away from the disc.
    expect(analyzeSwipe(line(0.02, -1.5, 0.02, -2.3, 80), 0, 0, R, FULL).reason).toBe('miss');
  });

  it('ignores taps', () => {
    expect(analyzeSwipe(line(0, 0, 0.01, 0, 50), 0, 0, R, FULL).reason).toBe('tap');
  });
});

describe('pull (slingshot) analysis', () => {
  it('flies opposite to the pull', () => {
    // grab the centre, pull back toward +z → throw toward -z
    const a = analyzePull(0, 0, 0, 0.3, 0, 0, R, 0.02);
    expect(a.ok).toBe(true);
    expect(a.dirX).toBeCloseTo(0, 6);
    expect(a.dirZ).toBeCloseTo(-1, 6);
    expect(a.spinFactor).toBeCloseTo(0, 6);
  });

  it('grabbing off-centre adds spin, side sets the direction', () => {
    const right = analyzePull(0.08, 0, 0.08, 0.3, 0, 0, R, 0.02);
    const left = analyzePull(-0.08, 0, -0.08, 0.3, 0, 0, R, 0.02);
    expect(right.spinFactor).toBeCloseTo(0.08 / R, 5);
    expect(right.spinSign).toBe(1);
    expect(left.spinSign).toBe(-1);
  });

  it('launch line is parallel to the pull through the centre', () => {
    const a = analyzePull(0.05, 0.02, 0.05 + 0.1, 0.02 + 0.3, 0, 0, R, 0.02);
    const len = Math.hypot(0.1, 0.3);
    expect(a.dirX).toBeCloseTo(-0.1 / len, 6);
    expect(a.dirZ).toBeCloseTo(-0.3 / len, 6);
  });

  it('rejects grabs away from the disc and tiny pulls', () => {
    expect(analyzePull(0.5, 0, 0.5, 0.3, 0, 0, R, 0.02).reason).toBe('off');
    expect(analyzePull(0, 0, 0, 0.01, 0, 0, R, 0.02).reason).toBe('short');
  });
});
