import { GAMES, LOBBY_SECTIONS, type GameMeta } from '../games/catalog';

export function tagsHtml(g: GameMeta): string {
  return [`<span class="mini-tag sensor">${g.sensorTag}</span>`, ...g.tags.map((t) => `<span class="mini-tag">${t}</span>`)].join('');
}

export function howToHtml(g: GameMeta): string {
  return g.howTo.map((line) => `<li>${line}</li>`).join('');
}

function gameCardHtml(g: GameMeta): string {
  return `
            <button class="game-card ${g.theme}" data-game="${g.id}">
              <span id="best-${g.id}" class="best-sticker">✨ 来试试</span>
              <div class="game-icon">${g.icon}</div>
              <div class="game-meta">
                <h2>${g.title}</h2>
                <p>${g.desc}</p>
                <div class="game-tags">${tagsHtml(g)}</div>
              </div>
            </button>`;
}

function lobbySectionsHtml(): string {
  return LOBBY_SECTIONS.map(
    (sec) => `
        <div class="section-group">
          <div class="section-label">${sec.label}</div>
          <div class="card-list">${GAMES.filter((g) => g.sensor === sec.sensor).map(gameCardHtml).join('')}
          </div>
        </div>`,
  ).join('');
}

export function mascotSvg(extraClass = ''): string {
  return `
    <div class="mascot ${extraClass}" aria-hidden="true">
      <svg viewBox="0 0 120 120" class="mascot-face">
        <circle cx="60" cy="66" r="48" fill="#3a2d5c"/>
        <circle cx="60" cy="60" r="48" fill="#ffc93c" stroke="#3a2d5c" stroke-width="5"/>
        <ellipse cx="42" cy="54" rx="6.5" ry="8.5" fill="#3a2d5c"/>
        <ellipse cx="78" cy="54" rx="6.5" ry="8.5" fill="#3a2d5c"/>
        <circle cx="44.5" cy="50.5" r="2.4" fill="#fff"/>
        <circle cx="80.5" cy="50.5" r="2.4" fill="#fff"/>
        <ellipse cx="30" cy="72" rx="8" ry="5" fill="#ff7a6b" opacity=".55"/>
        <ellipse cx="90" cy="72" rx="8" ry="5" fill="#ff7a6b" opacity=".55"/>
        <path d="M46 72 Q60 88 74 72" fill="#ff7a6b" stroke="#3a2d5c" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
      <span class="mascot-crown">👑</span>
      <span class="mascot-hand">👋</span>
    </div>`;
}

