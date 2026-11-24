import { sfx } from '../audio/sfx';
import { drawHandSkeleton, type Point2D } from '../vision/gestures';
import { FxSystem } from './particles';
import { cartoonBall, CANDY, EMOJI_FONT, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Target {
  id: number;
  kind: 'normal' | 'star' | 'bomb';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  emoji: string;
  points: number;
  wobble: number;
}

interface Orb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  trail: Point2D[];
  hits: number;
  alive: boolean;
}

const ROUND_SECONDS = 60;
const GRAVITY = 880;
const TARGET_PALETTE = [
  { color: CANDY.coral, emoji: '🎯', points: 10 },
  { color: CANDY.sky, emoji: '🫧', points: 10 },
  { color: CANDY.mint, emoji: '🍈', points: 15 },
  { color: '#ff9f43', emoji: '🍊', points: 15 },
  { color: CANDY.grape, emoji: '👾', points: 20 },
];

export class AirSlingshotGame implements GameController {
  readonly id = 'air-slingshot';
  readonly name = '空气弹弓';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private shots = 0;
  private hits = 0;
  private timeLeft = ROUND_SECONDS;
  private finished = false;

  private targets: Target[] = [];
  private orbs: Orb[] = [];
  private nextId = 1;
  private spawnCooldown = 0;

