// ============================================================
// math.js - ベクトル・角度・補間などの数学ユーティリティ
// ============================================================

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// 角度を -PI..PI に正規化
export function normalizeAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// 2つの角度の最短差分 (a -> b)
export function angleDiff(a, b) {
  return normalizeAngle(b - a);
}

// 角度を補間（最短経路）
export function lerpAngle(a, b, t) {
  return a + angleDiff(a, b) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// イージング
export const Ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
