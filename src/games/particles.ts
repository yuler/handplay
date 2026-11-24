import { font, INK } from './theme';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  gravity: number;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface ShockRing {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: string;
  life: number;
  maxLife: number;
}

export class FxSystem {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: ShockRing[] = [];
  private shakeTime = 0;
  private shakeAmp = 0;

  clear() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.shakeTime = 0;
    this.shakeAmp = 0;
  }

  shake(amp: number, duration = 0.24) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  getShakeOffset(): { x: number; y: number } {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const mag = this.shakeAmp * Math.min(1, this.shakeTime / 0.24);
    return {
      x: (Math.random() - 0.5) * 2 * mag,
      y: (Math.random() - 0.5) * 2 * mag,
    };
  }

  burst(x: number, y: number, color: string, count = 22, speed = 340) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = speed * (0.35 + Math.random() * 0.8);
      const maxLife = 0.35 + Math.random() * 0.35;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        size: 3 + Math.random() * 5,
        color,
        life: maxLife,
        maxLife,
        gravity: 520,
      });
    }
    this.rings.push({
      x,
      y,
      r: 12,
      maxR: 110,
      color,
      life: 0.32,
      maxLife: 0.32,
    });
  }

  popText(x: number, y: number, text: string, color = '#ffffff', size = 28) {
    this.texts.push({
      x,
      y,
      vy: -95,
      text,
      color,
      size,
      life: 0.85,
      maxLife: 0.85,
    });
  }

  update(dt: number) {
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const p = 1 - r.life / r.maxLife;
      r.r = 12 + (r.maxR - 12) * (1 - (1 - p) ** 3);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= Math.exp(-dt * 2.5);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const r of this.rings) {
      const alpha = Math.max(0, r.life / r.maxLife);
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * alpha + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * alpha), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const p = 1 - t.life / t.maxLife;
      const alpha = p < 0.7 ? 1 : Math.max(0, (1 - p) / 0.3);
      const scale = p < 0.15 ? 0.7 + (p / 0.15) * 0.45 : 1.15 - Math.min(0.15, (p - 0.15) * 0.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(t.x, t.y);
      ctx.scale(scale, scale);
      ctx.font = font(900, t.size);
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}
