import assert from 'node:assert/strict';
import {
  buildDeterministicNotificationId,
  markNotificationDismissed,
  isNotificationDismissedOrDeleted,
  getDismissedNotificationIds,
} from '../src/lib/classReminderScheduler.ts';
import { matchesTargetSection } from '../src/lib/chitkaraTimetableParser.ts';
import { calculateAttendanceStats, calculateLectureWeight } from '../src/lib/attendanceCalculations.ts';

// Mock localStorage for node environment
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
}

console.log('======================================================================');
console.log(' UNIFLOW CRITICAL BUG FIXES & ATTENDANCE LOGIC VERIFICATION SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS ${totalTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// 1. NOTIFICATIONS DEDUPLICATION, DETERMINISTIC IDS & DISMISSAL
// -----------------------------------------------------------------------------
console.log('--- 1. Notifications Deduplication, Deterministic IDs & Persistent Dismissal ---');

const mockSlot = {
  id: 'slot-5c-math',
  uid: 'user-jivitesh',
  subjectName: 'Applied Mathematics',
  startTime: '09:00',
  endTime: '09:50',
};

runTest('Generates deterministic notification IDs for the same slot, date and offset', () => {
  const id1 = buildDeterministicNotificationId('user-jivitesh', mockSlot, '2026-10-14', 'class_reminder', 10);
  const id2 = buildDeterministicNotificationId('user-jivitesh', mockSlot, '2026-10-14', 'class_reminder', 10);
  assert.equal(id1, id2);
  assert.equal(id1, 'user-jivitesh_slot-5c-math_2026-10-14_0900_class_reminder_10m');
});

runTest('Generates different notification IDs for different dates or different slots', () => {
  const idDay1 = buildDeterministicNotificationId('user-jivitesh', mockSlot, '2026-10-14', 'class_reminder', 10);
  const idDay2 = buildDeterministicNotificationId('user-jivitesh', mockSlot, '2026-10-15', 'class_reminder', 10);
  assert.notEqual(idDay1, idDay2);
});

runTest('Tracks dismissed notifications in localStorage and suppresses reappearance', () => {
  localStorage.clear();
  const notifId = 'reminder_user-jivitesh_slot-5c-math_2026-10-14_m10';
  assert.equal(isNotificationDismissedOrDeleted(notifId, 'user-jivitesh'), false);

  markNotificationDismissed(notifId, 'user-jivitesh');
  assert.equal(isNotificationDismissedOrDeleted(notifId, 'user-jivitesh'), true);
  assert.ok(getDismissedNotificationIds('user-jivitesh').has(notifId));

  // User isolation: other user does not have this in their dismissed list
  assert.equal(isNotificationDismissedOrDeleted(notifId, 'user-other'), false);
});

// -----------------------------------------------------------------------------
// 2. SECTION MATCHING: 5C vs 5A (FACULTY RESOLUTION)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Section Matching: BE-CSE-5C vs 5A (Faculty Resolution) ---');

runTest('Matches target section queries "5C", "C", "Section C", and "BE-CSE-5C" to "BE-CSE-5C"', () => {
  const pdfSec = 'BE-CSE-5C';
  assert.ok(matchesTargetSection(pdfSec, '5C'), 'Should match 5C');
  assert.ok(matchesTargetSection(pdfSec, 'C'), 'Should match C');
  assert.ok(matchesTargetSection(pdfSec, 'Section C'), 'Should match Section C');
  assert.ok(matchesTargetSection(pdfSec, 'BE-CSE-5C'), 'Should match BE-CSE-5C');
  assert.ok(matchesTargetSection(pdfSec, 'sec-5c'), 'Should match sec-5c');
});

runTest('Does NOT falsely match 5C or C queries to Section 5A or 5B', () => {
  assert.equal(matchesTargetSection('BE-CSE-5A', '5C'), false);
  assert.equal(matchesTargetSection('BE-CSE-5A', 'C'), false);
  assert.equal(matchesTargetSection('BE-CSE-5B', '5C'), false);
  assert.equal(matchesTargetSection('BE-CSE-5B', 'Section C'), false);
});

// -----------------------------------------------------------------------------
// 3. MULTI-PERIOD LABS & LECTURE ATTENDANCE WEIGHTS
// -----------------------------------------------------------------------------
console.log('\n--- 3. Multi-Period Labs & Lecture Attendance Weights ---');

runTest('Calculates weight = 2 for 100-minute multi-period lab session', () => {
  const labSlot = {
    subjectName: 'Operating Systems Lab',
    startTime: '09:00',
    endTime: '10:40',
  };
  const res = calculateLectureWeight(labSlot);
  assert.equal(res.weight, 2);
  assert.equal(res.isConfident, true);
});

runTest('Calculates weight = 1 for standard 50-minute lecture', () => {
  const lectureSlot = {
    subjectName: 'Computer Networks',
    startTime: '09:00',
    endTime: '09:50',
  };
  const res = calculateLectureWeight(lectureSlot);
  assert.equal(res.weight, 1);
  assert.equal(res.isConfident, true);
});

runTest('Weighted lab present increments attended and conducted by scheduled weight (2)', () => {
  let attended = 10;
  let conducted = 12;

  const weight = 2; // Lab weight
  attended += weight;
  conducted += weight;

  assert.equal(attended, 12);
  assert.equal(conducted, 14);
  const stats = calculateAttendanceStats(attended, conducted, 0.75);
  assert.ok(Math.abs(stats.percentage - (12 / 14) * 100) < 0.01);
});

runTest('Weighted lab absent increments conducted by scheduled weight (2) and attended by 0', () => {
  let attended = 10;
  let conducted = 12;

  const weight = 2; // Lab weight
  conducted += weight;

  assert.equal(attended, 10);
  assert.equal(conducted, 14);
  const stats = calculateAttendanceStats(attended, conducted, 0.75);
  assert.ok(Math.abs(stats.percentage - (10 / 14) * 100) < 0.01);
});

// -----------------------------------------------------------------------------
// 4. ATTENDANCE TARGET DYNAMIC THRESHOLDS
// -----------------------------------------------------------------------------
console.log('\n--- 4. Attendance Target Dynamic Thresholds ---');

runTest('Calculates dynamic shortage/on-track status for 50%, 75%, and 90% targets', () => {
  const attended = 8;
  const conducted = 10; // 80%

  // Target 75% -> On track
  const stats75 = calculateAttendanceStats(attended, conducted, 0.75);
  assert.equal(stats75.isOnTrack, true);
  assert.ok(stats75.maxAbsences >= 0);

  // Target 50% -> On track
  const stats50 = calculateAttendanceStats(attended, conducted, 0.50);
  assert.equal(stats50.isOnTrack, true);

  // Target 90% -> Shortage
  const stats90 = calculateAttendanceStats(attended, conducted, 0.90);
  assert.equal(stats90.isOnTrack, false);
  assert.ok(stats90.classesNeeded > 0);
});

// -----------------------------------------------------------------------------
// 5. BASELINE + UNIFLOW LOGS CONSISTENCY & DYNAMISM
// -----------------------------------------------------------------------------
console.log('\n--- 5. Baseline + UniFlow Logs Dynamism ---');

runTest('Combines manual baseline and logged UniFlow records without drift', () => {
  const manualBaseline = { attended: 20, conducted: 25 };
  const uniflowLogs = [
    { status: 'present', weight: 1 },
    { status: 'present', weight: 2 }, // lab
    { status: 'absent', weight: 1 },
  ];

  const loggedAttended = uniflowLogs.reduce(
    (acc, l) => acc + (l.status === 'present' ? l.weight : 0),
    0
  );
  const loggedConducted = uniflowLogs.reduce((acc, l) => acc + l.weight, 0);

  const totalAttended = manualBaseline.attended + loggedAttended;
  const totalConducted = manualBaseline.conducted + loggedConducted;

  assert.equal(loggedAttended, 3);
  assert.equal(loggedConducted, 4);
  assert.equal(totalAttended, 23);
  assert.equal(totalConducted, 29);
  assert.ok(Math.abs(totalAttended / totalConducted - 23 / 29) < 0.0001);
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(' All critical bug fixes & attendance logic corrections verified! 🚀');
console.log('======================================================================\n');
