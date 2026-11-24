export interface CoverTransform {
  renderedW: number;
  renderedH: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Exact coordinate transform matching `<video style="object-fit: cover; transform: scaleX(-1)">`.
 * Maps normalized landmark `(lm.x, lm.y)` to mirrored CSS pixels:
 * `x = offsetX + (1 - lm.x) * renderedW`, `y = offsetY + lm.y * renderedH`.
 */
export function getCoverTransform(
  video: HTMLVideoElement,
  viewportW: number,
  viewportH: number,
): CoverTransform {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.max(viewportW / vw, viewportH / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  return {
    renderedW,
    renderedH,
    offsetX: (viewportW - renderedW) / 2,
    offsetY: (viewportH - renderedH) / 2,
  };
}

/**
 * Shared front-facing camera stream manager.
 * Opens the camera once and keeps it alive across hand/face game switches
 * so mobile browsers never prompt for camera permission repeatedly.
 */
export class CameraManager {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private openPromise: Promise<HTMLVideoElement> | null = null;

  get ready(): boolean {
    return Boolean(this.stream && this.video && this.video.readyState >= 2);
  }

  get videoEl(): HTMLVideoElement | null {
    return this.video;
  }

  async ensureOpen(videoEl: HTMLVideoElement): Promise<HTMLVideoElement> {
    this.video = videoEl;

    if (this.stream && this.stream.active) {
      if (videoEl.srcObject !== this.stream) {
        videoEl.srcObject = this.stream;
      }
      if (videoEl.paused) {
        await videoEl.play().catch(() => undefined);
      }
      return videoEl;
    }

    if (!this.openPromise) {
      this.openPromise = this.openStream(videoEl).catch((err) => {
        this.openPromise = null;
        throw err;
      });
    }
    return this.openPromise;
  }

  private async openStream(videoEl: HTMLVideoElement): Promise<HTMLVideoElement> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持摄像头，请用 Safari 或 Chrome 打开（需 HTTPS）。');
    }

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
      if (videoEl.readyState >= 2) {
        done();
        return;
      }
      videoEl.addEventListener('loadeddata', done, { once: true });
      videoEl.play().catch((err) => {
        console.warn('[CameraManager] video.play warning:', err);
        if (videoEl.readyState >= 2) done();
        else reject(new Error('摄像头视频流未能开始播放，请点一下屏幕重试。'));
      });
    });

    return videoEl;
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.openPromise = null;
    if (this.video) this.video.srcObject = null;
  }
}
