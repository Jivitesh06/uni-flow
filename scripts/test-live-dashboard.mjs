import assert from 'node:assert/strict';

// Pure logic imported or mirrored for automated validation
import {
  calculateLiveClassState,
  timeToMinutes,
  formatDurationMinutes,
  DAYS_OF_WEEK,
} from '../src/lib/timetableCalculations.ts';

console.log('🧪 Starting UniFlow Live Class Dashboard test suite...\n');

// Mock sample timetable slots (Real schema structure, Monday=1, Tuesday=2, Wednesday=3)
const sampleSlots = [
  {
    id: 'slot-mon-1',
    uid: 'test-user-123',
    subjectId: 'sub-cs101',
    subjectName: 'Data Structures & Algorithms',
    subjectCode: 'CS201',
    faculty: 'Prof. Alan Turing',
    room: 'LH-301',
    dayOfWeek: 1, // Monday
    startTime: '09:00',
    endTime: '10:00',
    color: '#3b82f6',
    isActive: true,
  },
  {
    id: 'slot-mon-2',
    uid: 'test-user-123',
    subjectId: 'sub-cs102',
    subjectName: 'Computer Networks',
    subjectCode: 'CS202',
    faculty: 'Dr. Vint Cerf',
    room: 'Lab-2',
    dayOfWeek: 1, // Monday
    startTime: '10:15',
    endTime: '11:45',
    color: '#10b981',
    isActive: true,
  },
  {
    id: 'slot-mon-3',
    uid: 'test-user-123',
    subjectId: 'sub-cs103',
    subjectName: 'Operating Systems',
    subjectCode: 'CS203',
    faculty: 'Dr. Linus Torvalds',
    room: 'LH-102',
    dayOfWeek: 1, // Monday
    startTime: '13:00',
    endTime: '14:30',
    color: '#8b5cf6',
    isActive: true,
  },
  {
    id: 'slot-mon-inactive',
    uid: 'test-user-123',
    subjectId: 'sub-cancelled',
    subjectName: 'Old Cancelled Elective',
    subjectCode: 'CS999',
    dayOfWeek: 1,
    startTime: '15:00',
    endTime: '16:00',
    color: '#6b7280',
    isActive: false, // inactive slot must be ignored
  },
  {
    id: 'slot-tue-1',
    uid: 'test-user-123',
    subjectId: 'sub-cs104',
    subjectName: 'Database Management Systems',
    subjectCode: 'CS204',
    faculty: 'Prof. Edgar Codd',
    room: 'LH-204',
    dayOfWeek: 2, // Tuesday
    startTime: '09:30',
    endTime: '11:00',
    color: '#f59e0b',
    isActive: true,
  },
  {
    id: 'slot-fri-1',
    uid: 'test-user-123',
    subjectId: 'sub-cs105',
    subjectName: 'Software Engineering',
    subjectCode: 'CS205',
    faculty: 'Dr. Margaret Hamilton',
    room: 'Auditorium-1',
    dayOfWeek: 5, // Friday
    startTime: '10:00',
    endTime: '12:00',
    color: '#ec4899',
    isActive: true,
  },
];

// Helper to create a fixed date on Monday (e.g. 2026-10-12 was Monday)
function createTestDate(dayOfWeek, hours, minutes, seconds = 0) {
  // 2026-10-11 is Sunday (0), 2026-10-12 is Monday (1), 2026-10-13 is Tuesday (2), etc.
  const baseDate = new Date(2026, 9, 11 + dayOfWeek, hours, minutes, seconds, 0);
  assert.equal(baseDate.getDay(), dayOfWeek, `Sanity check: expected day ${dayOfWeek}, got ${baseDate.getDay()}`);
  return baseDate;
}

// -------------------------------------------------------------
// Test 1: Utility functions timeToMinutes & formatDurationMinutes
// -------------------------------------------------------------
console.log('Case 1: Validating time calculation utilities...');
assert.equal(timeToMinutes('09:00'), 540);
assert.equal(timeToMinutes('10:15'), 615);
assert.equal(timeToMinutes('00:00'), 0);
assert.equal(timeToMinutes('23:59'), 1439);
assert.equal(formatDurationMinutes(45), '45m');
assert.equal(formatDurationMinutes(75), '1h 15m');
assert.equal(formatDurationMinutes(120), '2h');
assert.equal(formatDurationMinutes(0), '0m');
console.log('  ✅ timeToMinutes and formatDurationMinutes pass all assertions.');

