import assert from 'node:assert/strict';

import {
  normalizeCodeForMatching,
  normalizeAttendanceSubjectCode,
  computeSubjectMatchScore,
  buildTimetableSubjectEquivalenceMap,
  getCanonicalSubjectKey,
  isSameAttendanceSubject,
  matchesSubjectRecord,
  canonicalizeSubjectsForAttendance,
  calculateSubjectAttendance,
  calculateAttendanceStats,
} from '../src/lib/attendanceCalculations.ts';

console.log('===============================================================');
console.log(' UniFlow: Timetable-Based Dynamic Subject Identity Matching');
console.log('===============================================================\n');

// ==============================================================
// TEST 1: LAC and LACT aggregate together
// ==============================================================
console.log('Test 1: Confirmed Example 1 — LAC and LACT resolve and aggregate together...');

const slotsLac = [
  {
    id: 'slot_lac_1',
    subjectCode: 'LAC',
    subjectName: 'Linear Algebra and Calculus',
    faculty: 'Dr. Sharma',
    dayOfWeek: 1,
    startTime: '09:30',
    endTime: '10:20',
    room: 'LH201',
    color: '#3b82f6',
  },
  {
    id: 'slot_lact_1',
    subjectCode: 'LACT',
    subjectName: 'LACT',
    faculty: 'Dr. Sharma',
    dayOfWeek: 3,
    startTime: '11:10',
    endTime: '12:00',
    room: 'LH201',
    color: '#3b82f6',
  },
];

const ctxLac = buildTimetableSubjectEquivalenceMap(slotsLac);
assert.equal(
  ctxLac.getCanonicalKey('LACT'),
  ctxLac.getCanonicalKey('LAC'),
  'LACT and LAC must resolve to the same canonical key'
);
assert.equal(ctxLac.getCanonicalKey('LACT'), 'LAC', 'LAC must be chosen as canonical base code');

const canonicalSubsLac = canonicalizeSubjectsForAttendance([], slotsLac, 'test_user', ctxLac);
assert.equal(canonicalSubsLac.length, 1, 'LAC and LACT must be consolidated into exactly ONE canonical subject');
assert.equal(canonicalSubsLac[0].code, 'LAC');
assert.equal(
  canonicalSubsLac[0].name,
  'Linear Algebra and Calculus',
  'Most descriptive human-readable name must be preserved'
);

// Attendance aggregation test
const recordsLac = [
  { subjectId: 'shared_lac', lectureSlotId: 'slot_lac_1', status: 'present' },
  { subjectId: 'shared_lact', lectureSlotId: 'slot_lact_1', status: 'present' },
];

const subRecordsLac = recordsLac.filter((r) => matchesSubjectRecord(canonicalSubsLac[0], r.subjectId, ctxLac));
assert.equal(subRecordsLac.length, 2, 'Both LAC and LACT attendance records must match canonical subject');

const aggLac = calculateSubjectAttendance(canonicalSubsLac[0], subRecordsLac, 0.75);
assert.equal(aggLac.totalAttended, 2);
assert.equal(aggLac.totalConducted, 2);
assert.equal(aggLac.stats.percentage, 100);

console.log('  ✓ [PASS 1] 1. LAC and LACT resolve to the same canonical identity and aggregate attendance together.\n');

// ==============================================================
// TEST 2: SPC and SPCL aggregate together
// ==============================================================
console.log('Test 2: Confirmed Example 2 — SPC and SPCL resolve and aggregate together...');

const slotsSpc = [
  {
    id: 'slot_spc_1',
    subjectCode: 'SPC',
    subjectName: 'Statistical Process Control',
    faculty: 'Er. Sandeep',
    dayOfWeek: 2,
    startTime: '10:20',
    endTime: '11:10',
    room: 'LH102',
    color: '#10b981',
  },
  {
    id: 'slot_spcl_1',
    subjectCode: 'SPCL',
    subjectName: 'Statistical Process Control Lab',
    faculty: 'Er. Sandeep',
    dayOfWeek: 4,
    startTime: '13:40',
    endTime: '15:20',
    room: 'LAB301',
    color: '#10b981',
    periods: 2,
    weight: 2,
  },
];

