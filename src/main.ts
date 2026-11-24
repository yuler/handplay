import './style.css';
import { sfx } from './audio/sfx';
import { AirSlingshotGame } from './games/airSlingshot';
import { DualHandGame } from './games/dualHand';
import { FingerRuneGame } from './games/fingerRune';
import { GestureRushGame } from './games/gestureRush';
import { MouthMunchGame } from './games/mouthMunch';
import { NoBlinkGame } from './games/noBlink';
import type { GameController, GameId, GameOverSummary, SensorMode } from './games/types';
import { CameraManager } from './vision/camera';
import { EMPTY_FACE, FaceEngine } from './vision/faceEngine';
import { EMPTY_HAND, HandEngine, type InitProgress } from './vision/handEngine';

const BEST_KEY = 'handplay:best:v1';

interface GameCardConfig {
  id: GameId;
  cls: string;
  icon: string;
  title: string;
  desc: string;
  tags: string[];
  sensor: SensorMode;
  sensorBadge: string;
}

interface LobbySection {
  title: string;
  games: GameCardConfig[];
}

const LOBBY_SECTIONS: LobbySection[] = [
  {
    title: '✋ 单手隔空玩',
    games: [
      {
        id: 'gesture-rush',
        cls: 'rush',
        icon: '✌️',
        title: '闪电结印',
        desc: '限时比出 ✊☝️✌️🖐️👍👌 对应手势，5 连击进入狂热翻倍，还会触发手指心算挑战！',
        tags: ['45 秒街机', '6 种手势 + 心算'],
        sensor: 'hand1',
        sensorBadge: '✋ 单手',
      },
      {
        id: 'air-slingshot',
        cls: 'sling',
        icon: '🤏',
        title: '空气弹弓',
        desc: '拇指+食指隔空捏合拉起能量弹弓，看抛物线瞄准，松手弹射打爆移动靶与星星！',
        tags: ['60 秒射击', '隔空捏合 Pinch'],
        sensor: 'hand1',
        sensorBadge: '✋ 单手',
      },
      {
        id: 'finger-rune',
        cls: 'rune',
        icon: '☝️',
        title: '一指画符',
        desc: '伸出食指当魔法棒，隔空画出 — | ○ ∧ ∨ 符咒，连锁闪电秒杀同符号妖怪！',
        tags: ['50 秒施法', '5 种魔法符咒'],
        sensor: 'hand1',
        sensorBadge: '✋ 单手',
      },
    ],
  },
  {
    title: '😜 完全解放双手（脸部体感）',
    games: [
      {
        id: 'mouth-munch',
        cls: 'munch',
        icon: '😮',
        title: '大嘴吞星',
        desc: '躺着也能玩！歪头移动、张大嘴漩涡吸星、眨眼发射双激光击碎冰块、鼓腮开护盾！',
        tags: ['50 秒街机', '张嘴 + 眨眼 + 鼓腮'],
        sensor: 'face',
        sensorBadge: '😜 纯脸部',
      },
      {
        id: 'no-blink',
        cls: 'noblink',
        icon: '👁️',
        title: '别眨眼 / 憋笑',
        desc: '飞虫骚扰 + 冷笑话轰炸！局内一键切换「别眨眼 / 憋笑挑战」，破功瞬间自动抓拍留念！',
        tags: ['双模式生存', '破功抓拍保存'],
        sensor: 'face',
        sensorBadge: '😜 纯脸部',
      },
    ],
  },
  {
    title: '🙌 桌面支架挑战（双手同屏）',
    games: [
      {
        id: 'dual-hand',
        cls: 'dual',
        icon: '🙌',
        title: '左右手快闪',
        desc: '把手机靠在桌上，同时举起双手！左手右手比出不同手势，还会突然「左右互换」烧脑挑战！',
        tags: ['45 秒脑力', '左右互换'],
        sensor: 'hand2',
        sensorBadge: '🙌 双手支架',
      },
    ],
  },
];

const GAME_SENSOR: Record<GameId, SensorMode> = Object.fromEntries(
  LOBBY_SECTIONS.flatMap((s) => s.games.map((g) => [g.id, g.sensor])),
) as Record<GameId, SensorMode>;

