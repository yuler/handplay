import { GAMES } from './games/catalog';
import type { GameId } from './games/types';

const BEST_KEY = 'handplay:best:v1';

export function loadBest(): Partial<Record<GameId, number>> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') as Partial<Record<GameId, number>>;
  } catch {
    return {};
  }
}

export function saveBest(id: GameId, score: number): boolean {
  const best = loadBest();
  if (score > (best[id] ?? 0)) {
    best[id] = score;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch {
      // ignore storage quota
    }
    return true;
  }
  return false;
}

export function refreshBestTags() {
  const best = loadBest();
  for (const { id } of GAMES) {
    const el = document.getElementById(`best-${id}`);
    if (!el) continue;
    const score = best[id] ?? 0;
    if (score <= 0) {
      el.textContent = '✨ 来试试';
    } else if (id === 'no-blink') {
      el.textContent = `🏆 ${(score / 10).toFixed(1)} 秒`;
    } else {
      el.textContent = `🏆 最高 ${score}`;
    }
  }
}
