import { sfx } from '../audio/sfx';
import { drawFaceOverlay } from '../vision/faceEngine';
import { bottomHint, emojiAt, endCard, Round } from './kit';
import { FxSystem } from './particles';
import { CANDY, INK } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

export const HOLE_Y = 0.62;

export class MoleNodGame implements GameController {
  readonly id = 'mole-nod';
  readonly name = '转头打地鼠';
  readonly sensor = 'face' as const;

  private fx = new FxSystem();
  private round = new Round();
  private score = 0;
  private combo = 0;
  private best = 0;
  private hits = 0;
  private moles = [false, true, false];
  private armed = true;
  private popIn = 0.8;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.score = 0;
    this.combo = 0;
    this.best = 0;
    this.hits = 0;
    this.moles = [false, true, false];
    this.armed = true;
    this.popIn = 0.8;
  }

  private lane(yaw: number): number {
    if (yaw < -0.28) return 0;
    if (yaw > 0.28) return 2;
    return 1;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    if (!this.round.tick(dt, () => this.finish())) return;
    this.popIn -= dt;
    if (this.popIn <= 0 && this.moles.every((up) => !up)) {
      this.moles[Math.floor(Math.random() * 3)] = true;
      this.popIn = 0.7;
    }
    const face = frame.face;
    if (!face.present) return;
    if (face.pitch < 0.2) this.armed = true;
    if (!(this.armed && face.pitch > 0.42)) return;
    this.armed = false;
    const lane = this.lane(face.yaw);
    const x = w * (0.2 + lane * 0.3);
    const y = h * HOLE_Y;
    if (!this.moles[lane]) {
      this.combo = 0;
      sfx.whiff();
      this.fx.popText(x, y - 40, '空了', CANDY.coral, 22);
      return;
    }
    this.moles[lane] = false;
    this.hits++;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    const pts = 15 + this.combo * 2;
    this.score += pts;
    sfx.hit(this.combo);
    this.fx.burst(x, y, CANDY.sun, 14, 240);
    this.fx.popText(x, y - 48, `+${pts}`, CANDY.sun, 26);
    this.popIn = 0.45;
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.score, [
        { label: '打中', value: `${this.hits} 只` },
        { label: '最高连击', value: `×${this.best}` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const face = frame.face;
    drawFaceOverlay(ctx, face, face.pitch > 0.42 ? CANDY.coral : CANDY.sky, 0.55);

    const y = h * HOLE_Y;
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + i * 0.3);
      ctx.beginPath();
      ctx.ellipse(x, y + 20, 44, 18, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#6b4a2e';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      if (this.moles[i]) {
        ctx.beginPath();
        ctx.arc(x, y - 14, 30, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 246, 229, 0.9)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke();
        emojiAt(ctx, '🐹', x, y - 14, 42);
      }
    }
    const laneNames = ['左列', '中列', '右列'];
    if (face.present) {
      const lane = this.lane(face.yaw);
      const x = w * (0.2 + lane * 0.3);
      ctx.beginPath();
      ctx.arc(x, y + 8, 52, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = face.pitch > 0.42 ? CANDY.coral : CANDY.sun;
      ctx.lineWidth = 4.5;
      ctx.stroke();
      bottomHint(
        ctx,
        w,
        h,
        `🎯 已瞄准${laneNames[lane]} · 左右转头换列，点头 ⬇ 敲打地鼠！`,
        face.pitch > 0.42 ? CANDY.coral : CANDY.white,
      );
    } else {
      bottomHint(ctx, w, h, '🙂 把脸对准镜头，左右转头选地鼠再点头敲！', CANDY.sun);
    }
    this.fx.draw(ctx);
  }

  getHud() {
    return this.round.hud(this.score, this.combo);
  }
}
