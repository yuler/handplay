import { sfx } from '../audio/sfx';
import { CANDY, EMOJI_FONT, INK, stickerPill } from './theme';
import type { GameOverSummary } from './types';

export const ROUND_SECONDS = 45;

export class Round {
  timeLeft = ROUND_SECONDS;
  finished = false;

  reset(seconds = ROUND_SECONDS) {
    this.timeLeft = seconds;
    this.finished = false;
  }

  /** False once the round is over. The ending frame calls `finish` once. */
  tick(dt: number, finish: () => void): boolean {
    if (this.finished) return false;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      this.finished = true;
      sfx.finish();
      finish();
      return false;
    }
    return true;
  }

  hud(score: number, combo: number) {
    const timeLeft = Math.ceil(this.timeLeft);
    return { score, timeLeft, combo, urgent: timeLeft <= 5 };
  }
}

/** Optional translucent atmospheric veil so the live camera feed always stays visible underneath. */
export function cameraVeil(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

export function emojiAt(ctx: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number) {
  ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y);
}

/** Crisp bottom gameplay hint pill (never collides with top HUD bar). */
export function bottomHint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  bg: string = CANDY.white,
) {
  stickerPill(ctx, w / 2, h - 42, text, bg, INK, 14);
}

export function endCard(
  gameId: GameOverSummary['gameId'],
  gameName: string,
  score: number,
  stats: GameOverSummary['stats'],
): GameOverSummary {
  return { gameId, gameName, score, unit: '分', stats };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Distance from point P to segment AB. */
export function segDist(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 < 1 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}
