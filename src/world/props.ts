import * as THREE from 'three';
import { BASKET } from '../physics/basket';
import { coinTexture, flagTexture, signTexture, checkerTexture } from '../render/textures';
import { addOutline, outlineMaterial, toon } from '../render/toon';

const OUTLINE = 0x2a2140;

/** A plane that reads correctly from both sides (two back-to-back faces). */
function twoSidedPlane(w: number, h: number, map: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshToonMaterial({ map });
  const front = new THREE.Mesh(geo, mat);
  const back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI;
  g.add(front, back);
  return g;
}

export interface BasketModel {
  root: THREE.Group;
  chains: THREE.Group;
  arrow: THREE.Object3D;
  beam: THREE.Mesh;
  shake(amount: number): void;
  update(dt: number, t: number): void;
}

export function buildBasket(label: string, flagColor = '#ff4f6d'): BasketModel {
  const b = BASKET;
  const root = new THREE.Group();
  const metal = toon(0xc9cfe0);
  const yellow = toon(0xffd23f);
  const red = toon(0xff5a5a);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(b.poleR, b.poleR, b.topY + 0.2, 10), metal);
  pole.position.y = (b.topY + 0.2) / 2 - 0.2;
  pole.castShadow = true;
  root.add(pole);

  // Tray: open cylinder + floor.
  const trayWall = new THREE.Mesh(new THREE.CylinderGeometry(b.trayR, b.trayR * 0.94, b.trayY1 - b.trayY0, 24, 1, true), toon(0xffd23f, { side: THREE.DoubleSide }));
  trayWall.position.y = (b.trayY0 + b.trayY1) / 2;
  trayWall.castShadow = true;
  root.add(trayWall);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(b.trayR, 0.03, 8, 28), red);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = b.trayY1;
  root.add(rim);
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(b.trayR * 0.94, b.trayR * 0.94, 0.04, 24), metal);
  floor.position.y = b.trayY0 - 0.02;
  root.add(floor);

  // Top band and cap.
  const band = new THREE.Mesh(new THREE.TorusGeometry(b.chainR, 0.035, 8, 28), yellow);
  band.rotation.x = Math.PI / 2;
  band.position.y = b.bandY;
  band.castShadow = true;
  root.add(band);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(b.capR, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
  cap.scale.y = 0.6;
  cap.position.y = b.bandY;
  root.add(cap);
  addOutline(cap, OUTLINE, 0.015);

  // Chains: strands from the band down to the pole.
  const chains = new THREE.Group();
  chains.position.y = b.bandY;
  const chainMat = toon(0xe6eaf5, { emissive: 0x555a66, emissiveIntensity: 0.3 });
  const strands = 14;
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * b.chainR * 0.97, 0, Math.sin(a) * b.chainR * 0.97);
    const bottom = new THREE.Vector3(Math.cos(a + 0.5) * 0.06, b.chainY0 - b.bandY + 0.04, Math.sin(a + 0.5) * 0.06);
    const mid = top.clone().lerp(bottom, 0.5);
    mid.x *= 1.15;
    mid.z *= 1.15;
    const curve = new THREE.QuadraticBezierCurve3(top, mid, bottom);
    const geo = new THREE.TubeGeometry(curve, 8, 0.012, 4, false);
    chains.add(new THREE.Mesh(geo, chainMat));
  }
  root.add(chains);

  // Number flag.
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), metal);
  flagPole.position.y = b.topY + 0.25;
  root.add(flagPole);
  const flag = new THREE.Group();
  const flagFace = twoSidedPlane(0.62, 0.4, flagTexture(label, flagColor));
  flagFace.position.x = 0.31;
  flag.add(flagFace);
  flag.position.set(0, b.topY + 0.5, 0);
  root.add(flag);

  // Floating arrow marker.
  const arrow = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 4), toon(0xff4f6d, { emissive: 0xff4f6d, emissiveIntensity: 0.35 }));
  head.rotation.x = Math.PI;
  addOutline(head, OUTLINE, 0.04);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.6, 0.28), toon(0xff4f6d, { emissive: 0xff4f6d, emissiveIntensity: 0.35 }));
  shaft.position.y = 0.6;
  addOutline(shaft, OUTLINE, 0.04);
  arrow.add(head, shaft);
  arrow.position.y = 3.4;
  root.add(arrow);

  // Soft light column so the target reads from afar.
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 16, 1, true), beamMat);
  beam.position.y = 20;
  root.add(beam);

  let shakeT = 0;
  let shakeAmp = 0;
  return {
    root,
    chains,
    arrow,
    beam,
    shake(amount: number) {
      shakeAmp = Math.min(0.35, shakeAmp + amount);
      shakeT = 0;
    },
    update(dt: number, t: number) {
      arrow.position.y = 3.3 + Math.sin(t * 3) * 0.18;
      arrow.rotation.y += dt * 1.6;
      flag.rotation.y = Math.sin(t * 2.3) * 0.25;
      if (shakeAmp > 0.001) {
        shakeT += dt;
        chains.rotation.z = Math.sin(shakeT * 26) * shakeAmp;
        chains.rotation.x = Math.cos(shakeT * 21) * shakeAmp * 0.7;
        shakeAmp *= Math.exp(-dt * 3.5);
      }
    },
  };
}

