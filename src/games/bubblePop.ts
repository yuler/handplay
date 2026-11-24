import { sfx } from '../audio/sfx';
import { drawHandSkeleton, type HandState, type Point2D } from '../vision/gestures';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

type BubbleKind = 'normal' | 'gold' | 'cloud';

interface Bubble {
  id: number;
  kind: BubbleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  emoji: string;
  color: string;
  wobble: number;
  wobbleAmp: number;
  hp: number;
  hitCooldown: number;
  fanned: boolean;
}

interface MusicNote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  glyph: string;
  color: string;
  life: number;
  maxLife: number;
}

const ROUND_SECONDS = 50;
const TOY_POOL = [
  { emoji: '⭐', color: CANDY.sun },
  { emoji: '🐥', color: '#ffd166' },
  { emoji: '🍬', color: CANDY.pink },
  { emoji: '🐠', color: CANDY.sky },
  { emoji: '🍓', color: CANDY.coral },
  { emoji: '🦄', color: CANDY.grape },
  { emoji: '🌸', color: '#ff9ec4' },
  { emoji: '🍀', color: CANDY.mint },
];
const HAND_COLORS = [CANDY.sky, CANDY.pink];

export class BubblePopGame implements GameController {
  readonly id = 'bubble-pop';
  readonly name = '彩虹泡泡乐团';
  readonly sensor = 'hand2' as const;

  private fx = new FxSystem();
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private popped = 0;
  private goldPopped = 0;
  private noteStep = 0;
  private timeLeft = ROUND_SECONDS;
  private finished = false;
  private clock = 0;