// -------------------------------------------------------------
// Test 2: LIVE_NOW - Lecture currently in progress
// -------------------------------------------------------------
console.log('\nCase 2: Validating LIVE_NOW state during lecture...');
{
  // Monday at 09:25 AM (Class is 09:00 - 10:00)
  const time = createTestDate(1, 9, 25);
  const state = calculateLiveClassState(sampleSlots, time);

  assert.equal(state.status, 'LIVE_NOW');
  assert.ok(state.currentSlot);
  assert.equal(state.currentSlot.subjectCode, 'CS201');
  assert.equal(state.currentSlot.room, 'LH-301');
  assert.equal(state.currentSlot.faculty, 'Prof. Alan Turing');
  assert.equal(state.minutesRemainingInCurrent, 35); // 10:00 - 09:25 = 35 mins
  assert.equal(state.timeRemainingFormatted, '35m');
  assert.ok(state.nextSlot);
  assert.equal(state.nextSlot.subjectCode, 'CS202'); // Next is 10:15
  assert.equal(state.minutesUntilNext, 50); // 10:15 - 09:25 = 50 mins
  console.log('  ✅ LIVE_NOW detects in-progress class, room, faculty, and remaining minutes.');
}

// -------------------------------------------------------------
// Test 3: STARTING_SOON - Class starts within 15 minutes
// -------------------------------------------------------------
console.log('\nCase 3: Validating STARTING_SOON threshold (<= 15m)...');
{
  // Monday at 10:05 AM (Next class CS202 starts at 10:15 AM -> 10m away)
  const time = createTestDate(1, 10, 5);
  const state = calculateLiveClassState(sampleSlots, time, 15);

  assert.equal(state.status, 'STARTING_SOON');
  assert.equal(state.currentSlot, null);
  assert.ok(state.startingSoonSlot);
  assert.equal(state.startingSoonSlot.subjectCode, 'CS202');
  assert.equal(state.startingSoonSlot.room, 'Lab-2');
  assert.equal(state.minutesUntilNext, 10);
  assert.equal(state.timeRemainingFormatted, '10m');
  console.log('  ✅ STARTING_SOON activates accurately 10 mins before lecture with room guidance.');
}

// -------------------------------------------------------------
// Test 4: FREE_NOW - Break period between lectures (> 15m)
// -------------------------------------------------------------
console.log('\nCase 4: Validating FREE_NOW during mid-day break...');
{
  // Monday at 12:00 PM (Class CS202 ended at 11:45, next class CS203 starts at 13:00)
  // Free time from 11:45 to 13:00. At 12:00, 60 minutes remain until 13:00.
  const time = createTestDate(1, 12, 0);
  const state = calculateLiveClassState(sampleSlots, time, 15);

  assert.equal(state.status, 'FREE_NOW');
  assert.equal(state.currentSlot, null);
  assert.equal(state.startingSoonSlot, null);
  assert.ok(state.nextSlot);
  assert.equal(state.nextSlot.subjectCode, 'CS203');
  assert.equal(state.minutesUntilNext, 60);
  assert.equal(state.timeRemainingFormatted, '1h');
  assert.ok(state.currentFreePeriod);
  assert.equal(state.currentFreePeriod.start, '11:45');
  assert.equal(state.currentFreePeriod.end, '13:00');
  console.log('  ✅ FREE_NOW computes break start, end, and duration before next lecture.');
}

// -------------------------------------------------------------
// Test 5: NO_MORE_CLASSES_TODAY - All sessions done for the day
// -------------------------------------------------------------
console.log('\nCase 5: Validating NO_MORE_CLASSES_TODAY with next scheduled day lookahead...');
{
  // Monday at 15:00 (Last class CS203 ended at 14:30. Inactive slot at 15:00 is ignored)
  const time = createTestDate(1, 15, 0);
  const state = calculateLiveClassState(sampleSlots, time);

  assert.equal(state.status, 'NO_MORE_CLASSES_TODAY');
  assert.equal(state.currentSlot, null);
  assert.equal(state.nextSlot, null);
  assert.ok(state.nextScheduledDay);
  assert.equal(state.nextScheduledDay.dayOfWeek, 2); // Tuesday
  assert.equal(state.nextScheduledDay.dayName, 'Tuesday');
  assert.equal(state.nextScheduledDay.firstSlot.subjectCode, 'CS204');
  assert.equal(state.nextScheduledDay.daysAway, 1);
  console.log('  ✅ NO_MORE_CLASSES_TODAY identifies completion and points to Tuesday classes.');
}

