// ============================================================
// audio.js - WebAudio による効果音・BGM合成（外部アセット不要）
// 明るく爽やかなチップチューン風サウンド
// ============================================================

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.enabled = true;
    this.musicEnabled = true;
    this._musicTimer = null;
    this._musicStep = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // 基本トーン
  _tone({ freq = 440, dur = 0.12, type = 'sine', vol = 0.5, attack = 0.005, decay = 0.1, dest = null, slideTo = null, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.15, vol = 0.4, type = 'highpass', freq = 1000, dest = null, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + delay;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(dest || this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---- ゲーム効果音 ----
  jump() {
    this._tone({ freq: 360, slideTo: 680, dur: 0.16, type: 'triangle', vol: 0.35 });
  }
  dash() {
    this._noise({ dur: 0.2, vol: 0.25, type: 'bandpass', freq: 1800 });
    this._tone({ freq: 220, slideTo: 520, dur: 0.18, type: 'sawtooth', vol: 0.2 });
  }
  shoot() {
    this._tone({ freq: 720, slideTo: 300, dur: 0.18, type: 'square', vol: 0.28 });
  }
  charge() {
    this._tone({ freq: 200, slideTo: 900, dur: 0.5, type: 'sine', vol: 0.25 });
  }
  superShot() {
    this._tone({ freq: 180, slideTo: 1200, dur: 0.5, type: 'sawtooth', vol: 0.35 });
    this._tone({ freq: 90, slideTo: 600, dur: 0.5, type: 'square', vol: 0.25, delay: 0.02 });
  }
  hit() {
    this._noise({ dur: 0.18, vol: 0.4, type: 'lowpass', freq: 1200 });
    this._tone({ freq: 160, slideTo: 70, dur: 0.22, type: 'square', vol: 0.4 });
  }
  guard() {
    this._tone({ freq: 800, dur: 0.1, type: 'sine', vol: 0.3 });
    this._tone({ freq: 1200, dur: 0.08, type: 'sine', vol: 0.2, delay: 0.04 });
  }
  orbGet() {
    this._tone({ freq: 600, dur: 0.08, type: 'sine', vol: 0.3 });
    this._tone({ freq: 900, dur: 0.1, type: 'sine', vol: 0.3, delay: 0.06 });
    this._tone({ freq: 1200, dur: 0.12, type: 'sine', vol: 0.25, delay: 0.12 });
  }
  countdown() {
    this._tone({ freq: 500, dur: 0.15, type: 'sine', vol: 0.4 });
  }
  go() {
    this._tone({ freq: 800, slideTo: 1000, dur: 0.4, type: 'triangle', vol: 0.45 });
  }
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.4, delay: i * 0.12 }));
  }
  lose() {
    const notes = [400, 340, 280, 200];
    notes.forEach((f, i) => this._tone({ freq: f, dur: 0.22, type: 'sine', vol: 0.35, delay: i * 0.14 }));
  }
  click() {
    this._tone({ freq: 660, dur: 0.06, type: 'sine', vol: 0.25 });
  }

  // ---- 明るいループBGM ----
  startMusic() {
    if (!this.ctx || !this.musicEnabled || this._musicTimer) return;
    // 明るいメジャースケールのアルペジオ進行
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0]; // C D E G A
    const bass = [130.81, 146.83, 164.81, 196.0];
    const stepDur = 0.26;
    const tick = () => {
      if (!this.musicEnabled) return;
      const s = this._musicStep;
      // メロディ
      const n = scale[(s * 2 + (s % 3)) % scale.length];
      this._tone({ freq: n, dur: 0.22, type: 'triangle', vol: 0.18, dest: this.musicGain });
      if (s % 2 === 0) {
        this._tone({ freq: n * 1.5, dur: 0.18, type: 'sine', vol: 0.08, dest: this.musicGain });
      }
      // ベース
      const b = bass[Math.floor(s / 2) % bass.length];
      this._tone({ freq: b, dur: 0.4, type: 'sine', vol: 0.16, dest: this.musicGain });
      this._musicStep = (s + 1) % 16;
    };
    tick();
    this._musicTimer = setInterval(tick, stepDur * 1000);
  }

  stopMusic() {
    if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
  }

  setSfx(on) { this.enabled = on; }
  setMusic(on) {
    this.musicEnabled = on;
    if (!on) this.stopMusic(); else this.startMusic();
  }
}

export const audio = new AudioEngine();
