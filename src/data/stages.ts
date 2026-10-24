import type { ObjDef, StageDef, XYZ, XZ } from './types';

export interface WorldDef {
  id: string;
  name: string;
  sub: string;
  theme: 'grass' | 'beach' | 'sky';
  color: string;
  holes: StageDef[];
}

const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

// ------------------------------------------------------------------ World 1

const h1: StageDef = {
  id: 'w1h1',
  name: 'はじめの一投',
  theme: 'grass',
  par: 3,
  tee: [0, 0],
  basket: [0, -42],
  land: [
    { kind: 'path', pts: [[0, 14], [0, -62]], width: 58 },
    { kind: 'blob', x: -26, z: -18, r: 18 },
  ],
  fairway: { pts: [[0, -3], [0, -42]], width: 13 },
  hills: [
    { x: 19, z: -22, r: 10, h: 2.4 },
    { x: -21, z: -36, r: 12, h: 3 },
    { x: 16, z: 6, r: 8, h: 1.5 },
  ],
  wind: [0, 1.2],
  seed: 11,
  objects: [
    { t: 'tree', x: -10, z: -14 },
    { t: 'tree', x: 11, z: -27 },
    { t: 'tree', x: -12, z: -33, v: 'lollipop' },
    { t: 'tree', x: 13, z: -9 },
    { t: 'tree', x: 9, z: -50 },
    { t: 'tree', x: -9, z: -53 },
    { t: 'tree', x: -18, z: 2 },
    { t: 'tree', x: 20, z: -40, v: 'pine' },
    { t: 'bush', x: 7, z: -37 },
    { t: 'bush', x: -6, z: -24, s: 0.8 },
    { t: 'mushroom', x: -15, z: -22 },
    { t: 'ring', x: 0, y: 3.2, z: -20 },
    { t: 'coins', from: [0, 2.2, -7], to: [0, 2.4, -14], n: 4 },
    { t: 'coins', from: [-15, 4.6, -22], to: [-15, 6.2, -22], n: 2 },
    { t: 'block', x: 5, y: 3.4, z: -29, v: 'lucky' },
    { t: 'flowers', x: -6, z: -6, r: 3, n: 14 },
    { t: 'flowers', x: 6, z: -44, r: 3, n: 12 },
    { t: 'rock', x: 15, z: -32 },
  ],
};

const h2: StageDef = {
  id: 'w1h2',
  name: 'キノコの森',
  theme: 'grass',
  par: 3,
  tee: [0, 0],
  basket: [-18, -58],
  land: [{ kind: 'path', pts: [[0, 12], [0, -30], [-18, -62], [-22, -76]], width: 52 }],
  fairway: { pts: [[0, -3], [0, -27], [-18, -58]], width: 12 },
  hills: [
    { x: 16, z: -40, r: 12, h: 3.5 },
    { x: -26, z: -26, r: 10, h: 2 },
  ],
  rough: [{ x: 14, z: -16, r: 7 }],
  wind: [0, 1.5],
  seed: 23,
  objects: [
    { t: 'tree', x: 12, z: -20 },
    { t: 'tree', x: 14, z: -32 },
    { t: 'tree', x: 4, z: -49 },
    { t: 'tree', x: -1, z: -63 },
    { t: 'tree', x: -10, z: -12, v: 'lollipop' },
    { t: 'tree', x: -32, z: -60 },
    { t: 'tree', x: -27, z: -70, v: 'pine' },
    { t: 'tree', x: 9, z: 5 },
    { t: 'mushroom', x: -12, z: -26 },
    { t: 'mushroom', x: 7, z: -38, s: 0.85 },
    { t: 'mushroom', x: -28, z: -45, s: 1.2 },
    { t: 'mushroom', x: -4, z: -40, s: 0.7 },
    { t: 'block', x: -6, y: 4.2, z: -34, n: 3, yaw: 0.6 },
    { t: 'block', x: -9, y: 7, z: -42, v: 'lucky' },
    { t: 'ring', x: -8, y: 3, z: -40, yaw: yawOf(18, 30) },
    { t: 'coins', from: [-12, 5, -26], to: [-12, 7, -26], n: 3 },
    { t: 'coins', from: [-28, 6, -45], to: [-28, 8, -45], n: 3 },
    { t: 'coins', from: [0, 2.2, -10], to: [0, 2.4, -20], n: 4 },
    { t: 'flowers', x: -22, z: -54, r: 4, n: 16 },
    { t: 'flowers', x: 4, z: -10, r: 3, n: 10 },
    { t: 'bush', x: -20, z: -36 },
    { t: 'rock', x: 10, z: -58 },
  ],
};

