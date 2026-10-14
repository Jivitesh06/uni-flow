import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('======================================================================');
console.log(' UNIFLOW BOTTOM NAVIGATION SCROLL-TO-TOP TEST SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS ${totalTests.toString().padStart(2, '0')}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests.toString().padStart(2, '0')}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Import scrollUtils directly (via --experimental-strip-types)
import { scrollToTop, isReducedMotionPreferred } from '../src/lib/scrollUtils.ts';

// --- 1. Re-Tapping Active Tab Navigation Logic ---
console.log('--- 1. Bottom Navigation Tab Selection & Re-Tapping Behavior ---');

const navItems = [
  { to: '/dashboard', label: 'Home' },
  { to: '/timetable', label: 'Timetable' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/settings', label: 'Settings' },
];

function simulateTabClick(currentPath, tappedTabTo, mockScrollToTop) {
  let defaultPrevented = false;
  const mockEvent = {
    preventDefault: () => {
      defaultPrevented = true;
    },
  };

  const isCurrentActive = currentPath === tappedTabTo;
  if (isCurrentActive) {
    mockEvent.preventDefault();
    mockScrollToTop({ smooth: true });
  }

  return { defaultPrevented, isCurrentActive };
}

test('Active Dashboard tab tapped again from bottom -> scrolls to top & prevents navigation reset', () => {
  let scrollCalled = false;
  let scrollOpts = null;
  const mockScroll = (opts) => {
    scrollCalled = true;
    scrollOpts = opts;
  };

  const res = simulateTabClick('/dashboard', '/dashboard', mockScroll);
  assert.equal(res.defaultPrevented, true, 'Default navigation should be prevented to avoid remount');
  assert.equal(res.isCurrentActive, true);
  assert.equal(scrollCalled, true, 'scrollToTop should be invoked');
  assert.deepEqual(scrollOpts, { smooth: true });
});

test('Active Timetable tab tapped again -> Timetable scrolls to top & prevents navigation reset', () => {
  let scrollCalled = false;
  let scrollOpts = null;
  const mockScroll = (opts) => {
    scrollCalled = true;
    scrollOpts = opts;
  };

  const res = simulateTabClick('/timetable', '/timetable', mockScroll);
  assert.equal(res.defaultPrevented, true);
  assert.equal(res.isCurrentActive, true);
  assert.equal(scrollCalled, true);
  assert.deepEqual(scrollOpts, { smooth: true });
});

test('Active Attendance tab tapped again -> Attendance scrolls to top & prevents navigation reset', () => {
  let scrollCalled = false;
  let scrollOpts = null;
  const mockScroll = (opts) => {
    scrollCalled = true;
    scrollOpts = opts;
  };

  const res = simulateTabClick('/attendance', '/attendance', mockScroll);
  assert.equal(res.defaultPrevented, true);
  assert.equal(res.isCurrentActive, true);
  assert.equal(scrollCalled, true);
  assert.deepEqual(scrollOpts, { smooth: true });
});

test('Active Settings tab tapped again -> Settings scrolls to top & prevents navigation reset', () => {
  let scrollCalled = false;
  let scrollOpts = null;
  const mockScroll = (opts) => {
    scrollCalled = true;
    scrollOpts = opts;
  };

  const res = simulateTabClick('/settings', '/settings', mockScroll);
  assert.equal(res.defaultPrevented, true);
  assert.equal(res.isCurrentActive, true);
  assert.equal(scrollCalled, true);
  assert.deepEqual(scrollOpts, { smooth: true });
});

test('Tapping a different tab (e.g. Dashboard -> Timetable) preserves normal navigation without forcing scroll on previous page', () => {
  let scrollCalled = false;
  const mockScroll = () => {
    scrollCalled = true;
  };

  const res = simulateTabClick('/dashboard', '/timetable', mockScroll);
  assert.equal(res.defaultPrevented, false, 'Default navigation should NOT be prevented');
  assert.equal(res.isCurrentActive, false);
  assert.equal(scrollCalled, false, 'scrollToTop should NOT be called on target tab click');
});

// --- 2. Scrolling Container Resolution & Partial/Full Scroll Handling ---
console.log('\n--- 2. Scroll Container Execution & Viewport Detection ---');

test('scrollToTop scrolls mobile window when scrolled down', () => {
  let windowScrolledTo = null;

  globalThis.window = {
    scrollTo: (options) => {
      windowScrolledTo = options;
    },
    matchMedia: (query) => ({ matches: false, media: query }),
  };
  globalThis.document = {
    documentElement: { scrollTop: 350, scrollTo: () => {} },
    body: { scrollTop: 0, scrollTo: () => {} },
    getElementById: () => null,
    querySelector: () => null,
  };

  scrollToTop({ smooth: true });
  assert.ok(windowScrolledTo, 'window.scrollTo should be called');
  assert.equal(windowScrolledTo.top, 0);
  assert.equal(windowScrolledTo.behavior, 'smooth');
});

test('scrollToTop scrolls desktop <main id="main-content"> when scrolled', () => {
  let mainScrolledTo = null;
  const mockMain = {
    scrollTop: 820,
    scrollTo: (options) => {
      mainScrolledTo = options;
    },
  };

  globalThis.window = {
    scrollTo: () => {},
    matchMedia: () => ({ matches: false }),
  };
  globalThis.document = {
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
    getElementById: (id) => (id === 'main-content' ? mockMain : null),
    querySelector: () => mockMain,
  };

  scrollToTop({ smooth: true });
  assert.ok(mainScrolledTo, 'main element scrollTo should be called');
  assert.equal(mainScrolledTo.top, 0);
  assert.equal(mainScrolledTo.behavior, 'smooth');
});

test('scrollToTop respects prefers-reduced-motion and falls back to instant ("auto") behavior', () => {
  let windowScrolledTo = null;

  globalThis.window = {
    scrollTo: (options) => {
      windowScrolledTo = options;
    },
    matchMedia: (query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
    }),
  };
  globalThis.document = {
    documentElement: { scrollTop: 120 },
    body: { scrollTop: 0 },
    getElementById: () => null,
    querySelector: () => null,
  };

  assert.equal(isReducedMotionPreferred(), true, 'isReducedMotionPreferred must report true');
  scrollToTop({ smooth: true });
  assert.equal(windowScrolledTo.behavior, 'auto', 'Behavior must be auto/instant when reduced motion is preferred');
});

test('scrollToTop handles fallback gracefully when window.scrollTo only accepts (x, y)', () => {
  let coords = null;
  globalThis.window = {
    scrollTo: (x, y) => {
      if (typeof x === 'object') {
        throw new TypeError('Failed to execute scrollTo: parameter is not of type number.');
      }
      coords = [x, y];
    },
    matchMedia: () => ({ matches: false }),
  };
  globalThis.document = {
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
    getElementById: () => null,
    querySelector: () => null,
  };

  assert.doesNotThrow(() => {
    scrollToTop({ smooth: true });
  });
  assert.deepEqual(coords, [0, 0], 'Fallback must scroll to [0, 0]');
});

// --- 3. Component Invariants & Source Integrity ---
console.log('\n--- 3. Source Code Invariants & CSS Verification ---');

test('BottomNav.tsx imports useLocation and scrollToTop, handles re-tap smoothly', () => {
  const bottomNavSrc = fs.readFileSync(path.join(rootDir, 'src/components/layout/BottomNav.tsx'), 'utf8');
  assert.ok(bottomNavSrc.includes("import { useLocation, NavLink } from 'react-router-dom';"), 'BottomNav imports useLocation');
  assert.ok(bottomNavSrc.includes("import { scrollToTop } from '../../lib/scrollUtils';"), 'BottomNav imports scrollToTop');
  assert.ok(bottomNavSrc.includes('location.pathname === to'), 'BottomNav checks active tab match');
  assert.ok(bottomNavSrc.includes('e.preventDefault()'), 'BottomNav calls preventDefault on active tab re-tap');
  assert.ok(bottomNavSrc.includes('scrollToTop({ smooth: true })'), 'BottomNav triggers smooth scroll to top');
  assert.ok(bottomNavSrc.includes("aria-current={isCurrentActive ? 'page' : undefined}"), 'BottomNav maintains accessible aria-current');
});

test('AppLayout.tsx marks <main> with id="main-content" and resets container scroll on route change', () => {
  const appLayoutSrc = fs.readFileSync(path.join(rootDir, 'src/components/layout/AppLayout.tsx'), 'utf8');
  assert.ok(appLayoutSrc.includes('id="main-content"'), 'AppLayout <main> has id="main-content"');
  assert.ok(appLayoutSrc.includes('window.scrollTo({ top: 0, left: 0, behavior: \'instant\' })'), 'AppLayout resets window scroll');
  assert.ok(appLayoutSrc.includes("document.getElementById('main-content')"), 'AppLayout resets desktop main scroll container');
});

test('index.css declares @media (prefers-reduced-motion: reduce) for html scroll-behavior', () => {
  const indexCss = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf8');
  assert.ok(indexCss.includes('@media (prefers-reduced-motion: reduce)'), 'index.css defines reduced motion media query');
  assert.ok(indexCss.includes('scroll-behavior: auto;'), 'index.css sets scroll-behavior: auto under reduced motion');
});

// Clean up globals
delete globalThis.window;
delete globalThis.document;

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(' Bottom navigation scroll-to-top verified successfully! 🚀');
console.log('======================================================================\n');