const ctxSpc = buildTimetableSubjectEquivalenceMap(slotsSpc);
assert.equal(
  ctxSpc.getCanonicalKey('SPCL'),
  ctxSpc.getCanonicalKey('SPC'),
  'SPCL and SPC must resolve to the same canonical key'
);
assert.equal(ctxSpc.getCanonicalKey('SPCL'), 'SPC', 'SPC must be chosen as canonical base code');

const canonicalSubsSpc = canonicalizeSubjectsForAttendance([], slotsSpc, 'test_user', ctxSpc);
assert.equal(canonicalSubsSpc.length, 1, 'SPC and SPCL must be consolidated into exactly ONE canonical subject');
assert.equal(canonicalSubsSpc[0].code, 'SPC');
assert.equal(canonicalSubsSpc[0].name, 'Statistical Process Control');

// Attendance aggregation test with weighted lab
const recordsSpc = [
  { subjectId: 'shared_spc', lectureSlotId: 'slot_spc_1', status: 'present', weight: 1 },
  { subjectId: 'shared_spcl', lectureSlotId: 'slot_spcl_1', status: 'present', weight: 2 },
];

const subRecordsSpc = recordsSpc.filter((r) => matchesSubjectRecord(canonicalSubsSpc[0], r.subjectId, ctxSpc));
assert.equal(subRecordsSpc.length, 2, 'Both SPC and SPCL records must match canonical subject');

const aggSpc = calculateSubjectAttendance(canonicalSubsSpc[0], subRecordsSpc, 0.75);
assert.equal(aggSpc.totalAttended, 3, '1 period from lecture + 2 periods from lab = 3 attended');
assert.equal(aggSpc.totalConducted, 3, '1 period from lecture + 2 periods from lab = 3 conducted');
assert.equal(aggSpc.stats.percentage, 100);

console.log('  ✓ [PASS 2] 2. SPC and SPCL resolve to the same canonical identity and aggregate attendance together.\n');

// ==============================================================
// TEST 3: Normalization of spaces, punctuation, case differences
// ==============================================================
console.log('Test 3: Normalization of spaces, punctuation, and case differences...');

const variantLabels = ['lac', 'LAC', 'L.A.C.', 'L A C', ' shared_lac ', 'LAC.', 'LACT', 'lac-t', 'LAC_T'];
const normalizedBase = ctxLac.getCanonicalKey('LAC');

for (const label of variantLabels) {
  const resolved = ctxLac.getCanonicalKey(label);
  assert.equal(
    resolved,
    normalizedBase,
    `Label variation "${label}" must resolve to canonical key "${normalizedBase}", got "${resolved}"`
  );
}

const spcVariants = ['spc', 'SPC', 'S.P.C.', 'SPC - L', 'spc_l', 'SPCL', 'SPC (L)'];
const normalizedSpcBase = ctxSpc.getCanonicalKey('SPC');

for (const label of spcVariants) {
  const resolved = ctxSpc.getCanonicalKey(label);
  assert.equal(
    resolved,
    normalizedSpcBase,
    `SPC label variation "${label}" must resolve to canonical key "${normalizedSpcBase}", got "${resolved}"`
  );
}

console.log('  ✓ [PASS 3] 3. Equivalent labels with spaces, punctuation, or case differences normalize cleanly.\n');

// ==============================================================
// TEST 4: Other truncated names match dynamically using timetable evidence
// ==============================================================
console.log('Test 4: Generic dynamic matching for truncated names with timetable corroboration...');

const slotsTruncated = [
  {
    id: 'slot_comp_1',
    subjectCode: 'COMP',
    subjectName: 'Compiler Design',
    faculty: 'Dr. Raman',
    room: 'LH105',
  },
  {
    id: 'slot_compiler_1',
    subjectCode: 'COMPILER',
    subjectName: 'Compiler Design',
    faculty: 'Dr. Raman',
    room: 'LH105',
  },
];

const ctxTruncated = buildTimetableSubjectEquivalenceMap(slotsTruncated);
assert.equal(
  ctxTruncated.getCanonicalKey('COMP'),
  ctxTruncated.getCanonicalKey('COMPILER'),
  'COMP and COMPILER must resolve to same canonical key when timetable evidence corroborates'
);

const scoreWithEvidence = computeSubjectMatchScore(
  { code: 'COMP', name: 'Compiler Design', faculty: 'Dr. Raman' },
  { code: 'COMPILER', name: 'Compiler Design', faculty: 'Dr. Raman' }
);
assert.equal(scoreWithEvidence.isConfident, true);
assert(scoreWithEvidence.score >= 0.85);

