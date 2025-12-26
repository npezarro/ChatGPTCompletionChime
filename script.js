// ==UserScript==
// @name         ChatGPT Completion Ping (Composer FSM, background-safe, no-timeout)
// @namespace    nicholas.tools
// @version      5.4.0
// @description  Chime on completion even when window/tab isn't focused. No timeout; FSM: saw Stop → Stop gone + editor empty. Poll + resilient audio.
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  /* =========================
   * Logging
   * ========================= */
  const DEBUG = true;
  const log = (...a) => DEBUG && console.log("[COMP-PING]", ...a);
  const t = () => new Date().toLocaleTimeString();

  /* =========================
   * Selectors (composer only)
   * ========================= */
  const COMPOSER_EDITABLE    = '#prompt-textarea.ProseMirror[contenteditable="true"]';
  const COMPOSER_FALLBACK_TA = 'textarea[name="prompt-textarea"]';
  const SEND_BTN             = '#composer-submit-button[data-testid="send-button"]';
  const STOP_BTN             = '#composer-submit-button[data-testid="stop-button"]';

  /* =========================
   * Audio: HTMLAudio primary (WAV data URL), WebAudio fallback
   * ========================= */
  function makeChimeWavDataURL() {
    const sr = 44100, dur = 0.99;
    const notes = [
      { f: 987.77, d: 0.22 }, { f: 1318.51, d: 0.22 },
      { f: 1174.66, d: 0.20 }, { f: 1318.51, d: 0.30 },
    ];
    const gap = 0.055, amp = 0.28;
    const N = Math.floor(sr * dur);
    const data = new Float32Array(N).fill(0);
    let t0 = 0;
    for (const { f, d } of notes) {
      const nSamp = Math.floor(d * sr);
      const start = Math.floor(t0 * sr);
      for (let i = 0; i < nSamp && start + i < N; i++) {
        const env = i < 0.01*sr ? i/(0.01*sr) : (i > nSamp-0.03*sr ? Math.max(0, (nSamp - i)/(0.03*sr)) : 1);
        const s = Math.sin(2*Math.PI*f*(i/sr));
        const s2 = Math.sin(2*Math.PI*(f*1.005)*(i/sr)) * 0.6;
        data[start+i] += amp * env * (0.7*s + 0.3*s2);
      }
      t0 += d + gap;
    }
    const pcm = new DataView(new ArrayBuffer(44 + N*2));
    let off = 0;
    const wStr = (s) => { for (let i=0;i<s.length;i++) pcm.setUint8(off++, s.charCodeAt(i)); };
    const w32  = (u) => { pcm.setUint32(off, u, true); off+=4; };
    const w16  = (u) => { pcm.setUint16(off, u, true); off+=2; };
    wStr("RIFF"); w32(36 + N*2); wStr("WAVE");
    wStr("fmt "); w32(16); w16(1); w16(1); w32(sr); w32(sr*2); w16(2); w16(16);
    wStr("data"); w32(N*2);
    for (let i=0;i<N;i++) { const v = Math.max(-1, Math.min(1, data[i])); pcm.setInt16(off, v<0?v*0x8000:v*0x7FFF, true); off+=2; }
    const u8 = new Uint8Array(pcm.buffer);
    const b64 = btoa(String.fromCharCode(...u8));
    return `data:audio/wav;base64,${b64}`;
  }

  const CHIME_URL = makeChimeWavDataURL();
  const primeAudioEl = new Audio(CHIME_URL);
  primeAudioEl.preload = "auto";

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx;
  const ensureCtx = () => (ctx ||= new AudioCtx());

  async function playChime(reason) {
    try {
      const a = primeAudioEl.cloneNode();
      a.volume = 1.0;
      await a.play();
      log(`🔊 DONE (HTMLAudio) ${reason} @ ${t()}`);
      return;
    } catch {}
    try {
      const c = ensureCtx();
      if (c.state !== "running") await c.resume();
      const t0 = c.currentTime + 0.02;
      const master = c.createGain(); master.gain.setValueAtTime(0.9, t0); master.connect(c.destination);
      const lp = c.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=4200; lp.Q.value=0.6; lp.connect(master);
      const delay = c.createDelay(0.5); delay.delayTime.value=0.18;
      const fb = c.createGain(); fb.gain.value=0.22; delay.connect(fb); fb.connect(delay); delay.connect(master);
      const bus = c.createGain(); bus.gain.value=0.85; bus.connect(lp); bus.connect(delay);

      const seq = [
        { f: 987.77, d: 0.22 }, { f: 1318.51, d: 0.22 },
        { f: 1174.66, d: 0.20 }, { f: 1318.51, d: 0.30 },
      ];
      let cur = t0, gap = 0.055;
      for (const {f,d} of seq) {
        const o1=c.createOscillator(), g1=c.createGain(); o1.type="triangle"; o1.frequency.value=f;
        g1.gain.setValueAtTime(0.0001,cur); g1.gain.exponentialRampToValueAtTime(0.6,cur+0.01); g1.gain.exponentialRampToValueAtTime(0.001,cur+d);
        o1.connect(g1); g1.connect(bus); o1.start(cur); o1.stop(cur+d+0.02);

        const o2=c.createOscillator(), g2=c.createGain(); o2.type="sine"; o2.frequency.setValueAtTime(f*1.005,cur);
        g2.gain.setValueAtTime(0.0001,cur); g2.gain.exponentialRampToValueAtTime(0.35,cur+0.012); g2.gain.exponentialRampToValueAtTime(0.001,cur+d);
        o2.connect(g2); g2.connect(bus); o2.start(cur); o2.stop(cur+d+0.02);

        cur += d + gap;
      }
      log(`🔊 DONE (WebAudio) ${reason} @ ${t()}`);
    } catch {}
  }

  // Prime on user interaction
  const unlock = async () => {
    try { await primeAudioEl.play(); primeAudioEl.pause(); primeAudioEl.currentTime = 0; } catch {}
    try { if (AudioCtx) { const c = ensureCtx(); if (c.state !== "running") await c.resume(); } } catch {}
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") unlock(); });

  /* =========================
   * Composer helpers
   * ========================= */
  const isEl = (n) => n && n.nodeType === 1;
  const visible = (sel) => { const el = document.querySelector(sel); return !!(el && el.offsetParent !== null); };
  const editorEl = () => document.querySelector(COMPOSER_EDITABLE) || document.querySelector(COMPOSER_FALLBACK_TA) || null;
  function editorEmpty() {
    const el = editorEl();
    if (!el) return true;
    if (el.matches('textarea')) return (el.value || '').replace(/\u200b/g,'').trim().length === 0;
    const txt = (el.textContent || '').replace(/\u200b/g,'').trim();
    return txt.length === 0;
  }
  const isStopVisible = () => visible(STOP_BTN);

  /* =========================
   * FSM + background-safe polling (NO TIMEOUT)
   * ========================= */
  let sid = 0;
  let s = null;
  let pollId = 0;
  const STATE = { IDLE:'IDLE', ARMED:'ARMED', CLEARED:'CLEARED', STREAMING:'STREAMING', DONE:'DONE' };

  function stopPoll() { if (pollId) { clearInterval(pollId); pollId = 0; } }

  function startPoll() {
    stopPoll();
    // steady 250ms poll; browsers may throttle in background which is fine
    pollId = window.setInterval(() => tick(true), 250);
  }

  function cancelSession(reason) {
    if (!s) return;
    log(`CANCEL s#${s.id} (${reason})`);
    stopPoll();
    s = null;
  }

  function arm(reason) {
    // Cancel any previous session (no timeout; avoid multiple active)
    if (s) cancelSession("re-ARM");
    s = {
      id: ++sid,
      state: STATE.ARMED,
      sawStop: false,
      sawCleared: editorEmpty(),
      lastStopGoneAt: 0
    };
    log(`ARM s#${s.id} (${reason}) empty=${s.sawCleared} stop=${isStopVisible()} @ ${t()}`);
    startPoll();
    tick();
  }

  function transition(newState, why) {
    if (!s || s.state === STATE.DONE) return;
    if (s.state !== newState) {
      s.state = newState;
      log(`${newState} s#${s.id} (${why}) empty=${editorEmpty()} stop=${isStopVisible()} @ ${t()}`);
    }
  }

  function evaluate() {
    if (!s || s.state === STATE.DONE) return;

    // Editor cleared after send
    if (!s.sawCleared && editorEmpty()) {
      s.sawCleared = true;
      transition(STATE.CLEARED, "editor cleared");
    }

    // Streaming seen
    if (!s.sawStop && isStopVisible()) {
      s.sawStop = true;
      transition(STATE.STREAMING, "stop visible");
    }

    // Stop disappears
    if (s.sawStop && !isStopVisible() && !s.lastStopGoneAt) {
      s.lastStopGoneAt = performance.now();
      log(`STOP-GONE s#${s.id} (detected)`);
    }

    // Completion: saw Stop once AND Stop gone AND editor empty (150ms stability)
    if (s.sawStop && !isStopVisible() && editorEmpty()) {
      const stable = s.lastStopGoneAt ? (performance.now() - s.lastStopGoneAt) : 999;
      if (stable >= 150) {
        transition(STATE.DONE, "stop gone + editor empty");
        playChime(`s#${s.id}`);
        stopPoll();
        s = null;
      }
    }
  }

  const tick = () => { evaluate(); };

  /* =========================
   * Events & Observers
   * ========================= */
  document.addEventListener("click", (e) => {
    const btn = isEl(e.target) ? e.target.closest(SEND_BTN) : null;
    if (!btn) return;
    arm("send-button click");
  }, true);

  document.addEventListener("keydown", (e) => {
    const ed = isEl(e.target) && (e.target.closest(COMPOSER_EDITABLE) || e.target.closest(COMPOSER_FALLBACK_TA));
    if (!ed) return;
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    if (document.querySelector(SEND_BTN)) arm("keyboard Enter");
  }, true);

  const obs = new MutationObserver((mutations) => {
    if (!s) return;
    for (const m of mutations) {
      if (m.type === "attributes") {
        const el = m.target;
        if (isEl(el) && (el.id === "composer-submit-button" || el.matches(COMPOSER_EDITABLE) || el.matches(COMPOSER_FALLBACK_TA))) {
          tick();
        }
      }
      if (m.type === "childList") {
        for (const n of m.addedNodes) {
          if (!isEl(n)) continue;
          if (n.matches(STOP_BTN) || n.matches(SEND_BTN) ||
              n.querySelector?.(STOP_BTN) || n.querySelector?.(SEND_BTN) ||
              n.matches(COMPOSER_EDITABLE) || n.matches(COMPOSER_FALLBACK_TA) ||
              n.querySelector?.(COMPOSER_EDITABLE) || n.querySelector?.(COMPOSER_FALLBACK_TA)) {
            tick();
            break;
          }
        }
        for (const n of m.removedNodes) {
          if (!isEl(n)) continue;
          if (n.matches(STOP_BTN) || n.matches(SEND_BTN) ||
              n.matches(COMPOSER_EDITABLE) || n.matches(COMPOSER_FALLBACK_TA)) {
            tick();
            break;
          }
        }
      }
      if (m.type === "characterData") tick();
    }
  });

  function start() {
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-testid","id","class","style","contenteditable","value"],
      characterData: true
    });
    log("armed (composer FSM, background-safe, no-timeout). Completes on: saw Stop → Stop gone + editor empty.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
