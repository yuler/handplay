import './style.css';
import { sfx } from './audio/sfx';
import { AirSlingshotGame } from './games/airSlingshot';
import { GestureRushGame } from './games/gestureRush';
import type { GameController, GameId, GameOverSummary } from './games/types';
import { HandEngine } from './vision/handEngine';

const BEST_KEY = 'handplay:best:v1';

function loadBest(): Record<GameId, number> {
  try {
    return {
      'gesture-rush': 0,
      'air-slingshot': 0,
      ...(JSON.parse(localStorage.getItem(BEST_KEY) || '{}') as Partial<Record<GameId, number>>),
    };
  } catch {
    return { 'gesture-rush': 0, 'air-slingshot': 0 };
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

const app = document.getElementById('app')!;
app.innerHTML = `
  <div class="stage-wrap">
    <video id="cam" class="cam-video hidden" playsinline autoplay muted></video>
    <canvas id="canvas" class="game-canvas"></canvas>

    <div id="hud" class="hud-bar" style="display:none">
      <div class="hud-group">
        <button id="btn-home" class="icon-btn" aria-label="返回大厅">←</button>
        <div id="hud-score" class="pill score">0</div>
      </div>
      <div class="hud-group">
        <div id="hud-timer" class="pill timer">⏱ 45</div>
        <button id="btn-dim" class="icon-btn" aria-label="切换背景透明度">◐</button>
        <button id="btn-mute" class="icon-btn" aria-label="静音开关">🔊</button>
      </div>
    </div>
    <div id="fps-tag" class="fps-tag" style="display:none"></div>

    <!-- Lobby -->
    <div id="lobby" class="overlay">
      <div class="brand">
        <span class="brand-badge">ONLY MOBILE · WEBASSEMBLY AI</span>
        <h1>HandPlay 隔空玩</h1>
        <p>单手拿手机，另一只手对着前置摄像头开玩<br/>无需安装 · 画面纯本地识别不上传</p>
      </div>
      <div class="card-list">
        <button class="game-card rush" data-game="gesture-rush">
          <div class="game-icon">✌️</div>
          <div class="game-meta">
            <div class="game-title-row">
              <h2>闪电结印</h2>
              <span id="best-rush" class="best-tag">最高 0 分</span>
            </div>
            <p>限时比出 ✊☝️✌️🖐️👍👌 对应手势，5 连击进入狂热翻倍，还会触发手指心算挑战！</p>
            <div class="game-tags">
              <span class="mini-tag">45 秒街机</span>
              <span class="mini-tag">6 种手势 + 心算</span>
              <span class="mini-tag">单手出招</span>
            </div>
          </div>
        </button>

        <button class="game-card sling" data-game="air-slingshot">
          <div class="game-icon">🤏</div>
          <div class="game-meta">
            <div class="game-title-row">
              <h2>空气弹弓</h2>
              <span id="best-sling" class="best-tag">最高 0 分</span>
            </div>
            <p>拇指+食指隔空捏合拉起能量弹弓，看抛物线瞄准，松手弹射打爆移动靶与星星！</p>
            <div class="game-tags">
              <span class="mini-tag">60 秒射击</span>
              <span class="mini-tag">隔空捏合 Pinch</span>
              <span class="mini-tag">穿透连击</span>
            </div>
          </div>
        </button>
      </div>
      <p class="privacy-note">
        🔒 基于 MediaPipe HandLandmarker WASM + One Euro Filter<br/>
        摄像头视频仅在手机本机内存推理，绝不上传服务器
      </p>
    </div>

    <!-- Loader / Error -->
    <div id="loader" class="overlay hidden">
      <div class="loader-box">
        <div id="loader-spinner" class="spinner"></div>
        <div id="loader-text" style="font-weight:800;font-size:15px;">正在准备…</div>
        <div id="loader-bar" class="progress-bar"><div id="loader-fill" class="progress-fill"></div></div>
        <div id="loader-error" class="error-msg" style="display:none"></div>
        <button id="loader-back" class="btn btn-ghost" style="display:none;width:100%">返回重试</button>
      </div>
    </div>

    <!-- Result -->
    <div id="result" class="overlay hidden">
      <div class="result-card">
        <div id="res-title" style="font-size:15px;font-weight:800;color:#94a3b8;">闪电结印 · 结束</div>
        <div id="res-score" class="result-score">0</div>
        <div id="res-record" class="new-record" style="display:none">🏆 刷新最高分！</div>
        <div id="res-stats" class="stat-grid"></div>
        <div class="btn-row">
          <button id="res-home" class="btn btn-ghost">换个游戏</button>
          <button id="res-again" class="btn btn-primary">再来一局</button>
        </div>
      </div>
    </div>
  </div>
`;

const videoEl = document.getElementById('cam') as HTMLVideoElement;
const canvasEl = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvasEl.getContext('2d')!;

const hudEl = document.getElementById('hud')!;
const hudScoreEl = document.getElementById('hud-score')!;
const hudTimerEl = document.getElementById('hud-timer')!;
const fpsTagEl = document.getElementById('fps-tag')!;
const lobbyEl = document.getElementById('lobby')!;
const loaderEl = document.getElementById('loader')!;
const loaderSpinner = document.getElementById('loader-spinner')!;
const loaderText = document.getElementById('loader-text')!;
const loaderBar = document.getElementById('loader-bar')!;
const loaderFill = document.getElementById('loader-fill')!;
const loaderError = document.getElementById('loader-error')!;
const loaderBack = document.getElementById('loader-back')!;
const resultEl = document.getElementById('result')!;
const resTitle = document.getElementById('res-title')!;
const resScore = document.getElementById('res-score')!;
const resRecord = document.getElementById('res-record')!;
const resStats = document.getElementById('res-stats')!;
const bestRushEl = document.getElementById('best-rush')!;
const bestSlingEl = document.getElementById('best-sling')!;

const engine = new HandEngine();
let activeGame: GameController | null = null;
let screenState: 'lobby' | 'loading' | 'playing' | 'result' = 'lobby';
let lastFrameTime = 0;
let vw = window.innerWidth;
let vh = window.innerHeight;
let dpr = Math.min(2, window.devicePixelRatio || 1);

function resize() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvasEl.width = Math.round(vw * dpr);
  canvasEl.height = Math.round(vh * dpr);
}
resize();
window.addEventListener('resize', resize);

function refreshBestTags() {
  const best = loadBest();
  bestRushEl.textContent = `最高 ${best['gesture-rush']} 分`;
  bestSlingEl.textContent = `最高 ${best['air-slingshot']} 分`;
}
refreshBestTags();

function createGame(id: GameId): GameController {
  const onFinish = (summary: GameOverSummary) => {
    screenState = 'result';
    const isNew = saveBest(summary.gameId, summary.score);
    refreshBestTags();
    resTitle.textContent = `${summary.gameName} · 本局结束`;
    resScore.textContent = `${summary.score}`;
    resRecord.style.display = isNew && summary.score > 0 ? 'inline-block' : 'none';
    resStats.innerHTML = summary.stats
      .map((s) => `<div class="stat-item"><small>${s.label}</small><b>${s.value}</b></div>`)
      .join('');
    resultEl.classList.remove('hidden');
  };
  return id === 'gesture-rush' ? new GestureRushGame(onFinish) : new AirSlingshotGame(onFinish);
}

async function startGame(id: GameId) {
  sfx.unlock();
  sfx.click();

  lobbyEl.classList.add('hidden');
  resultEl.classList.add('hidden');

  if (!engine.ready) {
    screenState = 'loading';
    loaderEl.classList.remove('hidden');
    loaderSpinner.style.display = 'block';
    loaderBar.style.display = 'block';
    loaderError.style.display = 'none';
    loaderBack.style.display = 'none';
    loaderFill.style.width = '8%';

    try {
      await engine.init(videoEl, (label, pct) => {
        loaderText.textContent = label;
        loaderFill.style.width = `${pct}%`;
      });
    } catch (err) {
      loaderSpinner.style.display = 'none';
      loaderBar.style.display = 'none';
      loaderText.textContent = '启动失败';
      loaderError.style.display = 'block';
      loaderError.textContent = err instanceof Error ? err.message : String(err);
      loaderBack.style.display = 'block';
      return;
    }

    loaderEl.classList.add('hidden');
  }

  videoEl.classList.remove('hidden');
  activeGame = createGame(id);
  screenState = 'playing';
  hudEl.style.display = 'flex';
  fpsTagEl.style.display = 'block';
}

function goLobby() {
  sfx.click();
  screenState = 'lobby';
  activeGame = null;
  hudEl.style.display = 'none';
  fpsTagEl.style.display = 'none';
  resultEl.classList.add('hidden');
  loaderEl.classList.add('hidden');
  lobbyEl.classList.remove('hidden');
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
}

// Button bindings
document.querySelectorAll<HTMLButtonElement>('.game-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.game as GameId;
    void startGame(id);
  });
});

