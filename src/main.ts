import './style.css';
import { sfx } from './audio/sfx';
import type { GameController, GameId, GameOverSummary, SensorMode } from './games/types';
import { popConfetti } from './ui/confetti';
import { APP_HTML } from './ui/markup';
import { CameraManager } from './vision/camera';
import { EMPTY_FACE, FaceEngine } from './vision/faceEngine';
import { EMPTY_HAND, HandEngine, type InitProgress, type VisionLoadState } from './vision/handEngine';

const BEST_KEY = 'handplay:best:v1';

const DEFAULT_BEST: Record<GameId, number> = {
  'gesture-rush': 0,
  'air-slingshot': 0,
  'finger-rune': 0,
  'mouth-munch': 0,
  'no-blink': 0,
  'dual-hand': 0,
};

const GAME_SENSOR: Record<GameId, SensorMode> = {
  'gesture-rush': 'hand1',
  'air-slingshot': 'hand1',
  'finger-rune': 'hand1',
  'mouth-munch': 'face',
  'no-blink': 'face',
  'dual-hand': 'hand2',
};

function loadBest(): Record<GameId, number> {
  try {
    return {
      ...DEFAULT_BEST,
      ...(JSON.parse(localStorage.getItem(BEST_KEY) || '{}') as Partial<Record<GameId, number>>),
    };
  } catch {
    return { ...DEFAULT_BEST };
  }
}

function saveBest(id: GameId, score: number): boolean {
  const best = loadBest();
  if (score > (best[id] ?? 0)) {
    best[id] = score;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch {
      // ignore storage quota
    }
    return true;
  }
  return false;
}

type GameCtor = new (onFinish: (summary: GameOverSummary) => void) => GameController;

const GAME_MODULES: Record<GameId, () => Promise<GameCtor>> = {
  'gesture-rush': () => import('./games/gestureRush').then((m) => m.GestureRushGame),
  'air-slingshot': () => import('./games/airSlingshot').then((m) => m.AirSlingshotGame),
  'finger-rune': () => import('./games/fingerRune').then((m) => m.FingerRuneGame),
  'mouth-munch': () => import('./games/mouthMunch').then((m) => m.MouthMunchGame),
  'no-blink': () => import('./games/noBlink').then((m) => m.NoBlinkGame),
  'dual-hand': () => import('./games/dualHand').then((m) => m.DualHandGame),
};

const app = document.getElementById('app')!;
app.innerHTML = APP_HTML;

const $ = (id: string) => document.getElementById(id)!;
const videoEl = $('cam') as HTMLVideoElement;
const canvasEl = $('canvas') as HTMLCanvasElement;
const ctx = canvasEl.getContext('2d')!;

const hudEl = $('hud');
const hudScoreEl = $('hud-score');
const hudTimerEl = $('hud-timer');
const fpsTagEl = $('fps-tag');
const lobbyEl = $('lobby');
const prefetchChip = $('prefetch-chip');
const loaderEl = $('loader');
const loaderTitle = $('loader-title');
const loaderSteps = $('loader-steps');
const stepCam = $('step-cam');
const stepModelLabel = $('step-model-label');
const stepModel = $('step-model');
const loaderBar = $('loader-bar');
const loaderFill = $('loader-fill');
const loaderPct = $('loader-pct');
const loaderError = $('loader-error');
const loaderBack = $('loader-back');
const resultEl = $('result');
const resultCard = $('result-card');
const confettiEl = $('confetti');
const resHeadline = $('res-headline');
const resTitle = $('res-title');
const resScore = $('res-score');
const resRecord = $('res-record');
const resSnapshotWrap = $('res-snapshot-wrap');
const resSnapshot = $('res-snapshot') as HTMLImageElement;
const resDownload = $('res-download') as HTMLAnchorElement;
const resStats = $('res-stats');

const camera = new CameraManager();
const handEngine = new HandEngine();
const faceEngine = new FaceEngine();

let activeGame: GameController | null = null;
let screenState: 'lobby' | 'loading' | 'playing' | 'result' = 'lobby';
let lastFrameTime = 0;
let lastHudTime = -1;
let lastHudScore = 0;
let recordTimer = 0;
let vw = window.innerWidth;
let vh = window.innerHeight;
// 1.5x keeps cartoon strokes crisp on phones while filling far fewer pixels than 2-3x
let dpr = Math.min(1.5, window.devicePixelRatio || 1);

function resize() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvasEl.width = Math.round(vw * dpr);
  canvasEl.height = Math.round(vh * dpr);
}
resize();
window.addEventListener('resize', resize);

function refreshBestTags() {
  const best = loadBest();
  for (const id of Object.keys(DEFAULT_BEST) as GameId[]) {
    const el = document.getElementById(`best-${id}`);
    if (!el) continue;
    const score = best[id] ?? 0;
    if (score <= 0) {
      el.textContent = '✨ 来试试';
    } else if (id === 'no-blink') {
      el.textContent = `🏆 ${(score / 10).toFixed(1)} 秒`;
    } else {
      el.textContent = `🏆 最高 ${score}`;
    }
  }
}
refreshBestTags();

