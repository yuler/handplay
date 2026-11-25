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

export type CameraErrorKind = 'unsupported' | 'denied' | 'not-found' | 'busy' | 'no-frames';

export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    detail = '',
  ) {
    super(detail ? `${kind}: ${detail}` : kind);
    this.name = 'CameraError';
  }
}

const FRESH_FRAME_TIMEOUT_MS = 4000;
const REUSE_FRAME_TIMEOUT_MS = 1800;
const KEEP_ALIVE_MS = 60_000;

function mapMediaError(e: unknown): CameraError {
  const name = (e as DOMException)?.name ?? '';
  const msg = (e as Error)?.message ?? String(e);
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return new CameraError('denied', msg);
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return new CameraError('not-found', msg);
  }
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return new CameraError('busy', msg);
  }
  if (name === 'TypeError') return new CameraError('unsupported', msg);
  return new CameraError('busy', msg);
}

function whenVisible(): Promise<void> {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise((resolve) => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVis);
      resolve();
    };
    document.addEventListener('visibilitychange', onVis);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/**
 * Camera gate: every game entry goes through `ensureReady`. Opens the front camera once per visit,
 * reuses the stream across games, and only resolves after real, advancing frames are seen.
 */
export class CameraManager {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private pending: Promise<void> | null = null;
  private stale = false;
  private stopTimer = 0;

  /** Cheap synchronous health check (no frame-advance proof). */
  get live(): boolean {
    const v = this.video;
    return Boolean(
      this.streamUsable() && v && v.srcObject === this.stream && !v.paused && v.readyState >= 2 && v.videoWidth > 0,
    );
  }

  ensureReady(videoEl: HTMLVideoElement): Promise<void> {
    this.cancelStop();
    if (!this.pending) {
      this.pending = this.run(videoEl).finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /** Called when leaving games; entering another game within the window reuses the stream. */
  scheduleStop(ms = KEEP_ALIVE_MS) {
    this.cancelStop();
    if (!this.stream) return;
    this.stopTimer = window.setTimeout(() => this.stop(), ms);
  }

  cancelStop() {
    window.clearTimeout(this.stopTimer);
    this.stopTimer = 0;
  }

  stop() {
    this.cancelStop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.stale = false;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  private streamUsable(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    return Boolean(this.stream?.active && track && track.readyState === 'live' && !this.stale);
  }

  private async run(videoEl: HTMLVideoElement) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraError('unsupported', 'getUserMedia unavailable or insecure context');
    }
    this.video = videoEl;
    await whenVisible();

    if (this.streamUsable()) {
      try {
        await this.attachAndVerify(videoEl, REUSE_FRAME_TIMEOUT_MS);
        return;
      } catch (err) {
        console.warn('[Camera] reused stream not delivering frames, reopening:', err);
        this.stop();
        this.video = videoEl;
      }
    } else if (this.stream) {
      this.stop();
      this.video = videoEl;
    }

    await this.open();
    await this.attachAndVerify(videoEl, FRESH_FRAME_TIMEOUT_MS);
  }

  private async open() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });
    } catch (e) {
      throw mapMediaError(e);
    }
    this.stream = stream;
    this.stale = false;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (this.stream === stream) this.stale = true;
      });
    }
  }

  private async attachAndVerify(videoEl: HTMLVideoElement, timeoutMs: number) {
    const stream = this.stream!;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    if (videoEl.srcObject !== stream) videoEl.srcObject = stream;

    // play() can stay pending forever on a stream that never delivers a frame
    const play = () =>
      Promise.race([
        videoEl.play(),
        sleep(timeoutMs).then(() => {
          throw new CameraError('no-frames', 'video.play timed out');
        }),
      ]);
    if (videoEl.paused) {
      try {
        await play();
      } catch (first) {
        if (first instanceof CameraError) throw first;
        console.warn('[Camera] video.play failed, retrying once:', first);
        await sleep(150);
        try {
          await play();
        } catch (e) {
          if (e instanceof CameraError) throw e;
          const name = (e as DOMException)?.name;
          throw new CameraError(name === 'NotAllowedError' ? 'no-frames' : 'busy', (e as Error)?.message);
        }
      }
    }

    await this.waitForFrames(videoEl, stream, timeoutMs);
  }

  private waitForFrames(video: HTMLVideoElement, stream: MediaStream, timeoutMs: number): Promise<void> {
    const track = stream.getVideoTracks()[0];
    const healthy = () =>
      stream.active &&
      track?.readyState === 'live' &&
      !this.stale &&
      !video.paused &&
      video.videoWidth > 0;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let frames = 0;
      let lastTime = video.currentTime;
      let pollId = 0;

      const finish = (err?: CameraError) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.clearInterval(pollId);
        if (err) reject(err);
        else resolve();
      };
      const timer = window.setTimeout(() => finish(new CameraError('no-frames', 'no frames within timeout')), timeoutMs);

      if ('requestVideoFrameCallback' in video) {
        const onFrame = () => {
          if (settled) return;
          if (healthy() && ++frames >= 2) finish();
          else video.requestVideoFrameCallback(onFrame);
        };
        video.requestVideoFrameCallback(onFrame);
      } else {
        pollId = window.setInterval(() => {
          const t = (video as HTMLVideoElement).currentTime;
          if (t !== lastTime && healthy()) frames++;
          lastTime = t;
          if (frames >= 2) finish();
        }, 40);
      }
    });
  }
}
