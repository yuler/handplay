import { sfx } from '../audio/sfx';
import { drawHandCursor, drawHandLines } from './cursor';
import { bottomHint, dist, emojiAt, endCard, Round } from './kit';
import { FxSystem } from './particles';
import { CANDY, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Coin {
  x: number;
  y: number;
  held: boolean;
}

export const COIN_Y = 0.4;
export const JAR_Y = 0.84;

export class CoinMagnetGame implements GameController {
  readonly id = 'coin-magnet';
  readonly name = '金币磁铁';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private banked = 0;
  private coins: Coin[] = [];
  private spawnIn = 0;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.banked = 0;
    this.coins = [];
    this.spawnIn = 0;
  }

  private spawn(w: number, h: number, center: boolean) {
    this.coins.push({
      x: center ? w / 2 : 36 + Math.random() * (w - 72),
      y: center ? h * COIN_Y : h * (0.28 + Math.random() * 0.25),
      held: false,
    });
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (this.coins.length === 0 && this.spawnIn <= 0) this.spawn(w, h, this.banked === 0 && this.coins.length === 0);
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.coins.length < 5) {
      this.spawn(w, h, false);
      this.spawnIn = 0.85;
    }

    const hand = frame.hand;
    const jarX = w / 2;
    const jarY = h * JAR_Y;
    if (!hand.present) {
      for (const coin of this.coins) coin.held = false;
      return;
    }

    for (const coin of this.coins) {
      if (coin.held) {
        coin.x = hand.palmCenter.x;
        coin.y = hand.palmCenter.y - 28;
        continue;
      }
      if (hand.gesture !== 'open') continue;
      const d = dist(hand.palmCenter.x, hand.palmCenter.y, coin.x, coin.y);
      if (d > 190) continue;
      if (d < 36) {
        coin.held = true;
        sfx.pinchGrab();
        continue;
      }
      coin.x += ((hand.palmCenter.x - coin.x) / d) * 280 * dt;
      coin.y += ((hand.palmCenter.y - coin.y) / d) * 280 * dt;
    }

    if (hand.gesture === 'fist' && dist(hand.palmCenter.x, hand.palmCenter.y, jarX, jarY) < 100) {
      const dropping = this.coins.filter((c) => c.held);
      if (dropping.length > 0) {
        this.coins = this.coins.filter((c) => !c.held);
        this.banked += dropping.length;
        this.combo++;
        this.best = Math.max(this.best, this.combo);
        const pts = 12 * dropping.length;
        this.score += pts;
        sfx.bell();
        this.fx.burst(jarX, jarY, CANDY.sun, 14, 220);
        this.fx.popText(jarX, jarY - 40, `+${pts}`, CANDY.sun, 26);
      }
    }
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '存进罐', value: `${this.banked} 枚` },
        { label: '最高连击', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const hand = frame.hand;
    const heldCount = this.coins.filter((c) => c.held).length;
    drawHandLines(ctx, hand, hand.gesture === 'open' ? CANDY.sun : CANDY.mint, 0.65);

    ctx.beginPath();
    ctx.arc(w / 2, h * JAR_Y, 44, 0, Math.PI * 2);
    ctx.fillStyle = heldCount > 0 ? 'rgba(255, 243, 176, 0.85)' : 'rgba(255, 255, 255, 0.72)';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    emojiAt(ctx, '🏺', w / 2, h * JAR_Y + 2, 54);

    for (const coin of this.coins) {
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 246, 229, 0.9)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      emojiAt(ctx, '🪙', coin.x, coin.y + 1, 28);
    }

    if (hand.present) {
      drawHandCursor(ctx, hand.palmCenter, hand.gesture === 'fist' ? CANDY.mint : CANDY.sun, { radius: 14 });
    }
    bottomHint(
      ctx,
      w,
      h,
      !hand.present
        ? '👋 张开手掌 🖐️ 吸金币，再移到下方罐子旁握拳 ✊ 倒入'
        : heldCount > 0
          ? `🪙 已吸住 ${heldCount} 枚！移到下方 🏺 罐子旁握拳 ✊ 存进去`
          : '🖐️ 张开五指靠近金币吸住它！',
      heldCount > 0 ? CANDY.sun : CANDY.white,
    );
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
