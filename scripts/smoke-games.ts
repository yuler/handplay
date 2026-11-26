import { GAMES } from '../src/games/catalog';
import { BALL_Y } from '../src/games/palmPong';
import { FISH_Y } from '../src/games/airFishing';
import { BASKET_X, BASKET_Y, JELLY_Y } from '../src/games/jellyPinch';
import { LANTERN_Y, IGNITE_DWELL } from '../src/games/fingerFirework';
import { DRUM_Y } from '../src/games/fingerDrum';
import { PET_Y } from '../src/games/palmTorch';
import { COIN_Y, JAR_Y } from '../src/games/coinMagnet';
import { SERVE_Y } from '../src/games/fruitSlash';
import { EMPTY_FACE, type FaceState } from '../src/vision/faceEngine';
import { EMPTY_HAND, type HandState } from '../src/vision/handEngine';
import { EMPTY_POSE, type PoseState } from '../src/vision/poseEngine';
import type { GameController, SensorFrame } from '../src/games/types';

const W = 400;
const H = 700;

function mockCtx(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'measureText') return () => ({ width: 28 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[String(prop)] = value;
      return true;
    },
  }) as CanvasRenderingContext2D;
}

function handAt(x: number, y: number, extra: Partial<HandState> = {}): HandState {
  const p = { x, y };
  return {
    ...EMPTY_HAND,
    present: true,
    track: 1,
    palmPx: 90,
    gesture: 'open',
    fingers: 5,
    pinchRatio: 0.34,
    pinching: false,
    indexTip: p,
    palmCenter: p,
    pinchPos: p,
    ...extra,
    indexTip: extra.indexTip ?? p,
    palmCenter: extra.palmCenter ?? p,
    pinchPos: extra.pinchPos ?? p,
  };
}

function faceAt(extra: Partial<FaceState> = {}): FaceState {
  return {
    ...EMPTY_FACE,
    present: true,
    faceWidth: 180,
    nosePos: { x: W / 2, y: H * 0.4 },
    mouthPos: { x: W / 2, y: H * 0.48 },
    ...extra,
  };
}

function frame(hand: HandState, face: FaceState, pose: PoseState = EMPTY_POSE): SensorFrame {
  return { hand, hands: hand.present ? [hand] : [], face, pose, video: {} as HTMLVideoElement };
}

const ctx = mockCtx();

function play(
  id: (typeof GAMES)[number]['id'],
  steps: Array<{ dt?: number; hand?: HandState; face?: FaceState }>,
) {
  const meta = GAMES.find((g) => g.id === id);
  if (!meta) throw new Error(`missing ${id}`);
  return meta.load().then((Ctor) => {
    let finished = false;
    const game = new Ctor(() => {
      finished = true;
    });
    game.reset();
    for (const step of steps) {
      const hand = step.hand ?? { ...EMPTY_HAND };
      const face = step.face ?? { ...EMPTY_FACE };
      game.update(step.dt ?? 0.05, W, H, frame(hand, face));
      game.draw(ctx, W, H, frame(hand, face));
      if (finished) throw new Error(`${id} ended during smoke`);
    }
    const score = game.getHud().score;
    if (score <= 0) throw new Error(`${id} scored ${score}`);
    console.log(`ok  ${meta.title}  ${score}`);
  });
}

const scripts: Array<Promise<void>> = [];

scripts.push(
  play('fruit-slash', [
    { hand: handAt(W / 2 - 90, H * SERVE_Y) },
    { hand: handAt(W / 2 + 90, H * SERVE_Y) },
  ]),
);

scripts.push(
  play('palm-pong', [{ dt: 0.05, hand: handAt(W / 2, H * BALL_Y) }]),
);

const fish: Array<{ dt?: number; hand?: HandState; face?: FaceState }> = [];
for (let i = 0; i < 24; i++) {
  fish.push({ dt: 0.05, hand: handAt(W / 2, H * FISH_Y, { pinching: true, pinchRatio: 0.2 }) });
}
scripts.push(play('air-fishing', fish));

const jelly: Array<{ dt?: number; hand?: HandState; face?: FaceState }> = [];
jelly.push({ hand: handAt(W / 2, H * JELLY_Y, { pinching: true, pinchRatio: 0.34 }) });
for (let i = 1; i <= 4; i++) {
  const x = W / 2 + ((W * BASKET_X[0] - W / 2) * i) / 4;
  const y = H * JELLY_Y + ((H * BASKET_Y - H * JELLY_Y) * i) / 4;
  jelly.push({ hand: handAt(x, y, { pinching: true, pinchRatio: 0.34 }) });
}
jelly.push({ hand: handAt(W * BASKET_X[0], H * BASKET_Y, { pinching: false, pinchRatio: 0.8 }) });
scripts.push(play('jelly-pinch', jelly));

