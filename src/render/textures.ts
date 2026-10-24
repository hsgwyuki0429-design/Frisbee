import * as THREE from 'three';

export function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { repeat?: boolean; shared?: boolean; nearest?: boolean } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (opts.nearest) {
    t.magFilter = THREE.NearestFilter;
  }
  if (opts.shared) t.userData.shared = true;
  return t;
}

const cache = new Map<string, THREE.Texture>();

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = make();
    t.userData.shared = true;
    cache.set(key, t);
  }
  return t;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points = 5, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function brickTexture(): THREE.Texture {
  return cached('brick', () =>
    canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#7a3b12';
      ctx.fillRect(0, 0, w, h);
      const rows = 4;
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        const off = r % 2 === 0 ? 0 : w / 4;
        for (let c = -1; c < 3; c++) {
          const x = c * (w / 2) + off + 3;
          const y = r * rh + 3;
          ctx.fillStyle = '#d9783a';
          roundRect(ctx, x, y, w / 2 - 6, rh - 6, 4);
          ctx.fill();
          ctx.fillStyle = '#f0a066';
          ctx.fillRect(x + 4, y + 3, w / 2 - 16, 4);
        }
      }
    }),
  );
}

export function luckyTexture(): THREE.Texture {
  return cached('lucky', () =>
    canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#ffd84a');
      g.addColorStop(1, '#f5a312');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#b86a00';
      ctx.lineWidth = 6;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#b86a00';
      for (const [x, y] of [
        [16, 16],
        [w - 16, 16],
        [16, h - 16],
        [w - 16, h - 16],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      starPath(ctx, w / 2, h / 2 + 3, 40, 17);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#b86a00';
      ctx.stroke();
    }),
  );
}

export function usedBlockTexture(): THREE.Texture {
  return cached('usedblock', () =>
    canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#a0683a';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#6b3f1d';
      ctx.lineWidth = 6;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#6b3f1d';
      for (const [x, y] of [
        [16, 16],
        [w - 16, 16],
        [16, h - 16],
        [w - 16, h - 16],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
}

export function stoneTexture(): THREE.Texture {
  return cached('stone', () =>
    canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#b8b2c9';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#7d7594';
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.fillStyle = '#d8d3e6';
      ctx.fillRect(12, 12, w - 24, 8);
      ctx.fillRect(12, 12, 8, h - 24);
    }),
  );
}

export function checkerTexture(a: string, b: string, n = 4): THREE.Texture {
  return cached(`checker${a}${b}${n}`, () =>
    canvasTexture(
      128,
      128,
      (ctx, w) => {
        const s = w / n;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            ctx.fillStyle = (i + j) % 2 === 0 ? a : b;
            ctx.fillRect(i * s, j * s, s, s);
          }
        }
      },
      { repeat: true },
    ),
  );
}

export function coinTexture(): THREE.Texture {
  return cached('coin', () =>
    canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.4, h * 0.35, 5, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#fff6b0');
      g.addColorStop(0.6, '#ffcc22');
      g.addColorStop(1, '#e09600');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#c47a00';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 12, 0, Math.PI * 2);
      ctx.stroke();
      starPath(ctx, w / 2, h / 2 + 2, 34, 15);
      ctx.fillStyle = '#fff3a0';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#c47a00';
      ctx.stroke();
    }),
  );
}

/** Soft round sprite. */
export function puffSprite(): THREE.Texture {
  return cached('puff', () =>
    canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
  );
}

export function starSprite(): THREE.Texture {
  return cached('starsprite', () =>
    canvasTexture(64, 64, (ctx, w, h) => {
      starPath(ctx, w / 2, h / 2 + 2, 28, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }),
  );
}

export function leafSprite(): THREE.Texture {
  return cached('leaf', () =>
    canvasTexture(64, 64, (ctx, w, h) => {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(0.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }),
  );
}

export function sparkSprite(): THREE.Texture {
  return cached('spark', () =>
    canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.2, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(w / 2 - 2, 4, 4, h - 8);
      ctx.fillRect(4, h / 2 - 2, w - 8, 4);
    }),
  );
}

export function squareSprite(): THREE.Texture {
  return cached('square', () =>
    canvasTexture(16, 16, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(2, 2, w - 4, h - 4);
    }),
  );
}

/** Wooden sign board with text lines. */
export function signTexture(lines: { text: string; size: number; color?: string }[], bg = '#ffffff', border = '#e2574c'): THREE.CanvasTexture {
  return canvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = border;
    roundRect(ctx, 0, 0, w, h, 40);
    ctx.fill();
    ctx.fillStyle = bg;
    roundRect(ctx, 18, 18, w - 36, h - 36, 28);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const total = lines.reduce((s, l) => s + l.size * 1.15, 0);
    let y = h / 2 - total / 2;
    for (const l of lines) {
      ctx.font = `900 ${l.size}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", sans-serif`;
      ctx.fillStyle = l.color ?? '#3a2a4a';
      ctx.fillText(l.text, w / 2, y + (l.size * 1.15) / 2);
      y += l.size * 1.15;
    }
  });
}

/** Number flag for the basket. */
export function flagTexture(text: string, color: string): THREE.CanvasTexture {
  return canvasTexture(256, 160, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    ctx.font = `900 110px "Fredoka", "M PLUS Rounded 1c", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.strokeText(text, w / 2, h / 2 + 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 6);
  });
}

/** Concentric target rings painted on the ground. */
export function targetTexture(): THREE.Texture {
  return cached('target', () =>
    canvasTexture(256, 256, (ctx, w, h) => {
      const colors = ['#ffffff', '#ff5a5a', '#ffffff', '#ff5a5a', '#ffd23f'];
      const radii = [1, 0.8, 0.6, 0.4, 0.2];
      for (let i = 0; i < colors.length; i++) {
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, (radii[i] * w) / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = colors[i];
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(80,40,60,0.5)';
        ctx.stroke();
      }
    }),
  );
}