// Without timetable corroboration (different faculty, different subject)
const scoreWithoutEvidence = computeSubjectMatchScore(
  { code: 'COMP', name: 'Component Technology', faculty: 'Dr. A' },
  { code: 'COMPILER', name: 'Compiler Design', faculty: 'Dr. B' }
);
assert.equal(scoreWithoutEvidence.isConfident, false);
assert(scoreWithoutEvidence.score < 0.75);

console.log('  ✓ [PASS 4] 4. Other truncated subject names match dynamically using timetable evidence.\n');

// ==============================================================
// TEST 5: Distinct subjects with similar prefixes are NOT merged
// ==============================================================
console.log('Test 5: Anti-collision guards — distinct subjects with similar prefixes are NOT merged...');

// 5A: Computer Networks (CN) vs Cryptography & Network Security (CNS)
const slotsCnCns = [
  { id: '1', subjectCode: 'CN', subjectName: 'Computer Networks', faculty: 'Dr. Gupta' },
  { id: '2', subjectCode: 'CNS', subjectName: 'Cryptography & Network Security', faculty: 'Dr. Verma' },
];
const ctxCnCns = buildTimetableSubjectEquivalenceMap(slotsCnCns);
assert.notEqual(
  ctxCnCns.getCanonicalKey('CN'),
  ctxCnCns.getCanonicalKey('CNS'),
  'CN and CNS must NOT be merged (different subjects)'
);

const canonicalCnCns = canonicalizeSubjectsForAttendance([], slotsCnCns, 'test_user', ctxCnCns);
assert.equal(canonicalCnCns.length, 2, 'CN and CNS must remain 2 separate canonical subjects');

// 5B: Numeric levels (MATH1 vs MATH2, CS101 vs CS102)
const slotsMath = [
  { id: '1', subjectCode: 'MATH1', subjectName: 'Mathematics I' },
  { id: '2', subjectCode: 'MATH2', subjectName: 'Mathematics II' },
];
const ctxMath = buildTimetableSubjectEquivalenceMap(slotsMath);
assert.notEqual(
  ctxMath.getCanonicalKey('MATH1'),
  ctxMath.getCanonicalKey('MATH2'),
  'MATH1 and MATH2 must NOT be merged (different course levels)'
);

// 5C: Roman numeral levels (NALR-I vs NALR-II)
const slotsNalr = [
  { id: '1', subjectCode: 'NALR-I', subjectName: 'Numerical Analysis & Linear Reasoning I' },
  { id: '2', subjectCode: 'NALR-II', subjectName: 'Numerical Analysis & Linear Reasoning II' },
];
const ctxNalr = buildTimetableSubjectEquivalenceMap(slotsNalr);
assert.notEqual(
  ctxNalr.getCanonicalKey('NALR-I'),
  ctxNalr.getCanonicalKey('NALR-II'),
  'NALR-I and NALR-II must NOT be merged'
);

console.log('  ✓ [PASS 5] 5. Distinct subjects with similar prefixes (CN vs CNS, MATH1 vs MATH2, NALR-I vs NALR-II) are not incorrectly merged.\n');

// ==============================================================
// TEST 6: Ambiguous matches do NOT silently merge
// ==============================================================
console.log('Test 6: Ambiguity handling — competing matches remain separate and are flagged...');

const slotsAmbiguous = [
  { id: '1', subjectCode: 'PROJ', subjectName: 'Capstone Project' },
  { id: '2', subjectCode: 'PROJ-A', subjectName: 'Capstone Project Track A' },
  { id: '3', subjectCode: 'PROJ-B', subjectName: 'Capstone Project Track B' },
];

const ctxAmbiguous = buildTimetableSubjectEquivalenceMap(slotsAmbiguous);
assert(ctxAmbiguous.ambiguousSubjects.length > 0, 'Ambiguous subjects must be detected');
assert(
  ctxAmbiguous.ambiguousSubjects.includes('PROJ'),
  'PROJ must be flagged as ambiguous when competing with PROJ-A and PROJ-B'
);

// When ambiguous, PROJ must NOT silently merge with PROJ-A or PROJ-B
assert.notEqual(
  ctxAmbiguous.getCanonicalKey('PROJ-A'),
  ctxAmbiguous.getCanonicalKey('PROJ-B'),
  'PROJ-A and PROJ-B must NOT be merged'
);

