// ============================================================
// engine.js - ゲームエンジン本体（状態管理・更新・描画）
// ============================================================

import { ARENA, PLAYER, SHOT, SUPER, ORB, MATCH, COLORS, GRAVITY } from './constants.js';
import { Player } from './player.js';
import { Projectile } from './projectile.js';
import { Orb } from './orb.js';
import { ParticleSystem } from '../core/particles.js';
import { TAU, clamp, dist, randRange, normalizeAngle } from '../core/math.js';

const STATE = {
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd',
};

export class GameEngine {
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audio;
    this.particles = new ParticleSystem();

    this.players = [
      new Player(0, COLORS.p1, { main: COLORS.p1, dark: COLORS.p1Dark, light: COLORS.p1Light }, this.particles, audio),
      new Player(1, COLORS.p2, { main: COLORS.p2, dark: COLORS.p2Dark, light: COLORS.p2Light }, this.particles, audio),
    ];
    this.projectiles = [];
    this.orbs = [];

    this.scores = [0, 0];
    this.state = STATE.COUNTDOWN;
    this.countdown = MATCH.COUNTDOWN + 1;
    this.roundTime = MATCH.ROUND_TIME;
    this.roundWinner = -1;
    this.matchWinner = -1;
    this.roundNumber = 1;

    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.hitStop = 0;

    this.cx = 0; this.cy = 0;
    this.scale = 1;
    this.bgPhase = 0;
    this.cloudOffset = 0;

    this.onMatchEnd = null;       // callback(winnerIndex)
    this.onRoundChange = null;    // callback(scores, roundNumber)
    this.callbacks = {};

