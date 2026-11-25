import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { type CoverTransform, getCoverTransform } from './camera';
import { classifyHandGesture, type HandState, type Point2D } from './gestures';
import { OneEuroFilterArray } from './oneEuro';
import { createHandLandmarker, type DelegateKind, type VisionLoadState } from './visionAssets';

export type { DelegateKind, VisionLoadState } from './visionAssets';

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
/** A hand counts as lost after this long without a detection (shared with FaceEngine). */
export const LOST_MS = 300;
/** Palm moving farther than this fraction of min(w, h) in one frame is treated as a new hand. */
const JUMP_FRAC = 0.3;

type Side = 'left' | 'right';

interface HandTrackerSlot {
  filter: OneEuroFilterArray;
  rawBuf: Float32Array;
  outBuf: Float32Array;
  pinching: boolean;
  lastSeenAt: number;
  palm: Point2D | null;
  side: Side;
  track: number;
  state: HandState;
}

function createSlot(side: Side): HandTrackerSlot {
  return {
    filter: new OneEuroFilterArray(42, 1.25, 4.2, 1.0),
    rawBuf: new Float32Array(42),
    outBuf: new Float32Array(42),
    pinching: false,
    lastSeenAt: 0,
    palm: null,
    side,
    track: 0,
    state: { ...EMPTY_HAND },
  };
}

function rawPalm(lm: NormalizedLandmark[], cover: CoverTransform): Point2D {
  return {
    x: cover.offsetX + (1 - (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5) * cover.renderedW,
    y: cover.offsetY + ((lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5) * cover.renderedH,
  };
}

export class HandEngine {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private numHands: 1 | 2 = 1;

  private slots: [HandTrackerSlot, HandTrackerSlot] = [createSlot('left'), createSlot('right')];
  private trackSeq = 0;

  private lastVideoTime = -1;
  private lastTs = 0;
  private fpsTimes: number[] = [];

  /** Primary hand (hands[0]), kept for backward compatibility with single-hand games. */
  public state: HandState = { ...EMPTY_HAND };
  /** All currently tracked hands, ordered by stable side label (left first). */
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

  /** Bind the (camera-gated) video element and make sure the model is loaded. */
  async init(videoEl: HTMLVideoElement): Promise<void> {
    this.video = videoEl;
    await this.preload();
    this.ready = true;
  }

  /** Switch dynamically between 1-hand and 2-hand tracking without reloading WASM/model. */
  async setNumHands(num: 1 | 2): Promise<void> {
    if (this.numHands === num) return;
    this.numHands = num;
    if (num === 1) this.clearSlot(this.slots[1]);
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
      if (this.expireSlots(now, [false, false])) this.syncOutputs();
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
    const cover = getCoverTransform(video, viewportW, viewportH);
    const items = detected.map((lm) => ({ lm, palm: rawPalm(lm, cover) }));
    const limit = Math.min(viewportW, viewportH) * JUMP_FRAC;

    const assignment = this.assign(items.map((it) => it.palm), limit);
    const used: [boolean, boolean] = [false, false];
    const fresh: number[] = [];
    assignment.forEach((slotIdx, itemIdx) => {
      const slot = this.slots[slotIdx];
      const item = items[itemIdx];
      const isFresh = !slot.state.present || !slot.palm || Math.hypot(item.palm.x - slot.palm.x, item.palm.y - slot.palm.y) > limit;
      if (isFresh) {
        slot.filter.reset();
        slot.pinching = false;
        slot.track = ++this.trackSeq;
        fresh.push(slotIdx);
      }
      slot.palm = item.palm;
      this.updateSlot(slot, item.lm, cover, dtSec, now);
      used[slotIdx] = true;
    });

    this.expireSlots(now, used);
    if (fresh.length) this.labelSides(fresh, viewportW);
    this.syncOutputs();
    return this.state;
  }

  /** Nearest-previous-palm matching; unmatched or far-away detections become new acquisitions. */
  private assign(palms: Point2D[], limit: number): number[] {
    if (palms.length === 0) return [];
    if (this.numHands === 1) return [0];
    const penalty = limit * 1.5;
    const cost = (p: Point2D, idx: number) => {
      const slot = this.slots[idx];
      if (!slot.state.present || !slot.palm) return penalty;
      const d = Math.hypot(p.x - slot.palm.x, p.y - slot.palm.y);
      return d <= limit ? d : penalty;
    };
    if (palms.length === 1) {
      return [cost(palms[0], 1) < cost(palms[0], 0) ? 1 : 0];
    }
    const straight = cost(palms[0], 0) + cost(palms[1], 1);
    const swapped = cost(palms[0], 1) + cost(palms[1], 0);
    return swapped < straight ? [1, 0] : [0, 1];
  }

  private labelSides(fresh: number[], viewportW: number) {
    const [s0, s1] = this.slots;
    const bothPresent = this.numHands === 2 && s0.state.present && s1.state.present && s0.palm && s1.palm;
    if (bothPresent) {
      const leftIsS0 = s0.palm!.x <= s1.palm!.x;
      s0.side = leftIsS0 ? 'left' : 'right';
      s1.side = leftIsS0 ? 'right' : 'left';
    } else {
      for (const idx of fresh) {
        const slot = this.slots[idx];
        slot.side = slot.palm && slot.palm.x < viewportW / 2 ? 'left' : 'right';
      }
    }
    for (const slot of this.slots) {
      if (slot.state.present) slot.state = { ...slot.state, side: slot.side, track: slot.track };
    }
  }

  private expireSlots(now: number, used: [boolean, boolean]): boolean {
    let changed = false;
    this.slots.forEach((slot, idx) => {
      if (!used[idx] && slot.state.present && now - slot.lastSeenAt > LOST_MS) {
        this.clearSlot(slot);
        changed = true;
      }
    });
    return changed;
  }

  private updateSlot(
    slot: HandTrackerSlot,
    lm: NormalizedLandmark[],
    cover: CoverTransform,
    dtSec: number,
    now: number,
  ) {
    slot.lastSeenAt = now;

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
      track: slot.track,
      side: slot.side,
    };
  }

  private clearSlot(slot: HandTrackerSlot) {
    slot.pinching = false;
    slot.palm = null;
    slot.filter.reset();
    slot.state = { ...EMPTY_HAND };
  }

  private syncOutputs() {
    const active: HandState[] = [];
    if (this.slots[0].state.present) active.push(this.slots[0].state);
    if (this.numHands === 2 && this.slots[1].state.present) active.push(this.slots[1].state);
    active.sort((a, b) => (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1));
    this.hands = active;
    this.state = active[0] ?? { ...EMPTY_HAND };
  }

  /** Drop all tracked hands and filters so no state leaks across games, restarts or resumes. */
  resetTracking() {
    this.clearSlot(this.slots[0]);
    this.clearSlot(this.slots[1]);
    this.lastVideoTime = -1;
    this.lastTs = 0;
    this.syncOutputs();
  }
}
