// Shared cartoon look for in-game canvas drawing (mirrors the CSS palette in style.css)
export const INK = '#3a2d5c';

export const CANDY = {
  coral: '#ff7a6b',
  sun: '#ffc93c',
  mint: '#3fd4a2',
  sky: '#5cc8ff',
  grape: '#9b7bff',
  pink: '#ff8fc7',
  cream: '#fff6e5',
  white: '#ffffff',
  wood: '#d9925a',
} as const;

const FONT_STACK =
  'ui-rounded, "SF Pro Rounded", "PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", system-ui, sans-serif';

export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export function font(weight: number, size: number): string {
  return `${weight} ${Math.round(size)}px ${FONT_STACK}`;
}

/** Chunky sticker pill: ink outline + offset ink "drop" instead of a costly blur shadow. */
export function stickerPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg: string = INK,
  fontSize = 15,
) {
  ctx.save();
  ctx.font = font(900, fontSize);
  const padX = 16;
  const bw = ctx.measureText(text).width + padX * 2;
  const bh = fontSize + 20;
  const left = x - bw / 2;
  const top = y - bh / 2;
  ctx.beginPath();
  ctx.roundRect(left, top + 4, bw, bh, bh / 2);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(left, top, bw, bh, bh / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

/** Filled circle with ink outline and a small glossy highlight. */
export function cartoonBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
}
