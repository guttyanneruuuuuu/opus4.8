// ============================================================
// player.js - プレイヤー（極座標ベースの重力リング物理）
//
// 座標系:
//   theta : 周方向の角度（アリーナ中心まわり）
//   r     : 中心からの距離（床 = ARENA.RADIUS - PLAYER.RADIUS）
//   vt    : 接線方向の線速度 (px/s)  ＝ 周方向の移動
//   vr    : 半径方向の速度 (px/s)     ＝ ジャンプ/重力
// ============================================================

import { ARENA, PLAYER, GRAVITY, MAX_FALL, COLORS } from './constants.js';
import { clamp, normalizeAngle, TAU } from '../core/math.js';

export class Player {
  constructor(id, color, palette, particles, audio) {
    this.id = id;            // 0 or 1
    this.color = color;
    this.palette = palette;  // {main, dark, light}
    this.particles = particles;
    this.audio = audio;
    this.reset(0);
  }

  reset(theta) {
    this.theta = theta;
    this.r = ARENA.RADIUS - PLAYER.RADIUS;
    this.vt = 0;
    this.vr = 0;
    this.facing = 1;          // +1: theta増加方向, -1: 減少方向
    this.onGround = true;
    this.hp = PLAYER.MAX_HP;
    this.energy = 0;
    this.guard = PLAYER.GUARD_MAX;
    this.isGuarding = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDir = 0;
    this.invuln = 0;
    this.shotCooldown = 0;
    this.hitFlash = 0;
    this.squash = 1;          // 描画用スカッシュ
    this.alive = true;
    this.eyeBlink = 0;
    this.eyeTimer = Math.random() * 3;
    this.animPhase = Math.random() * TAU;
    this.wantSuper = false;
  }

  get floorR() { return ARENA.RADIUS - PLAYER.RADIUS; }

  // ワールド座標（描画・当たり判定用）
  worldPos(cx, cy) {
    return {
      x: cx + Math.cos(this.theta) * this.r,
      y: cy + Math.sin(this.theta) * this.r,
    };
  }

  // 入力構造: {move:-1|0|1, jump:bool, jumpHeld:bool, dash:bool, guard:bool, shoot:bool, super:bool}
  update(dt, input, ctx) {
    if (!this.alive) return;

    // タイマー
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.animPhase += dt * 10;

    // まばたき
    this.eyeTimer -= dt;
    if (this.eyeTimer <= 0) { this.eyeBlink = 0.12; this.eyeTimer = 2 + Math.random() * 3; }
    this.eyeBlink = Math.max(0, this.eyeBlink - dt);

    // ---- ダッシュ処理 ----
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      // ダッシュ中は周方向に高速移動
      this.vt = this.dashDir * PLAYER.DASH_SPEED;
      if (Math.random() < 0.7) {
        const wp = this.worldPos(ctx.cx, ctx.cy);
        const tang = this._tangentAngle();
        this.particles.spray(wp.x, wp.y, tang + Math.PI * (this.dashDir > 0 ? 1 : 0), this.palette.light, 2,
          { speed: 80, life: 0.3, size: 5, spread: 0.4 });
      }
    } else {
      // ガード
      this.isGuarding = false;
      if (input.guard && this.guard > 5 && this.onGround) {
        this.isGuarding = true;
        this.guard = Math.max(0, this.guard - PLAYER.GUARD_DRAIN * dt);
      } else {
        this.guard = Math.min(PLAYER.GUARD_MAX, this.guard + PLAYER.GUARD_REGEN * dt);
      }

      // 周方向の移動（ガード中は移動不可）
      const accel = this.onGround ? PLAYER.RUN_ACCEL : PLAYER.AIR_ACCEL;
      if (!this.isGuarding && input.move !== 0) {
        this.vt += input.move * accel * dt;
        this.facing = input.move > 0 ? 1 : -1;
      } else if (this.onGround) {
        this.vt *= PLAYER.FRICTION;
      } else {
        this.vt *= PLAYER.AIR_FRICTION;
      }
      this.vt = clamp(this.vt, -PLAYER.MAX_RUN, PLAYER.MAX_RUN);
    }

    // ---- ダッシュ発動 ----
    if (input.dash && this.dashCooldown <= 0 && this.dashTimer <= 0 && !this.isGuarding) {
      const dir = input.move !== 0 ? input.move : this.facing;
      this.dashDir = dir;
      this.facing = dir;
      this.dashTimer = PLAYER.DASH_DURATION;
      this.dashCooldown = PLAYER.DASH_COOLDOWN;
      this.invuln = Math.max(this.invuln, PLAYER.DASH_INVULN);
      this.squash = 0.7;
      const wp = this.worldPos(ctx.cx, ctx.cy);
      this.particles.shockwave(wp.x, wp.y, this.palette.light, { maxR: 60, life: 0.3, width: 4 });
      if (this.audio) this.audio.dash();
    }

