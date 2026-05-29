// ============================================================
// net.js - WebRTC P2P対戦（PeerJS利用）
//
// モデル: ホスト権威（host authoritative）
//   - ホストがゲーム状態を計算し、毎フレーム state を送信
//   - ゲストは自分の入力を送信し、受信した state を描画
//   - 入力遅延を抑えるため、ゲストはローカル予測はせず素直に描画（簡潔・安定優先）
// ============================================================

export class NetGame {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.connected = false;
    this.roomCode = null;
    this.remoteInput = { move: 0, jump: false, jumpHeld: false, dash: false, guard: false, shoot: false, super: false };
    this.latestState = null;

    this.onConnected = null;
    this.onDisconnected = null;
    this.onState = null;       // ゲスト: state受信
    this.onInput = null;       // ホスト: input受信
    this.onError = null;
    this.onStatus = null;      // 状態テキスト通知

    this._pingTimer = null;
    this.ping = 0;
  }

  _status(msg) { if (this.onStatus) this.onStatus(msg); }

  _genCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  _peerId(code) { return 'orbitclash-' + code; }

  // ホストとして部屋を作る
  host() {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') { reject(new Error('PeerJSが読み込まれていません')); return; }
      this.isHost = true;
      this.roomCode = this._genCode();
      const id = this._peerId(this.roomCode);
      this._status('部屋を作成中...');
      this.peer = new Peer(id, { debug: 1 });

      this.peer.on('open', () => {
        this._status('友達の参加を待っています...');
        resolve(this.roomCode);
      });
      this.peer.on('connection', (conn) => {
        this.conn = conn;
        this._setupConn();
      });
      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // コード衝突：再生成して再試行
          this.peer.destroy();
          this.roomCode = this._genCode();
          this.host().then(resolve).catch(reject);
        } else {
          if (this.onError) this.onError(err);
          reject(err);
        }
      });
    });
  }

  // ゲストとして部屋に参加
  join(code) {
    return new Promise((resolve, reject) => {
      if (typeof Peer === 'undefined') { reject(new Error('PeerJSが読み込まれていません')); return; }
      this.isHost = false;
      this.roomCode = code.toUpperCase().trim();
      this._status('接続中...');
      this.peer = new Peer({ debug: 1 });

      this.peer.on('open', () => {
        const conn = this.peer.connect(this._peerId(this.roomCode), { reliable: false });
        this.conn = conn;
        let resolved = false;
        const failTimer = setTimeout(() => {
          if (!resolved) { reject(new Error('部屋が見つかりません。コードを確認してください。')); }
        }, 8000);
        conn.on('open', () => {
          resolved = true;
          clearTimeout(failTimer);
          this._setupConn();
          resolve(true);
        });
      });
      this.peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          reject(new Error('部屋が見つかりません。コードを確認してください。'));
        } else {
          if (this.onError) this.onError(err);
          reject(err);
        }
      });
    });
  }

  _setupConn() {
    const conn = this.conn;
    conn.on('open', () => {
      this.connected = true;
      this._status('接続完了！');
      if (this.onConnected) this.onConnected();
      this._startPing();
    });
    // reliable:false の場合 open が即来ないこともあるので connected フラグ後にもハンドリング
    if (conn.open) {
      this.connected = true;
      if (this.onConnected) this.onConnected();
      this._startPing();
    }
    conn.on('data', (data) => this._onData(data));
    conn.on('close', () => {
      this.connected = false;
      this._status('接続が切断されました');
      if (this.onDisconnected) this.onDisconnected();
    });
    conn.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  _onData(data) {
    if (!data || !data.t) return;
    switch (data.t) {
      case 'input':
        this.remoteInput = data.i;
        if (this.onInput) this.onInput(data.i);
        break;
      case 'state':
        this.latestState = data.s;
        if (this.onState) this.onState(data.s);
        break;
      case 'ping':
        this._send({ t: 'pong', ts: data.ts });
        break;
      case 'pong':
        this.ping = Math.round(performance.now() - data.ts);
        break;
      case 'event':
        if (this.onEvent) this.onEvent(data.e);
        break;
    }
  }

  _send(obj) {
    if (this.conn && this.connected) {
      try { this.conn.send(obj); } catch (e) { /* ignore transient */ }
    }
  }

  // ゲスト→ホスト: 入力送信
  sendInput(input) {
    this._send({ t: 'input', i: input });
  }
  // ホスト→ゲスト: 状態送信
  sendState(state) {
    this._send({ t: 'state', s: state });
  }
  sendEvent(e) {
    this._send({ t: 'event', e });
  }

  _startPing() {
    if (this._pingTimer) return;
    this._pingTimer = setInterval(() => {
      this._send({ t: 'ping', ts: performance.now() });
    }, 1500);
  }

  close() {
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.connected = false;
  }
}
