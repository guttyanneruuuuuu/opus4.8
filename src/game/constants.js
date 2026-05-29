// ============================================================
// constants.js - ゲームバランス・物理定数
// ============================================================

// アリーナ
export const ARENA = {
  RADIUS: 360,        // 円形アリーナの半径（内壁までの距離）
  WALL_THICK: 26,     // 内壁の厚み
};

// 重力（円の中心へ向かう）
export const GRAVITY = 2400;       // px/s^2 相当
export const MAX_FALL = 1400;

// プレイヤー
export const PLAYER = {
  RADIUS: 22,
  RUN_ACCEL: 4200,        // 接地時の周方向加速
  AIR_ACCEL: 2400,        // 空中の周方向加速
  MAX_RUN: 520,           // 周方向最大速度
  FRICTION: 0.86,         // 接地摩擦
  AIR_FRICTION: 0.985,
  JUMP_VELOCITY: 920,     // 半径方向（中心と逆向き）への初速
  COYOTE: 0.1,            // コヨーテタイム
  JUMP_BUFFER: 0.12,
  DASH_SPEED: 1050,       // ダッシュ瞬間速度
  DASH_DURATION: 0.18,
  DASH_COOLDOWN: 0.7,
  DASH_INVULN: 0.18,      // ダッシュ中無敵時間
  MAX_HP: 100,
  GUARD_DRAIN: 70,        // ガード持続のスタミナ消費/秒
  GUARD_MAX: 100,
  GUARD_REGEN: 35,
  GUARD_CHIP: 0.18,       // ガード時の削りダメージ割合
  HIT_INVULN: 0.45,       // 被弾後の無敵
  KNOCKBACK: 560,
};

// ショット
export const SHOT = {
  RADIUS: 11,
  SPEED: 720,
  DAMAGE: 10,
  COOLDOWN: 0.34,
  LIFE: 2.2,
  KNOCKBACK: 360,
};

// チャージショット（必殺：ワープショット）
export const SUPER = {
  RADIUS: 20,
  SPEED: 560,
  DAMAGE: 26,
  LIFE: 3.0,
  KNOCKBACK: 820,
  COST: 100,          // エナジー満タンで発動
  WARP_STRENGTH: 1400, // ホーミング曲げ強度
};

// エナジーオーブ
export const ORB = {
  RADIUS: 16,
  ENERGY_PER: 34,       // 1個取得で得るエナジー
  MAX_ENERGY: 100,
  RESPAWN: 2.6,         // 再出現までの秒数
  COUNT: 1,             // 同時に出現する数
  FLOAT_RADIUS: 210,    // 中心からの浮遊半径（ジャンプで届く高さ帯）
  FLOAT_MIN: 150,       // 浮遊半径の最小
};

// マッチ
export const MATCH = {
  ROUNDS_TO_WIN: 2,     // 先取
  ROUND_TIME: 60,       // 秒
  COUNTDOWN: 3,
};

// 明るいパステルのカラーパレット
export const COLORS = {
  // プレイヤー
  p1: '#ff7a8a',       // コーラルピンク
  p1Dark: '#e85d72',
  p1Light: '#ffd0d7',
  p2: '#54c6e8',       // スカイブルー
  p2Dark: '#2fa6cc',
  p2Light: '#c4ecf7',
  // 環境
  bgTop: '#fff4e0',
  bgBot: '#ffe3ec',
  arena: '#fffaf0',
  arenaWall: '#ffd28a',
  arenaWallDark: '#f4a94b',
  orb: '#ffe14d',
  orbGlow: '#fff4a3',
  mint: '#7fe0c0',
  lavender: '#c9b6ff',
  ink: '#5a4a52',
};
