import assert from 'node:assert/strict';
import {
  evaluateSubjectAttendanceEligibility,
  validateAttendanceTotals,
  calculateSubjectAttendance,
  calculateLectureWeight,
} from '../src/lib/attendanceCalculations.ts';
import { isSlotApplicableToStudent } from '../src/lib/collegeEmail.ts';

console.log('======================================================================');
console.log(' UNIFLOW ATTENDANCE ELIGIBILITY & TOTALS EDITOR TEST SUITE');
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

// Helpers for test dates
const today = new Date(2026, 9, 14, 11, 0, 0); // 11:00 AM, Wed Oct 14 2026
const tomorrow = new Date(2026, 9, 15, 11, 0, 0); // Thu Oct 15 2026
const yesterday = new Date(2026, 9, 13, 11, 0, 0); // Tue Oct 13 2026

const makeDateObj = (date) => ({ toDate: () => date });

// =============================================================================
// PART 1: ATTENDANCE ELIGIBILITY EVALUATION
// =============================================================================
console.log('--- 1. Attendance Eligibility Evaluation & Session Filtering ---');

// Test 1: Subject with scheduled class today at current time -> ELIGIBLE, correct slot and weight
runTest('1. Scheduled class today at current time is ELIGIBLE with correct slot and weight', () => {
  const slot = {
    id: 'slot-ai-1',
    subjectId: 'sub-ai',
    startTime: '10:20',
    endTime: '11:10',
    periods: 1,
  };
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-ai', name: 'AI', code: 'CS501' },
    [slot],
    [],
    today,
    today
  );
  assert.equal(res.status, 'ELIGIBLE');
  assert.equal(res.isEligible, true);
  assert.equal(res.slot?.id, 'slot-ai-1');
  assert.equal(res.weight, 1);
});

// Test 2: Subject with NO class on selected date -> NOT ELIGIBLE, status NO_SCHEDULED_CLASS
runTest('2. Subject with NO scheduled class on date -> NO_SCHEDULED_CLASS, not eligible', () => {
  const slotOther = {
    id: 'slot-dbms-1',
    subjectId: 'sub-dbms',
    startTime: '10:20',
    endTime: '11:10',
  };
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-sd', name: 'Software Delivery', code: 'SD' },
    [slotOther],
    [],
    today,
    today
  );
  assert.equal(res.status, 'NO_SCHEDULED_CLASS');
  assert.equal(res.isEligible, false);
  assert.match(res.message || '', /No scheduled class for this subject today/i);
});

// Test 3: Future session locking: subject with class at 14:00 evaluated at 10:00 -> FUTURE_SESSION
runTest('3. Subject with class at 14:00 evaluated at 10:00 -> FUTURE_SESSION, locked', () => {
  const slot = {
    id: 'slot-ai-afternoon',
    subjectId: 'sub-ai',
    startTime: '14:30',
    endTime: '15:20',
  };
  const evalTime = new Date(2026, 9, 14, 10, 0, 0); // 10:00 AM
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-ai', name: 'AI' },
    [slot],
    [],
    today,
    evalTime
  );
  assert.equal(res.status, 'FUTURE_SESSION');
  assert.equal(res.isEligible, false);
  assert.equal(res.upcomingTime, '14:30');
});

// Test 4: Future date locking: subject on tomorrow's date -> FUTURE_SESSION
runTest('4. Subject evaluated on tomorrow date -> FUTURE_SESSION, locked', () => {
  const slot = {
    id: 'slot-ai-tomorrow',
    subjectId: 'sub-ai',
    startTime: '09:30',
    endTime: '10:20',
  };
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-ai', name: 'AI' },
    [slot],
    [],
    tomorrow,
    today
  );
  assert.equal(res.status, 'FUTURE_SESSION');
  assert.equal(res.isEligible, false);
});

// Test 5: Multi-session day first session: 2 classes scheduled (09:30, 13:40); neither marked -> first session eligible
runTest('5. Multi-session day: neither marked -> earliest session (09:30) is eligible', () => {
  const slots = [
    { id: 'slot-nalr-1', subjectId: 'sub-nalr', startTime: '09:30', endTime: '10:20' },
    { id: 'slot-nalr-2', subjectId: 'sub-nalr', startTime: '13:40', endTime: '14:30' },
  ];
  const evalTime = new Date(2026, 9, 14, 10, 0, 0);
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-nalr', name: 'NALR' },
    slots,
    [],
    today,
    evalTime
  );
  assert.equal(res.status, 'ELIGIBLE');
  assert.equal(res.isEligible, true);
  assert.equal(res.slot?.id, 'slot-nalr-1');
});

