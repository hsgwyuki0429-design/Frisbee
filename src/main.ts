import './styles.css';
import { App } from './App';
import * as stages from './data/stages';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;
  // Give web fonts a moment so canvas-drawn signs use them.
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* ignore */
  }
  try {
    const app = new App(root);
    app.start();
    if (location.search.includes('debug')) Object.assign(window, { __app: app, __stages: stages });
  } catch (e) {
    console.error(e);
    const msg = document.createElement('div');
    msg.className = 'fatal';
    msg.innerHTML = 'このブラウザでは3D表示を開始できませんでした。<br>WebGLに対応したブラウザでお試しください。';
    root.append(msg);
  }
  document.getElementById('boot')?.classList.add('done');
  setTimeout(() => document.getElementById('boot')?.remove(), 600);
}

void boot();
