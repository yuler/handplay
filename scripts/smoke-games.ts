import { GAMES } from '../src/games/catalog';
import { BALL_Y } from '../src/games/palmPong';
import { FISH_Y } from '../src/games/airFishing';
import { BASKET_X, BASKET_Y, JELLY_Y } from '../src/games/jellyPinch';
import { LANTERN_Y } from '../src/games/fingerFirework';
import { DRUM_Y } from '../src/games/fingerDrum';
import { PET_Y } from '../src/games/palmTorch';
import { COIN_Y, JAR_Y } from '../src/games/coinMagnet';
import { SERVE_Y } from '../src/games/fruitSlash';
import { EMPTY_FACE, type FaceState } from '../src/vision/faceEngine';
import { EMPTY_HAND, type HandState } from '../src/vision/handEngine';
import type { SensorFrame } from '../src/games/types';

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

function frame(hand: HandState, face: FaceState): SensorFrame {
  return { hand, hands: hand.present ? [hand] : [], face, video: {} as HTMLVideoElement };
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

const sparkY = [0.62, 0.54, 0.46, 0.38, LANTERN_Y + 0.02, LANTERN_Y + 0.02];
scripts.push(
  play(
    'finger-firework',
    sparkY.map((y) => ({ hand: handAt(W / 2, H * y) })),
  ),
);

scripts.push(
  play('finger-drum', [
    { hand: handAt(W / 2, H * DRUM_Y - 80) },
    { hand: handAt(W / 2, H * DRUM_Y + 6) },
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

await Promise.all([...scripts, crash]);
console.log('smoke passed');
