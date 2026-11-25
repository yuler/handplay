import { sfx } from '../audio/sfx';
import { drawHandCursor, drawHandLines } from './cursor';
import { bottomHint, dist, emojiAt, endCard, Round } from './kit';
import { FxSystem } from './particles';
import { CANDY, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Fish {
  x: number;
  y: number;
  vx: number;
  emoji: string;
  hooked: boolean;
}

export const FISH_Y = 0.38;
export const BUCKET_Y = 0.82;

export class AirFishingGame implements GameController {
  readonly id = 'air-fishing';
  readonly name = '隔空钓鱼';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private caught = 0;
  private fish: Fish[] = [];
  private opened = false;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.caught = 0;
    this.fish = [];
    this.opened = false;
  }

  private spawn(w: number, h: number, still: boolean) {
    const emojis = ['🐟', '🐠', '🐡'];
    this.fish.push({
      x: still ? w / 2 : 40 + Math.random() * (w - 80),
      y: still ? h * FISH_Y : h * (0.28 + Math.random() * 0.22),
      vx: still ? 28 : (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 40),
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      hooked: false,
    });
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (!this.opened) {
      this.spawn(w, h, true);
      this.opened = true;
    }
    if (this.fish.length < 3 && Math.random() < dt * 0.8) this.spawn(w, h, false);

    const pinch = frame.hand.pinchPos;
    const bucketX = w / 2;
    const bucketY = h * BUCKET_Y;

    for (const fish of this.fish) {
      if (!fish.hooked) {
        fish.x += fish.vx * dt;
        if (fish.x < 36 || fish.x > w - 36) fish.vx *= -1;
        if (frame.hand.present && frame.hand.pinching && dist(pinch.x, pinch.y, fish.x, fish.y) < 56) {
          fish.hooked = true;
          sfx.pinchGrab();
        }
        continue;
      }
      if (!frame.hand.present || !frame.hand.pinching) {
        fish.hooked = false;
        this.combo = 0;
        sfx.whiff();
        continue;
      }
      const dx = bucketX - fish.x;
      const dy = bucketY - fish.y;
      const d = Math.hypot(dx, dy) || 1;
      fish.x += (dx / d) * 340 * dt;
      fish.y += (dy / d) * 340 * dt;
      if (d < 42) {
        fish.hooked = false;
        fish.x = -999;
        this.caught++;
        this.combo++;
        this.best = Math.max(this.best, this.combo);
        const pts = 20 + this.combo * 2;
        this.score += pts;
        sfx.splash();
        this.fx.burst(bucketX, bucketY, CANDY.sky, 14, 220);
        this.fx.popText(bucketX, bucketY - 30, `+${pts}`, CANDY.sun, 26);
      }
    }
    this.fish = this.fish.filter((f) => f.x > -100);
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '钓上', value: `${this.caught} 条` },
        { label: '最高连击', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    drawHandLines(ctx, frame.hand, frame.hand.pinching ? CANDY.sun : CANDY.sky, 0.65);

    ctx.beginPath();
    ctx.ellipse(w / 2, h * BUCKET_Y + 10, 56, 20, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(92, 200, 255, 0.45)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    emojiAt(ctx, '🪣', w / 2, h * BUCKET_Y - 8, 48);

    const anyHooked = this.fish.some((f) => f.hooked);
    for (const fish of this.fish) {
      if (fish.hooked && frame.hand.present) {
        ctx.beginPath();
        ctx.moveTo(frame.hand.pinchPos.x, frame.hand.pinchPos.y);
        ctx.lineTo(fish.x, fish.y);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = CANDY.sun;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(fish.x, fish.y, 28, 0, Math.PI * 2);
      ctx.fillStyle = fish.hooked ? 'rgba(255, 243, 176, 0.92)' : 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      emojiAt(ctx, fish.emoji, fish.x, fish.y + 2, 34);
    }

    if (frame.hand.present) {
      drawHandCursor(ctx, frame.hand.pinchPos, frame.hand.pinching ? CANDY.sun : CANDY.sky, {
        pinching: frame.hand.pinching,
      });
    }
    bottomHint(
      ctx,
      w,
      h,
      !frame.hand.present
        ? '👋 举起手，用拇指+食指捏住小鱼！'
        : anyHooked
          ? '🎣 上钩啦！一直捏住不松手，等鱼拉进水桶！'
          : '🤏 靠近小鱼并捏住拇指+食指，一直捏着拉进桶',
      anyHooked ? CANDY.sun : CANDY.white,
    );
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
