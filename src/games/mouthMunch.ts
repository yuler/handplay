import { sfx } from '../audio/sfx';
import { drawFaceOverlay, type FaceState } from '../vision/faceEngine';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

type ItemKind = 'tasty' | 'bomb' | 'ice' | 'monster';

interface FallingItem {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  emoji: string;
  color: string;
  points: number;
  wobble: number;
  sucked: boolean;
}

interface LaserBeam {
  x1: number;
  x2: number;
  yStart: number;
  life: number;
  maxLife: number;
}

const ROUND_SECONDS = 50;
const JAW_OPEN_THRESH = 0.32;
const BLINK_LASER_THRESH = 0.55;
const BLINK_COOLDOWN_SEC = 0.45;
const CHEEK_SHIELD_THRESH = 0.45;
const SUCTION_RADIUS = 175;

const TASTY_POOL = [
  { emoji: '⭐', color: CANDY.sun, points: 15, r: 24 },
  { emoji: '🍎', color: CANDY.coral, points: 10, r: 24 },
  { emoji: '🍓', color: CANDY.pink, points: 15, r: 23 },
  { emoji: '💎', color: CANDY.sky, points: 30, r: 24 },
  { emoji: '🪙', color: '#fbbf24', points: 20, r: 22 },
];

export class MouthMunchGame implements GameController {
  readonly id = 'mouth-munch';
  readonly name = '大嘴吞星';
  readonly sensor = 'face' as const;

  private fx = new FxSystem();
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private eaten = 0;
  private laserHits = 0;
  private timeLeft = ROUND_SECONDS;
  private finished = false;

  private avatarX = 0;
  private avatarInit = false;
  private items: FallingItem[] = [];
  private lasers: LaserBeam[] = [];
  private nextId = 1;
  private spawnCooldown = 0.4;