const h3: StageDef = {
  id: 'w1h3',
  name: 'ブロック峠',
  theme: 'grass',
  par: 4,
  tee: [0, 0],
  basket: [8, -104],
  land: [
    { kind: 'path', pts: [[0, 14], [0, -50], [10, -114]], width: 62 },
    { kind: 'blob', x: 26, z: -60, r: 16 },
  ],
  fairway: { pts: [[0, -3], [0, -50], [8, -104]], width: 14 },
  ponds: [{ x: 18, z: -46, r: 11 }],
  hills: [
    { x: -16, z: -62, r: 14, h: 4.5 },
    { x: 0, z: -78, r: 8, h: 1.8 },
    { x: 24, z: -86, r: 9, h: 2.6 },
  ],
  sand: [{ x: -6, z: -92, r: 5 }],
  wind: [0.5, 2],
  seed: 37,
  objects: [
    { t: 'wall', x: -5, z: -66, w: 9, h: 2.2, yaw: 0.05 },
    { t: 'block', x: 1, y: 4.4, z: -40, n: 4 },
    { t: 'block', x: 1, y: 7.6, z: -40, v: 'lucky' },
    { t: 'pipe', x: -13, z: -88, h: 3 },
    { t: 'pipe', x: 21, z: -92, h: 4.5, c: 0x3fa9ff },
    { t: 'pipe', x: -18, z: -20, h: 2.4, c: 0xff8a3d },
    { t: 'ring', x: 0, y: 3, z: -26, v: 'boost' },
    { t: 'ring', x: 4, y: 4, z: -80, yaw: yawOf(8, 54) },
    { t: 'tree', x: 17, z: -101 },
    { t: 'tree', x: -2, z: -112 },
    { t: 'tree', x: 15, z: -114, v: 'pine' },
    { t: 'tree', x: -12, z: -10 },
    { t: 'tree', x: 13, z: -18 },
    { t: 'tree', x: -20, z: -44, v: 'pine' },
    { t: 'tree', x: 10, z: -66 },
    { t: 'tree', x: -22, z: -80 },
    { t: 'mushroom', x: 30, z: -62 },
    { t: 'coins', from: [0, 2.6, -8], to: [0, 2.6, -20], n: 4 },
    { t: 'coins', from: [-16, 7, -62], to: [-16, 7.5, -66], n: 3 },
    { t: 'coins', from: [30, 5, -62], to: [30, 7, -62], n: 2 },
    { t: 'flowers', x: 4, z: -96, r: 4, n: 14 },
    { t: 'rock', x: 12, z: -36 },
    { t: 'rock', x: 24, z: -34 },
    { t: 'bush', x: -8, z: -100 },
  ],
};

// ------------------------------------------------------------------ World 2

