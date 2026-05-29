// ============================================================
// particles.js - パーティクルエフェクトシステム
// ============================================================

import { randRange, TAU } from './math.js';

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.shockwaves = [];
    this.texts = [];
  }

  clear() {
    this.particles.length = 0;
    this.shockwaves.length = 0;
    this.texts.length = 0;
  }

  // 爆発・飛沫
  burst(x, y, color, count = 12, opts = {}) {
    const speed = opts.speed ?? 220;
    const size = opts.size ?? 5;
    const life = opts.life ?? 0.6;
    const gravity = opts.gravity ?? 0;
    for (let i = 0; i < count; i++) {
      const a = randRange(0, TAU);
      const s = randRange(speed * 0.3, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, maxLife: life,
        size: randRange(size * 0.5, size),
        color, gravity,
        shape: opts.shape ?? 'circle',
        rot: randRange(0, TAU),
        spin: randRange(-8, 8),
      });
    }
  }

  // 指向性の噴出（ダッシュの軌跡など）
  spray(x, y, dir, color, count = 6, opts = {}) {
    const speed = opts.speed ?? 140;
    const spread = opts.spread ?? 0.6;
    const life = opts.life ?? 0.4;
    const size = opts.size ?? 4;
    for (let i = 0; i < count; i++) {
      const a = dir + randRange(-spread, spread);
      const s = randRange(speed * 0.4, speed);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, maxLife: life,
        size: randRange(size * 0.5, size),
        color, gravity: 0,
        shape: opts.shape ?? 'circle',
        rot: 0, spin: 0,
      });
    }
  }

  // 衝撃波リング
  shockwave(x, y, color, opts = {}) {
    this.shockwaves.push({
      x, y, color,
      r: opts.r0 ?? 8,
      maxR: opts.maxR ?? 120,
      life: opts.life ?? 0.45,
      maxLife: opts.life ?? 0.45,
      width: opts.width ?? 6,
    });
  }

  // 浮き上がるテキスト
  floatText(x, y, text, color, opts = {}) {
    this.texts.push({
      x, y, text, color,
      life: opts.life ?? 0.9,
      maxLife: opts.life ?? 0.9,
      vy: opts.vy ?? -60,
      size: opts.size ?? 28,
    });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.rot += p.spin * dt;
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      if (s.life <= 0) { this.shockwaves.splice(i, 1); continue; }
      const t = 1 - s.life / s.maxLife;
      s.r = s.r + (s.maxR - s.r) * Math.min(1, dt * 8);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.life -= dt;
      if (tx.life <= 0) { this.texts.splice(i, 1); continue; }
      tx.y += tx.vy * dt;
      tx.vy *= 0.92;
    }
  }

  draw(ctx) {
    // 衝撃波
    for (const s of this.shockwaves) {
      const t = s.life / s.maxLife;
      ctx.save();
      ctx.globalAlpha = t * 0.8;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * t;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // パーティクル
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.3);
      ctx.fillStyle = p.color;
      if (p.shape === 'star') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        this._star(ctx, 0, 0, p.size, p.size * 0.5, 5);
        ctx.fill();
      } else if (p.shape === 'square') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size * t;
        ctx.fillRect(-s, -s, s * 2, s * 2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    // テキスト
    for (const tx of this.texts) {
      const t = tx.life / tx.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.font = `900 ${tx.size}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
      ctx.restore();
    }
  }

  _star(ctx, cx, cy, outer, inner, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}