// -------------------------------------------------------------
// Test 6: NO_CLASSES_TODAY - Weekend / free day lookahead across days
// -------------------------------------------------------------
console.log('\nCase 6: Validating NO_CLASSES_TODAY on Sunday with lookahead to Monday...');
{
  // Sunday (0) has no slots scheduled. Lookahead should find Monday (1).
  const time = createTestDate(0, 11, 0);
  const state = calculateLiveClassState(sampleSlots, time);

  assert.equal(state.status, 'NO_CLASSES_TODAY');
  assert.equal(state.currentSlot, null);
  assert.ok(state.nextScheduledDay);
  assert.equal(state.nextScheduledDay.dayOfWeek, 1); // Monday
  assert.equal(state.nextScheduledDay.dayName, 'Monday');
  assert.equal(state.nextScheduledDay.firstSlot.subjectCode, 'CS201');
  assert.equal(state.nextScheduledDay.daysAway, 1);
  console.log('  ✅ NO_CLASSES_TODAY correctly shows day off and next class on Monday.');
}

// -------------------------------------------------------------
// Test 7: Multi-day wrap around (Friday after class wraps to Monday)
// -------------------------------------------------------------
console.log('\nCase 7: Validating Friday lookahead wrapping around weekend to Monday...');
{
  // Friday (5) at 14:00 (Friday class ended at 12:00). Next class is Monday (1).
  const time = createTestDate(5, 14, 0);
  const state = calculateLiveClassState(sampleSlots, time);

  assert.equal(state.status, 'NO_MORE_CLASSES_TODAY');
  assert.ok(state.nextScheduledDay);
  assert.equal(state.nextScheduledDay.dayOfWeek, 1); // Monday
  assert.equal(state.nextScheduledDay.dayName, 'Monday');
  assert.equal(state.nextScheduledDay.daysAway, 3); // 3 days away (Sat, Sun, Mon)
  assert.equal(state.nextScheduledDay.firstSlot.subjectCode, 'CS201');
  console.log('  ✅ Friday wrap-around correctly predicts Monday 3 days away.');
}

// -------------------------------------------------------------
// Test 8: EMPTY_TIMETABLE - New user with zero slots
// -------------------------------------------------------------
console.log('\nCase 8: Validating EMPTY_TIMETABLE when student has no slots configured...');
{
  const time = createTestDate(1, 10, 0);
  const state = calculateLiveClassState([], time);

  assert.equal(state.status, 'EMPTY_TIMETABLE');
  assert.equal(state.currentSlot, null);
  assert.equal(state.startingSoonSlot, null);
  assert.equal(state.nextSlot, null);
  assert.equal(state.nextScheduledDay, null);
  console.log('  ✅ EMPTY_TIMETABLE renders cleanly without errors when slots array is empty.');
}

// -------------------------------------------------------------
// Test 9: Exact boundary conditions (exact start minute and end minute)
// -------------------------------------------------------------
console.log('\nCase 9: Validating exact minute boundary conditions...');
{
  // Exactly 09:00:00 (start of Monday slot 1)
  const timeAtStart = createTestDate(1, 9, 0);
  const stateAtStart = calculateLiveClassState(sampleSlots, timeAtStart);
  assert.equal(stateAtStart.status, 'LIVE_NOW');
  assert.equal(stateAtStart.minutesRemainingInCurrent, 60);

  // Exactly 10:00:00 (end of Monday slot 1, next is 10:15 -> exactly 15m away!)
  const timeAtEnd = createTestDate(1, 10, 0);
  const stateAtEnd = calculateLiveClassState(sampleSlots, timeAtEnd, 15);
  assert.equal(stateAtEnd.status, 'STARTING_SOON');
  assert.equal(stateAtEnd.minutesUntilNext, 15);
  console.log('  ✅ Exact minute boundaries transition seamlessly without gaps or off-by-one errors.');
}

// -------------------------------------------------------------
// Test 10: Instant Offline Cache Serialization & Integrity
// -------------------------------------------------------------
console.log('\nCase 10: Validating LocalStorage offline cache serialization round-trip...');
{
  const serialized = JSON.stringify(sampleSlots);
  const deserialized = JSON.parse(serialized);
  assert.equal(deserialized.length, sampleSlots.length);

  // Compute live state from deserialized offline cache
  const time = createTestDate(1, 9, 30);
  const stateFromCache = calculateLiveClassState(deserialized, time);
  assert.equal(stateFromCache.status, 'LIVE_NOW');
  assert.equal(stateFromCache.currentSlot.subjectCode, 'CS201');
  console.log('  ✅ LocalStorage serialization maintains total data fidelity for instant offline startup.');
}

console.log('\n🎉 ALL 10 LIVE CLASS DASHBOARD UNIT TESTS PASSED SUCCESSFULLY!\n');
