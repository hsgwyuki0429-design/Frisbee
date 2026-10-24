import { starPath } from '../render/textures';

export interface Skin {
  id: string;
  name: string;
  price: number;
  rim: number;
  trail: [number, number];
  draw(ctx: CanvasRenderingContext2D, s: number): void;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function ringStroke(ctx: CanvasRenderingContext2D, s: number, r: number, w: number, color: string): void {
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}


/** Flower-shaped centre with a lettered outer band, like a foam play disc. */
function foam(ctx: CanvasRenderingContext2D, s: number, band: string, flower: string, inner: string, ink: string): void {
  const c = s / 2;
  circle(ctx, c, c, c, band);
  // Wavy flower.
  ctx.beginPath();
  const petals = 12;
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2;
    const r = s * (0.33 + 0.035 * Math.cos(a * petals));
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = flower;
  ctx.fill();
  circle(ctx, c, c, s * 0.2, inner);
  // Lettering around the band.
  const text = 'DISC ISLAND ★ DISC ISLAND ★ ';
  ctx.save();
  ctx.translate(c, c);
  ctx.fillStyle = ink;
  ctx.font = `700 ${Math.round(s * 0.085)}px "Fredoka", "Arial Rounded MT Bold", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < text.length; i++) {
    const a = (i / text.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(text[i], 0, -s * 0.43);
    ctx.restore();
  }
  ctx.restore();
}

export const SKINS: Skin[] = [
  {
    id: 'classic',
    name: 'スタンダード',
    price: 0,
    rim: 0xff5a2a,
    trail: [0xff7a3c, 0x4f7dff],
    draw(ctx, s) {
      foam(ctx, s, '#ff5a2a', '#4f7dff', '#6f95ff', '#ffffff');
    },
  },
  {
    id: 'sky',
    name: 'ウェーブ',
    price: 30,
    rim: 0x24b8c9,
    trail: [0x4fd6e0, 0xffe14a],
    draw(ctx, s) {
      foam(ctx, s, '#24b8c9', '#ffe14a', '#fff07a', '#ffe14a');
    },
  },
  {
    id: 'pop',
    name: 'ポップ',
    price: 40,
    rim: 0xc6e83a,
    trail: [0xd6f04a, 0xff4f5e],
    draw(ctx, s) {
      foam(ctx, s, '#c6e83a', '#ff4f5e', '#ff7380', '#ff4f5e');
    },
  },
  {
    id: 'melon',
    name: 'スイカ',
    price: 50,
    rim: 0x2f9e48,
    trail: [0xff5a6a, 0x6be36b],
    draw(ctx, s) {
      circle(ctx, s / 2, s / 2, s / 2, '#2f9e48');
      circle(ctx, s / 2, s / 2, s * 0.44, '#f3ffe0');
      circle(ctx, s / 2, s / 2, s * 0.4, '#ff4f5e');
      ctx.fillStyle = '#2a1a1a';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r = s * (i % 2 ? 0.22 : 0.3);
        ctx.save();
        ctx.translate(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.025, s * 0.014, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    id: 'donut',
    name: 'ドーナツ',
    price: 80,
    rim: 0xd9925a,
    trail: [0xff9ad5, 0xfff07a],
    draw(ctx, s) {
      circle(ctx, s / 2, s / 2, s / 2, '#e3a066');
      circle(ctx, s / 2, s / 2, s * 0.44, '#ff8fcf');
      circle(ctx, s / 2, s / 2, s * 0.15, '#e3a066');
      circle(ctx, s / 2, s / 2, s * 0.1, '#c27a43');
      const colors = ['#ffffff', '#ffe14a', '#5cb8ff', '#6be36b', '#ff5a5a'];
      for (let i = 0; i < 36; i++) {
        const a = i * 2.39996;
        const r = s * (0.2 + ((i * 37) % 20) / 100);
        ctx.save();
        ctx.translate(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
        ctx.rotate(a * 3);
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(-s * 0.025, -s * 0.007, s * 0.05, s * 0.014);
        ctx.restore();
      }
    },
  },
  {
    id: 'sunflower',
    name: 'ひまわり',
    price: 100,
    rim: 0xffc21f,
    trail: [0xffd23f, 0xff9a3c],
    draw(ctx, s) {
      circle(ctx, s / 2, s / 2, s / 2, '#7ad35a');
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.save();
        ctx.translate(s / 2, s / 2);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(s * 0.3, 0, s * 0.15, s * 0.07, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#ffd23f' : '#ffc21f';
        ctx.fill();
        ctx.restore();
      }
      circle(ctx, s / 2, s / 2, s * 0.17, '#7a4a22');
      for (let i = 0; i < 20; i++) {
        const a = i * 2.39996;
        const r = Math.sqrt(i / 20) * s * 0.14;
        circle(ctx, s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, s * 0.015, '#4d2c12');
      }
    },
  },
  {
    id: 'checker',
    name: 'チェッカー',
    price: 150,
    rim: 0x222222,
    trail: [0xffffff, 0x333333],
    draw(ctx, s) {
      const n = 8;
      const c = s / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#1f1f2a' : '#ffffff';
        ctx.fillRect(i * c, j * c, c, c);
      }
      circle(ctx, s / 2, s / 2, s * 0.14, '#ff4f5e');
      ringStroke(ctx, s, s * 0.14, s * 0.02, '#ffffff');
    },
  },
  {
    id: 'galaxy',
    name: 'ギャラクシー',
    price: 220,
    rim: 0x5b3fd1,
    trail: [0xa77bff, 0x5cb8ff],
    draw(ctx, s) {
      const g = ctx.createRadialGradient(s * 0.45, s * 0.45, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, '#ff9ad5');
      g.addColorStop(0.35, '#7a4dff');
      g.addColorStop(1, '#1b1450');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        const x = ((i * 73) % 100) / 100;
        const y = ((i * 41 + 13) % 100) / 100;
        circle(ctx, x * s, y * s, s * (i % 5 === 0 ? 0.012 : 0.006), '#ffffff');
      }
      starPath(ctx, s * 0.62, s * 0.38, s * 0.07, s * 0.03);
      ctx.fillStyle = '#fff6b0';
      ctx.fill();
    },
  },
  {
    id: 'rainbow',
    name: 'レインボー',
    price: 320,
    rim: 0xff5c5c,
    trail: [0xff5c5c, 0x5cb8ff],
    draw(ctx, s) {
      const colors = ['#ff5c5c', '#ffa64d', '#ffe35c', '#6be36b', '#5cb8ff', '#a77bff', '#ffffff'];
      colors.forEach((c, i) => circle(ctx, s / 2, s / 2, s * (0.5 - i * 0.065), c));
    },
  },
  {
    id: 'smile',
    name: 'ニコニコ',
    price: 400,
    rim: 0xffb21f,
    trail: [0xffe14a, 0xffffff],
    draw(ctx, s) {
      circle(ctx, s / 2, s / 2, s / 2, '#ffd23f');
      ctx.fillStyle = '#3a2a1a';
      ctx.beginPath();
      ctx.ellipse(s * 0.38, s * 0.4, s * 0.04, s * 0.075, 0, 0, Math.PI * 2);
      ctx.ellipse(s * 0.62, s * 0.4, s * 0.04, s * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.52, s * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = s * 0.04;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#3a2a1a';
      ctx.stroke();
      circle(ctx, s * 0.27, s * 0.58, s * 0.05, 'rgba(255,110,110,0.6)');
      circle(ctx, s * 0.73, s * 0.58, s * 0.05, 'rgba(255,110,110,0.6)');
    },
  },
  {
    id: 'gold',
    name: 'ゴールド',
    price: 600,
    rim: 0xffc21f,
    trail: [0xfff27a, 0xffb21f],
    draw(ctx, s) {
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#fff6b0');
      g.addColorStop(0.4, '#ffcc22');
      g.addColorStop(0.6, '#ffe58a');
      g.addColorStop(1, '#d48a00');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ringStroke(ctx, s, s * 0.42, s * 0.03, '#c47a00');
      ringStroke(ctx, s, s * 0.3, s * 0.015, '#c47a00');
      starPath(ctx, s / 2, s / 2 + s * 0.015, s * 0.2, s * 0.085);
      ctx.fillStyle = '#fffbe0';
      ctx.fill();
      ctx.lineWidth = s * 0.015;
      ctx.strokeStyle = '#c47a00';
      ctx.stroke();
    },
  },
];

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/** Renders a skin preview into a new canvas (round, with rim). */
export function skinCanvas(skin: Skin, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  skin.draw(ctx, size);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - size * 0.03, 0, Math.PI * 2);
  ctx.lineWidth = size * 0.06;
  ctx.strokeStyle = '#' + skin.rim.toString(16).padStart(6, '0');
  ctx.stroke();
  return c;
}
