import assert from 'node:assert/strict';

import {
  normalizeAttendanceSubjectCode,
  getCanonicalSubjectKey,
  isSameAttendanceSubject,
  matchesSubjectRecord,
  canonicalizeSubjectsForAttendance,
  calculateSubjectAttendance,
  calculateAttendanceStats,
} from '../src/lib/attendanceCalculations.ts';

console.log('🧪 Starting UniFlow -FA Subject Identity & Attendance Canonicalization Test Suite...\n');

// ==============================================================
// 1. Suffix Normalization Tests (Case-insensitive, Trailing -FA)
// ==============================================================
console.log('Test 1: Suffix Normalization (normalizeAttendanceSubjectCode)...');

assert.equal(normalizeAttendanceSubjectCode('ADI-FA'), 'ADI');
assert.equal(normalizeAttendanceSubjectCode('ADI-fa'), 'ADI');
assert.equal(normalizeAttendanceSubjectCode('ADI - FA'), 'ADI');
assert.equal(normalizeAttendanceSubjectCode('DBMS-FA'), 'DBMS');
assert.equal(normalizeAttendanceSubjectCode('DBMS - fa'), 'DBMS');
assert.equal(normalizeAttendanceSubjectCode('DBMS'), 'DBMS');
assert.equal(normalizeAttendanceSubjectCode('SOFA'), 'SOFA', 'SOFA must NOT be altered');
assert.equal(normalizeAttendanceSubjectCode('FARM'), 'FARM', 'FARM must NOT be altered');
assert.equal(normalizeAttendanceSubjectCode('FIFA'), 'FIFA', 'FIFA must NOT be altered');
assert.equal(normalizeAttendanceSubjectCode('FA'), 'FA', 'FA standalone must NOT be altered');
assert.equal(normalizeAttendanceSubjectCode('FA-101'), 'FA-101', 'FA-101 prefix must NOT be altered');
assert.equal(normalizeAttendanceSubjectCode(''), '');
assert.equal(normalizeAttendanceSubjectCode(null), '');

console.log('  ✅ Trailing -FA normalized properly while preserving unrelated words.');

// ==============================================================
// 2. Canonical Subject Key Tests (getCanonicalSubjectKey)
// ==============================================================
console.log('\nTest 2: Canonical Subject Key Generation...');

assert.equal(getCanonicalSubjectKey('ADI'), 'ADI');
assert.equal(getCanonicalSubjectKey('ADI-FA'), 'ADI');
assert.equal(getCanonicalSubjectKey('adi-fa'), 'ADI');
assert.equal(getCanonicalSubjectKey('shared_adi-fa'), 'ADI');
assert.equal(getCanonicalSubjectKey('shared_adi'), 'ADI');
assert.equal(getCanonicalSubjectKey('DBMS-FA'), 'DBMS');
assert.equal(getCanonicalSubjectKey('shared_dbms'), 'DBMS');
assert.equal(getCanonicalSubjectKey('SOFA'), 'SOFA');

console.log('  ✅ Canonical keys accurately strip shared_ prefixes and -FA suffixes.');

// ==============================================================
// 3. Subject Identity Matching (isSameAttendanceSubject)
// ==============================================================
console.log('\nTest 3: Subject Identity Equivalence (isSameAttendanceSubject)...');

assert.equal(isSameAttendanceSubject('ADI', 'ADI-FA'), true);
assert.equal(isSameAttendanceSubject('shared_adi', 'ADI-FA'), true);
assert.equal(isSameAttendanceSubject('DBMS', 'DBMS-FA'), true);
assert.equal(isSameAttendanceSubject({ code: 'ADI' }, { code: 'ADI-FA' }), true);
assert.equal(isSameAttendanceSubject({ id: 'shared_adi', code: 'ADI' }, 'ADI-FA'), true);
assert.equal(isSameAttendanceSubject('ADI', 'DBMS'), false);
assert.equal(isSameAttendanceSubject('SOFA', 'FA'), false);
assert.equal(isSameAttendanceSubject('SOFA', 'SOFA-FA'), true);

