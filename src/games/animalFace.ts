import { sfx } from '../audio/sfx';
import {
  ANIMAL_PROMPTS,
  type AnimalId,
  type AnimalPrompt,
  captureAnimalSnapshot,
  drawAnimalSticker,
} from './animalFaceArt';
import { FxSystem } from './particles';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

const ROUND_SECONDS = 45;
const HOLD_TARGET_SEC = 0.26;
const CELEBRATE_SEC = 1.15;
const PATIENCE_SKIP_SEC = 8.0;

export class AnimalFaceGame implements GameController {
  readonly id = 'animal-face';
  readonly name = '萌宠变脸秀';
  readonly sensor = 'face' as const;

  private fx = new FxSystem();
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private matchedCount = 0;
  private unlocked = new Set<AnimalId>();
  private timeLeft = ROUND_SECONDS;
  private finished = false;
  private clock = 0;

  private current: AnimalPrompt = ANIMAL_PROMPTS[0];
  private holdSec = 0;
  private promptAge = 0;
  private celebrateTimer = 0;
  private activeSticker: AnimalId | null = null;
  private flashAlpha = 0;
  private snapshotUrl = '';
  private snapshotTakenCount = 0;

  // Tappable "换一只" button hitbox
  private skipRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private onFinish: (summary: GameOverSummary) => void) {
    this.pickNextAnimal();
  }

  reset() {
    this.fx.clear();
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.matchedCount = 0;
    this.unlocked.clear();
    this.timeLeft = ROUND_SECONDS;
    this.finished = false;
    this.clock = 0;
    this.holdSec = 0;
    this.promptAge = 0;
    this.celebrateTimer = 0;
    this.activeSticker = null;
    this.flashAlpha = 0;
    this.snapshotUrl = '';
    this.snapshotTakenCount = 0;
    this.pickNextAnimal();
  }

  private pickNextAnimal() {
    const pool = ANIMAL_PROMPTS.filter((a) => a.id !== this.current.id);
    this.current = pool[Math.floor(Math.random() * pool.length)];
    this.holdSec = 0;
    this.promptAge = 0;
  }

  onTap(x: number, y: number) {
    if (this.finished || this.celebrateTimer > 0) return;
    const r = this.skipRect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      sfx.tap();
      this.pickNextAnimal();
    }
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    if (this.finished) return;
    this.clock += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);

    const { face } = frame;

    if (this.celebrateTimer > 0) {
      this.celebrateTimer = Math.max(0, this.celebrateTimer - dt);
      if (this.celebrateTimer <= 0) {
        this.activeSticker = null;
        this.pickNextAnimal();
      }
    } else if (face.present) {
      this.promptAge += dt;
      const strength = this.current.check(face);

      // Gentle forgiveness: blink is brief so give it an instant boost
      const fillRate = this.current.id === 'fox' ? 1.8 : 1.0;
      if (strength >= 0.72) {
        this.holdSec = Math.min(HOLD_TARGET_SEC, this.holdSec + dt * fillRate);
      } else {
        this.holdSec = Math.max(0, this.holdSec - dt * 0.7);
      }

      if (this.holdSec >= HOLD_TARGET_SEC) {
        this.matchedCount++;
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.unlocked.add(this.current.id);
        const bonus = this.combo >= 3 ? 10 : 0;
        const pts = 20 + bonus;
        this.score += pts;

        this.activeSticker = this.current.id;
        this.celebrateTimer = CELEBRATE_SEC;
        this.flashAlpha = 0.42;
        sfx.animalYay(this.combo);

        const cx = (face.leftEyePos.x + face.rightEyePos.x) * 0.5;
        const cy = (face.leftEyePos.y + face.rightEyePos.y) * 0.5;
        this.fx.burst(cx, cy - 10, this.current.accent, 26, 330);
        this.fx.burst(cx, cy - 10, CANDY.sun, 14, 250);
        this.fx.popText(
          cx,
          Math.max(150, cy - face.faceWidth * 0.65),
          `太可爱啦！+${pts}`,
          CANDY.sun,
          30,
        );

        // Capture a cute souvenir photo on the 1st match and refresh occasionally so we get a great pose!
        if (this.snapshotTakenCount === 0 || this.matchedCount % 3 === 0) {
          const url = captureAnimalSnapshot(frame.video, w, h, face, this.current);
          if (url) {
            this.snapshotUrl = url;
            this.snapshotTakenCount++;
          }
        }
      } else if (this.promptAge >= PATIENCE_SKIP_SEC) {
        // Gentle auto-switch if a young child gets stuck — no buzzer, no combo penalty!
        this.fx.popText(w * 0.5, 196, '换只小动物玩玩～', CANDY.sky, 22);
        this.pickNextAnimal();
      }
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
        snapshotUrl: this.snapshotUrl || undefined,
        snapshotFilename: `handplay-animal-${Date.now()}.jpg`,
        snapshotLabel: '📸 保存可爱变身照',
        stats: [
          { label: '变身次数', value: `${this.matchedCount} 次` },
          { label: '最高连击', value: `${this.bestCombo} 连` },
          { label: '解锁萌宠', value: `${this.unlocked.size} / ${ANIMAL_PROMPTS.length}` },
        ],
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const { face } = frame;

    // Draw live AR animal sticker on the child's face!
    // Show subtle preview while matching, and full bouncing sticker when matched!
    if (face.present) {
      if (this.activeSticker) {
        const t = 1 - this.celebrateTimer / CELEBRATE_SEC;
        const popScale = t < 0.2 ? 0.72 + (t / 0.2) * 0.4 : 1.05 + Math.sin(this.clock * 12) * 0.04;
        drawAnimalSticker(ctx, face, this.activeSticker, this.clock, popScale);
      } else {
        const strength = this.current.check(face);
        if (strength > 0.35) {
          ctx.save();
          ctx.globalAlpha = 0.25 + strength * 0.55;
          drawAnimalSticker(ctx, face, this.current.id, this.clock, 0.92 + strength * 0.1);
          ctx.restore();
        }
      }
    }

    // ---- Top Prompt Card ----
    const cardW = Math.min(340, w - 28);
    const cardH = 92;
    const cardX = (w - cardW) * 0.5;
    const cardY = 74;

    ctx.save();
    // Chunky drop shadow
    ctx.beginPath();
    ctx.roundRect(cardX, cardY + 5, cardW, cardH, 24);
    ctx.fillStyle = INK;
    ctx.fill();

    // Card surface
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 24);
    ctx.fillStyle = this.celebrateTimer > 0 ? '#fff3b0' : 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Animal icon circle + progress ring on the left
    const iconX = cardX + 48;
    const iconY = cardY + cardH * 0.5;
    const iconR = 30;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.fillStyle = `${this.current.accent}44`;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();

    const progress =
      this.celebrateTimer > 0
        ? 1
        : Math.max(this.holdSec / HOLD_TARGET_SEC, face.present ? this.current.check(face) * 0.65 : 0);
    if (progress > 0.04) {
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconR + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress));
      ctx.strokeStyle = this.celebrateTimer > 0 ? CANDY.mint : this.current.accent;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.font = `34px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.current.emoji, iconX, iconY + 2);

    // Prompt title & instruction text
    const textX = cardX + 92;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = font(900, 19);
    const title =
      this.celebrateTimer > 0 ? `🎉 ${this.current.badgeText}` : `变身 ${this.current.name}`;
    ctx.fillText(title, textX, cardY + 34);

    ctx.font = font(800, 15);
    ctx.fillStyle = '#5b4d7a';
    const sub = this.celebrateTimer > 0 ? '太棒啦！摆个姿势咔嚓一下 ✨' : this.current.action;
    ctx.fillText(sub, textX, cardY + 62);
    ctx.restore();

    // Tappable "换一只 🔀" button just below the card
    const skipW = 112;
    const skipH = 36;
    const skipX = w * 0.5 - skipW * 0.5;
    const skipY = cardY + cardH + 12;
    this.skipRect = { x: skipX, y: skipY, w: skipW, h: skipH };
    if (this.celebrateTimer <= 0) {
      stickerPill(ctx, w * 0.5, skipY + skipH * 0.5, '🔀 换一只', CANDY.cream, INK, 14);
    }

    // Unlocked animals collection bar near bottom
    const barY = h - 78;
    const gap = 42;
    const startX = w * 0.5 - ((ANIMAL_PROMPTS.length - 1) * gap) * 0.5;
    ctx.save();
    ANIMAL_PROMPTS.forEach((a, idx) => {
      const bx = startX + idx * gap;
      const done = this.unlocked.has(a.id);
      ctx.beginPath();
      ctx.arc(bx, barY, 17, 0, Math.PI * 2);
      ctx.fillStyle = done ? CANDY.sun : 'rgba(255, 255, 255, 0.72)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();

      ctx.globalAlpha = done ? 1 : 0.38;
      ctx.font = `20px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(a.emoji, bx, barY + 1);
      ctx.globalAlpha = 1;
    });
    ctx.restore();

    // Bottom status hint
    const bottomHint = !face.present
      ? '😊 把小脸凑近镜头，准备变身小动物！'
      : this.combo >= 3
        ? `🌟 连续变身 ${this.combo} 次！超级表演家！`
        : '📸 跟着卡片做鬼脸，还能留念拍照哦～';
    stickerPill(ctx, w * 0.5, h - 30, bottomHint, CANDY.cream, INK, 14);

    // Camera shutter celebration flash
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }

    this.fx.draw(ctx);
  }

  getHud() {
    return {
      score: this.score,
      timeLeft: Math.ceil(this.timeLeft),
      combo: this.combo,
    };
  }
}
