import { sfx } from '../audio/sfx';
import type { Point2D } from '../vision/gestures';
import { drawHandCursor } from './cursor';
import { dist, endCard, hint, Round, sky, title } from './kit';
import { FxSystem } from './particles';
import { CANDY, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Drum {
  x: number;
  emoji: string;
  color: string;
  cool: number;
}

export const DRUM_Y = 0.72;
/** Downward speed, so the same physical tap counts at 30fps and 60fps camera samples. */
export const DRUM_HIT_SPEED = 700;

export class FingerDrumGame implements GameController {
  readonly id = 'finger-drum';
  readonly name = '食指敲鼓';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private hits = 0;
  private drums: Drum[] = [];
  private prev: Point2D | null = null;
  private prevTrack = -1;
  /** Seconds since the last fresh camera sample, skipping reused positions. */
  private freshFor = 0;
  private opened = false;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.hits = 0;
    this.drums = [];
    this.prev = null;
    this.prevTrack = -1;
    this.freshFor = 0;
    this.opened = false;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (!this.opened) {
      this.drums = [
        { x: w * 0.2, emoji: '🥁', color: CANDY.coral, cool: 0 },
        { x: w * 0.5, emoji: '🪘', color: CANDY.sun, cool: 0 },
        { x: w * 0.8, emoji: '🥁', color: CANDY.grape, cool: 0 },
      ];
      this.opened = true;
    }
    for (const drum of this.drums) drum.cool = Math.max(0, drum.cool - dt);

    const hand = frame.hand;
    if (!hand.present) {
      this.prev = null;
      this.prevTrack = -1;
      this.freshFor = 0;
      this.combo = 0;
      return;
    }
    const tip = hand.indexTip;
    const track = hand.track ?? 0;
    if (!this.prev || track !== this.prevTrack) {
      this.prev = { x: tip.x, y: tip.y };
      this.prevTrack = track;
      this.freshFor = 0;
      return;
    }
    const dy = tip.y - this.prev.y;
    const moved = dist(this.prev.x, this.prev.y, tip.x, tip.y);
    this.freshFor += dt;
    if (moved < 1) return;
    const jumped = moved > Math.min(w, h) * 0.7;
    const speed = dy / Math.max(this.freshFor, 0.001);
    this.prev = { x: tip.x, y: tip.y };
    this.freshFor = 0;
    if (jumped || speed < DRUM_HIT_SPEED) return;
    const y = h * DRUM_Y;
    for (const drum of this.drums) {
      if (drum.cool > 0) continue;
      if (dist(tip.x, tip.y, drum.x, y) > 62) continue;
      drum.cool = 0.22;
      this.hits++;
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      const pts = 10 + Math.min(15, this.combo);
      this.score += pts;
      sfx.bubbleNote(this.combo);
      this.fx.burst(drum.x, y, drum.color, 12, 220);
      this.fx.popText(drum.x, y - 46, `+${pts}`, CANDY.sun, 24);
      this.fx.shake(3, 0.12);
    }
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '敲中', value: `${this.hits} 下` },
        { label: '最高连击', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    sky(ctx, w, h, '#fff6e0', '#ffd8a8');
    title(ctx, w, '食指快速点下去', INK);
    const y = h * DRUM_Y;
    for (const drum of this.drums) {
      ctx.beginPath();
      ctx.ellipse(drum.x, y + 18, 46, 16, 0, 0, Math.PI * 2);
      ctx.fillStyle = drum.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = '40px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(drum.emoji, drum.x, y - 8);
    }
    if (!frame.hand.present) hint(ctx, w, '食指从上往下敲鼓');
    if (frame.hand.present) drawHandCursor(ctx, frame.hand.indexTip, CANDY.coral, { emoji: '👇' });
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
