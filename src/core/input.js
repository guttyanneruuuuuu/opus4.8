// ============================================================
// input.js - キーボード入力管理
// ============================================================

export class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();
    this._prev = new Set();

    window.addEventListener('keydown', (e) => {
      // ゲーム用キーのデフォルト動作（スクロール等）を抑制
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!e.repeat) this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  _isGameKey(code) {
    return [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'KeyJ', 'KeyK', 'ShiftLeft', 'ShiftRight', 'Enter',
    ].includes(code);
  }

  // 毎フレームの先頭で呼ぶ：justPressed を更新
  update() {
    this.justPressed.clear();
    for (const k of this.keys) {
      if (!this._prev.has(k)) this.justPressed.add(k);
    }
    this._prev = new Set(this.keys);
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }

  anyDown(codes) { return codes.some((c) => this.keys.has(c)); }
  anyPressed(codes) { return codes.some((c) => this.justPressed.has(c)); }
}