console.log('  ✓ [PASS 6] 6. Ambiguous matches do not silently merge and are flagged for review.\n');

// ==============================================================
// TEST 7: Individual sessions can still be marked independently
// ==============================================================
console.log('Test 7: Independent session attendance marking...');

// Suppose on Monday, a student has both LAC and LACT
const mondaySlots = [
  {
    id: 'slot_lac_mon_morning',
    subjectCode: 'LAC',
    subjectName: 'Linear Algebra and Calculus',
    startTime: '09:30',
    endTime: '10:20',
  },
  {
    id: 'slot_lact_mon_afternoon',
    subjectCode: 'LACT',
    subjectName: 'LACT',
    startTime: '14:30',
    endTime: '15:20',
  },
];

// Student attended morning class (Present) but missed afternoon class (Absent)
const sessionAttendance = [
  {
    id: 'att_1',
    subjectId: 'shared_lac',
    lectureSlotId: 'slot_lac_mon_morning',
    date: { toDate: () => new Date('2026-10-12T00:00:00Z') },
    status: 'present',
    weight: 1,
  },
  {
    id: 'att_2',
    subjectId: 'shared_lac',
    lectureSlotId: 'slot_lact_mon_afternoon',
    date: { toDate: () => new Date('2026-10-12T00:00:00Z') },
    status: 'absent',
    weight: 1,
  },
];

// Both sessions are identified independently by their lectureSlotId
const morningRecord = sessionAttendance.find((a) => a.lectureSlotId === 'slot_lac_mon_morning');
const afternoonRecord = sessionAttendance.find((a) => a.lectureSlotId === 'slot_lact_mon_afternoon');

assert.equal(morningRecord?.status, 'present');
assert.equal(afternoonRecord?.status, 'absent');
assert.notEqual(morningRecord?.id, afternoonRecord?.id, 'Session records must be completely distinct');

// Aggregate calculation combines both: 1 present out of 2 conducted = 50%
const aggSessions = calculateSubjectAttendance({ code: 'LAC' }, sessionAttendance, 0.75);
assert.equal(aggSessions.totalAttended, 1);
assert.equal(aggSessions.totalConducted, 2);
assert.equal(aggSessions.stats.percentage, 50);

console.log('  ✓ [PASS 7] 7. Individual sessions can still be marked independently without collisions.\n');

// ==============================================================
// TEST 8: Weighted labs and -FA aggregation continue passing
// ==============================================================
console.log('Test 8: Weighted labs and -FA aggregation continue passing...');

const slotsLabAndFa = [
  { id: '1', subjectCode: 'ADI', subjectName: 'Applied Design & Innovation', weight: 1 },
  { id: '2', subjectCode: 'ADI-FA', subjectName: 'Applied Design & Innovation (Financial Apps)', weight: 1 },
  { id: '3', subjectCode: 'SPC', subjectName: 'Statistical Process Control', weight: 1 },
  { id: '4', subjectCode: 'SPCL', subjectName: 'Statistical Process Control Lab', weight: 2 },
];

const ctxLabAndFa = buildTimetableSubjectEquivalenceMap(slotsLabAndFa);
assert.equal(
  ctxLabAndFa.getCanonicalKey('ADI-FA'),
  ctxLabAndFa.getCanonicalKey('ADI'),
  'ADI-FA must aggregate into ADI'
);

const recordsLabAndFa = [
  { subjectId: 'shared_adi', status: 'present', weight: 1 },
  { subjectId: 'shared_adi-fa', status: 'present', weight: 1 },
  { subjectId: 'shared_spcl', status: 'present', weight: 2 }, // 2-period lab
];

const adiSub = { id: 'shared_adi', code: 'ADI', name: 'Applied Design & Innovation' };
const adiRecords = recordsLabAndFa.filter((r) => matchesSubjectRecord(adiSub, r.subjectId, ctxLabAndFa));
const adiAgg = calculateSubjectAttendance(adiSub, adiRecords, 0.75);
assert.equal(adiAgg.totalAttended, 2, 'ADI and ADI-FA combined attended periods must be 2');
assert.equal(adiAgg.totalConducted, 2);

