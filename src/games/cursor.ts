import { DEBUG } from '../debug';
import { drawHandSkeleton, type HandState, type Point2D } from '../vision/gestures';
import { CANDY, EMOJI_FONT, INK } from './theme';

/** Fraction of min(w, h) a hand point may move in one frame before strokes must break. */
const JUMP_FRAC = 0.25;

export const SIDE_COLORS = { left: CANDY.sky, right: CANDY.pink } as const;

export function sideColor(hand: HandState): string {
  return hand.side === 'right' ? SIDE_COLORS.right : SIDE_COLORS.left;
}

/** Skeleton lines are a debug aid only; players see the candy cursor. */
export function drawDebugSkeleton(ctx: CanvasRenderingContext2D, hand: HandState, color: string) {
  if (DEBUG) drawHandSkeleton(ctx, hand, color, 0.6);
}

export interface CursorOptions {
  radius?: number;
  /** Pinch-game variant: open ring while hovering, solid squeezed ball while pinching */
  pinching?: boolean;
  emoji?: string;
}

export function drawHandCursor(
  ctx: CanvasRenderingContext2D,
  p: Point2D,
  color: string,
  { radius = 13, pinching, emoji }: CursorOptions = {},
) {
  ctx.save();
  if (pinching === false) {
    const r = radius + 9;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  } else {
    const r = pinching ? radius * 0.85 : radius;
    ctx.beginPath();
    ctx.arc(p.x, p.y + 3, r, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();
    if (pinching) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = CANDY.white;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  if (emoji) {
    ctx.font = `${Math.round(radius * 1.2)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, p.x, p.y + 1);
  }
  ctx.restore();
}

/**
 * Tells hand-driven strokes/trails/elastics when to restart: returns false on the first frame,
 * after the hand is lost or reacquired, or when the tracked point teleports.
 */
export class HandLink {
  private track = -1;
  private last: Point2D | null = null;

  step(hand: HandState, p: Point2D, w: number, h: number): boolean {
    if (!hand.present) {
      this.reset();
      return false;
    }
    const track = hand.track ?? 0;
    const ok =
      this.last !== null &&
      track === this.track &&
      Math.hypot(p.x - this.last.x, p.y - this.last.y) <= Math.min(w, h) * JUMP_FRAC;
    this.track = track;
    this.last = { x: p.x, y: p.y };
    return ok;
  }

  reset() {
    this.track = -1;
    this.last = null;
  }
}