// ---- Background prefetch while the lobby is on screen (no camera request here) ----
let lastChipText = '';
handEngine.onLoadChange((s: VisionLoadState) => {
  const pct = Math.round(Math.min(1, s.loaded / Math.max(1, s.total)) * 100);
  const text =
    s.stage === 'ready'
      ? '✅ 准备好啦，点一张卡片开玩！'
      : s.stage === 'init'
        ? '🧠 马上就好…'
        : s.stage === 'error'
          ? '📶 网络有点慢，点卡片时会再试一次'
          : s.stage === 'download'
            ? `🧠 正在准备 AI 识别… ${pct}%`
            : '🧠 正在准备 AI 识别…';
  if (text === lastChipText) return;
  lastChipText = text;
  prefetchChip.textContent = text;
  prefetchChip.classList.toggle('ready', s.stage === 'ready');
});

requestAnimationFrame(() =>
  window.setTimeout(() => {
    handEngine
      .preload()
      .catch((err) => console.warn('[HandPlay] hand prefetch failed, will retry on start:', err));
  }, 0),
);

// ---- Loader ----
function renderLoader(modelName: string, { cameraReady, load }: InitProgress) {
  const dl = Math.min(1, load.loaded / Math.max(1, load.total));
  const model =
    load.stage === 'ready' ? 1 : load.stage === 'init' ? 0.9 : load.stage === 'download' ? dl * 0.85 : 0;
  const pct = Math.round((model * 0.85 + (cameraReady ? 0.15 : 0)) * 100);
  loaderFill.style.width = `${Math.max(4, pct)}%`;
  loaderPct.textContent = `${pct}%`;

  stepCam.textContent = cameraReady ? '好啦 ✓' : '请点「允许」';
  stepCam.classList.toggle('done', cameraReady);
  stepModel.textContent =
    load.stage === 'ready'
      ? '好啦 ✓'
      : load.stage === 'init'
        ? '唤醒中…'
        : load.stage === 'download'
          ? `下载中 ${Math.round(dl * 100)}%`
          : '准备中…';
  stepModel.classList.toggle('done', load.stage === 'ready');

  loaderTitle.textContent =
    cameraReady && load.stage === 'ready'
      ? '马上开始！'
      : cameraReady
        ? `${modelName}马上就好…`
        : '准备开玩啦！';
}

function showLoaderError(err: unknown) {
  loaderTitle.textContent = '哎呀，没打开 😢';
  loaderSteps.style.display = 'none';
  loaderBar.style.display = 'none';
  loaderPct.style.display = 'none';
  loaderError.style.display = 'block';
  loaderError.textContent = err instanceof Error ? err.message : String(err);
  loaderBack.style.display = 'block';
  sfx.miss();
}

// ---- Result ----
function onFinish(summary: GameOverSummary) {
  screenState = 'result';
  const isNew = saveBest(summary.gameId, summary.score) && summary.score > 0;
  refreshBestTags();
  resHeadline.textContent = isNew ? '新纪录！你最棒！' : summary.score > 0 ? '玩得真好！' : '再试一次吧！';
  resTitle.textContent = `${summary.gameName} · 本局成绩`;
  resScore.textContent = summary.scoreDisplay ?? `${summary.score}`;
  resScore.classList.toggle('compact', Boolean(summary.scoreDisplay));
  resRecord.style.display = isNew ? 'inline-block' : 'none';
  resultCard.classList.toggle('record', isNew);

  if (summary.snapshotUrl) {
    resSnapshot.src = summary.snapshotUrl;
    resDownload.href = summary.snapshotUrl;
    resDownload.download = summary.snapshotFilename ?? 'handplay-snapshot.jpg';
    resSnapshotWrap.style.display = 'flex';
  } else {
    resSnapshotWrap.style.display = 'none';
    resSnapshot.removeAttribute('src');
  }

  resStats.innerHTML = summary.stats
    .map((s) => `<div class="stat-item"><small>${s.label}</small><b>${s.value}</b></div>`)
    .join('');
  resultEl.classList.remove('hidden');
  sfx.whoosh();
  if (summary.score > 0) popConfetti(confettiEl, isNew ? 60 : 30);
  if (isNew) {
    window.clearTimeout(recordTimer);
    recordTimer = window.setTimeout(() => sfx.newRecord(), 850);
  }
}

function beginRound() {
  screenState = 'playing';
  lastHudTime = -1;
  lastHudScore = 0;
  hudEl.style.display = 'flex';
  fpsTagEl.style.display = 'block';
  sfx.go();
}

