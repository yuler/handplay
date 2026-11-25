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

export type CursorMood = 'idle' | 'effort' | 'excited' | 'happy';

export interface CursorOptions {
  radius?: number;
  /** Pinch-game variant: open ring while hovering, solid squeezed ball while pinching */
  pinching?: boolean;
  emoji?: string;
  /** Overrides the face inferred from `pinching` and `emoji`. */
  mood?: CursorMood;
}

function cursorMood(pinching: boolean | undefined, emoji: string | undefined, mood?: CursorMood): CursorMood {
  if (mood) return mood;
  if (pinching) return 'effort';
  if (emoji === '✓') return 'happy';
  if (emoji === '✨') return 'excited';
  return 'idle';
}

function drawCursorFace(ctx: CanvasRenderingContext2D, r: number, mood: CursorMood) {
  const blink = mood === 'idle' && Math.sin(performance.now() * 0.004) > 0.94;
  const eyeX = r * 0.32;
  const eyeY = -r * 0.08;
  const eyeR = Math.max(2.2, r * 0.2);
  ctx.lineCap = 'round';

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * eyeX, eyeY);
    if (mood === 'happy' || mood === 'effort') {
      ctx.beginPath();
      ctx.arc(0, eyeR * 0.2, eyeR, Math.PI * 1.12, Math.PI * 1.88);
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else {
      const h = blink ? eyeR * 0.18 : eyeR;
      ctx.beginPath();
      ctx.ellipse(0, 0, eyeR * 0.82, h, 0, 0, Math.PI * 2);
      ctx.fillStyle = mood === 'excited' ? CANDY.white : INK;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      if (!blink && mood === 'excited') {
        ctx.beginPath();
        ctx.arc(0, eyeR * 0.05, eyeR * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
      }
      if (!blink && h > eyeR * 0.5) {
        ctx.beginPath();
        ctx.arc(-eyeR * 0.28, -h * 0.32, eyeR * 0.26, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  ctx.beginPath();
  if (mood === 'effort') {
    ctx.ellipse(0, r * 0.32, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  } else {
    const smile = mood === 'happy' || mood === 'excited' ? 0.34 : 0.2;
    ctx.arc(0, r * 0.16, r * smile, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.lineWidth = Math.max(1.7, r * 0.13);
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

export function drawHandCursor(
  ctx: CanvasRenderingContext2D,
  p: Point2D,
  color: string,
  { radius = 13, pinching, emoji, mood }: CursorOptions = {},
) {
  const face = cursorMood(pinching, emoji, mood);
  ctx.save();
  ctx.translate(p.x, p.y);

  if (pinching === false) {
    const ring = radius + 9;
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  const r = pinching ? radius * 0.85 : pinching === false ? radius * 0.7 : radius;
  ctx.beginPath();
  ctx.arc(0, 3, r, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.38, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fill();

  if (pinching) {
    ctx.beginPath();
    ctx.arc(0, 0, r + 7, 0, Math.PI * 2);
    ctx.strokeStyle = CANDY.white;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  drawCursorFace(ctx, r, face);

  if (emoji) {
    ctx.font = `${Math.round(radius * 1.15)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, -r - radius * 0.55);
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
