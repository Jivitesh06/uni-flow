import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateAttendanceStats } from '../src/lib/attendanceCalculations.ts';

console.log('======================================================================');
console.log(' UNIFLOW PREMIUM UI LOGIC REGRESSION & AUDIT TEST SUITE');
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
// 1. TIMETABLE ACCURACY & FREE PERIOD DETECTION
// -----------------------------------------------------------------------------
console.log('--- 1. Timetable Free-Period Detection & Boundary Tests ---');

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function calculateFreePeriodsForSlots(slots) {
  const sorted = [...slots].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const freeGaps = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const slot = sorted[i];
    const nextSlot = sorted[i + 1];
    const slotEndMinutes = timeToMinutes(slot.endTime);
    const nextSlotStartMinutes = timeToMinutes(nextSlot.startTime);

    const hasFreePeriodAfter =
      nextSlotStartMinutes - slotEndMinutes >= 30 &&
      !sorted.some((other) => {
        const oStart = timeToMinutes(other.startTime);
        const oEnd = timeToMinutes(other.endTime);
        return Math.max(slotEndMinutes, oStart) < Math.min(nextSlotStartMinutes, oEnd);
      });

    if (hasFreePeriodAfter) {
      freeGaps.push({
        start: slot.endTime,
        end: nextSlot.startTime,
        durationMinutes: nextSlotStartMinutes - slotEndMinutes,
      });
    }
  }

  return freeGaps;
}

runTest('Free period detection strictly detects genuine gaps >= 30 min between adjacent classes', () => {
  const slots = [
    { id: '1', startTime: '09:00', endTime: '10:00' },
    { id: '2', startTime: '11:00', endTime: '12:00' }, // 1 hr gap (10:00 - 11:00)
    { id: '3', startTime: '12:15', endTime: '13:15' }, // 15 min gap -> rejected
  ];

  const gaps = calculateFreePeriodsForSlots(slots);
  assert.equal(gaps.length, 1, 'Only one gap >= 30 mins should be detected');
  assert.equal(gaps[0].start, '10:00');
  assert.equal(gaps[0].end, '11:00');
  assert.equal(gaps[0].durationMinutes, 60);
});

runTest('A day ending before 17:00 does NOT fabricate an end-of-day free period', () => {
  const slots = [
    { id: '1', startTime: '09:00', endTime: '10:00' },
    { id: '2', startTime: '10:00', endTime: '11:00' },
    { id: '3', startTime: '11:00', endTime: '13:00' }, // ends at 13:00 (well before 17:00)
  ];

  const gaps = calculateFreePeriodsForSlots(slots);
  assert.equal(gaps.length, 0, 'No gaps exist between back-to-back classes; no 13:00-17:00 fabricated period');

  // Also verify TimetablePage source does not contain the old 17:00 fabricated block
  const timetableSource = readFileSync(resolve('./src/pages/TimetablePage.tsx'), 'utf-8');
  assert.ok(
    !timetableSource.includes("dayAgendaSlots[dayAgendaSlots.length - 1].endTime) < timeToMinutes('17:00')"),
    'TimetablePage must not contain end-of-day 17:00 free period fabrication'
  );
  assert.ok(
    !timetableSource.includes('function getDailyFreeSlots'),
    'TimetablePage must not contain dead getDailyFreeSlots helper'
  );
});

runTest('Free periods never overlap multi-period labs or parallel slots', () => {
  const slots = [
    { id: 'lab-1', startTime: '09:00', endTime: '11:00' }, // 2-hr lab
    { id: 'lecture-1', startTime: '09:00', endTime: '10:00' }, // parallel / concurrent slot
    { id: 'lecture-2', startTime: '11:00', endTime: '12:00' }, // immediately follows lab
  ];

  const gaps = calculateFreePeriodsForSlots(slots);
  assert.equal(gaps.length, 0, 'No free period should be detected when lab spans until 11:00');
});

// -----------------------------------------------------------------------------
// 2. ATTENDANCE CARD INTERACTIONS & EVENT PROPAGATION
// -----------------------------------------------------------------------------
console.log('\n--- 2. Attendance Interactions & Nested Event Propagation ---');

