export type GestureId = 'fist' | 'open' | 'victory' | 'point' | 'thumb' | 'ok' | 'none';

export interface GestureMeta {
  id: Exclude<GestureId, 'none'>;
  emoji: string;
  label: string;
  hint: string;
  fingers: number;
  color: string;
}

export const GESTURE_LIST: GestureMeta[] = [
  { id: 'fist', emoji: '✊', label: '石头', hint: '五指握拳', fingers: 0, color: '#ff7a6b' },
  { id: 'point', emoji: '☝️', label: '一指', hint: '只伸食指', fingers: 1, color: '#5cc8ff' },
  { id: 'victory', emoji: '✌️', label: '剪刀', hint: '比个耶', fingers: 2, color: '#ffc93c' },
  { id: 'open', emoji: '🖐️', label: '五指', hint: '手掌张开', fingers: 5, color: '#3fd4a2' },
  { id: 'thumb', emoji: '👍', label: '点赞', hint: '大拇指朝上', fingers: 1, color: '#ff9f43' },
  { id: 'ok', emoji: '👌', label: 'OK', hint: '拇指食指捏圆', fingers: 3, color: '#9b7bff' },
];

export const GESTURE_MAP: Record<Exclude<GestureId, 'none'>, GestureMeta> = Object.fromEntries(
  GESTURE_LIST.map((g) => [g.id, g]),
) as Record<Exclude<GestureId, 'none'>, GestureMeta>;

export interface Point2D {
  x: number;
  y: number;
}

export interface HandState {
  present: boolean;
  /** Screen-space (CSS px) 21 landmarks, mirrored to match cover video */
  pts: Point2D[];
  /** Palm scale in screen px: distance wrist(0) -> middleMCP(9) */
  palmPx: number;
  gesture: GestureId;
  fingers: number;
  /** Pinch midpoint (between thumb tip 4 & index tip 8) in screen px */
  pinchPos: Point2D;
  /** Normalized pinch distance: dist(4, 8) / palmPx */
  pinchRatio: number;
  /** Hysteresis-filtered pinch state */
  pinching: boolean;
  /** Index finger tip (8) in screen px */
  indexTip: Point2D;
  /** Palm center in screen px */
  palmCenter: Point2D;
}

const TIPS = [4, 8, 12, 16, 20] as const;
const PIPS = [3, 6, 10, 14, 18] as const;
const MCPS = [2, 5, 9, 13, 17] as const;

export const HAND_CONNECTIONS: ReadonlyArray<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Pure geometric 21-point hand gesture classifier (scale & rotation resilient).
 * Uses wrist-to-middle-MCP as palm ruler so it works equally well near & far.
 */
export function classifyHandGesture(pts: Point2D[]): {
  gesture: GestureId;
  fingers: number;
  palmPx: number;
  pinchRatio: number;
} {
  if (pts.length < 21) {
    return { gesture: 'none', fingers: 0, palmPx: 1, pinchRatio: 9 };
  }

  const wrist = pts[0];
  const palmPx = Math.max(12, dist(wrist, pts[9]));

  // Four non-thumb fingers extended check: tip further from wrist than PIP & MCP
  const ext: boolean[] = [];
  for (let i = 1; i < 5; i++) {
    const dTip = dist(wrist, pts[TIPS[i]]);
    const dPip = dist(wrist, pts[PIPS[i]]);
    const dMcp = dist(wrist, pts[MCPS[i]]);
    ext.push(dTip > dPip * 1.07 && dTip > dMcp * 1.15 && dTip > palmPx * 1.08);
  }

  // Thumb extended check: thumb tip away from pinky MCP & IP joint
  const thumbOut =
    dist(pts[4], pts[17]) > palmPx * 0.92 &&
    dist(pts[4], pts[5]) > palmPx * 0.42 &&
    dist(pts[4], pts[3]) > palmPx * 0.18;

  const [index, middle, ring, pinky] = ext;
  const pinchDist = dist(pts[4], pts[8]);
  const pinchRatio = pinchDist / palmPx;

  // Count extended fingers
  const fingers = ext.filter(Boolean).length + (thumbOut ? 1 : 0);

  let gesture: GestureId = 'none';

  // 1. OK sign: thumb & index form a circle while middle + ring (+ pinky) extended
  if (pinchRatio < 0.44 && middle && ring) {
    gesture = 'ok';
  }
  // 2. Open palm: 4 or 5 fingers open (index + middle + ring all up)
  else if (index && middle && ring && (pinky || thumbOut)) {
    gesture = 'open';
  }
  // 3. Victory / scissors: index + middle up, ring + pinky curled
  else if (index && middle && !ring && !pinky) {
    gesture = 'victory';
  }
  // 4. Point / One: only index up
  else if (index && !middle && !ring && !pinky) {
    gesture = 'point';
  }
  // 5. Thumbs up: thumb extended & pointing upward above wrist/index-MCP, other 4 curled
  else if (!index && !middle && !ring && !pinky && thumbOut && pts[4].y < pts[2].y - palmPx * 0.15 && pts[4].y < pts[5].y) {
    gesture = 'thumb';
  }
  // 6. Fist: all 4 main fingers curled and thumb tucked
  else if (!index && !middle && !ring && !pinky && (!thumbOut || pts[4].y >= pts[5].y - palmPx * 0.08)) {
    gesture = 'fist';
  }

  return { gesture, fingers, palmPx, pinchRatio };
}

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  hand: HandState,
  accentColor = '#5cc8ff',
  alpha = 0.72,
) {
  if (!hand.present || hand.pts.length < 21) return;
  const ink = '#3a2d5c';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Cartoon bones: ink outline under a chunky colored stroke (no blur, cheap on phones)
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(hand.pts[a].x, hand.pts[a].y);
    ctx.lineTo(hand.pts[b].x, hand.pts[b].y);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4.5;
  ctx.stroke();

  // Joints & highlighted fingertips
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ink;
  for (let i = 0; i < 21; i++) {
    const p = hand.pts[i];
    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isTip ? 6.5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? '#ffffff' : accentColor;
    ctx.fill();
    if (isTip) ctx.stroke();
  }
  ctx.restore();
}