document.getElementById('btn-home')!.addEventListener('click', goLobby);
document.getElementById('res-home')!.addEventListener('click', goLobby);
loaderBack.addEventListener('click', goLobby);

document.getElementById('res-again')!.addEventListener('click', () => {
  if (!activeGame) return;
  sfx.click();
  resultEl.classList.add('hidden');
  activeGame.reset();
  screenState = 'playing';
});

const btnDim = document.getElementById('btn-dim')!;
btnDim.addEventListener('click', () => {
  sfx.click();
  videoEl.classList.toggle('dimmed');
});

const btnMute = document.getElementById('btn-mute')!;
btnMute.addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  btnMute.textContent = sfx.muted ? '🔇' : '🔊';
  if (!sfx.muted) sfx.click();
});

// Main 60fps loop
function loop(ts: number) {
  requestAnimationFrame(loop);
  const dt = lastFrameTime ? Math.min(0.05, Math.max(0.001, (ts - lastFrameTime) / 1000)) : 1 / 60;
  lastFrameTime = ts;

  if (screenState !== 'playing' || !activeGame) return;

  const hand = engine.update(vw, vh);
  activeGame.update(dt, vw, vh, hand);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  activeGame.draw(ctx, vw, vh, hand);

  const hud = activeGame.getHud();
  hudScoreEl.textContent = `${hud.score}`;
  hudTimerEl.textContent = `⏱ ${hud.timeLeft}`;
  hudTimerEl.classList.toggle('urgent', hud.timeLeft <= 8);
  fpsTagEl.textContent = `${engine.stats.delegate} · ${engine.stats.fps} fps`;
}
requestAnimationFrame(loop);
