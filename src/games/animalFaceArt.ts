import { getCoverTransform } from '../vision/camera';
import type { FaceState } from '../vision/faceEngine';
import { CANDY, EMOJI_FONT, font, INK, stickerPill } from './theme';

export type AnimalId = 'lion' | 'puffer' | 'bear' | 'puppy' | 'owl' | 'fox';

export interface AnimalPrompt {
  id: AnimalId;
  emoji: string;
  name: string;
  action: string;
  accent: string;
  badgeText: string;
  check: (face: FaceState) => number; // 0..1 progress strength
}

export const ANIMAL_PROMPTS: AnimalPrompt[] = [
  {
    id: 'lion',
    emoji: '🦁',
    name: '小狮子',
    action: '张大嘴巴「啊——」！',
    accent: '#ff9f43',
    badgeText: '威风小狮子 🦁',
    check: (f) => Math.min(1, Math.max(0, (f.jawOpen - 0.14) / 0.24)),
  },
  {
    id: 'puffer',
    emoji: '🐡',
    name: '小河豚',
    action: '鼓起圆圆的腮帮子！',
    accent: CANDY.pink,
    badgeText: '圆滚滚小河豚 🐡',
    check: (f) => Math.min(1, Math.max(0, (f.cheekPuff - 0.14) / 0.22)),
  },
  {
    id: 'bear',
    emoji: '🐻',
    name: '开心小熊',
    action: '露出一张甜甜笑脸！',
    accent: '#c68642',
    badgeText: '甜甜开心小熊 🐻',
    check: (f) => Math.min(1, Math.max(0, (f.smile - 0.18) / 0.24)),
  },
  {
    id: 'puppy',
    emoji: '🐶',
    name: '小狗狗',
    action: '向左或向右歪歪头！',
    accent: CANDY.sun,
    badgeText: '呆萌歪头小狗 🐶',
    check: (f) => Math.min(1, Math.max(0, (Math.abs(f.roll) - 0.15) / 0.22)),
  },
  {
    id: 'owl',
    emoji: '🦉',
    name: '猫头鹰',
    action: '高高挑起你的眉毛！',
    accent: CANDY.grape,
    badgeText: '机灵猫头鹰 🦉',
    check: (f) => Math.min(1, Math.max(0, (f.browUp - 0.14) / 0.2)),
  },
  {
    id: 'fox',
    emoji: '🦊',
    name: '小狐狸',
    action: '俏皮地眨眨眼睛！',
    accent: CANDY.coral,
    badgeText: '俏皮小狐狸 🦊',
    check: (f) => Math.min(1, Math.max(0, (Math.max(f.blinkL, f.blinkR) - 0.22) / 0.28)),
  },
];

/**
 * Draws cute cartoon AR animal stickers anchored to the child's tracked face.
 */
