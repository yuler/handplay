import { sfx } from '../audio/sfx';
import { drawFaceSweat, type FaceState } from '../vision/faceEngine';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

type ChallengeMode = 'blink' | 'laugh';
type Phase = 'ready' | 'surviving' | 'caught';

interface FlyBug {
  x: number;
  y: number;
  vx: number;
  vy: number;
  emoji: string;
  phase: number;
  life: number;
  targetEye: 'left' | 'right';
}

interface TauntBubble {
  x: number;
  y: number;
  vy: number;
  text: string;
  bg: string;
  life: number;
  maxLife: number;
}

interface PopEmoji {
  x: number;
  y: number;
  emoji: string;
  size: number;
  life: number;
  maxLife: number;
}

const BLINK_THRESH = 0.62;
const BLINK_HOLD_SEC = 0.07;
const SMILE_THRESH = 0.48;
const SMILE_HOLD_SEC = 0.12;

const BLINK_TAUNTS = [
  '你刚才是不是眨眼了？👀',
  '眼睛是不是有点干呀~ 💧',
  '千万别往左边看！⬅️',
  '3… 2… 1… 眨！😜',
  '睫毛在微微发抖哦 ✨',
  '眨一下又不会怎样嘛~',
  '蚊子飞进眼睛啦！！🦟',
  '坚持住！眼泪快流出来了 😂',
];

const LAUGH_TAUNTS = [
  '为什么企鹅只有肚子白？因为手短洗不到背 🐧',
  '小明买了隐形斗篷，结果找不到了 🧥',
  '你刚才嘴角翘了 0.5 毫米！😏',
  '哈哈哈哈哈哈哈 😂',
  '医生说我笑点低，我笑着说不可能 🤣',
  '其实你现在憋笑的样子超好笑 🤡',
  '忍住！憋到内伤也不能笑！',
  '鱼为什么不说话？因为在水里怕呛到 🐟',
  '别绷啦，笑出来多舒服呀~ 😆',
];

const FUNNY_EMOJIS = ['🤡', '😂', '🤪', '👀', '💦', '😜', '🫣', '👻'];

export class NoBlinkGame implements GameController {
  readonly id = 'no-blink';
  readonly name = '别眨眼 / 憋笑';
  readonly sensor = 'face' as const;

  private fx = new FxSystem();
  private mode: ChallengeMode = 'blink';
  private phase: Phase = 'ready';
  private readyTimer = 2.0;
  private lastReadySec = 3;
  private elapsed = 0;
  private failHold = 0;
  private caughtDelay = 0;
  private flashAlpha = 0;
  private snapshotUrl = '';
  private wavesDodged = 0;
  private noFaceTimer = 0;

  // Distractions
  private flies: FlyBug[] = [];
  private taunts: TauntBubble[] = [];
  private popEmojis: PopEmoji[] = [];
  private flyCooldown = 2.2;
  private tauntCooldown = 1.8;
  private emojiCooldown = 2.6;
  private tauntIdx = 0;

