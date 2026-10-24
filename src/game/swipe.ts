/**
 * Pure swipe analysis on the horizontal plane through the disc.
 *
 * The disc leaves parallel to the swipe, through its own centre. How far the
 * swipe line passes from the centre sets the spin (none through the middle,
 * most at the rim) and which side it passes sets the spin direction. The speed
 * of the end of the gesture sets the power.
 */

export interface SwipeSample {
  x: number;
  z: number;
  /** milliseconds */
  t: number;
}

export interface SwipeAnalysis {
  ok: boolean;
  reason?: 'tap' | 'miss' | 'weak';
  dirX: number;
  dirZ: number;
  /** Distance of the swipe line from the centre in disc radii. */
  offset: number;
  /** +1 counter-clockwise from above, −1 clockwise, 0 none. */
  spinSign: number;
  /** 0..1 */
  spinFactor: number;
  grazed: boolean;
  /** 0..1 */
  power: number;
  /** Peak end speed in disc diameters per second. */
  dd: number;
  /** Closest point of the swipe line to the centre. */
  footX: number;
  footZ: number;
}

/** Peak speed (disc diameters / s) in the last 150 ms of movement, faded if the finger rested before release. */
export function swipeSpeed(s: SwipeSample[], radius: number): number {
  if (s.length < 2) return 0;
  const release = s[s.length - 1].t;
  const still = radius * 0.03;
  let lastMove = s.length - 1;
  while (lastMove > 0 && Math.hypot(s[lastMove].x - s[lastMove - 1].x, s[lastMove].z - s[lastMove - 1].z) < still) lastMove--;
  const end = s[lastMove].t;
  const hold = Math.min(1, Math.max(0, 1 - (release - end - 150) / 350));
  let best = 0;
  for (let j = lastMove; j > 0; j--) {
    if (end - s[j].t > 150) break;
    let k = j - 1;
    while (k > 0 && s[j].t - s[k].t < 50) k--;
    const dt = Math.max(16, s[j].t - s[k].t) / 1000;
    best = Math.max(best, Math.hypot(s[j].x - s[k].x, s[j].z - s[k].z) / dt);
  }
  return (best / (2 * radius)) * hold;
}

export function powerFromSpeed(dd: number, full: number): number {
  return Math.min(1, Math.max(0, (dd - 1.5) / (full - 1.5)));
}

export function analyzeSwipe(samples: SwipeSample[], cx: number, cz: number, radius: number, fullSpeed: number): SwipeAnalysis {
  const res: SwipeAnalysis = {
    ok: false,
    dirX: 0,
    dirZ: -1,
    offset: 0,
    spinSign: 0,
    spinFactor: 0,
    grazed: false,
    power: 0,
    dd: 0,
    footX: cx,
    footZ: cz,
  };
  if (samples.length < 2) {
    res.reason = 'tap';
    return res;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (Math.hypot(last.x - first.x, last.z - first.z) < radius * 0.35) {
    res.reason = 'tap';
    return res;
  }

  // Throwing line: principal axis of the final ~160 ms of the gesture.
  let s = samples.length - 2;
  while (s > 0 && last.t - samples[s].t < 160) s--;
  let seg = samples.slice(s);
  if (Math.hypot(seg[seg.length - 1].x - seg[0].x, seg[seg.length - 1].z - seg[0].z) < radius * 0.2) seg = samples;
  let mx = 0;
  let mz = 0;
  for (const p of seg) {
    mx += p.x;
    mz += p.z;
  }
  mx /= seg.length;
  mz /= seg.length;
  let sxx = 0;
  let sxz = 0;
  let szz = 0;
  for (const p of seg) {
    const dx = p.x - mx;
    const dz = p.z - mz;
    sxx += dx * dx;
    sxz += dx * dz;
    szz += dz * dz;
  }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  let dx = Math.cos(theta);
  let dz = Math.sin(theta);
  const tx = seg[seg.length - 1].x - seg[0].x;
  const tz = seg[seg.length - 1].z - seg[0].z;
  if (dx * tx + dz * tz < 0) {
    dx = -dx;
    dz = -dz;
  }
  res.dirX = dx;
  res.dirZ = dz;

  // Offset of the line from the centre.
  const along = (cx - mx) * dx + (cz - mz) * dz;
  res.footX = mx + dx * along;
  res.footZ = mz + dz * along;
  const ox = res.footX - cx;
  const oz = res.footZ - cz;
  res.offset = Math.hypot(ox, oz) / radius;

  // The gesture itself must pass over (or right beside) the disc.
  let closest = Infinity;
  for (let i = 0; i < samples.length - 1; i++) {
    closest = Math.min(closest, distToSeg(cx, cz, samples[i], samples[i + 1]));
  }
  res.dd = swipeSpeed(samples, radius);
  if (closest > radius * 1.8 || res.offset > 1.3) {
    res.reason = 'miss';
    return res;
  }
  let power = powerFromSpeed(res.dd, fullSpeed);
  if (power < 0.02) {
    res.reason = 'weak';
    return res;
  }
  res.grazed = res.offset > 1;
  if (res.grazed) power *= Math.max(0.35, 1 - (res.offset - 1) * 2.2);
  res.power = power;
  res.spinFactor = Math.min(1, res.offset);
  // (offset × direction)·up: a line to the right of centre pushes the right edge forward → CCW from above.
  const cross = oz * dx - ox * dz;
  res.spinSign = Math.abs(cross) < 1e-12 ? 0 : cross > 0 ? 1 : -1;
  res.ok = true;
  return res;
}

function distToSeg(px: number, pz: number, a: SwipeSample, b: SwipeSample): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;
  let t = l2 > 0 ? ((px - a.x) * abx + (pz - a.z) * abz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + abx * t), pz - (a.z + abz * t));
}