export function buildTee(hole: number | string, par: number | null, dist: number | null, yaw: number): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 4.2), [
    toon(0xd85a8a),
    toon(0xd85a8a),
    new THREE.MeshToonMaterial({ map: padTexture() }),
    toon(0xd85a8a),
    toon(0xd85a8a),
    toon(0xd85a8a),
  ]);
  pad.position.y = 0.05;
  pad.receiveShadow = true;
  g.add(pad);
  const lines: { text: string; size: number; color?: string }[] = [{ text: typeof hole === 'number' ? `HOLE ${hole}` : hole, size: 74, color: '#e2574c' }];
  if (par !== null) lines.push({ text: `PAR ${par}`, size: 60 });
  if (dist !== null) lines.push({ text: `${Math.round(dist)} m`, size: 54, color: '#4a8fe0' });
  const sign = twoSidedPlane(1.6, 1.0, signTexture(lines));
  sign.position.set(-2.6, 1.55, 2.6);
  sign.rotation.y = 0.5;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), toon(0x9b5a2e));
  post.position.set(-2.6, 0.6, 2.6);
  g.add(sign, post);
  g.rotation.y = yaw;
  return g;
}

function padTexture(): THREE.Texture {
  const t = checkerTexture('#ffb3cf', '#fff4f8', 8);
  return t;
}

let coinGeo: THREE.BufferGeometry | null = null;
let coinMats: THREE.Material[] | null = null;
export function buildCoin(): THREE.Mesh {
  if (!coinGeo) {
    coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 24);
    coinGeo.rotateX(Math.PI / 2);
    coinGeo.userData.shared = true;
    const face = toon(0xffffff, { map: coinTexture(), emissive: 0x664400, emissiveIntensity: 0.4 });
    face.userData.shared = true;
    const edge = toon(0xffc21f, { emissive: 0x664400, emissiveIntensity: 0.4 });
    coinMats = [edge, face, face];
  }
  const m = new THREE.Mesh(coinGeo, coinMats!);
  m.castShadow = true;
  const o = new THREE.Mesh(coinGeo, outlineMaterial(0x6b3d00, 0.03));
  m.add(o);
  return m;
}

export function buildRing(radius: number, kind: 'coin' | 'boost'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'coin') {
    const colors = [0xff5c5c, 0xffa64d, 0xffe35c, 0x6be36b, 0x5cb8ff, 0xa77bff];
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const geo = new THREE.TorusGeometry(radius, 0.14, 8, 8, (Math.PI * 2) / segs);
      const m = new THREE.Mesh(geo, toon(colors[i % colors.length], { emissive: colors[i % colors.length], emissiveIntensity: 0.3 }));
      m.rotation.z = (i / segs) * Math.PI * 2;
      g.add(m);
    }
  } else {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.17, 10, 40), toon(0x39c6ff, { emissive: 0x1aa0ff, emissiveIntensity: 0.6 }));
    g.add(ring);
    addOutline(ring, 0x103a7a, 0.04);
    // Chevrons pointing forward (-z).
    for (let i = 0; i < 3; i++) {
      const chev = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 3), toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }));
      chev.rotation.x = -Math.PI / 2;
      chev.position.set((i - 1) * 0.55, -radius - 0.55, 0);
      g.add(chev);
    }
  }
  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.96, 32),
    new THREE.MeshBasicMaterial({ color: kind === 'boost' ? 0x8fe3ff : 0xfff6b0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
  );
  g.add(inner);
  return g;
}

export function buildMarker(text: string, color: number): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), toon(0xffffff));
  post.position.y = 0.8;
  g.add(post);
  const hex = '#' + color.toString(16).padStart(6, '0');
  const flag = twoSidedPlane(0.9, 0.56, flagTexture(text, hex));
  flag.position.set(0.47, 1.3, 0);
  g.add(flag);
  return g;
}
