// ============================================================
// main.js - アプリ統合（画面遷移・ゲームループ・各モード）
// ============================================================

import { Input } from './core/input.js';
import { audio } from './core/audio.js';
import { GameEngine, STATE } from './game/engine.js';
import { AIController } from './game/ai.js';
import { TouchControls } from './ui/touch.js';
import { NetGame } from './net/net.js';
import { PLAYER, SUPER, COLORS } from './game/constants.js';

// ---- DOM参照 ----
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const screens = {
  title: $('screen-title'),
  mode: $('screen-mode'),
  ai: $('screen-ai'),
  online: $('screen-online'),
  game: $('screen-game'),
  result: $('screen-result'),
};

// ---- 状態 ----
let engine = null;
let input = new Input();
let touch = null;
let ai = null;
let net = null;
let mode = null;          // 'ai' | 'local' | 'online'
let myPlayerIndex = 0;    // online時に自分が操作するプレイヤー
let rafId = null;
let lastTime = 0;
let running = false;
let resultShown = false;
let isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ===== 画面遷移 =====
function showScreen(name) {
  for (const k in screens) {
    screens[k].classList.toggle('active', k === name);
  }
}

// ===== タイトル/メニューの初期化 =====
function setupMenus() {
  $('btn-start').addEventListener('click', () => { audio.init(); audio.resume(); audio.startMusic(); audio.click(); showScreen('mode'); });

  // モード選択
  $('mode-ai').addEventListener('click', () => { audio.click(); showScreen('ai'); });
  $('mode-local').addEventListener('click', () => { audio.click(); startGame('local'); });
  $('mode-online').addEventListener('click', () => { audio.click(); showScreen('online'); });

  // 戻るボタン
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.addEventListener('click', () => { audio.click(); cleanupNet(); showScreen(b.dataset.back); });
  });

  // AI難易度
  document.querySelectorAll('.diff-btn').forEach((b) => {
    b.addEventListener('click', () => {
      audio.click();
      startGame('ai', b.dataset.diff);
    });
  });

  // オンライン
  $('online-host').addEventListener('click', onlineHost);
  $('online-join').addEventListener('click', () => {
    $('join-panel').classList.add('show');
    $('host-panel').classList.remove('show');
  });
  $('online-host-tab').addEventListener('click', () => {
    $('host-panel').classList.add('show');
    $('join-panel').classList.remove('show');
  });
  $('join-confirm').addEventListener('click', onlineJoin);
  $('copy-code').addEventListener('click', () => {
    const code = $('room-code-display').textContent;
    navigator.clipboard?.writeText(code).then(() => {
      $('copy-code').textContent = 'コピー済み!';
      setTimeout(() => { $('copy-code').textContent = 'コードをコピー'; }, 1500);
    });
  });

  // リザルト
  $('result-rematch').addEventListener('click', () => {
    audio.click();
    if (mode === 'online') {
      // オンラインの再戦は簡略化：メニューへ
      cleanupNet();
      showScreen('mode');
    } else {
      startGame(mode, ai ? ai.difficulty : null);
    }
  });
  $('result-menu').addEventListener('click', () => {
    audio.click();
    cleanupNet();
    stopGame();
    showScreen('mode');
  });

  // ゲーム中の一時停止/退出
  $('btn-quit').addEventListener('click', () => {
    audio.click();
    cleanupNet();
    stopGame();
    showScreen('mode');
  });

  // サウンドトグル
  $('toggle-sfx').addEventListener('click', (e) => {
    const on = e.currentTarget.classList.toggle('off');
    audio.setSfx(!on);
    e.currentTarget.textContent = on ? '🔇' : '🔊';
  });
  $('toggle-music').addEventListener('click', (e) => {
    const on = e.currentTarget.classList.toggle('off');
    audio.setMusic(!on);
    e.currentTarget.textContent = on ? '🎵̶' : '🎵';
  });
}

// ===== オンライン =====
function onlineHost() {
  audio.click();
  cleanupNet();
  net = new NetGame();
  $('online-status').textContent = '部屋を作成中...';
  $('host-panel').classList.add('show');
  $('join-panel').classList.remove('show');
  net.onStatus = (m) => { $('online-status').textContent = m; };
  net.onConnected = () => {
    myPlayerIndex = 0; // ホストはP1
    startGame('online');
  };
  net.onInput = (i) => { /* ホスト: ゲスト入力を受信（update時に利用） */ };
  net.onDisconnected = () => handleDisconnect();
  net.host().then((code) => {
    $('room-code-display').textContent = code;
    $('host-waiting').classList.add('show');
  }).catch((err) => {
    $('online-status').textContent = 'エラー: ' + err.message;
  });
}

