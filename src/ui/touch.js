// ============================================================
// touch.js - スマホ用タッチコントロール
// 左：方向パッド（左右） / 右：アクションボタン群
// プレイヤーと同じ入力 {move, jump, jumpHeld, dash, guard, shoot, super} を生成
// ============================================================

export class TouchControls {
  constructor(root) {
    this.root = root;            // コントロールを配置するDOM
    this.state = {
      move: 0, jump: false, jumpHeld: false, dash: false,
      guard: false, shoot: false, super: false,
    };
    this._jumpEdge = false;
    this._dashEdge = false;
    this._shootEdge = false;
    this._superEdge = false;

    this.active = false;
    this.touches = {};           // identifier -> {type, ...}
    this._build();
    this._bind();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'touch-controls';
    this.el.innerHTML = `
      <div class="touch-left">
        <div class="dpad" id="tc-dpad">
          <button class="dbtn dbtn-l" data-act="left">◀</button>
          <div class="dpad-center"></div>
          <button class="dbtn dbtn-r" data-act="right">▶</button>
        </div>
      </div>
      <div class="touch-right">
        <button class="abtn abtn-guard" data-act="guard"><span>守</span></button>
        <button class="abtn abtn-dash" data-act="dash"><span>瞬</span></button>
        <button class="abtn abtn-jump" data-act="jump"><span>跳</span></button>
        <button class="abtn abtn-shoot" data-act="shoot"><span>撃</span></button>
        <button class="abtn abtn-super" data-act="super" id="tc-super"><span>必</span></button>
      </div>
    `;
    this.root.appendChild(this.el);
    this.superBtn = this.el.querySelector('#tc-super');
  }

  show() { this.el.classList.add('visible'); this.active = true; }
  hide() { this.el.classList.remove('visible'); this.active = false; this._reset(); }

  _reset() {
    this.state.move = 0;
    this.state.jumpHeld = false;
    this.state.guard = false;
    this._held = {};
  }

  setSuperReady(ready) {
    if (this.superBtn) this.superBtn.classList.toggle('ready', ready);
  }

  _bind() {
    this._held = { left: false, right: false, jump: false, dash: false, guard: false, shoot: false, super: false };

    const buttons = this.el.querySelectorAll('[data-act]');
    buttons.forEach((btn) => {
      const act = btn.dataset.act;
      const press = (e) => {
        e.preventDefault();
        this._held[act] = true;
        btn.classList.add('pressed');
        if (act === 'jump') this._jumpEdge = true;
        if (act === 'dash') this._dashEdge = true;
        if (act === 'shoot') this._shootEdge = true;
        if (act === 'super') this._superEdge = true;
      };
      const release = (e) => {
        e.preventDefault();
        this._held[act] = false;
        btn.classList.remove('pressed');
      };
      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      // マウスでもテスト可能に
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', (e) => { if (this._held[act]) release(e); });
    });

    // コンテキストメニュー抑制
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 毎フレーム呼ぶ：入力状態を確定し justPressed をクリア
  poll() {
    const h = this._held;
    this.state.move = (h.left ? -1 : 0) + (h.right ? 1 : 0);
    this.state.jumpHeld = !!h.jump;
    this.state.guard = !!h.guard;

    this.state.jump = this._jumpEdge;
    this.state.dash = this._dashEdge;
    this.state.shoot = this._shootEdge;
    this.state.super = this._superEdge;

    this._jumpEdge = false;
    this._dashEdge = false;
    this._shootEdge = false;
    this._superEdge = false;

    return this.state;
  }
}
