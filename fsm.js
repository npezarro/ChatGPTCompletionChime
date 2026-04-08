/**
 * Completion detection FSM — extracted for testability.
 *
 * The script.js IIFE inlines this logic. This module exposes the same
 * state machine so tests can exercise transitions without a real browser.
 *
 * Usage: const fsm = createFSM({ isStopVisible, editorEmpty, playChime });
 */

export const STATE = Object.freeze({
  IDLE: 'IDLE',
  ARMED: 'ARMED',
  CLEARED: 'CLEARED',
  STREAMING: 'STREAMING',
  DONE: 'DONE',
});

export function createFSM({ isStopVisible, editorEmpty, playChime, now }) {
  let sid = 0;
  let s = null;
  let pollId = 0;

  const _now = now || (() => performance.now());

  function getState() {
    return s ? s.state : STATE.IDLE;
  }

  function getSession() {
    return s ? { ...s } : null;
  }

  function stopPoll() {
    if (pollId) { clearInterval(pollId); pollId = 0; }
  }

  function startPoll() {
    stopPoll();
    pollId = setInterval(() => evaluate(), 250);
  }

  function cancelSession(reason) {
    if (!s) return;
    stopPoll();
    s = null;
  }

  function arm(reason) {
    if (s) cancelSession('re-ARM');
    s = {
      id: ++sid,
      state: STATE.ARMED,
      sawStop: false,
      sawCleared: editorEmpty(),
      lastStopGoneAt: 0,
    };
    startPoll();
    evaluate();
  }

  function transition(newState) {
    if (!s || s.state === STATE.DONE) return;
    if (s.state !== newState) {
      s.state = newState;
    }
  }

  function evaluate() {
    if (!s || s.state === STATE.DONE) return;

    // Editor cleared after send
    if (!s.sawCleared && editorEmpty()) {
      s.sawCleared = true;
      transition(STATE.CLEARED);
    }

    // Streaming seen
    if (!s.sawStop && isStopVisible()) {
      s.sawStop = true;
      transition(STATE.STREAMING);
    }

    // Stop disappears
    if (s.sawStop && !isStopVisible() && !s.lastStopGoneAt) {
      s.lastStopGoneAt = _now();
    }

    // Completion: saw Stop once AND Stop gone AND editor empty (150ms stability)
    if (s.sawStop && !isStopVisible() && editorEmpty()) {
      const stable = s.lastStopGoneAt ? (_now() - s.lastStopGoneAt) : 999;
      if (stable >= 150) {
        transition(STATE.DONE);
        playChime(`s#${s.id}`);
        stopPoll();
        s = null;
      }
    }
  }

  return { arm, evaluate, getState, getSession, cancelSession, stopPoll };
}

/**
 * WAV data URL generator — extracted for testability.
 * Generates a 4-note chime as a WAV base64 data URL.
 */
export function makeChimeWavDataURL() {
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

/**
 * Editor empty check — extracted for testability.
 * Returns true if the given element has no meaningful text content.
 */
export function isEditorEmpty(el) {
  if (!el) return true;
  if (el.tagName === 'TEXTAREA') return (el.value || '').replace(/\u200b/g, '').trim().length === 0;
  const txt = (el.textContent || '').replace(/\u200b/g, '').trim();
  return txt.length === 0;
}
