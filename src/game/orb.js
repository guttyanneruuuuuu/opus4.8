// ============================================================
// orb.js - エナジーオーブ（中央付近を浮遊。取るとエナジー獲得）
// ============================================================

import { ORB } from './constants.js';
import { TAU, randRange } from '../core/math.js';

export class Orb {
  constructor(cx, cy, particles, audio) {
    this.cx = cx; this.cy = cy;
    this.particles = particles;
    this.audio = audio;
    this.active = true;
    this.respawnTimer = 0;
    this.bobPhase = randRange(0, TAU);
    this.spin = 0;
    this._place();
  }

  _place() {
    // 浮遊半径上のランダム位置
    const ang = randRange(0, TAU);
    const rad = randRange(ORB.FLOAT_RADIUS * 0.4, ORB.FLOAT_RADIUS);
    this.baseX = this.cx + Math.cos(ang) * rad;
    this.baseY = this.cy + Math.sin(ang) * rad;
    this.x = this.baseX;
    this.y = this.baseY;
    this.scale = 0;
    this.active = true;
  }

  update(dt) {
    this.spin += dt * 2;
    this.bobPhase += dt * 2.5;
    if (!this.active) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this._place();
        this.particles.shockwave(this.x, this.y, ORB.orbGlow || '#fff4a3', { maxR: 60, life: 0.4, width: 4 });
      }
      return;
    }
    // ふわふわ浮遊
    this.x = this.baseX + Math.cos(this.bobPhase) * 10;
    this.y = this.baseY + Math.sin(this.bobPhase * 1.3) * 10;
    this.scale += (1 - this.scale) * Math.min(1, dt * 8);
  }

  collect() {
    this.active = false;
    this.respawnTimer = ORB.RESPAWN;
    this.particles.burst(this.x, this.y, '#ffe14d', 18, { speed: 200, life: 0.6, size: 6, shape: 'star' });
    this.particles.shockwave(this.x, this.y, '#fff4a3', { maxR: 90, life: 0.4, width: 6 });
    if (this.audio) this.audio.orbGet();
  }

  draw(ctx) {
    if (!this.active) return;
    const s = this.scale;
    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 1 + Math.sin(this.bobPhase * 2) * 0.08;
    const R = ORB.RADIUS * s * pulse;

    // グロー
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 3);
    g.addColorStop(0, 'rgba(255,244,163,0.9)');
    g.addColorStop(0.4, 'rgba(255,225,77,0.5)');
    g.addColorStop(1, 'rgba(255,225,77,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * 3, 0, TAU);
    ctx.fill();

    // 回転する星
    ctx.rotate(this.spin);
    ctx.fillStyle = '#ffe14d';
    this._star(ctx, 0, 0, R * 1.3, R * 0.6, 6);
    ctx.fill();
    ctx.fillStyle = '#fff7c2';
    this._star(ctx, 0, 0, R * 0.9, R * 0.4, 6);
    ctx.fill();

    // コア
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _star(ctx, cx, cy, outer, inner, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}