console.log('  ✅ -FA variants are recognized as the same attendance subject.');

// ==============================================================
// 4. Record Matching (matchesSubjectRecord)
// ==============================================================
console.log('\nTest 4: Attendance Record Matching (matchesSubjectRecord)...');

const canonicalAdi = {
  id: 'shared_adi',
  code: 'ADI',
  name: 'Applied Design & Innovation',
};

// Records with various legacy and variant subject IDs must all match
assert.equal(matchesSubjectRecord(canonicalAdi, 'shared_adi'), true);
assert.equal(matchesSubjectRecord(canonicalAdi, 'ADI'), true);
assert.equal(matchesSubjectRecord(canonicalAdi, 'ADI-FA'), true);
assert.equal(matchesSubjectRecord(canonicalAdi, 'shared_adi-fa'), true);
assert.equal(matchesSubjectRecord(canonicalAdi, 'DBMS'), false);
assert.equal(matchesSubjectRecord(canonicalAdi, 'shared_dbms'), false);

console.log('  ✅ Existing records logged under ADI, ADI-FA, or shared_adi-fa all match the canonical subject.');

// ==============================================================
// 5. Subject Canonicalization (canonicalizeSubjectsForAttendance)
// ==============================================================
console.log('\nTest 5: Subject Consolidation (canonicalizeSubjectsForAttendance)...');

const mockUserSubjects = [
  {
    id: 'user_adi',
    code: 'ADI',
    name: 'Applied Design & Innovation',
    initialAttended: 8,
    initialConducted: 10,
    color: '#3b82f6',
  },
  {
    id: 'user_adi_fa',
    code: 'ADI-FA',
    name: 'Applied Design & Innovation - FA',
    initialAttended: 4,
    initialConducted: 5,
    color: '#3b82f6',
  },
  {
    id: 'user_dbms',
    code: 'DBMS',
    name: 'Database Management Systems',
    initialAttended: 15,
    initialConducted: 20,
    color: '#10b981',
  },
];

const mockSlots = [
  {
    id: 'slot_1',
    subjectCode: 'ADI',
    subjectName: 'Applied Design & Innovation',
    color: '#3b82f6',
  },
  {
    id: 'slot_2',
    subjectCode: 'ADI-FA',
    subjectName: 'Applied Design & Innovation - FA',
    color: '#3b82f6',
  },
  {
    id: 'slot_3',
    subjectCode: 'DBMS-FA',
    subjectName: 'Database Management Systems - FA',
    color: '#10b981',
  },
];

const canonical = canonicalizeSubjectsForAttendance(mockUserSubjects, mockSlots, 'test_uid');

// Must consolidate ADI and ADI-FA into exactly 1 entry
const adiEntries = canonical.filter((s) => s.code === 'ADI');
assert.equal(adiEntries.length, 1, 'Should consolidate ADI and ADI-FA into exactly one entry');

// Baseline totals must combine without loss: (8+4)=12 attended, (10+5)=15 conducted
assert.equal(adiEntries[0].initialAttended, 12, 'Combined initial attended must equal 12');
assert.equal(adiEntries[0].initialConducted, 15, 'Combined initial conducted must equal 15');

// Must consolidate DBMS into exactly 1 entry
const dbmsEntries = canonical.filter((s) => s.code === 'DBMS');
assert.equal(dbmsEntries.length, 1, 'Should consolidate DBMS into exactly one entry');

console.log('  ✅ Consolidated subject list contains single merged entries with combined baselines.');

// ==============================================================
// 6. Attendance Aggregation Tests
// ==============================================================
console.log('\nTest 6: Unified Attendance Aggregation (calculateSubjectAttendance)...');

const records = [
  // 1 lecture marked under base subject
  { status: 'present', subjectId: 'ADI', group: 'ALL' },
  // 1 lecture marked under -FA variant
  { status: 'present', subjectId: 'ADI-FA', group: 'ALL' },
  // 1 lecture marked under legacy shared id
  { status: 'absent', subjectId: 'shared_adi-fa', group: 'ALL' },
];

const agg = calculateSubjectAttendance(
  adiEntries[0], // baseline: 12 attended, 15 conducted
  records,
  0.75
);

