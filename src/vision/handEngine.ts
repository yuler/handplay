import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { type CameraManager, getCoverTransform } from './camera';
import { classifyHandGesture, type HandState, type Point2D } from './gestures';
import { OneEuroFilterArray } from './oneEuro';
import { createHandLandmarker, type DelegateKind, type VisionLoadState } from './visionAssets';

export type { DelegateKind, VisionLoadState } from './visionAssets';

export interface InitProgress {
  cameraReady: boolean;
  load: VisionLoadState;
}

export interface VisionStats {
  fps: number;
  delegate: DelegateKind;
}

export const EMPTY_HAND: HandState = {
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

interface HandTrackerSlot {
  filter: OneEuroFilterArray;
  rawBuf: Float32Array;
  outBuf: Float32Array;
  pinching: boolean;
  lastSeenAt: number;
  lastCenterX: number;
  state: HandState;
}

function createSlot(): HandTrackerSlot {
  return {
    filter: new OneEuroFilterArray(42, 1.6, 5.2, 1.2),
    rawBuf: new Float32Array(42),
    outBuf: new Float32Array(42),
    pinching: false,
    lastSeenAt: 0,
    lastCenterX: -1,
    state: { ...EMPTY_HAND },
  };
}

export class HandEngine {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private numHands: 1 | 2 = 1;

  private slots: [HandTrackerSlot, HandTrackerSlot] = [createSlot(), createSlot()];

  private lastVideoTime = -1;
  private lastTs = 0;
  private fpsTimes: number[] = [];

  /** Primary hand (hands[0]), kept for backward compatibility with single-hand games. */
  public state: HandState = { ...EMPTY_HAND };
  /** All currently tracked hands, sorted left-to-right by screen X. */
  public hands: HandState[] = [];
  public stats: VisionStats = { fps: 0, delegate: 'GPU' };
  public ready = false;
  public load: VisionLoadState = { stage: 'idle', loaded: 0, total: 1 };

  private loadPromise: Promise<void> | null = null;
  private loadListeners = new Set<(s: VisionLoadState) => void>();

  onLoadChange(fn: (s: VisionLoadState) => void): () => void {
    this.loadListeners.add(fn);
    fn(this.load);
    return () => this.loadListeners.delete(fn);
  }

  private setLoad(s: VisionLoadState) {
    this.load = s;
    this.loadListeners.forEach((fn) => fn(s));
  }

  /** Download + build the HandLandmarker without touching the camera. Safe to call repeatedly. */
  preload(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = createHandLandmarker((s) => this.setLoad(s), this.numHands)
        .then(({ landmarker, delegate }) => {
          this.landmarker = landmarker;
          this.stats.delegate = delegate;
          this.setLoad({ ...this.load, stage: 'ready' });
        })
        .catch((err) => {
          this.loadPromise = null;
          this.setLoad({ ...this.load, stage: 'error' });
          throw err;
        });
    }
    return this.loadPromise;
  }

  /** Opens shared camera + ensures hand model is loaded in parallel. */
  async init(
    camera: CameraManager,
    videoEl: HTMLVideoElement,
    onProgress?: (p: InitProgress) => void,
  ): Promise<void> {
    this.video = videoEl;
    let cameraReady = camera.ready;
    const report = () => onProgress?.({ cameraReady, load: this.load });
    const unsubscribe = this.onLoadChange(report);

    const camTask = (async () => {
      await camera.ensureOpen(videoEl);
      cameraReady = true;
      report();
    })();

    try {
      await Promise.all([camTask, this.preload()]);
    } finally {
      unsubscribe();
    }
    this.ready = true;
  }

  /** Switch dynamically between 1-hand and 2-hand tracking without reloading WASM/model. */
  async setNumHands(num: 1 | 2): Promise<void> {
    if (this.numHands === num) return;
    this.numHands = num;
    if (num === 1) {
      this.clearSlot(this.slots[1]);
    }
    if (this.landmarker) {
      await this.landmarker.setOptions({ numHands: num });
    }
  }

  /**
   * Run inference if a fresh video frame has arrived and update screen-space hands.
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
      let changed = false;
      for (const slot of this.slots) {
        if (slot.state.present && now - slot.lastSeenAt > 350) {
          this.clearSlot(slot);
          changed = true;
        }
      }
      if (changed) this.syncOutputs();
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

    this.fpsTimes.push(ts);
    while (this.fpsTimes.length && ts - this.fpsTimes[0] > 1000) {
      this.fpsTimes.shift();
    }
    this.stats.fps = this.fpsTimes.length;

    const detected = (result.landmarks ?? []).filter((lm) => lm && lm.length >= 21).slice(0, this.numHands);
    if (detected.length === 0) {
      for (const slot of this.slots) {
        if (slot.state.present && now - slot.lastSeenAt > 220) {
          this.clearSlot(slot);
        }
      }
      this.syncOutputs();
      return this.state;
    }

    const cover = getCoverTransform(video, viewportW, viewportH);

    // Compute raw mirrored palm X for each detected hand so we match to filter slots consistently
    const detItems = detected.map((lm) => {
      const palmX =
        cover.offsetX +
        (1 - (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5) * cover.renderedW;
      return { lm, palmX };
    });

    const assignedSlots = new Set<number>();

    if (this.numHands === 1 || detItems.length === 1) {
      const item = detItems[0];
      // Pick closest active slot (or slot 0 if neither active)
      let targetIdx = 0;
      if (this.numHands === 2) {
        const s0 = this.slots[0];
        const s1 = this.slots[1];
        if (s0.state.present && s1.state.present) {
          targetIdx =
            Math.abs(item.palmX - s0.lastCenterX) <= Math.abs(item.palmX - s1.lastCenterX) ? 0 : 1;
        } else if (s1.state.present && !s0.state.present && Math.abs(item.palmX - s1.lastCenterX) < 160) {
          targetIdx = 1;
        }
      }
      this.updateSlot(this.slots[targetIdx], item.lm, item.palmX, cover, dtSec, now);
      assignedSlots.add(targetIdx);
    } else {
      // 2 hands detected: choose assignment minimizing total screen-X jump from previous slots
      const [d0, d1] = detItems;
      const s0 = this.slots[0];
      const s1 = this.slots[1];
      let pairNormal = true;
      if (s0.lastCenterX >= 0 && s1.lastCenterX >= 0) {
        const costNormal =
          Math.abs(d0.palmX - s0.lastCenterX) + Math.abs(d1.palmX - s1.lastCenterX);
        const costSwap =
          Math.abs(d0.palmX - s1.lastCenterX) + Math.abs(d1.palmX - s0.lastCenterX);
        pairNormal = costNormal <= costSwap;
      } else {
        // Default: leftmost hand -> slot 0, rightmost hand -> slot 1
        pairNormal = d0.palmX <= d1.palmX;
      }

      if (pairNormal) {
        this.updateSlot(s0, d0.lm, d0.palmX, cover, dtSec, now);
        this.updateSlot(s1, d1.lm, d1.palmX, cover, dtSec, now);
      } else {
        this.updateSlot(s0, d1.lm, d1.palmX, cover, dtSec, now);
        this.updateSlot(s1, d0.lm, d0.palmX, cover, dtSec, now);
      }
      assignedSlots.add(0);
      assignedSlots.add(1);
    }

    // Expire any unassigned slot past grace period
    for (let idx = 0; idx < 2; idx++) {
      if (!assignedSlots.has(idx)) {
        const slot = this.slots[idx];
        if (slot.state.present && now - slot.lastSeenAt > 220) {
          this.clearSlot(slot);
        }
      }
    }

    this.syncOutputs();
    return this.state;
  }

  private updateSlot(
    slot: HandTrackerSlot,
    lm: NormalizedLandmark[],
    rawPalmX: number,
    cover: { renderedW: number; renderedH: number; offsetX: number; offsetY: number },
    dtSec: number,
    now: number,
  ) {
    if (now - slot.lastSeenAt > 300) {
      slot.filter.reset();
    }
    slot.lastSeenAt = now;
    slot.lastCenterX = rawPalmX;

    for (let i = 0; i < 21; i++) {
      slot.rawBuf[i * 2] = cover.offsetX + (1 - lm[i].x) * cover.renderedW;
      slot.rawBuf[i * 2 + 1] = cover.offsetY + lm[i].y * cover.renderedH;
    }

    slot.filter.filter(slot.rawBuf, slot.outBuf, dtSec);

    const pts: Point2D[] = new Array(21);
    for (let i = 0; i < 21; i++) {
      pts[i] = { x: slot.outBuf[i * 2], y: slot.outBuf[i * 2 + 1] };
    }

    const { gesture, fingers, palmPx, pinchRatio } = classifyHandGesture(pts);

    if (!slot.pinching && pinchRatio < PINCH_ON_RATIO) {
      slot.pinching = true;
    } else if (slot.pinching && pinchRatio > PINCH_OFF_RATIO) {
      slot.pinching = false;
    }

    const pinchPos: Point2D = {
      x: (pts[4].x + pts[8].x) * 0.5,
      y: (pts[4].y + pts[8].y) * 0.5,
    };

    const palmCenter: Point2D = {
      x: (pts[0].x + pts[5].x + pts[9].x + pts[13].x + pts[17].x) / 5,
      y: (pts[0].y + pts[5].y + pts[9].y + pts[13].y + pts[17].y) / 5,
    };

    slot.state = {
      present: true,
      pts,
      palmPx,
      gesture,
      fingers,
      pinchPos,
      pinchRatio,
      pinching: slot.pinching,
      indexTip: pts[8],
      palmCenter,
    };
  }

  private clearSlot(slot: HandTrackerSlot) {
    slot.pinching = false;
    slot.lastCenterX = -1;
    slot.filter.reset();
    slot.state = { ...EMPTY_HAND };
  }

  private syncOutputs() {
    const active: HandState[] = [];
    if (this.slots[0].state.present) active.push(this.slots[0].state);
    if (this.numHands === 2 && this.slots[1].state.present) active.push(this.slots[1].state);
    // Sort left-to-right by screen X
    active.sort((a, b) => a.palmCenter.x - b.palmCenter.x);
    this.hands = active;
    this.state = active[0] ?? { ...EMPTY_HAND };
  }

  resetTracking() {
    this.clearSlot(this.slots[0]);
    this.clearSlot(this.slots[1]);
    this.syncOutputs();
  }
}
