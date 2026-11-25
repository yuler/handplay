import './style.css';
import './ui/overlays.css';
import { sfx } from './audio/sfx';
import { refreshBestTags, saveBest } from './bestScores';
import { GAME_MAP, type GameMeta } from './games/catalog';
import type { GameController, GameId, GameOverSummary } from './games/types';
import { currentState, parseRoute, playPath, pushRoute, replaceRoute } from './router';
import { GameRuntime } from './runtime';
import { popConfetti } from './ui/confetti';
import { APP_HTML, tagsHtml } from './ui/markup';
import { describeStartError } from './ui/startError';
import { CameraManager } from './vision/camera';
import { FaceEngine } from './vision/faceEngine';
import { HandEngine, type VisionLoadState } from './vision/handEngine';

const LOBBY_TITLE = '手手玩 · HandPlay 隔空小游戏';

const app = document.getElementById('app')!;
app.innerHTML = APP_HTML;

const $ = (id: string) => document.getElementById(id)!;
const videoEl = $('cam') as HTMLVideoElement;
const canvasEl = $('canvas') as HTMLCanvasElement;

const hudEl = $('hud');
const lobbyEl = $('lobby');
const prefetchChip = $('prefetch-chip');
const loaderEl = $('loader');
const loaderTitle = $('loader-title');
const stepCam = $('step-cam');
const stepModelLabel = $('step-model-label');
const stepModel = $('step-model');
const loaderFill = $('loader-fill');
const loaderPct = $('loader-pct');
const readyEl = $('ready');
const readyCard = $('ready-card');
const errorEl = $('cam-error');
const errTitle = $('err-title');
const errMsg = $('err-msg');
const errRetry = $('err-retry') as HTMLButtonElement;
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
const runtime = new GameRuntime({
  canvas: canvasEl,
  video: videoEl,
  hand: handEngine,
  face: faceEngine,
  hudScore: $('hud-score'),
  hudTimer: $('hud-timer'),
  fpsTag: $('fps-tag'),
  prompt: $('sensor-prompt'),
  countdown: $('countdown'),
  countdownNum: $('countdown-num'),
});