async function startGame(id: GameId) {
  if (screenState === 'loading' || screenState === 'playing') return;
  sfx.unlock();
  sfx.tap();

  lobbyEl.classList.add('hidden');
  resultEl.classList.add('hidden');

  const sensor = GAME_SENSOR[id];
  const needFace = sensor === 'face';
  const modelName = needFace ? '脸部识别' : '小手识别';
  const needInit = !camera.ready || (needFace ? !faceEngine.ready : !handEngine.ready);
  const gameCtor = GAME_MODULES[id]();

  let Ctor: GameCtor;
  if (needInit) {
    screenState = 'loading';
    stepModelLabel.textContent = needFace ? '😜 脸部识别' : '🧠 小手识别';
    loaderEl.classList.remove('hidden');
    loaderSteps.style.display = '';
    loaderBar.style.display = '';
    loaderPct.style.display = '';
    loaderError.style.display = 'none';
    loaderBack.style.display = 'none';
    sfx.whoosh();
    sfx.loaderStart();

    try {
      const initTask = needFace
        ? faceEngine.init(camera, videoEl, (p) => renderLoader(modelName, p))
        : handEngine.init(camera, videoEl, (p) => renderLoader(modelName, p));
      [, Ctor] = await Promise.all([initTask, gameCtor]);
    } catch (err) {
      showLoaderError(err);
      return;
    }
    if (screenState !== 'loading') return;
    sfx.ready();
    loaderEl.classList.add('hidden');
  } else {
    screenState = 'loading';
    Ctor = await gameCtor;
    if (screenState !== 'loading') return;
  }

  if (!needFace) {
    await handEngine.setNumHands(sensor === 'hand2' ? 2 : 1);
  }

  videoEl.classList.remove('hidden');
  activeGame = new Ctor(onFinish);
  beginRound();
}

function goLobby() {
  sfx.back();
  window.clearTimeout(recordTimer);
  screenState = 'lobby';
  activeGame = null;
  hudEl.style.display = 'none';
  fpsTagEl.style.display = 'none';
  resultEl.classList.add('hidden');
  loaderEl.classList.add('hidden');
  lobbyEl.classList.remove('hidden');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
}

// ---- Bindings ----
document.addEventListener('pointerup', () => sfx.unlock(), { passive: true });

document.querySelectorAll<HTMLButtonElement>('.game-card').forEach((btn) => {
  btn.addEventListener('click', () => void startGame(btn.dataset.game as GameId));
});

$('btn-home').addEventListener('click', goLobby);
$('res-home').addEventListener('click', goLobby);
loaderBack.addEventListener('click', goLobby);

$('res-again').addEventListener('click', () => {
  if (!activeGame) return;
  window.clearTimeout(recordTimer);
  sfx.again();
  resultEl.classList.add('hidden');
  activeGame.reset();
  beginRound();
});

$('btn-dim').addEventListener('click', () => {
  sfx.click();
  videoEl.classList.toggle('dimmed');
});

const btnMute = $('btn-mute');
btnMute.addEventListener('click', () => {
  if (sfx.muted) {
    sfx.muted = false;
    sfx.toggle(true);
  } else {
    sfx.toggle(false);
    sfx.muted = true;
  }
  btnMute.textContent = sfx.muted ? '🔇' : '🔊';
});

canvasEl.addEventListener('pointerdown', (e) => {
  if (screenState !== 'playing' || !activeGame?.onTap) return;
  const rect = canvasEl.getBoundingClientRect();
  activeGame.onTap(e.clientX - rect.left, e.clientY - rect.top, vw, vh);
});

// ---- Main loop ----
function loop(ts: number) {
  requestAnimationFrame(loop);
  const dt = lastFrameTime ? Math.min(0.05, Math.max(0.001, (ts - lastFrameTime) / 1000)) : 1 / 60;
  lastFrameTime = ts;

  if (screenState !== 'playing' || !activeGame) return;

  const isFace = activeGame.sensor === 'face';
  const hand = isFace ? EMPTY_HAND : handEngine.update(vw, vh);
  const hands = isFace ? [] : handEngine.hands;
  const face = isFace ? faceEngine.update(vw, vh) : EMPTY_FACE;
  const frame = { hand, hands, face, video: videoEl };

  activeGame.update(dt, vw, vh, frame);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  activeGame.draw(ctx, vw, vh, frame);

  const hud = activeGame.getHud();
  if (hud.score !== lastHudScore) {
    if (hud.score > lastHudScore) {
      hudScoreEl.classList.remove('bump');
      void hudScoreEl.offsetWidth;
      hudScoreEl.classList.add('bump');
    }
    lastHudScore = hud.score;
  }
  hudScoreEl.textContent = hud.scoreText ?? `⭐ ${hud.score}`;

  if (hud.timerText) {
    hudTimerEl.textContent = hud.timerText;
    hudTimerEl.classList.toggle('urgent', Boolean(hud.urgent));
  } else if (hud.timeLeft !== lastHudTime) {
    if (lastHudTime !== -1 && hud.timeLeft > 0 && hud.timeLeft <= 5) sfx.tick(hud.timeLeft);
    lastHudTime = hud.timeLeft;
    hudTimerEl.textContent = `⏱ ${hud.timeLeft}`;
    hudTimerEl.classList.toggle('urgent', hud.urgent ?? hud.timeLeft <= 5);
  }

  const stats = isFace ? faceEngine.stats : handEngine.stats;
  const modeTag = isFace ? 'FACE' : activeGame.sensor === 'hand2' ? '2H' : '1H';
  fpsTagEl.textContent = `${modeTag} · ${stats.delegate} · ${stats.fps} fps`;
}
requestAnimationFrame(loop);