const h4: StageDef = {
  id: 'w2h1',
  name: 'ヤシの木ストレート',
  theme: 'beach',
  par: 3,
  tee: [0, 0],
  basket: [0, -58],
  land: [{ kind: 'path', pts: [[0, 12], [0, -72]], width: 34 }],
  fairway: { pts: [[0, -3], [0, -58]], width: 10 },
  sand: [
    { x: 7, z: -30, r: 5 },
    { x: -6, z: -47, r: 4 },
  ],
  wind: [1, 2.5],
  seed: 41,
  objects: [
    { t: 'tree', x: -8, z: -12, v: 'palm' },
    { t: 'tree', x: 8, z: -20, v: 'palm' },
    { t: 'tree', x: -7, z: -35, v: 'palm' },
    { t: 'tree', x: 9, z: -43, v: 'palm' },
    { t: 'tree', x: -6, z: -63, v: 'palm' },
    { t: 'tree', x: 7, z: -66, v: 'palm' },
    { t: 'umbrella', x: 10, z: -6 },
    { t: 'umbrella', x: -10, z: 4, c: 0x3fa9ff },
    { t: 'umbrella', x: -9, z: -26, c: 0xffb43f },
    { t: 'coins', from: [0, 2, -18], to: [0, 2.2, -38], n: 5 },
    { t: 'ring', x: 0, y: 4.5, z: -30 },
    { t: 'block', x: -3, y: 5, z: -48, v: 'lucky' },
    { t: 'rock', x: 9, z: -54 },
    { t: 'flowers', x: 0, z: -66, r: 3, n: 8 },
  ],
};

const h5: StageDef = {
  id: 'w2h2',
  name: '入り江ごえ',
  theme: 'beach',
  par: 3,
  tee: [0, 0],
  basket: [-6, -72],
  land: [
    { kind: 'path', pts: [[0, 12], [0, -18]], width: 34 },
    { kind: 'blob', x: -6, z: -75, r: 19 },
    { kind: 'path', pts: [[14, -12], [22, -40], [8, -64]], width: 7 },
  ],
  fairway: { pts: [[0, -3], [0, -14]], width: 9 },
  wind: [1, 3],
  seed: 53,
  objects: [
    { t: 'tree', x: -18, z: -71, v: 'palm' },
    { t: 'tree', x: 7, z: -83, v: 'palm' },
    { t: 'tree', x: -14, z: -86, v: 'palm' },
    { t: 'tree', x: 10, z: 2, v: 'palm' },
    { t: 'tree', x: -11, z: -8, v: 'palm' },
    { t: 'tree', x: 23, z: -36, v: 'palm', s: 0.8 },
    { t: 'umbrella', x: -9, z: 6 },
    { t: 'umbrella', x: 3, z: -86, c: 0xffb43f },
    { t: 'ring', x: 0, y: 3.6, z: -34, v: 'boost' },
    { t: 'coins', from: [0, 3, -24], to: [-3, 4.6, -50], n: 6 },
    { t: 'coins', from: [20, 2, -30], to: [14, 2, -54], n: 4 },
    { t: 'ring', x: 18, y: 3, z: -46, yaw: yawOf(-8, -20) },
    { t: 'block', x: -6, y: 5.2, z: -60, n: 3, v: 'stone' },
  ],
};