const DEFAULT_BEST: Record<GameId, number> = {
  'gesture-rush': 0,
  'air-slingshot': 0,
  'finger-rune': 0,
  'mouth-munch': 0,
  'no-blink': 0,
  'dual-hand': 0,
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

function formatBestLabel(id: GameId, score: number): string {
  if (id === 'no-blink') {
    return `最高 ${(score / 10).toFixed(1)} 秒`;
  }
  return `最高 ${score} 分`;
}

function renderLobbyCards(): string {
  return LOBBY_SECTIONS.map(
    (section) => `
      <div class="section-group">
        <div class="section-label">${section.title}</div>
        <div class="card-list">
          ${section.games
            .map(
              (g) => `
            <button class="game-card ${g.cls}" data-game="${g.id}">
              <div class="game-icon">${g.icon}</div>
              <div class="game-meta">
                <div class="game-title-row">
                  <h2>${g.title}</h2>
                  <span id="best-${g.id}" class="best-tag">最高 0 分</span>
                </div>
                <p>${g.desc}</p>
                <div class="game-tags">
                  <span class="mini-tag sensor">${g.sensorBadge}</span>
                  ${g.tags.map((t) => `<span class="mini-tag">${t}</span>`).join('')}
                </div>
              </div>
            </button>`,
            )
            .join('')}
        </div>
      </div>
    `,
  ).join('');
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
    <div id="lobby" class="overlay lobby-overlay">
      <div class="brand">
        <span class="brand-badge">ONLY MOBILE · WEBASSEMBLY AI</span>
        <h1>HandPlay 隔空玩</h1>
        <p>手势 + 脸部 6 款前置摄像头体感小游戏<br/>无需安装 · 画面纯本地推理绝不上传</p>
      </div>
      <div class="lobby-sections">
        ${renderLobbyCards()}
      </div>
      <p class="privacy-note">
        🔒 基于 MediaPipe Hand + Face Landmarker WASM + One Euro Filter<br/>
        摄像头画面仅在本机内存实时推理，绝不上传服务器
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
        <div id="res-title" style="font-size:15px;font-weight:800;color:#94a3b8;">本局结束</div>
        <div id="res-score" class="result-score">0</div>
        <div id="res-record" class="new-record" style="display:none">🏆 刷新最高纪录！</div>
        <div id="res-snapshot-wrap" class="snapshot-wrap" style="display:none">
          <img id="res-snapshot" class="snapshot-img" alt="破功瞬间抓拍" />
          <a id="res-download" class="btn btn-snapshot" download="handplay-snapshot.jpg">📸 保存破功照</a>
        </div>
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
const resSnapshotWrap = document.getElementById('res-snapshot-wrap')!;
const resSnapshot = document.getElementById('res-snapshot') as HTMLImageElement;
const resDownload = document.getElementById('res-download') as HTMLAnchorElement;
const resStats = document.getElementById('res-stats')!;

const camera = new CameraManager();
const handEngine = new HandEngine();
const faceEngine = new FaceEngine();

let activeGame: GameController | null = null;
let screenState: 'lobby' | 'loading' | 'playing' | 'result' = 'lobby';
let lastFrameTime = 0;
let lastCountdownTick = 99;
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
  for (const id of Object.keys(DEFAULT_BEST) as GameId[]) {
    const el = document.getElementById(`best-${id}`);
    if (el) el.textContent = formatBestLabel(id, best[id] ?? 0);
  }
}
refreshBestTags();

function createGame(id: GameId): GameController {
  const onFinish = (summary: GameOverSummary) => {
    screenState = 'result';
    const isNew = saveBest(summary.gameId, summary.score);
    refreshBestTags();
    resTitle.textContent = `${summary.gameName} · 本局结束`;
    resScore.textContent = summary.scoreDisplay ?? `${summary.score}`;
    resRecord.style.display = isNew && summary.score > 0 ? 'inline-block' : 'none';
    if (isNew && summary.score > 0) sfx.newRecord();

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
  };

  switch (id) {
    case 'gesture-rush':
      return new GestureRushGame(onFinish);
    case 'air-slingshot':
      return new AirSlingshotGame(onFinish);
    case 'finger-rune':
      return new FingerRuneGame(onFinish);
    case 'mouth-munch':
      return new MouthMunchGame(onFinish);
    case 'no-blink':
      return new NoBlinkGame(onFinish);
    case 'dual-hand':
      return new DualHandGame(onFinish);
  }
}

function updateLoaderProgress(modelName: string, p: InitProgress) {
  const { stage, loaded, total } = p.load;
  if (stage === 'download') {
    const mbDone = (loaded / 1_048_576).toFixed(1);
    const mbTotal = (total / 1_048_576).toFixed(1);
    const pct = Math.min(82, Math.max(8, Math.round((loaded / Math.max(1, total)) * 82)));
    loaderText.textContent = `正在下载${modelName}（${mbDone} / ${mbTotal} MB）…`;
    loaderFill.style.width = `${pct}%`;
  } else if (stage === 'init') {
    loaderText.textContent = p.cameraReady
      ? `正在初始化${modelName}…`
      : '正在打开前置摄像头…';
    loaderFill.style.width = '90%';
  } else if (stage === 'ready' && !p.cameraReady) {
    loaderText.textContent = '正在请求前置摄像头权限…';
    loaderFill.style.width = '94%';
  } else if (stage === 'ready' && p.cameraReady) {
    loaderText.textContent = '准备就绪！';
    loaderFill.style.width = '100%';
  }
}

async function startGame(id: GameId) {
  sfx.unlock();
  sfx.tap();

  lobbyEl.classList.add('hidden');
  resultEl.classList.add('hidden');

  const sensor = GAME_SENSOR[id];
  const needFace = sensor === 'face';
  const needInit = !camera.ready || (needFace ? !faceEngine.ready : !handEngine.ready);

  if (needInit) {
    screenState = 'loading';
    loaderEl.classList.remove('hidden');
    loaderSpinner.style.display = 'block';
    loaderBar.style.display = 'block';
    loaderError.style.display = 'none';
    loaderBack.style.display = 'none';
    loaderFill.style.width = '8%';
    loaderText.textContent = needFace ? '正在准备脸部 AI 模型…' : '正在准备手势 AI 模型…';
    sfx.loaderStart();

    try {
      if (needFace) {
        await faceEngine.init(camera, videoEl, (p) => updateLoaderProgress('脸部模型', p));
      } else {
        await handEngine.init(camera, videoEl, (p) => updateLoaderProgress('手势模型', p));
      }
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
    sfx.ready();
  }

  if (!needFace) {
    await handEngine.setNumHands(sensor === 'hand2' ? 2 : 1);
  }

  videoEl.classList.remove('hidden');
  activeGame = createGame(id);
  lastCountdownTick = 99;
  screenState = 'playing';
  hudEl.style.display = 'flex';
  fpsTagEl.style.display = 'block';
  sfx.go();
}

function goLobby() {
  sfx.back();
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
  sfx.again();
  resultEl.classList.add('hidden');
  lastCountdownTick = 99;
  activeGame.reset();
  screenState = 'playing';
});

const btnDim = document.getElementById('btn-dim')!;
btnDim.addEventListener('click', () => {
  sfx.toggle(!videoEl.classList.contains('dimmed'));
  videoEl.classList.toggle('dimmed');
});

const btnMute = document.getElementById('btn-mute')!;
btnMute.addEventListener('click', () => {
  if (!sfx.muted) sfx.toggle(false);
  sfx.muted = !sfx.muted;
  btnMute.textContent = sfx.muted ? '🔇' : '🔊';
  if (!sfx.muted) sfx.toggle(true);
});

// Forward canvas taps to interactive in-game controls (e.g., NoBlink 2-in-1 switcher)
canvasEl.addEventListener('pointerdown', (e) => {
  if (screenState !== 'playing' || !activeGame?.onTap) return;
  const rect = canvasEl.getBoundingClientRect();
  activeGame.onTap(e.clientX - rect.left, e.clientY - rect.top, vw, vh);
});

// Main 60fps loop
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
  hudScoreEl.textContent = hud.scoreText ?? `${hud.score}`;
  hudTimerEl.textContent = hud.timerText ?? `⏱ ${hud.timeLeft}`;
  hudTimerEl.classList.toggle('urgent', hud.urgent ?? hud.timeLeft <= 8);

  if (!hud.timerText && hud.timeLeft <= 5 && hud.timeLeft > 0 && hud.timeLeft < lastCountdownTick) {
    lastCountdownTick = hud.timeLeft;
    sfx.tick(hud.timeLeft);
  }

  const stats = isFace ? faceEngine.stats : handEngine.stats;
  const modeTag = isFace ? 'FACE' : activeGame.sensor === 'hand2' ? '2H' : '1H';
  fpsTagEl.textContent = `${modeTag} · ${stats.delegate} · ${stats.fps} fps`;
}
requestAnimationFrame(loop);
