import { sfx } from '../audio/sfx';
import { EMPTY_POSE, drawPoseStick, type PoseState } from '../vision/poseEngine';
import { endCard, Round } from './kit';
import { FxSystem } from './particles';
import { BENT_ANGLE, PushCounter, samplePose, STRAIGHT_ANGLE } from './pushupRep';
import { CANDY, font, INK, stickerPill } from './theme';
import type { GameController, GameOverSummary, SensorFrame } from './types';

const ARM_SEC = 0.4;

export function guideBox(w: number, h: number) {
  return { x: w * 0.08, y: h * 0.2, w: w * 0.84, h: h * 0.68 };
}

function inBox(pose: PoseState, w: number, h: number): boolean {
  const box = guideBox(w, h);
  const inside = (j: { x: number; y: number; vis: number }) =>
    j.vis >= 0.45 && j.x >= box.x && j.x <= box.x + box.w && j.y >= box.y && j.y <= box.y + box.h;
  const left = inside(pose.leftShoulder) && inside(pose.leftWrist);
  const right = inside(pose.rightShoulder) && inside(pose.rightWrist);
  return left || right;
}

export class PushupGame implements GameController {
  readonly id = 'push-up';
  readonly name = '俯卧撑计数';
  readonly sensor = 'pose' as const;

  private fx = new FxSystem();
  private round = new Round();
  private counter = new PushCounter();
  private armFor = 0;
  private live = false;
  private note = '';
  private noteFor = 0;

  constructor(private onFinish: (summary: GameOverSummary) => void) {}

  reset() {
    this.fx.clear();
    this.round.reset();
    this.counter.reset();
    this.armFor = 0;
    this.live = false;
    this.note = '';
    this.noteFor = 0;
  }

  update(dt: number, w: number, h: number, frame: SensorFrame) {
    this.fx.update(dt);
    this.noteFor = Math.max(0, this.noteFor - dt);
    if (!this.round.tick(dt, () => this.finish())) return;

    const pose = frame.pose ?? EMPTY_POSE;
    if (!pose.present) {
      this.armFor = 0;
      return;
    }
    const sample = samplePose(pose);
    if (!this.live) {
      const ready = inBox(pose, w, h) && sample.elbow != null && sample.elbow >= STRAIGHT_ANGLE;
      this.armFor = ready ? this.armFor + dt : 0;
      if (this.armFor >= ARM_SEC) this.live = true;
      return;
    }
    if (sample.elbow == null) return;
    const verdict = this.counter.update(sample, dt);
    if (verdict === 'rep') {
      sfx.hit(this.counter.reps);
      this.fx.burst(w / 2, h * 0.42, CANDY.mint, 16, 220);
      this.fx.popText(w / 2, h * 0.36, `+1`, CANDY.mint, 36);
      this.flash('算一次');
    } else if (verdict === 'partial') {
      sfx.whiff();
      this.fx.popText(w / 2, h * 0.36, '半程', CANDY.coral, 28);
      this.flash('半程不算');
    }
  }

  private flash(text: string) {
    this.note = text;
    this.noteFor = 0.85;
  }

  private finish() {
    this.onFinish(
      endCard(this.id, this.name, this.counter.reps, [
        { label: '有效', value: `${this.counter.reps} 个` },
        { label: '半程', value: `${this.counter.partials} 个` },
        { label: '够深', value: `${this.counter.deeps} 个` },
      ]),
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: SensorFrame) {
    const pose = frame.pose ?? EMPTY_POSE;
    const box = guideBox(w, h);
    const sample = samplePose(pose);
    const inside = pose.present && inBox(pose, w, h);

    ctx.save();
    ctx.strokeStyle = this.live ? CANDY.mint : inside ? CANDY.sun : '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 10]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.restore();

    drawPoseStick(ctx, pose);

    ctx.font = font(900, 72);
    ctx.fillStyle = CANDY.white;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(String(this.counter.reps), w / 2, 118);
    ctx.fillText(String(this.counter.reps), w / 2, 118);

    this.drawMeter(ctx, w, h, sample.elbow);
    if (pose.present) {
      const cueY = box.y + box.h - 36;
      stickerPill(ctx, w / 2, cueY, this.cue(pose, inside, sample.elbow), CANDY.sun, INK, 16);
    }
    this.fx.draw(ctx);
  }

  private cue(pose: PoseState, inside: boolean, elbow: number | null): string {
    if (this.noteFor > 0) return this.note;
    if (!pose.present) return '让肩膀和双手进画面';
    if (!inside) return '上半身和双手挪进框里';
    if (!this.live) {
      if (elbow == null) return '让双手和手肘入画';
      return elbow < STRAIGHT_ANGLE ? '手臂先伸直，停一下' : '停稳，马上开始';
    }
    if (this.counter.phase === 'down') return '撑起来';
    if (elbow != null && elbow < STRAIGHT_ANGLE) return elbow <= BENT_ANGLE ? '手撑住，再撑起来' : '再低一点';
    return '下去，再撑起来';
  }

  private drawMeter(ctx: CanvasRenderingContext2D, w: number, h: number, elbow: number | null) {
    const x = w - 28;
    const top = h * 0.28;
    const bh = h * 0.42;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillRect(x - 6, top, 12, bh);
    const bend = elbow == null ? 0 : Math.max(0, Math.min(1, (170 - elbow) / 80));
    ctx.fillStyle = bend > (170 - BENT_ANGLE) / 80 ? CANDY.mint : CANDY.sun;
    ctx.fillRect(x - 6, top + bh * (1 - bend), 12, bh * bend);
    const mark = top + bh * (1 - (170 - BENT_ANGLE) / 80);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 10, mark, 20, 3);
  }

  getHud() {
    const hud = this.round.hud(this.counter.reps, 0);
    return { ...hud, scoreText: `💪 ${this.counter.reps}` };
  }
}
