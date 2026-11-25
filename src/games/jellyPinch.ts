import { sfx } from '../audio/sfx';
import { drawHandCursor, drawHandLines } from './cursor';
import { bottomHint, dist, emojiAt, endCard, Round } from './kit';
import { FxSystem } from './particles';
import { CANDY, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Jelly {
  x: number;
  y: number;
  color: string;
  emoji: string;
  basket: number;
}

interface Basket {
  x: number;
  emoji: string;
  color: string;
}

export const JELLY_Y = 0.42;
export const BASKET_Y = 0.82;
export const BASKET_X = [0.27, 0.73];

export class JellyPinchGame implements GameController {
  readonly id = 'jelly-pinch';
  readonly name = '捏捏果冻';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private sorted = 0;
  private burst = 0;
  private jelly: Jelly | null = null;
  private held = false;
  private baskets: Basket[] = [];

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.sorted = 0;
    this.burst = 0;
    this.jelly = null;
    this.held = false;
    this.baskets = [];
  }

  private layout(w: number, h: number) {
    this.baskets = [
      { x: w * BASKET_X[0], emoji: '🍓', color: CANDY.coral },
      { x: w * BASKET_X[1], emoji: '🫐', color: CANDY.grape },
    ];
    this.spawn(w, h, 0);
  }

  private spawn(w: number, h: number, basket = Math.random() < 0.5 ? 0 : 1) {
    const b = this.baskets[basket];
    this.jelly = { x: w / 2, y: h * JELLY_Y, color: b.color, emoji: b.emoji, basket };
    this.held = false;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (!this.jelly || this.baskets.length === 0) this.layout(w, h);
    const jelly = this.jelly;
    if (!jelly) return;
    const hand = frame.hand;
    const squeezing = hand.present && hand.pinching && hand.pinchRatio <= 0.12;

    if (this.held && squeezing) {
      this.burst++;
      this.combo = 0;
      this.held = false;
      sfx.bomb();
      this.fx.burst(jelly.x, jelly.y, jelly.color, 18, 260);
      this.fx.popText(jelly.x, jelly.y, '挤爆了', CANDY.coral, 24);
      this.spawn(w, h);
      return;
    }

    if (this.held && hand.present && hand.pinching) {
      jelly.x = hand.pinchPos.x;
      jelly.y = hand.pinchPos.y;
      return;
    }

    if (this.held) {
      const basket = this.baskets[jelly.basket];
      const dropped = dist(jelly.x, jelly.y, basket.x, h * BASKET_Y);
      this.held = false;
      if (dropped < 78) {
        this.sorted++;
        this.combo++;
        this.best = Math.max(this.best, this.combo);
        const pts = 15 + this.combo * 2;
        this.score += pts;
        sfx.pop(this.combo);
        this.fx.burst(basket.x, h * BASKET_Y, basket.color, 12, 200);
        this.fx.popText(basket.x, h * BASKET_Y - 36, `+${pts}`, CANDY.sun, 26);
      } else {
        this.combo = 0;
        sfx.whiff();
      }
      this.spawn(w, h);
      return;
    }

    if (hand.present && hand.pinching && hand.pinchRatio > 0.12 && dist(hand.pinchPos.x, hand.pinchPos.y, jelly.x, jelly.y) < 64) {
      this.held = true;
      sfx.pinchGrab();
    }
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '放进桶', value: `${this.sorted} 个` },
        { label: '挤爆', value: `${this.burst} 个` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    drawHandLines(ctx, frame.hand, this.held ? CANDY.sun : CANDY.pink, 0.65);
    this.baskets.forEach((b) => {
      ctx.beginPath();
      ctx.ellipse(b.x, h * BASKET_Y + 6, 52, 26, 0, 0, Math.PI * 2);
      ctx.fillStyle = `${b.color}cc`;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      emojiAt(ctx, b.emoji, b.x, h * BASKET_Y + 4, 36);
    });
    if (this.jelly) {
      const squeeze = this.held ? Math.max(0.55, frame.hand.pinchRatio) : 1;
      ctx.save();
      ctx.translate(this.jelly.x, this.jelly.y);
      ctx.scale(1.15 / squeeze, squeeze);
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fillStyle = this.jelly.color;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
      emojiAt(ctx, this.jelly.emoji, this.jelly.x, this.jelly.y + 2, 28);
    }
    if (frame.hand.present) {
      drawHandCursor(ctx, frame.hand.pinchPos, this.held ? CANDY.sun : CANDY.pink, {
        pinching: frame.hand.pinching,
      });
    }
    const nearBurst = this.held && frame.hand.present && frame.hand.pinchRatio < 0.2;
    bottomHint(
      ctx,
      w,
      h,
      !frame.hand.present
        ? '👋 举起手，轻轻捏住中间果冻拖进下方同色桶'
        : nearBurst
          ? '⚠️ 捏太紧啦！稍微放松一点，别挤爆！'
          : this.held
            ? '🍮 拖到下方同色水果桶里再松手！'
            : '🤏 轻轻捏住果冻拖进同色桶（捏太紧会爆）',
      nearBurst ? CANDY.coral : this.held ? CANDY.sun : CANDY.white,
    );
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
