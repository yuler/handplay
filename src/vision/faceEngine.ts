import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { DEBUG } from '../debug';
import { getCoverTransform } from './camera';
import type { Point2D } from './gestures';
import { LOST_MS, type VisionStats } from './handEngine';
import { OneEuroFilterArray } from './oneEuro';
import { createFaceLandmarker, type VisionLoadState } from './visionAssets';

export interface FaceState {
  present: boolean;
  nosePos: Point2D;
  mouthPos: Point2D;
  /** Screen-left eye center (CSS px, mirrored) */
  leftEyePos: Point2D;
  /** Screen-right eye center (CSS px, mirrored) */
  rightEyePos: Point2D;
  /** Distance between temples/cheekbones in screen px */
  faceWidth: number;
  /** Face oval contour points (only filled in debug mode) */
  contour: Point2D[];
  /** Head roll (tilt left/right), normalized -1..1 (positive = tilted right on screen) */
  roll: number;
  /** Head yaw (turn left/right), normalized -1..1 (positive = facing right on screen) */
  yaw: number;
  /** Head pitch (tilt up/down), normalized -1..1 (positive = looking down) */
  pitch: number;
  /** Smoothed ARKit blendshapes (0..1) */
  jawOpen: number;
  blinkL: number;
  blinkR: number;
  smile: number;
  cheekPuff: number;
  browUp: number;
}

export const EMPTY_FACE: FaceState = {
  present: false,
  nosePos: { x: 0, y: 0 },
  mouthPos: { x: 0, y: 0 },
  leftEyePos: { x: 0, y: 0 },
  rightEyePos: { x: 0, y: 0 },
  faceWidth: 120,
  contour: [],
  roll: 0,
  yaw: 0,
  pitch: 0,
  jawOpen: 0,
  blinkL: 0,
  blinkR: 0,
  smile: 0,
  cheekPuff: 0,
  browUp: 0,
};