const h6: StageDef = {
  id: 'w2h3',
  name: 'ぐるっとラグーン',
  theme: 'beach',
  par: 4,
  tee: [0, 0],
  basket: [50, -90],
  land: [
    { kind: 'path', pts: [[0, 12], [0, -72], [22, -102], [54, -94]], width: 30 },
    { kind: 'blob', x: 52, z: -90, r: 17 },
    { kind: 'blob', x: 26, z: -46, r: 6 },
  ],
  fairway: { pts: [[0, -3], [0, -70], [22, -98], [50, -90]], width: 11 },
  sand: [
    { x: 2, z: -80, r: 6 },
    { x: 38, z: -98, r: 4 },
  ],
  wind: [1.5, 3],
  seed: 67,
  objects: [
    { t: 'tree', x: -10, z: -30, v: 'palm' },
    { t: 'tree', x: -10, z: -58, v: 'palm' },
    { t: 'tree', x: 9, z: -86, v: 'palm' },
    { t: 'tree', x: 28, z: -110, v: 'palm' },
    { t: 'tree', x: 62, z: -100, v: 'palm' },
    { t: 'tree', x: 26, z: -46, v: 'palm' },
    { t: 'tree', x: 8, z: -14, v: 'palm' },
    { t: 'tree', x: 60, z: -80, v: 'palm' },
    { t: 'umbrella', x: -8, z: -10 },
    { t: 'umbrella', x: -9, z: -44, c: 0x3fa9ff },
    { t: 'umbrella', x: 44, z: -104, c: 0xffb43f },
    { t: 'ring', x: 20, y: 4, z: -62, yaw: yawOf(30, -28) },
    { t: 'coins', from: [26, 3, -46], to: [26, 5, -46], n: 3 },
    { t: 'coins', from: [0, 2.2, -20], to: [0, 2.2, -50], n: 5 },
    { t: 'block', x: 2, y: 4.2, z: -60, n: 2, v: 'brick' },
    { t: 'block', x: 2, y: 7.4, z: -60, v: 'lucky' },
    { t: 'mushroom', x: 32, z: -104, s: 0.8, c: 0xff8a3d },
    { t: 'rock', x: 14, z: -90 },
  ],
};

// ------------------------------------------------------------------ World 3

const h7: StageDef = {
  id: 'w3h1',
  name: 'そらのかけ橋',
  theme: 'sky',
  par: 3,
  tee: [0, 0],
  basket: [0, -62],
  land: [
    { kind: 'blob', x: 0, z: -2, r: 13 },
    { kind: 'path', pts: [[0, -10], [0, -50]], width: 6 },
    { kind: 'blob', x: 0, z: -63, r: 14 },
  ],
  fairway: { pts: [[0, -3], [0, -62]], width: 5 },
  wind: [1.5, 3],
  seed: 71,
  objects: [
    { t: 'tree', x: -8, z: 4 },
    { t: 'tree', x: 8, z: -69 },
    { t: 'tree', x: -8, z: -71 },
    { t: 'tree', x: 7, z: 6 },
    { t: 'cloudpad', x: -9, y: 0.6, z: -28, r: 4 },
    { t: 'cloudpad', x: 9, y: 0.6, z: -38, r: 3.5 },
    { t: 'coins', from: [0, 2, -16], to: [0, 2, -44], n: 6 },
    { t: 'coins', from: [-9, 2.5, -28], to: [9, 2.5, -38], n: 2 },
    { t: 'ring', x: 0, y: 3, z: -30 },
    { t: 'block', x: 0, y: 6, z: -48, v: 'lucky' },
    { t: 'flowers', x: 0, z: -70, r: 4, n: 14 },
  ],
};

const h8: StageDef = {
  id: 'w3h2',
  name: 'ういてるブロック',
  theme: 'sky',
  par: 4,
  tee: [0, 0],
  basket: [-10, -92],
  land: [
    { kind: 'blob', x: 0, z: 0, r: 12 },
    { kind: 'path', pts: [[0, -8], [6, -24]], width: 4 },
    { kind: 'blob', x: 6, z: -31, r: 9 },
    { kind: 'path', pts: [[6, -36], [-6, -50]], width: 4 },
    { kind: 'blob', x: -6, z: -56, r: 9 },
    { kind: 'path', pts: [[-6, -62], [-10, -80]], width: 4 },
    { kind: 'blob', x: -10, z: -91, r: 14 },
  ],
  fairway: { pts: [[0, -3], [6, -30], [-6, -56], [-10, -92]], width: 6 },
  wind: [2, 3.5],
  seed: 83,
  objects: [
    { t: 'block', x: 1, y: 4, z: -44, n: 3, yaw: 0.8 },
    { t: 'block', x: -2, y: 6, z: -72, v: 'lucky' },
    { t: 'block', x: -13, y: 3, z: -62, n: 2, v: 'stone' },
    { t: 'cloudpad', x: -14, y: 0.4, z: -30, r: 5 },
    { t: 'cloudpad', x: 12, y: 0.4, z: -62, r: 5 },
    { t: 'ring', x: 6, y: 3, z: -24, v: 'boost', yaw: yawOf(-6, 16) },
    { t: 'ring', x: -6, y: 4, z: -56, yaw: yawOf(4, 36) },
    { t: 'tree', x: 10, z: -35 },
    { t: 'tree', x: -10, z: -60 },
    { t: 'tree', x: -19, z: -95 },
    { t: 'tree', x: -2, z: -101 },
    { t: 'tree', x: 6, z: 5 },
    { t: 'coins', from: [-14, 2.5, -30], to: [-14, 4, -30], n: 2 },
    { t: 'coins', from: [12, 2.5, -62], to: [12, 4, -62], n: 2 },
    { t: 'coins', from: [3, 2.4, -14], to: [6, 2.4, -22], n: 3 },
    { t: 'flowers', x: -10, z: -84, r: 4, n: 12 },
  ],
};

