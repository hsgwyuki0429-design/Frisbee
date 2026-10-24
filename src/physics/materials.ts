/** Surface properties used by the contact solver and for picking impact sounds. */
export interface SurfaceMaterial {
  id: string;
  /** Coefficient of restitution for impacts faster than the bounce threshold. */
  restitution: number;
  /** Coulomb friction coefficient. */
  friction: number;
  /** Linear velocity damping per second while touching (grass drag etc.). */
  linDamp: number;
  /** Angular velocity damping per second while touching. */
  angDamp: number;
  /** Sound family for impacts. */
  sound: 'grass' | 'sand' | 'wood' | 'stone' | 'metal' | 'bouncy' | 'snow' | 'ice' | 'cloud';
  /** Extra upward kick (m/s) applied on impact; used by bouncy mushrooms. */
  boost?: number;
}

const m = (mat: SurfaceMaterial) => mat;

export const MATERIALS = {
  fairway: m({ id: 'fairway', restitution: 0.32, friction: 0.5, linDamp: 0.7, angDamp: 1.0, sound: 'grass' }),
  grass: m({ id: 'grass', restitution: 0.25, friction: 0.6, linDamp: 1.1, angDamp: 1.4, sound: 'grass' }),
  rough: m({ id: 'rough', restitution: 0.12, friction: 0.85, linDamp: 3.0, angDamp: 3.0, sound: 'grass' }),
  sand: m({ id: 'sand', restitution: 0.04, friction: 1.1, linDamp: 7.0, angDamp: 7.0, sound: 'sand' }),
  dirt: m({ id: 'dirt', restitution: 0.2, friction: 0.7, linDamp: 1.5, angDamp: 1.5, sound: 'grass' }),
  snow: m({ id: 'snow', restitution: 0.06, friction: 0.9, linDamp: 5.0, angDamp: 5.0, sound: 'snow' }),
  ice: m({ id: 'ice', restitution: 0.25, friction: 0.04, linDamp: 0.08, angDamp: 0.3, sound: 'ice' }),
  cloud: m({ id: 'cloud', restitution: 0.35, friction: 0.7, linDamp: 2.5, angDamp: 2.5, sound: 'cloud' }),
  wood: m({ id: 'wood', restitution: 0.42, friction: 0.45, linDamp: 0, angDamp: 0, sound: 'wood' }),
  stone: m({ id: 'stone', restitution: 0.5, friction: 0.45, linDamp: 0.3, angDamp: 0.3, sound: 'stone' }),
  metal: m({ id: 'metal', restitution: 0.45, friction: 0.3, linDamp: 0, angDamp: 0, sound: 'metal' }),
  bouncy: m({ id: 'bouncy', restitution: 0.95, friction: 0.35, linDamp: 0, angDamp: 0, sound: 'bouncy', boost: 7 }),
};

export type MaterialId = keyof typeof MATERIALS;

/** Terrain material ids stored per heightfield vertex. Order matters (Uint8 index). */
export const TERRAIN_MATS: SurfaceMaterial[] = [
  MATERIALS.grass,
  MATERIALS.fairway,
  MATERIALS.rough,
  MATERIALS.sand,
  MATERIALS.dirt,
  MATERIALS.snow,
  MATERIALS.ice,
  MATERIALS.cloud,
];

export const TM = {
  grass: 0,
  fairway: 1,
  rough: 2,
  sand: 3,
  dirt: 4,
  snow: 5,
  ice: 6,
  cloud: 7,
} as const;
