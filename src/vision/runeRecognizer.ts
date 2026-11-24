import type { Point2D } from './gestures';

export type RuneId = 'horiz' | 'vert' | 'circle' | 'caret' | 'vee';

export interface RuneMeta {
  id: RuneId;
  symbol: string;
  name: string;
  color: string;
  hint: string;
}

export const RUNE_LIST: RuneMeta[] = [
  { id: 'horiz', symbol: '—', name: '横斩', color: '#5cc8ff', hint: '横向一划' },
  { id: 'vert', symbol: '|', name: '竖劈', color: '#ffc93c', hint: '竖直一划' },
  { id: 'circle', symbol: '○', name: '圆环', color: '#3fd4a2', hint: '画个圆圈' },
  { id: 'caret', symbol: '∧', name: '山峰', color: '#ff7a6b', hint: '向上尖角' },
  { id: 'vee', symbol: '∨', name: '雷电', color: '#c084fc', hint: '向下对勾' },
];

export const RUNE_MAP: Record<RuneId, RuneMeta> = Object.fromEntries(
  RUNE_LIST.map((r) => [r.id, r]),
) as Record<RuneId, RuneMeta>;

export interface RuneMatch {
  rune: RuneId;
  score: number;
}

const NUM_POINTS = 32;
const SQUARE_SIZE = 200;
const HALF_DIAGONAL = 0.5 * Math.hypot(SQUARE_SIZE, SQUARE_SIZE);
const PHI = 0.5 * (-1 + Math.sqrt(5));
const MAX_ROT_RAD = (18 * Math.PI) / 180; // small tolerance so ∧ and ∨ never confuse!

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(pts: Point2D[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]);
  return d;
}

