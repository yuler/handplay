import { sfx } from './audio/sfx';
import { DEBUG } from './debug';
import type { GameController, SensorMode } from './games/types';
import { EMPTY_FACE, type FaceEngine } from './vision/faceEngine';
import { EMPTY_HAND, type HandEngine } from './vision/handEngine';

/** running: updating; hidden: tab away; countdown: resume 3-2-1; missing: required hand/face absent */
type RunState = 'running' | 'hidden' | 'countdown' | 'missing';

const PROMPT_GRACE_SEC = 0.8;
const MISSING_SEC = 1.0;
const COUNT_STEP_MS = 700;

const PROMPT_TEXT: Record<SensorMode, string> = {
  hand1: '把小手放到镜头前 ✋',
  hand2: '把小手放到镜头前 ✋',
  face: '把脸对准镜头 😊',
};

export interface RuntimeDeps {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  hand: HandEngine;
  face: FaceEngine;
  hudScore: HTMLElement;
  hudTimer: HTMLElement;
  fpsTag: HTMLElement;
  prompt: HTMLElement;
  countdown: HTMLElement;
  countdownNum: HTMLElement;
}

/** Drives the active game each frame; owns central pause, resume countdown and missing-sensor prompt. */
export class GameRuntime {
  game: GameController | null = null;
  vw = window.innerWidth;
  vh = window.innerHeight;
  dpr = 1;

  private ctx: CanvasRenderingContext2D;
  private run: RunState = 'running';
  private elapsed = 0;
  private missingFor = 0;
  private lastTs = 0;
  private lastHudTime = -1;
  private lastHudScore = 0;
  private countTimers: number[] = [];

  constructor(private d: RuntimeDeps) {
    this.ctx = d.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    d.fpsTag.style.display = 'none';
  }

  get running(): boolean {
    return Boolean(this.game) && this.run === 'running';
  }

  get paused(): boolean {
    return Boolean(this.game) && this.run === 'hidden';
  }

  private resize() {
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    // 1.5x keeps cartoon strokes crisp on phones while filling far fewer pixels than 2-3x
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.d.canvas.width = Math.round(this.vw * this.dpr);
    this.d.canvas.height = Math.round(this.vh * this.dpr);
  }

  start(game: GameController) {
    this.cancelCountdown();
    this.game = game;
    this.run = 'running';
    this.elapsed = 0;
    this.missingFor = 0;
    this.lastHudTime = -1;
    this.lastHudScore = 0;
    this.setPrompt(null);
    this.d.fpsTag.style.display = DEBUG ? 'block' : 'none';
  }

  stop() {
    this.cancelCountdown();
    this.game = null;
    this.run = 'running';
    this.setPrompt(null);
    this.d.fpsTag.style.display = 'none';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.d.canvas.width, this.d.canvas.height);
  }

  pause() {
    if (!this.game) return;
    this.cancelCountdown();
    this.run = 'hidden';
    this.setPrompt(null);
  }

  /** Resume immediately without countdown (used when closing the in-game help card). */
  resumeImmediate() {
    if (!this.game || this.run !== 'hidden') return;
    this.cancelCountdown();
    this.run = 'running';
    this.lastTs = 0;
    this.missingFor = 0;
  }

  /** Cartoon 3-2-1 before handing control back; game time does not advance meanwhile. */
  resumeWithCountdown() {
    if (!this.game) return;
    this.cancelCountdown();
    this.run = 'countdown';
    this.d.countdown.classList.remove('hidden');
    sfx.whoosh();
    const steps = ['3', '2', '1', '开始！'];
    steps.forEach((label, i) => {
      this.countTimers.push(
        window.setTimeout(() => {
          const num = this.d.countdownNum;
          num.textContent = label;
          num.classList.toggle('go', i === steps.length - 1);
          num.classList.remove('pop');
          void num.offsetWidth;
          num.classList.add('pop');
          if (i === steps.length - 1) sfx.resumeGo();
          else sfx.resumeTick();
        }, i * COUNT_STEP_MS),
      );
    });
    this.countTimers.push(
      window.setTimeout(() => {
        this.cancelCountdown();
        this.run = 'running';
        this.elapsed = 0;
        this.missingFor = 0;
      }, steps.length * COUNT_STEP_MS - 200),
    );
  }

  private cancelCountdown() {
    this.countTimers.forEach((t) => window.clearTimeout(t));
    this.countTimers = [];
    this.d.countdown.classList.add('hidden');
  }

  private setPrompt(sensor: SensorMode | null) {
    this.d.prompt.classList.toggle('hidden', !sensor);
    if (sensor) this.d.prompt.textContent = PROMPT_TEXT[sensor];
  }

  tick(ts: number) {
    const dt = this.lastTs ? Math.min(0.05, Math.max(0.001, (ts - this.lastTs) / 1000)) : 1 / 60;
    this.lastTs = ts;
    const game = this.game;
    if (!game || this.run === 'hidden') return;

    const { vw, vh } = this;
    const isFace = game.sensor === 'face';
    const hand = isFace ? EMPTY_HAND : this.d.hand.update(vw, vh);
    const hands = isFace ? [] : this.d.hand.hands;
    const face = isFace ? this.d.face.update(vw, vh) : EMPTY_FACE;
    const frame = { hand, hands, face, video: this.d.video };

    if (this.run === 'running' || this.run === 'missing') {
      const present = isFace ? face.present : game.sensor === 'hand2' ? hands.length > 0 : hand.present;
      this.elapsed += dt;
      this.missingFor = present ? 0 : this.missingFor + dt;
      if (this.run === 'running' && this.elapsed > PROMPT_GRACE_SEC && this.missingFor > MISSING_SEC) {
        this.run = 'missing';
        this.setPrompt(game.sensor);
        sfx.whoosh();
      } else if (this.run === 'missing' && present) {
        this.run = 'running';
        this.setPrompt(null);
      }
    }

    if (this.run === 'running') game.update(dt, vw, vh, frame);
    // onFinish may have torn the game down during update
    if (this.game !== game) return;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    game.draw(ctx, vw, vh, frame);
    this.renderHud(game);

    if (DEBUG) {
      const stats = isFace ? this.d.face.stats : this.d.hand.stats;
      const modeTag = isFace ? 'FACE' : game.sensor === 'hand2' ? '2H' : '1H';
      this.d.fpsTag.textContent = `${modeTag} · ${stats.delegate} · ${stats.fps} fps · ${this.run}`;
    }
  }

  private renderHud(game: GameController) {
    const { hudScore, hudTimer } = this.d;
    const hud = game.getHud();
    if (hud.score !== this.lastHudScore) {
      if (hud.score > this.lastHudScore) {
        hudScore.classList.remove('bump');
        void hudScore.offsetWidth;
        hudScore.classList.add('bump');
      }
      this.lastHudScore = hud.score;
    }
    hudScore.textContent = hud.scoreText ?? `⭐ ${hud.score}`;

    if (hud.timerText) {
      hudTimer.textContent = hud.timerText;
      hudTimer.classList.toggle('urgent', Boolean(hud.urgent));
    } else if (hud.timeLeft !== this.lastHudTime) {
      if (this.lastHudTime !== -1 && hud.timeLeft > 0 && hud.timeLeft <= 5) sfx.tick(hud.timeLeft);
      this.lastHudTime = hud.timeLeft;
      hudTimer.textContent = `⏱ ${hud.timeLeft}`;
      hudTimer.classList.toggle('urgent', hud.urgent ?? hud.timeLeft <= 5);
    }
  }
}
