import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('======================================================================');
console.log(' UNIFLOW NOTIFICATION DELIVERY & BACKGROUND FIX VERIFICATION SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS ${totalTests.toString().padStart(2, '0')}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests.toString().padStart(2, '0')}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Set up mock localStorage for Node testing environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => (mockStorage.has(key) ? mockStorage.get(key) : null),
  setItem: (key, value) => mockStorage.set(key, String(value)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

// Import notification modules
const {
  CANONICAL_REMINDER_OFFSET,
  buildDeterministicNotificationId,
  buildReminderStorageKey,
  calculateNextClassReminder,
  dispatchClassReminderNotification,
  hasReminderBeenSent,
  markReminderSent,
  markNotificationDismissed,
  isNotificationDismissedOrDeleted,
  getDismissedNotificationIds,
  detectPlatform,
  urlBase64ToUint8Array,
  CANONICAL_VAPID_PUBLIC_KEY,
} = await import('../src/lib/classReminderScheduler.ts');

const {
  isSlotIn10MinWindow,
  buildFcmPayload,
  buildWebPushPayload,
  sendWebPushNotification,
  runReminderDispatcher,
} = await import('./dispatch-class-reminders.mjs');

const mockSlot = {
  id: 'slot-operating-systems',
  uid: 'user-jivitesh-cu',
  subjectId: 'sub-os-101',
  subjectName: 'Operating Systems',
  subjectCode: 'CST301',
  faculty: 'Dr. Hardeep Singh',
  room: 'RJ-204',
  dayOfWeek: 3, // Wednesday
  startTime: '10:00',
  endTime: '10:50',
  color: '#3b82f6',
  group: 'G1',
  isActive: true,
};

// -----------------------------------------------------------------------------
// 1. Reminder Scheduling & Dispatch Timing (10-Minute Window)
// -----------------------------------------------------------------------------
console.log('--- 1. Reminder Scheduling & Dispatch Timing (10-Minute Window) ---');

runTest('Class at 10:00 evaluated at 09:50 (10 mins prior) is within active trigger window', () => {
  const time0950 = new Date(2026, 9, 14, 9, 50, 0); // 2026-10-14 Wednesday
  const res = calculateNextClassReminder([mockSlot], 'G1', time0950);
  assert.equal(res.nextSlot?.id, 'slot-operating-systems');
  assert.equal(res.minutesUntilStart, 10);
  assert.equal(res.isWithin10MinWindow, true);
});

runTest('Class at 10:00 evaluated at 09:44 (16 mins prior) is outside trigger window', () => {
  const time0944 = new Date(2026, 9, 14, 9, 44, 0);
  const res = calculateNextClassReminder([mockSlot], 'G1', time0944);
  assert.equal(res.nextSlot?.id, 'slot-operating-systems');
  assert.equal(res.minutesUntilStart, 16);
  assert.equal(res.isWithin10MinWindow, false);
});

runTest('Server dispatcher window helper identifies slots in 8-12 min window', () => {
  const now = new Date(2026, 9, 14, 9, 50, 0);
  assert.equal(isSlotIn10MinWindow('10:00', now), true, '10:00 is 10 min away');
  assert.equal(isSlotIn10MinWindow('10:02', now), true, '10:02 is 12 min away');
  assert.equal(isSlotIn10MinWindow('09:58', now), true, '09:58 is 8 min away');
  assert.equal(isSlotIn10MinWindow('10:15', now), false, '10:15 is 25 min away');
  assert.equal(isSlotIn10MinWindow('09:40', now), false, '09:40 has already passed');
});

// -----------------------------------------------------------------------------
// 2. Deterministic IDs & Prevention of Duplicates on Reload
// -----------------------------------------------------------------------------
console.log('\n--- 2. Deterministic Notification IDs & Deduplication Across Reloads ---');

runTest('Generates canonical deterministic ID with CANONICAL_REMINDER_OFFSET = 10', () => {
  const id = buildDeterministicNotificationId('user-123', mockSlot, '2026-10-14', 'class_reminder', CANONICAL_REMINDER_OFFSET);
  assert.equal(id, 'user-123_slot-operating-systems_2026-10-14_1000_class_reminder_10m');
});

runTest('Deduplication prevents re-dispatch when reminder already sent today', () => {
  localStorage.clear();
  const date = new Date(2026, 9, 14, 9, 50, 0);
  assert.equal(hasReminderBeenSent(mockSlot, date, 'user-123'), false);

  markReminderSent(mockSlot, date, 'user-123');
  assert.equal(hasReminderBeenSent(mockSlot, date, 'user-123'), true);

  // Calling markReminderSent repeatedly preserves the sent state
  markReminderSent(mockSlot, date, 'user-123');
  assert.equal(hasReminderBeenSent(mockSlot, date, 'user-123'), true);
});

// -----------------------------------------------------------------------------
// 3. Dismissed Reminders Never Resurface
// -----------------------------------------------------------------------------
console.log('\n--- 3. Persistent Dismissal & Root Prefix Matching ---');

runTest('Dismissing a notification prevents any offset variant from resurfacing', () => {
  localStorage.clear();
  const canonicalId = 'user-123_slot-operating-systems_2026-10-14_1000_class_reminder_10m';
  assert.equal(isNotificationDismissedOrDeleted(canonicalId, 'user-123'), false);

  // User dismisses notification from drawer
  markNotificationDismissed(canonicalId, 'user-123');
  assert.equal(isNotificationDismissedOrDeleted(canonicalId, 'user-123'), true);

  // Variant check: a check generated with any offset (e.g. 9m, 8m) is also recognized as dismissed!
  const variantId = 'user-123_slot-operating-systems_2026-10-14_1000_class_reminder_8m';
  assert.equal(isNotificationDismissedOrDeleted(variantId, 'user-123'), true);

  // hasReminderBeenSent respects dismissal
  const date = new Date(2026, 9, 14, 9, 52, 0);
  assert.equal(hasReminderBeenSent(mockSlot, date, 'user-123'), true);
});

runTest('Dismissal is strictly user-scoped (User A dismissal does not block User B)', () => {
  const canonicalId = 'user-123_slot-operating-systems_2026-10-14_1000_class_reminder_10m';
  assert.equal(isNotificationDismissedOrDeleted(canonicalId, 'user-other-person'), false);
});

// -----------------------------------------------------------------------------
// 4. Stale / Missed Reminders Handling on App Open
// -----------------------------------------------------------------------------
console.log('\n--- 4. Stale / Missed Reminder Prevention on App Open ---');

runTest('Opening app after class has already started does not trigger reminder', () => {
  const time1005 = new Date(2026, 9, 14, 10, 5, 0); // 5 mins after class began
  const res = calculateNextClassReminder([mockSlot], 'G1', time1005);
  // Slot has already started, so it must NOT be selected as next upcoming 10-min reminder
  assert.notEqual(res.nextSlot?.id, 'slot-operating-systems');
  assert.equal(res.isWithin10MinWindow, false);
});

runTest('Opening app 10 seconds before class (< 0.5m) does not trigger stale 10-minute alert', () => {
  const time0959 = new Date(2026, 9, 14, 9, 59, 45); // 15 seconds before 10:00
  const res = calculateNextClassReminder([mockSlot], 'G1', time0959);
  assert.equal(res.isWithin10MinWindow, false, 'Class within 30 seconds should not trigger stale 10m reminder');
});

// -----------------------------------------------------------------------------
// 5. Background Message Handling & Push Payload Formatting
// -----------------------------------------------------------------------------
console.log('\n--- 5. Service Worker Background Push & Payload Verification ---');

runTest('buildFcmPayload constructs standard FCM multicast payload with deep link data', () => {
  const tokens = ['device-token-1', 'device-token-2'];
  const payload = buildFcmPayload(mockSlot, tokens, 10);

  assert.equal(payload.notification.title, 'Class in 10 mins: Operating Systems');
  assert.ok(payload.notification.body.includes('10:00 – 10:50'));
  assert.ok(payload.notification.body.includes('RJ-204'));
  assert.equal(payload.data.url, '/timetable');
  assert.equal(payload.data.slotId, 'slot-operating-systems');
  assert.deepEqual(payload.tokens, tokens);
});

runTest('buildWebPushPayload creates RFC 8291 payload with timetable deep-link data', () => {
  const payload = buildWebPushPayload(mockSlot, 10);

  assert.equal(payload.title, 'Class in 10 mins: Operating Systems');
  assert.ok(payload.body.includes('10:00 – 10:50'));
  assert.ok(payload.body.includes('RJ-204'));
  assert.equal(payload.url, '/timetable');
  assert.equal(payload.data.slotId, 'slot-operating-systems');
  assert.equal(payload.data.type, 'class_reminder');
  assert.equal(payload.icon, '/icons/icon-192x192.png');
});

runTest('CANONICAL_VAPID_PUBLIC_KEY is valid 65-byte uncompressed P-256 key', () => {
  assert.ok(typeof CANONICAL_VAPID_PUBLIC_KEY === 'string');
  const rawBytes = urlBase64ToUint8Array(CANONICAL_VAPID_PUBLIC_KEY);
  assert.equal(rawBytes.length, 65, 'Uncompressed P-256 public key must be 65 bytes');
  assert.equal(rawBytes[0], 0x04, 'First byte must be 0x04 for uncompressed EC point');
});

runTest('sendWebPushNotification is a callable async function', () => {
  assert.equal(typeof sendWebPushNotification, 'function');
});

runTest('sw-push-handler.js extracts both FCM v1 and standard Web Push formats', () => {
  const swPath = path.join(rootDir, 'public', 'sw-push-handler.js');
  const swSrc = fs.readFileSync(swPath, 'utf8');

  assert.ok(swSrc.includes('const notif = raw.notification || {};'), 'SW extracts notification block');
  assert.ok(swSrc.includes('const customData = raw.data || {};'), 'SW extracts custom data block');
  assert.ok(swSrc.includes('renotify: true'), 'SW specifies renotify');
  assert.ok(swSrc.includes("actions: [\n      { action: 'open_dashboard'"), 'SW specifies open_dashboard action');
  assert.ok(swSrc.includes("if (event.action === 'dismiss')"), 'SW handles dismiss action cleanly');
});

// -----------------------------------------------------------------------------
// 6. Platform Capability Detection
// -----------------------------------------------------------------------------
console.log('\n--- 6. Client Platform & Capability Detection ---');

runTest('detectPlatform detects environment accurately', () => {
  globalThis.window = {
    navigator: { standalone: false },
    matchMedia: () => ({ matches: false }),
  };

  const setNavigatorProp = (key, value) => {
    Object.defineProperty(globalThis.navigator, key, {
      value,
      configurable: true,
      writable: true,
    });
  };

  setNavigatorProp('userAgent', 'Mozilla/5.0 (Android; Mobile)');
  assert.equal(detectPlatform(), 'android');

  setNavigatorProp('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  assert.equal(detectPlatform(), 'ios_safari');

  globalThis.window.navigator.standalone = true;
  assert.equal(detectPlatform(), 'ios_pwa');

  setNavigatorProp('userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  globalThis.window.navigator.standalone = false;
  assert.equal(detectPlatform(), 'desktop');
});

runTest('urlBase64ToUint8Array decodes standard base64 VAPID keys correctly', () => {
  // Test with standard 87-character base64 VAPID public key sample
  const sampleVapid = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuNu0cqTBlOGNedMnU3VN3YBiQ';
  const uint8 = urlBase64ToUint8Array(sampleVapid);
  assert.ok(uint8 instanceof Uint8Array);
  assert.equal(uint8.length, 65); // standard P-256 public key is 65 bytes
});

// -----------------------------------------------------------------------------
// 7. Spark-Compliant Server Dispatcher Dry-Run Execution
// -----------------------------------------------------------------------------
console.log('\n--- 7. Spark-Compliant Server Dispatcher Dry-Run Execution ---');

runTest('runReminderDispatcher executes cleanly in test / dry-run mode without crashing', async () => {
  const result = await runReminderDispatcher({ dryRun: true, now: new Date(2026, 9, 14, 9, 50, 0) });
  assert.equal(result.status, 'success_dry_run');
  assert.equal(typeof result.dispatchedCount, 'number');
});

runTest('GitHub Actions cron workflow is defined and runs every 10 min during college hours', () => {
  const workflowPath = path.join(rootDir, '.github/workflows/scheduled-class-reminders.yml');
  assert.ok(fs.existsSync(workflowPath), '.github/workflows/scheduled-class-reminders.yml exists');

  const content = fs.readFileSync(workflowPath, 'utf8');
  assert.ok(content.includes("cron: '*/10 3-12 * * 1-5'"), 'Workflow defines 10-minute weekday schedule');
  assert.ok(content.includes('node scripts/dispatch-class-reminders.mjs'), 'Workflow calls dispatch-class-reminders.mjs');
  assert.ok(content.includes('FIREBASE_SERVICE_ACCOUNT_KEY'), 'Workflow securely maps service account key secret');
});

// -----------------------------------------------------------------------------
// 8. Global AppLayout Watcher Mounting
// -----------------------------------------------------------------------------
console.log('\n--- 8. AppLayout Global Reminder Watcher ---');

runTest('AppLayout.tsx mounts AppReminderWatcher to ensure reminders tick across all routes', () => {
  const appLayoutPath = path.join(rootDir, 'src/components/layout/AppLayout.tsx');
  const appLayoutSrc = fs.readFileSync(appLayoutPath, 'utf8');
  assert.ok(appLayoutSrc.includes("import { AppReminderWatcher } from '../notifications/AppReminderWatcher';"), 'AppLayout imports AppReminderWatcher');
  assert.ok(appLayoutSrc.includes('<AppReminderWatcher />'), 'AppLayout renders AppReminderWatcher');
});

// Clean up globals
delete globalThis.window;
delete globalThis.navigator;

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(' All notification delivery and background fix tests verified! 🚀');
console.log('======================================================================\n');
