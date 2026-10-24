import type * as THREE from 'three';

export type SfxName =
  | 'click'
  | 'select'
  | 'back'
  | 'swipe'
  | 'throw'
  | 'miss'
  | 'coin'
  | 'ring'
  | 'boost'
  | 'lucky'
  | 'boing'
  | 'leaves'
  | 'chains'
  | 'clank'
  | 'splash'
  | 'thud'
  | 'sand'
  | 'wood'
  | 'stone'
  | 'snow'
  | 'cloud'
  | 'fanfare'
  | 'holeIn'
  | 'ob'
  | 'tick'
  | 'whoosh'
  | 'star'
  | 'buy'
  | 'error';

export type ParticleKind = 'sparkle' | 'dust' | 'leaf' | 'splash' | 'confetti' | 'star' | 'cloud';

export type PopupStyle = 'coin' | 'nice' | 'info' | 'bad' | 'big';

export interface FXHub {
  sfx(name: SfxName, opts?: { vol?: number; rate?: number }): void;
  burst(kind: ParticleKind, pos: THREE.Vector3, count: number, color?: number, speed?: number): void;
  popup(text: string, pos: THREE.Vector3, style?: PopupStyle): void;
  shake(amount: number): void;
}