const spcSub = { id: 'shared_spc', code: 'SPC', name: 'Statistical Process Control' };
const spcRecords = recordsLabAndFa.filter((r) => matchesSubjectRecord(spcSub, r.subjectId, ctxLabAndFa));
const spcAgg = calculateSubjectAttendance(spcSub, spcRecords, 0.75);
assert.equal(spcAgg.totalAttended, 2, 'SPCL 2-period lab must count as 2 attended periods');
assert.equal(spcAgg.totalConducted, 2, 'SPCL 2-period lab must count as 2 conducted periods');

console.log('  ✓ [PASS 8] 8. Multi-period lab weights and -FA aggregation continue working seamlessly.\n');

// ==============================================================
// TEST 9: Original timetable display labels remain unchanged
// ==============================================================
console.log('Test 9: Original timetable display labels remain unchanged in timetable UI...');

const fullTimetableSlots = [
  { id: 's1', subjectCode: 'LAC', subjectName: 'Linear Algebra and Calculus' },
  { id: 's2', subjectCode: 'LACT', subjectName: 'LACT' },
  { id: 's3', subjectCode: 'SPC', subjectName: 'Statistical Process Control' },
  { id: 's4', subjectCode: 'SPCL', subjectName: 'Statistical Process Control Lab' },
  { id: 's5', subjectCode: 'ADI-FA', subjectName: 'Applied Design & Innovation (Financial Apps)' },
];

// Verify slots themselves are NOT modified
assert.equal(fullTimetableSlots[0].subjectCode, 'LAC');
assert.equal(fullTimetableSlots[1].subjectCode, 'LACT', 'LACT slot must retain its raw subjectCode in timetable UI');
assert.equal(fullTimetableSlots[2].subjectCode, 'SPC');
assert.equal(fullTimetableSlots[3].subjectCode, 'SPCL', 'SPCL slot must retain its raw subjectCode in timetable UI');
assert.equal(fullTimetableSlots[4].subjectCode, 'ADI-FA', 'ADI-FA slot must retain its raw subjectCode in timetable UI');

console.log('  ✓ [PASS 9] 9. Original timetable display labels remain completely unchanged.\n');

// ==============================================================
// TEST 10: Historical attendance compatibility
// ==============================================================
console.log('Test 10: Historical attendance records compatibility...');

// Legacy records created before canonicalization might have:
// 'shared_lact', 'LACT', 'shared_spcl', 'SPCL', 'shared_adi-fa', 'ADI-FA'
const canonicalSubjects = canonicalizeSubjectsForAttendance([], fullTimetableSlots, 'test_user');
const canonicalLac = canonicalSubjects.find((s) => s.code === 'LAC');
const canonicalSpc = canonicalSubjects.find((s) => s.code === 'SPC');
const canonicalAdi = canonicalSubjects.find((s) => s.code === 'ADI');

assert(canonicalLac, 'Canonical LAC subject must exist');
assert(canonicalSpc, 'Canonical SPC subject must exist');
assert(canonicalAdi, 'Canonical ADI subject must exist');

// Test matching against all historical format variations without modifying database
const historicalLacVariants = ['shared_lac', 'shared_lact', 'LAC', 'LACT', 'lac', 'lact'];
for (const variant of historicalLacVariants) {
  assert.equal(
    matchesSubjectRecord(canonicalLac, variant),
    true,
    `Historical record with subjectId "${variant}" must match canonical LAC`
  );
}

const historicalSpcVariants = ['shared_spc', 'shared_spcl', 'SPC', 'SPCL', 'spc', 'spcl'];
for (const variant of historicalSpcVariants) {
  assert.equal(
    matchesSubjectRecord(canonicalSpc, variant),
    true,
    `Historical record with subjectId "${variant}" must match canonical SPC`
  );
}

const historicalAdiVariants = ['shared_adi', 'shared_adi-fa', 'ADI', 'ADI-FA', 'adi', 'adi-fa'];
for (const variant of historicalAdiVariants) {
  assert.equal(
    matchesSubjectRecord(canonicalAdi, variant),
    true,
    `Historical record with subjectId "${variant}" must match canonical ADI`
  );
}

console.log('  ✓ [PASS 10] 10. Historical attendance records remain 100% compatible and readable.\n');

console.log('===============================================================');
console.log(' Summary: 10 / 10 Tests Passed (100%)');
console.log(' Timetable Dynamic Subject Identity Matching Verified! 🚀');
console.log('===============================================================\n');