const sparkY = [0.62, 0.54, 0.46, 0.38, LANTERN_Y + 0.02];
const sparkSteps = sparkY.map((y) => ({ hand: handAt(W / 2, H * y) }));
for (let i = 0; i < 5; i++) sparkSteps.push({ dt: 0.05, hand: handAt(W / 2, H * (LANTERN_Y + 0.02)) });
scripts.push(play('finger-firework', sparkSteps));

scripts.push(
  play('finger-drum', [
    { hand: handAt(W / 2, H * DRUM_Y - 80, { sample: 1 }) },
    { hand: handAt(W / 2, H * DRUM_Y + 6, { sample: 2 }) },
  ]),
);

scripts.push(play('wipe-glass', [{ hand: handAt(W / 16, H / 20) }]));

scripts.push(
  play('palm-torch', [{ dt: 0.3, hand: handAt(W / 2, H * PET_Y, { gesture: 'open' }) }]),
);

scripts.push(
  play('coin-magnet', [
    { dt: 0.05, hand: handAt(W / 2, H * COIN_Y, { gesture: 'open' }) },
    { dt: 0.05, hand: handAt(W / 2, H * JAR_Y, { gesture: 'fist' }) },
  ]),
);

scripts.push(play('mole-nod', [{ dt: 0.05, face: faceAt({ yaw: 0, pitch: 0.6 }) }]));

async function loadGame(id: (typeof GAMES)[number]['id']): Promise<GameController> {
  const meta = GAMES.find((g) => g.id === id);
  if (!meta) throw new Error(`missing ${id}`);
  const Ctor = await meta.load();
  return new Ctor(() => undefined);
}

/** Camera samples at `cameraHz` while the game loop runs at 60Hz. Returns the score. */
async function replay(
  id: (typeof GAMES)[number]['id'],
  cameraHz: number,
  duration: number,
  at: (t: number) => { x: number; y: number; track?: number },
): Promise<number> {
  const game = await loadGame(id);
  game.reset();
  const renderDt = 1 / 60;
  const cameraDt = 1 / cameraHz;
  let sample = at(0);
  let sampleId = 1;
  let nextSample = cameraDt;
  for (let t = 0; t < duration - 1e-8; t += renderDt) {
    if (t + 1e-6 >= nextSample) {
      sample = at(t);
      sampleId++;
      nextSample += cameraDt;
    }
    const posed = handAt(sample.x, sample.y, { track: sample.track ?? 1, sample: sampleId });
    game.update(renderDt, W, H, frame(posed, { ...EMPTY_FACE }));
  }
  return game.getHud().score;
}

