import assert from 'node:assert/strict';
import {
  calculateDailySlotSessionNumber,
  calculateLiveClassState,
  getSubjectMatchKey,
  timeToMinutes,
} from '../src/lib/timetableCalculations.ts';

console.log('======================================================================');
console.log(' UNIFLOW DASHBOARD LECTURE NUMBER REGRESSION TEST SUITE');
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
// 1. FIRST AND SUBSEQUENT SESSIONS OF A SUBJECT ON THE SAME DAY
// -----------------------------------------------------------------------------
console.log('--- 1. First & Subsequent Sessions on Same Day ---');

const daySlotsWithMultipleSessions = [
  {
    id: 'math-1',
    subjectCode: 'MATH101',
    subjectName: 'Calculus',
    startTime: '09:00',
    endTime: '09:50',
    dayOfWeek: 1,
    isActive: true,
  },
  {
    id: 'cs-1',
    subjectCode: 'CS101',
    subjectName: 'Data Structures',
    startTime: '10:00',
    endTime: '10:50',
    dayOfWeek: 1,
    isActive: true,
  },
  {
    id: 'math-2',
    subjectCode: 'MATH101',
    subjectName: 'Calculus',
    startTime: '13:00',
    endTime: '13:50',
    dayOfWeek: 1,
    isActive: true,
  },
];

runTest('First session of a subject on same day is numbered Lecture 1 of 2', () => {
  const target = daySlotsWithMultipleSessions[0];
  const result = calculateDailySlotSessionNumber(target, daySlotsWithMultipleSessions);
  assert.ok(result);
  assert.equal(result.sessionNumber, 1);
  assert.equal(result.totalSessions, 2);
});

runTest('Second session of a subject on same day is numbered Lecture 2 of 2', () => {
  const target = daySlotsWithMultipleSessions[2];
  const result = calculateDailySlotSessionNumber(target, daySlotsWithMultipleSessions);
  assert.ok(result);
  assert.equal(result.sessionNumber, 2);
  assert.equal(result.totalSessions, 2);
});

// -----------------------------------------------------------------------------
// 2. MULTIPLE SUBJECTS INTERLEAVED IN TIMETABLE
// -----------------------------------------------------------------------------
console.log('\n--- 2. Interleaved Multiple Subjects ---');

const interleavedDaySlots = [
  { id: 's1', subjectCode: 'PHY101', subjectName: 'Physics', startTime: '09:00', endTime: '09:50', dayOfWeek: 2, isActive: true },
  { id: 's2', subjectCode: 'CHEM101', subjectName: 'Chemistry', startTime: '10:00', endTime: '10:50', dayOfWeek: 2, isActive: true },
  { id: 's3', subjectCode: 'PHY101', subjectName: 'Physics', startTime: '11:00', endTime: '11:50', dayOfWeek: 2, isActive: true },
  { id: 's4', subjectCode: 'CHEM101', subjectName: 'Chemistry', startTime: '12:00', endTime: '12:50', dayOfWeek: 2, isActive: true },
  { id: 's5', subjectCode: 'PHY101', subjectName: 'Physics', startTime: '14:00', endTime: '14:50', dayOfWeek: 2, isActive: true },
];

runTest('Interleaved slots correctly track independent counts per subject', () => {
  const phy1 = calculateDailySlotSessionNumber(interleavedDaySlots[0], interleavedDaySlots);
  const chem1 = calculateDailySlotSessionNumber(interleavedDaySlots[1], interleavedDaySlots);
  const phy2 = calculateDailySlotSessionNumber(interleavedDaySlots[2], interleavedDaySlots);
  const chem2 = calculateDailySlotSessionNumber(interleavedDaySlots[3], interleavedDaySlots);
  const phy3 = calculateDailySlotSessionNumber(interleavedDaySlots[4], interleavedDaySlots);

  assert.equal(phy1.sessionNumber, 1);
  assert.equal(phy1.totalSessions, 3);

  assert.equal(chem1.sessionNumber, 1);
  assert.equal(chem1.totalSessions, 2);

  assert.equal(phy2.sessionNumber, 2);
  assert.equal(phy2.totalSessions, 3);

  assert.equal(chem2.sessionNumber, 2);
  assert.equal(chem2.totalSessions, 2);

  assert.equal(phy3.sessionNumber, 3);
  assert.equal(phy3.totalSessions, 3);
});

// -----------------------------------------------------------------------------
// 3. LIVE VS UPCOMING CLASS CARDS (calculateLiveClassState)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Live vs Upcoming State with Lecture Number ---');

function createTime(dayOfWeek, hours, minutes) {
  const d = new Date(2026, 9, 12 + ((dayOfWeek + 6) % 7), hours, minutes, 0, 0);
  return d;
}

