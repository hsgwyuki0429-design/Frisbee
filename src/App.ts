import * as THREE from 'three';
import { audio } from './audio/Audio';
import { ALL_HOLES, DISTANCE_STAGE, PRACTICE_STAGE, RING_STAGE, TARGET_STAGE, TITLE_STAGE, WORLDS } from './data/stages';
import { GameSession, type SessionConfig, type SessionHost, type SessionResult, type StageResult } from './game/GameSession';
import { save, type Settings } from './save';
import { Hud } from './ui/Hud';
import { Screens } from './ui/screens';

export class App implements SessionHost {
  onStageLoaded = () => this.prewarm();
  readonly scene = new THREE.Scene();
  readonly canvas: HTMLCanvasElement;
  readonly hud: Hud;
  private renderer: THREE.WebGLRenderer;
  private screens: Screens;
  private session: GameSession | null = null;
  private lastConfig: SessionConfig | null = null;
  private timer = new THREE.Timer();
  private holeScores: { par: number; strokes: number }[] = [];

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    root.append(this.canvas);
    const q = save().settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.applyQuality(save().settings);

    const ui = document.createElement('div');
    ui.className = 'ui-root';
    root.append(ui);
    this.hud = new Hud(ui);
    this.screens = new Screens(ui);

    audio.setVolumes(save().settings.bgm, save().settings.sfx);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.session && this.session.mode !== 'demo' && !this.session.isPaused) this.onPause();
    });
    // Unlock audio on the first interaction anywhere.
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    this.resize();
  }

  start(): void {
    this.startDemo();
    this.screens.title(() => this.showMenu());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  settings(): Settings {
    return save().settings;
  }

  private applyQuality(s: Settings): void {
    const dpr = window.devicePixelRatio || 1;
    const ratio = s.quality === 'high' ? Math.min(dpr, 2) : s.quality === 'mid' ? Math.min(dpr, 1.5) : Math.min(dpr, 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.session?.resize();
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    const s = this.session;
    if (!s) return;
    s.update(dt);
    this.renderer.render(this.scene, s.rig.camera);
  }

  // ---------------------------------------------------------------- sessions

  private replaceSession(cfg: SessionConfig): void {
    this.session?.dispose();
    this.session = null;
    this.renderer.renderLists.dispose();
    this.session = new GameSession(this, cfg);
    this.session.resize();
    this.prewarm();
  }

  /** Compiles every material in the scene (hidden helpers included) to avoid hitches on first use. */
  prewarm(): void {
    const s = this.session;
    if (!s) return;
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      this.renderer.compile(this.scene, s.rig.camera);
    } catch {
      /* ignore */
    }
    for (const o of hidden) o.visible = false;
  }

  private startDemo(): void {
    this.replaceSession({ mode: 'demo', stages: [TITLE_STAGE] });
  }

  private play(cfg: SessionConfig): void {
    this.lastConfig = cfg;
    this.holeScores = [];
    this.screens.clear();
    audio.unlock();
    this.replaceSession(cfg);
  }

  private startWorld(id: string): void {
    if (id === 'all') {
      this.play({ mode: 'course', stages: ALL_HOLES, worldId: 'all', firstHoleNumber: 1 });
      return;
    }
    const idx = WORLDS.findIndex((w) => w.id === id);
    const w = WORLDS[idx];
    this.play({ mode: 'course', stages: w.holes, worldId: w.id, firstHoleNumber: idx * 3 + 1 });
  }

  private startChallenge(k: 'distance' | 'target' | 'rings'): void {
    const stage = k === 'distance' ? DISTANCE_STAGE : k === 'target' ? TARGET_STAGE : RING_STAGE;
    this.play({ mode: k, stages: [stage] });
  }

  private quitToMenu(): void {
    this.screens.closeModal();
    this.startDemo();
    this.showMenu();
  }

  // ---------------------------------------------------------------- screens

  private showMenu(): void {
    if (!this.session || this.session.mode !== 'demo') this.startDemo();
    audio.music('title');
    this.screens.menu({
      course: () => this.screens.worldSelect((id) => this.startWorld(id), () => this.showMenu()),
      challenge: () => this.screens.challengeSelect((k) => this.startChallenge(k), () => this.showMenu()),
      practice: () => this.play({ mode: 'practice', stages: [PRACTICE_STAGE] }),
      shop: () => this.screens.shop(() => this.showMenu(), (id) => this.session?.setSkin(id)),
      howto: () => this.screens.howto(() => this.showMenu()),
      settings: () => this.screens.settings(() => this.showMenu(), (s) => this.onSettings(s)),
    });
  }

  private onSettings(s: Settings): void {
    audio.setVolumes(s.bgm, s.sfx);
    this.applyQuality(s);
  }

  onPause(): void {
    const s = this.session;
    if (!s || s.mode === 'demo') return;
    s.setPaused(true);
    const label =
      s.mode === 'course' ? 'コース' : s.mode === 'practice' ? 'れんしゅう' : s.mode === 'distance' ? 'ロングドライブ' : s.mode === 'target' ? 'まとあて' : 'リングくぐり';
    this.screens.pause(
      {
        resume: () => s.setPaused(false),
        restart: () => {
          s.setPaused(false);
          if (s.mode === 'course') s.restartStage();
          else if (this.lastConfig) this.play(this.lastConfig);
        },
        settings: () =>
          this.screens.settings(
            () => {
              this.screens.closeModal();
              this.onPause();
            },
            (st) => this.onSettings(st),
            true,
          ),
        quit: () => this.quitToMenu(),
      },
      label,
    );
  }

  onStageResult(r: StageResult, next: () => void): void {
    this.holeScores.push({ par: r.hole.par, strokes: r.hole.strokes });
    this.screens.holeResult(r, this.holeScores, next);
  }

  onSessionEnd(r: SessionResult): void {
    this.hud.show(false);
    this.screens.sessionResult(
      r,
      () => {
        if (this.lastConfig) this.play(this.lastConfig);
      },
      () => this.quitToMenu(),
    );
  }
}
