import { sfx } from '../audio/sfx';
import {
  drawHandSkeleton,
  GESTURE_LIST,
  GESTURE_MAP,
  type GestureId,
  type HandState,
} from '../vision/gestures';
import { FxSystem } from './particles';
import type { GameController, GameOverSummary } from './types';

interface PromptCard {
  target: Exclude<GestureId, 'none'>;
  mode: 'normal' | 'math';
  title: string;
  sub: string;
  color: string;
  timeLimit: number;
  timeLeft: number;
  holdTime: number;
  popAnim: number;
}

const MATH_PROMPTS: Array<{ expr: string; target: Exclude<GestureId, 'none'> }> = [
  { expr: '3 - 3 = ?', target: 'fist' },
  { expr: '1 + 0 = ?', target: 'point' },
  { expr: '1 + 1 = ?', target: 'victory' },
  { expr: '4 - 2 = ?', target: 'victory' },
  { expr: '2 + 3 = ?', target: 'open' },
  { expr: '1 + 4 = ?', target: 'open' },
];

const ROUND_SECONDS = 45;
const HOLD_REQUIRED_SEC = 0.13;

export class GestureRushGame implements GameController {
  readonly id = 'gesture-rush';
  readonly name = '闪电结印';

  private fx = new FxSystem();
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private cleared = 0;
  private missed = 0;
  private timeLeft = ROUND_SECONDS;
  private finished = false;
  private flashColor = '';
  private flashAlpha = 0;
  private card: PromptCard;
  private lastTarget: Exclude<GestureId, 'none'> = 'open';

  constructor(private onFinish: (summary: GameOverSummary) => void) {
    this.card = this.spawnCard(true);
  }

  reset() {
    this.fx.clear();
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.cleared = 0;
    this.missed = 0;
    this.timeLeft = ROUND_SECONDS;
    this.finished = false;
    this.flashAlpha = 0;
    this.card = this.spawnCard(true);
  }

  private spawnCard(first = false): PromptCard {
    // After 4+ clears, 25% chance for a fun finger-math prompt!
    const useMath = !first && this.cleared >= 4 && Math.random() < 0.25;
    // Speed scales gently with cleared count
    const baseLimit = Math.max(2.1, 4.4 - this.cleared * 0.1);

    if (useMath) {
      const candidates = MATH_PROMPTS.filter((m) => m.target !== this.lastTarget);
      const pick = candidates[Math.floor(Math.random() * candidates.length)] ?? MATH_PROMPTS[0];
      this.lastTarget = pick.target;
      return {
        target: pick.target,
        mode: 'math',
        title: pick.expr,
        sub: '比出对应手指数！',
        color: '#f472b6',
        timeLimit: baseLimit + 0.9,
        timeLeft: baseLimit + 0.9,
        holdTime: 0,
        popAnim: 0,
      };
    }

    const pool = GESTURE_LIST.filter((g) => g.id !== this.lastTarget);
    const meta = pool[Math.floor(Math.random() * pool.length)] ?? GESTURE_LIST[0];
    this.lastTarget = meta.id;

    return {
      target: meta.id,
      mode: 'normal',
      title: meta.label,
      sub: meta.hint,
      color: meta.color,
      timeLimit: baseLimit,
      timeLeft: baseLimit,
      holdTime: 0,
      popAnim: 0,
    };
  }

