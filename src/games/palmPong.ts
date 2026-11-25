import { sfx } from '../audio/sfx';
import { drawHandCursor, drawHandLines } from './cursor';
import { bottomHint, dist, endCard, Round } from './kit';
import { FxSystem } from './particles';
import { cartoonBall, CANDY, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  alive: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Ball and the first bounce share this vertical fraction. */
export const BALL_Y = 0.5;

export class PalmPongGame implements GameController {
  readonly id = 'palm-pong';
  readonly name = '掌心弹球';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private bounces = 0;
  private ball: Ball = { x: 0, y: 0, vx: 40, vy: 220, r: 16 };
  private bricks: Brick[] = [];
  private bounceCd = 0;
  private sized = false;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.bounces = 0;
    this.bounceCd = 0;
    this.sized = false;
    this.bricks = [];
  }

  private layout(w: number, h: number) {
    this.ball = { x: w / 2, y: h * BALL_Y, vx: 30, vy: 240, r: 16 };
    this.bricks = [];
    const cols = 5;
    const bw = Math.min(64, (w - 40) / cols - 8);
    const total = cols * bw + (cols - 1) * 8;
    const left = (w - total) / 2;
    const colors = [CANDY.coral, CANDY.sun, CANDY.mint, CANDY.sky, CANDY.grape];
    for (let i = 0; i < cols; i++) {
      this.bricks.push({
        x: left + i * (bw + 8),
        y: h * 0.16,
        w: bw,
        h: 22,
        color: colors[i % colors.length],
        alive: true,
      });
    }
    this.sized = true;
  }

  private serve(w: number, h: number) {
    this.ball.x = w / 2;
    this.ball.y = h * 0.28;
    this.ball.vx = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 50);
    this.ball.vy = 180;
    this.combo = 0;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (!this.sized) this.layout(w, h);
    this.bounceCd = Math.max(0, this.bounceCd - dt);

    const b = this.ball;
    b.vy += 520 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < b.r) {
      b.x = b.r;
      b.vx = Math.abs(b.vx);
    } else if (b.x > w - b.r) {
      b.x = w - b.r;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y < b.r + 48) {
      b.y = b.r + 48;
      b.vy = Math.abs(b.vy);
    }
    if (b.y > h + 30) this.serve(w, h);

    const palm = frame.hand.palmCenter;
    if (frame.hand.present && this.bounceCd <= 0 && b.vy > 0 && dist(b.x, b.y, palm.x, palm.y) < b.r + 72) {
      const offset = (b.x - palm.x) / 72;
      b.vx = offset * 280;
      b.vy = -Math.max(420, Math.abs(b.vy));
      b.y = palm.y - b.r - 8;
      this.bounceCd = 0.18;
      this.bounces++;
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      this.score += 10;
      sfx.pop(this.combo);
      this.fx.burst(b.x, b.y, CANDY.mint, 8, 180);
    }

    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      const hit =
        b.x > brick.x - b.r && b.x < brick.x + brick.w + b.r && b.y > brick.y - b.r && b.y < brick.y + brick.h + b.r;
      if (!hit) continue;
      brick.alive = false;
      b.vy = Math.abs(b.vy);
      this.score += 15;
      sfx.star();
      this.fx.burst(brick.x + brick.w / 2, brick.y + brick.h / 2, brick.color, 10, 200);
      this.fx.popText(brick.x + brick.w / 2, brick.y, '+15', CANDY.sun, 22);
    }
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '掌心弹起', value: `${this.bounces} 次` },
        { label: '最高连击', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    drawHandLines(ctx, frame.hand, CANDY.mint, 0.65);
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      ctx.fillStyle = brick.color;
      ctx.beginPath();
      ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 8);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    cartoonBall(ctx, this.ball.x, this.ball.y, this.ball.r, CANDY.sun);
    if (frame.hand.present) {
      ctx.beginPath();
      ctx.arc(frame.hand.palmCenter.x, frame.hand.palmCenter.y, 72, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(63, 212, 162, 0.14)';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = CANDY.mint;
      ctx.lineWidth = 3;
      ctx.stroke();
      drawHandCursor(ctx, frame.hand.palmCenter, CANDY.mint, { radius: 14 });
    }
    bottomHint(
      ctx,
      w,
      h,
      frame.hand.present ? '🖐️ 用掌心圆圈把小球弹回去砸上方砖块！' : '👋 伸出手掌，接住落下的小球',
      frame.hand.present ? CANDY.white : CANDY.sun,
    );
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