export const APP_HTML = `
  <div class="stage-wrap">
    <video id="cam" class="cam-video hidden" playsinline webkit-playsinline autoplay muted></video>
    <canvas id="canvas" class="game-canvas"></canvas>

    <div id="hud" class="hud-bar" style="display:none">
      <div class="hud-group">
        <button id="btn-home" class="icon-btn" aria-label="返回大厅">🏠</button>
        <div id="hud-score" class="pill score">⭐ 0</div>
      </div>
      <div class="hud-group">
        <div id="hud-timer" class="pill timer">⏱ 45</div>
        <button id="btn-help" class="icon-btn" aria-label="玩法提示">❓</button>
        <button id="btn-dim" class="icon-btn" aria-label="调暗摄像头画面">🌗</button>
        <button id="btn-mute" class="icon-btn" aria-label="静音开关">🔊</button>
      </div>
    </div>
    <button id="tip-banner" class="tip-banner hidden" type="button" aria-label="查看完整玩法提示"></button>
    <div id="fps-tag" class="fps-tag" style="display:none"></div>

    <!-- Lobby -->
    <div id="lobby" class="overlay lobby">
      <div class="brand">
        ${mascotSvg('wave')}
        <h1>手手玩</h1>
        <p class="brand-sub">HandPlay · 手势 + 脸部 ${GAMES.length} 款隔空体感小游戏</p>
      </div>

      <div id="prefetch-chip" class="prefetch-chip">🧠 正在准备小手识别…</div>

      <div class="lobby-sections">${lobbySectionsHtml()}</div>

      <p class="privacy-note">
        给家长：对着前置摄像头隔空开玩，手势/脸部都能玩。<br/>
        🔒 画面只在这台手机本机内存推理，绝不会上传。
      </p>
    </div>

    <!-- Loader / Error -->
    <div id="loader" class="overlay soft hidden">
      <div class="loader-box">
        ${mascotSvg('bounce')}
        <div id="loader-title" class="loader-title">准备开玩啦！</div>
        <div id="loader-steps" class="loader-steps">
          <div class="step"><span>📷 摄像头</span><b id="step-cam">请点「允许」</b></div>
          <div class="step"><span id="step-model-label">🧠 小手识别</span><b id="step-model">下载中</b></div>
        </div>
        <div id="loader-bar" class="progress-bar"><div id="loader-fill" class="progress-fill"></div></div>
        <div id="loader-pct" class="loader-pct">0%</div>
      </div>
    </div>

    <!-- Ready card (direct open / refresh of /play/<id>) -->
    <div id="ready" class="overlay soft hidden">
      <div id="ready-card" class="ready-card">
        <div id="ready-icon" class="game-icon ready-icon"></div>
        <h2 id="ready-title" class="ready-title"></h2>
        <p id="ready-desc" class="ready-desc"></p>
        <ul id="ready-howto" class="howto-list"></ul>
        <div id="ready-tags" class="game-tags ready-tags"></div>
        <button id="ready-start" class="btn btn-primary btn-start">▶ 开始</button>
        <button id="ready-home" class="btn-link">🏠 回大厅</button>
      </div>
    </div>

    <!-- In-game How-to-Play Modal -->
    <div id="help-modal" class="overlay soft hidden">
      <div id="help-card" class="ready-card">
        <div id="help-icon" class="game-icon ready-icon"></div>
        <h2 id="help-title" class="ready-title"></h2>
        <div class="howto-heading">💡 怎么玩</div>
        <ul id="help-list" class="howto-list"></ul>
        <button id="help-close" class="btn btn-primary btn-start">👌 知道了，继续玩</button>
      </div>
    </div>

    <!-- Camera / start error -->
    <div id="cam-error" class="overlay soft hidden">
      <div class="loader-box">
        ${mascotSvg('bounce')}
        <div id="err-title" class="loader-title"></div>
        <div id="err-msg" class="error-msg"></div>
        <div class="btn-col">
          <button id="err-retry" class="btn btn-primary"></button>
          <button id="err-home" class="btn btn-ghost">🏠 回大厅</button>
        </div>
      </div>
    </div>

    <div id="sensor-prompt" class="sensor-prompt hidden"></div>
    <div id="countdown" class="countdown hidden"><span id="countdown-num" class="countdown-num"></span></div>

    <!-- Result -->
    <div id="result" class="overlay soft hidden">
      <div id="confetti" class="confetti" aria-hidden="true"></div>
      <div id="result-card" class="result-card">
        ${mascotSvg('cheer')}
        <div id="res-headline" class="res-headline">玩得真好！</div>
        <div id="res-title" class="res-title">闪电结印</div>
        <div id="res-score" class="result-score">0</div>
        <div id="res-record" class="new-record" style="display:none">🏆 新纪录！</div>
        <div id="res-snapshot-wrap" class="snapshot-wrap" style="display:none">
          <img id="res-snapshot" class="snapshot-img" alt="破功瞬间抓拍" />
          <a id="res-download" class="btn btn-snapshot" download="handplay-snapshot.jpg">📸 保存破功照</a>
        </div>
        <div id="res-stats" class="stat-grid"></div>
        <div class="btn-row">
          <button id="res-home" class="btn btn-ghost">🏠 换个游戏</button>
          <button id="res-again" class="btn btn-primary">🔁 再来一局</button>
        </div>
      </div>
    </div>
  </div>
`;
