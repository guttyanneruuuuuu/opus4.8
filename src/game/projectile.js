// ============================================================
// projectile.js - 発射体（通常ショット & ワープショット）
// ワールド直交座標で動く。ワープショットは敵へ緩やかにホーミング。
// ============================================================

import { SHOT, SUPER, ARENA } from './constants.js';
import { TAU } from '../core/math.js';

export class Projectile {
  constructor(owner, x, y, vx, vy, isSuper, palette, particles) {
    this.owner = owner;       // 0 or 1
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.isSuper = isSuper;
    this.palette = palette;
    this.particles = particles;
    this.r = isSuper ? SUPER.RADIUS : SHOT.RADIUS;
    this.damage = isSuper ? SUPER.DAMAGE : SHOT.DAMAGE;
    this.knockback = isSuper ? SUPER.KNOCKBACK : SHOT.KNOCKBACK;
    this.life = isSuper ? SUPER.LIFE : SHOT.LIFE;
    this.dead = false;
    this.trail = [];
    this.spin = 0;
  }

  update(dt, cx, cy, target) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.spin += dt * 12;

    // ワープショット: ターゲットへ緩やかに曲がる（ステア操舵）
    if (this.isSuper && target && target.alive) {
      const tp = target.worldPos(cx, cy);
      const dx = tp.x - this.x, dy = tp.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / d) * SUPER.SPEED;
      const desiredVy = (dy / d) * SUPER.SPEED;
      // 1秒あたりどれだけ希望方向へ寄せるか（0..1）
      const steer = Math.min(1, (SUPER.WARP_STRENGTH / SUPER.SPEED) * dt);
      this.vx += (desiredVx - this.vx) * steer;
      this.vy += (desiredVy - this.vy) * steer;
      // 速度を一定に保つ
      const sp = Math.hypot(this.vx, this.vy) || 1;
      this.vx = (this.vx / sp) * SUPER.SPEED;
      this.vy = (this.vy / sp) * SUPER.SPEED;
    }

    // トレイル記録
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > (this.isSuper ? 14 : 7)) this.trail.shift();

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // アリーナ外周（内壁）に当たったら消滅 or 反射
    const dcx = this.x - cx, dcy = this.y - cy;
    const distC = Math.hypot(dcx, dcy);
    const limit = ARENA.RADIUS - this.r;
    if (distC >= limit) {
      // 壁に当たって弾ける
      this.dead = true;
      this.particles.burst(this.x, this.y, this.palette.light, this.isSuper ? 16 : 8,
        { speed: 180, life: 0.4, size: this.isSuper ? 6 : 4 });
      this.particles.shockwave(this.x, this.y, this.palette.main,
        { maxR: this.isSuper ? 90 : 50, life: 0.3, width: this.isSuper ? 6 : 4 });
    }
  }

  draw(ctx) {
    // トレイル
    for (let i = 0; i < this.trail.length; i++) {
      const t = i / this.trail.length;
      const p = this.trail[i];
      ctx.save();
      ctx.globalAlpha = t * 0.5;
      ctx.fillStyle = this.palette.light;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.r * t * 0.9, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.isSuper) {
      // ワープショット：きらめく星型コア
      ctx.rotate(this.spin);
      // グロー
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, this.r * 2.2);
      g.addColorStop(0, this.palette.light);
      g.addColorStop(0.5, this.palette.main);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.r * 2.2, 0, TAU);
      ctx.fill();
      // 星
      ctx.fillStyle = '#fff';
      this._star(ctx, 0, 0, this.r * 1.2, this.r * 0.5, 5);
      ctx.fill();
      ctx.fillStyle = this.palette.main;
      this._star(ctx, 0, 0, this.r * 0.8, this.r * 0.32, 5);
      ctx.fill();
    } else {
      // 通常ショット：丸いキャンディ
      const g = ctx.createRadialGradient(-this.r * 0.3, -this.r * 0.3, 1, 0, 0, this.r);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.4, this.palette.light);
      g.addColorStop(1, this.palette.main);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, TAU);
      ctx.fill();
      // ハイライト
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(-this.r * 0.3, -this.r * 0.3, this.r * 0.35, 0, TAU);
      ctx.fill();
    }
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