type Screen = 'lobby' | 'ready' | 'loading' | 'playing' | 'result' | 'error';
let screen: Screen = 'lobby';
let currentId: GameId | null = null;
/** Bumped on every navigation so stale async starts/resumes bail out */
let navToken = 0;
let recordTimer = 0;
let retryAction: (() => void) | null = null;

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
function renderLoader(modelName: string, cameraReady: boolean, load: VisionLoadState) {
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

function hideOverlays() {
  for (const el of [lobbyEl, readyEl, loaderEl, errorEl, resultEl]) el.classList.add('hidden');
}

function showStartError(err: unknown, retry: () => void) {
  console.warn('[HandPlay] start failed:', err);
  screen = 'error';
  hideOverlays();
  hudEl.style.display = 'none';
  const view = describeStartError(err);
  errTitle.textContent = view.title;
  errMsg.textContent = view.message;
  errRetry.style.display = view.retry ? '' : 'none';
  errRetry.textContent = view.retry ?? '';
  retryAction = view.retry ? retry : null;
  errorEl.classList.remove('hidden');
  sfx.miss();
}

// ---- Result ----
function onFinish(summary: GameOverSummary) {
  screen = 'result';
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
    resDownload.textContent = summary.snapshotLabel ?? '📸 保存破功照';
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

// ---- Game lifecycle ----
function resetVision() {
  handEngine.resetTracking();
  faceEngine.reset();
}

function beginRound(game: GameController) {
  screen = 'playing';
  resetVision();
  videoEl.classList.remove('hidden');
  hudEl.style.display = 'flex';
  runtime.start(game);
  sfx.go();
}

/** Every entry goes through the camera gate, even when the stream looks healthy. */
async function startGame(id: GameId) {
  const token = ++navToken;
  const meta = GAME_MAP[id];
  currentId = id;
  sfx.unlock();
  hideOverlays();
  document.title = `${meta.title} · 手手玩`;

  const needFace = meta.sensor === 'face';
  const engine = needFace ? faceEngine : handEngine;
  const modelName = needFace ? '脸部识别' : '小手识别';
  const quick = camera.live && engine.ready;
  let cameraReady = false;
  let unsubscribe = () => {};

  screen = 'loading';
  const showLoader = () => {
    if (token !== navToken || screen !== 'loading') return;
    stepModelLabel.textContent = needFace ? '😜 脸部识别' : '🧠 小手识别';
    renderLoader(modelName, cameraReady, engine.load);
    loaderEl.classList.remove('hidden');
    unsubscribe = engine.onLoadChange((s) => renderLoader(modelName, cameraReady, s));
  };
  // The fast path normally resolves within a frame or two; only show progress if it stalls
  const slowTimer = quick ? window.setTimeout(showLoader, 400) : 0;
  if (!quick) {
    showLoader();
    sfx.whoosh();
    sfx.loaderStart();
  }

  let game: GameController;
  try {
    const camTask = camera.ensureReady(videoEl).then(() => {
      cameraReady = true;
      renderLoader(modelName, true, engine.load);
    });
    const [, , Ctor] = await Promise.all([camTask, engine.init(videoEl), meta.load()]);
    if (token !== navToken) return;
    if (!needFace) await handEngine.setNumHands(meta.sensor === 'hand2' ? 2 : 1);
    if (token !== navToken) return;
    game = new Ctor(onFinish);
  } catch (err) {
    if (token === navToken) showStartError(err, () => void startGame(id));
    return;
  } finally {
    window.clearTimeout(slowTimer);
    unsubscribe();
  }

  if (!loaderEl.classList.contains('hidden')) {
    sfx.ready();
    loaderEl.classList.add('hidden');
  }
  beginRound(game);
}

async function restartGame() {
  const game = runtime.game;
  if (!game) return;
  const token = ++navToken;
  window.clearTimeout(recordTimer);
  sfx.again();
  resultEl.classList.add('hidden');
  screen = 'loading';
  try {
    await camera.ensureReady(videoEl);
  } catch (err) {
    if (token === navToken) showStartError(err, () => void restartGame());
    return;
  }
  if (token !== navToken) return;
  game.reset();
  beginRound(game);
}

/** Back from a hidden tab: re-run the gate (reopens a stale camera), then 3-2-1. */
async function resumeAfterPause() {
  if (!runtime.paused) return;
  const token = navToken;
  try {
    await camera.ensureReady(videoEl);
  } catch (err) {
    if (token === navToken) showStartError(err, retryResume);
    return;
  }
  if (token !== navToken || !runtime.paused) return;
  resetVision();
  runtime.resumeWithCountdown();
}

function retryResume() {
  errorEl.classList.add('hidden');
  hudEl.style.display = 'flex';
  screen = 'playing';
  void resumeAfterPause();
}

function teardown() {
  navToken++;
  window.clearTimeout(recordTimer);
  runtime.stop();
  currentId = null;
  retryAction = null;
  hudEl.style.display = 'none';
  hideOverlays();
  videoEl.classList.add('hidden');
  camera.scheduleStop();
}

function showLobby() {
  teardown();
  screen = 'lobby';
  document.title = LOBBY_TITLE;
  refreshBestTags();
  lobbyEl.classList.remove('hidden');
}

function fillReadyCard(meta: GameMeta) {
  readyCard.className = `ready-card ${meta.theme}`;
  $('ready-icon').textContent = meta.icon;
  $('ready-title').textContent = meta.title;
  $('ready-desc').textContent = meta.desc;
  $('ready-tags').innerHTML = tagsHtml(meta);
}

function showReady(id: GameId) {
  teardown();
  const meta = GAME_MAP[id];
  screen = 'ready';
  currentId = id;
  document.title = `${meta.title} · 手手玩`;
  fillReadyCard(meta);
  readyEl.classList.remove('hidden');
}

// ---- Routing ----
function applyRoute() {
  const route = parseRoute(location.pathname);
  if (!route) {
    replaceRoute('/');
    showLobby();
    return;
  }
  if (route.name === 'lobby') {
    if (screen !== 'lobby') {
      if (screen !== 'ready') sfx.back();
      showLobby();
    }
    return;
  }
  if (currentId === route.id && screen !== 'lobby') return;
  showReady(route.id);
}

function goHome() {
  if (currentState().fromLobby) {
    history.back();
  } else {
    if (screen !== 'ready') sfx.back();
    replaceRoute('/');
    showLobby();
  }
}

window.addEventListener('popstate', applyRoute);
applyRoute();

// ---- Page lifecycle: pause when hidden, gated 3-2-1 resume when back ----
function onHidden() {
  if (screen === 'playing') runtime.pause();
}

function onVisible() {
  if (screen === 'playing' && runtime.paused) {
    sfx.unlock();
    void resumeAfterPause();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onHidden();
  else onVisible();
});
window.addEventListener('pagehide', onHidden);
window.addEventListener('pageshow', onVisible);

// ---- Bindings ----
document.addEventListener('pointerup', () => sfx.unlock(), { passive: true });

document.querySelectorAll<HTMLButtonElement>('.game-card').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (screen !== 'lobby') return;
    const id = btn.dataset.game as GameId;
    sfx.unlock();
    sfx.tap();
    pushRoute(playPath(id), { fromLobby: true });
    void startGame(id);
  });
});

$('ready-start').addEventListener('click', () => {
  if (screen !== 'ready' || !currentId) return;
  sfx.unlock();
  sfx.tap();
  void startGame(currentId);
});
$('ready-home').addEventListener('click', goHome);
$('err-home').addEventListener('click', goHome);
errRetry.addEventListener('click', () => {
  sfx.unlock();
  sfx.click();
  retryAction?.();
});
$('btn-home').addEventListener('click', goHome);
$('res-home').addEventListener('click', goHome);
$('res-again').addEventListener('click', () => {
  if (screen === 'result') void restartGame();
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
  const game = runtime.game;
  if (screen !== 'playing' || !runtime.running || !game?.onTap) return;
  const rect = canvasEl.getBoundingClientRect();
  game.onTap(e.clientX - rect.left, e.clientY - rect.top, runtime.vw, runtime.vh);
});

// ---- Main loop ----
function loop(ts: number) {
  requestAnimationFrame(loop);
  if (screen === 'playing') runtime.tick(ts);
}
requestAnimationFrame(loop);