const h9: StageDef = {
  id: 'w3h3',
  name: 'てっぺんのバスケット',
  theme: 'sky',
  par: 4,
  tee: [0, 0],
  basket: [14, -122],
  land: [
    { kind: 'blob', x: 0, z: 0, r: 14 },
    { kind: 'path', pts: [[0, -8], [0, -60], [14, -110]], width: 20 },
    { kind: 'blob', x: 14, z: -122, r: 16 },
  ],
  fairway: { pts: [[0, -3], [0, -60], [14, -122]], width: 9 },
  hills: [{ x: 14, z: -122, r: 12, h: 6 }],
  wind: [2, 4],
  seed: 97,
  objects: [
    { t: 'mushroom', x: -6, z: -40 },
    { t: 'mushroom', x: 8, z: -72, c: 0xb36bff },
    { t: 'pipe', x: -6, z: -92, h: 4, c: 0xff8a3d },
    { t: 'block', x: 0, y: 6, z: -50, v: 'lucky' },
    { t: 'block', x: 9, y: 9, z: -96, n: 3, yaw: -0.3 },
    { t: 'ring', x: 0, y: 4, z: -30 },
    { t: 'ring', x: 4, y: 5, z: -64, v: 'boost', yaw: yawOf(14, 50) },
    { t: 'ring', x: 11, y: 9, z: -104, yaw: yawOf(14, 50) },
    { t: 'tree', x: 7, z: -14 },
    { t: 'tree', x: -7, z: -22 },
    { t: 'tree', x: 7, z: -50 },
    { t: 'tree', x: 24, z: -126 },
    { t: 'tree', x: 4, z: -130 },
    { t: 'tree', x: 20, z: -112, v: 'lollipop' },
    { t: 'coins', from: [-6, 4.6, -40], to: [-6, 7.2, -40], n: 3 },
    { t: 'coins', from: [8, 4.6, -72], to: [8, 7.2, -72], n: 3 },
    { t: 'cloudpad', x: -12, y: 0.4, z: -70, r: 5 },
    { t: 'flowers', x: 14, z: -118, r: 4, n: 14 },
  ],
};

// ------------------------------------------------------------------ Scaling

/**
 * The layouts above were drawn for long disc-golf drives. Foam discs fly
 * shorter, so every stage is compressed by this factor: positions, land and
 * terrain features shrink, while props keep their real size.
 */
const MAP_SCALE = 0.6;

