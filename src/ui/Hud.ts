import { DISC_TYPES, type DiscType } from '../data/discs';
import type { PopupStyle } from '../game/fxTypes';
import { el } from './dom';

export interface HudInfo {
  title: string;
  sub: string;
  strokes: string;
  dist: string;
}

/** In-game heads-up display (DOM overlay). */
export class Hud {
  readonly root: HTMLDivElement;
  readonly aimLayer: HTMLDivElement;
  private info: HTMLDivElement;
  private distEl: HTMLDivElement;
  private coinsEl: HTMLDivElement;
  private windEl: HTMLDivElement;
  private windArrow: HTMLDivElement;
  private windText: HTMLSpanElement;
  private mapWrap: HTMLDivElement;
  private mapCanvas: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement | null = null;
  private mapFn: ((x: number, z: number) => [number, number]) | null = null;
  private picker: HTMLDivElement;
  private flight: HTMLDivElement;
  private skipBtn: HTMLButtonElement;
  private toastEl: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private popups: HTMLDivElement;
  private extra: HTMLDivElement;
  private toastTimer = 0;
  private bannerTimer = 0;
  onPause: (() => void) | null = null;
  onSkip: (() => void) | null = null;
  onPickDisc: ((d: DiscType) => void) | null = null;
  onMapToggle: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden');
    this.aimLayer = el('div', 'aim-layer');
    this.popups = el('div', 'popups');
    this.root.append(this.aimLayer, this.popups);

