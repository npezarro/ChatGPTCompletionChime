import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFSM, STATE, makeChimeWavDataURL, isEditorEmpty } from './fsm.js';

/* ============================================================
 * FSM State Machine Tests
 * ============================================================ */
describe('createFSM', () => {
  let stopVisible, empty, chime, clock, fsm;

  beforeEach(() => {
    vi.useFakeTimers();
    stopVisible = false;
    empty = true;
    chime = vi.fn();
    clock = 1000; // start at 1s (performance.now() is never 0 in real usage)
    fsm = createFSM({
      isStopVisible: () => stopVisible,
      editorEmpty: () => empty,
      playChime: chime,
      now: () => clock,
    });
  });

  afterEach(() => {
    fsm.stopPoll();
    vi.useRealTimers();
  });

  it('starts in IDLE state', () => {
    expect(fsm.getState()).toBe(STATE.IDLE);
    expect(fsm.getSession()).toBeNull();
  });

  it('transitions to ARMED on arm()', () => {
    fsm.arm('test');
    expect(fsm.getState()).toBe(STATE.ARMED);
  });

  it('records sawCleared=true if editor is already empty when armed', () => {
    empty = true;
    fsm.arm('test');
    expect(fsm.getSession().sawCleared).toBe(true);
  });

  it('records sawCleared=false if editor has content when armed', () => {
    empty = false;
    fsm.arm('test');
    expect(fsm.getSession().sawCleared).toBe(false);
  });

  it('transitions to CLEARED when editor empties', () => {
    empty = false;
    fsm.arm('test');
    expect(fsm.getState()).toBe(STATE.ARMED);

    empty = true;
    fsm.evaluate();
    expect(fsm.getState()).toBe(STATE.CLEARED);
  });

  it('transitions to STREAMING when stop button appears', () => {
    fsm.arm('test');
    stopVisible = true;
    fsm.evaluate();
    expect(fsm.getState()).toBe(STATE.STREAMING);
  });

  describe('completion detection', () => {
    it('fires chime after full lifecycle: arm → streaming → stop gone + empty (stable)', () => {
      empty = false;
      fsm.arm('test');

      // Editor clears
      empty = true;
      fsm.evaluate();

      // Stop button appears (streaming)
      stopVisible = true;
      fsm.evaluate();
      expect(fsm.getState()).toBe(STATE.STREAMING);

      // Stop button disappears — records lastStopGoneAt
      stopVisible = false;
      fsm.evaluate();
      // Not yet DONE — 150ms stability check
      expect(chime).not.toHaveBeenCalled();

      // Advance past 150ms stability threshold
      clock = 1200;
      fsm.evaluate();
      expect(chime).toHaveBeenCalledOnce();
      expect(fsm.getState()).toBe(STATE.IDLE); // session cleared after DONE
    });

    it('does NOT fire chime before 150ms stability window', () => {
      empty = true;
      fsm.arm('test');

      stopVisible = true;
      fsm.evaluate();

      stopVisible = false;
      fsm.evaluate(); // records lastStopGoneAt = 1000

      clock = 1100; // only 100ms elapsed, need 150
      fsm.evaluate();
      expect(chime).not.toHaveBeenCalled();
    });

    it('does NOT fire chime if stop was never seen', () => {
      empty = true;
      fsm.arm('test');
      clock = 500;
      fsm.evaluate();
      expect(chime).not.toHaveBeenCalled();
    });

    it('does NOT fire chime if editor is not empty after stop disappears', () => {
      empty = true;
      fsm.arm('test');

      stopVisible = true;
      fsm.evaluate();

      stopVisible = false;
      empty = false; // user started typing again
      clock = 200;
      fsm.evaluate();
      expect(chime).not.toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    it('cancels previous session on re-arm', () => {
      fsm.arm('first');
      const firstId = fsm.getSession().id;

      fsm.arm('second');
      expect(fsm.getSession().id).toBe(firstId + 1);
    });

    it('cancelSession resets to IDLE', () => {
      fsm.arm('test');
      expect(fsm.getState()).toBe(STATE.ARMED);

      fsm.cancelSession('test');
      expect(fsm.getState()).toBe(STATE.IDLE);
      expect(fsm.getSession()).toBeNull();
    });

    it('session is null after completion', () => {
      empty = true;
      fsm.arm('test');
      stopVisible = true;
      fsm.evaluate();
      stopVisible = false;
      fsm.evaluate(); // records lastStopGoneAt
      clock = 1200;
      fsm.evaluate();

      expect(fsm.getSession()).toBeNull();
    });

    it('evaluate is a no-op when no session', () => {
      fsm.evaluate(); // should not throw
      expect(fsm.getState()).toBe(STATE.IDLE);
    });

    it('evaluate is a no-op after DONE', () => {
      empty = true;
      fsm.arm('test');
      stopVisible = true;
      fsm.evaluate();
      stopVisible = false;
      fsm.evaluate(); // records lastStopGoneAt
      clock = 1200;
      fsm.evaluate();
      expect(chime).toHaveBeenCalledOnce();

      // Further evaluations should not fire again
      fsm.evaluate();
      expect(chime).toHaveBeenCalledOnce();
    });
  });

  describe('polling', () => {
    it('starts polling on arm and evaluates periodically', () => {
      empty = true;
      fsm.arm('test');
      stopVisible = true;

      // Advance past one poll interval (250ms)
      vi.advanceTimersByTime(250);
      expect(fsm.getState()).toBe(STATE.STREAMING);
    });

    it('stops polling after completion', () => {
      empty = true;
      fsm.arm('test');
      stopVisible = true;
      fsm.evaluate();
      stopVisible = false;
      fsm.evaluate(); // records lastStopGoneAt
      clock = 1200;
      fsm.evaluate();
      expect(chime).toHaveBeenCalledOnce();

      // Polling should be stopped, so further intervals don't re-evaluate
      chime.mockClear();
      vi.advanceTimersByTime(1000);
      expect(chime).not.toHaveBeenCalled();
    });

    it('stops polling on cancelSession', () => {
      fsm.arm('test');
      fsm.cancelSession('done');

      // Poll shouldn't fire anymore
      stopVisible = true;
      vi.advanceTimersByTime(500);
      expect(fsm.getState()).toBe(STATE.IDLE);
    });
  });

  describe('edge cases', () => {
    it('handles stop button flickering (appears then disappears briefly)', () => {
      empty = true;
      fsm.arm('test');

      // Stop appears
      stopVisible = true;
      fsm.evaluate();
      expect(fsm.getState()).toBe(STATE.STREAMING);

      // Stop disappears briefly — records lastStopGoneAt
      stopVisible = false;
      fsm.evaluate();
      expect(chime).not.toHaveBeenCalled(); // stability window not met yet

      // Stop reappears before stability threshold
      stopVisible = true;
      clock = 1050; // only 50ms — below 150ms threshold
      fsm.evaluate();
      // Should NOT fire chime because stop is visible again
      expect(chime).not.toHaveBeenCalled();
    });

    it('handles rapid arm-cancel-arm cycles', () => {
      fsm.arm('first');
      fsm.arm('second');
      fsm.arm('third');
      expect(fsm.getSession().id).toBe(3);
      expect(fsm.getState()).toBe(STATE.ARMED);
    });

    it('cleared before streaming (instant response)', () => {
      // User sends, editor clears, stop appears almost simultaneously
      empty = true;
      fsm.arm('test');
      // Already cleared since editor was empty on arm

      stopVisible = true;
      fsm.evaluate();
      expect(fsm.getState()).toBe(STATE.STREAMING);

      stopVisible = false;
      fsm.evaluate(); // records lastStopGoneAt
      clock = 1200;
      fsm.evaluate();
      expect(chime).toHaveBeenCalledOnce();
    });
  });
});

/* ============================================================
 * WAV Generator Tests
 * ============================================================ */
describe('makeChimeWavDataURL', () => {
  it('returns a valid WAV data URL', () => {
    const url = makeChimeWavDataURL();
    expect(url).toMatch(/^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/);
  });

  it('produces a WAV with correct RIFF header', () => {
    const url = makeChimeWavDataURL();
    const b64 = url.split(',')[1];
    const raw = atob(b64);
    expect(raw.slice(0, 4)).toBe('RIFF');
    expect(raw.slice(8, 12)).toBe('WAVE');
    expect(raw.slice(12, 16)).toBe('fmt ');
  });

  it('is deterministic (same output each call)', () => {
    const a = makeChimeWavDataURL();
    const b = makeChimeWavDataURL();
    expect(a).toBe(b);
  });

  it('produces audio data of expected length (~44100 samples)', () => {
    const url = makeChimeWavDataURL();
    const b64 = url.split(',')[1];
    const raw = atob(b64);
    const dataSize = raw.length - 44; // WAV header is 44 bytes
    const samples = dataSize / 2; // 16-bit = 2 bytes per sample
    // 0.99s * 44100 = 43659 samples
    expect(samples).toBe(Math.floor(44100 * 0.99));
  });
});

/* ============================================================
 * Editor Empty Helper Tests
 * ============================================================ */
describe('isEditorEmpty', () => {
  it('returns true for null element', () => {
    expect(isEditorEmpty(null)).toBe(true);
  });

  it('returns true for empty div', () => {
    const el = document.createElement('div');
    expect(isEditorEmpty(el)).toBe(true);
  });

  it('returns false for div with text', () => {
    const el = document.createElement('div');
    el.textContent = 'Hello';
    expect(isEditorEmpty(el)).toBe(false);
  });

  it('returns true for div with only zero-width spaces', () => {
    const el = document.createElement('div');
    el.textContent = '\u200b\u200b';
    expect(isEditorEmpty(el)).toBe(true);
  });

  it('returns true for div with only whitespace', () => {
    const el = document.createElement('div');
    el.textContent = '   \n\t  ';
    expect(isEditorEmpty(el)).toBe(true);
  });

  it('returns true for empty textarea', () => {
    const el = document.createElement('textarea');
    el.value = '';
    expect(isEditorEmpty(el)).toBe(true);
  });

  it('returns false for textarea with value', () => {
    const el = document.createElement('textarea');
    el.value = 'test prompt';
    expect(isEditorEmpty(el)).toBe(false);
  });

  it('returns true for textarea with only zero-width spaces', () => {
    const el = document.createElement('textarea');
    el.value = '\u200b';
    expect(isEditorEmpty(el)).toBe(true);
  });
});
