import { sfx } from '../audio/sfx';
import {
  drawHandSkeleton,
  GESTURE_MAP,
  type GestureId,
  type HandState,
} from '../vision/gestures';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

type DualGesture = Exclude<GestureId, 'none' | 'ok'>;

interface DualCard {
  left: DualGesture;
  right: DualGesture;
  isSwap: boolean;
  timeLimit: number;
  timeLeft: number;
  holdTime: number;
  popAnim: number;
}

const DUAL_POOL: DualGesture[] = ['fist', 'point', 'victory', 'open', 'thumb'];
const ROUND_SECONDS = 45;
const HOLD_REQUIRED_SEC = 0.14;

export class DualHandGame implements GameController {
  readonly id = 'dual-hand';
  readonly name = '左右手快闪';
  readonly sensor = 'hand2' as const;

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
  private card: DualCard;
  private prevPair: [DualGesture, DualGesture] = ['open', 'open'];

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
    this.prevPair = ['open', 'open'];
    this.card = this.spawnCard(true);
  }

  private pickRandom(exclude?: DualGesture): DualGesture {
    const pool = exclude ? DUAL_POOL.filter((g) => g !== exclude) : DUAL_POOL;
    return pool[Math.floor(Math.random() * pool.length)] ?? 'open';
  }

  private spawnCard(first = false): DualCard {
    const baseLimit = Math.max(2.6, 5.2 - this.cleared * 0.12);
    let left: DualGesture;
    let right: DualGesture;
    let isSwap = false;

    if (first || this.cleared < 3) {
      // Warmup: friendly symmetric or simple pairs
      left = this.pickRandom(this.prevPair[0]);
      right = this.cleared < 2 ? left : this.pickRandom();
    } else if (this.prevPair[0] !== this.prevPair[1] && Math.random() < 0.36) {
      // Brain-teaser instant left-right mirror swap!
      left = this.prevPair[1];
      right = this.prevPair[0];
      isSwap = true;
    } else {
      // Deliberately asymmetric brain-teaser pair
      left = this.pickRandom(this.prevPair[0]);
      right = this.pickRandom(left);
    }

    this.prevPair = [left, right];
    return {
      left,
      right,
      isSwap,
      timeLimit: baseLimit,
      timeLeft: baseLimit,
      holdTime: 0,
      popAnim: 0,
    };
  }

  /** Split detected hands into screen-left and screen-right slots accurately. */
  private splitHands(hands: HandState[], w: number): { leftHand: HandState | null; rightHand: HandState | null } {
    if (hands.length >= 2) {
      // HandEngine already sorts left-to-right by screen X
      return { leftHand: hands[0], rightHand: hands[1] };
    }
    if (hands.length === 1) {
      const h0 = hands[0];
      return h0.palmCenter.x < w * 0.5
        ? { leftHand: h0, rightHand: null }
        : { leftHand: null, rightHand: h0 };
    }
    return { leftHand: null, rightHand: null };
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.8);
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
          { label: '成功配对', value: `${this.cleared} 次` },
          { label: '最高连击', value: `×${this.bestCombo}` },
          { label: '超时失误', value: `${this.missed} 次` },
        ],
      });
      return;
    }

    this.card.popAnim = Math.min(1, this.card.popAnim + dt * 5.5);
    this.card.timeLeft -= dt;

    const { leftHand, rightHand } = this.splitHands(frame.hands, w);
    const leftOk = Boolean(leftHand && leftHand.gesture === this.card.left);
    const rightOk = Boolean(rightHand && rightHand.gesture === this.card.right);

    if (leftOk && rightOk) {
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
      this.fx.popText(w * 0.5, h * 0.34, '超时啦！', CANDY.coral, 30);
      sfx.miss();
      this.card = this.spawnCard();
    }
  }

  private onHit(w: number, h: number) {
    this.cleared++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);

    const fever = this.combo >= 5;
    const speedBonus = Math.round((this.card.timeLeft / this.card.timeLimit) * 10);
    const pts = (15 + speedBonus) * (fever ? 2 : 1);
    this.score += pts;

    const cy = Math.max(200, h * 0.34);
    const leftMeta = GESTURE_MAP[this.card.left];
    const rightMeta = GESTURE_MAP[this.card.right];
    this.fx.burst(w * 0.27, cy, leftMeta.color, fever ? 26 : 18, 340);
    this.fx.burst(w * 0.73, cy, rightMeta.color, fever ? 26 : 18, 340);
    this.fx.shake(fever ? 11 : 7);
    this.fx.popText(
      w * 0.5,
      cy - 70,
      fever ? `+${pts} 🔥×2` : `+${pts}`,
      fever ? CANDY.sun : CANDY.mint,
      fever ? 36 : 30,
    );

    if (this.combo === 5) {
      sfx.fever();
      this.fx.popText(w * 0.5, cy - 118, '🔥 左右脑狂热 ×2！', CANDY.sun, 26);
    } else {
      sfx.hit(this.combo);
    }

    this.flashColor = CANDY.mint;
    this.flashAlpha = 0.22;
    this.card = this.spawnCard();
  }

  private drawTargetCircle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    sideLabel: string,
    target: DualGesture,
    matched: boolean,
    timeRatio: number,
    holdRatio: number,
    popScale: number,
  ) {
    const meta = GESTURE_MAP[target];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(popScale * (matched ? 1.06 : 1), popScale * (matched ? 1.06 : 1));

    // Shadow + disc
    ctx.beginPath();
    ctx.arc(0, 6, radius, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = matched ? '#e7fff5' : CANDY.cream;
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Countdown ring
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(58, 45, 92, 0.22)';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timeRatio);
    ctx.strokeStyle = matched ? CANDY.mint : timeRatio < 0.28 ? CANDY.coral : meta.color;
    ctx.lineWidth = 7;
    ctx.stroke();

    // Lock-on inner ring
    if (matched) {
      ctx.beginPath();
      ctx.arc(0, 0, radius - 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.2, holdRatio));
      ctx.strokeStyle = CANDY.mint;
      ctx.lineWidth = 8;
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(radius * 0.85)}px ${EMOJI_FONT}`;
    ctx.fillText(meta.emoji, 0, -10);
    ctx.font = font(900, radius * 0.27);
    ctx.fillStyle = INK;
    ctx.fillText(meta.label, 0, radius * 0.5);
    ctx.restore();

    stickerPill(
      ctx,
      cx,
      cy - radius - 26,
      matched ? `${sideLabel} ✓` : sideLabel,
      matched ? CANDY.mint : CANDY.white,
      INK,
      13,
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    const { leftHand, rightHand } = this.splitHands(frame.hands, w);
    const leftOk = Boolean(leftHand && leftHand.gesture === this.card.left);
    const rightOk = Boolean(rightHand && rightHand.gesture === this.card.right);
    const fever = this.combo >= 5;

    // Subtle split center line
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 92);
    ctx.lineTo(w * 0.5, h - 104);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Independent skeletons for both hands
    if (leftHand) drawHandSkeleton(ctx, leftHand, leftOk ? CANDY.mint : CANDY.sky, 0.82);
    if (rightHand) drawHandSkeleton(ctx, rightHand, rightOk ? CANDY.mint : CANDY.pink, 0.82);

    // Fever aura
    if (fever) {
      const pulse = 0.5 + 0.35 * Math.sin(performance.now() * 0.012);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 201, 60, ${pulse})`;
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.restore();
    }

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Two side-by-side target circles
    const cy = Math.max(210, h * 0.35);
    const radius = Math.min(w * 0.19, 82);
    const popScale = 0.78 + 0.22 * (1 - (1 - this.card.popAnim) ** 3);
    const timeRatio = Math.max(0, Math.min(1, this.card.timeLeft / this.card.timeLimit));
    const holdRatio = Math.min(1, this.card.holdTime / HOLD_REQUIRED_SEC);

    this.drawTargetCircle(
      ctx,
      w * 0.27,
      cy,
      radius,
      '左手区',
      this.card.left,
      leftOk,
      timeRatio,
      holdRatio,
      popScale,
    );
    this.drawTargetCircle(
      ctx,
      w * 0.73,
      cy,
      radius,
      '右手区',
      this.card.right,
      rightOk,
      timeRatio,
      holdRatio,
      popScale,
    );

    // Mirror-swap / combo pill
    if (this.card.isSwap) {
      stickerPill(ctx, w * 0.5, cy + radius + 36, '🔀 左右互换！小心别乱！', CANDY.pink, INK, 15);
    } else if (this.combo >= 2) {
      stickerPill(
        ctx,
        w * 0.5,
        cy + radius + 36,
        fever ? `🔥 狂热 ×2 · ${this.combo} 连击` : `⚡ ${this.combo} 连击`,
        fever ? CANDY.sun : CANDY.sky,
        INK,
        15,
      );
    }

    // Guidance banner when fewer than 2 hands visible
    if (frame.hands.length < 2) {
      stickerPill(
        ctx,
        w * 0.5,
        h - 110,
        '🙌 把手机靠在桌上，同时举起左右手！',
        CANDY.sun,
        INK,
        14,
      );
    }

    // Independent live gesture pills at bottom-left & bottom-right
    const formatLive = (hand: HandState | null, side: string) => {
      if (!hand) return `${side}：未检测到`;
      if (hand.gesture === 'none') return `${side}：${hand.fingers}指`;
      const m = GESTURE_MAP[hand.gesture];
      return `${side}：${m.emoji} ${m.label}`;
    };

    stickerPill(ctx, w * 0.26, h - 54, formatLive(leftHand, '左'), leftOk ? CANDY.mint : CANDY.white, INK, 14);
    stickerPill(ctx, w * 0.74, h - 54, formatLive(rightHand, '右'), rightOk ? CANDY.mint : CANDY.white, INK, 14);

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