// Test 6: Multi-session day second session: 09:30 marked -> 13:40 session eligible
runTest('6. Multi-session day: 09:30 marked -> 13:40 session is eligible at 14:00', () => {
  const slots = [
    { id: 'slot-nalr-1', subjectId: 'sub-nalr', startTime: '09:30', endTime: '10:20' },
    { id: 'slot-nalr-2', subjectId: 'sub-nalr', startTime: '13:40', endTime: '14:30' },
  ];
  const attendance = [
    { lectureSlotId: 'slot-nalr-1', subjectId: 'sub-nalr', date: makeDateObj(today), status: 'present' },
  ];
  const evalTime = new Date(2026, 9, 14, 14, 0, 0); // 14:00
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-nalr', name: 'NALR' },
    slots,
    attendance,
    today,
    evalTime
  );
  assert.equal(res.status, 'ELIGIBLE');
  assert.equal(res.isEligible, true);
  assert.equal(res.slot?.id, 'slot-nalr-2');
});

// Test 7: Multi-session day all marked: both marked -> ALL_MARKED
runTest('7. Multi-session day: all sessions marked -> ALL_MARKED, buttons hidden', () => {
  const slots = [
    { id: 'slot-nalr-1', subjectId: 'sub-nalr', startTime: '09:30', endTime: '10:20' },
    { id: 'slot-nalr-2', subjectId: 'sub-nalr', startTime: '13:40', endTime: '14:30' },
  ];
  const attendance = [
    { lectureSlotId: 'slot-nalr-1', subjectId: 'sub-nalr', date: makeDateObj(today), status: 'present' },
    { lectureSlotId: 'slot-nalr-2', subjectId: 'sub-nalr', date: makeDateObj(today), status: 'absent' },
  ];
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-nalr', name: 'NALR' },
    slots,
    attendance,
    today,
    today
  );
  assert.equal(res.status, 'ALL_MARKED');
  assert.equal(res.isEligible, false);
});

// Test 8: Lab weight: 2-period lab -> weight 2 in eligibility result
runTest('8. 2-period lab (100 min) -> weight 2 preserved in eligibility', () => {
  const labSlot = {
    id: 'slot-adi-lab',
    subjectId: 'sub-adi',
    startTime: '09:30',
    endTime: '11:10', // 100 min = 2 periods
    subjectName: 'ADI Lab',
  };
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-adi', name: 'ADI Lab' },
    [labSlot],
    [],
    today,
    today
  );
  assert.equal(res.status, 'ELIGIBLE');
  assert.equal(res.weight, 2);
});

// Test 9: Single lecture weight: 1-period class -> weight 1 in eligibility result
runTest('9. 1-period class (50 min) -> weight 1 in eligibility', () => {
  const lectureSlot = {
    id: 'slot-aaipd-1',
    subjectId: 'sub-aaipd',
    startTime: '11:10',
    endTime: '12:00', // 50 min = 1 period
    subjectName: 'AAIPD',
  };
  const liveTime = new Date(2026, 9, 14, 11, 30, 0); // 11:30 AM (during class)
  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-aaipd', name: 'AAIPD' },
    [lectureSlot],
    [],
    today,
    liveTime
  );
  assert.equal(res.status, 'ELIGIBLE');
  assert.equal(res.weight, 1);
});

// Test 10: Academic group filtering: G1 student -> G2-only classes not eligible
runTest('10. Academic group filtering: G1 student filters out G2-only classes', () => {
  const slots = [
    { id: 'slot-g2-only', subjectId: 'sub-lab', group: 'G2', startTime: '09:30', endTime: '11:10' },
  ];
  const studentGroup = 'G1';
  const applicableSlots = slots.filter((s) => isSlotApplicableToStudent(s.group, studentGroup));
  assert.equal(applicableSlots.length, 0);

  const res = evaluateSubjectAttendanceEligibility(
    { id: 'sub-lab', name: 'Lab' },
    applicableSlots,
    [],
    today,
    today
  );
  assert.equal(res.status, 'NO_SCHEDULED_CLASS');
  assert.equal(res.isEligible, false);
});

