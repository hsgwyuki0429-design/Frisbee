import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Theme } from '../data/types';
import { canvasTexture } from '../render/textures';
import { toon } from '../render/toon';
import { mulberry32 } from './noise';
import type { TerrainData } from './terrainGen';

interface ThemeLook {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  water: number;
  waterShallow: number;
  cloud: number;
}

export const LOOKS: Record<Theme, ThemeLook> = {
  grass: {
    skyTop: 0x2f8fff, skyHorizon: 0xb8ecff, skyBottom: 0xe6f8ff, fog: 0xc4ecff, fogNear: 160, fogFar: 900,
    hemiSky: 0xd8f1ff, hemiGround: 0x6aa85a, sun: 0xfff3dd, water: 0x1fa3ea, waterShallow: 0x5fe0f0, cloud: 0xffffff,
  },
  beach: {
    skyTop: 0x1d9cf5, skyHorizon: 0xc6f3ff, skyBottom: 0xf2fdff, fog: 0xcff4ff, fogNear: 180, fogFar: 950,
    hemiSky: 0xe4f6ff, hemiGround: 0xc8b07a, sun: 0xfff0d0, water: 0x13b6e0, waterShallow: 0x6af0e8, cloud: 0xffffff,
  },
  sky: {
    skyTop: 0x6a8cff, skyHorizon: 0xffd6f0, skyBottom: 0xfff2fb, fog: 0xf6dcf5, fogNear: 140, fogFar: 800,
    hemiSky: 0xfbe8ff, hemiGround: 0x9a86c8, sun: 0xfff1e6, water: 0x13b6e0, waterShallow: 0x6af0e8, cloud: 0xffffff,
  },
};