    // ---- ジャンプ ----
    if (input.jump) this.jumpBuffer = PLAYER.JUMP_BUFFER;
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0) && this.dashTimer <= 0) {
      // 床は外周(r=floorR)。中心方向(r減少)が「上」。
      // ジャンプは中心へ向かって飛ぶので vr を負(r減少方向)にする。
      this.vr = -PLAYER.JUMP_VELOCITY;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.squash = 0.7;
      const wp = this.worldPos(ctx.cx, ctx.cy);
      this.particles.burst(wp.x, wp.y, this.palette.light, 8, { speed: 130, life: 0.4, size: 5 });
      if (this.audio) this.audio.jump();
    }
    // 可変ジャンプ高（離すと減速）
    if (!input.jumpHeld && this.vr < 0) {
      this.vr *= 0.86;
    }

    // ---- 重力（中心へ向かう = r減少方向が「上」なので、重力はr増加方向）----
    // 床はr=floorR(外周近く)。中心はr=0。プレイヤーは内壁を走る。
    // 重力は外周（床）へ引き戻す = r増加方向。
    if (!this.onGround) {
      this.vr += GRAVITY * dt;
      this.vr = clamp(this.vr, -MAX_FALL, MAX_FALL);
    }

    // ---- 位置更新 ----
    // 周方向: 線速度vt を角速度に変換（vt / r）
    const effR = Math.max(40, this.r);
    this.theta += (this.vt / effR) * dt;
    this.theta = normalizeAngle(this.theta);

    // 半径方向
    this.r += this.vr * dt;

    // ---- 床（外周内壁）との衝突 ----
    if (this.r >= this.floorR) {
      this.r = this.floorR;
      if (this.vr > 0) this.vr = 0;
      if (!this.onGround) {
        // 着地
        this.onGround = true;
        this.coyote = PLAYER.COYOTE;
        this.squash = 1.35;
        const wp = this.worldPos(ctx.cx, ctx.cy);
        this.particles.spray(wp.x, wp.y, this._inwardAngle(), this.palette.light, 6,
          { speed: 120, life: 0.35, size: 4, spread: 1.2 });
      }
    } else {
      if (this.onGround && this.vr < 0) {
        // ジャンプで離陸
        this.onGround = false;
      }
      // 床から浮いている
      if (this.r < this.floorR - 1) this.onGround = false;
    }

    // 中心へ行き過ぎ防止（オーブ浮遊域より内側には入れない）
    const minR = 70;
    if (this.r < minR) {
      this.r = minR;
      if (this.vr < 0) this.vr = 0;
    }

    // スカッシュ復帰
    this.squash += (1 - this.squash) * Math.min(1, dt * 12);

    // スーパー意図
    this.wantSuper = !!input.super;
  }

  // 接線方向の角度（theta増加方向の向き）
  _tangentAngle() {
    return this.theta + Math.PI / 2;
  }
  // 中心向きの角度
  _inwardAngle() {
    return this.theta + Math.PI;
  }

  takeDamage(amount, knockbackDir, fromX, fromY, ctx) {
    if (this.invuln > 0 || !this.alive) return false;
    let dmg = amount;
    if (this.isGuarding) {
      dmg = amount * PLAYER.GUARD_CHIP;
      this.guard = Math.max(0, this.guard - 30);
      if (this.audio) this.audio.guard();
      const wp = this.worldPos(ctx.cx, ctx.cy);
      this.particles.shockwave(wp.x, wp.y, '#ffffff', { maxR: 70, life: 0.3, width: 5 });
      if (this.guard <= 0) this.isGuarding = false;
    } else {
      if (this.audio) this.audio.hit();
      this.hitFlash = 0.3;
      const wp = this.worldPos(ctx.cx, ctx.cy);
      this.particles.burst(wp.x, wp.y, this.palette.main, 14, { speed: 240, life: 0.5, size: 6, shape: 'circle' });
      this.particles.shockwave(wp.x, wp.y, this.palette.light, { maxR: 100, life: 0.4, width: 7 });
    }
    this.hp = Math.max(0, this.hp - dmg);

    // ノックバック（接線方向中心 + 少し浮かす）
    const kb = this.isGuarding ? PLAYER.KNOCKBACK * 0.3 : PLAYER.KNOCKBACK;
    this.vt += knockbackDir * kb;
    this.vt = clamp(this.vt, -PLAYER.MAX_RUN * 1.8, PLAYER.MAX_RUN * 1.8);
    if (!this.isGuarding) {
      this.vr = -kb * 0.5; // 少し浮く
      this.onGround = false;
    }
    this.invuln = PLAYER.HIT_INVULN;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }

  addEnergy(v) {
    this.energy = clamp(this.energy + v, 0, 100);
  }

  consumeSuper() {
    this.energy = 0;
  }
}
