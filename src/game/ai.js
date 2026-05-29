// ============================================================
// ai.js - CPU対戦AI（3段階の難易度）
// プレイヤーと同じ入力 {move, jump, jumpHeld, dash, guard, shoot, super} を生成
// ============================================================

import { ARENA, PLAYER, SHOT } from './constants.js';
import { normalizeAngle, angleDiff, clamp } from '../core/math.js';

const PRESET = {
  easy:   { react: 0.34, aim: 0.55, aggr: 0.45, dodge: 0.35, guardRate: 0.25, shotGap: 0.7,  jumpiness: 0.25, dashRate: 0.2,  superSmart: 0.3, errAng: 0.5 },
  normal: { react: 0.18, aim: 0.78, aggr: 0.65, dodge: 0.6,  guardRate: 0.45, shotGap: 0.45, jumpiness: 0.4,  dashRate: 0.45, superSmart: 0.6, errAng: 0.28 },
  hard:   { react: 0.07, aim: 0.95, aggr: 0.85, dodge: 0.85, guardRate: 0.6,  shotGap: 0.3,  jumpiness: 0.55, dashRate: 0.65, superSmart: 0.9, errAng: 0.12 },
};

export class AIController {
  constructor(difficulty = 'normal') {
    this.set(difficulty);
    this.timer = 0;
    this.decision = this._empty();
    this.targetMove = 0;
    this.guardUntil = 0;
    this.t = 0;
  }

  set(difficulty) {
    this.difficulty = difficulty;
    this.p = PRESET[difficulty] || PRESET.normal;
  }

  _empty() {
    return { move: 0, jump: false, jumpHeld: false, dash: false, guard: false, shoot: false, super: false };
  }

  // me, foe: Player ; projectiles: array ; orb: Orb ; ctx:{cx,cy}
  think(dt, me, foe, projectiles, orbs, ctx) {
    this.t += dt;
    this.timer -= dt;
    const p = this.p;
    const out = this._empty();

    if (!me.alive || !foe) { return out; }

    // 周方向の相対位置（最短方向）
    const dTheta = angleDiff(me.theta, foe.theta); // 正なら相手はtheta増加方向
    const sameSide = Math.sign(dTheta) || 1;
    const angularGap = Math.abs(dTheta);
    const arcDist = angularGap * me.r; // おおよその弧長距離

    // --- 脅威となる発射体の回避 ---
    let danger = null, dangerDist = Infinity;
    const mp = me.worldPos(ctx.cx, ctx.cy);
    for (const pr of projectiles) {
      if (pr.owner === me.id || pr.dead) continue;
      const dx = pr.x - mp.x, dy = pr.y - mp.y;
      const d = Math.hypot(dx, dy);
      // 接近中か（速度ベクトルが自分方向か）
      const toMe = (dx * pr.vx + dy * pr.vy) < 0; // 弾が自分へ向かっている
      if (toMe && d < 240 && d < dangerDist) { danger = pr; dangerDist = d; }
    }

    // 反応の鈍さを再現：一定間隔で判断を更新
    if (this.timer <= 0) {
      this.timer = p.react;

      // 既定：相手の方向へ寄る/離れる
      let move = 0;
      if (Math.random() < p.aggr) {
        // 接近：理想間合いまで詰める
        const ideal = 150;
        if (arcDist > ideal + 30) move = sameSide;
        else if (arcDist < ideal - 40) move = -sameSide;
        else move = (Math.random() < 0.5 ? sameSide : 0);
      } else {
        // 距離を取る
        move = -sameSide;
      }
      this.targetMove = move;

      // ガード判断
      this.wantGuard = false;
      if (danger && dangerDist < 130 && Math.random() < p.guardRate && me.onGround) {
        this.wantGuard = true;
      }

      // ジャンプ判断（接近回避 or 立ち回り）
      this.wantJump = false;
      if (danger && dangerDist < 150 && Math.random() < p.dodge && me.onGround) {
        this.wantJump = true;
      } else if (me.onGround && Math.random() < p.jumpiness * dt * 6) {
        this.wantJump = true;
      }

      // ダッシュ判断（回避 or 接近）
      this.wantDash = false;
      if (me.dashCooldown <= 0) {
        if (danger && dangerDist < 110 && Math.random() < p.dodge) {
          this.wantDash = true;
          // 弾と逆方向へ逃げる
          const prAng = Math.atan2(danger.y - ctx.cy, danger.x - ctx.cx);
          const meAng = me.theta;
          this.targetMove = angleDiff(meAng, prAng) > 0 ? -1 : 1;
        } else if (arcDist > 220 && Math.random() < p.dashRate) {
          this.wantDash = true;
          this.targetMove = sameSide;
        }
      }
    }

    out.move = this.targetMove;
    out.jump = this.wantJump;
    out.jumpHeld = this.wantJump;
    out.guard = this.wantGuard && me.guard > 20;
    out.dash = this.wantDash;
    this.wantJump = false; // ジャンプは単発
    this.wantDash = false;

    // --- 射撃判断（毎フレーム評価、間合いと角度が合えば撃つ） ---
    const aligned = angularGap < 0.55; // 同じ高さ帯（弧上で近い）
    const heightOk = Math.abs(me.r - foe.r) < 90;
    if (me.shotCooldown <= 0 && aligned && heightOk) {
      if (Math.random() < p.aim) {
        // 撃つ間隔をある程度あける
        if (this.t > (this._lastShot || 0) + p.shotGap) {
          out.shoot = true;
          this._lastShot = this.t;
          // 相手の方向を向く
          out.move = out.move || sameSide;
        }
      }
    }

    // --- 必殺技判断 ---
    if (me.energy >= 100) {
      // 賢いAIは間合いを計って撃つ、弱いAIは適当
      const goodTiming = aligned && heightOk;
      if ((goodTiming && Math.random() < p.superSmart) || (Math.random() < (1 - p.superSmart) * 0.02)) {
        out.super = true;
        out.move = out.move || sameSide;
      }
    }

    // 向き調整：相手側を向くように移動入力を補正（撃つ瞬間）
    if (out.shoot || out.super) {
      if (Math.abs(dTheta) > 0.02) out.move = sameSide;
    }

    return out;
  }
}