function resample(pts: Point2D[], n: number): Point2D[] {
  const len = pathLength(pts);
  if (len < 1e-4) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const step = len / (n - 1);
  let accum = 0;
  const src = pts.map((p) => ({ ...p }));
  const out: Point2D[] = [{ ...src[0] }];
  for (let i = 1; i < src.length; i++) {
    const d = dist(src[i - 1], src[i]);
    if (accum + d >= step) {
      const t = (step - accum) / d;
      const q = {
        x: src[i - 1].x + t * (src[i].x - src[i - 1].x),
        y: src[i - 1].y + t * (src[i].y - src[i - 1].y),
      };
      out.push(q);
      src.splice(i, 0, q);
      accum = 0;
    } else {
      accum += d;
    }
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out;
}

function boundingBox(pts: Point2D[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function centroid(pts: Point2D[]): Point2D {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function normalize(pts: Point2D[]): Point2D[] {
  const resampled = resample(pts, NUM_POINTS);
  const b = boundingBox(resampled);
  const scale = Math.max(b.w, b.h, 1);
  // Uniform scale preserves aspect ratio so lines don't inflate into squares
  const scaled = resampled.map((p) => ({
    x: (p.x / scale) * SQUARE_SIZE,
    y: (p.y / scale) * SQUARE_SIZE,
  }));
  const c = centroid(scaled);
  return scaled.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function rotateBy(pts: Point2D[], rad: number): Point2D[] {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
}

function pathDistance(a: Point2D[], b: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += dist(a[i], b[i]);
  return sum / a.length;
}

function distanceAtBestAngle(pts: Point2D[], tmpl: Point2D[]): number {
  let a = -MAX_ROT_RAD;
  let b = MAX_ROT_RAD;
  let x1 = PHI * a + (1 - PHI) * b;
  let x2 = (1 - PHI) * a + PHI * b;
  let f1 = pathDistance(rotateBy(pts, x1), tmpl);
  let f2 = pathDistance(rotateBy(pts, x2), tmpl);
  for (let iter = 0; iter < 6; iter++) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = pathDistance(rotateBy(pts, x1), tmpl);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = pathDistance(rotateBy(pts, x2), tmpl);
    }
  }
  return Math.min(f1, f2);
}

// Build bidirectional orientation-preserving $1 templates
interface Template {
  rune: RuneId;
  pts: Point2D[];
}

function makeCircle(startAngle: number, dir: 1 | -1): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = startAngle + dir * (i / 24) * Math.PI * 2;
    out.push({ x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
  }
  return out;
}

const TEMPLATES: Template[] = [
  // Caret ∧ (both left-to-right and right-to-left)
  { rune: 'caret', pts: normalize([{ x: 0, y: 100 }, { x: 50, y: 0 }, { x: 100, y: 100 }]) },
  { rune: 'caret', pts: normalize([{ x: 100, y: 100 }, { x: 50, y: 0 }, { x: 0, y: 100 }]) },
  { rune: 'caret', pts: normalize([{ x: 0, y: 80 }, { x: 50, y: 0 }, { x: 100, y: 80 }]) },
  { rune: 'caret', pts: normalize([{ x: 100, y: 80 }, { x: 50, y: 0 }, { x: 0, y: 80 }]) },
  // Vee ∨ (both left-to-right and right-to-left)
  { rune: 'vee', pts: normalize([{ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 }]) },
  { rune: 'vee', pts: normalize([{ x: 100, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 0 }]) },
  { rune: 'vee', pts: normalize([{ x: 0, y: 0 }, { x: 40, y: 100 }, { x: 100, y: 20 }]) },
  // Circles ○ (CW & CCW from top, right, bottom, left)
  ...[0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].flatMap((ang) => [
    { rune: 'circle' as const, pts: normalize(makeCircle(ang, 1)) },
    { rune: 'circle' as const, pts: normalize(makeCircle(ang, -1)) },
  ]),
  // Lines (fallback in $1)
  { rune: 'horiz', pts: normalize([{ x: 0, y: 0 }, { x: 100, y: 0 }]) },
  { rune: 'horiz', pts: normalize([{ x: 100, y: 0 }, { x: 0, y: 0 }]) },
  { rune: 'vert', pts: normalize([{ x: 0, y: 0 }, { x: 0, y: 100 }]) },
  { rune: 'vert', pts: normalize([{ x: 0, y: 100 }, { x: 0, y: 0 }]) },
];

/**
 * Recognize one of the 5 runes (`horiz`, `vert`, `circle`, `caret`, `vee`) from an air-drawn stroke.
 * Uses geometric fast-paths for straight lines & closed loops, backed by orientation-preserving $1.
 */
export function recognizeRune(rawPts: Point2D[]): RuneMatch | null {
  if (rawPts.length < 5) return null;
  const len = pathLength(rawPts);
  if (len < 48) return null;

  const box = boundingBox(rawPts);
  const maxDim = Math.max(box.w, box.h);
  if (maxDim < 36) return null;

  const start = rawPts[0];
  const end = rawPts[rawPts.length - 1];
  const chord = dist(start, end);
  const straightness = chord / len;

  // 1. Straight-line fast-path (ultra-accurate for air drawing)
  if (straightness > 0.74) {
    if (box.w >= box.h * 1.8) return { rune: 'horiz', score: 0.96 };
    if (box.h >= box.w * 1.8) return { rune: 'vert', score: 0.96 };
  }
  if (box.w > 56 && box.w >= box.h * 2.65) return { rune: 'horiz', score: 0.92 };
  if (box.h > 56 && box.h >= box.w * 2.65) return { rune: 'vert', score: 0.92 };

  // 2. Closed-loop heuristic for circles (start near end, long perimeter, round aspect)
  const minDim = Math.min(box.w, box.h);
  if (chord < maxDim * 0.52 && len > maxDim * 2.2 && minDim / maxDim > 0.42) {
    return { rune: 'circle', score: 0.94 };
  }

  // 3. Orientation-preserving $1 template match
  const norm = normalize(rawPts);
  let bestDist = Infinity;
  let bestRune: RuneId = 'horiz';
  for (const t of TEMPLATES) {
    const d = distanceAtBestAngle(norm, t.pts);
    if (d < bestDist) {
      bestDist = d;
      bestRune = t.rune;
    }
  }

  const score = Math.max(0, 1 - bestDist / HALF_DIAGONAL);
  if (score < 0.52) return null;

  // Disambiguate caret vs vee with vertical apex position
  if (bestRune === 'caret' || bestRune === 'vee') {
    const midY = (start.y + end.y) * 0.5;
    const distTop = Math.abs(midY - box.minY);
    const distBot = Math.abs(box.maxY - midY);
    bestRune = distTop > distBot ? 'caret' : 'vee';
  }

  return { rune: bestRune, score };
}

/** Crisp bold vector rune icon drawn centered at (x, y). */
export function drawRuneIcon(
  ctx: CanvasRenderingContext2D,
  rune: RuneId,
  x: number,
  y: number,
  size: number,
  color: string,
  inkColor = '#3a2d5c',
) {
  const r = size * 0.42;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const trace = () => {
    ctx.beginPath();
    switch (rune) {
      case 'horiz':
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        break;
      case 'vert':
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
        break;
      case 'circle':
        ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
        break;
      case 'caret':
        ctx.moveTo(-r * 0.9, r * 0.65);
        ctx.lineTo(0, -r * 0.78);
        ctx.lineTo(r * 0.9, r * 0.65);
        break;
      case 'vee':
        ctx.moveTo(-r * 0.9, -r * 0.65);
        ctx.lineTo(0, r * 0.78);
        ctx.lineTo(r * 0.9, -r * 0.65);
        break;
    }
  };

  trace();
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = Math.max(6, size * 0.22);
  ctx.stroke();

  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3.5, size * 0.13);
  ctx.stroke();

  ctx.restore();
}