export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private water: THREE.Mesh | null = null;
  private foam: THREE.Mesh | null = null;
  private cloudSea: THREE.Mesh | null = null;
  private clouds: { obj: THREE.Object3D; speed: number; base: THREE.Vector3 }[] = [];
  private uniforms: { uTime: { value: number } } = { uTime: { value: 0 } };
  private readonly sunDir = new THREE.Vector3(-0.45, 0.8, 0.35).normalize();
  readonly look: ThemeLook;

  constructor(
    private scene: THREE.Scene,
    readonly theme: Theme,
    terrain: TerrainData | null,
    shadows: { enabled: boolean; size: number },
    center: THREE.Vector3,
    seed = 3,
  ) {
    const look = LOOKS[theme];
    this.look = look;
    scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
    scene.background = new THREE.Color(look.skyHorizon);

    this.hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, 1.35);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(look.sun, 2.1);
    this.sun.castShadow = shadows.enabled;
    if (shadows.enabled) {
      this.sun.shadow.mapSize.set(shadows.size, shadows.size);
      const s = 26;
      const cam = this.sun.shadow.camera;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = 160;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.sky = this.makeSky(look);
    this.group.add(this.sky);
    this.addSunSprite();

    const rnd = mulberry32(seed);
    if (theme === 'sky') {
      this.cloudSea = this.makeCloudSea();
      this.group.add(this.cloudSea);
      this.group.add(this.makeRainbow(center));
    } else {
      this.water = this.makeWater(look);
      this.group.add(this.water);
      if (terrain) {
        this.foam = this.makeFoam(terrain);
        if (this.foam) this.group.add(this.foam);
      }
      this.addDistantIslands(center, rnd, theme);
    }
    this.addClouds(center, rnd, theme);
    scene.add(this.group);
    this.focus(center);
  }

  /** Keeps the shadow frustum centred on what the camera is looking at. */
  focus(p: THREE.Vector3): void {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 80);
    this.sun.target.position.copy(p);
    this.sun.target.updateMatrixWorld();
  }

  update(dt: number, camera: THREE.Camera): void {
    this.uniforms.uTime.value += dt;
    this.sky.position.copy(camera.position);
    for (const c of this.clouds) {
      c.obj.position.x = c.base.x + Math.sin(this.uniforms.uTime.value * c.speed) * 6;
    }
    if (this.water) {
      this.water.position.x = Math.round(camera.position.x / 50) * 50;
      this.water.position.z = Math.round(camera.position.z / 50) * 50;
    }
    if (this.cloudSea) {
      this.cloudSea.position.x = Math.round(camera.position.x / 50) * 50;
      this.cloudSea.position.z = Math.round(camera.position.z / 50) * 50;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !mat.userData.shared) mat.dispose();
    });
    this.sun.shadow.map?.dispose();
  }

  private makeSky(look: ThemeLook): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(look.skyTop) },
        horizon: { value: new THREE.Color(look.skyHorizon) },
        bottom: { value: new THREE.Color(look.skyBottom) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vDir;
        void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.75, h), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.3, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  private addSunSprite(): void {
    const tex = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(0.25, 'rgba(255,250,210,1)');
      g.addColorStop(0.32, 'rgba(255,240,190,0.55)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true }));
    s.scale.set(220, 220, 1);
    s.position.copy(this.sunDir).multiplyScalar(1200);
    s.renderOrder = -9;
    // Sun follows the sky dome.
    this.sky.add(s);
  }

  private makeWater(look: ThemeLook): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uColor: { value: new THREE.Color(look.water) }, uLight: { value: new THREE.Color(look.waterShallow) } },
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uColor; uniform vec3 uLight; uniform float uTime;
        varying vec3 vW;
        void main(){
          vec2 p = vW.xz;
          float t = uTime;
          float a = sin(p.x * 0.21 + sin(p.y * 0.13 + t * 0.7) * 2.0 + t * 0.9);
          float b = sin(p.y * 0.19 + sin(p.x * 0.11 - t * 0.5) * 2.2 - t * 0.6);
          float w = a * b;
          vec3 c = mix(uColor, uLight, smoothstep(0.35, 0.9, w) * 0.45);
          float sparkle = smoothstep(0.93, 0.97, w);
          c = mix(c, vec3(1.0), sparkle * 0.85);
          gl_FragColor = vec4(c, 0.82);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      fog: true,
      depthWrite: false,
    });
    mat.uniforms.uTime = this.uniforms.uTime;
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 1;
    m.name = 'water';
    return m;
  }

  /** White foam band where the terrain crosses the waterline. */
  private makeFoam(t: TerrainData): THREE.Mesh | null {
    const hf = t.hf;
    const positions: number[] = [];
    const heights: number[] = [];
    const idx: number[] = [];
    const map = new Map<number, number>();
    const vid = (i: number, j: number): number => {
      const k = j * hf.nx + i;
      let v = map.get(k);
      if (v === undefined) {
        v = positions.length / 3;
        positions.push(hf.vertexX(i), 0.03, hf.vertexZ(j));
        heights.push(hf.heights[k]);
        map.set(k, v);
      }
      return v;
    };
    for (let j = 0; j < hf.nz - 1; j++) {
      for (let i = 0; i < hf.nx - 1; i++) {
        const hs = [hf.heights[j * hf.nx + i], hf.heights[j * hf.nx + i + 1], hf.heights[(j + 1) * hf.nx + i], hf.heights[(j + 1) * hf.nx + i + 1]];
        const lo = Math.min(...hs);
        const hi = Math.max(...hs);
        if (hi < -0.9 || lo > 0.25) continue;
        const a = vid(i, j);
        const b = vid(i + 1, j);
        const c = vid(i, j + 1);
        const d = vid(i + 1, j + 1);
        idx.push(a, c, b, b, c, d);
      }
    }
    if (!idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aH', new THREE.Float32BufferAttribute(heights, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `
        #include <fog_pars_vertex>
        attribute float aH; varying float vH; varying vec3 vW;
        void main(){ vH = aH; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime; varying float vH; varying vec3 vW;
        void main(){
          float wave = sin(uTime * 1.6 + vW.x * 0.15 + vW.z * 0.1) * 0.12;
          float edge = -0.42 + wave;
          float a = smoothstep(edge - 0.05, edge + 0.04, vH) * (1.0 - smoothstep(-0.02, 0.06, vH));
          float inner = smoothstep(edge - 0.35, edge - 0.3, vH) * (1.0 - smoothstep(edge - 0.25, edge - 0.2, vH));
          a = max(a, inner * 0.55);
          if (a < 0.02) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.9);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    mat.uniforms.uTime = this.uniforms.uTime;
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 2;
    return m;
  }

  private makeCloudSea(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime; varying vec3 vW;
        float puff(vec2 p){ vec2 g = floor(p); vec2 f = fract(p) - 0.5; float h = fract(sin(dot(g, vec2(12.9898,78.233))) * 43758.5453); float r = 0.32 + 0.16 * h; return smoothstep(r, r - 0.04, length(f + vec2(h - 0.5, fract(h * 7.0) - 0.5) * 0.2)); }
        void main(){
          vec2 p = vW.xz * 0.045 + vec2(uTime * 0.02, 0.0);
          float a = max(puff(p), puff(p * 1.7 + 3.1) * 0.9);
          vec3 base = vec3(0.98, 0.9, 0.98);
          vec3 c = mix(base * vec3(0.92, 0.88, 0.98), vec3(1.0), a);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true,
    });
    mat.uniforms.uTime = this.uniforms.uTime;
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -16;
    return m;
  }

  private makeRainbow(center: THREE.Vector3): THREE.Object3D {
    const g = new THREE.Group();
    const colors = [0xff5c5c, 0xffa64d, 0xffe35c, 0x6be36b, 0x5cb8ff, 0xa77bff];
    colors.forEach((c, i) => {
      const geo = new THREE.TorusGeometry(260 - i * 9, 4.6, 6, 64, Math.PI);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
      g.add(m);
    });
    g.position.set(center.x + 120, -40, center.z - 520);
    g.rotation.y = 0.35;
    return g;
  }

  private addClouds(center: THREE.Vector3, rnd: () => number, theme: Theme): void {
    const mat = toon(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.25 });
    const shade = toon(0xe3ecff, { emissive: 0xd8e4ff, emissiveIntensity: 0.15 });
    const count = theme === 'sky' ? 26 : 18;
    for (let i = 0; i < count; i++) {
      const parts: THREE.BufferGeometry[] = [];
      const n = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const r = 6 + rnd() * 7;
        const s = new THREE.SphereGeometry(r, 14, 10);
        s.translate((k - n / 2) * 7 + rnd() * 3, rnd() * 4, rnd() * 5);
        parts.push(s);
      }
      const face = rnd() < 0.3;
      if (face) {
        // A big round centre to carry the face.
        const s = new THREE.SphereGeometry(11, 18, 12);
        parts.push(s);
      }
      const geo = mergeGeometries(parts)!;
      parts.forEach((p) => p.dispose());
      const cloud = new THREE.Mesh(geo, mat);
      const bottom = new THREE.Mesh(geo, shade);
      bottom.scale.set(1.02, 0.4, 1.02);
      bottom.position.y = -2.5;
      cloud.add(bottom);
      const a = rnd() * Math.PI * 2;
      const dist = 230 + rnd() * 320;
      const y = theme === 'sky' ? -10 + rnd() * 90 : 45 + rnd() * 90;
      cloud.position.set(center.x + Math.cos(a) * dist, y, center.z + Math.sin(a) * dist);
      cloud.scale.setScalar(0.8 + rnd() * 0.9);
      cloud.lookAt(center.x, y, center.z);
      if (face) this.addFace(cloud, 11);
      this.group.add(cloud);
      this.clouds.push({ obj: cloud, speed: 0.02 + rnd() * 0.04, base: cloud.position.clone() });
    }
  }

  /** Cute eyes for clouds and hills, placed on the front of a sphere of radius r. */
  private addFace(obj: THREE.Object3D, r: number): void {
    const eyeGeo = new THREE.SphereGeometry(1, 12, 10);
    const black = toon(0x23182e);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, black);
      eye.scale.set(r * 0.08, r * 0.15, r * 0.06);
      eye.position.set(side * r * 0.24, r * 0.36, r * 0.9);
      const hl = new THREE.Mesh(eyeGeo, white);
      hl.scale.set(0.35, 0.25, 0.5);
      hl.position.set(0.2, 0.45, 0.6);
      eye.add(hl);
      obj.add(eye);
    }
  }

  private addDistantIslands(center: THREE.Vector3, rnd: () => number, theme: Theme): void {
    const greens = theme === 'beach' ? [0x6fd24a, 0x58c23e, 0x8ade5e] : [0x4fc23f, 0x3faa38, 0x6fd450];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
      const dist = 340 + rnd() * 260;
      const r = 40 + rnd() * 70;
      const geo = new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      // Horizontal stripes for the toy-like look.
      const col = new Float32Array(geo.attributes.position.count * 3);
      const c1 = new THREE.Color(greens[i % greens.length]);
      const c2 = c1.clone().multiplyScalar(0.82);
      for (let v = 0; v < geo.attributes.position.count; v++) {
        const y = geo.attributes.position.getY(v);
        const cc = Math.floor(y / (r * 0.18)) % 2 === 0 ? c1 : c2;
        col[v * 3] = cc.r;
        col[v * 3 + 1] = cc.g;
        col[v * 3 + 2] = cc.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const hill = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
      hill.scale.y = 0.55 + rnd() * 0.6;
      hill.position.set(center.x + Math.cos(a) * dist, -2, center.z + Math.sin(a) * dist);
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.12, 2.4, 32), toon(0xf8e2a0));
      beach.position.y = 0.2;
      beach.scale.y = 1 / hill.scale.y;
      hill.add(beach);
      this.group.add(hill);
    }
  }
}
