import { sfx } from '../audio/sfx';
import type { Point2D } from '../vision/gestures';
import { drawHandCursor } from './cursor';
import { dist, emojiAt, endCard, hint, Round, sky, title } from './kit';
import { FxSystem } from './particles';
import { CANDY } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Lantern {
  x: number;
  y: number;
  lit: boolean;
}

export const LANTERN_Y = 0.3;
/** A reused camera sample lasts one frame; a real stop has to sit still longer than this. */
export const IGNITE_DWELL = 0.18;
const MOVE_PX = 6;

export class FingerFireworkGame implements GameController {
  readonly id = 'finger-firework';
  readonly name = '指尖烟花';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private lit = 0;
  private trail: Point2D[] = [];
  private prev: Point2D | null = null;
  private prevTrack = -1;
  private stillFor = 0;
  private cool = 0;
  private lanterns: Lantern[] = [];
  private opened = false;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.lit = 0;
    this.trail = [];
    this.prev = null;
    this.prevTrack = -1;
    this.stillFor = 0;
    this.cool = 0;
    this.lanterns = [];
    this.opened = false;
  }

  private layout(w: number, h: number) {
    this.lanterns = [
      { x: w / 2, y: h * LANTERN_Y, lit: false },
      { x: w * 0.22, y: h * 0.24, lit: false },
      { x: w * 0.78, y: h * 0.24, lit: false },
    ];
    this.opened = true;
  }

  private pathLength(): number {
    let n = 0;
    for (let i = 1; i < this.trail.length; i++) n += dist(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
    return n;
  }

  private ignite() {
    const colors = [CANDY.sun, CANDY.coral, CANDY.grape, CANDY.sky];
    let hits = 0;
    for (const lantern of this.lanterns) {
      if (lantern.lit) continue;
      const near = this.trail.some((p) => dist(p.x, p.y, lantern.x, lantern.y) < 70);
      if (!near) continue;
      lantern.lit = true;
      hits++;
      this.lit++;
      this.fx.burst(lantern.x, lantern.y, CANDY.sun, 18, 260);
    }
    const end = this.trail[this.trail.length - 1];
    this.fx.burst(end.x, end.y, colors[this.lit % colors.length], 20, 320);
    if (hits > 0) {
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      const pts = 20 * hits + this.combo * 2;
      this.score += pts;
      sfx.star();
      this.fx.popText(end.x, end.y - 20, `+${pts}`, CANDY.sun, 26);
    } else {
      this.combo = 0;
      sfx.launch(0.6);
    }
    this.trail = [];
    this.cool = 0.35;
    if (this.lanterns.every((l) => l.lit)) this.lanterns.forEach((l) => (l.lit = false));
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (!this.opened) this.layout(w, h);
    this.cool = Math.max(0, this.cool - dt);
    const hand = frame.hand;
    if (!hand.present) {
      this.trail = [];
      this.prev = null;
      this.prevTrack = -1;
      this.stillFor = 0;
      return;
    }
    const tip = hand.indexTip;
    const track = hand.track ?? 0;
    // A new acquisition while `present` stays true is a jump, not a stroke the player drew.
    if (!this.prev || track !== this.prevTrack) {
      if (this.prev) this.trail = [];
      this.trail.push({ x: tip.x, y: tip.y });
      if (this.trail.length > 48) this.trail.shift();
      this.prev = { x: tip.x, y: tip.y };
      this.prevTrack = track;
      this.stillFor = 0;
      return;
    }
    const moved = dist(this.prev.x, this.prev.y, tip.x, tip.y);
    if (moved > MOVE_PX) {
      this.trail.push({ x: tip.x, y: tip.y });
      if (this.trail.length > 48) this.trail.shift();
      this.prev = { x: tip.x, y: tip.y };
      this.stillFor = 0;
      return;
    }
    // Identical samples (the camera frame reused across render ticks) and a real pause
    // both land here. Only a pause that outlasts one camera interval may ignite.
    this.stillFor += dt;
    if (this.cool <= 0 && this.stillFor >= IGNITE_DWELL && this.pathLength() > 80) this.ignite();
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '点亮灯笼', value: `${this.lit} 盏` },
        { label: '最高连击', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    sky(ctx, w, h, '#1c1740', '#3a2d6b');
    title(ctx, w, '画一条线，停住就炸开', '#fff6e5');
    for (const lantern of this.lanterns) emojiAt(ctx, lantern.lit ? '✨' : '🏮', lantern.x, lantern.y, lantern.lit ? 28 : 40);
    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (const p of this.trail) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = CANDY.sun;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    if (!frame.hand.present) hint(ctx, w, '食指画线，停一下放烟花');
    if (frame.hand.present) drawHandCursor(ctx, frame.hand.indexTip, CANDY.sun, { emoji: '✨' });
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