function scaleStage(d: StageDef, k = MAP_SCALE): StageDef {
  const xz = (p: XZ): XZ => [p[0] * k, p[1] * k];
  const xyz = (p: XYZ): XYZ => [p[0] * k, p[1], p[2] * k];
  const r = (v: number, min: number) => Math.max(min, v * k);
  // Beaches have a wide sloping shore, so thin strips need more width to stay above water.
  const beach = d.theme === 'beach';
  return {
    ...d,
    tee: xz(d.tee),
    basket: d.basket && xz(d.basket),
    extraBaskets: d.extraBaskets?.map(xz),
    land: d.land.map((l) =>
      l.kind === 'path' ? { ...l, pts: l.pts.map(xz), width: r(l.width, beach ? 10 : 4) } : { ...l, x: l.x * k, z: l.z * k, r: r(l.r, beach ? 9 : 6) },
    ),
    hills: d.hills?.map((h) => ({ x: h.x * k, z: h.z * k, r: r(h.r, 5), h: h.h * 0.8 })),
    ponds: d.ponds?.map((p) => ({ x: p.x * k, z: p.z * k, r: r(p.r, 5) })),
    sand: d.sand?.map((p) => ({ x: p.x * k, z: p.z * k, r: r(p.r, 3) })),
    rough: d.rough?.map((p) => ({ x: p.x * k, z: p.z * k, r: r(p.r, 4) })),
    fairway: d.fairway && { pts: d.fairway.pts.map(xz), width: Math.max(5, d.fairway.width * 0.75) },
    // Light discs drift a lot, so the breeze is gentler too.
    wind: [d.wind[0] * 0.5, d.wind[1] * 0.5],
    objects: d.objects.map((o): ObjDef => {
      if (o.t === 'coins') return { ...o, from: xyz(o.from), to: xyz(o.to) };
      if (o.t === 'flowers') return { ...o, x: o.x * k, z: o.z * k, r: r(o.r, 2) };
      return { ...o, x: o.x * k, z: o.z * k } as ObjDef;
    }),
  };
}

export const WORLDS: WorldDef[] = [
  { id: 'w1', name: 'はらっぱアイランド', sub: 'GRASSLAND', theme: 'grass', color: '#5fcd3c', holes: [h1, h2, h3].map((h) => scaleStage(h)) },
  { id: 'w2', name: 'サンサンビーチ', sub: 'SUNNY BEACH', theme: 'beach', color: '#29b6f6', holes: [h4, h5, h6].map((h) => scaleStage(h)) },
  { id: 'w3', name: 'くものうえ', sub: 'SKY ISLANDS', theme: 'sky', color: '#b47bff', holes: [h7, h8, h9].map((h) => scaleStage(h)) },
];

export const ALL_HOLES = WORLDS.flatMap((w) => w.holes);

// ------------------------------------------------------------------ Challenges

const markers: ObjDef[] = [];
for (let d = 10; d <= 70; d += 10) {
  const c = d % 20 === 0 ? 0xff4f6d : 0x4a8fe0;
  markers.push({ t: 'marker', x: 11, z: -d, text: `${d}`, c }, { t: 'marker', x: -11, z: -d, text: `${d}`, c });
}

/** Half width of the long-drive field (throws landing outside are OB). */
export const DISTANCE_FIELD_HALF = 19;

export const DISTANCE_STAGE: StageDef = {
  id: 'ch-distance',
  name: 'ロングドライブ',
  theme: 'grass',
  tee: [0, 0],
  land: [{ kind: 'path', pts: [[0, 12], [0, -82]], width: 42 }],
  fairway: { pts: [[0, -3], [0, -78]], width: 18 },
  wind: [0, 1.2],
  windDir: Math.PI,
  seed: 5,
  decor: 0.6,
  objects: [
    ...markers,
    { t: 'tree', x: -16, z: -18 },
    { t: 'tree', x: 16, z: -30 },
    { t: 'tree', x: -16, z: -46, v: 'pine' },
    { t: 'tree', x: 16, z: -62 },
    { t: 'tree', x: -15, z: -74, v: 'pine' },
    { t: 'ring', x: 0, y: 3, z: -16, v: 'boost' },
  ],
};

