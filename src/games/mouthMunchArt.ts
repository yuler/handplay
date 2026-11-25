import { CANDY, INK } from './theme';

export type PufferMood = 'follow' | 'chomp' | 'dizzy' | 'laser' | 'fever';

export interface PufferOptions {
  jaw: number;
  blinkL: number;
  blinkR: number;
  shield: boolean;
  suction: boolean;
  mood: PufferMood;
  time: number;
}

/** Local eye centers, before the shield / chomp scale. Lasers aim from these. */
export const PUFFER_EYE = { x: 16, y: -12 } as const;

const BELLY = '#fff6e5';
const SPOT = '#ffb020';
const FIN = '#ff9f43';
const MOUTH_IN = '#c23b55';
const TONGUE = '#ff8fa3';

function stickerEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  line = 3.5,
) {
  ctx.beginPath();
  ctx.ellipse(x, y + 3, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawVortex(ctx: CanvasRenderingContext2D, time: number) {
  for (let i = 0; i < 7; i++) {
    const phase = (time * 0.85 + i / 7) % 1;
    const ang = time * 3.4 + i * 0.9;
    const rad = 168 * (1 - phase);
    const x = Math.cos(ang) * rad * 0.9;
    const y = Math.sin(ang) * rad * 0.42;
    const r = 3.5 + (1 - phase) * 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + phase * 0.45})`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(63, 212, 162, ${0.35 + phase * 0.5})`;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(22, 0);
    ctx.strokeStyle = `rgba(255, 201, 60, ${phase * 0.7})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

function drawSpikes(ctx: CanvasRenderingContext2D, time: number) {
  const n = 10;
  const pop = 0.72 + Math.sin(time * 8) * 0.08;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const inner = 40;
    const outer = 40 + 16 * pop;
    const spread = 0.16;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - spread) * inner, Math.sin(a - spread) * inner * 0.86);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer * 0.86);
    ctx.lineTo(Math.cos(a + spread) * inner, Math.sin(a + spread) * inner * 0.86);
    ctx.closePath();
    ctx.fillStyle = CANDY.mint;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, blink: number, mood: PufferMood) {
  const open = Math.max(0.08, 1 - blink * 0.92);
  ctx.save();
  ctx.translate(x, y);

  if (mood === 'chomp') {
    ctx.beginPath();
    ctx.arc(0, 2, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    return;
  }

  stickerEllipse(ctx, 0, 0, 9, 10 * open, CANDY.white, 2.5);

  if (open > 0.35) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 9 * open, 0, 0, Math.PI * 2);
    ctx.clip();

    if (mood === 'dizzy') {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-3.5, -3.5);
      ctx.lineTo(3.5, 3.5);
      ctx.moveTo(3.5, -3.5);
      ctx.lineTo(-3.5, 3.5);
      ctx.stroke();
    } else if (mood === 'fever') {
      ctx.fillStyle = CANDY.sun;
      ctx.translate(0, 1);
      star(ctx, 6);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else {
      const iris = mood === 'laser' ? CANDY.sky : '#4c6fff';
      ctx.beginPath();
      ctx.arc(0, 1, mood === 'laser' ? 5.5 : 4.6, 0, Math.PI * 2);
      ctx.fillStyle = iris;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 1, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-2.2, -2, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      if (mood === 'laser') {
        ctx.beginPath();
        ctx.arc(0, 1, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(92, 200, 255, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if (blink > 0.45) {
    ctx.beginPath();
    ctx.ellipse(0, -1, 9, 10 * blink, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = CANDY.sun;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, jaw: number) {
  const w = 11 + jaw * 12;
  const h = 3.5 + jaw * 16;
  const y = 14;
  ctx.beginPath();
  ctx.ellipse(0, y + 2, w, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, y, w, h, 0, 0, Math.PI * 2);
  ctx.fillStyle = jaw > 0.2 ? MOUTH_IN : INK;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  if (jaw > 0.28) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, y, w - 2, h - 1.5, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(0, y + h * 0.35, w * 0.55, h * (0.28 + jaw * 0.25), 0, 0, Math.PI * 2);
    ctx.fillStyle = TONGUE;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = CANDY.white;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 4, y - h + 1);
      ctx.lineTo(side * 2.2, y - h + 7);
      ctx.lineTo(side * 6.2, y - h + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Chubby sticker pufferfish. Origin is the body center. */
export function drawPufferfish(ctx: CanvasRenderingContext2D, o: PufferOptions) {
  const { jaw, shield, mood, time } = o;
  ctx.save();

  if (o.suction) drawVortex(ctx, time);

  const chomp = mood === 'chomp' ? 0.1 : 0;
  const sx = (shield ? 1.25 : 1) * (1 + chomp);
  const sy = (shield ? 1.25 : 1) * (1 - chomp * 0.45 + (jaw > 0.32 ? 0.04 : 0));
  ctx.scale(sx, sy);

  ctx.beginPath();
  ctx.ellipse(0, 40, shield ? 30 : 34, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(58, 45, 92, 0.18)';
  ctx.fill();

  const wag = Math.sin(time * 5) * 6;
  ctx.beginPath();
  ctx.moveTo(-24, 10);
  ctx.quadraticCurveTo(-62, 8 + wag, -56, -16 + wag);
  ctx.quadraticCurveTo(-40, -2, -22, 4);
  ctx.fillStyle = FIN;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  if (shield) drawSpikes(ctx, time);

  stickerEllipse(ctx, 0, 2, 38, 34, CANDY.sun, 4);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 2, 36, 32, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(0, 16, 24, 18, 0, 0, Math.PI * 2);
  ctx.fillStyle = BELLY;
  ctx.fill();
  for (const [sx0, sy0, r] of [
    [-14, -18, 5.5],
    [12, -20, 4.5],
    [22, 4, 4],
  ] as const) {
    ctx.beginPath();
    ctx.arc(sx0, sy0, r, 0, Math.PI * 2);
    ctx.fillStyle = SPOT;
    ctx.fill();
  }
  ctx.restore();

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 36, 8, 8, 12, side * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = FIN;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  const blush = shield ? 11 : 7;
  ctx.fillStyle = CANDY.pink;
  ctx.beginPath();
  ctx.arc(-20, 8, blush, 0, Math.PI * 2);
  ctx.arc(20, 8, blush, 0, Math.PI * 2);
  ctx.fill();

  drawEye(ctx, -PUFFER_EYE.x, PUFFER_EYE.y, o.blinkL, mood);
  drawEye(ctx, PUFFER_EYE.x, PUFFER_EYE.y, o.blinkR, mood);
  drawMouth(ctx, jaw);

  ctx.restore();
}
