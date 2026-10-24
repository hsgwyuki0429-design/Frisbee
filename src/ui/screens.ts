import { audio } from '../audio/Audio';
import { SKINS, skinCanvas } from '../data/skins';
import { WORLDS } from '../data/stages';
import type { SessionResult, StageResult } from '../game/GameSession';
import { save, update as updateSave, resetSave, type Settings, type Quality } from '../save';
import { el, esc } from './dom';

export interface MenuHandlers {
  course(): void;
  challenge(): void;
  practice(): void;
  shop(): void;
  howto(): void;
  settings(): void;
}

function stars(n: number, max = 3): string {
  let s = '';
  for (let i = 0; i < max; i++) s += `<i class="star ${i < n ? 'on' : ''}">★</i>`;
  return s;
}

export function holeStars(strokes: number | undefined, par: number): number {
  if (strokes === undefined) return 0;
  const d = strokes - par;
  return d <= -1 ? 3 : d === 0 ? 2 : d <= 2 ? 1 : 0;
}

const MEDALS = ['', '🥉', '🥈', '🥇'];

/** Full-screen DOM screens layered over the 3D view. */
export class Screens {
  private current: HTMLElement | null = null;
  private modal: HTMLElement | null = null;

  constructor(private root: HTMLElement) {}

  private mount(screen: HTMLElement): void {
    this.closeModal();
    if (this.current) {
      const old = this.current;
      old.classList.add('leaving');
      setTimeout(() => old.remove(), 250);
    }
    this.current = screen;
    this.root.append(screen);
  }

  clear(): void {
    this.closeModal();
    if (this.current) {
      const old = this.current;
      old.classList.add('leaving');
      setTimeout(() => old.remove(), 250);
      this.current = null;
    }
  }

  private openModal(m: HTMLElement): void {
    this.closeModal();
    this.modal = m;
    this.root.append(m);
  }

