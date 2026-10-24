// Headless flight simulator used to tune disc coefficients: `npx tsx`-free, bundle with esbuild.
import { DiscBody } from '../src/physics/DiscBody';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { Heightfield } from '../src/physics/Heightfield';
import { applyLaunch } from '../src/physics/launch';
import { DISC_TYPES } from '../src/data/discs';

export function flatWorld(disc: DiscBody): PhysicsWorld {
  const w = new PhysicsWorld(disc);
  const hf = new Heightfield(-300, -300, 2, 301, 301);
  w.terrain = hf;
  return w;
}

export interface FlightResult {
  landX: number; landZ: number; restX: number; restZ: number; maxY: number; tFlight: number; maxBankDeg: number;
  path: [number, number, number][];
}

export function fly(discIdx: number, speed: number, angleDeg: number, tiltDeg: number, ar: number, wind = [0, 0, 0]): FlightResult {
  const dt = DISC_TYPES[discIdx];
  const disc = new DiscBody(dt.spec);
  const w = flatWorld(disc);
  disc.wind.x = wind[0]; disc.wind.y = wind[1]; disc.wind.z = wind[2];
  const spin = (ar * speed) / dt.spec.radius;
  applyLaunch(disc, 0, 1.0, 0, { hx: 0, hz: -1, angle: (angleDeg * Math.PI) / 180, tilt: (tiltDeg * Math.PI) / 180, speed, spin });
  w.launch();
  let landX = NaN, landZ = NaN, tFlight = 0, maxY = 0, maxBank = 0;
  const path: [number, number, number][] = [];
  const h = 1 / 360;
  for (let i = 0; i < 360 * 30 && !w.sleeping; i++) {
    w.step(h);
    if (i % 36 === 0) path.push([disc.x, disc.y, disc.z]);
    maxY = Math.max(maxY, disc.y);
    if (Number.isNaN(landX) && w.touchedGround) { landX = disc.x; landZ = disc.z; tFlight = w.flightTime; }
    if (Number.isNaN(landX)) {
      const bank = Math.asin(Math.max(-1, Math.min(1, disc.n.x))) * 180 / Math.PI;
      if (Math.abs(bank) > Math.abs(maxBank)) maxBank = bank;
    }
    w.events.length = 0;
  }
  return { landX, landZ, restX: disc.x, restZ: disc.z, maxY, tFlight, maxBankDeg: maxBank, path };
}

if (process.argv[1] && process.argv[1].includes('simflight')) {
  const cases: [number, number, number, number, number, string][] = [];
  for (const [di, v] of DISC_TYPES.map((d, i) => [i, d.maxSpeed] as [number, number])) {
    cases.push([di, v, 8, 0, -0.5, 'flat CW']);
    cases.push([di, v, 8, 0, 0.5, 'flat CCW']);
    cases.push([di, v, 8, -20, -0.5, 'hyzer(L) CW']);
    cases.push([di, v, 8, 20, -0.5, 'anhyzer(R) CW']);
    cases.push([di, v, 8, 0, -0.15, 'lowspin CW']);
    cases.push([di, v, 8, 0, 0, 'nospin']);
    cases.push([di, v, 18, 0, -0.5, 'high angle CW']);
    cases.push([di, v * 0.5, 5, 0, -0.5, 'half power CW']);
  }
  for (const [di, v, a, t, ar, label] of cases) {
    const r = fly(di, v, a, t, ar);
    console.log(
      `${DISC_TYPES[di].id.padEnd(9)} v=${v.toFixed(0).padStart(2)} ${label.padEnd(15)} land: fwd ${(-r.landZ).toFixed(1).padStart(6)} side ${r.landX.toFixed(1).padStart(6)} | rest fwd ${(-r.restZ).toFixed(1).padStart(6)} side ${r.restX.toFixed(1).padStart(6)} | maxY ${r.maxY.toFixed(1).padStart(5)} t ${r.tFlight.toFixed(2)} bank ${r.maxBankDeg.toFixed(0)}`,
    );
  }
}