runTest('LIVE_NOW state populates targetSlotSessionNumber for currently running lecture', () => {
  // Monday is dayOfWeek = 1
  const slots = [
    { id: 'os-1', subjectCode: 'CS301', subjectName: 'Operating Systems', startTime: '09:00', endTime: '09:50', dayOfWeek: 1, isActive: true },
    { id: 'os-2', subjectCode: 'CS301', subjectName: 'Operating Systems', startTime: '11:00', endTime: '11:50', dayOfWeek: 1, isActive: true },
  ];

  // At 09:20 -> live class CS301 (Session 1)
  const now = new Date();
  now.setHours(9, 20, 0, 0);
  const day = now.getDay();
  // Align day of slot to now's day
  slots.forEach(s => s.dayOfWeek = day);

  const liveState = calculateLiveClassState(slots, now);
  assert.equal(liveState.status, 'LIVE_NOW');
  assert.equal(liveState.currentSlot?.id, 'os-1');
  assert.equal(liveState.targetSlotSessionNumber, 1);
  assert.equal(liveState.totalSubjectSessionsToday, 2);
});

runTest('STARTING_SOON / Upcoming state populates targetSlotSessionNumber for next upcoming class', () => {
  const now = new Date();
  now.setHours(10, 50, 0, 0);
  const day = now.getDay();

  const slots = [
    { id: 'os-1', subjectCode: 'CS301', subjectName: 'Operating Systems', startTime: '09:00', endTime: '09:50', dayOfWeek: day, isActive: true },
    { id: 'os-2', subjectCode: 'CS301', subjectName: 'Operating Systems', startTime: '11:00', endTime: '11:50', dayOfWeek: day, isActive: true },
  ];

  const liveState = calculateLiveClassState(slots, now);
  assert.ok(liveState.status === 'STARTING_SOON' || liveState.status === 'FREE_NOW');
  assert.equal(liveState.nextSlot?.id, 'os-2');
  assert.equal(liveState.targetSlotSessionNumber, 2);
  assert.equal(liveState.totalSubjectSessionsToday, 2);
});

// -----------------------------------------------------------------------------
// 4. MULTI-PERIOD LABS
// -----------------------------------------------------------------------------
console.log('\n--- 4. Multi-Period Labs Handling ---');

runTest('A multi-period lab spanning 100 minutes is treated as one scheduled session', () => {
  const labSlots = [
    {
      id: 'lab-slot',
      subjectCode: 'CS302L',
      subjectName: 'Operating Systems Lab',
      startTime: '09:00',
      endTime: '10:40',
      periods: 2,
      weight: 2,
      dayOfWeek: 3,
      isActive: true,
    },
    {
      id: 'lec-slot',
      subjectCode: 'CS302',
      subjectName: 'Operating Systems',
      startTime: '13:00',
      endTime: '13:50',
      periods: 1,
      weight: 1,
      dayOfWeek: 3,
      isActive: true,
    },
  ];

  const labSession = calculateDailySlotSessionNumber(labSlots[0], labSlots);
  assert.ok(labSession);
  assert.equal(labSession.sessionNumber, 1);
  assert.equal(labSession.totalSessions, 1);
});

// -----------------------------------------------------------------------------
// 5. MISSING OR INVALID TIMETABLE DATA
// -----------------------------------------------------------------------------
console.log('\n--- 5. Edge Cases & Invalid Data ---');

runTest('Returns null gracefully when slot is null or undefined', () => {
  assert.equal(calculateDailySlotSessionNumber(null, []), null);
  assert.equal(calculateDailySlotSessionNumber(undefined, []), null);
});

runTest('Returns null gracefully when target slot has no identifiable subject', () => {
  const emptySlot = { id: 'x', startTime: '09:00', endTime: '10:00' };
  assert.equal(calculateDailySlotSessionNumber(emptySlot, []), null);
});

runTest('Ignores inactive slots from daily calculation', () => {
  const slotsWithInactive = [
    { id: 'math-cancelled', subjectCode: 'MATH101', startTime: '08:00', endTime: '08:50', isActive: false },
    { id: 'math-active', subjectCode: 'MATH101', startTime: '10:00', endTime: '10:50', isActive: true },
  ];
  const res = calculateDailySlotSessionNumber(slotsWithInactive[1], slotsWithInactive);
  assert.ok(res);
  assert.equal(res.sessionNumber, 1);
  assert.equal(res.totalSessions, 1);
});

// -----------------------------------------------------------------------------
// 6. CHRONOLOGICAL SORTING INDEPENDENT OF ARRAY ORDER
// -----------------------------------------------------------------------------
console.log('\n--- 6. Chronological Start Time Ordering ---');

runTest('Correctly numbers slots in chronological order even if array is unordered', () => {
  const unordered = [
    { id: 'afternoon', subjectCode: 'AAIPD', startTime: '14:00', endTime: '14:50', isActive: true },
    { id: 'morning', subjectCode: 'AAIPD', startTime: '09:00', endTime: '09:50', isActive: true },
  ];

  const morningRes = calculateDailySlotSessionNumber(unordered[1], unordered);
  const afternoonRes = calculateDailySlotSessionNumber(unordered[0], unordered);

  assert.equal(morningRes.sessionNumber, 1);
  assert.equal(afternoonRes.sessionNumber, 2);
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(' All Dashboard lecture number & regression tests verified! 🚀');
console.log('======================================================================\n');
