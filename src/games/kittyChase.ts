import { sfx } from '../audio/sfx';
import { drawHandSkeleton } from '../vision/gestures';
import { drawCalicoKitten, drawCatWand } from './kittyArt';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

type TreatKind = 'fish' | 'yarn' | 'butterfly' | 'can';

interface Treat {
  id: number;
  kind: TreatKind;
  emoji: string;
  color: string;
  points: number;
  x: number;
  y: number;
  baseY: number;
  vx: number;
  r: number;
  phase: number;
  life: number;
}

interface Puddle {
  id: number;
  x: number;
  vx: number;
  w: number;
  splashCooldown: number;
}

const ROUND_SECONDS = 50;
const PURR_DURATION = 6.0;
const PET_HOLD_SEC = 0.55;

export class KittyChaseGame implements GameController {
  readonly id = 'kitty-chase';
  readonly name = '小花猫逗猫乐';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private caught = 0;
  private petCount = 0;
  private timeLeft = ROUND_SECONDS;
  private finished = false;
  private clock = 0;

  // Kitten physics
  private catX = 0;
  private catY = 0;
  private catVx = 0;
  private catVy = 0;
  private catInit = false;
  private facing = 1;
  private wetTimer = 0;
  private pounceTimer = 0;
  private happyTimer = 0;
  private petProgress = 0;

  // Dangling feather wand spring
  private wandX = 0;
  private wandY = 0;
  private wandInit = false;
  private lastBellAt = 0;

