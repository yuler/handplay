import { sfx } from '../audio/sfx';
import { drawHandCursor, drawHandLines } from './cursor';
import { bottomHint, cameraVeil, dist, emojiAt, endCard, Round } from './kit';
import { FxSystem } from './particles';
import { CANDY } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

interface Pet {
  x: number;
  y: number;
  emoji: string;
  charge: number;
  saved: boolean;
}

export const PET_Y = 0.42;

export class PalmTorchGame implements GameController {
  readonly id = 'palm-torch';
  readonly name = '掌心手电';
  readonly sensor = 'hand1' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private saved = 0;
  private pets: Pet[] = [];
  private opened = false;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.saved = 0;
    this.pets = [];
    this.opened = false;
  }

  private layout(w: number, h: number) {
    const emojis = ['🐰', '🐥', '🐸', '🐱'];
    this.pets = [
      { x: w / 2, y: h * PET_Y, emoji: '🐰', charge: 0, saved: false },
      { x: w * 0.22, y: h * 0.58, emoji: '🐥', charge: 0, saved: false },
      { x: w * 0.78, y: h * 0.3, emoji: '🐸', charge: 0, saved: false },
    ];
    for (const pet of this.pets) pet.emoji = emojis[this.pets.indexOf(pet) % emojis.length];
    this.opened = true;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    if (!this.opened) this.layout(w, h);
    const hand = frame.hand;
    const lighting = hand.present && hand.gesture === 'open';
    for (const pet of this.pets) {
      if (pet.saved) continue;
      const near = lighting && dist(hand.palmCenter.x, hand.palmCenter.y, pet.x, pet.y) < 100;
      pet.charge = near ? pet.charge + dt : Math.max(0, pet.charge - dt);
      if (pet.charge < 0.22) continue;
      pet.saved = true;
      this.saved++;
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      const pts = 25;
      this.score += pts;
      sfx.meow(true);
      this.fx.burst(pet.x, pet.y, CANDY.sun, 16, 240);
      this.fx.popText(pet.x, pet.y - 28, `+${pts}`, CANDY.sun, 26);
    }
    if (this.pets.length > 0 && this.pets.every((p) => p.saved)) {
      this.layout(w, h);
    }
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '照出来', value: `${this.saved} 只` },
        { label: '最高连击', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    cameraVeil(ctx, w, h, 'rgba(14, 18, 38, 0.54)');
    const hand = frame.hand;
    const lighting = hand.present && hand.gesture === 'open';
    if (lighting) {
      const g = ctx.createRadialGradient(hand.palmCenter.x, hand.palmCenter.y, 16, hand.palmCenter.x, hand.palmCenter.y, 155);
      g.addColorStop(0, 'rgba(255, 240, 175, 0.52)');
      g.addColorStop(1, 'rgba(255, 240, 175, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hand.palmCenter.x, hand.palmCenter.y, 155, 0, Math.PI * 2);
      ctx.fill();
    }
    drawHandLines(ctx, hand, lighting ? CANDY.sun : CANDY.grape, 0.72);
    for (const pet of this.pets) {
      const near = lighting && dist(hand.palmCenter.x, hand.palmCenter.y, pet.x, pet.y) < 110;
      ctx.globalAlpha = pet.saved ? 1 : near ? 0.45 + Math.min(0.55, pet.charge / 0.22) : 0.24;
      emojiAt(ctx, pet.saved ? '🌟' : pet.emoji, pet.x, pet.y, 48);
      ctx.globalAlpha = 1;
    }
    if (hand.present) {
      drawHandCursor(ctx, hand.palmCenter, lighting ? CANDY.sun : CANDY.grape, { radius: lighting ? 18 : 13 });
    }
    bottomHint(
      ctx,
      w,
      h,
      !hand.present
        ? '👋 张开五指 🖐️，用掌心手电照出藏起来的小动物！'
        : lighting
          ? '🔦 手电已开启！照住暗处小动物停一下就找到啦'
          : '🖐️ 请张开五指才能打开掌心手电筒哦！',
      lighting ? CANDY.sun : CANDY.white,
    );
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
