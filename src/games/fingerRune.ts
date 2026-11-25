import { sfx } from '../audio/sfx';
import type { Point2D } from '../vision/gestures';
import {
  drawRuneIcon,
  recognizeRune,
  RUNE_LIST,
  RUNE_MAP,
  type RuneId,
} from '../vision/runeRecognizer';
import { drawHandCursor, drawHandLines, HandLink } from './cursor';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Monster {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  emoji: string;
  rune: RuneId;
  wobble: number;
}

interface LightningBolt {
  from: Point2D;
  to: Point2D;
  color: string;
  life: number;
  maxLife: number;
  seed: number;
}

interface CastStamp {
  x: number;
  y: number;
  rune: RuneId;
  hit: boolean;
  life: number;
  maxLife: number;
}

const ROUND_SECONDS = 50;
const MONSTER_EMOJIS = ['👾', '👻', '🦇', '🐙', '😈'];
const STILL_FINISH_SEC = 0.22;

export class FingerRuneGame implements GameController {
  readonly id = 'finger-rune';
  readonly name = '一指画符';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private zapped = 0;
  private casts = 0;
  private timeLeft = ROUND_SECONDS;
  private finished = false;

  private monsters: Monster[] = [];
  private bolts: LightningBolt[] = [];
  private stamps: CastStamp[] = [];
  private nextId = 1;
  private spawnCooldown = 0.3;