    this._lastCountInt = -1;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = rect.width;
    this.viewH = rect.height;
    this.cx = this.viewW / 2;
    this.cy = this.viewH / 2;
    // アリーナがビューに収まるようスケール
    const margin = 30;
    const fit = Math.min(this.viewW, this.viewH) / 2 - margin;
    this.scale = clamp(fit / ARENA.RADIUS, 0.4, 1.4);
  }

  startMatch() {
    this.scores = [0, 0];
    this.roundNumber = 1;
    this.matchWinner = -1;
    this.startRound();
  }

  startRound() {
    this.players[0].reset(Math.PI * 0.5);     // 下側
    this.players[1].reset(-Math.PI * 0.5);    // 上側
    this.projectiles.length = 0;
    this.orbs = [];
    for (let i = 0; i < ORB.COUNT; i++) {
      this.orbs.push(new Orb(this.cx, this.cy, this.particles, this.audio));
    }
    this.particles.clear();
    this.state = STATE.COUNTDOWN;
    this.countdown = MATCH.COUNTDOWN + 1;
    this.roundTime = MATCH.ROUND_TIME;
    this.roundWinner = -1;
    this._lastCountInt = -1;
  }

  triggerShake(amount) {
    this.shake = Math.min(this.shake + amount, 24);
  }
  triggerHitStop(t) {
    this.hitStop = Math.max(this.hitStop, t);
  }

  // inputs: [input0, input1]  各 {move,jump,jumpHeld,dash,guard,shoot,super}
  update(dt, inputs) {
    // ヒットストップ
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt = dt * 0.08; // ほぼ停止
    }
    dt = Math.min(dt, 1 / 30); // 安定化

    this.bgPhase += dt * 0.3;
    this.cloudOffset += dt * 8;

    // 画面シェイク減衰
    this.shake *= 0.86;
    if (this.shake < 0.2) this.shake = 0;
    this.shakeX = randRange(-this.shake, this.shake);
    this.shakeY = randRange(-this.shake, this.shake);

    const ctx = { cx: this.cx, cy: this.cy };

    if (this.state === STATE.COUNTDOWN) {
      this.countdown -= dt;
      const ci = Math.ceil(this.countdown - 1);
      if (ci !== this._lastCountInt) {
        this._lastCountInt = ci;
        if (ci >= 1 && ci <= MATCH.COUNTDOWN) { if (this.audio) this.audio.countdown(); }
        else if (ci === 0) { if (this.audio) this.audio.go(); }
      }
      if (this.countdown <= 1) {
        this.state = STATE.PLAYING;
      }
      // カウントダウン中もパーティクル・オーブは更新
      this.orbs.forEach((o) => o.update(dt));
      this.particles.update(dt);
      return;
    }

    if (this.state === STATE.PLAYING) {
      this.roundTime -= dt;

      // プレイヤー更新
      for (let i = 0; i < 2; i++) {
        const inp = inputs[i] || {};
        const p = this.players[i];
        p.update(dt, inp, ctx);

        // ショット発射
        if (inp.shoot && p.shotCooldown <= 0 && p.alive && p.dashTimer <= 0) {
          this._fireShot(p, false);
        }
        // 必殺技
        if (inp.super && p.energy >= SUPER.COST && p.alive && p.dashTimer <= 0) {
          this._fireShot(p, true);
          p.consumeSuper();
          if (this.audio) this.audio.superShot();
          this.triggerShake(10);
        }
      }

      // プレイヤー同士の押し合い（重なり防止）
      this._resolvePlayerCollision();

      // オーブ更新 & 取得判定
      for (const orb of this.orbs) {
        orb.update(dt);
        if (orb.active) {
          for (const p of this.players) {
            if (!p.alive) continue;
            const wp = p.worldPos(this.cx, this.cy);
            if (dist(wp.x, wp.y, orb.x, orb.y) < ORB.RADIUS + PLAYER.RADIUS) {
              orb.collect();
              p.addEnergy(ORB.ENERGY_PER);
              this.particles.floatText(wp.x, wp.y - 30, '+ENERGY', orb.scale ? '#f0a500' : '#f0a500', { size: 20, life: 0.8 });
              break;
            }
          }
        }
      }

      // 発射体更新 & 命中判定
      for (const pr of this.projectiles) {
        const target = this.players[1 - pr.owner];
        pr.update(dt, this.cx, this.cy, pr.isSuper ? target : null);
        if (pr.dead) continue;
        // 命中
        const tp = target.worldPos(this.cx, this.cy);
        if (target.alive && dist(pr.x, pr.y, tp.x, tp.y) < pr.r + PLAYER.RADIUS) {
          const kbDir = Math.sign(normalizeAngle(target.theta - this.players[pr.owner].theta)) || 1;
          const hit = target.takeDamage(pr.damage, kbDir, pr.x, pr.y, ctx);
          if (hit) {
            pr.dead = true;
            this.triggerShake(pr.isSuper ? 16 : 7);
            this.triggerHitStop(pr.isSuper ? 0.12 : 0.05);
            if (!target.isGuarding) {
              this.particles.floatText(tp.x, tp.y - 40, `-${Math.round(pr.damage)}`, target.palette.dark, { size: 24, life: 0.7 });
            } else {
              this.particles.floatText(tp.x, tp.y - 40, 'GUARD', '#7aa0ff', { size: 20, life: 0.6 });
            }
            if (!target.alive) this._onPlayerDown(1 - pr.owner);
          }
        }
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);

      this.particles.update(dt);

      // 勝敗判定
      if (this.roundTime <= 0) {
        // 時間切れ：HP多い方の勝ち
        const h0 = this.players[0].hp, h1 = this.players[1].hp;
        if (h0 > h1) this._endRound(0);
        else if (h1 > h0) this._endRound(1);
        else this._endRound(-1); // 引き分け
      }
      return;
    }

    if (this.state === STATE.ROUND_END) {
      this.roundEndTimer -= dt;
      this.orbs.forEach((o) => o.update(dt));
      this.particles.update(dt);
      // プレイヤーも軽く更新（落下など）
      for (const p of this.players) p.update(dt, {}, ctx);
      if (this.roundEndTimer <= 0) {
        if (this.matchWinner >= 0) {
          this.state = STATE.MATCH_END;
          if (this.onMatchEnd) this.onMatchEnd(this.matchWinner);
        } else {
          this.roundNumber++;
          this.startRound();
        }
      }
      return;
    }

    if (this.state === STATE.MATCH_END) {
      this.particles.update(dt);
      for (const p of this.players) p.update(dt, {}, ctx);
      return;
    }
  }

  _fireShot(p, isSuper) {
    const wp = p.worldPos(this.cx, this.cy);
    // 発射方向 = facing に応じた接線方向
    const tang = p.theta + Math.PI / 2 * p.facing;
    const speed = isSuper ? SUPER.SPEED : SHOT.SPEED;
    const vx = Math.cos(tang) * speed;
    const vy = Math.sin(tang) * speed;
    const offset = PLAYER.RADIUS + (isSuper ? SUPER.RADIUS : SHOT.RADIUS) + 4;
    const sx = wp.x + Math.cos(tang) * offset;
    const sy = wp.y + Math.sin(tang) * offset;
    const proj = new Projectile(p.id, sx, sy, vx, vy, isSuper, p.palette, this.particles);
    this.projectiles.push(proj);
    p.shotCooldown = SHOT.COOLDOWN;
    if (!isSuper && this.audio) this.audio.shoot();
    // マズルフラッシュ
    this.particles.burst(sx, sy, p.palette.light, isSuper ? 10 : 5, { speed: 120, life: 0.3, size: isSuper ? 6 : 3 });
  }

  _resolvePlayerCollision() {
    const a = this.players[0], b = this.players[1];
    if (!a.alive || !b.alive) return;
    const ap = a.worldPos(this.cx, this.cy);
    const bp = b.worldPos(this.cx, this.cy);
    const d = dist(ap.x, ap.y, bp.x, bp.y);
    const minD = PLAYER.RADIUS * 2;
    if (d < minD && d > 0.001) {
      // 周方向に押し離す
      const push = (minD - d) / minD;
      const dir = Math.sign(normalizeAngle(b.theta - a.theta)) || 1;
      a.vt -= dir * push * 300;
      b.vt += dir * push * 300;
    }
  }

  _onPlayerDown(loserIdx) {
    const winnerIdx = 1 - loserIdx;
    const lp = this.players[loserIdx].worldPos(this.cx, this.cy);
    this.particles.burst(lp.x, lp.y, this.players[loserIdx].palette.main, 30, { speed: 360, life: 0.9, size: 8, shape: 'star' });
    this.particles.shockwave(lp.x, lp.y, this.players[loserIdx].palette.light, { maxR: 200, life: 0.6, width: 10 });
    this.triggerShake(20);
    this.triggerHitStop(0.2);
    this._endRound(winnerIdx);
  }

  _endRound(winnerIdx) {
    if (this.state === STATE.ROUND_END || this.state === STATE.MATCH_END) return;
    this.roundWinner = winnerIdx;
    if (winnerIdx >= 0) {
      this.scores[winnerIdx]++;
      const wp = this.players[winnerIdx].worldPos(this.cx, this.cy);
      this.particles.floatText(this.cx, this.cy - 40, winnerIdx === 0 ? 'P1 WIN!' : (this.isPvP ? 'P2 WIN!' : 'CPU WIN!'),
        this.players[winnerIdx].palette.dark, { size: 40, life: 1.4, vy: -20 });
    }
    if (this.scores[winnerIdx] >= MATCH.ROUNDS_TO_WIN) {
      this.matchWinner = winnerIdx;
    }
    this.state = STATE.ROUND_END;
    this.roundEndTimer = winnerIdx >= 0 ? 2.2 : 1.8;
    if (this.onRoundChange) this.onRoundChange(this.scores, this.roundNumber);
  }

  // ============== 描画 ==============
  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    this._drawBackground(ctx);

    // ワールド変換（シェイク適用）
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    this._drawArena(ctx);

    // オーブ
    for (const orb of this.orbs) orb.draw(ctx);

    // プレイヤー
    for (const p of this.players) {
      if (p.alive || this.state === STATE.ROUND_END || this.state === STATE.MATCH_END) {
        this._drawPlayer(ctx, p);
      }
    }

    // 発射体
    for (const pr of this.projectiles) pr.draw(ctx);

    // パーティクル
    this.particles.draw(ctx);

    ctx.restore(); // shake

    // カウントダウン等のオーバーレイ
    this._drawOverlay(ctx);

    ctx.restore();
  }

  _drawBackground(ctx) {
    // 明るいサンセットグラデーション
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, COLORS.bgTop);
    g.addColorStop(1, COLORS.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // ふわふわ浮かぶ装飾の円（背景の泡）
    ctx.save();
    const bubbleColors = ['rgba(255,210,138,0.25)', 'rgba(127,224,192,0.2)', 'rgba(201,182,255,0.22)', 'rgba(255,122,138,0.15)'];
    for (let i = 0; i < 7; i++) {
      const t = this.bgPhase + i * 1.7;
      const x = (this.viewW * ((i * 0.16 + Math.sin(t * 0.5) * 0.05 + 0.1) % 1));
      const y = (this.viewH * ((i * 0.23 + (this.cloudOffset * (0.0002 + i * 0.00003))) % 1.2)) - this.viewH * 0.1;
      const r = 40 + (i % 3) * 30 + Math.sin(t) * 10;
      ctx.fillStyle = bubbleColors[i % bubbleColors.length];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawArena(ctx) {
    const cx = this.cx, cy = this.cy;
    const R = ARENA.RADIUS * this.scale;

    // 外側の柔らかい影
    ctx.save();
    ctx.shadowColor = 'rgba(244,169,75,0.4)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = COLORS.arenaWall;
    ctx.beginPath();
    ctx.arc(cx, cy, R + ARENA.WALL_THICK * this.scale, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 壁リング（グラデーション）
    const wallGrad = ctx.createRadialGradient(cx, cy, R - 4, cx, cy, R + ARENA.WALL_THICK * this.scale);
    wallGrad.addColorStop(0, COLORS.arenaWall);
    wallGrad.addColorStop(1, COLORS.arenaWallDark);
    ctx.fillStyle = wallGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R + ARENA.WALL_THICK * this.scale, 0, TAU);
    ctx.arc(cx, cy, R, 0, TAU, true);
    ctx.fill();

    // 内側フィールド（明るいクリーム + 中心への淡いグラデ）
    const fieldGrad = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
    fieldGrad.addColorStop(0, '#ffffff');
    fieldGrad.addColorStop(0.7, COLORS.arena);
    fieldGrad.addColorStop(1, '#fff0d8');
    ctx.fillStyle = fieldGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();

    // 同心円ガイド
    ctx.strokeStyle = 'rgba(244,169,75,0.18)';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * (i / 4), 0, TAU);
      ctx.stroke();
    }

    // 内壁の目盛り（明るいドット）
    ctx.fillStyle = 'rgba(244,169,75,0.5)';
    const dots = 48;
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * TAU;
      const dx = cx + Math.cos(a) * (R - 8);
      const dy = cy + Math.sin(a) * (R - 8);
      ctx.beginPath();
      ctx.arc(dx, dy, 2.2, 0, TAU);
      ctx.fill();
    }

    // 中心マーク（オーブ出現域）
    ctx.strokeStyle = 'rgba(255,225,77,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, ORB.FLOAT_RADIUS * this.scale, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawPlayer(ctx, p) {
    const wp = p.worldPos(this.cx, this.cy);
    // ワールド座標はアリーナ半径(360)基準。scale適用のため中心からスケール
    const sx = this.cx + (wp.x - this.cx) * this.scale;
    const sy = this.cy + (wp.y - this.cy) * this.scale;
    const R = PLAYER.RADIUS * this.scale;

    ctx.save();
    ctx.translate(sx, sy);
    // キャラの「上」は中心方向（theta+PI 向きが足元→中心が頭上）
    // 足が外周(壁)に着くので、回転は theta に合わせる
    ctx.rotate(p.theta + Math.PI / 2);

    // スカッシュ＆ストレッチ
    const sq = p.squash;
    ctx.scale(2 - sq, sq);

    // 影
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, R * 0.9, R * 0.9, R * 0.35, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // ダッシュ無敵中は半透明
    if (p.dashTimer > 0) ctx.globalAlpha = 0.7;
    if (p.invuln > 0 && p.hitFlash <= 0 && p.dashTimer <= 0) {
      // 点滅
      if (Math.floor(p.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    }

    // ガードシールド
    if (p.isGuarding) {
      ctx.save();
      const pulse = 1 + Math.sin(p.animPhase * 2) * 0.05;
      const sg = ctx.createRadialGradient(0, 0, R, 0, 0, R * 1.9 * pulse);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.7, 'rgba(180,220,255,0.3)');
      sg.addColorStop(1, 'rgba(120,180,255,0.6)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.9 * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.9 * pulse, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 体（丸いゼリーボディ）
    const bodyColor = p.hitFlash > 0 ? '#ffffff' : p.palette.main;
    const bg = ctx.createRadialGradient(-R * 0.3, -R * 0.4, R * 0.2, 0, 0, R * 1.1);
    bg.addColorStop(0, p.hitFlash > 0 ? '#fff' : p.palette.light);
    bg.addColorStop(0.6, bodyColor);
    bg.addColorStop(1, p.hitFlash > 0 ? '#fff' : p.palette.dark);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    // ほっぺ
    if (p.hitFlash <= 0) {
      ctx.fillStyle = 'rgba(255,140,160,0.5)';
      ctx.beginPath();
      ctx.arc(-R * 0.45, R * 0.15, R * 0.18, 0, TAU);
      ctx.arc(R * 0.45, R * 0.15, R * 0.18, 0, TAU);
      ctx.fill();
    }

    // 目（顔は常に進行方向 or 上を向く感じ）
    const eyeY = -R * 0.15;
    const eyeDX = R * 0.32;
    const lookX = clamp(p.facing * R * 0.08, -R * 0.12, R * 0.12);
    ctx.fillStyle = p.hitFlash > 0 ? '#ff7a8a' : '#3a2e34';
    if (p.eyeBlink > 0 || !p.alive) {
      // 閉じ目
      ctx.lineWidth = R * 0.1;
      ctx.strokeStyle = p.hitFlash > 0 ? '#ff7a8a' : '#3a2e34';
      ctx.beginPath();
      ctx.moveTo(-eyeDX - R * 0.12, eyeY); ctx.lineTo(-eyeDX + R * 0.12, eyeY);
      ctx.moveTo(eyeDX - R * 0.12, eyeY); ctx.lineTo(eyeDX + R * 0.12, eyeY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-eyeDX + lookX, eyeY, R * 0.14, 0, TAU);
      ctx.arc(eyeDX + lookX, eyeY, R * 0.14, 0, TAU);
      ctx.fill();
      // 目のハイライト
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-eyeDX + lookX + R * 0.05, eyeY - R * 0.05, R * 0.05, 0, TAU);
      ctx.arc(eyeDX + lookX + R * 0.05, eyeY - R * 0.05, R * 0.05, 0, TAU);
      ctx.fill();
    }

    // 小さな口
    if (p.hitFlash <= 0 && p.alive) {
      ctx.strokeStyle = '#3a2e34';
      ctx.lineWidth = R * 0.07;
      ctx.beginPath();
      ctx.arc(lookX, R * 0.28, R * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    // エナジー満タンの輝き
    if (p.energy >= 100 && p.alive) {
      ctx.save();
      ctx.rotate(-(p.theta + Math.PI / 2)); // 回転キャンセル
      const glow = 0.5 + Math.sin(p.animPhase * 3) * 0.3;
      ctx.globalAlpha = glow;
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 3;
      const gr = R * 1.5;
      for (let i = 0; i < 6; i++) {
        const a = p.animPhase + (i / 6) * TAU;
        const x = Math.cos(a) * gr, y = Math.sin(a) * gr;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, TAU);
        ctx.fillStyle = '#ffe14d';
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  _drawOverlay(ctx) {
    if (this.state === STATE.COUNTDOWN) {
      const ci = Math.ceil(this.countdown - 1);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (ci > 0) {
        const frac = (this.countdown - 1) - (ci - 1); // 1->0
        const scale = 0.6 + (1 - frac) * 0.8;
        ctx.font = `900 ${110 * scale}px "Baloo 2", system-ui, sans-serif`;
        ctx.globalAlpha = Math.min(1, frac * 2);
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(ci, this.cx, this.cy);
        ctx.fillStyle = COLORS.p1;
        ctx.fillText(ci, this.cx, this.cy);
      } else {
        const frac = this.countdown; // 1->0
        const scale = 1 + (1 - frac) * 0.6;
        ctx.font = `900 ${90 * scale}px "Baloo 2", system-ui, sans-serif`;
        ctx.globalAlpha = Math.min(1, frac * 3);
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText('START!', this.cx, this.cy);
        ctx.fillStyle = COLORS.mint;
        ctx.fillText('START!', this.cx, this.cy);
      }
      ctx.restore();
    }
  }
}

export { STATE };
