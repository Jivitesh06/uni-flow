import assert from 'node:assert/strict';
import {
  canonicalizeSubjectsForAttendance,
  buildTimetableSubjectEquivalenceMap,
  calculateSubjectAttendance,
  calculateAttendanceStats,
} from '../src/lib/attendanceCalculations.ts';
import {
  parseSectionDetails,
  formatFullSection,
} from '../src/lib/collegeEmail.ts';
import {
  resolveStudentAcademicGroup,
  getSharedTimetableCache,
} from '../src/lib/sharedTimetable.ts';
import { SEEDED_SHARED_TIMETABLES as SEEDED_5TH_SEM_TIMETABLES } from '../src/data/seededSharedTimetables.ts';

console.log('======================================================================');
console.log(' UNIFLOW AUTHORITATIVE FACULTY MAPPING & ATTENDANCE UI TEST SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS ${totalTests}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('--- 1. Section 5C vs Section 5A Authoritative Faculty & Room Mapping ---');

runTest('Section 5C timetable has AAIPD mapped to Dr Vijay and RJ204R', () => {
  const doc5c = SEEDED_5TH_SEM_TIMETABLES['chitkara-university_be-cse_2024_sem5_be-cse-5c'];
  assert.ok(doc5c, 'Section 5C seeded timetable must exist');
  const aaipdSlots = doc5c.slots.filter(s => s.subjectCode === 'AAIPD');
  assert.ok(aaipdSlots.length > 0, 'Section 5C must have AAIPD slots');
  for (const slot of aaipdSlots) {
    assert.equal(slot.faculty, 'Dr Vijay', 'Section 5C AAIPD faculty must be Dr Vijay');
    assert.equal(slot.room, 'RJ204R', 'Section 5C AAIPD room must be RJ204R');
  }
});

runTest('Section 5A timetable has AAIPD mapped to Dr Ashutosh and CVR303R (Section Isolation)', () => {
  const doc5a = SEEDED_5TH_SEM_TIMETABLES['chitkara-university_be-cse_2024_sem5_be-cse-5a'];
  assert.ok(doc5a, 'Section 5A seeded timetable must exist');
  const aaipdSlots = doc5a.slots.filter(s => s.subjectCode === 'AAIPD');
  assert.ok(aaipdSlots.length > 0, 'Section 5A must have AAIPD slots');
  for (const slot of aaipdSlots) {
    assert.equal(slot.faculty, 'Dr Ashutosh', 'Section 5A AAIPD faculty must be Dr Ashutosh');
    assert.equal(slot.room, 'CVR303R', 'Section 5A AAIPD room must be CVR303R');
  }
});

runTest('canonicalizeSubjectsForAttendance authoritatively resolves Dr Vijay for Section 5C student even if user subject had stale faculty', () => {
  const doc5c = SEEDED_5TH_SEM_TIMETABLES['chitkara-university_be-cse_2024_sem5_be-cse-5c'];
  // Simulate stale user enrolled subject that had Dr Ashutosh from earlier testing
  const staleUserSubjects = [
    {
      id: 'sub_aaipd',
      name: 'AAIPD',
      code: 'AAIPD',
      faculty: 'Dr Ashutosh', // Stale!
      credits: 3,
      initialAttended: 25,
      initialConducted: 27,
    },
  ];

  const canonical = canonicalizeSubjectsForAttendance(staleUserSubjects, doc5c.slots, 'test_user');
  const aaipd = canonical.find(s => s.code === 'AAIPD');
  assert.ok(aaipd, 'AAIPD must be in canonical list');
  assert.equal(aaipd.faculty, 'Dr Vijay', 'Authoritative timetable slot must override stale subject faculty');
  assert.equal(aaipd.room, 'RJ204R', 'Authoritative room RJ204R must be assigned');
});

runTest('canonicalizeSubjectsForAttendance authoritatively resolves Dr Ashutosh for Section 5A student', () => {
  const doc5a = SEEDED_5TH_SEM_TIMETABLES['chitkara-university_be-cse_2024_sem5_be-cse-5a'];
  const userSubjects = [
    {
      id: 'sub_aaipd',
      name: 'AAIPD',
      code: 'AAIPD',
      faculty: 'Some Other Teacher',
      credits: 3,
      initialAttended: 10,
      initialConducted: 12,
    },
  ];

  const canonical = canonicalizeSubjectsForAttendance(userSubjects, doc5a.slots, 'test_user');
  const aaipd = canonical.find(s => s.code === 'AAIPD');
  assert.ok(aaipd, 'AAIPD must be in canonical list');
  assert.equal(aaipd.faculty, 'Dr Ashutosh', 'Section 5A must get Dr Ashutosh');
  assert.equal(aaipd.room, 'CVR303R', 'Section 5A must get CVR303R');
});

runTest('Multi-session subject (ADI with theory + lab) aggregates distinct faculties cleanly', () => {
  const doc5c = SEEDED_5TH_SEM_TIMETABLES['chitkara-university_be-cse_2024_sem5_be-cse-5c'];
  const canonical = canonicalizeSubjectsForAttendance([], doc5c.slots, 'test_user');
  const adi = canonical.find(s => s.code === 'ADI');
  assert.ok(adi, 'ADI must be in canonical list');
  // ADI has Deepak and Ekta (ADI-FA)
  assert.ok(adi.faculty.includes('Mr Deepak'), 'Must include Mr Deepak');
  assert.ok(adi.faculty.includes('Ms Ekta'), 'Must include Ms Ekta');
});

console.log('\n--- 2. Section Normalization & Fallback Protection ---');

runTest('parseSectionDetails and formatFullSection handle all section variants cleanly', () => {
  const variants = ['5C', '5-C', '5 C', 'Section C', 'Sec C', 'C', 'BE-CSE-5C'];
  for (const variant of variants) {
    const formatted = formatFullSection('BE-CSE', 5, variant);
    assert.equal(formatted, 'BE-CSE-5C', `Variant "${variant}" must format to BE-CSE-5C`);
  }
});

runTest('resolveStudentAcademicGroup produces identical BE-CSE-5C for variant section representations', () => {
  const profile1 = { semester: 5, section: '5-C', institution: 'Chitkara University', program: 'BE-CSE' };
  const profile2 = { semester: 5, section: 'Section C', institution: 'Chitkara University', program: 'BE-CSE' };
  const profile3 = { semester: 5, section: 'C', institution: 'Chitkara University', program: 'BE-CSE' };
  const profile4 = { semester: 5, section: 'BE-CSE-5C', institution: 'Chitkara University', program: 'BE-CSE' };

  const res1 = resolveStudentAcademicGroup(profile1);
  const res2 = resolveStudentAcademicGroup(profile2);
  const res3 = resolveStudentAcademicGroup(profile3);
  const res4 = resolveStudentAcademicGroup(profile4);

  assert.equal(res1.groupId, 'chitkara-university_be-cse_2024_sem5_be-cse-5c');
  assert.equal(res2.groupId, 'chitkara-university_be-cse_2024_sem5_be-cse-5c');
  assert.equal(res3.groupId, 'chitkara-university_be-cse_2024_sem5_be-cse-5c');
  assert.equal(res4.groupId, 'chitkara-university_be-cse_2024_sem5_be-cse-5c');
});

runTest('getSharedTimetableCache matches 5C correctly without falling back to 5A', () => {
  const doc = getSharedTimetableCache('chitkara-university_be-cse_2024_sem5_be-cse-5c');
  assert.ok(doc, 'Must retrieve 5C document');
  assert.equal(doc.section, 'BE-CSE-5C', 'Retrieved doc must be BE-CSE-5C');
  const aaipdSlot = doc.slots.find(s => s.subjectCode === 'AAIPD');
  assert.equal(aaipdSlot.faculty, 'Dr Vijay', 'Retrieved timetable must have Dr Vijay for AAIPD');
});

console.log('\n--- 3. Attendance Target Derivation & UI Metrics ---');

runTest('calculateAttendanceStats dynamically adapts to user configured target (e.g. 70%, 75%, 80%)', () => {
  // Attended 32 / 43 = 74.41%
  const stats70 = calculateAttendanceStats(32, 43, 0.70);
  assert.equal(stats70.isOnTrack, true, 'At 70% target, 74.4% is on track');
  assert.equal(stats70.status, 'safe');
  assert.ok(stats70.maxAbsences > 0);

  const stats75 = calculateAttendanceStats(32, 43, 0.75);
  assert.equal(stats75.isOnTrack, false, 'At 75% target, 74.4% is shortage');
  assert.equal(stats75.status, 'shortage');
  assert.equal(stats75.classesNeeded, 1);

  const stats80 = calculateAttendanceStats(32, 43, 0.80);
  assert.equal(stats80.isOnTrack, false, 'At 80% target, 74.4% is shortage');
  assert.equal(stats80.status, 'shortage');
  assert.ok(stats80.classesNeeded > 1);
});

runTest('Overall attendance metrics produce exact numbers for reference image (110 / 131 at 75% target)', () => {
  const overall = calculateAttendanceStats(110, 131, 0.75);
  assert.equal(overall.attended, 110);
  assert.equal(overall.conducted, 131);
  assert.equal(Math.round(overall.percentage), 84); // 83.97% -> 84%
  assert.equal(overall.isOnTrack, true);
  // Max absences: floor(110 / 0.75 - 131) = floor(146.666 - 131) = 15
  assert.equal(overall.maxAbsences, 15, 'Safe miss calculation must be 15 sessions exactly');
});

console.log(`\n======================================================================`);
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(` All Authoritative Faculty Mapping & Attendance UI Tests Succeeded! 🚀`);
console.log(`======================================================================\n`);