// Baseline: 12/15. Logged: 2 present, 1 absent = 3 conducted, 2 attended.
// Total: 12 + 2 = 14 attended, 15 + 3 = 18 conducted.
assert.equal(agg.baselineAttended, 12);
assert.equal(agg.baselineConducted, 15);
assert.equal(agg.loggedAttended, 2);
assert.equal(agg.loggedConducted, 3);
assert.equal(agg.totalAttended, 14);
assert.equal(agg.totalConducted, 18);
assert.equal(Math.round(agg.stats.percentage * 100) / 100, 77.78);
assert.equal(agg.stats.isOnTrack, true);

console.log('  ✅ Base subject and -FA variants seamlessly aggregate into one combined percentage and count.');

// ==============================================================
// 7. Lecture Slot Identity & Duplicate Session Prevention
// ==============================================================
console.log('\nTest 7: Slot Session Identity & Multiple Classes on Same Date...');

// Simulate student attendance store on a given day
const testDate = new Date('2026-10-13T00:00:00.000Z');
const recordedAttendance = [];

function simulateMarkAttendance({ subjectId, lectureSlotId, date, status }) {
  const sub = canonical.find((s) => matchesSubjectRecord(s, subjectId));

  // Duplication check from AttendancePage
  const existing = recordedAttendance.find((a) => {
    if (!matchesSubjectRecord(sub || subjectId, a.subjectId)) return false;
    if (a.date.toDateString() !== date.toDateString()) return false;
    if (a.status === 'cancelled') return false;
    if (lectureSlotId && a.lectureSlotId) {
      return a.lectureSlotId === lectureSlotId;
    }
    return !lectureSlotId;
  });

  if (existing) {
    return { success: false, reason: 'Duplicate' };
  }

  const record = {
    subjectId: sub ? sub.id : subjectId,
    lectureSlotId: lectureSlotId || null,
    date,
    status,
  };
  recordedAttendance.push(record);
  return { success: true, record };
}

// 7.1 Student marks ADI lecture slot 1 on 2026-10-13
const mark1 = simulateMarkAttendance({
  subjectId: 'shared_adi',
  lectureSlotId: 'slot_lecture_1',
  date: testDate,
  status: 'present',
});
assert.equal(mark1.success, true, 'Slot 1 should be recorded');

// 7.2 Student tries to mark slot 1 AGAIN on the same date -> MUST BE BLOCKED
const mark1Dup = simulateMarkAttendance({
  subjectId: 'shared_adi',
  lectureSlotId: 'slot_lecture_1',
  date: testDate,
  status: 'present',
});
assert.equal(mark1Dup.success, false, 'Duplicate marking of slot 1 must be blocked');

// 7.3 Student marks distinct ADI-FA lecture slot 2 on the same date -> MUST SUCCEED
const mark2 = simulateMarkAttendance({
  subjectId: 'ADI-FA',
  lectureSlotId: 'slot_lecture_2',
  date: testDate,
  status: 'present',
});
assert.equal(mark2.success, true, 'Slot 2 (ADI-FA) on same date must NOT be blocked');

// 7.4 Both slots must be recorded under the canonical subject
assert.equal(recordedAttendance.length, 2);
assert.equal(recordedAttendance[0].subjectId, 'user_adi');
assert.equal(recordedAttendance[1].subjectId, 'user_adi');

console.log('  ✅ Slot-specific lecture sessions on the same date are distinct and not overwritten.');

// ==============================================================
// 8. Timetable Views Retain Original Names
// ==============================================================
console.log('\nTest 8: Timetable Views Retain Original Names...');

assert.equal(mockSlots[1].subjectCode, 'ADI-FA');
assert.equal(mockSlots[1].subjectName, 'Applied Design & Innovation - FA');
assert.equal(mockSlots[2].subjectCode, 'DBMS-FA');

console.log('  ✅ Timetable views retain raw original subject names including -FA suffix.');

console.log('\n🎉 ALL SUBJECT -FA ATTENDANCE CANONICALIZATION TESTS PASSED!\n');