// Test 11: Mark handler rejection simulation on unscheduled subject
runTest('11. Mark handler strictly blocks marking when subject has no scheduled class', () => {
  const simulatedScheduledSlots = []; // None scheduled today
  const subject = { id: 'sub-sd', name: 'SD' };
  const eligibility = evaluateSubjectAttendanceEligibility(
    subject,
    simulatedScheduledSlots,
    [],
    today,
    today
  );

  let recordCreated = false;
  let rejectedError = '';

  // Handler logic from AttendancePage:
  if (!eligibility.isEligible) {
    if (eligibility.status === 'NO_SCHEDULED_CLASS') {
      rejectedError = `Cannot mark attendance: no class scheduled for ${subject.name} on this date`;
    }
  } else {
    recordCreated = true;
  }

  assert.equal(recordCreated, false);
  assert.equal(rejectedError, 'Cannot mark attendance: no class scheduled for SD on this date');
});

// Test 12: Mark handler rejection on future session
runTest('12. Mark handler strictly blocks marking when session is upcoming / future', () => {
  const slots = [
    { id: 'slot-future', subjectId: 'sub-ai', startTime: '15:20', endTime: '16:10' },
  ];
  const evalTime = new Date(2026, 9, 14, 10, 0, 0);
  const eligibility = evaluateSubjectAttendanceEligibility(
    { id: 'sub-ai', name: 'AI' },
    slots,
    [],
    today,
    evalTime
  );

  let recordCreated = false;
  let rejectedError = '';

  if (!eligibility.isEligible) {
    if (eligibility.status === 'FUTURE_SESSION') {
      rejectedError = 'Cannot mark attendance for upcoming classes';
    }
  } else {
    recordCreated = true;
  }

  assert.equal(recordCreated, false);
  assert.equal(rejectedError, 'Cannot mark attendance for upcoming classes');
});

// =============================================================================
// PART 2: ACTUAL ATTENDANCE TOTALS VALIDATION & DERIVATION
// =============================================================================
console.log('\n--- 2. Actual Attendance Totals Validation & Persistence Derivation ---');

// Test 13: Totals validation valid: 35 attended, 40 delivered, 5 logged -> valid
runTest('13. Valid totals: 35 attended, 40 delivered with 5 logged (5/5) -> derived baseline (30/35)', () => {
  const res = validateAttendanceTotals(35, 40, 5, 5);
  assert.equal(res.isValid, true);
  assert.equal(res.totalAttended, 35);
  assert.equal(res.totalDelivered, 40);
  assert.equal(res.derivedBaselineAttended, 30);
  assert.equal(res.derivedBaselineConducted, 35);
  assert.equal(res.percentage, 87.5);
});

// Test 14: Totals validation attended > delivered: 45 attended, 40 delivered -> invalid
runTest('14. Invalid totals: attended (45) > delivered (40) is rejected', () => {
  const res = validateAttendanceTotals(45, 40, 0, 0);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /cannot exceed/i);
});

// Test 15: Totals validation delivered < logged: 4 delivered, 5 logged -> invalid
runTest('15. Invalid totals: delivered (4) < logged conducted (5) is rejected', () => {
  const res = validateAttendanceTotals(4, 4, 3, 5);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /cannot be less than/i);
});

// Test 16: Totals validation attended < logged attended: 2 attended, 3 logged attended -> invalid
runTest('16. Invalid totals: attended (2) < logged attended (3) is rejected', () => {
  const res = validateAttendanceTotals(2, 10, 3, 5);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /cannot be less than.*logs/i);
});

// Test 17: Totals validation negative: -1 -> invalid
runTest('17. Invalid totals: negative numbers (-1) rejected', () => {
  const res = validateAttendanceTotals(-1, 10, 0, 0);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /negative/i);
});

// Test 18: Totals validation decimal: 35.5 -> invalid
runTest('18. Invalid totals: decimal numbers (35.5) rejected', () => {
  const res = validateAttendanceTotals('35.5', '40', 0, 0);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /whole integer/i);
});

// Test 19: Totals validation empty: '' -> invalid
runTest('19. Invalid totals: empty string rejected', () => {
  const res = validateAttendanceTotals('', '', 0, 0);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /enter both/i);
});