  // Cached hitboxes for top 2-in-1 toggle buttons
  private tabBlinkRect = { x: 0, y: 0, w: 0, h: 0 };
  private tabLaughRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.phase = 'ready';
    this.readyTimer = 2.0;
    this.lastReadySec = 3;
    this.elapsed = 0;
    this.failHold = 0;
    this.caughtDelay = 0;
    this.flashAlpha = 0;
    this.snapshotUrl = '';
    this.wavesDodged = 0;
    this.noFaceTimer = 0;
    this.flies = [];
    this.taunts = [];
    this.popEmojis = [];
    this.flyCooldown = 1.6;
    this.tauntCooldown = 1.4;
    this.emojiCooldown = 2.2;
  }

  onTap(x: number, y: number) {
    if (this.phase === 'caught') return;
    const hit = (r: { x: number; y: number; w: number; h: number }) =>
      x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (hit(this.tabBlinkRect) && this.mode !== 'blink') {
      this.mode = 'blink';
      sfx.tap();
      this.reset();
    } else if (hit(this.tabLaughRect) && this.mode !== 'laugh') {
      this.mode = 'laugh';
      sfx.tap();
      this.reset();
    }
  }

  private captureSnapshot(video: HTMLVideoElement): string {
    const outW = 480;
    const outH = 600;
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const c = off.getContext('2d');
    if (!c) return '';

    // Cover-crop & horizontally mirror the video frame
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.max(outW / vw, outH / vh);
    const rw = vw * scale;
    const rh = vh * scale;
    const ox = (outW - rw) / 2;
    const oy = (outH - rh) / 2;

    c.save();
    c.translate(outW, 0);
    c.scale(-1, 1);
    c.drawImage(video, ox, oy, rw, rh);
    c.restore();

    // Subtle dark gradient at bottom for polaroid stamp readability
    const grad = c.createLinearGradient(0, outH - 170, 0, outH);
    grad.addColorStop(0, 'rgba(9, 12, 22, 0)');
    grad.addColorStop(0.55, 'rgba(9, 12, 22, 0.78)');
    grad.addColorStop(1, 'rgba(9, 12, 22, 0.94)');
    c.fillStyle = grad;
    c.fillRect(0, outH - 170, outW, 170);

    // Polaroid frame border
    c.strokeStyle = '#ffffff';
    c.lineWidth = 10;
    c.strokeRect(5, 5, outW - 10, outH - 10);

    // Stamped badge
    const badge =
      this.mode === 'blink'
        ? `坚持 ${this.elapsed.toFixed(1)} 秒！眨眼啦 👁️`
        : `坚持 ${this.elapsed.toFixed(1)} 秒！破功瞬间 😂`;
    stickerPill(c, outW / 2, outH - 72, badge, CANDY.sun, INK, 22);

    c.font = font(800, 14);
    c.fillStyle = 'rgba(248, 250, 252, 0.78)';
    c.textAlign = 'center';
    c.fillText('HandPlay · handplay.yuler.dev', outW / 2, outH - 26);

    try {
      return off.toDataURL('image/jpeg', 0.9);
    } catch {
      return '';
    }
  }

  private getIntensity(face: FaceState): number {
    if (!face.present) return 0;
    return this.mode === 'blink' ? Math.max(face.blinkL, face.blinkR) : face.smile;
  }

  private spawnDistractions(dt: number, w: number, h: number) {
    const intensityScale = Math.min(2.2, 1 + this.elapsed * 0.055);

    this.flyCooldown -= dt * intensityScale;
    if (this.flyCooldown <= 0 && this.flies.length < 4) {
      const fromLeft = Math.random() < 0.5;
      this.flies.push({
        x: fromLeft ? -24 : w + 24,
        y: h * (0.2 + Math.random() * 0.45),
        vx: (fromLeft ? 1 : -1) * (90 + Math.random() * 70),
        vy: (Math.random() - 0.5) * 60,
        emoji: Math.random() < 0.5 ? '🪰' : '🦟',
        phase: Math.random() * Math.PI * 2,
        life: 4.5,
        targetEye: Math.random() < 0.5 ? 'left' : 'right',
      });
      this.wavesDodged++;
      this.flyCooldown = 2.6 + Math.random() * 1.4;
    }

    this.tauntCooldown -= dt * intensityScale;
    if (this.tauntCooldown <= 0) {
      const pool = this.mode === 'blink' ? BLINK_TAUNTS : LAUGH_TAUNTS;
      const text = pool[this.tauntIdx % pool.length];
      this.tauntIdx++;
      const colors = [CANDY.sun, CANDY.pink, CANDY.sky, CANDY.cream];
      this.taunts.push({
        x: w * (0.3 + Math.random() * 0.4),
        y: h * (0.28 + Math.random() * 0.24),
        vy: -24,
        text,
        bg: colors[this.tauntIdx % colors.length],
        life: 3.1,
        maxLife: 3.1,
      });
      this.wavesDodged++;
      this.tauntCooldown = 3.0 + Math.random() * 1.3;
    }

    this.emojiCooldown -= dt * intensityScale;
    if (this.emojiCooldown <= 0) {
      this.popEmojis.push({
        x: w * (0.16 + Math.random() * 0.68),
        y: h * (0.22 + Math.random() * 0.48),
        emoji: FUNNY_EMOJIS[Math.floor(Math.random() * FUNNY_EMOJIS.length)],
        size: 56 + Math.random() * 28,
        life: 1.5,
        maxLife: 1.5,
      });
      this.emojiCooldown = 2.5 + Math.random() * 1.8;
    }
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    const { face, video } = frame;
    this.fx.update(dt);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.4);

    if (this.phase === 'caught') {
      this.caughtDelay -= dt;
      if (this.caughtDelay <= 0) {
        const tenths = Math.round(this.elapsed * 10);
        const modeLabel = this.mode === 'blink' ? '👁️ 别眨眼' : '😐 憋笑挑战';
        this.onFinish({
          gameId: this.id,
          gameName: `${this.name}（${this.mode === 'blink' ? '别眨眼' : '憋笑'}）`,
          score: tenths,
          scoreDisplay: `${this.elapsed.toFixed(1)} 秒`,
          unit: '秒',
          snapshotUrl: this.snapshotUrl || undefined,
          snapshotFilename: `handplay-${this.mode}-${this.elapsed.toFixed(1)}s.jpg`,
          stats: [
            { label: '坚持时长', value: `${this.elapsed.toFixed(1)} 秒` },
            { label: '顶住干扰', value: `${this.wavesDodged} 波` },
            { label: '挑战模式', value: modeLabel },
          ],
        });
      }
      return;
    }

    if (this.phase === 'ready') {
      if (!face.present) return;
      this.readyTimer -= dt;
      const sec = Math.ceil(this.readyTimer);
      if (sec < this.lastReadySec && sec > 0) {
        this.lastReadySec = sec;
        sfx.countdown(false);
      }
      if (this.readyTimer <= 0) {
        this.phase = 'surviving';
        this.elapsed = 0;
        this.failHold = 0;
        sfx.countdown(true);
        this.fx.popText(
          w * 0.5,
          h * 0.42,
          this.mode === 'blink' ? '👁️ 开始！别眨眼！' : '😐 开始！不许笑！',
          CANDY.mint,
          28,
        );
      }
      return;
    }

    // Surviving phase
    if (!face.present) {
      this.noFaceTimer += dt;
      return;
    }
    this.noFaceTimer = 0;
    this.elapsed += dt;

    // Check failure condition
    const intensity = this.getIntensity(face);
    const thresh = this.mode === 'blink' ? BLINK_THRESH : SMILE_THRESH;
    const holdReq = this.mode === 'blink' ? BLINK_HOLD_SEC : SMILE_HOLD_SEC;

    if (intensity > thresh) {
      this.failHold += dt;
      if (this.failHold >= holdReq) {
        this.phase = 'caught';
        this.caughtDelay = 0.65;
        this.flashAlpha = 0.92;
        this.snapshotUrl = this.captureSnapshot(video);
        sfx.shutter();
        this.fx.shake(12, 0.25);
        this.fx.popText(
          w * 0.5,
          h * 0.42,
          this.mode === 'blink' ? '📸 抓到了！你眨眼啦！' : '📸 抓到了！你笑场啦！',
          CANDY.sun,
          28,
        );
        return;
      }
    } else {
      this.failHold = Math.max(0, this.failHold - dt * 3);
    }

    // Update distractions
    this.spawnDistractions(dt, w, h);

    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      f.life -= dt;
      f.phase += dt * 14;
      const target = f.targetEye === 'left' ? face.leftEyePos : face.rightEyePos;
      const dx = target.x - f.x;
      const dy = target.y - f.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      // Swoop playfully toward the player's eyes then orbit
      const pull = dist > 48 ? 280 : -140;
      f.vx += ((dx / dist) * pull + Math.cos(f.phase) * 240) * dt;
      f.vy += ((dy / dist) * pull + Math.sin(f.phase * 1.3) * 240) * dt;
      f.vx *= Math.exp(-dt * 1.8);
      f.vy *= Math.exp(-dt * 1.8);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.life <= 0) this.flies.splice(i, 1);
    }

    for (let i = this.taunts.length - 1; i >= 0; i--) {
      const t = this.taunts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      if (t.life <= 0) this.taunts.splice(i, 1);
    }

    for (let i = this.popEmojis.length - 1; i >= 0; i--) {
      const e = this.popEmojis[i];
      e.life -= dt;
      if (e.life <= 0) this.popEmojis.splice(i, 1);
    }
  }

  private drawModeTabs(ctx: CanvasRenderingContext2D, w: number) {
    const tabW = 122;
    const tabH = 38;
    const gap = 10;
    const y = 76;
    const leftX = w * 0.5 - tabW - gap / 2;
    const rightX = w * 0.5 + gap / 2;

    this.tabBlinkRect = { x: leftX, y, w: tabW, h: tabH };
    this.tabLaughRect = { x: rightX, y, w: tabW, h: tabH };

    const drawTab = (rect: { x: number; y: number; w: number; h: number }, label: string, active: boolean) => {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y + 3, rect.w, rect.h, rect.h / 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2);
      ctx.fillStyle = active ? CANDY.sun : 'rgba(255,255,255,0.82)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.font = font(900, 14);
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
      ctx.restore();
    };

    drawTab(this.tabBlinkRect, '👁️ 别眨眼', this.mode === 'blink');
    drawTab(this.tabLaughRect, '😐 憋笑挑战', this.mode === 'laugh');
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const { face } = frame;
    const shake = this.fx.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    const intensity = this.getIntensity(face);
    const thresh = this.mode === 'blink' ? BLINK_THRESH : SMILE_THRESH;
    const dangerRatio = Math.min(1, intensity / thresh);
    drawFaceSweat(ctx, face, this.phase === 'surviving' ? dangerRatio : 0);

    // Top 2-in-1 mode switcher
    this.drawModeTabs(ctx, w);

    // Ready calibration countdown
    if (this.phase === 'ready') {
      const title = !face.present
        ? '🙂 请把脸对准镜头中央'
        : this.mode === 'blink'
          ? '睁大眼睛，准备开始！'
          : '收起笑容，绷住别笑！';
      stickerPill(ctx, w * 0.5, h * 0.34, title, CANDY.cream, INK, 18);

      if (face.present) {
        const count = Math.max(1, Math.ceil(this.readyTimer));
        ctx.save();
        ctx.font = font(900, 86);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 10;
        ctx.strokeStyle = INK;
        ctx.strokeText(`${count}`, w * 0.5, h * 0.5);
        ctx.fillStyle = CANDY.sun;
        ctx.fillText(`${count}`, w * 0.5, h * 0.5);
        ctx.restore();
      }
    }

    // Surviving distractions
    if (this.phase === 'surviving') {
      // Pop emojis
      for (const e of this.popEmojis) {
        const p = 1 - e.life / e.maxLife;
        const scale = p < 0.2 ? p / 0.2 : p > 0.75 ? (1 - p) / 0.25 : 1 + Math.sin(p * 18) * 0.08;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.scale(scale, scale);
        ctx.font = `${Math.round(e.size)}px ${EMOJI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.emoji, 0, 0);
        ctx.restore();
      }

      // Buzzing flies
      for (const f of this.flies) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(Math.sin(f.phase) * 0.35);
        ctx.font = `36px ${EMOJI_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.emoji, 0, 0);
        ctx.restore();
      }

      // Cheeky taunt bubbles
      for (const t of this.taunts) {
        const alpha = Math.min(1, t.life / 0.5);
        ctx.save();
        ctx.globalAlpha = alpha;
        // Clamp X so long cold-joke pills stay inside mobile screen
        ctx.font = font(900, 15);
        const tw = ctx.measureText(t.text).width + 36;
        const cx = Math.max(tw / 2 + 10, Math.min(w - tw / 2 - 10, t.x));
        stickerPill(ctx, cx, t.y, t.text, t.bg, INK, 15);
        ctx.restore();
      }

      if (this.noFaceTimer > 0.5) {
        stickerPill(ctx, w * 0.5, h * 0.45, '🤨 别躲到镜头外哦！', CANDY.coral, '#ffffff', 17);
      }
    }

    // Live danger meter bar near bottom
    const barW = Math.min(w - 48, 300);
    const barH = 22;
    const barX = (w - barW) / 2;
    const barY = h - 98;
    const meterLabel =
      this.mode === 'blink'
        ? `眨眼危险度 ${Math.round(dangerRatio * 100)}%`
        : `嘴角失守度 ${Math.round(dangerRatio * 100)}%`;

    ctx.save();
    ctx.font = font(900, 14);
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeText(meterLabel, w * 0.5, barY - 12);
    ctx.fillStyle = dangerRatio > 0.72 ? CANDY.coral : '#ffffff';
    ctx.fillText(meterLabel, w * 0.5, barY - 12);

    ctx.beginPath();
    ctx.roundRect(barX, barY + 3, barW, barH, barH / 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.fill();

    if (dangerRatio > 0.01) {
      ctx.beginPath();
      ctx.roundRect(barX + 2, barY + 2, Math.max(12, (barW - 4) * dangerRatio), barH - 4, barH / 2);
      ctx.fillStyle =
        dangerRatio > 0.75 ? CANDY.coral : dangerRatio > 0.45 ? CANDY.sun : CANDY.mint;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();

    // Bottom hint
    const tip =
      this.mode === 'blink'
        ? '📸 眨眼瞬间将自动抓拍破功照！'
        : '📸 忍不住笑出来就会被当场抓拍！';
    stickerPill(ctx, w * 0.5, h - 44, tip, CANDY.white, INK, 14);

    // Camera shutter white flash
    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    this.fx.draw(ctx);
    ctx.restore();
  }

  getHud() {
    return {
      score: Math.round(this.elapsed * 10),
      scoreText: `${this.elapsed.toFixed(1)} 秒`,
      timeLeft: Math.floor(this.elapsed),
      timerText: this.mode === 'blink' ? '👁️ 存活中' : '😐 憋笑中',
      urgent: false,
      combo: this.wavesDodged,
    };
  }
}
