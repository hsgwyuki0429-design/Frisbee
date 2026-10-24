export type Quality = 'low' | 'mid' | 'high';

export interface Settings {
  bgm: number;
  sfx: number;
  quality: Quality;
  sensitivity: number;
  slowmo: boolean;
  ghost: boolean;
  vibration: boolean;
}

export interface SaveData {
  version: 1;
  coins: number;
  totalCoinsEarned: number;
  ownedSkins: string[];
  skin: string;
  lastDisc: string;
  /** Best strokes per hole id. */
  holeBest: Record<string, number>;
  /** Best total per world id (sum of strokes). */
  worldBest: Record<string, number>;
  worldsCleared: string[];
  challenge: { distance: number; target: number; rings: number };
  settings: Settings;
  tutorialDone: boolean;
  stats: { throws: number; holes: number; holeInOnes: number; longest: number };
}

const KEY = 'disc-island-save-v1';

export function defaultSettings(): Settings {
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return { bgm: 0.6, sfx: 0.8, quality: mobile ? 'mid' : 'high', sensitivity: 1, slowmo: true, ghost: true, vibration: true };
}

function defaults(): SaveData {
  return {
    version: 1,
    coins: 0,
    totalCoinsEarned: 0,
    ownedSkins: ['classic'],
    skin: 'classic',
    lastDisc: 'midrange',
    holeBest: {},
    worldBest: {},
    worldsCleared: [],
    challenge: { distance: 0, target: 0, rings: 0 },
    settings: defaultSettings(),
    tutorialDone: false,
    stats: { throws: 0, holes: 0, holeInOnes: 0, longest: 0 },
  };
}

let data: SaveData = load();

function load(): SaveData {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...base,
      ...parsed,
      challenge: { ...base.challenge, ...(parsed.challenge ?? {}) },
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      ownedSkins: Array.from(new Set(['classic', ...(parsed.ownedSkins ?? [])])),
    };
  } catch {
    return base;
  }
}

export function save(): SaveData {
  return data;
}

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode) */
  }
}

export function update(fn: (d: SaveData) => void): void {
  fn(data);
  persist();
}

export function resetSave(): void {
  const keep = data.settings;
  data = defaults();
  data.settings = keep;
  persist();
}