// Test 20: Totals validation zero delivered: 0 delivered, 0 attended, 0 logged -> valid, percentage 0%
runTest('20. Valid zero totals: 0 delivered, 0 attended -> valid, 0% percentage', () => {
  const res = validateAttendanceTotals(0, 0, 0, 0);
  assert.equal(res.isValid, true);
  assert.equal(res.totalAttended, 0);
  assert.equal(res.totalDelivered, 0);
  assert.equal(res.percentage, 0);
});

// Test 21: Totals persistence formula: totalAttended = derivedBaselineAttended + loggedAttended = inputAttended
runTest('21. Formula exactness: derivedBaselineAttended + loggedAttended === inputAttended', () => {
  const inputAttended = 28;
  const inputDelivered = 32;
  const loggedAttended = 7;
  const loggedConducted = 9;

  const res = validateAttendanceTotals(inputAttended, inputDelivered, loggedAttended, loggedConducted);
  assert.equal(res.isValid, true);
  const recomputedAttended = res.derivedBaselineAttended + loggedAttended;
  assert.equal(recomputedAttended, inputAttended);
});

// Test 22: Totals persistence formula: totalConducted = derivedBaselineConducted + loggedConducted = inputDelivered
runTest('22. Formula exactness: derivedBaselineConducted + loggedConducted === inputDelivered', () => {
  const inputAttended = 28;
  const inputDelivered = 32;
  const loggedAttended = 7;
  const loggedConducted = 9;

  const res = validateAttendanceTotals(inputAttended, inputDelivered, loggedAttended, loggedConducted);
  assert.equal(res.isValid, true);
  const recomputedConducted = res.derivedBaselineConducted + loggedConducted;
  assert.equal(recomputedConducted, inputDelivered);
});

// Test 23: Subsequent mark increments: after saving totals (30/35 baseline, 5/5 logged -> 35/40 total), user marks present (+1) -> new total is 36/41
runTest('23. Subsequent class marking: marking present increments logged by +1, total reflects 36/41', () => {
  const subject = {
    id: 'sub-test',
    name: 'Test Subject',
    baselineAttended: 30,
    baselineConducted: 35,
  };
  // Initially 5 logged present
  const initialRecords = Array.from({ length: 5 }, (_, i) => ({
    id: `rec-${i}`,
    subjectId: 'sub-test',
    status: 'present',
    date: makeDateObj(today),
    weight: 1,
  }));
  const beforeAgg = calculateSubjectAttendance(subject, initialRecords);
  assert.equal(beforeAgg.totalAttended, 35);
  assert.equal(beforeAgg.totalConducted, 40);

  // Student marks a new class as present (+1)
  const afterRecords = [
    ...initialRecords,
    { id: 'rec-new', subjectId: 'sub-test', status: 'present', date: makeDateObj(today), weight: 1 },
  ];
  const afterAgg = calculateSubjectAttendance(subject, afterRecords);
  assert.equal(afterAgg.totalAttended, 36);
  assert.equal(afterAgg.totalConducted, 41);
});

// Test 24: Subsequent correction: correcting a logged present to absent -> new total is 34/40
runTest('24. Subsequent correction: correcting a logged present to absent reduces total attended to 34/40', () => {
  const subject = {
    id: 'sub-test',
    name: 'Test Subject',
    baselineAttended: 30,
    baselineConducted: 35,
  };
  // 5 records initially (all present)
  const records = Array.from({ length: 5 }, (_, i) => ({
    id: `rec-${i}`,
    subjectId: 'sub-test',
    status: 'present',
    date: makeDateObj(today),
    weight: 1,
  }));
  const beforeAgg = calculateSubjectAttendance(subject, records);
  assert.equal(beforeAgg.totalAttended, 35);
  assert.equal(beforeAgg.totalConducted, 40);

  // User corrects one record from present to absent
  const correctedRecords = records.map((r, i) => (i === 0 ? { ...r, status: 'absent' } : r));
  const afterAgg = calculateSubjectAttendance(subject, correctedRecords);
  assert.equal(afterAgg.totalAttended, 34);
  assert.equal(afterAgg.totalConducted, 40);
});

console.log('\n======================================================================');
console.log(` RESULTS: ${passedTests}/${totalTests} tests passed`);
console.log('======================================================================\n');
if (passedTests !== totalTests) {
  process.exit(1);
}
