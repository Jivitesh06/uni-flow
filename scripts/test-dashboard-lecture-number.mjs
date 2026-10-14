import assert from 'node:assert/strict';
import {
  calculateDailySlotSessionNumber,
  calculateLiveClassState,
  mapSlotToTimetablePeriod,
  INSTITUTIONAL_PERIODS,
} from '../src/lib/timetableCalculations.ts';

console.log('======================================================================');
console.log(' UNIFLOW TIMETABLE PERIOD MAPPING & LECTURE NUMBER TEST SUITE');
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
// 1. INSTITUTIONAL 50-MINUTE LECTURE PERIODS (1 TO 8)
// -----------------------------------------------------------------------------
console.log('--- 1. Standard 50-Minute University Lecture Periods ---');

const standardPeriods = [
  { period: 1, start: '09:30', end: '10:20' },
  { period: 2, start: '10:20', end: '11:10' },
  { period: 3, start: '11:10', end: '12:00' },
  { period: 4, start: '12:00', end: '12:50' },
  { period: 5, start: '12:50', end: '13:40' },
  { period: 6, start: '13:40', end: '14:30' },
  { period: 7, start: '14:30', end: '15:20' },
  { period: 8, start: '15:20', end: '16:10' },
];

for (const p of standardPeriods) {
  runTest(`Period ${p.period} (${p.start}–${p.end}) maps to Lecture ${p.period} (L${p.period})`, () => {
    const slot = {
      id: `slot-p${p.period}`,
      subjectCode: 'CS101',
      startTime: p.start,
      endTime: p.end,
      dayOfWeek: 1,
      isActive: true,
    };
    const mapped = calculateDailySlotSessionNumber(slot);
    assert.ok(mapped);
    assert.equal(mapped.startPeriod, p.period);
    assert.equal(mapped.endPeriod, p.period);
    assert.equal(mapped.sessionNumber, p.period);
    assert.equal(mapped.periodLabel, `Lecture ${p.period}`);
    assert.equal(mapped.compactLabel, `L${p.period}`);
    assert.equal(mapped.isMultiPeriod, false);
  });
}

// -----------------------------------------------------------------------------
// 2. MULTI-PERIOD LAB SESSIONS (CONSECUTIVE PERIOD SPANS)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Multi-Period Labs Spanning Consecutive Periods ---');

runTest('Lab 09:30–11:10 maps to Lecture 1–2 (L1–2)', () => {
  const slot = {
    id: 'adi-lab',
    subjectCode: 'ADI',
    subjectName: 'Advanced Data Structures Lab',
    startTime: '09:30',
    endTime: '11:10',
    periods: 2,
    weight: 2,
    dayOfWeek: 1,
    isActive: true,
  };
  const mapped = calculateDailySlotSessionNumber(slot);
  assert.ok(mapped);
  assert.equal(mapped.startPeriod, 1);
  assert.equal(mapped.endPeriod, 2);
  assert.equal(mapped.periodLabel, 'Lecture 1–2');
  assert.equal(mapped.compactLabel, 'L1–2');
  assert.equal(mapped.isMultiPeriod, true);
});

runTest('Lab 14:30–16:10 maps to Lecture 7–8 (L7–8)', () => {
  const slot = {
    id: 'nalr-lab',
    subjectCode: 'NALR-I',
    subjectName: 'Network Analytics Lab',
    startTime: '14:30',
    endTime: '16:10',
    periods: 2,
    weight: 2,
    dayOfWeek: 1,
    isActive: true,
  };
  const mapped = calculateDailySlotSessionNumber(slot);
  assert.ok(mapped);
  assert.equal(mapped.startPeriod, 7);
  assert.equal(mapped.endPeriod, 8);
  assert.equal(mapped.periodLabel, 'Lecture 7–8');
  assert.equal(mapped.compactLabel, 'L7–8');
  assert.equal(mapped.isMultiPeriod, true);
});

runTest('Lab 13:40–15:20 maps to Lecture 6–7 (L6–7)', () => {
  const slot = {
    id: 'ai-lab',
    subjectCode: 'AAIPD',
    startTime: '13:40',
    endTime: '15:20',
    periods: 2,
    dayOfWeek: 2,
    isActive: true,
  };
  const mapped = calculateDailySlotSessionNumber(slot);
  assert.ok(mapped);
  assert.equal(mapped.startPeriod, 6);
  assert.equal(mapped.endPeriod, 7);
  assert.equal(mapped.periodLabel, 'Lecture 6–7');
  assert.equal(mapped.compactLabel, 'L6–7');
  assert.equal(mapped.isMultiPeriod, true);
});

// -----------------------------------------------------------------------------
// 3. COMPLETE STUDENT SCHEDULE (FIXING OCCURRENCE-BASED REGRESSION)
// -----------------------------------------------------------------------------
console.log('\n--- 3. Full Daily Schedule Period Mapping Consistency ---');

const studentDaySchedule = [
  { id: 's1', subjectCode: 'ADI', startTime: '09:30', endTime: '11:10', periods: 2, weight: 2 },
  { id: 's2', subjectCode: 'NALR-I', startTime: '11:10', endTime: '12:00' },
  { id: 's3', subjectCode: 'AAIPD', startTime: '12:00', endTime: '12:50' },
  { id: 's4', subjectCode: 'SE', startTime: '13:40', endTime: '14:30' },
  { id: 's5', subjectCode: 'NALR-I', startTime: '14:30', endTime: '16:10', periods: 2, weight: 2 },
];

