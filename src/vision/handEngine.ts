import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { classifyHandGesture, type HandState, type Point2D } from './gestures';
import { OneEuroFilterArray } from './oneEuro';

export type DelegateKind = 'GPU' | 'CPU';

export interface VisionStats {
  fps: number;
  delegate: DelegateKind;
}

const EMPTY_HAND: HandState = {
  present: false,
  pts: [],
  palmPx: 1,
  gesture: 'none',
  fingers: 0,
  pinchPos: { x: 0, y: 0 },
  pinchRatio: 9,
  pinching: false,
  indexTip: { x: 0, y: 0 },
  palmCenter: { x: 0, y: 0 },
};

const PINCH_ON_RATIO = 0.36;
const PINCH_OFF_RATIO = 0.48;

export class HandEngine {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private delegate: DelegateKind = 'GPU';

  private filter = new OneEuroFilterArray(42, 1.6, 5.2, 1.2);
  private rawBuf = new Float32Array(42);
  private outBuf = new Float32Array(42);

  private lastVideoTime = -1;
  private lastTs = 0;
  private lastSeenAt = 0;
  private pinching = false;
  private fpsTimes: number[] = [];

  public state: HandState = { ...EMPTY_HAND };
  public stats: VisionStats = { fps: 0, delegate: 'GPU' };
  public ready = false;

  async init(
    videoEl: HTMLVideoElement,
    onProgress?: (label: string, pct: number) => void,
  ): Promise<void> {
    this.video = videoEl;

    if (!this.stream) {
      onProgress?.('正在打开前置摄像头…', 15);
      await this.openCamera(videoEl);
    } else if (videoEl.srcObject !== this.stream) {
      videoEl.srcObject = this.stream;
      await videoEl.play().catch(() => undefined);
    }

    if (!this.landmarker) {
      onProgress?.('正在加载 AI 手势引擎（约 18MB，首次加载后离线缓存）…', 40);
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      onProgress?.('正在初始化手部识别模型…', 75);

      const create = (delegate: DelegateKind) =>
        HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate,
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.48,
          minHandPresenceConfidence: 0.48,
          minTrackingConfidence: 0.48,
        });

      try {
        this.landmarker = await create('GPU');
        this.delegate = 'GPU';
      } catch (err) {
        console.warn('[HandEngine] GPU unavailable, falling back to CPU:', err);
        this.landmarker = await create('CPU');
        this.delegate = 'CPU';
      }
      this.stats.delegate = this.delegate;
    }

    onProgress?.('准备就绪！', 100);
    this.ready = true;
  }

  private async openCamera(videoEl: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持摄像头，请用 Safari 或 Chrome 打开（需 HTTPS）。');
    }

    // Request portrait-friendly resolution on mobile
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotAllowedError') {
        throw new Error('摄像头权限被拒绝，请在浏览器地址栏设置里允许使用摄像头后刷新。');
      }
      if (err.name === 'NotFoundError') {
        throw new Error('未检测到可用摄像头。');
      }
      throw new Error(`无法打开摄像头：${err.message || err.name}`);
    }

    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    videoEl.srcObject = this.stream;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => resolve(), 3500);
      const done = () => {
        window.clearTimeout(timer);
        resolve();
      };
      videoEl.addEventListener('loadeddata', done, { once: true });
      videoEl.play().catch((err) => {
        // iOS Safari sometimes resolves on next user gesture; keep going if readyState advances
        console.warn('[HandEngine] video.play warning:', err);
        if (videoEl.readyState >= 2) done();
        else reject(new Error('摄像头视频流未能开始播放，请点一下屏幕重试。'));
      });
    });
  }

  /**
   * Run inference if a fresh video frame has arrived and update screen-space HandState.
   * Mirrors coordinates to exactly align with `<video style="object-fit: cover; transform: scaleX(-1)">`.
   */
  update(viewportW: number, viewportH: number): HandState {
    const video = this.video;
    const landmarker = this.landmarker;
    if (!this.ready || !video || !landmarker || video.readyState < 2) {
      return this.state;
    }

    const now = performance.now();
    if (video.currentTime === this.lastVideoTime) {
      // Keep brief grace period if hand hasn't been updated yet
      if (this.state.present && now - this.lastSeenAt > 350) {
        this.clearHand();
      }
      return this.state;
    }

    const dtSec = this.lastTs > 0 ? (now - this.lastTs) / 1000 : 1 / 30;
    this.lastVideoTime = video.currentTime;
    const ts = now <= this.lastTs ? this.lastTs + 1 : now;
    this.lastTs = ts;

    let result;
    try {
      result = landmarker.detectForVideo(video, ts);
    } catch (err) {
      console.warn('[HandEngine] detectForVideo error:', err);
      return this.state;
    }

    // Track actual vision FPS
    this.fpsTimes.push(ts);
    while (this.fpsTimes.length && ts - this.fpsTimes[0] > 1000) {
      this.fpsTimes.shift();
    }
    this.stats.fps = this.fpsTimes.length;

    const lm = result.landmarks?.[0];
    if (!lm || lm.length < 21) {
      if (now - this.lastSeenAt > 220) {
        this.clearHand();
      }
      return this.state;
    }

    // Exact object-fit: cover + horizontal mirror mapping
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.max(viewportW / vw, viewportH / vh);
    const renderedW = vw * scale;
    const renderedH = vh * scale;
    const offsetX = (viewportW - renderedW) / 2;
    const offsetY = (viewportH - renderedH) / 2;

    if (now - this.lastSeenAt > 300) {
      this.filter.reset();
    }
    this.lastSeenAt = now;

    for (let i = 0; i < 21; i++) {
      this.rawBuf[i * 2] = offsetX + (1 - lm[i].x) * renderedW;
      this.rawBuf[i * 2 + 1] = offsetY + lm[i].y * renderedH;
    }

    this.filter.filter(this.rawBuf, this.outBuf, dtSec);

    const pts: Point2D[] = new Array(21);
    for (let i = 0; i < 21; i++) {
      pts[i] = { x: this.outBuf[i * 2], y: this.outBuf[i * 2 + 1] };
    }

    const { gesture, fingers, palmPx, pinchRatio } = classifyHandGesture(pts);

    // Hysteresis pinch state
    if (!this.pinching && pinchRatio < PINCH_ON_RATIO) {
      this.pinching = true;
    } else if (this.pinching && pinchRatio > PINCH_OFF_RATIO) {
      this.pinching = false;
    }

    const pinchPos: Point2D = {
      x: (pts[4].x + pts[8].x) * 0.5,
      y: (pts[4].y + pts[8].y) * 0.5,
    };

    const palmCenter: Point2D = {
      x: (pts[0].x + pts[5].x + pts[9].x + pts[13].x + pts[17].x) / 5,
      y: (pts[0].y + pts[5].y + pts[9].y + pts[13].y + pts[17].y) / 5,
    };

    this.state = {
      present: true,
      pts,
      palmPx,
      gesture,
      fingers,
      pinchPos,
      pinchRatio,
      pinching: this.pinching,
      indexTip: pts[8],
      palmCenter,
    };

    return this.state;
  }

  private clearHand() {
    this.pinching = false;
    this.filter.reset();
    this.state = { ...EMPTY_HAND };
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.ready = false;
    this.clearHand();
  }
}
