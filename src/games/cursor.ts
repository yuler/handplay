import { drawHandSkeleton, type HandState, type Point2D } from '../vision/gestures';
import { CANDY, INK } from './theme';

/** Fraction of min(w, h) a hand point may move in one frame before strokes must break. */
const JUMP_FRAC = 0.25;

export const SIDE_COLORS = { left: CANDY.sky, right: CANDY.pink } as const;

export function sideColor(hand: HandState): string {
  return hand.side === 'right' ? SIDE_COLORS.right : SIDE_COLORS.left;
}

/** Always-on 21-point hand skeleton overlay so players can clearly see live tracking. */
export function drawHandLines(ctx: CanvasRenderingContext2D, hand: HandState, color: string, alpha = 0.72) {
  drawHandSkeleton(ctx, hand, color, alpha);
}

export interface CursorOptions {
  radius?: number;
  /** Pinch-game variant: open target ring while hovering, tight active ring while pinching */
  pinching?: boolean;
}

/** Clean geometric hand target indicator (ring + dot, no cartoon face). */
export function drawHandCursor(
  ctx: CanvasRenderingContext2D,
  p: Point2D,
  color: string,
  { radius = 12, pinching }: CursorOptions = {},
) {
  ctx.save();
  ctx.translate(p.x, p.y);

  if (pinching !== undefined) {
    const r = pinching ? radius + 3 : radius + 10;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, pinching ? 6.5 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = pinching ? color : CANDY.coral;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Clean fingertip / palm beacon ring + bright core
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = `${color}44`;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, Math.max(3.5, radius * 0.34), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.stroke();
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