export function drawAnimalSticker(
  ctx: CanvasRenderingContext2D,
  face: FaceState,
  animalId: AnimalId,
  time: number,
  popScale = 1,
) {
  if (!face.present) return;
  const eyeMidX = (face.leftEyePos.x + face.rightEyePos.x) * 0.5;
  const eyeMidY = (face.leftEyePos.y + face.rightEyePos.y) * 0.5;
  const fw = face.faceWidth;
  const headAngle = Math.atan2(
    face.rightEyePos.y - face.leftEyePos.y,
    face.rightEyePos.x - face.leftEyePos.x,
  );

  ctx.save();
  ctx.translate(eyeMidX, eyeMidY);
  ctx.rotate(headAngle);
  ctx.scale(popScale, popScale);

  const noseRelY = Math.hypot(face.nosePos.x - eyeMidX, face.nosePos.y - eyeMidY);
  const mouthRelY = Math.hypot(face.mouthPos.x - eyeMidX, face.mouthPos.y - eyeMidY);

  if (animalId === 'lion') {
    // Fluffy golden-orange mane petals around head
    const maneR = fw * 0.68;
    const petals = 14;
    for (let i = 0; i < petals; i++) {
      const a = (Math.PI * 2 * i) / petals + Math.sin(time * 4) * 0.04;
      const px = Math.cos(a) * maneR;
      const py = Math.sin(a) * maneR + fw * 0.1;
      ctx.beginPath();
      ctx.arc(px, py, fw * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#ff9f43' : '#ffc93c';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    // Cute lion ears on top
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * fw * 0.36, -fw * 0.45, fw * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = '#ff9f43';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * fw * 0.36, -fw * 0.45, fw * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd8a8';
      ctx.fill();
    }
    // Cute lion nose + whiskers
    drawNoseDot(ctx, 0, noseRelY, fw * 0.09, '#d97706');
    drawWhiskers(ctx, 0, noseRelY + fw * 0.02, fw * 0.16, fw * 0.34);
  } else if (animalId === 'puffer') {
    // Plump rosy pufferfish cheeks + little fins + bubbles
    const puff = 1 + Math.sin(time * 8) * 0.08;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * fw * 0.44, noseRelY + fw * 0.08, fw * 0.2 * puff, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 143, 199, 0.78)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();

      // Tiny side fins flapping
      ctx.save();
      ctx.translate(side * fw * 0.65, noseRelY + fw * 0.04);
      ctx.rotate(side * Math.sin(time * 12) * 0.35);
      ctx.beginPath();
      ctx.ellipse(side * fw * 0.08, 0, fw * 0.13, fw * 0.075, 0, 0, Math.PI * 2);
      ctx.fillStyle = CANDY.sun;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    }
    // Floating water bubbles
    for (let i = 0; i < 3; i++) {
      const bx = (i - 1) * fw * 0.34;
      const by = -fw * 0.56 - ((time * 36 + i * 24) % 40);
      ctx.beginPath();
      ctx.arc(bx, by, fw * (0.055 + i * 0.015), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(92, 200, 255, 0.55)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  } else if (animalId === 'bear') {
    // Round fluffy bear ears
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * fw * 0.38, -fw * 0.48, fw * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = '#c68642';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * fw * 0.38, -fw * 0.48, fw * 0.095, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe5c4';
      ctx.fill();
    }
    // Rosy cheeks + cute bear nose + flower crown
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * fw * 0.34, noseRelY + fw * 0.08, fw * 0.1, fw * 0.065, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 122, 107, 0.58)';
      ctx.fill();
    }
    drawNoseDot(ctx, 0, noseRelY, fw * 0.085, '#5c3d35');
    ctx.font = `${Math.round(fw * 0.22)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌸', 0, -fw * 0.54 + Math.sin(time * 6) * 3);
  } else if (animalId === 'puppy') {
    // Floppy puppy ears swaying slightly
    const sway = Math.sin(time * 7) * 0.09;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * fw * 0.5, -fw * 0.22);
      ctx.rotate(side * (0.25 + sway));
      ctx.beginPath();
      ctx.ellipse(side * fw * 0.06, fw * 0.22, fw * 0.15, fw * 0.32, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#d9925a';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.restore();
    }
    drawNoseDot(ctx, 0, noseRelY, fw * 0.09, INK);
    // Cute pink wagging tongue under mouth
    ctx.save();
    ctx.translate(0, mouthRelY + fw * 0.08);
    ctx.rotate(Math.sin(time * 12) * 0.12);
    ctx.beginPath();
    ctx.roundRect(-fw * 0.07, 0, fw * 0.14, fw * 0.17, [4, 4, 14, 14]);
    ctx.fillStyle = '#ff7fa8';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  } else if (animalId === 'owl') {
    // Big round starry glasses around eyes + tufted ears + tiny beak
    const eyeHalf = Math.hypot(
      face.rightEyePos.x - face.leftEyePos.x,
      face.rightEyePos.y - face.leftEyePos.y,
    ) * 0.5;
    const lensR = Math.max(fw * 0.18, eyeHalf * 0.85);
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * eyeHalf, 0, lensR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(155, 123, 255, 0.24)';
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = CANDY.sun;
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;

      // Ear tufts
      ctx.beginPath();
      ctx.moveTo(side * fw * 0.28, -fw * 0.36);
      ctx.lineTo(side * fw * 0.44, -fw * 0.62);
      ctx.lineTo(side * fw * 0.16, -fw * 0.44);
      ctx.closePath();
      ctx.fillStyle = CANDY.grape;
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    // Glasses bridge
    ctx.beginPath();
    ctx.moveTo(-eyeHalf + lensR, 0);
    ctx.lineTo(eyeHalf - lensR, 0);
    ctx.stroke();
    // Little golden owl beak
    ctx.beginPath();
    ctx.moveTo(-fw * 0.07, noseRelY - fw * 0.03);
    ctx.lineTo(fw * 0.07, noseRelY - fw * 0.03);
    ctx.lineTo(0, noseRelY + fw * 0.11);
    ctx.closePath();
    ctx.fillStyle = CANDY.sun;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
  } else if (animalId === 'fox') {
    // Pointy orange & cream fox ears
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * fw * 0.34, -fw * 0.4);
      ctx.rotate(side * 0.24);
      ctx.beginPath();
      ctx.moveTo(-fw * 0.16, fw * 0.14);
      ctx.lineTo(0, -fw * 0.28);
      ctx.lineTo(fw * 0.16, fw * 0.14);
      ctx.closePath();
      ctx.fillStyle = '#ff7a45';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-fw * 0.08, fw * 0.08);
      ctx.lineTo(0, -fw * 0.15);
      ctx.lineTo(fw * 0.08, fw * 0.08);
      ctx.closePath();
      ctx.fillStyle = '#fff5e6';
      ctx.fill();
      ctx.restore();
    }
    drawNoseDot(ctx, 0, noseRelY, fw * 0.075, INK);
    drawWhiskers(ctx, 0, noseRelY + fw * 0.02, fw * 0.16, fw * 0.32);
    // Twinkling wink star
    ctx.font = `${Math.round(fw * 0.22)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨', fw * 0.46, -fw * 0.08 + Math.sin(time * 9) * 3);
  }

  ctx.restore();
}

function drawNoseDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawWhiskers(ctx: CanvasRenderingContext2D, cx: number, cy: number, inner: number, outer: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * inner, cy - 4);
    ctx.lineTo(cx + side * outer, cy - 10);
    ctx.moveTo(cx + side * inner, cy + 5);
    ctx.lineTo(cx + side * outer, cy + 9);
    ctx.stroke();
  }
}

/**
 * Captures a cute local-only Polaroid souvenir with the AR animal sticker composited on the child's face.
 */
export function captureAnimalSnapshot(
  video: HTMLVideoElement,
  viewportW: number,
  viewportH: number,
  face: FaceState,
  animal: AnimalPrompt,
): string {
  const outW = 480;
  const outH = 600;
  const off = document.createElement('canvas');
  off.width = outW;
  off.height = outH;
  const c = off.getContext('2d');
  if (!c) return '';

  const snapCover = getCoverTransform(video, outW, outH);
  const viewCover = getCoverTransform(video, viewportW, viewportH);

  // Draw mirrored video frame
  c.save();
  c.translate(outW, 0);
  c.scale(-1, 1);
  c.drawImage(video, snapCover.offsetX, snapCover.offsetY, snapCover.renderedW, snapCover.renderedH);
  c.restore();

  // Remap tracked face landmarks from viewport CSS px into snapshot canvas px
  const mapSnap = (p: { x: number; y: number }) => ({
    x: snapCover.offsetX + ((p.x - viewCover.offsetX) / Math.max(1, viewCover.renderedW)) * snapCover.renderedW,
    y: snapCover.offsetY + ((p.y - viewCover.offsetY) / Math.max(1, viewCover.renderedH)) * snapCover.renderedH,
  });

  const mappedFace: FaceState = {
    ...face,
    nosePos: mapSnap(face.nosePos),
    mouthPos: mapSnap(face.mouthPos),
    leftEyePos: mapSnap(face.leftEyePos),
    rightEyePos: mapSnap(face.rightEyePos),
    faceWidth: face.faceWidth * (snapCover.renderedW / Math.max(1, viewCover.renderedW)),
  };

  drawAnimalSticker(c, mappedFace, animal.id, 0.5, 1);

  // Soft bottom gradient for polaroid caption
  const grad = c.createLinearGradient(0, outH - 165, 0, outH);
  grad.addColorStop(0, 'rgba(58, 45, 92, 0)');
  grad.addColorStop(0.55, 'rgba(58, 45, 92, 0.65)');
  grad.addColorStop(1, 'rgba(58, 45, 92, 0.88)');
  c.fillStyle = grad;
  c.fillRect(0, outH - 165, outW, 165);

  // Polaroid white frame
  c.strokeStyle = '#ffffff';
  c.lineWidth = 12;
  c.strokeRect(6, 6, outW - 12, outH - 12);

  stickerPill(c, outW / 2, outH - 72, `变身成功！${animal.badgeText}`, CANDY.sun, INK, 22);

  c.font = font(800, 14);
  c.fillStyle = 'rgba(255, 255, 255, 0.85)';
  c.textAlign = 'center';
  c.fillText('HandPlay · 萌宠变脸秀', outW / 2, outH - 26);

  try {
    return off.toDataURL('image/jpeg', 0.9);
  } catch {
    return '';
  }
}
