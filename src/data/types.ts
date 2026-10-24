export type Theme = 'grass' | 'beach' | 'sky';

export type XZ = [number, number];
export type XYZ = [number, number, number];

export type LandShape =
  | { kind: 'path'; pts: XZ[]; width: number }
  | { kind: 'blob'; x: number; z: number; r: number };

export type ObjDef =
  | { t: 'tree'; x: number; z: number; s?: number; v?: 'round' | 'pine' | 'palm' | 'cloud' | 'lollipop' }
  | { t: 'bush'; x: number; z: number; s?: number }
  | { t: 'rock'; x: number; z: number; s?: number }
  | { t: 'block'; x: number; y: number; z: number; v?: 'brick' | 'lucky' | 'stone'; n?: number; yaw?: number }
  | { t: 'wall'; x: number; z: number; w: number; h: number; d?: number; yaw?: number; v?: 'brick' | 'stone' | 'wood' }
  | { t: 'mushroom'; x: number; z: number; s?: number; c?: number }
  | { t: 'pipe'; x: number; z: number; h: number; r?: number; c?: number }
  | { t: 'ring'; x: number; y: number; z: number; yaw?: number; r?: number; v?: 'coin' | 'boost' }
  | { t: 'coin'; x: number; y: number; z: number }
  | { t: 'coins'; from: XYZ; to: XYZ; n: number }
  | { t: 'flowers'; x: number; z: number; r: number; n: number }
  | { t: 'umbrella'; x: number; z: number; c?: number }
  | { t: 'cloudpad'; x: number; y: number; z: number; r: number }
  | { t: 'target'; x: number; z: number; r: number }
  | { t: 'marker'; x: number; z: number; text: string; c?: number };

export interface StageDef {
  id: string;
  name: string;
  theme: Theme;
  par?: number;
  tee: XZ;
  /** Disc golf basket position. */
  basket?: XZ;
  /** Extra baskets (practice field). */
  extraBaskets?: XZ[];
  land: LandShape[];
  landHeight?: number;
  hills?: { x: number; z: number; r: number; h: number }[];
  ponds?: { x: number; z: number; r: number }[];
  sand?: { x: number; z: number; r: number }[];
  rough?: { x: number; z: number; r: number }[];
  fairway?: { pts: XZ[]; width: number };
  objects: ObjDef[];
  /** Min/max wind speed in m/s. */
  wind: [number, number];
  /** Fixed wind direction (radians, 0 = toward -z). Random when omitted. */
  windDir?: number;
  /** Amount of random scenery (flowers, tufts). */
  decor?: number;
  seed?: number;
}