  // Slingshot state
  private pulling = false;
  private pullOrigin: Point2D = { x: 0, y: 0 };
  private pullCurrent: Point2D = { x: 0, y: 0 };
  /** Keep short history of pull vectors so release-frame finger jitter doesn't throw aim off */
  private pullHistory: Point2D[] = [];
  private lastTickTension = 0;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.shots = 0;
    this.hits = 0;
    this.timeLeft = ROUND_SECONDS;
    this.finished = false;
    this.targets = [];
    this.orbs = [];
    this.pulling = false;
    this.pullHistory = [];
    this.spawnCooldown = 0;
  }

  private getAnchor(w: number, h: number): Point2D {
    return { x: w * 0.5, y: h * 0.77 };
  }

  private getMaxPull(w: number, h: number): number {
    return Math.min(w * 0.36, h * 0.22, 165);
  }

  private computeLaunchVel(anchor: Point2D, pullPos: Point2D, maxPull: number): { vx: number; vy: number; tension: number } {
    let dx = anchor.x - pullPos.x;
    let dy = anchor.y - pullPos.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxPull);
    const tension = clamped / maxPull;
    if (dist > 1) {
      dx = (dx / dist) * clamped;
      dy = (dy / dist) * clamped;
    }
    const speedScale = 10.6;
    return {
      vx: dx * speedScale,
      vy: dy * speedScale,
      tension,
    };
  }

  private spawnTarget(w: number, h: number) {
    const roll = Math.random();
    const minY = Math.max(105, h * 0.14);
    const maxY = h * 0.48;
    const y = minY + Math.random() * (maxY - minY);
    const fromLeft = Math.random() < 0.5;
    const baseSpeed = 48 + Math.random() * 82 + (ROUND_SECONDS - this.timeLeft) * 1.1;

    if (roll < 0.16) {
      // Golden star bonus
      this.targets.push({
        id: this.nextId++,
        kind: 'star',
        x: fromLeft ? -30 : w + 30,
        y,
        vx: (fromLeft ? 1 : -1) * (baseSpeed * 1.25),
        vy: 0,
        r: 26,
        color: CANDY.sun,
        emoji: '⭐',
        points: 35,
        wobble: Math.random() * Math.PI * 2,
      });
    } else if (roll < 0.3 && this.targets.filter((t) => t.kind === 'bomb').length < 1) {
      // Bomb obstacle
      this.targets.push({
        id: this.nextId++,
        kind: 'bomb',
        x: fromLeft ? -30 : w + 30,
        y,
        vx: (fromLeft ? 1 : -1) * (baseSpeed * 0.85),
        vy: 0,
        r: 25,
        color: '#ff4d5e',
        emoji: '💣',
        points: -20,
        wobble: Math.random() * Math.PI * 2,
      });
    } else {
      const style = TARGET_PALETTE[Math.floor(Math.random() * TARGET_PALETTE.length)];
      this.targets.push({
        id: this.nextId++,
        kind: 'normal',
        x: fromLeft ? -34 : w + 34,
        y,
        vx: (fromLeft ? 1 : -1) * baseSpeed,
        vy: 0,
        r: 28 + Math.random() * 7,
        color: style.color,
        emoji: style.emoji,
        points: style.points,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    const { hand } = frame;
    this.fx.update(dt);
    if (this.finished) return;

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      this.finished = true;
      sfx.finish();
      const acc = this.shots > 0 ? Math.round((this.hits / this.shots) * 100) : 0;
      this.onFinish({
        gameId: this.id,
        gameName: this.name,
        score: this.score,
        unit: '分',
        stats: [
          { label: '命中靶数', value: `${this.hits} 个` },
          { label: '发射次数', value: `${this.shots} 发` },
          { label: '最高连击', value: `×${this.bestCombo} · 命中 ${acc}%` },
        ],
      });
      return;
    }

    // Spawn targets to keep 4~6 active
    this.spawnCooldown -= dt;
    if (this.targets.length < 5 && this.spawnCooldown <= 0) {
      this.spawnTarget(w, h);
      this.spawnCooldown = 0.65;
    }

    const anchor = this.getAnchor(w, h);
    const maxPull = this.getMaxPull(w, h);

    // Handle pinch-to-pull slingshot
    if (hand.present && hand.pinching) {
      if (!this.pulling) {
        this.pulling = true;
        this.pullOrigin = { ...hand.pinchPos };
        this.pullCurrent = { ...anchor };
        this.pullHistory = [{ ...anchor }];
        this.lastTickTension = 0;
        sfx.pinchGrab();
      } else {
        // Relative drag from where user pinched -> mapped onto slingshot anchor!
        // This makes one-handed mobile aiming effortless anywhere on the screen.
        const relX = hand.pinchPos.x - this.pullOrigin.x;
        const relY = hand.pinchPos.y - this.pullOrigin.y;
        const dist = Math.hypot(relX, relY);
        const clamped = Math.min(dist, maxPull);
        const scale = dist > 1 ? clamped / dist : 0;
        this.pullCurrent = {
          x: anchor.x + relX * scale,
          y: anchor.y + relY * scale,
        };
        this.pullHistory.push({ ...this.pullCurrent });
        if (this.pullHistory.length > 5) this.pullHistory.shift();

        const tension = clamped / maxPull;
        if (tension - this.lastTickTension > 0.24) {
          this.lastTickTension = tension;
          sfx.stretchTick(tension);
        }
      }
    } else if (this.pulling) {
      // Released! Use stabilized position from ~2 frames prior to avoid finger-opening recoil jitter
      this.pulling = false;
      const stablePull =
        this.pullHistory.length >= 3
          ? this.pullHistory[this.pullHistory.length - 3]
          : this.pullCurrent;
      const { vx, vy, tension } = this.computeLaunchVel(anchor, stablePull, maxPull);
      if (tension > 0.18 && vy < -120) {
        this.shots++;
        this.orbs.push({
          x: stablePull.x,
          y: stablePull.y,
          vx,
          vy,
          r: 15,
          trail: [{ x: stablePull.x, y: stablePull.y }],
          hits: 0,
          alive: true,
        });
        sfx.launch(tension);
        this.fx.shake(4 + tension * 5, 0.14);
      }
      this.pullHistory = [];
    }

    // Update targets
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      t.wobble += dt * 3.2;
      t.x += t.vx * dt;
      t.y += Math.sin(t.wobble) * 28 * dt;
      if ((t.vx > 0 && t.x > w + 55) || (t.vx < 0 && t.x < -55)) {
        this.targets.splice(i, 1);
      }
    }

    // Update flying energy orbs + collisions
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.vy += GRAVITY * dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;

      // Bounce gently off side walls for fun trick-shots!
      if (o.x < o.r) {
        o.x = o.r;
        o.vx = Math.abs(o.vx) * 0.85;
      } else if (o.x > w - o.r) {
        o.x = w - o.r;
        o.vx = -Math.abs(o.vx) * 0.85;
      }

      o.trail.push({ x: o.x, y: o.y });
      if (o.trail.length > 14) o.trail.shift();

      // Check collision against targets
      for (let j = this.targets.length - 1; j >= 0; j--) {
        const t = this.targets[j];
        const d = Math.hypot(o.x - t.x, o.y - t.y);
        if (d < o.r + t.r) {
          this.targets.splice(j, 1);
          if (t.kind === 'bomb') {
            this.score = Math.max(0, this.score + t.points);
            this.combo = 0;
            this.fx.burst(t.x, t.y, CANDY.coral, 32, 420);
            this.fx.shake(14, 0.3);
            this.fx.popText(t.x, t.y, `${t.points} 💣`, CANDY.coral, 30);
            sfx.bomb();
            o.alive = false;
            break;
          } else {
            o.hits++;
            this.hits++;
            this.combo++;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            const multiBonus = o.hits > 1 ? 15 : 0;
            const comboMult = this.combo >= 5 ? 2 : 1;
            const gained = (t.points + multiBonus) * comboMult;
            this.score += gained;
            this.fx.burst(t.x, t.y, t.color, t.kind === 'star' ? 32 : 22, 360);
            this.fx.shake(o.hits > 1 ? 10 : 6, 0.2);
            this.fx.popText(
              t.x,
              t.y - 10,
              o.hits > 1 ? `穿透 +${gained}!` : `+${gained}`,
              t.kind === 'star' ? CANDY.sun : CANDY.white,
              o.hits > 1 ? 30 : 26,
            );
            sfx.pop(this.combo);
            if (t.kind === 'star') sfx.star();
            if (this.combo === 5) {
              sfx.fever();
              this.fx.popText(w * 0.5, h * 0.3, '🔥 连击翻倍！', CANDY.sun, 28);
            }
          }
        }
      }

      // Remove out-of-bounds orbs
      if (!o.alive || o.y > h + 60 || o.y < -260) {
        if (o.alive && o.hits === 0) {
          this.combo = 0;
          sfx.whiff();
        }
        this.orbs.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const { hand } = frame;
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // 1. Subtle hand skeleton
    drawHandSkeleton(ctx, hand, this.pulling ? CANDY.sun : CANDY.sky, 0.55);

    // 2. Targets: cream bubble, thick candy ring, ink outline
    for (const t of this.targets) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.beginPath();
      ctx.arc(0, 4, t.r, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, t.r, 0, Math.PI * 2);
      ctx.fillStyle = CANDY.cream;
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = t.color;
      ctx.beginPath();
      ctx.arc(0, 0, t.r - 4.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.arc(0, 0, t.r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = `${Math.round(t.r * 1.05)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.emoji, 0, 2);
      ctx.restore();
    }

    // 3. Slingshot forks & elastic bands
    const anchor = this.getAnchor(w, h);
    const maxPull = this.getMaxPull(w, h);
    const forkHalf = 34;
    const leftFork = { x: anchor.x - forkHalf, y: anchor.y };
    const rightFork = { x: anchor.x + forkHalf, y: anchor.y };
    const pocket = this.pulling ? this.pullCurrent : anchor;

    // Dotted trajectory preview when pulling!
    if (this.pulling) {
      const { vx, vy, tension } = this.computeLaunchVel(anchor, pocket, maxPull);
      if (tension > 0.16 && vy < -120) {
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK;
        for (let step = 1; step <= 14; step++) {
          const t = step * 0.048;
          let px = pocket.x + vx * t;
          const py = pocket.y + vy * t + 0.5 * GRAVITY * t * t;
          // Mirror wall bounce preview
          if (px < 15) px = 30 - px;
          else if (px > w - 15) px = (w - 15) * 2 - px;
          ctx.globalAlpha = Math.max(0.25, 1 - step * 0.055);
          ctx.beginPath();
          ctx.arc(px, py, Math.max(3, 7 - step * 0.28), 0, Math.PI * 2);
          ctx.fillStyle = step % 2 ? CANDY.white : CANDY.sun;
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Slingshot base Y-frame: wooden stick with ink outline
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y + 56);
    ctx.lineTo(anchor.x, anchor.y + 18);
    ctx.lineTo(leftFork.x, leftFork.y);
    ctx.moveTo(anchor.x, anchor.y + 18);
    ctx.lineTo(rightFork.x, rightFork.y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = CANDY.wood;
    ctx.lineWidth = 9;
    ctx.stroke();

    // Elastic bands
    ctx.beginPath();
    ctx.moveTo(leftFork.x, leftFork.y);
    ctx.lineTo(pocket.x, pocket.y);
    ctx.lineTo(rightFork.x, rightFork.y);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = this.pulling ? CANDY.coral : CANDY.pink;
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // Ball in slingshot pocket
    cartoonBall(ctx, pocket.x, pocket.y, 15, this.pulling ? CANDY.sun : '#ffe08a');
    ctx.restore();

    // 4. Flying balls + candy trails
    for (const o of this.orbs) {
      ctx.save();
      for (let i = 0; i < o.trail.length; i++) {
        const pt = o.trail[i];
        const ratio = (i + 1) / o.trail.length;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, o.r * ratio * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 201, 60, ${ratio * 0.5})`;
        ctx.fill();
      }
      cartoonBall(ctx, o.x, o.y, o.r, CANDY.sun);
      ctx.restore();
    }

    // 5. Pinch cursor ring on the user's real thumb+index midpoint
    if (hand.present) {
      ctx.save();
      const r = this.pulling ? 18 : 26;
      ctx.beginPath();
      ctx.arc(hand.pinchPos.x, hand.pinchPos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = this.pulling ? CANDY.sun : CANDY.white;
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hand.pinchPos.x, hand.pinchPos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = CANDY.coral;
      ctx.fill();
      ctx.restore();
    }

    // 6. Live bottom guidance pill
    const tip = !hand.present
      ? '👋 举起一只手，拇指+食指捏合拉弓'
      : this.pulling
        ? '🎯 往回拉瞄准，松开手指发射！'
        : '🤏 捏合拇指和食指即可隔空拉弓';
    stickerPill(ctx, w / 2, h - 52, tip, this.pulling ? CANDY.sun : CANDY.white, INK, 15);

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