  // Blink laser edge trigger
  private blinkArmed = true;
  private laserCooldown = 0;
  private mouthChompAnim = 0;
  private flashColor = '';
  private flashAlpha = 0;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.eaten = 0;
    this.laserHits = 0;
    this.timeLeft = ROUND_SECONDS;
    this.finished = false;
    this.avatarInit = false;
    this.items = [];
    this.lasers = [];
    this.spawnCooldown = 0.35;
    this.blinkArmed = true;
    this.laserCooldown = 0;
    this.mouthChompAnim = 0;
    this.flashAlpha = 0;
  }

  private spawnItem(w: number) {
    const pad = 42;
    const x = pad + Math.random() * Math.max(40, w - pad * 2);
    const elapsed = ROUND_SECONDS - this.timeLeft;
    const speedBase = 135 + elapsed * 2.4 + Math.random() * 55;
    const roll = Math.random();

    if (roll < 0.58) {
      const pick = TASTY_POOL[Math.floor(Math.random() * TASTY_POOL.length)];
      this.items.push({
        id: this.nextId++,
        kind: 'tasty',
        x,
        y: -36,
        vx: (Math.random() - 0.5) * 32,
        vy: speedBase,
        r: pick.r,
        emoji: pick.emoji,
        color: pick.color,
        points: pick.points,
        wobble: Math.random() * Math.PI * 2,
        sucked: false,
      });
    } else if (roll < 0.74) {
      this.items.push({
        id: this.nextId++,
        kind: 'ice',
        x,
        y: -36,
        vx: (Math.random() - 0.5) * 20,
        vy: speedBase * 0.85,
        r: 27,
        emoji: '🧊',
        color: '#7dd3fc',
        points: 25,
        wobble: Math.random() * Math.PI * 2,
        sucked: false,
      });
    } else if (roll < 0.88) {
      this.items.push({
        id: this.nextId++,
        kind: 'monster',
        x,
        y: -36,
        vx: (Math.random() - 0.5) * 55,
        vy: speedBase * 0.92,
        r: 26,
        emoji: '👾',
        color: CANDY.grape,
        points: 30,
        wobble: Math.random() * Math.PI * 2,
        sucked: false,
      });
    } else {
      this.items.push({
        id: this.nextId++,
        kind: 'bomb',
        x,
        y: -36,
        vx: (Math.random() - 0.5) * 26,
        vy: speedBase * 0.96,
        r: 25,
        emoji: '💣',
        color: CANDY.coral,
        points: -20,
        wobble: Math.random() * Math.PI * 2,
        sucked: false,
      });
    }
  }

  private fireEyeLasers(avatarY: number) {
    this.laserCooldown = BLINK_COOLDOWN_SEC;
    this.lasers.push({
      x1: this.avatarX - 18,
      x2: this.avatarX + 18,
      yStart: avatarY - 22,
      life: 0.24,
      maxLife: 0.24,
    });
    sfx.laser();

    // Hit breakable ice, monsters, and bombs in the laser column
    let hitsNow = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.y > avatarY - 8 || it.y < -10) continue;
      if (it.kind === 'tasty') continue;
      if (Math.abs(it.x - this.avatarX) <= it.r + 42) {
        this.items.splice(i, 1);
        hitsNow++;
        this.laserHits++;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const mult = this.combo >= 5 ? 2 : 1;
        const pts = (it.kind === 'bomb' ? 15 : it.points) * mult;
        this.score += pts;
        this.fx.burst(it.x, it.y, it.color, 26, 360);
        this.fx.popText(it.x, it.y, `⚡ +${pts}`, CANDY.sky, 26);
      }
    }
    if (hitsNow > 0) {
      this.fx.shake(7, 0.16);
      sfx.pop(this.combo);
    }
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    const { face } = frame;
    this.fx.update(dt);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.8);
    if (this.mouthChompAnim > 0) this.mouthChompAnim = Math.max(0, this.mouthChompAnim - dt * 5);
    if (this.laserCooldown > 0) this.laserCooldown = Math.max(0, this.laserCooldown - dt);

    if (!this.avatarInit) {
      this.avatarX = w * 0.5;
      this.avatarInit = true;
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
          { label: '吞下美味', value: `${this.eaten} 个` },
          { label: '激光击碎', value: `${this.laserHits} 个` },
          { label: '最高连击', value: `×${this.bestCombo}` },
        ],
      });
      return;
    }

    const avatarY = h * 0.77;
    const shieldActive = face.present && face.cheekPuff > CHEEK_SHIELD_THRESH;
    const mouthOpen = face.present && face.jawOpen > JAW_OPEN_THRESH;

    // Effortless steering: blend nose position + head tilt (roll) + yaw
    if (face.present) {
      const steerGain = shieldActive ? 1.2 : 1;
      const offsetFromCenter =
        (face.nosePos.x - w * 0.5) * 0.78 +
        face.roll * w * 0.42 * steerGain +
        face.yaw * w * 0.28 * steerGain;
      const targetX = Math.max(52, Math.min(w - 52, w * 0.5 + offsetFromCenter));
      this.avatarX += (targetX - this.avatarX) * (1 - Math.exp(-dt * 14));

      // Edge-triggered twin eye blink laser
      const bothBlink = face.blinkL > BLINK_LASER_THRESH && face.blinkR > BLINK_LASER_THRESH;
      if (bothBlink && this.blinkArmed && this.laserCooldown <= 0) {
        this.blinkArmed = false;
        this.fireEyeLasers(avatarY);
      } else if (face.blinkL < 0.32 && face.blinkR < 0.32) {
        this.blinkArmed = true;
      }
    }

    // Spawn falling items
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0 && this.items.length < 11) {
      this.spawnItem(w);
      const pace = Math.max(0.36, 0.76 - (ROUND_SECONDS - this.timeLeft) * 0.007);
      this.spawnCooldown = pace;
    }

    // Update lasers
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      this.lasers[i].life -= dt;
      if (this.lasers[i].life <= 0) this.lasers.splice(i, 1);
    }

    // Update falling items + magnetic suction + collisions
    const avatarR = shieldActive ? 48 : 38;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.wobble += dt * 3.5;

      const dx = this.avatarX - it.x;
      const dy = avatarY - it.y;
      const dist = Math.hypot(dx, dy);

      // Magnetic vortex when mouth is open! Pulls tasty items strongly (and bombs slightly if too close!)
      if (mouthOpen && dist < SUCTION_RADIUS && dist > 1) {
        if (it.kind === 'tasty') {
          it.sucked = true;
          const pull = 680 * (1 - dist / SUCTION_RADIUS) + 280;
          it.x += (dx / dist) * pull * dt;
          it.y += (dy / dist) * pull * dt;
        } else if (it.kind === 'bomb' && dist < SUCTION_RADIUS * 0.65) {
          const pull = 220 * (1 - dist / (SUCTION_RADIUS * 0.65));
          it.x += (dx / dist) * pull * dt;
          it.y += (dy / dist) * pull * dt;
        }
      } else {
        it.sucked = false;
      }

      if (!it.sucked) {
        it.x += (it.vx + Math.sin(it.wobble) * 18) * dt;
        it.y += it.vy * dt;
        if (it.x < it.r + 8) {
          it.x = it.r + 8;
          it.vx = Math.abs(it.vx);
        } else if (it.x > w - it.r - 8) {
          it.x = w - it.r - 8;
          it.vx = -Math.abs(it.vx);
        }
      }

      // Check collision with avatar
      if (dist < avatarR + it.r * 0.85) {
        this.items.splice(i, 1);

        if (it.kind === 'tasty') {
          if (mouthOpen || dist < 34) {
            this.eaten++;
            this.combo++;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            const fever = this.combo >= 5;
            const gained = it.points * (fever ? 2 : 1);
            this.score += gained;
            this.mouthChompAnim = 1;
            this.fx.burst(it.x, it.y, it.color, 18, 280);
            this.fx.popText(
              this.avatarX,
              avatarY - 56,
              fever ? `+${gained} 🔥` : `+${gained}`,
              fever ? CANDY.sun : CANDY.mint,
              fever ? 30 : 25,
            );
            sfx.munch(this.combo);
            if (this.combo === 5) {
              sfx.fever();
              this.fx.popText(w * 0.5, h * 0.34, '🔥 吞星狂热 ×2！', CANDY.sun, 28);
            }
          } else {
            // Bounced off closed mouth gently
            this.fx.popText(this.avatarX, avatarY - 50, '张大嘴才能吞哦!', CANDY.white, 20);
          }
        } else if (shieldActive) {
          // Cheek-puff shield deflects hazards!
          this.score += 10;
          this.fx.burst(it.x, it.y, CANDY.mint, 24, 340);
          this.fx.popText(this.avatarX, avatarY - 60, '🛡️ 鼓腮弹开 +10', CANDY.mint, 24);
          sfx.shield();
        } else if (it.kind === 'ice') {
          this.combo = 0;
          this.fx.burst(it.x, it.y, '#7dd3fc', 20, 260);
          this.fx.shake(8, 0.2);
          this.fx.popText(this.avatarX, avatarY - 56, '🧊 眨眼击碎它!', '#7dd3fc', 23);
          sfx.miss();
        } else {
          // Bomb or monster hit!
          this.score = Math.max(0, this.score - 20);
          this.combo = 0;
          this.flashColor = CANDY.coral;
          this.flashAlpha = 0.32;
          this.fx.burst(it.x, it.y, CANDY.coral, 30, 380);
          this.fx.shake(13, 0.28);
          this.fx.popText(this.avatarX, avatarY - 56, '-20 💣', CANDY.coral, 30);
          sfx.bomb();
        }
        continue;
      }

      if (it.y > h + 50) {
        this.items.splice(i, 1);
      }
    }
  }

  private drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, face: FaceState) {
    const jaw = face.present ? face.jawOpen : 0;
    const open = jaw > JAW_OPEN_THRESH;
    const shield = face.present && face.cheekPuff > CHEEK_SHIELD_THRESH;
    const now = performance.now() * 0.006;

    ctx.save();
    ctx.translate(x, y);

    // Suction vortex rings when mouth is open
    if (open) {
      for (let k = 0; k < 3; k++) {
        const phase = (now * 1.4 + k / 3) % 1;
        const r = SUCTION_RADIUS * (1 - phase);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(18, r), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(63, 212, 162, ${phase * 0.55})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }

    // Cheek-puff bubble shield
    if (shield) {
      const pulse = 54 + Math.sin(now * 2.5) * 4;
      ctx.beginPath();
      ctx.arc(0, 0, pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(63, 212, 162, 0.22)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = CANDY.mint;
      ctx.stroke();
    }

    // Body shadow + chubby body
    const squishX = 1 + (shield ? 0.14 : 0) + this.mouthChompAnim * 0.1;
    const squishY = 1 - this.mouthChompAnim * 0.08 + (open ? 0.06 : 0);
    ctx.scale(squishX, squishY);

    ctx.beginPath();
    ctx.arc(0, 5, 38, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fillStyle = open ? CANDY.sun : CANDY.cream;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Blush cheeks (puff bigger when cheekPuff!)
    const cheekR = shield ? 11 : 7;
    ctx.fillStyle = CANDY.pink;
    ctx.beginPath();
    ctx.arc(-22, 4, cheekR, 0, Math.PI * 2);
    ctx.arc(22, 4, cheekR, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (mirror player blink!)
    const blinkAmt = face.present ? Math.max(face.blinkL, face.blinkR) : 0;
    const eyeH = Math.max(1.5, 7 * (1 - blinkAmt * 0.85));
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(-14, -12, 5.5, eyeH, 0, 0, Math.PI * 2);
    ctx.ellipse(14, -12, 5.5, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();
    if (eyeH > 3) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-16, -14, 2, 0, Math.PI * 2);
      ctx.arc(12, -14, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth (scales smoothly with jawOpen)
    const mouthW = 12 + jaw * 16;
    const mouthH = Math.max(4, jaw * 26);
    ctx.beginPath();
    ctx.ellipse(0, 12, mouthW, mouthH, 0, 0, Math.PI * 2);
    ctx.fillStyle = open ? '#ff4d6d' : INK;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (open) {
      ctx.beginPath();
      ctx.ellipse(0, 12 + mouthH * 0.35, mouthW * 0.55, mouthH * 0.35, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8fa3';
      ctx.fill();
    }

    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const { face } = frame;
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Subtle AR face contour
    drawFaceOverlay(ctx, face, face.jawOpen > JAW_OPEN_THRESH ? CANDY.mint : CANDY.sky, 0.35);

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Twin neon eye lasers
    for (const beam of this.lasers) {
      const a = Math.max(0, beam.life / beam.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.lineCap = 'round';
      for (const bx of [beam.x1, beam.x2]) {
        ctx.beginPath();
        ctx.moveTo(bx, beam.yStart);
        ctx.lineTo(bx, 0);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 24 * a;
        ctx.stroke();
        ctx.strokeStyle = CANDY.sky;
        ctx.lineWidth = 17 * a;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6 * a;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Falling items
    for (const it of this.items) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.beginPath();
      ctx.arc(0, 4, it.r, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, it.r, 0, Math.PI * 2);
      ctx.fillStyle = it.kind === 'bomb' ? '#ffe4e6' : CANDY.cream;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = it.color;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();

      ctx.font = `${Math.round(it.r * 1.1)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.emoji, 0, 2);
      ctx.restore();
    }

    // Cute mouth-eater avatar
    const avatarY = h * 0.77;
    this.drawAvatar(ctx, this.avatarX, avatarY, face);

    // Fever / combo badge
    if (this.combo >= 3) {
      const fever = this.combo >= 5;
      stickerPill(
        ctx,
        w * 0.5,
        104,
        fever ? `🔥 狂热 ×2 · ${this.combo} 连击` : `⚡ ${this.combo} 连击`,
        fever ? CANDY.sun : CANDY.sky,
        INK,
        15,
      );
    }

    // Bottom dynamic guidance pill
    let tip = '😮 歪头移动 · 张大嘴吸星星 · 眨眼放激光';
    let bg: string = CANDY.white;
    if (!face.present) {
      tip = '🙂 请把脸对准前置摄像头';
      bg = CANDY.sun;
    } else if (face.cheekPuff > CHEEK_SHIELD_THRESH) {
      tip = '🛡️ 鼓腮护盾开启中！可弹开炸弹';
      bg = CANDY.mint;
    } else if (face.jawOpen > JAW_OPEN_THRESH) {
      tip = '🌪️ 漩涡吸星中！小心别吸到炸弹 💣';
      bg = CANDY.sun;
    }
    stickerPill(ctx, w * 0.5, h - 50, tip, bg, INK, 14);

    // Subtle status badges for quick learning
    if (face.present) {
      ctx.save();
      ctx.font = font(800, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.textAlign = 'center';
      ctx.fillText('🐡 鼓腮 = 护盾   👁️ 双眼眨 = 激光击碎 🧊👾', w * 0.5, h - 18);
      ctx.restore();
    }

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