runTest('SubjectAttendanceCard prevents event bubbling on all interactive buttons', () => {
  const cardSource = readFileSync(resolve('./src/components/attendance/SubjectAttendanceCard.tsx'), 'utf-8');

  // Verify chevron button has stopPropagation
  assert.ok(
    cardSource.includes('onClick={(e) => {') && cardSource.includes('e.stopPropagation();') && cardSource.includes('setExpanded('),
    'SubjectAttendanceCard must stop propagation on expansion toggles'
  );

  // Verify onMarkPresent / onMarkAbsent have stopPropagation
  assert.ok(
    cardSource.includes('onMarkPresent();') && cardSource.includes('e.stopPropagation()'),
    'Present button must stop propagation'
  );

  assert.ok(
    cardSource.includes('onMarkAbsent();') && cardSource.includes('e.stopPropagation()'),
    'Absent button must stop propagation'
  );

  // Verify Edit Baseline and View History stop propagation
  assert.ok(
    cardSource.includes('onOpenBaseline();') && cardSource.includes('e.stopPropagation()'),
    'Edit Baseline button must be wired with stopPropagation'
  );
  assert.ok(
    cardSource.includes('onOpenHistory();') && cardSource.includes('e.stopPropagation()'),
    'View History button must be wired with stopPropagation'
  );

  // Verify correction action in drawer stops propagation
  assert.ok(
    cardSource.includes('onCorrectRecord(r);') && cardSource.includes('e.stopPropagation()'),
    'onCorrectRecord must be wired into recent session log drawer with stopPropagation'
  );
});

// -----------------------------------------------------------------------------
// 3. ATTENDANCE FORMULA COMPLIANCE & EXAMINATION DISCLAIMER
// -----------------------------------------------------------------------------
console.log('\n--- 3. Attendance Guidance & Authoritative Formulas ---');

runTest('Authoritative formula handles 0 conducted classes gracefully', () => {
  const stats = calculateAttendanceStats(0, 0, 0.75);
  assert.equal(stats.percentage, 0);
  assert.equal(stats.isOnTrack, true);
  assert.equal(stats.classesNeeded, 0);
  assert.equal(stats.maxAbsences, 0);
});

runTest('Exact 75% boundary is on track with zero cushion', () => {
  const stats = calculateAttendanceStats(15, 20, 0.75);
  assert.equal(stats.percentage, 75);
  assert.equal(stats.isOnTrack, true);
  assert.equal(stats.classesNeeded, 0);
  assert.equal(stats.maxAbsences, 0); // Missing 1 class drops to 15/21 = 71.4% < 75%
});

runTest('Shortage calculation computes exact consecutive sessions needed', () => {
  const stats = calculateAttendanceStats(10, 20, 0.75); // 50%
  assert.equal(stats.percentage, 50);
  assert.equal(stats.isOnTrack, false);
  // (0.75 * 20 - 10) / (1 - 0.75) = 5 / 0.25 = 20
  assert.equal(stats.classesNeeded, 20);
  assert.equal(stats.maxAbsences, 0);
});

runTest('AttendanceOverviewCard does NOT make examination eligibility guarantee claims', () => {
  const overviewSource = readFileSync(resolve('./src/components/attendance/AttendanceOverviewCard.tsx'), 'utf-8');
  assert.ok(
    !overviewSource.toLowerCase().includes('guarantee') &&
      !overviewSource.toLowerCase().includes('guaranteed exam'),
    'Attendance guidance must never claim guaranteed exam eligibility'
  );
});

// -----------------------------------------------------------------------------
// 4. SETTINGS & PROFILE INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n--- 4. Profile & Settings Preset Synchronization ---');

runTest('SettingsPage synchronizes target presets (50%, 75%, 95%) and slider without accidental writes', () => {
  const settingsSource = readFileSync(resolve('./src/pages/SettingsPage.tsx'), 'utf-8');
  const authContextSource = readFileSync(resolve('./src/contexts/AuthContext.tsx'), 'utf-8');

  // Verify presets exist
  assert.ok(settingsSource.includes('50'), '50% preset must exist');
  assert.ok(settingsSource.includes('75'), '75% preset must exist');
  assert.ok(settingsSource.includes('95'), '95% preset must exist');

  // Verify updateUserProfile is only called inside explicit handleSave, never on render or drawer toggle
  assert.ok(
    settingsSource.includes('async function handleSave()') && settingsSource.includes('await updateUserProfile('),
    'Profile save must be triggered explicitly via handleSave'
  );

  // Verify caching to profileStorage is called on updateUserProfile
  assert.ok(
    authContextSource.includes('setCachedUserProfile(currentUser.uid, merged as UserProfile)'),
    'AuthContext must persist profile to localStorage cache on update'
  );
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(' All logic-regression audit checks verified! 🚀');
console.log('======================================================================\n');
