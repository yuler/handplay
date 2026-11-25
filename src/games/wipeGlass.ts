import { sfx } from '../audio/sfx';
import { drawHandCursor } from './cursor';
import { dist, emojiAt, endCard, hint, Round, sky, title } from './kit';
import { FxSystem } from './particles';
import { CANDY, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

const COLS = 8;
const ROWS = 10;

export class WipeGlassGame implements GameController {
  readonly id = 'wipe-glass';
  readonly name = '擦玻璃';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private cleared = 0;
  private fog: boolean[] = [];
  private celebrated = false;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.cleared = 0;
    this.fog = Array.from({ length: COLS * ROWS }, () => true);
    this.celebrated = false;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    const hand = frame.hand;
    if (!hand.present) {
      this.combo = 0;
      return;
    }
    const cw = w / COLS;
    const ch = h / ROWS;
    const tip = hand.indexTip;
    let wiped = 0;
    for (let i = 0; i < this.fog.length; i++) {
      if (!this.fog[i]) continue;
      const cx = (i % COLS) * cw + cw / 2;
      const cy = Math.floor(i / COLS) * ch + ch / 2;
      if (dist(tip.x, tip.y, cx, cy) > 48) continue;
      this.fog[i] = false;
      wiped++;
    }
    if (wiped > 0) {
      this.cleared += wiped;
      this.combo++;
      this.score += wiped * 2;
      sfx.tap();
      if (this.cleared >= this.fog.length && !this.celebrated) {
        this.celebrated = true;
        this.score += 40;
        sfx.star();
        this.fx.popText(w / 2, h / 2, '擦亮了 +40', CANDY.sun, 28);
        this.fx.burst(w / 2, h / 2, CANDY.sky, 22, 300);
      }
    }
  }

  private finish() {
    const total = COLS * ROWS;
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '擦开', value: `${this.cleared}/${total}` },
        { label: '完成', value: this.celebrated ? '整面擦亮' : '还没擦完' },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    sky(ctx, w, h, '#d7f4ff', '#fff6e5');
    title(ctx, w, '把雾擦开', INK);
    emojiAt(ctx, '🌈', w / 2, h * 0.48, Math.min(w, h) * 0.28);
    emojiAt(ctx, '🐱', w * 0.28, h * 0.62, 54);
    emojiAt(ctx, '⭐', w * 0.74, h * 0.34, 48);
    const cw = w / COLS;
    const ch = h / ROWS;
    for (let i = 0; i < this.fog.length; i++) {
      if (!this.fog[i]) continue;
      const x = (i % COLS) * cw;
      const y = Math.floor(i / COLS) * ch;
      ctx.fillStyle = 'rgba(226, 236, 244, 0.92)';
      ctx.fillRect(x, y, cw + 1, ch + 1);
    }
    if (!frame.hand.present) hint(ctx, w, '食指把雾抹开');
    if (frame.hand.present) drawHandCursor(ctx, frame.hand.indexTip, CANDY.sky, { emoji: '🧽' });
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
