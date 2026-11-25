import { sfx } from '../audio/sfx';
import {
  GESTURE_LIST,
  GESTURE_MAP,
  type GestureId,
} from '../vision/gestures';
import { drawHandLines } from './cursor';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

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
  readonly sensor = 'hand1' as const;

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
      sfx.question();
      return {
        target: pick.target,
        mode: 'math',
        title: pick.expr,
        sub: '比出对应手指数！',
        color: CANDY.pink,
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

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    const { hand } = frame;
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
      this.flashColor = CANDY.coral;
      this.flashAlpha = 0.3;
      this.fx.shake(10);
      this.fx.popText(w * 0.5, h * 0.36, '超时啦！', CANDY.coral, 30);
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
      fever ? CANDY.sun : CANDY.mint,
      fever ? 36 : 30,
    );

    if (this.combo === 5) {
      sfx.fever();
      this.fx.popText(cx, cy - 105, '🔥 狂热翻倍！', CANDY.sun, 28);
    } else {
      sfx.hit(this.combo);
    }

    this.flashColor = this.card.color;
    this.flashAlpha = 0.24;
    this.card = this.spawnCard();
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const { hand } = frame;
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    const fever = this.combo >= 5;
    const accent =
      hand.present && hand.gesture === this.card.target
        ? CANDY.mint
        : fever
          ? CANDY.sun
          : CANDY.sky;

    // 1. Hand skeleton overlay
    drawHandLines(ctx, hand, accent, 0.85);

    // 2. Fever screen border aura
    if (fever) {
      const pulse = 0.5 + 0.35 * Math.sin(performance.now() * 0.012);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 201, 60, ${pulse})`;
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, w - 14, h - 14);
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

    // Sticker disc: offset ink shadow + cream face + thick ink outline
    ctx.beginPath();
    ctx.arc(0, 6, radius, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = this.card.mode === 'math' ? '#fff0f7' : CANDY.cream;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Countdown arc (outer)
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, radius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(58, 45, 92, 0.22)';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timeRatio);
    ctx.strokeStyle = timeRatio < 0.28 ? CANDY.coral : this.card.color;
    ctx.lineWidth = 9;
    ctx.stroke();

    // Hold-charge inner ring (fills mint when matching!)
    if (holdRatio > 0.02) {
      ctx.beginPath();
      ctx.arc(0, 0, radius - 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * holdRatio);
      ctx.strokeStyle = CANDY.mint;
      ctx.lineWidth = 10;
      ctx.stroke();
    }

    // Target content
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.card.mode === 'math') {
      ctx.font = font(900, radius * 0.36);
      ctx.fillStyle = INK;
      ctx.fillText(this.card.title, 0, -10);
      ctx.font = font(800, radius * 0.17);
      ctx.fillStyle = '#d6408f';
      ctx.fillText(this.card.sub, 0, radius * 0.42);
    } else {
      const meta = GESTURE_MAP[this.card.target];
      ctx.font = `${Math.round(radius * 0.88)}px ${EMOJI_FONT}`;
      ctx.fillText(meta.emoji, 0, -14);
      ctx.font = font(900, radius * 0.24);
      ctx.fillStyle = INK;
      ctx.fillText(meta.label, 0, radius * 0.48);
    }
    ctx.restore();

    // Hint pill below circle
    if (this.card.mode === 'normal') {
      stickerPill(ctx, cx, cy + radius + 40, this.card.sub, CANDY.white, INK, 15);
    }

    // 5. Combo badge
    if (this.combo >= 2) {
      const comboText = fever ? `🔥 狂热 ×2 · ${this.combo} 连击` : `⚡ ${this.combo} 连击`;
      stickerPill(ctx, cx, cy - radius - 40, comboText, fever ? CANDY.sun : CANDY.sky, INK, 16);
    }

    // 6. Live detected gesture pill near bottom
    const liveLabel = !hand.present
      ? '👋 请举起一只手到镜头前'
      : hand.gesture === 'none'
        ? `✋ 检测到手部（${hand.fingers} 指）`
        : `当前识别：${GESTURE_MAP[hand.gesture].emoji} ${GESTURE_MAP[hand.gesture].label}`;
    const liveBg = hand.present && hand.gesture === this.card.target ? CANDY.mint : CANDY.white;
    stickerPill(ctx, cx, h - 58, liveLabel, liveBg, INK, 16);

    // 7. Particles & floating scores
    this.fx.draw(ctx);
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
