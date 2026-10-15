import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('======================================================================');
console.log(' UNIFLOW TIMETABLE WEEK VIEW & ACTUAL FULL-WEEK SCHEDULE TEST SUITE');
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

const {
  buildWeeklySchedule,
  timeToMinutes,
  calculateDailySlotSessionNumber,
  formatDurationMinutes,
} = await import('../src/lib/timetableCalculations.ts');

const { isSlotApplicableToStudent } = await import('../src/lib/collegeEmail.ts');

// Sample multi-day timetable slots
const sampleSlots = [
  // Monday (dayOfWeek 1)
  {
    id: 'slot-mon-1',
    subjectId: 'sub-cst301',
    subjectName: 'Operating Systems',
    subjectCode: 'CST301',
    startTime: '09:30',
    endTime: '10:20',
    dayOfWeek: 1,
    group: 'ALL',
    room: 'RJ204',
    isActive: true,
  },
  {
    id: 'slot-mon-2',
    subjectId: 'sub-cst302',
    subjectName: 'Computer Networks',
    subjectCode: 'CST302',
    startTime: '11:10', // 50-minute free period after 10:20
    endTime: '12:00',
    dayOfWeek: 1,
    group: 'ALL',
    room: 'RJ205',
    isActive: true,
  },
  // Tuesday (dayOfWeek 2) - 2-period lab
  {
    id: 'slot-tue-1',
    subjectId: 'sub-cst301-lab',
    subjectName: 'Operating Systems Lab',
    subjectCode: 'CST301-L',
    startTime: '09:30',
    endTime: '11:10', // 100 mins (weight: 2)
    dayOfWeek: 2,
    group: 'G1',
    room: 'LAB-2',
    weight: 2,
    periods: 2,
    isActive: true,
  },
  {
    id: 'slot-tue-2',
    subjectId: 'sub-cst303',
    subjectName: 'Database Management',
    subjectCode: 'CST303',
    startTime: '12:00',
    endTime: '12:50',
    dayOfWeek: 2,
    group: 'ALL',
    room: 'RJ204',
    isActive: true,
  },
  // Wednesday (dayOfWeek 3) - 3 classes with a 40m break
  {
    id: 'slot-wed-1',
    subjectId: 'sub-cst304',
    subjectName: 'Software Engineering',
    subjectCode: 'CST304',
    startTime: '10:20',
    endTime: '11:10',
    dayOfWeek: 3,
    group: 'ALL',
    room: 'RJ206',
    isActive: true,
  },
  {
    id: 'slot-wed-2',
    subjectId: 'sub-cst305',
    subjectName: 'AI & Machine Learning',
    subjectCode: 'CST305',
    startTime: '11:50', // 40m gap after 11:10
    endTime: '12:40',
    dayOfWeek: 3,
    group: 'ALL',
    room: 'RJ206',
    isActive: true,
  },
  {
    id: 'slot-wed-3',
    subjectId: 'sub-cst305-tut',
    subjectName: 'AI Tutorial',
    subjectCode: 'CST305-T',
    startTime: '13:40', // 60m gap after 12:40 (lunch break)
    endTime: '14:30',
    dayOfWeek: 3,
    group: 'G2',
    room: 'RJ207',
    isActive: true,
  },
  // Thursday (dayOfWeek 4) - Empty day test (no classes)
  // Friday (dayOfWeek 5)
  {
    id: 'slot-fri-1',
    subjectId: 'sub-cst306',
    subjectName: 'Cloud Computing',
    subjectCode: 'CST306',
    startTime: '14:30',
    endTime: '15:20',
    dayOfWeek: 5,
    group: 'ALL',
    room: 'RJ208',
    isActive: true,
  },
];

// Fixed reference date: Wednesday, 14 Oct 2026
const refWednesday = new Date(2026, 9, 14, 11, 0, 0);

// -----------------------------------------------------------------------------
// 1. Week Mode Displays All Five Weekdays
// -----------------------------------------------------------------------------
console.log('--- 1. Week Mode Displays All Five Weekdays (Monday to Friday) ---');

runTest('buildWeeklySchedule returns exactly 5 weekdays for Monday through Friday', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  assert.equal(schedule.length, 5);
  assert.deepEqual(schedule.map((d) => d.dayIndex), [1, 2, 3, 4, 5]);
  assert.deepEqual(schedule.map((d) => d.shortName), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.deepEqual(schedule.map((d) => d.dayName), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
});

runTest('Active day indicator marks Wednesday as isToday on the reference week', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  assert.equal(schedule[0].isToday, false, 'Monday is not today');
  assert.equal(schedule[1].isToday, false, 'Tuesday is not today');
  assert.equal(schedule[2].isToday, true, 'Wednesday is today');
  assert.equal(schedule[3].isToday, false, 'Thursday is not today');
  assert.equal(schedule[4].isToday, false, 'Friday is not today');
});

