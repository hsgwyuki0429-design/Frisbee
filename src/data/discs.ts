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

export const DISC_TYPES: DiscType[] = [
  {
    id: 'putter',
    name: 'パター',
    short: 'PUTT',
    description: 'まっすぐ飛ぶ。バスケット近くの正確なショットに（最大 約50m）',
    maxSpeed: 19,
    minSpeed: 3,
    maxAdvance: 0.62,
    stats: { speed: 2, glide: 3, control: 5 },
    spec: {
      mass: 0.173,
      radius: 0.106,
      thickness: 0.021,
      izFactor: 0.6,
      aero: { CL0: 0.2, CLa: 2.3, CD0: 0.1, CDa: 1.1, alpha0: -0.05, CM0: 0.0, CMa: 0.09, CMq: -0.006, CNr: -0.00003 },
    },
  },
  {
    id: 'midrange',
    name: 'ミッドレンジ',
    short: 'MID',
    description: 'バランス型。中距離をきれいに攻める（最大 約80m）',
    maxSpeed: 24,
    minSpeed: 4,
    maxAdvance: 0.6,
    stats: { speed: 3, glide: 4, control: 4 },
    spec: {
      mass: 0.175,
      radius: 0.106,
      thickness: 0.019,
      izFactor: 0.62,
      aero: { CL0: 0.18, CLa: 2.4, CD0: 0.08, CDa: 1.0, alpha0: -0.05, CM0: -0.003, CMa: 0.12, CMq: -0.006, CNr: -0.00003 },
    },
  },
  {
    id: 'driver',
    name: 'ドライバー',
    short: 'DRIVE',
    description: 'いちばん遠くへ。回転が足りないとフラつく（最大 約130m）',
    maxSpeed: 29,
    minSpeed: 5,
    maxAdvance: 0.58,
    stats: { speed: 5, glide: 4, control: 2 },
    spec: {
      mass: 0.172,
      radius: 0.106,
      thickness: 0.017,
      izFactor: 0.65,
      aero: { CL0: 0.15, CLa: 2.4, CD0: 0.06, CDa: 0.9, alpha0: -0.05, CM0: -0.005, CMa: 0.14, CMq: -0.007, CNr: -0.00003 },
    },
  },
];

export function discById(id: string): DiscType {
  return DISC_TYPES.find((d) => d.id === id) ?? DISC_TYPES[1];
}