  closeModal(): void {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  private click(sel: string, scope: HTMLElement, fn: () => void, sfx: 'click' | 'select' | 'back' = 'click'): void {
    scope.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.play(sfx);
        fn();
      }),
    );
  }

  private coinBadge(): string {
    return `<div class="coin-badge"><i class="coin-ico"></i><span>${save().coins}</span></div>`;
  }

  // ---------------------------------------------------------------- title

  title(onStart: () => void): void {
    const s = el(
      'div',
      'screen title-screen',
      `<div class="logo">
         <div class="logo-disc"></div>
         <h1><span class="l1">DISC</span><span class="l2">ISLAND</span></h1>
         <div class="logo-jp">ディスクアイランド</div>
       </div>
       <div class="tap-start">タップしてスタート</div>
       <div class="title-foot">© DISC ISLAND ・ v1.0</div>`,
    );
    const go = (e: Event) => {
      e.stopPropagation();
      s.removeEventListener('pointerup', go);
      window.removeEventListener('keydown', go);
      audio.unlock();
      audio.play('select');
      onStart();
    };
    s.addEventListener('pointerup', go);
    window.addEventListener('keydown', go);
    this.mount(s);
  }

  menu(h: MenuHandlers): void {
    const sv = save();
    const s = el(
      'div',
      'screen menu-screen',
      `<div class="menu-head"><div class="mini-logo">DISC <b>ISLAND</b></div>${this.coinBadge()}</div>
       <div class="menu-grid">
         <button class="menu-btn big green" data-k="course"><span class="mi">⛳</span><b>コースであそぶ</b><small>ディスクゴルフ 9ホール</small></button>
         <button class="menu-btn big orange" data-k="challenge"><span class="mi">🏆</span><b>チャレンジ</b><small>飛距離・まとあて・リング</small></button>
         <button class="menu-btn blue" data-k="practice"><span class="mi">🎯</span><b>れんしゅう</b></button>
         <button class="menu-btn pink" data-k="shop"><span class="mi">🎨</span><b>きせかえ</b></button>
         <button class="menu-btn purple" data-k="howto"><span class="mi">📖</span><b>あそびかた</b></button>
         <button class="menu-btn gray" data-k="settings"><span class="mi">⚙️</span><b>せってい</b></button>
       </div>
       <div class="menu-stats">投げた回数 ${sv.stats.throws} ・ 最長 ${sv.stats.longest.toFixed(1)}m ・ ホールインワン ${sv.stats.holeInOnes}</div>`,
    );
    s.querySelectorAll<HTMLElement>('.menu-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.play('select');
        (h as unknown as Record<string, () => void>)[b.dataset.k!]();
      }),
    );
    this.mount(s);
  }

  worldSelect(onPlay: (worldId: string) => void, onBack: () => void): void {
    const sv = save();
    const cards = WORLDS.map((w, i) => {
      const unlocked = i === 0 || sv.worldsCleared.includes(WORLDS[i - 1].id);
      const holes = w.holes
        .map((h, k) => {
          const best = sv.holeBest[h.id];
          return `<div class="hole-row"><span>${i * 3 + k + 1}. ${esc(h.name)}</span><span class="par">PAR ${h.par}</span><span class="best">${best ?? '-'}</span><span class="stars">${stars(holeStars(best, h.par ?? 3))}</span></div>`;
        })
        .join('');
      const best = sv.worldBest[w.id];
      const par = w.holes.reduce((a, h) => a + (h.par ?? 3), 0);
      return `<div class="world-card ${unlocked ? '' : 'locked'}" style="--wc:${w.color}">
          <div class="wc-head"><div class="wc-no">WORLD ${i + 1}</div><div class="wc-name">${w.name}</div><div class="wc-sub">${w.sub}</div></div>
          <div class="wc-body">${holes}</div>
          <div class="wc-foot"><span>ベスト ${best ? `${best}打 (${best - par >= 0 ? '+' : ''}${best - par})` : '-'}</span>
          ${unlocked ? `<button class="btn primary" data-w="${w.id}">あそぶ ▶</button>` : `<span class="lock">🔒 WORLD ${i} をクリア</span>`}</div>
        </div>`;
    }).join('');
    const allOpen = WORLDS.every((w) => sv.worldsCleared.includes(w.id));
    const s = el(
      'div',
      'screen select-screen',
      `<div class="screen-head"><button class="btn back">◀</button><h2>コースをえらぶ</h2>${this.coinBadge()}</div>
       <div class="world-list">${cards}
       <div class="world-card all ${allOpen ? '' : 'locked'}" style="--wc:#ff9a3c"><div class="wc-head"><div class="wc-no">CHAMPIONSHIP</div><div class="wc-name">ぜんぶまわる 9ホール</div><div class="wc-sub">ALL ISLANDS</div></div>
         <div class="wc-foot"><span>ベスト ${sv.worldBest.all ? `${sv.worldBest.all}打` : '-'}</span>${allOpen ? '<button class="btn primary" data-w="all">あそぶ ▶</button>' : '<span class="lock">🔒 すべてのワールドをクリア</span>'}</div></div>
       </div>`,
    );
    this.click('.back', s, onBack, 'back');
    s.querySelectorAll<HTMLElement>('[data-w]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.play('select');
        onPlay(b.dataset.w!);
      }),
    );
    this.mount(s);
  }

  challengeSelect(onPlay: (k: 'distance' | 'target' | 'rings') => void, onBack: () => void): void {
    const c = save().challenge;
    const medal = (k: string, v: number) => {
      const m = k === 'distance' ? (v >= 45 ? 3 : v >= 35 ? 2 : v >= 25 ? 1 : 0) : k === 'target' ? (v >= 350 ? 3 : v >= 250 ? 2 : v >= 150 ? 1 : 0) : v >= 10 ? 3 : v >= 7 ? 2 : v >= 4 ? 1 : 0;
      return MEDALS[m];
    };
    const card = (k: string, icon: string, name: string, desc: string, rec: string, color: string) =>
      `<div class="ch-card" style="--wc:${color}"><div class="ch-icon">${icon}</div><div class="ch-body"><b>${name}</b><p>${desc}</p><div class="ch-rec">ベスト：${rec} ${medal(k, k === 'distance' ? c.distance : k === 'target' ? c.target : c.rings)}</div></div><button class="btn primary" data-k="${k}">▶</button></div>`;
    const s = el(
      'div',
      'screen select-screen',
      `<div class="screen-head"><button class="btn back">◀</button><h2>チャレンジ</h2>${this.coinBadge()}</div>
       <div class="ch-list">
        ${card('distance', '📏', 'ロングドライブ', '3投のうち、いちばん遠くまで飛んだ記録で勝負！', c.distance ? `${c.distance.toFixed(1)}m` : '-', '#5fcd3c')}
        ${card('target', '🎯', 'まとあて', '5つのまとを順番にねらう。まん中ほど高得点！', c.target ? `${c.target}点` : '-', '#29b6f6')}
        ${card('rings', '💫', 'リングくぐり', '空にうかぶ10この輪を3投でくぐりぬけろ！カーブを使いこなそう。', c.rings ? `${c.rings}こ` : '-', '#b47bff')}
       </div>
       <p class="note">メダルをとるとボーナスコインがもらえるよ</p>`,
    );
    this.click('.back', s, onBack, 'back');
    s.querySelectorAll<HTMLElement>('[data-k]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.play('select');
        onPlay(b.dataset.k as 'distance' | 'target' | 'rings');
      }),
    );
    this.mount(s);
  }

  shop(onBack: () => void, onEquip: (id: string) => void): void {
    const render = () => {
      const sv = save();
      const items = SKINS.map((sk) => {
        const owned = sv.ownedSkins.includes(sk.id);
        const eq = sv.skin === sk.id;
        const act = eq
          ? '<span class="tag on">そうび中</span>'
          : owned
            ? `<button class="btn small" data-eq="${sk.id}">つかう</button>`
            : `<button class="btn small buy ${sv.coins < sk.price ? 'poor' : ''}" data-buy="${sk.id}"><i class="coin-ico"></i>${sk.price}</button>`;
        return `<div class="skin-card ${eq ? 'equipped' : ''} ${owned ? '' : 'unowned'}"><div class="skin-prev" data-prev="${sk.id}"></div><b>${sk.name}</b>${act}</div>`;
      }).join('');
      s.innerHTML = `<div class="screen-head"><button class="btn back">◀</button><h2>ディスクきせかえ</h2>${this.coinBadge()}</div>
        <div class="skin-grid">${items}</div><p class="note">コインはコースやチャレンジで集めよう！</p>`;
      s.querySelectorAll<HTMLElement>('[data-prev]').forEach((p) => {
        const sk = SKINS.find((x) => x.id === p.dataset.prev)!;
        const c = skinCanvas(sk, 160);
        p.append(c);
      });
      this.click('.back', s, onBack, 'back');
      s.querySelectorAll<HTMLElement>('[data-eq]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          audio.play('select');
          updateSave((d) => (d.skin = b.dataset.eq!));
          onEquip(b.dataset.eq!);
          render();
        }),
      );
      s.querySelectorAll<HTMLElement>('[data-buy]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const sk = SKINS.find((x) => x.id === b.dataset.buy)!;
          if (save().coins < sk.price) {
            audio.play('error');
            b.classList.remove('shake');
            void b.offsetWidth;
            b.classList.add('shake');
            return;
          }
          this.confirm(`「${sk.name}」を ${sk.price} コインで買いますか？`, '買う', () => {
            updateSave((d) => {
              d.coins -= sk.price;
              d.ownedSkins.push(sk.id);
              d.skin = sk.id;
            });
            audio.play('buy');
            onEquip(sk.id);
            render();
          });
        }),
      );
    };
    const s = el('div', 'screen shop-screen');
    this.mount(s);
    render();
  }

  howto(onBack: () => void): void {
    const pages = [
      {
        title: 'ゴールはバスケット！',
        img: svgBasket(),
        text: 'ディスクをバスケットの<b>チェーン</b>に当てて、カゴに入れたらホールアウト。<br>できるだけ<b>少ない投げ数</b>でクリアしよう。パーより少なければバーディー！',
      },
      {
        title: '角度と傾きをきめる',
        img: svgTilt(),
        text: 'ディスクの<b>うしろ</b>からの視点で、<b>2本指でドラッグ</b>するとディスクが回るよ（PCは右ドラッグ／Shift＋ドラッグ／矢印キー）。<br><b>上下</b>＝投げる角度、<b>左右・ひねる</b>＝傾き。傾きはぐるっと360°まわせる！<br>傾けたほうへカーブするよ。',
      },
      {
        title: '引っぱって投げる',
        img: svgSwipe(),
        text: 'ディスクを<b>1本指でつかんで、うしろに引っぱって離す</b>！<br><b>引っぱった反対の向き</b>に飛ぶよ（ディスクの中心を通る平行な向き）<br><b>引っぱる長さ</b>＝パワー。指を戻して離すとキャンセル',
      },
      {
        title: '回転がカギ！',
        img: svgSpin(),
        text: 'ディスクの<b>中心からズレたところをつかむほど回転が増える</b>よ。<br>まん中をつかむと回転ゼロでフラフラ…すぐ落ちちゃう。<br>右側をつかむと左回り、左側だと右回り。回転の向きで<b>終わりぎわに曲がる方向</b>が変わる！',
      },
      {
        title: 'ディスクと風',
        img: svgDiscs(),
        text: '<b>パター</b>はまっすぐ正確、<b>ミッドレンジ</b>はバランス型、<b>ドライバー</b>は遠くまで飛ぶけど暴れやすい。<br>右上の<b>風</b>にも注意！向かい風は浮きやすく、追い風は伸びにくい。',
      },
      {
        title: 'コイン・リング・OB',
        img: svgCoins(),
        text: '<b>コイン</b>や<b>リング</b>をくぐるとコインゲット。キノコははずむ！<br>水に落ちたり島から落ちると<b>OB（+1打）</b>。<br>集めたコインで<b>ディスクのきせかえ</b>ができるよ。',
      },
    ];
    let i = 0;
    const s = el('div', 'screen howto-screen');
    const render = () => {
      const p = pages[i];
      s.innerHTML = `<div class="screen-head"><button class="btn back">◀</button><h2>あそびかた</h2><div class="page-no">${i + 1} / ${pages.length}</div></div>
        <div class="howto-card"><h3>${p.title}</h3><div class="howto-img">${p.img}</div><p>${p.text}</p></div>
        <div class="howto-nav"><button class="btn prev" ${i === 0 ? 'disabled' : ''}>◀ まえ</button><div class="dots">${pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><button class="btn primary next">${i === pages.length - 1 ? 'とじる' : 'つぎ ▶'}</button></div>`;
      this.click('.back', s, onBack, 'back');
      this.click('.prev', s, () => {
        if (i > 0) i--;
        render();
      });
      this.click('.next', s, () => {
        if (i < pages.length - 1) {
          i++;
          render();
        } else onBack();
      });
    };
    this.mount(s);
    render();
  }

  settings(onBack: () => void, onChange: (s: Settings) => void, inGame = false): void {
    const s = el('div', `screen settings-screen ${inGame ? 'over' : ''}`);
    const render = () => {
      const st = save().settings;
      const q = (v: Quality, label: string) => `<button class="seg ${st.quality === v ? 'on' : ''}" data-q="${v}">${label}</button>`;
      const tog = (k: keyof Settings, label: string, desc: string) =>
        `<div class="set-row"><div><b>${label}</b><small>${desc}</small></div><button class="toggle ${st[k] ? 'on' : ''}" data-t="${k}"><i></i></button></div>`;
      s.innerHTML = `<div class="screen-head"><button class="btn back">◀</button><h2>せってい</h2><div></div></div>
        <div class="settings-card">
          <div class="set-row"><div><b>BGM</b></div><input type="range" min="0" max="1" step="0.05" value="${st.bgm}" data-r="bgm"></div>
          <div class="set-row"><div><b>効果音</b></div><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-r="sfx"></div>
          <div class="set-row"><div><b>引っぱり感度</b><small>強く投げにくいときは上げてね</small></div><input type="range" min="0.5" max="2" step="0.05" value="${st.sensitivity}" data-r="sensitivity"></div>
          <div class="set-row"><div><b>画質</b><small>動作が重いときは「ひくい」に</small></div><div class="segs">${q('low', 'ひくい')}${q('mid', 'ふつう')}${q('high', 'たかい')}</div></div>
          ${tog('slowmo', 'スロー演出', 'バスケット付近でスローモーション')}
          ${tog('ghost', '前回の軌道', '1つ前のショットの軌道を表示')}
          ${tog('vibration', '振動', '対応端末でブルッとふるえる')}
          ${inGame ? '' : '<div class="set-row danger"><div><b>セーブデータを消す</b><small>コイン・記録・きせかえがリセットされます</small></div><button class="btn small red" data-reset>消去</button></div>'}
        </div>`;
      this.click('.back', s, onBack, 'back');
      s.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
        inp.addEventListener('input', () => {
          const k = inp.dataset.r as 'bgm' | 'sfx' | 'sensitivity';
          updateSave((d) => (d.settings[k] = parseFloat(inp.value)));
          onChange(save().settings);
        }),
      );
      s.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => inp.addEventListener('change', () => audio.play('tick')));
      s.querySelectorAll<HTMLElement>('[data-q]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          audio.play('click');
          updateSave((d) => (d.settings.quality = b.dataset.q as Quality));
          onChange(save().settings);
          render();
        }),
      );
      s.querySelectorAll<HTMLElement>('[data-t]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          audio.play('click');
          const k = b.dataset.t as 'slowmo' | 'ghost' | 'vibration';
          updateSave((d) => (d.settings[k] = !d.settings[k]));
          onChange(save().settings);
          render();
        }),
      );
      s.querySelector('[data-reset]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.play('click');
        this.confirm('本当にセーブデータを消しますか？<br>（設定はそのまま残ります）', '消去する', () => {
          resetSave();
          audio.play('back');
          render();
        });
      });
    };
    if (inGame) this.openModal(s);
    else this.mount(s);
    render();
  }

  pause(h: { resume(): void; restart(): void; settings(): void; quit(): void }, label: string): void {
    const m = el(
      'div',
      'modal pause-modal',
      `<div class="modal-card"><h2>ポーズ</h2><p class="pause-label">${label}</p>
        <button class="btn primary wide" data-a="resume">つづける</button>
        <button class="btn wide" data-a="restart">やりなおす</button>
        <button class="btn wide" data-a="settings">せってい</button>
        <button class="btn wide red" data-a="quit">やめる</button></div>`,
    );
    m.querySelectorAll<HTMLElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.play(b.dataset.a === 'resume' ? 'select' : 'click');
        const a = b.dataset.a as 'resume' | 'restart' | 'settings' | 'quit';
        if (a === 'quit') {
          this.confirm('メニューにもどりますか？<br>（このプレイの記録は残りません）', 'もどる', () => h.quit());
          return;
        }
        this.closeModal();
        h[a]();
      }),
    );
    this.openModal(m);
  }

  holeResult(r: StageResult, scores: { par: number; strokes: number }[], next: () => void): void {
    const total = scores.reduce((a, s) => a + s.strokes - s.par, 0);
    const st = holeStars(r.hole.strokes, r.hole.par);
    const m = el(
      'div',
      'modal result-modal',
      `<div class="modal-card result-card">
        <div class="rc-hole">HOLE ${r.index + 1} / ${r.count}</div>
        <div class="rc-name">${r.scoreName}</div>
        <div class="rc-stars">${stars(st)}</div>
        <div class="rc-grid">
          <div><small>打数</small><b>${r.hole.strokes}</b></div>
          <div><small>パー</small><b>${r.hole.par}</b></div>
          <div><small>トータル</small><b>${total > 0 ? '+' : ''}${total}</b></div>
          <div><small>コイン</small><b>+${r.hole.coins}</b></div>
        </div>
        ${r.newBest ? '<div class="rc-best">ベスト更新！</div>' : r.best !== null ? `<div class="rc-prev">ベスト ${r.best}打</div>` : ''}
        <button class="btn primary wide" data-a="next">${r.index + 1 < r.count ? 'つぎのホールへ ▶' : 'けっかを見る ▶'}</button>
      </div>`,
    );
    m.querySelector('[data-a=next]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.play('select');
      this.closeModal();
      next();
    });
    this.openModal(m);
    if (st >= 2) setTimeout(() => audio.play('star'), 350);
  }

  sessionResult(r: SessionResult, onRetry: () => void, onMenu: () => void): void {
    let body = '';
    if (r.mode === 'course') {
      const par = r.holes.reduce((a, h) => a + h.par, 0);
      const diff = r.score - par;
      const rows = r.holes
        .map((h, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(h.name)}</td><td>${h.par}</td><td class="sc ${h.strokes < h.par ? 'good' : h.strokes > h.par ? 'bad' : ''}">${h.strokes}</td></tr>`)
        .join('');
      body = `<table class="scorecard"><thead><tr><th>#</th><th>ホール</th><th>PAR</th><th>打数</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><td></td><td class="nm">トータル</td><td>${par}</td><td class="sc">${r.score}</td></tr></tfoot></table>
        <div class="big-score">${diff > 0 ? '+' : ''}${diff}<small>${diff < 0 ? 'アンダー' : diff === 0 ? 'イーブン' : 'オーバー'}</small></div>`;
    } else {
      body = `<div class="big-score">${r.score}<small>${r.unit}</small></div><div class="medal">${MEDALS[r.medal] || '🎖️'}</div>${r.lines.map((l) => `<p class="rc-line">${l}</p>`).join('')}`;
    }
    const title = r.mode === 'course' ? (WORLDS.find((w) => w.id === r.worldId)?.name ?? 'チャンピオンシップ') : r.mode === 'distance' ? 'ロングドライブ' : r.mode === 'target' ? 'まとあて' : 'リングくぐり';
    const s = el(
      'div',
      'screen result-screen',
      `<div class="result-card big">
        <div class="rc-hole">けっか</div><h2>${title}</h2>
        ${body}
        <div class="rc-row">${r.newRecord ? '<div class="rc-best">NEW RECORD!</div>' : `<div class="rc-prev">ベスト ${r.best}${r.unit}</div>`}<div class="coin-badge"><i class="coin-ico"></i><span>+${r.coins}</span></div></div>
        <div class="rc-buttons"><button class="btn" data-a="menu">メニュー</button><button class="btn primary" data-a="retry">もういちど</button></div>
      </div>`,
    );
    this.click('[data-a=retry]', s, onRetry, 'select');
    this.click('[data-a=menu]', s, onMenu, 'back');
    this.mount(s);
    audio.play(r.newRecord || r.medal >= 2 ? 'holeIn' : 'fanfare');
  }

  confirm(text: string, ok: string, onOk: () => void): void {
    const m = el(
      'div',
      'modal confirm-modal',
      `<div class="modal-card"><p>${text}</p><div class="rc-buttons"><button class="btn" data-a="no">やめる</button><button class="btn primary" data-a="yes">${ok}</button></div></div>`,
    );
    const prev = this.modal;
    m.querySelector('[data-a=no]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.play('back');
      m.remove();
    });
    m.querySelector('[data-a=yes]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      m.remove();
      if (prev && prev.isConnected) {
        prev.remove();
        if (this.modal === prev) this.modal = null;
      }
      onOk();
    });
    this.root.append(m);
  }
}

// ------------------------------------------------------------------ illustrations

const INK = '#2a2140';

function svgWrap(inner: string): string {
  return `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function discSvg(cx: number, cy: number, rx: number, ry: number, rot = 0): string {
  return `<g transform="rotate(${rot} ${cx} ${cy})"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ff4f5e" stroke="${INK}" stroke-width="4"/><ellipse cx="${cx}" cy="${cy - ry * 0.15}" rx="${rx * 0.6}" ry="${ry * 0.55}" fill="none" stroke="#fff" stroke-width="3"/></g>`;
}

function svgBasket(): string {
  let chains = '';
  for (let i = 0; i < 9; i++) chains += `<path d="M${130 + i * 7.5} 50 Q ${140 + i * 2.5} 85 160 108" stroke="#c9cfe0" stroke-width="2.5" fill="none"/>`;
  return svgWrap(`<rect width="320" height="180" rx="18" fill="#bfeaff"/><rect y="140" width="320" height="40" fill="#5fcd3c"/>
    <rect x="157" y="40" width="6" height="105" fill="#9aa3b8" stroke="${INK}" stroke-width="2"/>
    <ellipse cx="160" cy="48" rx="34" ry="8" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>${chains}
    <path d="M124 108 h72 l-6 26 h-60 z" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>
    ${discSvg(250, 70, 26, 8, -12)}<path d="M222 76 Q 200 84 192 92" stroke="#fff" stroke-width="4" stroke-dasharray="6 6" fill="none"/>`);
}

function svgTilt(): string {
  return svgWrap(`<rect width="320" height="180" rx="18" fill="#bfeaff"/><rect y="140" width="320" height="40" fill="#5fcd3c"/>
    <path d="M60 110 A 100 100 0 0 1 260 110" stroke="#fff" stroke-width="4" fill="none"/>
    <line x1="160" y1="110" x2="160" y2="16" stroke="#ff4f6d" stroke-width="4" transform="rotate(25 160 110)"/>
    <g transform="rotate(25 160 110)"><ellipse cx="160" cy="110" rx="70" ry="9" fill="#ff4f5e" stroke="${INK}" stroke-width="4"/></g>
    <path d="M200 60 Q 230 30 270 34" stroke="#ffd23f" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M272 34 l-14 -8 l2 16 z" fill="#ffd23f"/>
    <text x="40" y="60" font-size="22" font-weight="900" fill="${INK}">L</text><text x="268" y="96" font-size="22" font-weight="900" fill="${INK}">R</text>
    <g transform="translate(16 112)"><circle cx="16" cy="22" r="13" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="50" cy="22" r="13" fill="#fff" stroke="${INK}" stroke-width="3"/><path d="M16 4 v-10 M50 4 v-10 M10 -2 l6 -6 l6 6 M44 -2 l6 -6 l6 6" stroke="${INK}" stroke-width="3" fill="none"/></g>`);
}

function svgSwipe(): string {
  return svgWrap(`<rect width="320" height="180" rx="18" fill="#7fd860"/>
    <path d="M160 92 L 160 10" stroke="#ffd23f" stroke-width="4" stroke-dasharray="10 8"/><path d="M160 4 l-10 14 h20 z" fill="#ffd23f"/>
    <path d="M128 62 L 182 150 L 192 62" stroke="#ff9a3c" stroke-width="5" fill="none" stroke-linejoin="round"/>
    <circle cx="160" cy="62" r="34" fill="#ff5a2a" stroke="${INK}" stroke-width="5"/><circle cx="160" cy="62" r="20" fill="#4f7dff"/>
    <circle cx="182" cy="150" r="12" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <text x="200" y="120" font-size="15" font-weight="900" fill="${INK}">引っぱる長さ</text><text x="200" y="138" font-size="15" font-weight="900" fill="${INK}">＝パワー</text>
    <text x="16" y="40" font-size="15" font-weight="900" fill="${INK}">反対の向きへ</text><text x="16" y="58" font-size="15" font-weight="900" fill="${INK}">ビューン！</text>`);
}

function svgSpin(): string {
  return svgWrap(`<rect width="320" height="180" rx="18" fill="#bfeaff"/>
    <g><circle cx="90" cy="90" r="46" fill="#ff4f5e" stroke="${INK}" stroke-width="4"/><path d="M90 160 V 20" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
    <text x="54" y="172" font-size="14" font-weight="900" fill="${INK}">回転ゼロ…</text></g>
    <g><circle cx="230" cy="90" r="46" fill="#ff4f5e" stroke="${INK}" stroke-width="4"/><path d="M270 160 V 20" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
    <path d="M200 60 A 40 40 0 1 0 262 68" stroke="#ffd23f" stroke-width="6" fill="none"/><path d="M196 52 l2 18 l14 -8 z" fill="#ffd23f"/>
    <text x="190" y="172" font-size="14" font-weight="900" fill="${INK}">ギュイーン！</text></g>`);
}

function svgDiscs(): string {
  return svgWrap(`<rect width="320" height="180" rx="18" fill="#bfeaff"/>
    ${discSvg(60, 90, 34, 11)}${discSvg(160, 90, 34, 9)}${discSvg(260, 90, 34, 7)}
    <text x="34" y="140" font-size="15" font-weight="900" fill="${INK}">パター</text><text x="116" y="140" font-size="15" font-weight="900" fill="${INK}">ミッドレンジ</text><text x="222" y="140" font-size="15" font-weight="900" fill="${INK}">ドライバー</text>
    <path d="M110 30 h80" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M196 30 l-14 -9 v18 z" fill="#fff"/><text x="118" y="22" font-size="13" font-weight="900" fill="${INK}">風</text>`);
}

function svgCoins(): string {
  return svgWrap(`<rect width="320" height="180" rx="18" fill="#bfeaff"/><rect y="140" width="320" height="40" fill="#5fcd3c"/>
    <circle cx="70" cy="70" r="20" fill="#ffcc22" stroke="#c47a00" stroke-width="4"/><path d="M70 58 l4 9 h9 l-7 6 l3 9 l-9 -5 l-9 5 l3 -9 l-7 -6 h9 z" fill="#fff6b0"/>
    <circle cx="170" cy="75" r="34" fill="none" stroke="#ff5c5c" stroke-width="8"/><circle cx="170" cy="75" r="34" fill="none" stroke="#ffe35c" stroke-width="8" stroke-dasharray="20 40"/>
    <path d="M240 140 h50 v-24 a25 25 0 0 0 -50 0 z" fill="#ff4d5e" stroke="${INK}" stroke-width="3"/><circle cx="256" cy="120" r="5" fill="#fff"/><circle cx="276" cy="126" r="4" fill="#fff"/>`);
}