function onlineJoin() {
  const code = $('join-code-input').value.trim().toUpperCase();
  if (code.length < 4) { $('online-status').textContent = 'コードを入力してください'; return; }
  audio.click();
  cleanupNet();
  net = new NetGame();
  $('online-status').textContent = '接続中...';
  net.onStatus = (m) => { $('online-status').textContent = m; };
  net.onConnected = () => {
    myPlayerIndex = 1; // ゲストはP2
    startGame('online');
  };
  net.onState = (s) => { if (engine) engine.applyState(s); };
  net.onEvent = (e) => handleNetEvent(e);
  net.onDisconnected = () => handleDisconnect();
  net.join(code).catch((err) => {
    $('online-status').textContent = 'エラー: ' + err.message;
  });
}

function handleNetEvent(e) {
  // ゲスト側でのSFX再生（ホストから通知）
  if (!audio) return;
  switch (e) {
    case 'hit': audio.hit(); break;
    case 'shoot': audio.shoot(); break;
    case 'jump': audio.jump(); break;
    case 'super': audio.superShot(); break;
    case 'orb': audio.orbGet(); break;
  }
}

function handleDisconnect() {
  if (mode === 'online' && running) {
    stopGame();
    showScreen('mode');
    alert('相手との接続が切れました');
  }
}

function cleanupNet() {
  if (net) { net.close(); net = null; }
  $('host-waiting')?.classList.remove('show');
}

// ===== ゲーム開始/終了 =====
function startGame(gameMode, difficulty) {
  mode = gameMode;
  resultShown = false;
  showScreen('game');

  if (!engine) {
    engine = new GameEngine(canvas, audio);
  }
  engine.resize();
  engine.isPvP = (mode === 'local' || mode === 'online');

  // AIセットアップ
  if (mode === 'ai') {
    ai = new AIController(difficulty || 'normal');
  } else {
    ai = null;
  }

  // タッチコントロール
  if (isTouchDevice) {
    if (!touch) touch = new TouchControls($('touch-root'));
    touch.show();
  }

  // HUDラベル設定
  setupHUD();

  // コールバック
  engine.onMatchEnd = (winner) => {
    onMatchEnd(winner);
  };
  engine.onRoundChange = (scores) => {
    updateScoreDisplay(scores);
  };

  engine.startMatch();
  updateScoreDisplay(engine.scores);

  running = true;
  lastTime = performance.now();
  if (!rafId) rafId = requestAnimationFrame(loop);
}

function stopGame() {
  running = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (touch) touch.hide();
}

function setupHUD() {
  const p1Name = 'PLAYER 1';
  let p2Name = 'CPU';
  if (mode === 'local') p2Name = 'PLAYER 2';
  if (mode === 'online') p2Name = 'FRIEND';
  $('hud-p1-name').textContent = mode === 'online' && myPlayerIndex === 1 ? 'FRIEND' : p1Name;
  $('hud-p2-name').textContent = mode === 'online' && myPlayerIndex === 1 ? 'YOU' : (mode === 'online' ? p2Name : p2Name);
  if (mode === 'online' && myPlayerIndex === 0) $('hud-p1-name').textContent = 'YOU';
}

function updateScoreDisplay(scores) {
  $('hud-p1-score').textContent = scores[0];
  $('hud-p2-score').textContent = scores[1];
}

// ===== 入力収集 =====
function emptyInput() {
  return { move: 0, jump: false, jumpHeld: false, dash: false, guard: false, shoot: false, super: false };
}

function getKeyboardInput(scheme) {
  const inp = emptyInput();
  if (scheme === 'p1') {
    inp.move = (input.down('ArrowLeft') ? -1 : 0) + (input.down('ArrowRight') ? 1 : 0);
    inp.jump = input.pressed('ArrowUp') || input.pressed('Space') || input.pressed('KeyW');
    inp.jumpHeld = input.down('ArrowUp') || input.down('Space') || input.down('KeyW');
    inp.guard = input.down('ArrowDown') || input.down('KeyS');
    inp.dash = input.pressed('ShiftRight') || input.pressed('ShiftLeft');
    inp.shoot = input.pressed('Enter') || input.pressed('KeyJ') || input.pressed('Slash');
    inp.super = input.pressed('KeyK') || input.pressed('Period');
  } else {
    // P2 (ローカル対戦用 WASD)
    inp.move = (input.down('KeyA') ? -1 : 0) + (input.down('KeyD') ? 1 : 0);
    inp.jump = input.pressed('KeyW');
    inp.jumpHeld = input.down('KeyW');
    inp.guard = input.down('KeyS');
    inp.dash = input.pressed('ShiftLeft');
    inp.shoot = input.pressed('KeyF');
    inp.super = input.pressed('KeyG');
  }
  return inp;
}