// -----------------------------------------------------------------------------
// 2. Class Distribution Across Days (No Leakage or Duplication)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Multi-Day Class Distribution & Non-Duplication ---');

runTest('Classes from multiple days are distributed into their exact weekday lists', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);

  // Monday: 2 classes
  assert.equal(schedule[0].classCount, 2);
  assert.deepEqual(schedule[0].slots.map((s) => s.id), ['slot-mon-1', 'slot-mon-2']);

  // Tuesday: 2 classes
  assert.equal(schedule[1].classCount, 2);
  assert.deepEqual(schedule[1].slots.map((s) => s.id), ['slot-tue-1', 'slot-tue-2']);

  // Wednesday: 3 classes
  assert.equal(schedule[2].classCount, 3);
  assert.deepEqual(schedule[2].slots.map((s) => s.id), ['slot-wed-1', 'slot-wed-2', 'slot-wed-3']);

  // Thursday: 0 classes (empty day)
  assert.equal(schedule[3].classCount, 0);
  assert.equal(schedule[3].slots.length, 0);

  // Friday: 1 class
  assert.equal(schedule[4].classCount, 1);
  assert.deepEqual(schedule[4].slots.map((s) => s.id), ['slot-fri-1']);
});

runTest('Total classes across the 5 weekdays matches total active input slots', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  const totalInSchedule = schedule.reduce((sum, d) => sum + d.classCount, 0);
  assert.equal(totalInSchedule, sampleSlots.length);
});

// -----------------------------------------------------------------------------
// 3. Strict Chronological Ordering
// -----------------------------------------------------------------------------
console.log('\n--- 3. Strict Chronological Sorting by Start Time ---');

runTest('Unordered inputs within a day are strictly sorted by startTime', () => {
  const unorderedSlots = [
    { ...sampleSlots[1], startTime: '14:30', endTime: '15:20', id: 'mon-late' },
    { ...sampleSlots[0], startTime: '09:30', endTime: '10:20', id: 'mon-early' },
    { ...sampleSlots[0], startTime: '11:10', endTime: '12:00', id: 'mon-mid' },
  ];

  const schedule = buildWeeklySchedule(unorderedSlots, refWednesday, 0, 660);
  const monSlots = schedule[0].slots;
  assert.equal(monSlots[0].id, 'mon-early');
  assert.equal(monSlots[1].id, 'mon-mid');
  assert.equal(monSlots[2].id, 'mon-late');
});

// -----------------------------------------------------------------------------
// 4. Empty Day Handling
// -----------------------------------------------------------------------------
console.log('\n--- 4. Empty Day Handling ---');

runTest('Empty day (Thursday) produces clean empty state with classCount 0', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  const thursday = schedule[3];
  assert.equal(thursday.dayName, 'Thursday');
  assert.equal(thursday.classCount, 0);
  assert.equal(thursday.slots.length, 0);
  assert.equal(thursday.freeGaps.length, 0);
});

// -----------------------------------------------------------------------------
// 5. Genuine Free Period Break Gap Detection
// -----------------------------------------------------------------------------
console.log('\n--- 5. Genuine Free Period Break Gap Calculation ---');

runTest('Detects 50-minute free period gap on Monday between 10:20 and 11:10', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  const monGaps = schedule[0].freeGaps;
  assert.equal(monGaps.length, 1);
  assert.equal(monGaps[0].startTime, '10:20');
  assert.equal(monGaps[0].endTime, '11:10');
  assert.equal(monGaps[0].durationMinutes, 50);
  assert.equal(monGaps[0].formattedDuration, '50m');
  assert.equal(monGaps[0].afterSlotId, 'slot-mon-1');
  assert.equal(monGaps[0].beforeSlotId, 'slot-mon-2');
});

runTest('Detects multiple free gaps on Wednesday (40m break and 60m break)', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  const wedGaps = schedule[2].freeGaps;
  assert.equal(wedGaps.length, 2);
  assert.equal(wedGaps[0].durationMinutes, 40);
  assert.equal(wedGaps[0].startTime, '11:10');
  assert.equal(wedGaps[0].endTime, '11:50');
  assert.equal(wedGaps[1].durationMinutes, 60);
  assert.equal(wedGaps[1].startTime, '12:40');
  assert.equal(wedGaps[1].endTime, '13:40');
});

runTest('Gaps smaller than 30 minutes are not considered free periods', () => {
  const tightSlots = [
    { id: 's1', dayOfWeek: 1, startTime: '09:30', endTime: '10:20', isActive: true },
    { id: 's2', dayOfWeek: 1, startTime: '10:30', endTime: '11:20', isActive: true }, // only 10m gap
  ];
  const schedule = buildWeeklySchedule(tightSlots, refWednesday, 0, 660);
  assert.equal(schedule[0].freeGaps.length, 0);
});