  private bubbles: Bubble[] = [];
  private notes: MusicNote[] = [];
  private nextId = 1;
  private spawnCooldown = 0.25;
  private goldCooldown = 7.5;
  private prevPalms: Array<Point2D | null> = [null, null];

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.popped = 0;
    this.goldPopped = 0;
    this.noteStep = 0;
    this.timeLeft = ROUND_SECONDS;
    this.finished = false;
    this.clock = 0;
    this.bubbles = [];
    this.notes = [];
    this.spawnCooldown = 0.2;
    this.goldCooldown = 7.0;
    this.prevPalms = [null, null];
  }

  private spawnBubble(w: number, h: number, forceGold = false) {
    const pad = 54;
    const x = pad + Math.random() * Math.max(40, w - pad * 2);

    if (forceGold) {
      this.bubbles.push({
        id: this.nextId++,
        kind: 'gold',
        x: w * 0.28 + Math.random() * (w * 0.44),
        y: h + 68,
        vx: 0,
        vy: -(52 + Math.random() * 18),
        r: 58,
        emoji: '👑',
        color: CANDY.sun,
        wobble: Math.random() * Math.PI * 2,
        wobbleAmp: 18,
        hp: 3,
        hitCooldown: 0,
        fanned: false,
      });
      return;
    }

    const roll = Math.random();
    if (roll < 0.14 && this.timeLeft < ROUND_SECONDS - 4) {
      this.bubbles.push({
        id: this.nextId++,
        kind: 'cloud',
        x,
        y: h + 46,
        vx: 0,
        vy: -(64 + Math.random() * 26),
        r: 36,
        emoji: '⛈️',
        color: '#8e9aaf',
        wobble: Math.random() * Math.PI * 2,
        wobbleAmp: 20,
        hp: 1,
        hitCooldown: 0,
        fanned: false,
      });
      return;
    }

    const toy = TOY_POOL[Math.floor(Math.random() * TOY_POOL.length)];
    const r = 31 + Math.random() * 10;
    this.bubbles.push({
      id: this.nextId++,
      kind: 'normal',
      x,
      y: h + r + 14,
      vx: 0,
      vy: -(72 + Math.random() * 44),
      r,
      emoji: toy.emoji,
      color: toy.color,
      wobble: Math.random() * Math.PI * 2,
      wobbleAmp: 16 + Math.random() * 18,
      hp: 1,
      hitCooldown: 0,
      fanned: false,
    });
  }

  private spawnMusicNote(x: number, y: number, color: string) {
    const glyphs = ['♪', '♫', '♬'];
    this.notes.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 65,
      vy: -115 - Math.random() * 45,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      color,
      life: 0.9,
      maxLife: 0.9,
    });
  }

  private getHandTouchPoints(hand: HandState): Point2D[] {
    if (!hand.present) return [];
    const pts: Point2D[] = [hand.indexTip, hand.palmCenter];
    if (hand.pts.length >= 21) {
      pts.push(hand.pts[12]); // middle tip for wide kid-friendly pokes
    }
    return pts;
  }

  private popGoldBubble(b: Bubble, doubleClap: boolean) {
    this.popped++;
    this.goldPopped++;
    this.combo += doubleClap ? 2 : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const pts = doubleClap ? 60 : 50;
    this.score += pts;
    sfx.bigBubblePop();
    this.fx.shake(7, 0.25);
    this.fx.burst(b.x, b.y, CANDY.sun, 26, 360);
    this.fx.burst(b.x, b.y, CANDY.pink, 18, 290);
    this.fx.burst(b.x, b.y, CANDY.sky, 14, 240);
    this.spawnMusicNote(b.x - 16, b.y, CANDY.sun);
    this.spawnMusicNote(b.x + 16, b.y, CANDY.pink);
    this.fx.popText(
      b.x,
      b.y - 12,
      doubleClap ? `🙌 双手齐拍！+${pts}` : `👑 黄金大泡泡！+${pts}`,
      CANDY.sun,
      30,
    );
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    if (this.finished) return;
    this.clock += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    // Track hand speeds for fanning away storm clouds
    const activeHands = frame.hands.filter((hh) => hh.present).slice(0, 2);
    const handSpeeds: number[] = [0, 0];
    const handPoints: Point2D[][] = [];

    for (let i = 0; i < 2; i++) {
      const hh = activeHands[i];
      if (hh) {
        const prev = this.prevPalms[i];
        if (prev && dt > 0) {
          handSpeeds[i] = Math.hypot(hh.palmCenter.x - prev.x, hh.palmCenter.y - prev.y) / dt;
        }
        this.prevPalms[i] = { x: hh.palmCenter.x, y: hh.palmCenter.y };
        handPoints.push(this.getHandTouchPoints(hh));
      } else {
        this.prevPalms[i] = null;
        handPoints.push([]);
      }
    }

    // Spawn regular bubbles gently so screen always feels lively
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0 && this.bubbles.length < 9) {
      this.spawnBubble(w, h, false);
      this.spawnCooldown = 0.62 + Math.random() * 0.35;
    }

    // Spawn giant golden bubble periodically
    this.goldCooldown -= dt;
    const hasGold = this.bubbles.some((b) => b.kind === 'gold');
    if (this.goldCooldown <= 0 && !hasGold && this.timeLeft > 4) {
      this.spawnBubble(w, h, true);
      this.goldCooldown = 10.5 + Math.random() * 3;
    }

    // Update bubbles & hand interactions
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      if (b.hitCooldown > 0) b.hitCooldown = Math.max(0, b.hitCooldown - dt);

      if (b.fanned) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -120 || b.x > w + 120 || b.y < -120 || b.y > h + 120) {
          this.bubbles.splice(i, 1);
        }
        continue;
      }

      b.wobble += dt * 2.2;
      b.x += (b.vx + Math.sin(b.wobble) * b.wobbleAmp) * dt;
      b.y += b.vy * dt;
      b.x = Math.max(b.r + 10, Math.min(w - b.r - 10, b.x));

      if (b.y < -b.r - 30) {
        this.bubbles.splice(i, 1);
        continue;
      }

      // Check which hands touch this bubble
      let touchedByHand0 = false;
      let touchedByHand1 = false;
      const touchPad = b.kind === 'cloud' ? 14 : 20;

      for (let hi = 0; hi < activeHands.length; hi++) {
        const pts = handPoints[hi];
        for (const p of pts) {
          if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r + touchPad) {
            if (hi === 0) touchedByHand0 = true;
            else touchedByHand1 = true;
            break;
          }
        }
      }

      // Extra generous fan radius for storm cloud when waving an open hand fast
      if (b.kind === 'cloud') {
        let fannedBy = -1;
        for (let hi = 0; hi < activeHands.length; hi++) {
          const hh = activeHands[hi];
          const near = Math.hypot(hh.palmCenter.x - b.x, hh.palmCenter.y - b.y) < b.r + 74;
          if (near && handSpeeds[hi] > 260 && (hh.gesture === 'open' || hh.fingers >= 3)) {
            fannedBy = hi;
            break;
          }
        }
        if (fannedBy >= 0) {
          const hh = activeHands[fannedBy];
          const dirX = b.x >= hh.palmCenter.x ? 1 : -1;
          b.fanned = true;
          b.vx = dirX * 720;
          b.vy = -260;
          this.score += 15;
          sfx.fanAway();
          this.fx.burst(b.x, b.y, CANDY.mint, 14, 240);
          this.fx.popText(b.x, b.y - 16, '💨 吹走乌云！+15', CANDY.mint, 22);
          continue;
        }
      }

      if (!touchedByHand0 && !touchedByHand1) continue;

      if (b.kind === 'normal') {
        this.popped++;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const bonus = this.combo >= 8 ? 5 : 0;
        const pts = 10 + bonus;
        this.score += pts;
        sfx.bubbleNote(this.noteStep++);
        this.fx.burst(b.x, b.y, b.color, 18, 280);
        this.spawnMusicNote(b.x, b.y - 8, b.color);
        this.fx.popText(b.x, b.y - 12, `+${pts}`, b.color, 26);
        this.bubbles.splice(i, 1);
      } else if (b.kind === 'gold') {
        if (touchedByHand0 && touchedByHand1) {
          this.popGoldBubble(b, true);
          this.bubbles.splice(i, 1);
        } else if (b.hitCooldown <= 0) {
          b.hp--;
          b.hitCooldown = 0.26;
          if (b.hp <= 0) {
            this.popGoldBubble(b, false);
            this.bubbles.splice(i, 1);
          } else {
            b.r = Math.max(44, b.r - 5);
            sfx.bubbleNote(this.noteStep++);
            this.fx.burst(b.x, b.y, CANDY.sun, 10, 180);
            this.fx.popText(b.x, b.y - 26, `再拍 ${b.hp} 下！`, CANDY.sun, 22);
          }
        }
      } else if (b.kind === 'cloud') {
        this.combo = 0;
        sfx.splash();
        this.fx.burst(b.x, b.y, '#94a3b8', 16, 200);
        this.fx.popText(b.x, b.y - 14, '☁️ 小乌云！挥手扇走它', '#e2e8f0', 20);
        this.bubbles.splice(i, 1);
      }
    }

    // Update floating music notes
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      n.life -= dt;
      if (n.life <= 0) {
        this.notes.splice(i, 1);
        continue;
      }
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.vy *= Math.exp(-dt * 1.8);
    }

    this.fx.update(dt);

    if (this.timeLeft <= 0 && !this.finished) {
      this.finished = true;
      sfx.finish();
      this.onFinish({
        gameId: this.id,
        gameName: this.name,
        score: this.score,
        unit: '分',
        stats: [
          { label: '戳破泡泡', value: `${this.popped} 个` },
          { label: '最高连击', value: `${this.bestCombo} 连` },
          { label: '黄金大泡泡', value: `${this.goldPopped} 个` },
        ],
      });
    }
  }

  private drawBubble(ctx: CanvasRenderingContext2D, b: Bubble) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const pulse = 1 + Math.sin(this.clock * 5 + b.wobble) * 0.04;
    ctx.scale(pulse, 2 - pulse);

    // Translucent glossy bubble body
    const grad = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.3, b.r * 0.1, 0, 0, b.r);
    if (b.kind === 'gold') {
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      grad.addColorStop(0.55, 'rgba(255, 201, 60, 0.62)');
      grad.addColorStop(1, 'rgba(255, 143, 199, 0.72)');
    } else if (b.kind === 'cloud') {
      grad.addColorStop(0, 'rgba(226, 232, 240, 0.9)');
      grad.addColorStop(1, 'rgba(100, 116, 139, 0.78)');
    } else {
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.88)');
      grad.addColorStop(0.65, `${b.color}66`);
      grad.addColorStop(1, `${b.color}bb`);
    }

    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = b.kind === 'gold' ? 4 : 3;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Inner toy emoji
    ctx.font = `${Math.round(b.r * 0.95)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.emoji, 0, 2);

    // Glossy bubble specular arc
    ctx.beginPath();
    ctx.ellipse(-b.r * 0.34, -b.r * 0.34, b.r * 0.24, b.r * 0.13, -0.7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();

    // Helper label on giant golden bubble
    if (b.kind === 'gold') {
      ctx.font = font(900, 13);
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.fillStyle = CANDY.white;
      const tag = '🙌 双手拍！';
      ctx.strokeText(tag, 0, b.r - 12);
      ctx.fillText(tag, 0, b.r - 12);
    }

    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Draw tracked hands with glowing magic rings
    const activeHands = frame.hands.filter((hh) => hh.present).slice(0, 2);
    activeHands.forEach((hh, idx) => {
      const color = HAND_COLORS[idx % HAND_COLORS.length];
      drawHandSkeleton(ctx, hh, color, 0.55);

      // Cute star wand glow at index fingertip
      ctx.save();
      ctx.translate(hh.indexTip.x, hh.indexTip.y);
      ctx.beginPath();
      ctx.arc(0, 0, 18 + Math.sin(this.clock * 10 + idx) * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `${color}55`;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = `18px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✨', 0, 1);
      ctx.restore();
    });

    // Draw all bubbles
    for (const b of this.bubbles) {
      this.drawBubble(ctx, b);
    }

    // Draw musical notes floating up
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of this.notes) {
      const alpha = Math.max(0, n.life / n.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = font(900, 30);
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.strokeText(n.glyph, n.x, n.y);
      ctx.fillStyle = n.color;
      ctx.fillText(n.glyph, n.x, n.y);
      ctx.restore();
    }

    // Combo banner
    if (this.combo >= 4) {
      stickerPill(ctx, w * 0.5, 92, `🎵 泡泡连奏 ×${this.combo}！`, CANDY.sun, INK, 16);
    }

    // Bottom hint pill
    const hint =
      activeHands.length === 0
        ? '🫧 伸出小手戳泡泡！单手双手都能玩～'
        : activeHands.length === 2
          ? '🙌 双手模式启动！一起拍爆黄金大泡泡 ✨'
          : '✨ 再伸另一只手，或和爸妈一起双人戳泡泡！';
    stickerPill(ctx, w * 0.5, h - 34, hint, CANDY.cream, INK, 14);

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