const motion = (async () => {
  const strokeSec = 0.5;
  for (const cameraHz of [30, 60]) {
    const during = await replay('finger-firework', cameraHz, strokeSec, (t) => ({ x: 40 + 600 * t, y: 210 }));
    if (during !== 0) throw new Error(`firework ignited during a 600px/s stroke at ${cameraHz}fps camera (score ${during})`);
    const game = await loadGame('finger-firework');
    game.reset();
    const renderDt = 1 / 60;
    const cameraDt = 1 / cameraHz;
    let sample = { x: 40, y: 210 };
    let nextSample = 0;
    for (let t = 0; t < strokeSec - 1e-8; t += renderDt) {
      if (t + 1e-6 >= nextSample) {
        sample = { x: 40 + 600 * t, y: 210 };
        nextSample += cameraDt;
      }
      game.update(renderDt, W, H, frame(handAt(sample.x, sample.y), { ...EMPTY_FACE }));
    }
    const holdFrames = Math.ceil((IGNITE_DWELL + 0.06) / renderDt);
    for (let i = 0; i < holdFrames; i++) {
      game.update(renderDt, W, H, frame(handAt(sample.x, sample.y), { ...EMPTY_FACE }));
    }
    if (game.getHud().score <= 0) throw new Error(`firework did not ignite after a real stop at ${cameraHz}fps camera`);
  }
  console.log('ok  firework dwell vs reused samples');

  for (const cameraHz of [30, 60]) {
    const score = await replay('finger-drum', cameraHz, 0.24, (t) => ({ x: 200, y: 350 + 1000 * t }));
    if (score <= 0) throw new Error(`drum missed a 1000px/s tap at ${cameraHz}fps camera`);
  }
  console.log('ok  drum speed at 30fps and 60fps');

  for (const cameraHz of [30, 60]) {
    for (const holdSec of [0, 1]) {
      const game = await loadGame('finger-drum');
      game.reset();
      const renderDt = 1 / 60;
      const cameraDt = 1 / cameraHz;
      const strokeSec = 0.05;
      let sampleId = 1;
      let nextSample = cameraDt;
      let y = 450;
      for (let t = 0; t < holdSec + strokeSec + cameraDt - 1e-8; t += renderDt) {
        if (t + 1e-6 >= nextSample) {
          sampleId++;
          const traveled = t < holdSec ? 0 : Math.min(strokeSec, t - holdSec);
          y = 450 + 1000 * traveled;
          nextSample += cameraDt;
        }
        game.update(renderDt, W, H, frame(handAt(200, y, { track: 1, sample: sampleId }), { ...EMPTY_FACE }));
      }
      if (game.getHud().score <= 0) {
        throw new Error(`drum missed a 50px tap at ${cameraHz}fps after a ${holdSec}s hold`);
      }
    }
  }
  console.log('ok  drum tap after hold at 30fps and 60fps');

  const drumJump = await loadGame('finger-drum');
  drumJump.reset();
  drumJump.update(1 / 60, W, H, frame(handAt(200, 350, { track: 1 }), { ...EMPTY_FACE }));
  drumJump.update(1 / 60, W, H, frame(handAt(200, 510, { track: 2 }), { ...EMPTY_FACE }));
  if (drumJump.getHud().score !== 0) throw new Error(`drum scored a track change (score ${drumJump.getHud().score})`);

  const sparkJump = await loadGame('finger-firework');
  sparkJump.reset();
  sparkJump.update(1 / 60, W, H, frame(handAt(40, 210, { track: 1 }), { ...EMPTY_FACE }));
  sparkJump.update(1 / 60, W, H, frame(handAt(200, 210, { track: 2 }), { ...EMPTY_FACE }));
  for (let i = 0; i < Math.ceil((IGNITE_DWELL + 0.08) / (1 / 60)); i++) {
    sparkJump.update(1 / 60, W, H, frame(handAt(200, 210, { track: 2 }), { ...EMPTY_FACE }));
  }
  if (sparkJump.getHud().score !== 0) throw new Error(`firework scored a track change (score ${sparkJump.getHud().score})`);
  console.log('ok  track change clears drum and firework motion');
})();

function pushPose(angle: number, shoulderY: number, wristY = 520): PoseState {
  return {
    ...EMPTY_POSE,
    present: true,
    leftShoulder: { x: 200, y: shoulderY, vis: 1 },
    leftElbow: { x: 160, y: (shoulderY + wristY) / 2, vis: 1 },
    leftWrist: { x: 200, y: wristY, vis: 1 },
    leftElbowAngle: angle,
  };
}

const pushup = (async () => {
  const game = await loadGame('push-up');
  const feed = (pose: PoseState, n: number, dt = 0.05) => {
    for (let i = 0; i < n; i++) game.update(dt, W, H, frame(EMPTY_HAND, EMPTY_FACE, pose));
  };
  const straight = () => pushPose(168, 250);
  const bottom = () => pushPose(80, 430);
  feed(straight(), 12);
  feed(pushPose(130, 300), 6);
  feed(straight(), 4);
  if (game.getHud().score !== 0) throw new Error(`push-up counted a shallow rep (${game.getHud().score})`);

  game.reset();
  feed(straight(), 12);
  feed(pushPose(80, 250, 300), 8);
  feed(straight(), 4);
  if (game.getHud().score !== 0) throw new Error(`push-up counted a curl (${game.getHud().score})`);

  game.reset();
  feed(straight(), 12);
  feed(bottom(), 1);
  feed(straight(), 3);
  if (game.getHud().score !== 0) throw new Error(`push-up counted a one-frame dip (${game.getHud().score})`);

  game.reset();
  feed(straight(), 12);
  feed(bottom(), 8);
  feed(straight(), 4);
  feed(pushPose(80, 270), 8);
  feed(straight(), 4);
  if (game.getHud().score !== 2) throw new Error(`push-up expected 2 reps, got ${game.getHud().score}`);
  game.draw(ctx, W, H, frame(EMPTY_HAND, EMPTY_FACE, straight()));
  console.log('ok  push-up counts full reps only');
})();

const crash = (async () => {
  for (const meta of GAMES) {
    const Ctor = await meta.load();
    const game = new Ctor(() => undefined);
    game.reset();
    const idle = frame({ ...EMPTY_HAND }, { ...EMPTY_FACE });
    game.update(0.016, W, H, idle);
    game.draw(ctx, W, H, idle);
  }
  console.log(`ok  catalog ${GAMES.length} games draw`);
})();

await Promise.all([...scripts, crash, motion, pushup]);
console.log('smoke passed');