  // Air-drawing stroke state
  private stroke: Point2D[] = [];
  private drawing = false;
  private stillTime = 0;
  private lastTip: Point2D | null = null;
  private idleAnchor: Point2D | null = null;
  private tipLink = new HandLink();
  private castCooldown = 0;
  private flashColor = '';
  private flashAlpha = 0;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.zapped = 0;
    this.casts = 0;
    this.timeLeft = ROUND_SECONDS;
    this.finished = false;
    this.monsters = [];
    this.bolts = [];
    this.stamps = [];
    this.spawnCooldown = 0.2;
    this.stroke = [];
    this.drawing = false;
    this.stillTime = 0;
    this.lastTip = null;
    this.idleAnchor = null;
    this.tipLink.reset();
    this.castCooldown = 0;
    this.flashAlpha = 0;
  }

  /** Throw away a half-drawn stroke without casting (hand lost, reacquired or teleported). */
  private discardStroke() {
    this.stroke = [];
    this.drawing = false;
    this.stillTime = 0;
    this.lastTip = null;
    this.idleAnchor = null;
  }

  private spawnMonster(w: number) {
    const pad = 54;
    const x = pad + Math.random() * Math.max(40, w - pad * 2);
    const elapsed = ROUND_SECONDS - this.timeLeft;
    const speed = 44 + elapsed * 0.95 + Math.random() * 20;

    // Slightly favor runes already on screen occasionally for satisfying multi-zaps!
    let rune: RuneId;
    if (this.monsters.length > 0 && Math.random() < 0.35) {
      rune = this.monsters[Math.floor(Math.random() * this.monsters.length)].rune;
    } else {
      rune = RUNE_LIST[Math.floor(Math.random() * RUNE_LIST.length)].id;
    }

    this.monsters.push({
      id: this.nextId++,
      x,
      y: -42,
      vx: (Math.random() - 0.5) * 28,
      vy: speed,
      r: 28,
      emoji: MONSTER_EMOJIS[Math.floor(Math.random() * MONSTER_EMOJIS.length)],
      rune,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  private finishStroke(w: number, h: number) {
    const pts = this.stroke;
    this.stroke = [];
    this.drawing = false;
    this.stillTime = 0;
    this.idleAnchor = null;
    this.castCooldown = 0.14;

    if (pts.length < 5) return;
    const match = recognizeRune(pts);
    if (!match) return;

    this.casts++;
    // Compute stroke center
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;

    const meta = RUNE_MAP[match.rune];
    const matchedIndices: number[] = [];
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].rune === match.rune) {
        matchedIndices.push(i);
      }
    }

    this.stamps.push({
      x: cx,
      y: cy,
      rune: match.rune,
      hit: matchedIndices.length > 0,
      life: 0.65,
      maxLife: 0.65,
    });

    if (matchedIndices.length === 0) {
      this.fx.popText(cx, cy - 28, `未命中 ${meta.symbol} ${meta.name}`, '#cbd5e1', 20);
      sfx.whiff();
      return;
    }

    // Zap ALL matching monsters with lightning!
    const count = matchedIndices.length;
    for (let idx = matchedIndices.length - 1; idx >= 0; idx--) {
      const m = this.monsters[matchedIndices[idx]];
      this.monsters.splice(matchedIndices[idx], 1);
      this.zapped++;
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.bolts.push({
        from: { x: cx, y: cy },
        to: { x: m.x, y: m.y },
        color: meta.color,
        life: 0.34,
        maxLife: 0.34,
        seed: Math.random() * 100,
      });
      this.fx.burst(m.x, m.y, meta.color, 24, 340);
    }

    const fever = this.combo >= 5;
    const chainBonus = count > 1 ? (count - 1) * 15 : 0;
    const gained = (count * 20 + chainBonus) * (fever ? 2 : 1);
    this.score += gained;

    this.fx.shake(count > 1 ? 11 : 6, 0.2);
    this.fx.popText(
      cx,
      cy - 36,
      count > 1 ? `⚡ ${count}连锁 +${gained}!` : `${meta.name} +${gained}`,
      fever ? CANDY.sun : meta.color,
      count > 1 ? 32 : 26,
    );
    sfx.zap(count);
    if (this.combo >= 5 && this.combo - count < 5) {
      sfx.fever();
      this.fx.popText(w * 0.5, h * 0.3, '🔥 符咒狂热 ×2！', CANDY.sun, 28);
    }
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    const { hand } = frame;
    this.fx.update(dt);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.8);
    if (this.castCooldown > 0) this.castCooldown = Math.max(0, this.castCooldown - dt);
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
          { label: '消灭妖怪', value: `${this.zapped} 只` },
          { label: '施法次数', value: `${this.casts} 次` },
          { label: '最高连击', value: `×${this.bestCombo}` },
        ],
      });
      return;
    }

    // Spawn monsters
    this.spawnCooldown -= dt;
    const maxOnScreen = Math.min(6, 3 + Math.floor((ROUND_SECONDS - this.timeLeft) / 14));
    if (this.spawnCooldown <= 0 && this.monsters.length < maxOnScreen) {
      this.spawnMonster(w);
      this.spawnCooldown = Math.max(0.85, 1.65 - (ROUND_SECONDS - this.timeLeft) * 0.015);
    }

    // Handle air-wand drawing with index finger tip
    if (!this.tipLink.step(hand, hand.indexTip, w, h)) this.discardStroke();
    const stopPose = !hand.present || hand.gesture === 'fist' || hand.pinching;
    if (stopPose) {
      if (this.drawing) {
        this.finishStroke(w, h);
      }
      this.lastTip = null;
      this.idleAnchor = null;
    } else if (this.castCooldown <= 0) {
      const tip = hand.indexTip;
      const moveDist = this.lastTip ? Math.hypot(tip.x - this.lastTip.x, tip.y - this.lastTip.y) : 0;
      const speed = moveDist / Math.max(0.004, dt);

      if (!this.drawing) {
        if (!this.idleAnchor) {
          this.idleAnchor = { ...tip };
        }
        const drift = Math.hypot(tip.x - this.idleAnchor.x, tip.y - this.idleAnchor.y);
        if (speed > 135 || drift > 20) {
          this.drawing = true;
          this.stillTime = 0;
          this.stroke = [{ ...this.idleAnchor }, { ...tip }];
        }
      } else {
        const prev = this.stroke[this.stroke.length - 1];
        if (!prev || Math.hypot(tip.x - prev.x, tip.y - prev.y) >= 6) {
          this.stroke.push({ ...tip });
          if (this.stroke.length > 90) this.stroke.shift();
        }
        if (speed < 48) {
          this.stillTime += dt;
          if (this.stillTime >= STILL_FINISH_SEC) {
            this.finishStroke(w, h);
          }
        } else {
          this.stillTime = 0;
        }
      }
      this.lastTip = { ...tip };
    }

    // Update bolts & stamps
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      this.stamps[i].life -= dt;
      if (this.stamps[i].life <= 0) this.stamps.splice(i, 1);
    }

    // Move monsters downward toward bottom ward line
    const wardY = h - 108;
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const m = this.monsters[i];
      m.wobble += dt * 3;
      m.x += (m.vx + Math.sin(m.wobble) * 18) * dt;
      m.y += m.vy * dt;
      if (m.x < m.r + 12) {
        m.x = m.r + 12;
        m.vx = Math.abs(m.vx);
      } else if (m.x > w - m.r - 12) {
        m.x = w - m.r - 12;
        m.vx = -Math.abs(m.vx);
      }

      if (m.y + m.r >= wardY) {
        this.monsters.splice(i, 1);
        this.combo = 0;
        this.flashColor = CANDY.coral;
        this.flashAlpha = 0.32;
        this.fx.burst(m.x, wardY, CANDY.coral, 24, 300);
        this.fx.shake(11, 0.25);
        this.fx.popText(m.x, wardY - 24, '防线突破！', CANDY.coral, 26);
        sfx.miss();
      }
    }
  }

  private drawLightning(ctx: CanvasRenderingContext2D, bolt: LightningBolt) {
    const a = Math.max(0, bolt.life / bolt.maxLife);
    const steps = 6;
    const pts: Point2D[] = [bolt.from];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const jitter = Math.sin(bolt.seed + i * 7.3) * 24;
      pts.push({
        x: bolt.from.x + (bolt.to.x - bolt.from.x) * t + jitter,
        y: bolt.from.y + (bolt.to.y - bolt.from.y) * t + jitter * 0.4,
      });
    }
    pts.push(bolt.to);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = bolt.color;
    ctx.lineWidth = 14 * a;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5 * a;
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const { hand } = frame;
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawHandLines(ctx, hand, this.drawing ? CANDY.sun : CANDY.sky, 0.55);

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Bottom glowing magic ward line
    const wardY = h - 108;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([14, 14]);
    ctx.beginPath();
    ctx.moveTo(20, wardY);
    ctx.lineTo(w - 20, wardY);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = CANDY.coral;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    // Monsters + big unmistakable rune crests above their heads
    for (const m of this.monsters) {
      const meta = RUNE_MAP[m.rune];
      ctx.save();
      ctx.translate(m.x, m.y);

      // Monster body
      ctx.font = `${Math.round(m.r * 1.65)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.emoji, 0, 12);

      // Floating rune crest badge above monster
      const crestY = -30;
      const crestR = 23;
      ctx.beginPath();
      ctx.arc(0, crestY + 3, crestR, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, crestY, crestR, 0, Math.PI * 2);
      ctx.fillStyle = CANDY.cream;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = meta.color;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();

      drawRuneIcon(ctx, m.rune, 0, crestY, 26, meta.color, INK);
      ctx.restore();
    }

    // Lightning bolts
    for (const b of this.bolts) {
      this.drawLightning(ctx, b);
    }

    // Cast rune stamps
    for (const st of this.stamps) {
      const p = 1 - st.life / st.maxLife;
      const meta = RUNE_MAP[st.rune];
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p);
      drawRuneIcon(ctx, st.rune, st.x, st.y, 44 + p * 22, st.hit ? meta.color : '#94a3b8', INK);
      ctx.restore();
    }

    // Glowing magic stroke trail!
    if (this.stroke.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(this.stroke[0].x, this.stroke[0].y);
      for (let i = 1; i < this.stroke.length; i++) {
        ctx.lineTo(this.stroke[i].x, this.stroke[i].y);
      }
      ctx.strokeStyle = 'rgba(92, 200, 255, 0.32)';
      ctx.lineWidth = 24;
      ctx.stroke();
      ctx.strokeStyle = CANDY.sun;
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // Magic wand cursor at index fingertip
    if (hand.present) {
      drawHandCursor(ctx, hand.indexTip, this.drawing ? CANDY.sun : CANDY.sky, {
        radius: this.drawing ? 13 : 10,
      });
    }

    // Combo badge
    if (this.combo >= 3) {
      const fever = this.combo >= 5;
      stickerPill(
        ctx,
        w * 0.5,
        96,
        fever ? `🔥 狂热 ×2 · ${this.combo} 连击` : `⚡ ${this.combo} 连击`,
        fever ? CANDY.sun : CANDY.sky,
        INK,
        15,
      );
    }

    // Compact rune legend strip + bottom guidance pill
    const tip = !hand.present
      ? '☝️ 伸出食指，隔空画出妖怪头上的符号！'
      : this.drawing
        ? '✨ 绘符中… 停顿一下或握拳 ✊ 释放！'
        : '✨ 移动食指画符：—  |  ○  ∧  ∨';
    stickerPill(ctx, w * 0.5, h - 54, tip, this.drawing ? CANDY.sun : CANDY.white, INK, 14);

    ctx.save();
    ctx.font = font(800, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.textAlign = 'center';
    ctx.fillText('画完稍停 0.2 秒或握拳 ✊ 自动施法，同符号全屏连锁！', w * 0.5, h - 20);
    ctx.restore();

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
