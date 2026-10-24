import { CylinderCollider, ShellCollider, TorusCollider, type Collider } from './Colliders';
import type { DiscBody } from './DiscBody';
import { MATERIALS } from './materials';
import type { Volume } from './PhysicsWorld';

/** Disc golf target dimensions (slightly larger than regulation for friendlier play). */
export const BASKET = {
  poleR: 0.03,
  trayR: 0.37,
  trayY0: 0.55,
  trayY1: 0.84,
  chainR: 0.34,
  chainY0: 0.86,
  chainY1: 1.5,
  bandY: 1.52,
  topY: 1.62,
  capR: 0.2,
};

export interface BasketPhysics {
  colliders: Collider[];
  chains: Volume;
  /** True when the disc sits inside the tray. */
  holds(disc: DiscBody): boolean;
}

export function createBasketPhysics(id: string, x: number, y: number, z: number): BasketPhysics {
  const b = BASKET;
  const colliders: Collider[] = [
    new CylinderCollider(x, z, y - 0.2, y + b.topY, b.poleR, MATERIALS.metal, 'pole'),
    new CylinderCollider(x, z, y + b.trayY0 - 0.04, y + b.trayY0, b.trayR, MATERIALS.metal, 'tray'),
    new ShellCollider(x, z, y + b.trayY0, y + b.trayY1, b.trayR, 0.016, MATERIALS.metal, 'tray'),
    new TorusCollider(x, y + b.bandY, z, 0, 1, 0, b.chainR, 0.025, MATERIALS.metal, 'band'),
    new CylinderCollider(x, z, y + b.bandY, y + b.topY, b.capR, MATERIALS.metal, 'band'),
  ];
  const chains: Volume = {
    id: `${id}-chains`,
    kind: 'cylinder',
    x,
    y: y + b.chainY0,
    z,
    r: b.chainR + 0.05,
    y0: y + b.chainY0 - 0.06,
    y1: y + b.chainY1,
    linDrag: 9,
    quadDrag: 1.7,
    angDrag: 9,
  };
  return {
    colliders,
    chains,
    holds(disc: DiscBody): boolean {
      const r = Math.hypot(disc.x - x, disc.z - z);
      return r < b.trayR - 0.015 && disc.y > y + b.trayY0 - 0.05 && disc.y < y + b.trayY1 + 0.25;
    },
  };
}
