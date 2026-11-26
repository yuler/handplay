import type { Landmark, NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';
import { getCoverTransform } from './camera';
import { LOST_MS, type VisionStats } from './handEngine';
import { createPoseLandmarker, type VisionLoadState } from './visionAssets';

export interface Joint {
  x: number;
  y: number;
  vis: number;
}

export interface PoseState {
  present: boolean;
  leftShoulder: Joint;
  rightShoulder: Joint;
  leftElbow: Joint;
  rightElbow: Joint;
  leftWrist: Joint;
  rightWrist: Joint;
  /** 3D elbow angle in degrees. NaN when that arm is not usable. */
  leftElbowAngle: number;
  rightElbowAngle: number;
}

const ZERO: Joint = { x: 0, y: 0, vis: 0 };

export const EMPTY_POSE: PoseState = {
  present: false,
  leftShoulder: { ...ZERO },
  rightShoulder: { ...ZERO },
  leftElbow: { ...ZERO },
  rightElbow: { ...ZERO },
  leftWrist: { ...ZERO },
  rightWrist: { ...ZERO },
  leftElbowAngle: Number.NaN,
  rightElbowAngle: Number.NaN,
};

const L_SH = 11;
const R_SH = 12;
const L_EL = 13;
const R_EL = 14;
const L_WR = 15;
const R_WR = 16;

function angleAt(a: Landmark, b: Landmark, c: Landmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v1z = a.z - b.z;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const v2z = c.z - b.z;
  const mag = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z);
  if (mag < 1e-6) return Number.NaN;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

export class PoseEngine {
  private landmarker: PoseLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastVideoTime = -1;
  private lastTs = 0;
  private lastSeenAt = 0;
  private fpsTimes: number[] = [];
  private smooth: PoseState | null = null;

  public state: PoseState = { ...EMPTY_POSE };
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
      this.loadPromise = createPoseLandmarker((s) => this.setLoad(s))
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

  async init(videoEl: HTMLVideoElement): Promise<void> {
    this.video = videoEl;
    await this.preload();
    this.ready = true;
  }

  reset() {
    this.clear();
    this.smooth = null;
    this.lastSeenAt = 0;
    this.lastVideoTime = -1;
    this.lastTs = 0;
  }

  update(viewportW: number, viewportH: number): PoseState {
    const video = this.video;
    const landmarker = this.landmarker;
    if (!this.ready || !video || !landmarker || video.readyState < 2) return this.state;

    const now = performance.now();
    if (video.currentTime === this.lastVideoTime) {
      if (this.state.present && now - this.lastSeenAt > LOST_MS) this.clear();
      return this.state;
    }

    this.lastVideoTime = video.currentTime;
    const ts = now <= this.lastTs ? this.lastTs + 1 : now;
    this.lastTs = ts;

    let result;
    try {
      result = landmarker.detectForVideo(video, ts);
    } catch (err) {
      console.warn('[PoseEngine] detectForVideo error:', err);
      return this.state;
    }

    this.fpsTimes.push(ts);
    while (this.fpsTimes.length && ts - this.fpsTimes[0] > 1000) this.fpsTimes.shift();
    this.stats.fps = this.fpsTimes.length;

    const lm = result.landmarks?.[0];
    const world = result.worldLandmarks?.[0];
    if (!lm || lm.length < 17) {
      if (this.state.present && now - this.lastSeenAt > LOST_MS) this.clear();
      return this.state;
    }

    const cover = getCoverTransform(video, viewportW, viewportH);
    const mapPt = (idx: number): Joint => {
      const p = lm[idx];
      return {
        x: cover.offsetX + (1 - p.x) * cover.renderedW,
        y: cover.offsetY + p.y * cover.renderedH,
        vis: p.visibility ?? 0,
      };
    };

    const fresh = !this.state.present || now - this.lastSeenAt > LOST_MS;
    this.lastSeenAt = now;
    const raw: PoseState = {
      present: true,
      leftShoulder: mapPt(L_SH),
      rightShoulder: mapPt(R_SH),
      leftElbow: mapPt(L_EL),
      rightElbow: mapPt(R_EL),
      leftWrist: mapPt(L_WR),
      rightWrist: mapPt(R_WR),
      leftElbowAngle: this.elbowAngle(lm, world, L_SH, L_EL, L_WR),
      rightElbowAngle: this.elbowAngle(lm, world, R_SH, R_EL, R_WR),
    };
    this.state = fresh ? raw : this.blend(raw);
    this.smooth = this.state;
    return this.state;
  }

  private elbowAngle(
    lm: NormalizedLandmark[],
    world: Landmark[] | undefined,
    sh: number,
    el: number,
    wr: number,
  ): number {
    const vis = Math.min(lm[sh].visibility ?? 0, lm[el].visibility ?? 0, lm[wr].visibility ?? 0);
    if (vis < 0.45) return Number.NaN;
    if (world && world.length > wr) return angleAt(world[sh], world[el], world[wr]);
    const flat = (i: number): Landmark => ({ x: lm[i].x, y: lm[i].y, z: 0, visibility: 1 });
    return angleAt(flat(sh), flat(el), flat(wr));
  }

  private blend(raw: PoseState): PoseState {
    const prev = this.smooth ?? raw;
    const k = 0.45;
    const mix = (a: Joint, b: Joint): Joint => ({
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      vis: b.vis,
    });
    const mixAngle = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * k : b);
    return {
      present: true,
      leftShoulder: mix(prev.leftShoulder, raw.leftShoulder),
      rightShoulder: mix(prev.rightShoulder, raw.rightShoulder),
      leftElbow: mix(prev.leftElbow, raw.leftElbow),
      rightElbow: mix(prev.rightElbow, raw.rightElbow),
      leftWrist: mix(prev.leftWrist, raw.leftWrist),
      rightWrist: mix(prev.rightWrist, raw.rightWrist),
      leftElbowAngle: mixAngle(prev.leftElbowAngle, raw.leftElbowAngle),
      rightElbowAngle: mixAngle(prev.rightElbowAngle, raw.rightElbowAngle),
    };
  }

  private clear() {
    this.state = {
      ...EMPTY_POSE,
      leftShoulder: { ...ZERO },
      rightShoulder: { ...ZERO },
      leftElbow: { ...ZERO },
      rightElbow: { ...ZERO },
      leftWrist: { ...ZERO },
      rightWrist: { ...ZERO },
    };
    this.smooth = null;
  }
}

export function drawPoseStick(ctx: CanvasRenderingContext2D, pose: PoseState) {
  if (!pose.present) return;
  const arms: Array<[Joint, Joint, Joint, number]> = [
    [pose.leftShoulder, pose.leftElbow, pose.leftWrist, pose.leftElbowAngle],
    [pose.rightShoulder, pose.rightElbow, pose.rightWrist, pose.rightElbowAngle],
  ];
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (const [sh, el, wr, angle] of arms) {
    if (sh.vis < 0.45 || el.vis < 0.45 || wr.vis < 0.45) continue;
    ctx.strokeStyle = Number.isFinite(angle) && angle < 120 ? '#ff7a6b' : '#3fd4a2';
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(el.x, el.y);
    ctx.lineTo(wr.x, wr.y);
    ctx.stroke();
  }
}
