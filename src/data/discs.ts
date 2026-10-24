import type { DiscSpec } from '../physics/DiscBody';

export interface DiscType {
  id: 'putter' | 'midrange' | 'driver';
  name: string;
  short: string;
  description: string;
  spec: DiscSpec;
  /** Launch speed at 100% power (m/s). */
  maxSpeed: number;
  /** Launch speed at 0% power (m/s). */
  minSpeed: number;
  /** Spin advance ratio (rim speed / airspeed) when the swipe grazes the rim. */
  maxAdvance: number;
  /** Flight numbers shown in the UI (1–5 scale). */
  stats: { speed: number; glide: number; control: number };
}

/**
 * Soft foam flying discs (padded rim, flat top). They are light for their size,
 * so they glide slowly and curve visibly; the pitching moment makes a low-spin
 * throw fade early, a well spun one floats straight.
 */
export const DISC_TYPES: DiscType[] = [
  {
    id: 'putter',
    name: 'ちいさめ 20cm',
    short: 'S',
    description: '小さくて重め。風に強く、まっすぐ速く飛ぶ（最大 約30m）',
    maxSpeed: 13,
    minSpeed: 2,
    maxAdvance: 0.6,
    stats: { speed: 4, glide: 2, control: 5 },
    spec: {
      mass: 0.07,
      radius: 0.1,
      thickness: 0.024,
      izFactor: 0.55,
      aero: { CL0: 0.3, CLa: 2.0, CD0: 0.085, CDa: 0.8, alpha0: -0.05, CM0: -0.003, CMa: 0.05, CMq: -0.012, CNr: -0.0003 },
    },
  },
  {
    id: 'midrange',
    name: 'ふつう 23.5cm',
    short: 'M',
    description: 'いちばん投げやすい定番サイズ（最大 約40m）',
    maxSpeed: 14,
    minSpeed: 2,
    maxAdvance: 0.6,
    stats: { speed: 3, glide: 4, control: 4 },
    spec: {
      mass: 0.085,
      radius: 0.1175,
      thickness: 0.026,
      izFactor: 0.55,
      aero: { CL0: 0.32, CLa: 2.0, CD0: 0.08, CDa: 0.75, alpha0: -0.05, CM0: -0.0015, CMa: 0.05, CMq: -0.012, CNr: -0.0003 },
    },
  },
  {
    id: 'driver',
    name: 'おおきめ 27cm',
    short: 'L',
    description: 'ふわっと長く浮く。遠くまで飛ぶけど風に流されやすい（最大 約50m）',
    maxSpeed: 14.5,
    minSpeed: 2,
    maxAdvance: 0.58,
    stats: { speed: 2, glide: 5, control: 3 },
    spec: {
      mass: 0.11,
      radius: 0.135,
      thickness: 0.028,
      izFactor: 0.55,
      aero: { CL0: 0.36, CLa: 2.0, CD0: 0.07, CDa: 0.7, alpha0: -0.05, CM0: -0.001, CMa: 0.045, CMq: -0.012, CNr: -0.0003 },
    },
  },
];

export function discById(id: string): DiscType {
  return DISC_TYPES.find((d) => d.id === id) ?? DISC_TYPES[1];
}
