/**
 * Tests for the auto-scroll behavior implemented in public/index.html.
 *
 * The feature logic is embedded in HTML/JS, so we re-implement and test the
 * pure logic functions extracted from the script block:
 *
 *   - isNearBottom(el, threshold): scroll position check
 *   - autoScroll state machine: paused/resumed transitions
 *   - jumpToLatest: resets state and scrolls to bottom
 *   - addLogEntry scroll behavior: auto-scroll vs show-button branching
 */

import { describe, test, expect, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Pure logic extracted from public/index.html
// ---------------------------------------------------------------------------

const NEAR_BOTTOM_THRESHOLD = 50;

/** Returns true when the scroll container is at or near the bottom. */
function isNearBottom(el: { scrollHeight: number; scrollTop: number; clientHeight: number }, threshold = NEAR_BOTTOM_THRESHOLD): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/** Minimal mock of a scrollable element. */
function makeScrollEl(opts: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  return { ...opts };
}

/** Minimal mock of a button element with classList. */
function makeButton() {
  const classes = new Set<string>();
  return {
    classes,
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c),
    },
  };
}

// Mirrors the state machine in the HTML script block.
function makeAutoScrollController() {
  let paused = false;
  const btn = makeButton();

  function showJumpToLatest() { btn.classList.add('visible'); }
  function hideJumpToLatest() { btn.classList.remove('visible'); }

  function onScroll(el: ReturnType<typeof makeScrollEl>) {
    if (isNearBottom(el)) {
      paused = false;
      hideJumpToLatest();
    } else {
      paused = true;
    }
  }

  function onNewEntry(el: ReturnType<typeof makeScrollEl>) {
    if (paused) {
      showJumpToLatest();
    } else {
      el.scrollTop = el.scrollHeight; // scroll to bottom
    }
  }

  function jumpToLatest(el: ReturnType<typeof makeScrollEl>) {
    el.scrollTop = el.scrollHeight;
    paused = false;
    hideJumpToLatest();
  }

  function reset() {
    paused = false;
    hideJumpToLatest();
  }

  return { get paused() { return paused; }, btn, onScroll, onNewEntry, jumpToLatest, reset };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isNearBottom', () => {
  test('returns true when at exact bottom', () => {
    const el = makeScrollEl({ scrollHeight: 500, scrollTop: 400, clientHeight: 100 });
    expect(isNearBottom(el)).toBe(true); // distance = 0
  });

  test('returns true when within threshold', () => {
    const el = makeScrollEl({ scrollHeight: 500, scrollTop: 355, clientHeight: 100 });
    expect(isNearBottom(el)).toBe(true); // distance = 45 < 50
  });

  test('returns false when beyond threshold', () => {
    const el = makeScrollEl({ scrollHeight: 500, scrollTop: 300, clientHeight: 100 });
    expect(isNearBottom(el)).toBe(false); // distance = 100 > 50
  });

  test('returns true when threshold is exactly met (boundary)', () => {
    const el = makeScrollEl({ scrollHeight: 500, scrollTop: 351, clientHeight: 100 });
    // distance = 49 — just inside threshold
    expect(isNearBottom(el)).toBe(true);
  });

  test('respects custom threshold', () => {
    const el = makeScrollEl({ scrollHeight: 500, scrollTop: 300, clientHeight: 100 });
    // distance = 100; threshold = 200 → near bottom
    expect(isNearBottom(el, 200)).toBe(true);
    // distance = 100; threshold = 50 → not near bottom
    expect(isNearBottom(el, 50)).toBe(false);
  });
});