    const top = el('div', 'hud-top');
    this.info = el('div', 'hud-card hud-info');
    this.distEl = el('div', 'hud-card hud-dist');
    const right = el('div', 'hud-right');
    this.coinsEl = el('div', 'hud-card hud-coins', '<i class="coin-ico"></i><span>0</span>');
    this.windEl = el('div', 'hud-card hud-wind');
    this.windArrow = el('div', 'wind-arrow', '➤');
    this.windText = el('span', 'wind-text', '0.0');
    this.windEl.append(this.windArrow, this.windText);
    const pause = el('button', 'btn icon hud-pause', '<span>Ⅱ</span>');
    pause.setAttribute('aria-label', 'ポーズ');
    pause.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPause?.();
    });
    right.append(this.coinsEl, this.windEl, pause);
    top.append(this.info, this.distEl, right);

    this.mapWrap = el('div', 'hud-map');
    this.mapCanvas = el('canvas');
    this.mapCanvas.width = 220;
    this.mapCanvas.height = 220;
    this.mapWrap.append(this.mapCanvas);
    this.mapWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this.mapWrap.classList.toggle('big');
      this.onMapToggle?.();
    });

    this.picker = el('div', 'disc-picker hidden');
    for (const d of DISC_TYPES) {
      const b = el('button', 'disc-btn', `<i class="disc-ico ${d.id}"></i><b>${d.name}</b><small>${'●'.repeat(d.stats.speed)}${'○'.repeat(5 - d.stats.speed)}</small>`);
      b.dataset.id = d.id;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPickDisc?.(d);
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.picker.append(b);
    }

    this.flight = el('div', 'hud-flight hidden');
    this.skipBtn = el('button', 'btn small hud-skip hidden', 'スキップ ▶▶');
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSkip?.();
    });
    this.skipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.toastEl = el('div', 'hud-toast hidden');
    this.bannerEl = el('div', 'hud-banner hidden');
    this.extra = el('div', 'hud-extra');

    this.root.append(top, this.mapWrap, this.picker, this.flight, this.skipBtn, this.toastEl, this.bannerEl, this.extra);
    parent.append(this.root);
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setInfo(i: HudInfo): void {
    this.info.innerHTML = `<div class="hud-title">${i.title}</div><div class="hud-sub">${i.sub}</div><div class="hud-strokes">${i.strokes}</div>`;
    this.setDist(i.dist);
  }

  setDist(text: string): void {
    this.distEl.innerHTML = text;
    this.distEl.classList.toggle('hidden', !text);
  }

  setCoins(n: number): void {
    const s = this.coinsEl.querySelector('span')!;
    if (s.textContent !== String(n)) {
      s.textContent = String(n);
      this.coinsEl.classList.remove('bump');
      void this.coinsEl.offsetWidth;
      this.coinsEl.classList.add('bump');
    }
  }

  /** angle: wind direction relative to the camera view, radians (0 = blowing away from camera). */
  setWind(angle: number, speed: number): void {
    this.windArrow.style.transform = `rotate(${angle - Math.PI / 2}rad)`;
    this.windText.textContent = `${speed.toFixed(1)}m/s`;
    this.windEl.classList.toggle('calm', speed < 0.3);
  }

  showPicker(v: boolean, current?: string): void {
    this.picker.classList.toggle('hidden', !v);
    if (current) this.picker.querySelectorAll<HTMLElement>('.disc-btn').forEach((b) => b.classList.toggle('on', b.dataset.id === current));
  }

  showMap(v: boolean): void {
    this.mapWrap.classList.toggle('hidden', !v);
  }

  setMap(base: HTMLCanvasElement, fn: (x: number, z: number) => [number, number]): void {
    this.mapBase = base;
    this.mapFn = fn;
  }

  drawMap(disc: [number, number] | null, aimFrom: [number, number] | null, aimDir: [number, number] | null, trail: [number, number][]): void {
    const ctx = this.mapCanvas.getContext('2d')!;
    const s = this.mapCanvas.width;
    ctx.clearRect(0, 0, s, s);
    if (!this.mapBase || !this.mapFn) return;
    ctx.drawImage(this.mapBase, 0, 0, s, s);
    const f = this.mapFn;
    const k = s / this.mapBase.width;
    if (trail.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      trail.forEach(([x, z], i) => {
        const [mx, my] = f(x, z);
        if (i === 0) ctx.moveTo(mx * k, my * k);
        else ctx.lineTo(mx * k, my * k);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (aimFrom && aimDir) {
      const [ax, ay] = f(aimFrom[0], aimFrom[1]);
      const [bx, by] = f(aimFrom[0] + aimDir[0] * 40, aimFrom[1] + aimDir[1] * 40);
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ax * k, ay * k);
      ctx.lineTo(bx * k, by * k);
      ctx.stroke();
    }
    if (disc) {
      const [mx, my] = f(disc[0], disc[1]);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(mx * k, my * k, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4f5e';
      ctx.beginPath();
      ctx.arc(mx * k, my * k, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  setFlight(text: string | null): void {
    this.flight.classList.toggle('hidden', text === null);
    if (text !== null) this.flight.innerHTML = text;
  }

  showSkip(v: boolean): void {
    this.skipBtn.classList.toggle('hidden', !v);
  }

  toast(text: string, ms = 2200): void {
    this.toastEl.innerHTML = text;
    this.toastEl.classList.remove('hidden', 'out');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('out'), ms);
  }

  hideToast(): void {
    this.toastEl.classList.add('hidden');
  }

  banner(text: string, sub = '', style = '', ms = 1800): void {
    this.bannerEl.className = `hud-banner ${style}`;
    this.bannerEl.innerHTML = `<div class="banner-main">${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    clearTimeout(this.bannerTimer);
    if (ms > 0) this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add('hidden'), ms);
  }

  hideBanner(): void {
    this.bannerEl.classList.add('hidden');
  }

  popup(text: string, x: number, y: number, style: PopupStyle = 'info'): void {
    const p = el('div', `popup ${style}`, text);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    this.popups.append(p);
    setTimeout(() => p.remove(), 1300);
  }

  /** Free slot for mode-specific widgets (practice stats, etc). */
  setExtra(html: string, onClick?: (target: HTMLElement) => void): void {
    this.extra.innerHTML = html;
    this.extra.onclick = onClick
      ? (e) => {
          e.stopPropagation();
          onClick(e.target as HTMLElement);
        }
      : null;
    this.extra.onpointerdown = (e) => e.stopPropagation();
  }

  clear(): void {
    this.popups.innerHTML = '';
    this.hideBanner();
    this.hideToast();
    this.setFlight(null);
    this.showSkip(false);
    this.showPicker(false);
    this.setExtra('');
    this.mapWrap.classList.remove('big');
  }
}
