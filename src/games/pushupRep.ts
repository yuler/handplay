import type { Joint, PoseState } from '../vision/poseEngine';

/** Straight enough to be the top of a rep. */
export const STRAIGHT_ANGLE = 150;
/** Bent enough to be the bottom of a rep. */
export const BENT_ANGLE = 112;
/** At or under this, the rep is marked deep. It still counts as one rep. */
export const DEEP_ANGLE = 90;
/** Hands may slide this fraction of the straight-arm reach and still count as planted. */
const WRIST_SLOP = 0.4;
/** A real bottom lasts longer than a one-frame jitter. */
const MIN_DOWN_SEC = 0.12;
const VIS = 0.45;

export interface PushSample {
  elbow: number | null;
  reach: number | null;
  wristX: number;
  wristY: number;
  shoulderX: number;
  shoulderY: number;
}

export type PushVerdict = 'rep' | 'partial';

interface ArmRead {
  angle: number;
  shoulder: Joint;
  wrist: Joint;
}

function arm(angle: number, shoulder: Joint, elbow: Joint, wrist: Joint): ArmRead | null {
  if (![shoulder, elbow, wrist].every((j) => j.vis >= VIS)) return null;
  if (!Number.isFinite(angle)) return null;
  return { angle, shoulder, wrist };
}

/** Average the arms the camera can actually see. One arm is enough for a side view. */
export function samplePose(pose: PoseState): PushSample {
  const arms = [
    arm(pose.leftElbowAngle, pose.leftShoulder, pose.leftElbow, pose.leftWrist),
    arm(pose.rightElbowAngle, pose.rightShoulder, pose.rightElbow, pose.rightWrist),
  ].filter((a): a is ArmRead => a !== null);
  if (!arms.length) {
    return { elbow: null, reach: null, wristX: 0, wristY: 0, shoulderX: 0, shoulderY: 0 };
  }
  const n = arms.length;
  let elbow = 0;
  let reach = 0;
  let wristX = 0;
  let wristY = 0;
  let shoulderX = 0;
  let shoulderY = 0;
  for (const a of arms) {
    elbow += a.angle;
    reach += Math.hypot(a.wrist.x - a.shoulder.x, a.wrist.y - a.shoulder.y);
    wristX += a.wrist.x;
    wristY += a.wrist.y;
    shoulderX += a.shoulder.x;
    shoulderY += a.shoulder.y;
  }
  return {
    elbow: elbow / n,
    reach: reach / n,
    wristX: wristX / n,
    wristY: wristY / n,
    shoulderX: shoulderX / n,
    shoulderY: shoulderY / n,
  };
}

/**
 * A rep is a round trip: straight arms, then a real bottom, then straight again.
 * The bottom needs a bent elbow while the hands stay put, so waving or curling
 * does not count. Depth is the 3D elbow angle, which still works when the
 * phone is in front and the arms point toward the camera.
 */
export class PushCounter {
  reps = 0;
  partials = 0;
  deeps = 0;
  phase: 'seek' | 'top' | 'down' = 'seek';
  minElbow = 180;

  private topReach = 0;
  private topWristX = 0;
  private topWristY = 0;
  private downFor = 0;
  private dipped = false;

  reset() {
    this.reps = 0;
    this.partials = 0;
    this.deeps = 0;
    this.phase = 'seek';
    this.minElbow = 180;
    this.topReach = 0;
    this.downFor = 0;
    this.dipped = false;
  }

  update(s: PushSample, dt: number): PushVerdict | null {
    if (s.elbow == null || s.reach == null || s.reach < 24) return null;

    if (s.elbow >= STRAIGHT_ANGLE) {
      if (this.phase === 'down') {
        const verdict = this.finishDown();
        this.capture(s);
        return verdict;
      }
      if (this.phase === 'seek') {
        this.phase = 'top';
        this.capture(s);
        return null;
      }
      if (this.dipped && this.minElbow <= 135) {
        this.partials += 1;
        this.capture(s);
        return 'partial';
      }
      this.capture(s);
      return null;
    }

    if (this.phase === 'top') {
      this.dipped = true;
      this.minElbow = Math.min(this.minElbow, s.elbow);
      const drift = Math.hypot(s.wristX - this.topWristX, s.wristY - this.topWristY);
      const planted = drift <= this.topReach * WRIST_SLOP;
      if (s.elbow <= BENT_ANGLE && planted) {
        this.phase = 'down';
        this.downFor = 0;
      }
      return null;
    }

    if (this.phase === 'down') {
      this.minElbow = Math.min(this.minElbow, s.elbow);
      this.downFor += dt;
    }
    return null;
  }

  private finishDown(): PushVerdict {
    const deep = this.minElbow <= DEEP_ANGLE;
    const held = this.downFor >= MIN_DOWN_SEC;
    this.phase = 'top';
    this.dipped = false;
    if (!held) {
      this.partials += 1;
      this.minElbow = 180;
      return 'partial';
    }
    this.reps += 1;
    if (deep) this.deeps += 1;
    this.minElbow = 180;
    this.downFor = 0;
    return 'rep';
  }

  private capture(s: PushSample) {
    this.phase = 'top';
    this.topReach = s.reach ?? 0;
    this.topWristX = s.wristX;
    this.topWristY = s.wristY;
    this.dipped = false;
    this.minElbow = s.elbow ?? 180;
    this.downFor = 0;
  }
}