describe('auto-scroll state machine', () => {
  let ctrl: ReturnType<typeof makeAutoScrollController>;
  let el: ReturnType<typeof makeScrollEl>;

  beforeEach(() => {
    ctrl = makeAutoScrollController();
    el = makeScrollEl({ scrollHeight: 500, scrollTop: 400, clientHeight: 100 });
  });

  test('starts with auto-scroll active (not paused)', () => {
    expect(ctrl.paused).toBe(false);
  });

  test('pauses when user scrolls up past threshold', () => {
    el.scrollTop = 200; // distance = 300 > 50
    ctrl.onScroll(el);
    expect(ctrl.paused).toBe(true);
  });

  test('resumes when user scrolls back to bottom', () => {
    el.scrollTop = 200;
    ctrl.onScroll(el);
    expect(ctrl.paused).toBe(true);

    el.scrollTop = 400; // distance = 0 → near bottom
    ctrl.onScroll(el);
    expect(ctrl.paused).toBe(false);
  });

  test('hides jump button when resuming via scroll', () => {
    el.scrollTop = 200;
    ctrl.onScroll(el); // pauses, may show button via onNewEntry later

    el.scrollTop = 400;
    ctrl.onScroll(el); // resumes → hides button
    expect(ctrl.btn.classList.contains('visible')).toBe(false);
  });
});

describe('addLogEntry scroll behavior', () => {
  let ctrl: ReturnType<typeof makeAutoScrollController>;
  let el: ReturnType<typeof makeScrollEl>;

  beforeEach(() => {
    ctrl = makeAutoScrollController();
    el = makeScrollEl({ scrollHeight: 500, scrollTop: 400, clientHeight: 100 });
  });

  test('scrolls to bottom when not paused', () => {
    el.scrollTop = 0; // manually moved away to verify it gets reset
    ctrl.onNewEntry(el);
    expect(el.scrollTop).toBe(el.scrollHeight);
  });

  test('shows jump-to-latest button when paused and new entry arrives', () => {
    el.scrollTop = 100; // scroll up
    ctrl.onScroll(el);  // pauses
    expect(ctrl.paused).toBe(true);

    ctrl.onNewEntry(el);
    expect(ctrl.btn.classList.contains('visible')).toBe(true);
  });

  test('does not scroll when paused', () => {
    el.scrollTop = 100;
    ctrl.onScroll(el); // pauses

    const before = el.scrollTop;
    ctrl.onNewEntry(el);
    expect(el.scrollTop).toBe(before); // unchanged
  });
});

describe('jumpToLatest', () => {
  let ctrl: ReturnType<typeof makeAutoScrollController>;
  let el: ReturnType<typeof makeScrollEl>;

  beforeEach(() => {
    ctrl = makeAutoScrollController();
    el = makeScrollEl({ scrollHeight: 500, scrollTop: 100, clientHeight: 100 });
  });

  test('scrolls the element to the bottom', () => {
    ctrl.jumpToLatest(el);
    expect(el.scrollTop).toBe(el.scrollHeight);
  });

  test('resumes auto-scroll (clears paused state)', () => {
    el.scrollTop = 100;
    ctrl.onScroll(el); // pauses
    expect(ctrl.paused).toBe(true);

    ctrl.jumpToLatest(el);
    expect(ctrl.paused).toBe(false);
  });

  test('hides the jump-to-latest button', () => {
    el.scrollTop = 100;
    ctrl.onScroll(el);
    ctrl.onNewEntry(el); // shows button

    expect(ctrl.btn.classList.contains('visible')).toBe(true);
    ctrl.jumpToLatest(el);
    expect(ctrl.btn.classList.contains('visible')).toBe(false);
  });
});

describe('pipeline reset (startPipeline)', () => {
  test('resets paused state and hides button on new pipeline run', () => {
    const ctrl = makeAutoScrollController();
    const el = makeScrollEl({ scrollHeight: 500, scrollTop: 100, clientHeight: 100 });

    ctrl.onScroll(el);  // pauses
    ctrl.onNewEntry(el); // shows button
    expect(ctrl.paused).toBe(true);
    expect(ctrl.btn.classList.contains('visible')).toBe(true);

    ctrl.reset(); // simulates startPipeline reset
    expect(ctrl.paused).toBe(false);
    expect(ctrl.btn.classList.contains('visible')).toBe(false);
  });
});
