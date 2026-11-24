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
        <button id="btn-dim" class="icon-btn" aria-label="调暗摄像头画面">🌗</button>
        <button id="btn-mute" class="icon-btn" aria-label="静音开关">🔊</button>
      </div>
    </div>
    <div id="fps-tag" class="fps-tag" style="display:none"></div>

    <!-- Lobby -->
    <div id="lobby" class="overlay lobby">
      <div class="brand">
        ${mascotSvg('wave')}
        <h1>手手玩</h1>
        <p class="brand-sub">HandPlay · 对着镜头 隔空玩</p>
      </div>
      <div class="card-list">
        <button class="game-card rush" data-game="gesture-rush">
          <span id="best-rush" class="best-sticker">🏆 0</span>
          <div class="game-icon">✌️</div>
          <div class="game-meta">
            <h2>闪电结印</h2>
            <p>看图比手势，越快分越高！连对 5 次狂热翻倍，还有手指算术题～</p>
            <div class="game-tags">
              <span class="mini-tag">⏱ 45 秒</span>
              <span class="mini-tag">✊☝️✌️🖐️👍👌</span>
              <span class="mini-tag">🧮 心算</span>
            </div>
          </div>
        </button>

        <button class="game-card sling" data-game="air-slingshot">
          <span id="best-sling" class="best-sticker">🏆 0</span>
          <div class="game-icon">🤏</div>
          <div class="game-meta">
            <h2>空气弹弓</h2>
            <p>捏住拇指和食指往回拉，松手发射！打靶子和 ⭐，别碰 💣</p>
            <div class="game-tags">
              <span class="mini-tag">⏱ 60 秒</span>
              <span class="mini-tag">🤏 捏合拉弓</span>
              <span class="mini-tag">🎯 一发多中</span>
            </div>
          </div>
        </button>
      </div>
      <div id="prefetch-chip" class="prefetch-chip">🧠 正在准备小手识别…</div>
      <p class="privacy-note">
        给家长：一手拿手机，让孩子对着前置摄像头玩。<br/>
        🔒 画面只在这台手机里识别，不会上传。
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
        <div id="loader-error" class="error-msg" style="display:none"></div>
        <button id="loader-back" class="btn btn-primary" style="display:none;width:100%">🏠 回到大厅</button>
      </div>
    </div>

    <!-- Result -->
    <div id="result" class="overlay soft hidden">
      <div id="confetti" class="confetti" aria-hidden="true"></div>
      <div id="result-card" class="result-card">
        ${mascotSvg('cheer')}
        <div id="res-headline" class="res-headline">玩得真好！</div>
        <div id="res-title" class="res-title">闪电结印</div>
        <div id="res-score" class="result-score">0</div>
        <div id="res-record" class="new-record" style="display:none">🏆 新纪录！</div>
        <div id="res-stats" class="stat-grid"></div>
        <div class="btn-row">
          <button id="res-home" class="btn btn-ghost">🏠 换个游戏</button>
          <button id="res-again" class="btn btn-primary">🔁 再来一局</button>
        </div>
      </div>
    </div>
  </div>
`;