  update(dt: number, w: number, h: number, hand: HandState) {
    this.fx.update(dt);
    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.8);
    }
    if (this.finished) return;

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      this.finished = true;
      sfx.finish();
      this.onFinish({
        gameId: this.id,
        gameName: this.name,
        score: this.score,
        unit: '分',
        stats: [
          { label: '成功结印', value: `${this.cleared} 次` },
          { label: '最高连击', value: `×${this.bestCombo}` },
          { label: '超时失误', value: `${this.missed} 次` },
        ],
      });
      return;
    }

    this.card.popAnim = Math.min(1, this.card.popAnim + dt * 5.5);
    this.card.timeLeft -= dt;

    const matched = hand.present && hand.gesture === this.card.target;
    if (matched) {
      this.card.holdTime += dt;
      if (this.card.holdTime >= HOLD_REQUIRED_SEC) {
        this.onHit(w, h);
        return;
      }
    } else {
      this.card.holdTime = Math.max(0, this.card.holdTime - dt * 2.5);
    }

    if (this.card.timeLeft <= 0) {
      this.missed++;
      this.combo = 0;
      this.flashColor = '#ef4444';
      this.flashAlpha = 0.35;
      this.fx.shake(10);
      this.fx.popText(w * 0.5, h * 0.36, '超时！', '#ff6b6b', 30);
      sfx.miss();
      this.card = this.spawnCard();
    }
  }

  private onHit(w: number, h: number) {
    this.cleared++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    const fever = this.combo >= 5;
    const speedBonus = Math.round((this.card.timeLeft / this.card.timeLimit) * 5);
    const pts = (10 + speedBonus) * (fever ? 2 : 1);
    this.score += pts;

    const cx = w * 0.5;
    const cy = h * 0.34;
    this.fx.burst(cx, cy, this.card.color, fever ? 34 : 22, fever ? 420 : 320);
    this.fx.shake(fever ? 11 : 6);
    this.fx.popText(
      cx,
      cy - 50,
      fever ? `+${pts} 🔥×2` : `+${pts}`,
      fever ? '#facc15' : '#4ade80',
      fever ? 36 : 30,
    );

    if (this.combo === 5) {
      sfx.fever();
      this.fx.popText(cx, cy - 105, 'FEVER 狂热翻倍！', '#fb923c', 26);
    } else {
      sfx.hit(this.combo);
    }

    this.flashColor = this.card.color;
    this.flashAlpha = 0.24;
    this.card = this.spawnCard();
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, hand: HandState) {
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    const fever = this.combo >= 5;
    const accent =
      hand.present && hand.gesture === this.card.target
        ? '#4ade80'
        : fever
          ? '#facc15'
          : '#38bdf8';

    // 1. Hand skeleton overlay
    drawHandSkeleton(ctx, hand, accent, 0.78);

    // 2. Fever screen border aura
    if (fever) {
      const pulse = 0.45 + 0.35 * Math.sin(performance.now() * 0.012);
      ctx.save();
      ctx.strokeStyle = `rgba(250, 204, 21, ${pulse})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.restore();
    }

    // 3. Screen hit/miss flash
    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 4. Target prompt card (upper center, easy to see while holding hand in lower-mid frame)
    const cx = w * 0.5;
    const cy = Math.max(210, h * 0.33);
    const radius = Math.min(w * 0.31, 122);
    const popScale = 0.78 + 0.22 * (1 - (1 - this.card.popAnim) ** 3);
    const holdRatio = Math.min(1, this.card.holdTime / HOLD_REQUIRED_SEC);
    const timeRatio = Math.max(0, Math.min(1, this.card.timeLeft / this.card.timeLimit));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(popScale * (1 + holdRatio * 0.08), popScale * (1 + holdRatio * 0.08));

    // Glass circle backdrop
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(11, 15, 28, 0.76)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.stroke();

    // Countdown arc (outer)
    ctx.beginPath();
    ctx.arc(0, 0, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timeRatio);
    ctx.strokeStyle = timeRatio < 0.28 ? '#ff6b6b' : this.card.color;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Hold-charge inner ring (glows bright green when matching!)
    if (holdRatio > 0.02) {
      ctx.beginPath();
      ctx.arc(0, 0, radius - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * holdRatio);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Target content
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.card.mode === 'math') {
      ctx.font = `900 ${Math.round(radius * 0.36)}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
      ctx.fillStyle = '#fdf4ff';
      ctx.fillText(this.card.title, 0, -10);
      ctx.font = `700 ${Math.round(radius * 0.17)}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
      ctx.fillStyle = '#f472b6';
      ctx.fillText(this.card.sub, 0, radius * 0.42);
    } else {
      const meta = GESTURE_MAP[this.card.target];
      ctx.font = `${Math.round(radius * 0.88)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.fillText(meta.emoji, 0, -14);
      ctx.font = `900 ${Math.round(radius * 0.24)}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(meta.label, 0, radius * 0.46);
    }
    ctx.restore();

    // Hint pill below circle
    if (this.card.mode === 'normal') {
      this.drawPill(ctx, cx, cy + radius + 34, this.card.sub, 'rgba(15, 23, 42, 0.72)', '#cbd5e1', 14);
    }

    // 5. Combo badge
    if (this.combo >= 2) {
      const comboText = fever ? `🔥 FEVER ×2 · ${this.combo} 连击` : `⚡ ${this.combo} 连击`;
      this.drawPill(
        ctx,
        cx,
        cy - radius - 34,
        comboText,
        fever ? 'rgba(250, 204, 21, 0.92)' : 'rgba(56, 189, 248, 0.9)',
        '#090c16',
        15,
      );
    }

    // 6. Live detected gesture pill near bottom
    const liveLabel = !hand.present
      ? '👋 请举起一只手到镜头前'
      : hand.gesture === 'none'
        ? `✋ 检测到手部（${hand.fingers} 指）`
        : `当前识别：${GESTURE_MAP[hand.gesture].emoji} ${GESTURE_MAP[hand.gesture].label}`;
    const liveBg =
      hand.present && hand.gesture === this.card.target
        ? 'rgba(34, 197, 94, 0.88)'
        : 'rgba(15, 23, 42, 0.78)';
    this.drawPill(ctx, cx, h - 54, liveLabel, liveBg, '#ffffff', 15);

    // 7. Particles & floating scores
    this.fx.draw(ctx);
    ctx.restore();
  }

  private drawPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    bg: string,
    fg: string,
    fontSize: number,
  ) {
    ctx.save();
    ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    const padX = 16;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2;
    const bh = fontSize + 18;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, bh / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  getHud() {
    return {
      score: this.score,
      timeLeft: Math.ceil(this.timeLeft),
      combo: this.combo,
    };
  }
}
