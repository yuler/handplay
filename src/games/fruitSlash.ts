import { sfx } from '../audio/sfx';
import type { Point2D } from '../vision/gestures';
import { drawHandCursor } from './cursor';
import { dist, endCard, hint, Round, segDist, sky, title } from './kit';
import { FxSystem } from './particles';
import { cartoonBall, CANDY, EMOJI_FONT, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Fruit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  emoji: string;
  color: string;
  bomb: boolean;
  spin: number;
  cut: boolean;
}

const FRUITS = [
  { emoji: '🍉', color: '#ff6b81' },
  { emoji: '🍊', color: '#ff9f43' },
  { emoji: '🍋', color: CANDY.sun },
  { emoji: '🍇', color: CANDY.grape },
  { emoji: '🍓', color: CANDY.coral },
];

/** First fruit sits here so a straight slash can reach it. */
export const SERVE_Y = 0.42;

export class FruitSlashGame implements GameController {
  readonly id = 'fruit-slash';
  readonly name = '果汁快刀';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private sliced = 0;
  private fruits: Fruit[] = [];
  private prev: Point2D | null = null;
  private prevTrack = -1;
  private spawnIn = 0.8;
  private opened = false;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.sliced = 0;
    this.fruits = [];
    this.prev = null;
    this.prevTrack = -1;
    this.spawnIn = 0.8;
    this.opened = false;
  }

  private serve(w: number, h: number, still: boolean) {
    const bomb = !still && Math.random() < 0.16;
    const look = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const fromLeft = Math.random() < 0.5;
    this.fruits.push({
      x: still ? w / 2 : fromLeft ? -30 : w + 30,
      y: still ? h * SERVE_Y : h * (0.28 + Math.random() * 0.28),
      vx: still ? 0 : (fromLeft ? 1 : -1) * (90 + Math.random() * 70),
      vy: still ? 18 : -40 + Math.random() * 40,
      r: bomb ? 28 : 36,
      emoji: bomb ? '💣' : look.emoji,
      color: bomb ? '#ff4d5e' : look.color,
      bomb,
      spin: Math.random() * Math.PI * 2,
      cut: false,
    });
  }

  private slashFruit(f: Fruit) {
    if (f.bomb) {
      this.combo = 0;
      this.score = Math.max(0, this.score - 20);
      sfx.bomb();
      this.fx.shake(8, 0.28);
      this.fx.popText(f.x, f.y, '炸弹！', CANDY.coral, 26);
    } else {
      this.sliced++;
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      const pts = 10 + Math.min(20, this.combo * 2);
      this.score += pts;
      sfx.hit(this.combo);
      this.fx.popText(f.x, f.y, `+${pts}`, CANDY.sun, 26);
    }
    this.fx.burst(f.x, f.y, f.color, 16, 280);
    f.cut = true;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (!this.opened) {
      this.serve(w, h, true);
      this.opened = true;
    }

    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.fruits.length < 5) {
      this.serve(w, h, false);
      this.spawnIn = 0.7;
    }

    const tip = frame.hand.indexTip;
    const track = frame.hand.track ?? 0;
    const linked =
      frame.hand.present &&
      this.prev !== null &&
      track === this.prevTrack &&
      dist(this.prev.x, this.prev.y, tip.x, tip.y) < Math.min(w, h) * 0.75;

    for (const f of this.fruits) {
      f.spin += dt * 2;
      f.vy += 280 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }

    if (linked && this.prev) {
      for (const f of this.fruits) {
        if (!f.cut && segDist(this.prev.x, this.prev.y, tip.x, tip.y, f.x, f.y) < f.r + 8) this.slashFruit(f);
      }
    }
    this.fruits = this.fruits.filter((f) => !f.cut && f.y < h + 80);

    if (frame.hand.present) {
      this.prev = { x: tip.x, y: tip.y };
      this.prevTrack = track;
    } else {
      this.prev = null;
      this.combo = 0;
    }
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '切开水果', value: `${this.sliced} 个` },
        { label: '最高连切', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    sky(ctx, w, h, '#fff1e4', '#ffd0c2');
    title(ctx, w, '食指划开水果', INK);
    for (const f of this.fruits) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(Math.sin(f.spin) * 0.2);
      cartoonBall(ctx, 0, 0, f.r, f.color);
      ctx.font = `${Math.round(f.r * 1.15)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.emoji, 0, 2);
      ctx.restore();
    }
    if (!frame.hand.present) hint(ctx, w, '伸出食指，划开水果');
    if (frame.hand.present) drawHandCursor(ctx, frame.hand.indexTip, CANDY.coral, { emoji: '🔪' });
    this.fx.draw(ctx);
    ctx.restore();
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
