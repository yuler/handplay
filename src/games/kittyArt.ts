import { CANDY, INK } from './theme';

export interface KittyVisualState {
  x: number;
  y: number;
  facing: number; // 1 = right, -1 = left
  lookX: number;
  lookY: number;
  speedRatio: number; // 0..1
  inAir: boolean;
  happy: boolean;
  wetTimer: number;
  pounceTimer: number;
  petProgress: number; // 0..1
  time: number;
}

/**
 * Draws an expressive cartoon calico kitten (三花小花猫) on canvas.
 * Cream body, warm orange & cocoa calico patches, eye-tracking pupils, wagging tail, and pink paw pads.
 */
export function drawCalicoKitten(ctx: CanvasRenderingContext2D, k: KittyVisualState) {
  const { x, y, facing, lookX, lookY, speedRatio, inAir, happy, wetTimer, pounceTimer, petProgress, time } = k;
  const isWet = wetTimer > 0;
  const shakeX = isWet ? Math.sin(time * 48) * 5 : 0;
  const runBob = inAir ? 0 : Math.abs(Math.sin(time * (7 + speedRatio * 9))) * (3 + speedRatio * 7);
  const scaleX = inAir ? 0.94 : 1 + Math.sin(time * 12) * 0.03 * speedRatio;
  const scaleY = inAir ? 1.08 : 1 - Math.sin(time * 12) * 0.03 * speedRatio;

  ctx.save();
  ctx.translate(x + shakeX, y - runBob);
  ctx.scale(scaleX, scaleY);

  // Happy fever glow ring behind kitten
  if (happy) {
    const pulse = 1 + Math.sin(time * 8) * 0.08;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, -10, 62 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 201, 60, 0.28)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = CANDY.sun;
    ctx.stroke();
    ctx.restore();
  }

  // Soft ground shadow (only small when jumping)
  ctx.beginPath();
  ctx.ellipse(0, 40, inAir ? 24 : 36, inAir ? 6 : 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(58, 45, 92, 0.22)';
  ctx.fill();

  // ---- Tail (behind body) ----
  const tailWag = Math.sin(time * (happy ? 14 : 6.5)) * (happy ? 18 : 11);
  const tailDir = -facing;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailDir * 24, 18);
  ctx.quadraticCurveTo(tailDir * 52, 8 + tailWag * 0.5, tailDir * 48, -18 + tailWag);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 18;
  ctx.stroke();
  ctx.strokeStyle = '#ff9f43';
  ctx.lineWidth = 11;
  ctx.stroke();
  // Cocoa tail tip
  ctx.beginPath();
  ctx.arc(tailDir * 48, -18 + tailWag, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = '#5c3d35';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  // ---- Chubby Body ----
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 18, 30, 24, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();
  // Clip calico patches inside body
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(-18, 16, 17, 15, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#ff9f43';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(20, 12, 15, 13, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#5c3d35';
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  // ---- Little Paws ----
  const stepOff = inAir ? 5 : Math.sin(time * 16) * 4 * speedRatio;
  for (const side of [-1, 1]) {
    const px = side * 15;
    const py = 35 + (side === -1 ? stepOff : -stepOff);
    ctx.beginPath();
    ctx.ellipse(px, py, 10, 7.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  // ---- Head ----
  ctx.save();
  const headTilt = Math.sin(time * (happy ? 10 : 4)) * (happy ? 0.08 : 0.03) + facing * speedRatio * 0.05;
  ctx.translate(0, -14);
  ctx.rotate(headTilt);

  // Ears
  const earWiggle = happy ? Math.sin(time * 16) * 3 : 0;
  // Left ear (orange patch)
  drawCatEar(ctx, -22, -24 + earWiggle, -0.35, '#ff9f43');
  // Right ear (cocoa patch)
  drawCatEar(ctx, 22, -24 - earWiggle, 0.35, '#5c3d35');

  // Round head base + clipped calico forehead patches
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 29, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fffaf0';
  ctx.fill();

  ctx.save();
  ctx.clip();
  // Orange left forehead patch
  ctx.beginPath();
  ctx.ellipse(-20, -16, 22, 18, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#ff9f43';
  ctx.fill();
  // Cocoa right forehead patch
  ctx.beginPath();
  ctx.ellipse(22, -17, 19, 15, 0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#5c3d35';
  ctx.fill();
  // Subtle tabby stripes on forehead
  ctx.strokeStyle = 'rgba(92, 61, 53, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const dx of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.moveTo(dx, -26);
    ctx.lineTo(dx * 0.8, -19);
    ctx.stroke();
  }
  ctx.restore();

  // Head outline
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 29, 0, 0, Math.PI * 2);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Rosy cheeks
  ctx.fillStyle = 'rgba(255, 122, 145, 0.48)';
  ctx.beginPath();
  ctx.ellipse(-21, 8, 7, 4.5, 0, 0, Math.PI * 2);
  ctx.ellipse(21, 8, 7, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const dxLook = lookX - x;
  const dyLook = lookY - (y - 14);
  const lookAngle = Math.atan2(dyLook, dxLook);
  const lookDist = Math.min(3.2, Math.hypot(dxLook, dyLook) / 60);
  const pupilDx = Math.cos(lookAngle) * lookDist;
  const pupilDy = Math.sin(lookAngle) * lookDist;

  if (isWet) {
    // Cute "> <" wet shake eyes
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-17, -6);
    ctx.lineTo(-10, -2);
    ctx.lineTo(-17, 2);
    ctx.moveTo(17, -6);
    ctx.lineTo(10, -2);
    ctx.lineTo(17, 2);
    ctx.stroke();
  } else if (happy || petProgress > 0.35) {
    // Happy "^ ^" smiling eyes
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-13, -1, 6.5, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(13, -1, 6.5, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else {
    // Big sparkling eyes tracking the wand
    for (const ex of [-13, 13]) {
      ctx.beginPath();
      ctx.ellipse(ex, -2, 6.8, 7.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + pupilDx * 0.7 - 1.6, -2 + pupilDy * 0.7 - 2, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + pupilDx * 0.5 + 2, -2 + pupilDy * 0.5 + 2.2, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  // Cute pink nose
  ctx.beginPath();
  ctx.moveTo(-4, 4);
  ctx.lineTo(4, 4);
  ctx.lineTo(0, 8.5);
  ctx.closePath();
  ctx.fillStyle = '#ff7fa8';
  ctx.fill();

  // Mouth
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pounceTimer > 0 || happy) {
    // Open happy meow mouth
    ctx.beginPath();
    ctx.arc(0, 9.5, 6, 0, Math.PI);
    ctx.fillStyle = '#ff7a6b';
    ctx.fill();
    ctx.stroke();
  } else {
    // Classic ":3" cat mouth
    ctx.beginPath();
    ctx.arc(-4.5, 9.5, 4.5, 0.1, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4.5, 9.5, 4.5, Math.PI * 0.15, Math.PI * 0.9);
    ctx.stroke();
  }

  // Whiskers
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 24, 3);
    ctx.lineTo(side * 39, 0);
    ctx.moveTo(side * 24, 8);
    ctx.lineTo(side * 38, 10);
    ctx.stroke();
  }

  // Little crown when in happy purr fever!
  if (happy) {
    ctx.save();
    ctx.translate(0, -34);
    ctx.rotate(Math.sin(time * 9) * 0.1);
    ctx.beginPath();
    ctx.moveTo(-11, 4);
    ctx.lineTo(-13, -8);
    ctx.lineTo(-4, -2);
    ctx.lineTo(0, -11);
    ctx.lineTo(4, -2);
    ctx.lineTo(13, -8);
    ctx.lineTo(11, 4);
    ctx.closePath();
    ctx.fillStyle = CANDY.sun;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore(); // end head

  // Outstretched pink paw swipe when pouncing on a treat
  if (pounceTimer > 0) {
    const ext = Math.sin((pounceTimer / 0.28) * Math.PI);
    const pawX = facing * (24 + ext * 22);
    const pawY = -4 - ext * 14;
    ctx.save();
    ctx.translate(pawX, pawY);
    ctx.rotate(facing * -0.4);
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Pink toe beans!
    ctx.fillStyle = '#ff8fc7';
    ctx.beginPath();
    ctx.arc(0, 2, 4, 0, Math.PI * 2);
    ctx.arc(-4.5, -3.5, 2, 0, Math.PI * 2);
    ctx.arc(0, -5, 2, 0, Math.PI * 2);
    ctx.arc(4.5, -3.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Wet water droplets flying off
  if (isWet) {
    ctx.fillStyle = CANDY.sky;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + time * 8;
      const dx = Math.cos(ang) * 44;
      const dy = Math.sin(ang) * 32 - 8;
      ctx.beginPath();
      ctx.arc(dx, dy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Petting heart charge arc around kitten head
  if (petProgress > 0.05 && !happy) {
    ctx.beginPath();
    ctx.arc(0, -14, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, petProgress));
    ctx.strokeStyle = CANDY.pink;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.restore();
}

function drawCatEar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  outerColor: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-12, 12);
  ctx.quadraticCurveTo(-2, -16, 0, -16);
  ctx.quadraticCurveTo(2, -16, 12, 12);
  ctx.closePath();
  ctx.fillStyle = outerColor;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Inner pink triangle
  ctx.beginPath();
  ctx.moveTo(-6, 7);
  ctx.lineTo(0, -8);
  ctx.lineTo(6, 7);
  ctx.closePath();
  ctx.fillStyle = '#ff9ec4';
  ctx.fill();
  ctx.restore();
}

/**
 * Draws the magic feather-and-bell cat wand following the player's fingertip.
 */
export function drawCatWand(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  danglingX: number,
  danglingY: number,
  isPetting: boolean,
  time: number,
) {
  ctx.save();

  // String from fingertip to dangling feather bell
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  const midX = (tipX + danglingX) * 0.5 + Math.sin(time * 8) * 6;
  const midY = (tipY + danglingY) * 0.5 + 8;
  ctx.quadraticCurveTo(midX, midY, danglingX, danglingY);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = CANDY.cream;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Fingertip glowing ring
  ctx.beginPath();
  ctx.arc(tipX, tipY, isPetting ? 18 : 13, 0, Math.PI * 2);
  ctx.fillStyle = isPetting ? 'rgba(255, 143, 199, 0.45)' : 'rgba(255, 201, 60, 0.45)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Three colorful fluttering feathers below the bell
  const feathers = [
    { ang: -0.45, color: CANDY.coral },
    { ang: 0, color: CANDY.sky },
    { ang: 0.45, color: CANDY.pink },
  ];
  const sway = Math.sin(time * 10) * 0.14;
  for (const f of feathers) {
    ctx.save();
    ctx.translate(danglingX, danglingY + 6);
    ctx.rotate(f.ang + sway);
    ctx.beginPath();
    ctx.ellipse(0, 15, 6.5, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = f.color;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.restore();
  }

  // Golden jingle bell
  ctx.beginPath();
  ctx.arc(danglingX, danglingY, 10, 0, Math.PI * 2);
  ctx.fillStyle = CANDY.sun;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(danglingX - 3, danglingY - 3, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}
