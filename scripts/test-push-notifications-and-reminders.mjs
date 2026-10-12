import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log(' UniFlow: Push Notifications & Smart Class Reminders Test Suite');
console.log('===============================================================');

let passCount = 0;
let failCount = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✓ [PASS] ${description}`);
    passCount++;
  } catch (err) {
    console.error(`✗ [FAIL] ${description}`);
    console.error(`  ${err.message}`);
    failCount++;
  }
}

// Import scheduler functions from compiled or source TypeScript files
const {
  calculateNextClassReminder,
  getLocalDateKey,
  buildReminderStorageKey,
} = await import('../src/lib/classReminderScheduler.ts');

const { isSlotApplicableToStudent } = await import('../src/lib/collegeEmail.ts');

// Fixture timetable slots for a Wednesday (dayOfWeek = 3)
const testWednesdaySlots = [
  {
    id: 'slot-1',
    uid: 'user-123',
    subjectId: 'sub-dbms',
    subjectName: 'Database Management Systems',
    subjectCode: 'CS301',
    faculty: 'Dr. Anita Verma',
    room: 'LH-101',
    dayOfWeek: 3,
    startTime: '09:00',
    endTime: '10:00',
    color: '#3b82f6',
    group: 'ALL',
    isActive: true,
  },
  {
    id: 'slot-2-g1',
    uid: 'user-123',
    subjectId: 'sub-os-lab-g1',
    subjectName: 'OS Lab Group 1',
    subjectCode: 'CS302-G1',
    faculty: 'Er. Rohit Sharma',
    room: 'Lab-A',
    dayOfWeek: 3,
    startTime: '10:00',
    endTime: '11:00',
    color: '#10b981',
    group: 'G1',
    isActive: true,
  },
  {
    id: 'slot-2-g2',
    uid: 'user-123',
    subjectId: 'sub-cn-lab-g2',
    subjectName: 'Computer Networks Lab Group 2',
    subjectCode: 'CS303-G2',
    faculty: 'Dr. Neha Gupta',
    room: 'Lab-B',
    dayOfWeek: 3,
    startTime: '10:00',
    endTime: '11:00',
    color: '#8b5cf6',
    group: 'G2',
    isActive: true,
  },
  {
    id: 'slot-3',
    uid: 'user-123',
    subjectId: 'sub-cloud',
    subjectName: 'Cloud Computing & DevOps',
    subjectCode: 'CS304',
    faculty: 'Dr. Karan Deep',
    room: 'LH-204',
    dayOfWeek: 3,
    startTime: '11:15',
    endTime: '12:15',
    color: '#f59e0b',
    group: 'ALL',
    isActive: true,
  },
];

// Helper to construct a simulated date for testing
function makeSimulatedTime(year, month, day, hours, minutes, seconds = 0) {
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

// -------------------------------------------------------------
// Test 1: 10-Minute Trigger Window Calculation
// -------------------------------------------------------------
test('Calculates 10-minute alert trigger window correctly (T - 10 minutes)', () => {
  // Target class: 10:00 AM (slot-2-g1)
  // At 09:45 AM (15 mins prior): Not in 10-min window
  const time945 = makeSimulatedTime(2026, 10, 14, 9, 45, 0); // 2026-10-14 is a Wednesday (day 3)
  const result945 = calculateNextClassReminder(testWednesdaySlots, 'G1', time945);

  assert.strictEqual(result945.nextSlot?.id, 'slot-2-g1');
  assert.strictEqual(result945.minutesUntilStart, 15);
  assert.strictEqual(result945.isWithin10MinWindow, false);

  // At 09:50 AM (exactly 10 mins prior): Within 10-min window
  const time950 = makeSimulatedTime(2026, 10, 14, 9, 50, 0);
  const result950 = calculateNextClassReminder(testWednesdaySlots, 'G1', time950);

  assert.strictEqual(result950.nextSlot?.id, 'slot-2-g1');
  assert.strictEqual(result950.minutesUntilStart, 10);
  assert.strictEqual(result950.isWithin10MinWindow, true);

  // At 09:53 AM (7 mins prior): Within 10-min window
  const time953 = makeSimulatedTime(2026, 10, 14, 9, 53, 0);
  const result953 = calculateNextClassReminder(testWednesdaySlots, 'G1', time953);

  assert.strictEqual(result953.nextSlot?.id, 'slot-2-g1');
  assert.strictEqual(result953.minutesUntilStart, 7);
  assert.strictEqual(result953.isWithin10MinWindow, true);
});

// -------------------------------------------------------------
// Test 2: Group Isolation (G1 vs G2)
// -------------------------------------------------------------
test('Strict group isolation: Group 1 student receives G1 alerts, never G2 alerts', () => {
  const time950 = makeSimulatedTime(2026, 10, 14, 9, 50, 0);

  // Group 1 student
  const g1Result = calculateNextClassReminder(testWednesdaySlots, 'G1', time950);
  assert.strictEqual(g1Result.nextSlot?.id, 'slot-2-g1');
  assert.strictEqual(g1Result.nextSlot?.subjectName, 'OS Lab Group 1');
  assert.strictEqual(g1Result.nextSlot?.group, 'G1');

  // Group 2 student
  const g2Result = calculateNextClassReminder(testWednesdaySlots, 'G2', time950);
  assert.strictEqual(g2Result.nextSlot?.id, 'slot-2-g2');
  assert.strictEqual(g2Result.nextSlot?.subjectName, 'Computer Networks Lab Group 2');
  assert.strictEqual(g2Result.nextSlot?.group, 'G2');
});

// -------------------------------------------------------------
// Test 3: Past / Already-Started Classes Filtering
// -------------------------------------------------------------
test('Filters out classes that have already started or concluded', () => {
  // At 10:05 AM: 09:00 and 10:00 classes have already started
  const time1005 = makeSimulatedTime(2026, 10, 14, 10, 5, 0);
  const result1005 = calculateNextClassReminder(testWednesdaySlots, 'G1', time1005);

  assert.strictEqual(result1005.nextSlot?.id, 'slot-3');
  assert.strictEqual(result1005.nextSlot?.subjectName, 'Cloud Computing & DevOps');
  assert.strictEqual(result1005.minutesUntilStart, 70);
  assert.strictEqual(result1005.isWithin10MinWindow, false);

  // At 12:30 PM: All classes for Wednesday are over
  const time1230 = makeSimulatedTime(2026, 10, 14, 12, 30, 0);
  const result1230 = calculateNextClassReminder(testWednesdaySlots, 'G1', time1230);

  assert.strictEqual(result1230.nextSlot, null);
  assert.strictEqual(result1230.minutesUntilStart, null);
  assert.strictEqual(result1230.isWithin10MinWindow, false);
});

// -------------------------------------------------------------
// Test 4: Deduplication Key Determinism & Daily Scoping
// -------------------------------------------------------------
test('buildReminderStorageKey produces stable, unique keys per date, slot, and time', () => {
  const slot = testWednesdaySlots[1]; // slot-2-g1
  const dateOct14 = makeSimulatedTime(2026, 10, 14, 9, 50, 0);
  const dateOct15 = makeSimulatedTime(2026, 10, 15, 9, 50, 0);

  const key1 = buildReminderStorageKey(slot, dateOct14);
  const key1Repeat = buildReminderStorageKey(slot, dateOct14);
  const key2 = buildReminderStorageKey(slot, dateOct15);

  assert.strictEqual(key1, key1Repeat, 'Key must be deterministic');
  assert.ok(key1.includes('2026-10-14'), 'Key contains date');
  assert.ok(key1.includes('slot-2-g1'), 'Key contains slot ID');
  assert.ok(key1.includes('10:00'), 'Key contains start time');
  assert.notStrictEqual(key1, key2, 'Keys for different dates must not collide');
});

// -------------------------------------------------------------
// Test 5: Service Worker Push & Notification Click Navigation
// -------------------------------------------------------------
test('Service worker push handler script exists and routes clicks to /dashboard', () => {
  const swPath = path.join(rootDir, 'public', 'sw-push-handler.js');
  assert.ok(fs.existsSync(swPath), 'public/sw-push-handler.js must exist on disk');

  const swContent = fs.readFileSync(swPath, 'utf8');
  assert.ok(swContent.includes("addEventListener('push'"), 'SW must have push listener');
  assert.ok(swContent.includes("addEventListener('notificationclick'"), 'SW must have notificationclick listener');
  assert.ok(swContent.includes('/dashboard'), 'SW notificationclick must default to /dashboard');
  assert.ok(swContent.includes('clients.matchAll'), 'SW must match client windows for focus');
  assert.ok(swContent.includes('event.notification.close()'), 'SW must close notification on click');
});

// -------------------------------------------------------------
// Test 6: PWA Manifest start_url and Workbox importScripts
// -------------------------------------------------------------
test('Vite config specifies start_url: /dashboard and imports sw-push-handler.js', () => {
  const viteConfigPath = path.join(rootDir, 'vite.config.ts');
  const viteContent = fs.readFileSync(viteConfigPath, 'utf8');

  assert.ok(
    viteContent.includes("start_url: '/dashboard'"),
    'vite.config.ts must set PWA start_url to /dashboard'
  );
  assert.ok(
    viteContent.includes("importScripts: ['/sw-push-handler.js']"),
    'vite.config.ts must import sw-push-handler.js in Workbox'
  );
});

// -------------------------------------------------------------
// Test 7: Direct Landing Page Auto-Redirect for Authenticated Students
// -------------------------------------------------------------
test('App.tsx root route redirects authenticated students to /dashboard', () => {
  const appPath = path.join(rootDir, 'src', 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert.ok(
    appContent.includes('RootLandingRoute'),
    'App.tsx must define RootLandingRoute'
  );
  assert.ok(
    appContent.includes("currentUser ? <Navigate to=\"/dashboard\" replace />") ||
    appContent.includes('if (currentUser) {\n    return <Navigate to="/dashboard" replace />;'),
    'RootLandingRoute must redirect authenticated users to /dashboard'
  );
});

// -------------------------------------------------------------
// Test 8: Firestore Security Rules Support Push Subscriptions & Reminders
// -------------------------------------------------------------
test('Firestore rules allow pushSubscriptions and class_reminder creation', () => {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  assert.ok(
    rulesContent.includes('match /pushSubscriptions/{subId}'),
    'firestore.rules must include pushSubscriptions subcollection rule'
  );
  assert.ok(
    rulesContent.includes("'class_reminder' in request.resource.data.type") ||
    rulesContent.includes("request.resource.data.type in ['class_reminder'"),
    'firestore.rules must permit creating class_reminder notifications'
  );
});

// -------------------------------------------------------------
// Test 9: Web Audio Synthesizer Chime implementation
// -------------------------------------------------------------
test('playReminderChime is exported and contains Web Audio oscillator synthesis', () => {
  const schedulerPath = path.join(rootDir, 'src', 'lib', 'classReminderScheduler.ts');
  const schedulerContent = fs.readFileSync(schedulerPath, 'utf8');

  assert.ok(
    schedulerContent.includes('export function playReminderChime'),
    'classReminderScheduler must export playReminderChime'
  );
  assert.ok(
    schedulerContent.includes('createOscillator'),
    'playReminderChime must use Web Audio createOscillator'
  );
  assert.ok(
    schedulerContent.includes('createGain'),
    'playReminderChime must use Web Audio createGain'
  );
});

// -------------------------------------------------------------
// Test 10: Notification Triggers API (TimestampTrigger) Support
// -------------------------------------------------------------
test('Notification Triggers API (TimestampTrigger) scheduling is supported', () => {
  const schedulerPath = path.join(rootDir, 'src', 'lib', 'classReminderScheduler.ts');
  const schedulerContent = fs.readFileSync(schedulerPath, 'utf8');

  assert.ok(
    schedulerContent.includes('TimestampTrigger'),
    'classReminderScheduler must support native Chromium TimestampTrigger'
  );
  assert.ok(
    schedulerContent.includes('showTrigger'),
    'classReminderScheduler must handle showTrigger property'
  );
});

console.log('===============================================================');
console.log(` Summary: ${passCount} / ${passCount + failCount} Tests Passed (${Math.round((passCount / (passCount + failCount)) * 100)}%)`);
if (failCount === 0) {
  console.log(' All Push Notification & Class Reminder Features Verified!');
} else {
  console.error(` ${failCount} Tests Failed!`);
  process.exit(1);
}
console.log('===============================================================');