  // Entities
  private treats: Treat[] = [];
  private puddles: Puddle[] = [];
  private nextId = 1;
  private treatCooldown = 0.4;
  private puddleCooldown = 5.5;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.caught = 0;
    this.petCount = 0;
    this.timeLeft = ROUND_SECONDS;
    this.finished = false;
    this.clock = 0;
    this.catInit = false;
    this.catVx = 0;
    this.catVy = 0;
    this.facing = 1;
    this.wetTimer = 0;
    this.pounceTimer = 0;
    this.happyTimer = 0;
    this.petProgress = 0;
    this.wandInit = false;
    this.treats = [];
    this.puddles = [];
    this.treatCooldown = 0.35;
    this.puddleCooldown = 5.2;
  }

  private getGroundY(h: number): number {
    return h - 108;
  }

  private spawnTreat(w: number, h: number) {
    const groundY = this.getGroundY(h);
    const pad = 54;
    const x = pad + Math.random() * Math.max(40, w - pad * 2);
    const roll = Math.random();

    if (roll < 0.42) {
      // Tasty dried fish floating at reachable mid-low height
      const baseY = groundY - 24 - Math.random() * Math.min(180, h * 0.28);
      this.treats.push({
        id: this.nextId++,
        kind: 'fish',
        emoji: '🐟',
        color: CANDY.sky,
        points: 15,
        x,
        y: baseY,
        baseY,
        vx: (Math.random() - 0.5) * 30,
        r: 28,
        phase: Math.random() * Math.PI * 2,
        life: 8.5,
      });
    } else if (roll < 0.7) {
      // Rolling yarn ball along the floor
      const fromLeft = Math.random() < 0.5;
      const baseY = groundY + 4;
      this.treats.push({
        id: this.nextId++,
        kind: 'yarn',
        emoji: '🧶',
        color: CANDY.pink,
        points: 20,
        x: fromLeft ? -26 : w + 26,
        y: baseY,
        baseY,
        vx: (fromLeft ? 1 : -1) * (82 + Math.random() * 48),
        r: 28,
        phase: Math.random() * Math.PI * 2,
        life: 9,
      });
    } else if (roll < 0.9) {
      // Fluttering butterfly up high (encourages lifting wand so kitten jumps!)
      const fromLeft = Math.random() < 0.5;
      const baseY = groundY - 120 - Math.random() * Math.min(170, h * 0.25);
      this.treats.push({
        id: this.nextId++,
        kind: 'butterfly',
        emoji: '🦋',
        color: CANDY.grape,
        points: 25,
        x: fromLeft ? -26 : w + 26,
        y: baseY,
        baseY,
        vx: (fromLeft ? 1 : -1) * (76 + Math.random() * 45),
        r: 28,
        phase: Math.random() * Math.PI * 2,
        life: 8.5,
      });
    } else {
      // Rare golden cat food can!
      const baseY = groundY - 60 - Math.random() * Math.min(160, h * 0.24);
      this.treats.push({
        id: this.nextId++,
        kind: 'can',
        emoji: '🥫',
        color: CANDY.sun,
        points: 40,
        x,
        y: baseY,
        baseY,
        vx: 0,
        r: 30,
        phase: Math.random() * Math.PI * 2,
        life: 6.5,
      });
    }
  }

  private spawnPuddle(w: number) {
    const fromLeft = Math.random() < 0.5;
    this.puddles.push({
      id: this.nextId++,
      x: fromLeft ? -55 : w + 55,
      vx: (fromLeft ? 1 : -1) * (64 + Math.random() * 32),
      w: 76,
      splashCooldown: 0,
    });
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    if (this.finished) return;
    this.clock += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    const groundY = this.getGroundY(h);
    if (!this.catInit) {
      this.catX = w * 0.5;
      this.catY = groundY;
      this.wandX = w * 0.5;
      this.wandY = groundY - 110;
      this.catInit = true;
    }

    if (this.wetTimer > 0) this.wetTimer = Math.max(0, this.wetTimer - dt);
    if (this.pounceTimer > 0) this.pounceTimer = Math.max(0, this.pounceTimer - dt);
    if (this.happyTimer > 0) this.happyTimer = Math.max(0, this.happyTimer - dt);

    const { hand } = frame;
    const isHappy = this.happyTimer > 0;
    const targetTip = hand.present
      ? hand.gesture === 'open'
        ? hand.palmCenter
        : hand.indexTip
      : null;

    // Smooth spring for dangling feather bell
    if (targetTip) {
      if (!this.wandInit) {
        this.wandX = targetTip.x;
        this.wandY = targetTip.y + 34;
        this.wandInit = true;
      } else {
        const dx = targetTip.x - this.wandX;
        const dy = targetTip.y + 34 - this.wandY;
        const follow = 1 - Math.exp(-dt * 12);
        this.wandX += dx * follow;
        this.wandY += dy * follow;
        if (Math.hypot(dx, dy) > 88 && this.clock - this.lastBellAt > 0.55) {
          this.lastBellAt = this.clock;
          sfx.bell();
        }
      }
    } else {
      this.wandInit = false;
    }

    // ---- Petting check ("摸摸头") ----
    const headY = this.catY - 14;
    const nearHead =
      hand.present &&
      hand.gesture === 'open' &&
      Math.hypot(hand.palmCenter.x - this.catX, hand.palmCenter.y - headY) < 92;

    if (nearHead && !isHappy) {
      this.petProgress = Math.min(1, this.petProgress + dt / PET_HOLD_SEC);
      if (this.petProgress >= 1) {
        this.petProgress = 0;
        this.happyTimer = PURR_DURATION;
        this.petCount++;
        this.score += 20;
        sfx.purr();
        this.fx.burst(this.catX, headY - 16, CANDY.pink, 24, 300);
        this.fx.popText(this.catX, headY - 46, '💖 呼噜呼噜 ×2！', CANDY.pink, 28);
      }
    } else {
      this.petProgress = Math.max(0, this.petProgress - dt * 1.4);
    }

    // ---- Kitten chases the wand ----
    const onGround = this.catY >= groundY - 2;
    if (targetTip && !nearHead) {
      const dx = this.wandX - this.catX;
      const maxSpeed = isHappy ? 460 : 360;
      const desiredVx = Math.max(-maxSpeed, Math.min(maxSpeed, dx * 3.8));
      this.catVx += (desiredVx - this.catVx) * Math.min(1, dt * 10);
      if (Math.abs(dx) > 14) this.facing = dx > 0 ? 1 : -1;

      // Lift wand up high to make kitty leap happily!
      const wandHigh = this.wandY < groundY - 95;
      if (onGround && wandHigh && Math.abs(dx) < 220) {
        const jumpPower = Math.min(720, Math.max(460, (groundY - this.wandY) * 2.55));
        this.catVy = -jumpPower;
        if (Math.random() < 0.35) sfx.meow(isHappy);
      }
    } else {
      // Gentle idle friction
      this.catVx *= Math.exp(-dt * 7);
    }

    // Gravity & floor collision
    this.catVy += 1280 * dt;
    this.catX += this.catVx * dt;
    this.catY += this.catVy * dt;

    if (this.catY >= groundY) {
      this.catY = groundY;
      this.catVy = 0;
    }
    const minY = 128;
    if (this.catY < minY) {
      this.catY = minY;
      if (this.catVy < 0) this.catVy = 0;
    }
    this.catX = Math.max(46, Math.min(w - 46, this.catX));

    // ---- Spawn treats & gentle puddles ----
    this.treatCooldown -= dt;
    if (this.treatCooldown <= 0 && this.treats.length < 5) {
      this.spawnTreat(w, h);
      this.treatCooldown = 1.05 + Math.random() * 0.55;
    }

    this.puddleCooldown -= dt;
    if (this.puddleCooldown <= 0 && this.puddles.length < 1 && this.timeLeft < ROUND_SECONDS - 4) {
      this.spawnPuddle(w);
      this.puddleCooldown = 7.2 + Math.random() * 3.2;
    }

    // ---- Update treats & catch check ----
    const catchRadius = isHappy ? 66 : 56;
    for (let i = this.treats.length - 1; i >= 0; i--) {
      const t = this.treats[i];
      t.life -= dt;
      t.phase += dt * (t.kind === 'butterfly' ? 5.5 : 3.2);
      t.x += t.vx * dt;
      if (t.kind === 'butterfly') {
        t.y = t.baseY + Math.sin(t.phase) * 26;
      } else if (t.kind === 'fish' || t.kind === 'can') {
        t.y = t.baseY + Math.sin(t.phase) * 10;
      } else {
        t.y = groundY + 4;
      }

      // Bounce off screen edges for fish/can
      if (t.kind === 'fish' && (t.x < 40 || t.x > w - 40)) {
        t.vx = -t.vx;
      }

      if (t.life <= 0 || t.x < -70 || t.x > w + 70) {
        this.treats.splice(i, 1);
        continue;
      }

      if (Math.hypot(t.x - this.catX, t.y - (this.catY - 8)) < catchRadius + t.r * 0.5) {
        this.caught++;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.pounceTimer = 0.28;
        const mult = isHappy ? 2 : 1;
        const pts = t.points * mult;
        this.score += pts;

        if (t.kind === 'can') {
          sfx.meow(true);
          sfx.star();
        } else {
          sfx.hit(this.combo);
          if (this.combo % 4 === 0) sfx.meow(isHappy);
        }

        this.fx.burst(t.x, t.y, t.color, t.kind === 'can' ? 28 : 18, 300);
        const label = mult > 1 ? `+${pts} ✨×2` : `+${pts}`;
        this.fx.popText(t.x, t.y - 16, label, t.color, t.kind === 'can' ? 32 : 26);
        this.treats.splice(i, 1);
      }
    }

    // ---- Update puddles ----
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.x += p.vx * dt;
      if (p.splashCooldown > 0) p.splashCooldown = Math.max(0, p.splashCooldown - dt);
      if (p.x < -100 || p.x > w + 100) {
        this.puddles.splice(i, 1);
        continue;
      }

      const touchingFloor = this.catY >= groundY - 12;
      if (touchingFloor && p.splashCooldown <= 0 && Math.abs(p.x - this.catX) < p.w * 0.45 + 18) {
        p.splashCooldown = 1.6;
        this.wetTimer = 0.75;
        this.combo = 0;
        sfx.splash();
        this.fx.burst(this.catX, groundY + 14, CANDY.sky, 16, 220);
        this.fx.popText(this.catX, this.catY - 52, '💦 喵呀！甩甩毛~', CANDY.sky, 22);
      }
    }

    // Floating hearts while in happy purr mode
    if (isHappy && Math.random() < dt * 4.5) {
      this.fx.popText(
        this.catX + (Math.random() - 0.5) * 60,
        this.catY - 46,
        '💖',
        CANDY.pink,
        22,
      );
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
          { label: '抓住宝贝', value: `${this.caught} 个` },
          { label: '最高连击', value: `${this.bestCombo} 连` },
          { label: '摸头次数', value: `${this.petCount} 次` },
        ],
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const shake = this.fx.getShakeOffset();
    const groundY = this.getGroundY(h);

    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Cozy soft meadow strip at the bottom so the floor is super clear for kids
    const floorTop = groundY + 34;
    ctx.fillStyle = 'rgba(63, 212, 162, 0.34)';
    ctx.fillRect(0, floorTop, w, h - floorTop);
    ctx.beginPath();
    ctx.moveTo(0, floorTop);
    ctx.lineTo(w, floorTop);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Subtle hand skeleton
    if (frame.hand.present) {
      drawHandSkeleton(ctx, frame.hand, CANDY.sun, 0.35);
    }

    // Draw puddles on the floor
    for (const p of this.puddles) {
      ctx.save();
      ctx.translate(p.x, groundY + 38);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w * 0.5, 13, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(92, 200, 255, 0.85)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-12, -3, 14, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fill();
      ctx.font = `20px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💦', 0, -14 + Math.sin(this.clock * 6) * 2);
      ctx.restore();
    }

    // Draw treats (fish, yarn, butterfly, golden can)
    for (const t of this.treats) {
      ctx.save();
      ctx.translate(t.x, t.y);
      if (t.kind === 'yarn') {
        ctx.rotate(t.x * 0.035);
      } else {
        ctx.rotate(Math.sin(t.phase) * 0.14);
      }

      // Sticker circle behind emoji
      ctx.beginPath();
      ctx.arc(0, 0, t.r, 0, Math.PI * 2);
      ctx.fillStyle = t.kind === 'can' ? '#fff3b0' : 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();

      ctx.font = `${Math.round(t.r * 1.25)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.emoji, 0, 2);
      ctx.restore();
    }

    // Draw our calico kitten!
    const lookX = frame.hand.present ? this.wandX : w * 0.5;
    const lookY = frame.hand.present ? this.wandY : groundY - 120;
    drawCalicoKitten(ctx, {
      x: this.catX,
      y: this.catY,
      facing: this.facing,
      lookX,
      lookY,
      speedRatio: Math.min(1, Math.abs(this.catVx) / 360),
      inAir: this.catY < groundY - 4,
      happy: this.happyTimer > 0,
      wetTimer: this.wetTimer,
      pounceTimer: this.pounceTimer,
      petProgress: this.petProgress,
      time: this.clock,
    });

    // Draw feather bell cat wand
    if (frame.hand.present) {
      const isPet = frame.hand.gesture === 'open';
      const tip = isPet ? frame.hand.palmCenter : frame.hand.indexTip;
      drawCatWand(ctx, tip.x, tip.y, this.wandX, this.wandY, isPet, this.clock);
    }

    // Happy fever banner at top
    if (this.happyTimer > 0) {
      stickerPill(
        ctx,
        w * 0.5,
        92,
        `💖 呼噜开心双倍 · ${Math.ceil(this.happyTimer)}s`,
        CANDY.pink,
        INK,
        16,
      );
    } else if (this.combo >= 3) {
      stickerPill(ctx, w * 0.5, 92, `🐾 ${this.combo} 连抓！真棒！`, CANDY.sun, INK, 16);
    }

    // Bottom helper hint
    const hintText = !frame.hand.present
      ? '👋 挥挥小手，拿逗猫棒逗小花猫玩！'
      : this.puddles.length > 0
        ? '⬆️ 把手抬高，让小花猫跳过水洼 💦'
        : '🖐️ 张手停在猫头上，摸摸头触发双倍 💖';
    stickerPill(ctx, w * 0.5, h - 34, hintText, CANDY.cream, INK, 14);

    // FX particles & floating scores
    this.fx.draw(ctx);
    ctx.restore();

    // Small cat name badge when idle at start
    if (this.clock < 2.2) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, this.clock - 1.4) / 0.8);
      ctx.font = font(900, 18);
      stickerPill(ctx, this.catX, this.catY - 72, '喵～来逗我玩呀！🐱', CANDY.white, INK, 16);
      ctx.restore();
    }
  }

  getHud() {
    return {
      score: this.score,
      timeLeft: Math.ceil(this.timeLeft),
      combo: this.combo,
    };
  }
}