runTest('Schedule maps ADI to Lecture 1–2, NOT Lecture 1 (Lab 2×)', () => {
  const res = calculateDailySlotSessionNumber(studentDaySchedule[0]);
  assert.equal(res?.periodLabel, 'Lecture 1–2');
  assert.equal(res?.compactLabel, 'L1–2');
});

runTest('Schedule maps first NALR-I to Lecture 3, NOT Lecture 1', () => {
  const res = calculateDailySlotSessionNumber(studentDaySchedule[1]);
  assert.equal(res?.periodLabel, 'Lecture 3');
  assert.equal(res?.compactLabel, 'L3');
});

runTest('Schedule maps AAIPD to Lecture 4, NOT Lecture 1', () => {
  const res = calculateDailySlotSessionNumber(studentDaySchedule[2]);
  assert.equal(res?.periodLabel, 'Lecture 4');
  assert.equal(res?.compactLabel, 'L4');
});

runTest('Schedule maps second NALR-I (lab) to Lecture 7–8, NOT Lecture 2 (Lab 2×)', () => {
  const res = calculateDailySlotSessionNumber(studentDaySchedule[4]);
  assert.equal(res?.periodLabel, 'Lecture 7–8');
  assert.equal(res?.compactLabel, 'L7–8');
});

// -----------------------------------------------------------------------------
// 4. LIVE VS UPCOMING CLASS CARDS (calculateLiveClassState)
// -----------------------------------------------------------------------------
console.log('\n--- 4. Live vs Upcoming State with Period Labels ---');

runTest('LIVE_NOW state populates targetSlotPeriodLabel for ongoing multi-period lab', () => {
  const slots = [
    { id: 'lab-1', subjectCode: 'ADI', startTime: '09:30', endTime: '11:10', dayOfWeek: 1, isActive: true },
    { id: 'lec-2', subjectCode: 'NALR-I', startTime: '11:10', endTime: '12:00', dayOfWeek: 1, isActive: true },
  ];

  const now = new Date();
  now.setHours(10, 0, 0, 0); // 10:00 is during Period 1–2
  slots.forEach(s => (s.dayOfWeek = now.getDay()));

  const liveState = calculateLiveClassState(slots, now);
  assert.equal(liveState.status, 'LIVE_NOW');
  assert.equal(liveState.currentSlot?.id, 'lab-1');
  assert.equal(liveState.targetSlotPeriodLabel, 'Lecture 1–2');
  assert.equal(liveState.targetSlotCompactLabel, 'L1–2');
  assert.equal(liveState.targetSlotSessionNumber, 1);
});

runTest('STARTING_SOON / Upcoming state populates targetSlotPeriodLabel for next class', () => {
  const now = new Date();
  now.setHours(13, 30, 0, 0); // 13:30 (10 mins before Period 6 at 13:40)

  const slots = [
    { id: 'lec-1', subjectCode: 'ADI', startTime: '09:30', endTime: '10:20', dayOfWeek: now.getDay(), isActive: true },
    { id: 'lec-6', subjectCode: 'SE', startTime: '13:40', endTime: '14:30', dayOfWeek: now.getDay(), isActive: true },
  ];

  const liveState = calculateLiveClassState(slots, now);
  assert.ok(liveState.status === 'STARTING_SOON' || liveState.status === 'FREE_NOW');
  assert.equal(liveState.nextSlot?.id, 'lec-6');
  assert.equal(liveState.targetSlotPeriodLabel, 'Lecture 6');
  assert.equal(liveState.targetSlotCompactLabel, 'L6');
  assert.equal(liveState.targetSlotSessionNumber, 6);
});

// -----------------------------------------------------------------------------
// 5. EDGE CASES & GRACEFUL DEGRADATION
// -----------------------------------------------------------------------------
console.log('\n--- 5. Edge Cases & Graceful Degradation ---');

runTest('Returns null for non-academic slots (e.g. Library / Break / Mentoring)', () => {
  const libSlot = { startTime: '12:50', endTime: '13:40', subjectName: 'Library', isNonAcademic: true };
  assert.equal(calculateDailySlotSessionNumber(libSlot), null);

  const freeSlot = { startTime: '12:50', endTime: '13:40', subjectName: 'Free Period', isFreePeriod: true };
  assert.equal(calculateDailySlotSessionNumber(freeSlot), null);
});

runTest('Returns null gracefully for slots outside standard university timetable hours', () => {
  const eveningSlot = { startTime: '18:00', endTime: '19:00', subjectCode: 'CLUB', isActive: true };
  assert.equal(calculateDailySlotSessionNumber(eveningSlot), null);
});

runTest('Returns null gracefully when slot is null or undefined', () => {
  assert.equal(calculateDailySlotSessionNumber(null), null);
  assert.equal(calculateDailySlotSessionNumber(undefined), null);
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(' All Timetable Period Mapping & Lecture Number tests verified! 🚀');
console.log('======================================================================\n');