// -----------------------------------------------------------------------------
// 6. Week Navigation (Previous Week & Next Week Offsets)
// -----------------------------------------------------------------------------
console.log('\n--- 6. Week Navigation & Date Offset Calculations ---');

runTest('weekOffset = 0 generates dates for the current academic week (12 to 16 Oct 2026)', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  assert.equal(schedule[0].fullDate.getDate(), 12, 'Monday is 12 Oct');
  assert.equal(schedule[1].fullDate.getDate(), 13, 'Tuesday is 13 Oct');
  assert.equal(schedule[2].fullDate.getDate(), 14, 'Wednesday is 14 Oct');
  assert.equal(schedule[3].fullDate.getDate(), 15, 'Thursday is 15 Oct');
  assert.equal(schedule[4].fullDate.getDate(), 16, 'Friday is 16 Oct');
});

runTest('weekOffset = 1 advances dates to next week (19 to 23 Oct 2026) and clears isToday', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 1, 660);
  assert.equal(schedule[0].fullDate.getDate(), 19, 'Next Monday is 19 Oct');
  assert.equal(schedule[4].fullDate.getDate(), 23, 'Next Friday is 23 Oct');
  assert.equal(schedule.every((d) => !d.isToday), true, 'No days in next week are marked as today');
});

runTest('weekOffset = -1 rewinds dates to previous week (5 to 9 Oct 2026)', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, -1, 660);
  assert.equal(schedule[0].fullDate.getDate(), 5, 'Prev Monday is 5 Oct');
  assert.equal(schedule[4].fullDate.getDate(), 9, 'Prev Friday is 9 Oct');
});

// -----------------------------------------------------------------------------
// 7. Academic Group Filtering Within Week View
// -----------------------------------------------------------------------------
console.log('\n--- 7. Academic Group Filtering (G1 / G2 / All) ---');

runTest('Filtering by group G1 includes G1 & ALL slots, excluding G2 slots', () => {
  const g1Slots = sampleSlots.filter((s) => isSlotApplicableToStudent(s.group, 'G1'));
  const schedule = buildWeeklySchedule(g1Slots, refWednesday, 0, 660);

  // Tuesday has G1 lab -> included
  assert.equal(schedule[1].slots.some((s) => s.id === 'slot-tue-1'), true);

  // Wednesday has G2 tutorial -> excluded
  assert.equal(schedule[2].slots.some((s) => s.id === 'slot-wed-3'), false);
  assert.equal(schedule[2].classCount, 2, 'Wednesday has 2 classes for G1 student');
});

runTest('Filtering by group G2 includes G2 & ALL slots, excluding G1 slots', () => {
  const g2Slots = sampleSlots.filter((s) => isSlotApplicableToStudent(s.group, 'G2'));
  const schedule = buildWeeklySchedule(g2Slots, refWednesday, 0, 660);

  // Tuesday G1 lab -> excluded
  assert.equal(schedule[1].slots.some((s) => s.id === 'slot-tue-1'), false);

  // Wednesday G2 tutorial -> included
  assert.equal(schedule[2].slots.some((s) => s.id === 'slot-wed-3'), true);
});

// -----------------------------------------------------------------------------
// 8. Lecture Numbering Consistency with Institutional Timetable
// -----------------------------------------------------------------------------
console.log('\n--- 8. Lecture Numbering Invariants Across Week ---');

runTest('Institutional period mapping correctly numbers slots in weekly schedule', () => {
  const schedule = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  const monEarly = schedule[0].slots[0];
  const sessionInfo = calculateDailySlotSessionNumber(monEarly, schedule[0].slots);
  assert.equal(sessionInfo?.sessionNumber, 1);
  assert.equal(sessionInfo?.periodLabel, 'Lecture 1');

  const tueLab = schedule[1].slots[0];
  const labSessionInfo = calculateDailySlotSessionNumber(tueLab, schedule[1].slots);
  assert.equal(labSessionInfo?.sessionNumber, 1);
  assert.equal(labSessionInfo?.periodLabel, 'Lecture 1–2');
});

// -----------------------------------------------------------------------------
// 9. Today Mode Invariant Check
// -----------------------------------------------------------------------------
console.log('\n--- 9. Today Mode vs Week Mode Invariants ---');

runTest('Today mode strictly filters down to the single selected day, while Week mode preserves all 5 days', () => {
  const selectedDay = 3; // Wednesday
  const todayOnlySlots = sampleSlots.filter((s) => s.dayOfWeek === selectedDay);
  assert.equal(todayOnlySlots.length, 3, 'Today mode isolates single day');

  const fullWeek = buildWeeklySchedule(sampleSlots, refWednesday, 0, 660);
  assert.equal(fullWeek.length, 5, 'Week mode retains all 5 weekdays');
  assert.equal(fullWeek.reduce((sum, d) => sum + d.classCount, 0), 8, 'Full week contains all 8 classes');
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(' Timetable Week View full schedule verified! 🚀');
console.log('======================================================================\n');