// タッチ入力とキーボードをマージ
function mergeInput(a, b) {
  return {
    move: a.move || b.move,
    jump: a.jump || b.jump,
    jumpHeld: a.jumpHeld || b.jumpHeld,
    dash: a.dash || b.dash,
    guard: a.guard || b.guard,
    shoot: a.shoot || b.shoot,
    super: a.super || b.super,
  };
}

// ===== メインループ =====
function loop(now) {
  rafId = requestAnimationFrame(loop);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1; // タブ復帰時の暴走防止
  if (!running || !engine) return;

  input.update();
  let touchInput = touch && touch.active ? touch.poll() : emptyInput();

  if (mode === 'ai') {
    const p1 = mergeInput(getKeyboardInput('p1'), touchInput);
    const ctx = { cx: engine.cx, cy: engine.cy };
    const aiInput = engine.state === STATE.PLAYING
      ? ai.think(dt, engine.players[1], engine.players[0], engine.projectiles, engine.orbs, ctx)
      : emptyInput();
    engine.update(dt, [p1, aiInput]);
    updateHUD();
    engine.draw();

  } else if (mode === 'local') {
    const p1 = getKeyboardInput('p1');
    const p2 = mergeInput(getKeyboardInput('p2'), touchInput);
    engine.update(dt, [p1, p2]);
    updateHUD();
    engine.draw();

  } else if (mode === 'online') {
    if (net && net.isHost) {
      // ホスト権威
      const myInput = mergeInput(getKeyboardInput('p1'), touchInput);
      const guestInput = net.remoteInput || emptyInput();
      engine.update(dt, [myInput, guestInput]);
      net.sendState(engine.serialize());
      updateHUD();
      engine.draw();
    } else if (net) {
      // ゲスト：入力送信＋受信状態描画
      const myInput = mergeInput(getKeyboardInput('p1'), touchInput);
      net.sendInput(myInput);
      engine.updateClientVisual(dt);
      updateHUD();
      engine.draw();
      // マッチ終了検知（受信状態ベース）
      if (engine.state === STATE.MATCH_END && !resultShown) {
        onMatchEnd(engine.matchWinner);
      }
    }
    // ピング表示
    if (net) $('hud-ping').textContent = net.ping + 'ms';
  }
}

// ===== HUD更新 =====
function updateHUD() {
  const p1 = engine.players[0], p2 = engine.players[1];
  // HPバー
  setBar('hud-p1-hp', p1.hp / PLAYER.MAX_HP);
  setBar('hud-p2-hp', p2.hp / PLAYER.MAX_HP);
  // エナジー
  setBar('hud-p1-energy', p1.energy / 100);
  setBar('hud-p2-energy', p2.energy / 100);
  $('hud-p1-energy-wrap').classList.toggle('full', p1.energy >= 100);
  $('hud-p2-energy-wrap').classList.toggle('full', p2.energy >= 100);

  // タイマー
  $('hud-timer').textContent = Math.max(0, Math.ceil(engine.roundTime));

  // 自分のスーパー準備状況をタッチに反映
  if (touch && touch.active) {
    const myP = (mode === 'online' && myPlayerIndex === 1) ? p2 : p1;
    touch.setSuperReady(myP.energy >= 100);
  }
}

function setBar(id, ratio) {
  const el = $(id);
  if (el) el.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
}

// ===== マッチ終了 =====
function onMatchEnd(winner) {
  if (resultShown) return;
  resultShown = true;
  let youWon;
  if (mode === 'ai') youWon = (winner === 0);
  else if (mode === 'online') youWon = (winner === myPlayerIndex);
  else youWon = null; // local: 勝者表示のみ

  const title = $('result-title');
  const sub = $('result-sub');
  const card = $('result-card');

  if (mode === 'local') {
    title.textContent = winner === 0 ? 'PLAYER 1 WIN!' : 'PLAYER 2 WIN!';
    sub.textContent = 'ナイスバトル！';
    card.className = 'result-card win';
    audio.win();
  } else if (youWon) {
    title.textContent = 'YOU WIN!';
    sub.textContent = 'おみごと！';
    card.className = 'result-card win';
    audio.win();
  } else {
    title.textContent = 'YOU LOSE...';
    sub.textContent = 'つぎはきっと勝てる！';
    card.className = 'result-card lose';
    audio.lose();
  }
  $('result-score').textContent = `${engine.scores[0]} - ${engine.scores[1]}`;

  setTimeout(() => {
    stopGame();
    showScreen('result');
  }, 1400);
}

// ===== リサイズ対応 =====
window.addEventListener('resize', () => { if (engine) engine.resize(); });
window.addEventListener('orientationchange', () => { setTimeout(() => { if (engine) engine.resize(); }, 200); });

// 初期化
function init() {
  setupMenus();
  showScreen('title');
  // タッチデバイス判定でヒント表示切替
  if (isTouchDevice) document.body.classList.add('touch-device');
}

init();