export const TARGET_STAGE: StageDef = scaleStage({
  id: 'ch-target',
  name: 'まとあて',
  theme: 'beach',
  tee: [0, 0],
  land: [{ kind: 'path', pts: [[0, 14], [0, -80]], width: 56 }],
  wind: [0.5, 2],
  seed: 9,
  decor: 0.5,
  objects: [
    { t: 'target', x: 0, z: -12, r: 2.4 },
    { t: 'target', x: -7, z: -24, r: 2.8 },
    { t: 'target', x: 8, z: -37, r: 3.2 },
    { t: 'target', x: -10, z: -51, r: 3.6 },
    { t: 'target', x: 6, z: -66, r: 4 },
    { t: 'tree', x: -22, z: -14, v: 'palm' },
    { t: 'tree', x: 22, z: -30, v: 'palm' },
    { t: 'tree', x: -24, z: -60, v: 'palm' },
    { t: 'tree', x: 22, z: -74, v: 'palm' },
    { t: 'umbrella', x: 16, z: 2 },
    { t: 'umbrella', x: -16, z: -4, c: 0x3fa9ff },
  ],
});

const ringPath: [number, number, number][] = [
  [0, 2.6, -12],
  [-3, 3.2, -22],
  [-7, 3.6, -32],
  [-9, 3.6, -42],
  [-7, 3.4, -52],
  [-2, 3.2, -60],
  [4, 3.2, -68],
  [8, 3, -77],
  [9, 2.8, -87],
  [6, 2.4, -97],
];

export const RING_STAGE: StageDef = scaleStage({
  id: 'ch-rings',
  name: 'リングくぐり',
  theme: 'sky',
  tee: [0, 0],
  land: [
    { kind: 'blob', x: 0, z: 0, r: 13 },
    { kind: 'path', pts: [[0, -6], [-6, -40], [6, -80], [4, -104]], width: 26 },
  ],
  fairway: { pts: [[0, -3], [-6, -40], [6, -80], [4, -100]], width: 8 },
  wind: [0, 1],
  seed: 13,
  objects: [
    ...ringPath.map((p, i): ObjDef => {
      const n = ringPath[Math.min(ringPath.length - 1, i + 1)];
      const pr = ringPath[Math.max(0, i - 1)];
      return { t: 'ring', x: p[0], y: p[1], z: p[2], r: 1.7, yaw: yawOf(n[0] - pr[0], n[2] - pr[2]) };
    }),
    { t: 'tree', x: 14, z: -30 },
    { t: 'tree', x: -20, z: -60 },
    { t: 'tree', x: 18, z: -96 },
    { t: 'cloudpad', x: -20, y: 0.4, z: -20, r: 4 },
  ],
});

export const PRACTICE_STAGE: StageDef = {
  id: 'practice',
  name: 'れんしゅう場',
  theme: 'grass',
  tee: [0, 0],
  extraBaskets: [
    [0, -8],
    [-6, -18],
    [8, -30],
    [-4, -44],
  ],
  land: [{ kind: 'path', pts: [[0, 12], [0, -62]], width: 52 }],
  fairway: { pts: [[0, -3], [0, -58]], width: 14 },
  wind: [0, 0],
  seed: 3,
  decor: 0.7,
  objects: [
    { t: 'tree', x: -17, z: -12 },
    { t: 'tree', x: 18, z: -22 },
    { t: 'tree', x: -18, z: -38, v: 'pine' },
    { t: 'tree', x: 18, z: -48 },
    { t: 'mushroom', x: 13, z: -9 },
    { t: 'flowers', x: -8, z: -6, r: 3, n: 14 },
    ...[10, 20, 30, 40, 50].flatMap((d): ObjDef[] => [
      { t: 'marker', x: 14, z: -d, text: `${d}`, c: 0x4a8fe0 },
      { t: 'marker', x: -14, z: -d, text: `${d}`, c: 0x4a8fe0 },
    ]),
  ],
};

export const TITLE_STAGE: StageDef = { ...WORLDS[0].holes[0], id: 'title' };