// MediaPipe FaceMesh face oval, in perimeter order
const OVAL_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class FaceEngine {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;

  // Filter 6 key anchor points: nose, mouth, leftEye, rightEye, leftCheek, rightCheek (12 floats)
  private filter = new OneEuroFilterArray(12, 1.4, 3.4, 1.0);
  private rawBuf = new Float32Array(12);
  private outBuf = new Float32Array(12);

  private lastVideoTime = -1;
  private lastTs = 0;
  private lastSeenAt = 0;
  private fpsTimes: number[] = [];

  public state: FaceState = { ...EMPTY_FACE };
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

  preload(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = createFaceLandmarker((s) => this.setLoad(s))
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

  /** Drop tracked face + filters so no state leaks across games, restarts or resumes. */
  reset() {
    this.clearFace();
    this.lastSeenAt = 0;
    this.lastVideoTime = -1;
    this.lastTs = 0;
  }

  update(viewportW: number, viewportH: number): FaceState {
    const video = this.video;
    const landmarker = this.landmarker;
    if (!this.ready || !video || !landmarker || video.readyState < 2) {
      return this.state;
    }

    const now = performance.now();
    if (video.currentTime === this.lastVideoTime) {
      if (this.state.present && now - this.lastSeenAt > LOST_MS) {
        this.clearFace();
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
      console.warn('[FaceEngine] detectForVideo error:', err);
      return this.state;
    }

    this.fpsTimes.push(ts);
    while (this.fpsTimes.length && ts - this.fpsTimes[0] > 1000) {
      this.fpsTimes.shift();
    }
    this.stats.fps = this.fpsTimes.length;

    const lm = result.faceLandmarks?.[0];
    if (!lm || lm.length < 468) {
      if (this.state.present && now - this.lastSeenAt > LOST_MS) {
        this.clearFace();
      }
      return this.state;
    }

    const cover = getCoverTransform(video, viewportW, viewportH);
    const mapPt = (idx: number): Point2D => ({
      x: cover.offsetX + (1 - lm[idx].x) * cover.renderedW,
      y: cover.offsetY + lm[idx].y * cover.renderedH,
    });

    const isFresh = !this.state.present || now - this.lastSeenAt > LOST_MS;
    if (isFresh) this.filter.reset();
    this.lastSeenAt = now;

    // Key landmarks:
    // nose tip = 1, upper/lower inner lip = 13/14
    // subject's left eye = 362 & 263 (appears on screen-LEFT when mirrored)
    // subject's right eye = 33 & 133 (appears on screen-RIGHT when mirrored)
    // temples/cheekbones = 454 (screen-left) & 234 (screen-right)
    const rawNose = mapPt(1);
    const lipU = mapPt(13);
    const lipL = mapPt(14);
    const rawMouth = { x: (lipU.x + lipL.x) * 0.5, y: (lipU.y + lipL.y) * 0.5 };
    const eyeL1 = mapPt(362);
    const eyeL2 = mapPt(263);
    const rawEyeA = { x: (eyeL1.x + eyeL2.x) * 0.5, y: (eyeL1.y + eyeL2.y) * 0.5 };
    const eyeR1 = mapPt(33);
    const eyeR2 = mapPt(133);
    const rawEyeB = { x: (eyeR1.x + eyeR2.x) * 0.5, y: (eyeR1.y + eyeR2.y) * 0.5 };
    const rawLeftEye = rawEyeA.x <= rawEyeB.x ? rawEyeA : rawEyeB;
    const rawRightEye = rawEyeA.x <= rawEyeB.x ? rawEyeB : rawEyeA;
    const rawCheekL = mapPt(454);
    const rawCheekR = mapPt(234);

    this.rawBuf[0] = rawNose.x;
    this.rawBuf[1] = rawNose.y;
    this.rawBuf[2] = rawMouth.x;
    this.rawBuf[3] = rawMouth.y;
    this.rawBuf[4] = rawLeftEye.x;
    this.rawBuf[5] = rawLeftEye.y;
    this.rawBuf[6] = rawRightEye.x;
    this.rawBuf[7] = rawRightEye.y;
    this.rawBuf[8] = rawCheekL.x;
    this.rawBuf[9] = rawCheekL.y;
    this.rawBuf[10] = rawCheekR.x;
    this.rawBuf[11] = rawCheekR.y;

    this.filter.filter(this.rawBuf, this.outBuf, dtSec);

    const nosePos = { x: this.outBuf[0], y: this.outBuf[1] };
    const mouthPos = { x: this.outBuf[2], y: this.outBuf[3] };
    const leftEyePos = { x: this.outBuf[4], y: this.outBuf[5] };
    const rightEyePos = { x: this.outBuf[6], y: this.outBuf[7] };
    const cheekL = { x: this.outBuf[8], y: this.outBuf[9] };
    const cheekR = { x: this.outBuf[10], y: this.outBuf[11] };

    const faceWidth = Math.max(40, Math.hypot(cheekR.x - cheekL.x, cheekR.y - cheekL.y));

    // Head pose angles normalized to -1..1
    const rollRad = Math.atan2(rightEyePos.y - leftEyePos.y, rightEyePos.x - leftEyePos.x);
    const rawRoll = clamp(rollRad / 0.42, -1, 1);

    const eyeMidX = (leftEyePos.x + rightEyePos.x) * 0.5;
    const eyeMidY = (leftEyePos.y + rightEyePos.y) * 0.5;
    const rawYaw = clamp(((nosePos.x - eyeMidX) / (faceWidth * 0.28)), -1, 1);
    const eyeToMouth = Math.max(20, mouthPos.y - eyeMidY);
    const rawPitch = clamp(((nosePos.y - eyeMidY) / eyeToMouth - 0.55) * 2.4, -1, 1);

    // Extract ARKit blendshapes
    const cats = result.faceBlendshapes?.[0]?.categories;
    const bs: Record<string, number> = {};
    if (cats) {
      for (let i = 0; i < cats.length; i++) {
        bs[cats[i].categoryName] = cats[i].score;
      }
    }

    const rawJawOpen = bs['jawOpen'] ?? 0;
    const rawBlinkL = bs['eyeBlinkLeft'] ?? 0;
    const rawBlinkR = bs['eyeBlinkRight'] ?? 0;
    const rawSmile = ((bs['mouthSmileLeft'] ?? 0) + (bs['mouthSmileRight'] ?? 0)) * 0.5;
    const rawCheekPuff = bs['cheekPuff'] ?? 0;
    const rawBrowUp =
      ((bs['browInnerUp'] ?? 0) + (bs['browOuterUpLeft'] ?? 0) + (bs['browOuterUpRight'] ?? 0)) / 3;

    // Fast response for blinks (~100ms event), smooth for pose & jaw/smile
    const kPose = isFresh ? 1 : 0.42;
    const kBlink = isFresh ? 1 : 0.78;
    const kExpr = isFresh ? 1 : 0.5;

    const contour: Point2D[] = [];
    if (DEBUG) {
      for (const idx of OVAL_IDX) contour.push(mapPt(idx));
    }

    this.state = {
      present: true,
      nosePos,
      mouthPos,
      leftEyePos,
      rightEyePos,
      faceWidth,
      contour,
      roll: lerp(this.state.roll, rawRoll, kPose),
      yaw: lerp(this.state.yaw, rawYaw, kPose),
      pitch: lerp(this.state.pitch, rawPitch, kPose),
      jawOpen: lerp(this.state.jawOpen, rawJawOpen, kExpr),
      blinkL: lerp(this.state.blinkL, rawBlinkL, kBlink),
      blinkR: lerp(this.state.blinkR, rawBlinkR, kBlink),
      smile: lerp(this.state.smile, rawSmile, kExpr),
      cheekPuff: lerp(this.state.cheekPuff, rawCheekPuff, kExpr),
      browUp: lerp(this.state.browUp, rawBrowUp, kExpr),
    };

    return this.state;
  }

  private clearFace() {
    this.filter.reset();
    this.state = { ...EMPTY_FACE };
  }
}

/**
 * Lightweight cartoon AR face overlay (eye reticles, mouth ring; face oval only in debug mode).
 */
export function drawFaceOverlay(
  ctx: CanvasRenderingContext2D,
  face: FaceState,
  accent = '#5cc8ff',
  alpha = 0.55,
) {
  if (!face.present) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (DEBUG && face.contour.length > 4) {
    ctx.beginPath();
    ctx.moveTo(face.contour[0].x, face.contour[0].y);
    for (let i = 1; i < face.contour.length; i++) {
      ctx.lineTo(face.contour[i].x, face.contour[i].y);
    }
    ctx.closePath();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Eye reticles
  const eyeR = Math.max(9, face.faceWidth * 0.085);
  for (const [pos, blink] of [
    [face.leftEyePos, face.blinkL],
    [face.rightEyePos, face.blinkR],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, eyeR, Math.max(2, eyeR * (1 - blink * 0.85)), 0, 0, Math.PI * 2);
    ctx.strokeStyle = blink > 0.55 ? '#ffc93c' : accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Mouth ring responds to jawOpen
  const mouthR = Math.max(10, face.faceWidth * (0.09 + face.jawOpen * 0.14));
  ctx.beginPath();
  ctx.ellipse(
    face.mouthPos.x,
    face.mouthPos.y,
    mouthR * 1.15,
    Math.max(4, mouthR * (0.35 + face.jawOpen * 0.85)),
    0,
    0,
    Math.PI * 2,
  );
  ctx.strokeStyle = face.jawOpen > 0.32 ? '#3fd4a2' : '#ffffff';
  ctx.lineWidth = face.jawOpen > 0.32 ? 3.5 : 2;
  ctx.stroke();

  ctx.restore();
}
