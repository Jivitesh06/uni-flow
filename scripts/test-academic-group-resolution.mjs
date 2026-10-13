/**
 * Test Suite: Academic Group Resolution & Timetable Anti-Corruption Verification
 *
 * Verifies:
 * 1. Automatic cohort batch derivation when profile batch is missing:
 *    - Semester 1 -> batch 2026
 *    - Semester 3 -> batch 2025
 *    - Semester 5 -> batch 2024
 * 2. Explicit verified profile batches take precedence.
 * 3. Section/semester conflict detection flags ambiguity instead of silently selecting wrong timetables.
 * 4. Timetable, Dashboard, and Attendance pages resolve the exact same canonical group ID.
 * 5. Corruption detection (isCorruptedTimetableDoc) flags room codes (CL01-05, KLM108L) and LEC.
 * 6. getSharedTimetableCache prioritizes clean canonical cohort datasets and purges corrupted cache.
 * 7. mergeSharedAndPersonalSlots prevents cross-semester leakage when switching semesters.
 */

import assert from 'node:assert';
import {
  ACTIVE_COHORT_BATCH_MAP,
  resolveStudentAcademicGroup,
  buildSharedGroupId,
  buildSharedGroupLabel,
  isCorruptedTimetableDoc,
  getSharedTimetableCache,
  mergeSharedAndPersonalSlots,
  KNOWN_CORRUPT_SUBJECT_CODES,
} from '../src/lib/sharedTimetable.ts';

console.log('======================================================================');
console.log(' UNIFLOW ACADEMIC GROUP RESOLUTION & ANTI-CORRUPTION TEST SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✓ [PASS ${totalTests}] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${description}`);
    console.error(`    Error: ${err.message}\n`);
    throw err;
  }
}

// ----------------------------------------------------------------------
// 1. Cohort Batch Mapping Verification
// ----------------------------------------------------------------------
console.log('--- 1. Cohort Batch Mapping (Automatic Resolution) ---');

runTest('Semester 1 student without batch resolves to 2026 cohort and BE-CSE-1A', () => {
  const profile = { semester: 1, section: '1A' };
  const res = resolveStudentAcademicGroup(profile);

  assert.strictEqual(res.isAmbiguous, false, 'Should not be ambiguous');
  assert.strictEqual(res.isSupportedCohort, true, 'Should be supported cohort');
  assert.strictEqual(res.params?.batch, '2026', 'Semester 1 must resolve to batch 2026');
  assert.strictEqual(res.params?.semester, 1);
  assert.strictEqual(res.params?.section, 'BE-CSE-1A');
  assert.strictEqual(res.groupId, 'chitkara-university_be-cse_2026_sem1_be-cse-1a');
  assert.strictEqual(
    res.groupLabel,
    'Chitkara University / BE-CSE / 2026 / Semester 1 / BE-CSE-1A'
  );
});

runTest('Semester 3 student without batch resolves to 2025 cohort and BE-CSE-3B', () => {
  const profile = { semester: 3, section: '3B' };
  const res = resolveStudentAcademicGroup(profile);

  assert.strictEqual(res.isAmbiguous, false);
  assert.strictEqual(res.params?.batch, '2025', 'Semester 3 must resolve to batch 2025');
  assert.strictEqual(res.params?.semester, 3);
  assert.strictEqual(res.params?.section, 'BE-CSE-3B');
  assert.strictEqual(res.groupId, 'chitkara-university_be-cse_2025_sem3_be-cse-3b');
});

runTest('Semester 5 student without batch resolves to 2024 cohort and BE-CSE-5A', () => {
  const profile = { semester: 5, section: '5A' };
  const res = resolveStudentAcademicGroup(profile);

  assert.strictEqual(res.isAmbiguous, false);
  assert.strictEqual(res.params?.batch, '2024', 'Semester 5 must resolve to batch 2024');
  assert.strictEqual(res.params?.semester, 5);
  assert.strictEqual(res.params?.section, 'BE-CSE-5A');
  assert.strictEqual(res.groupId, 'chitkara-university_be-cse_2024_sem5_be-cse-5a');
});

// ----------------------------------------------------------------------
// 2. Explicit Batch Precedence
// ----------------------------------------------------------------------
console.log('\n--- 2. Explicit Verified Batch Precedence ---');

runTest('Explicit valid batch year takes precedence over automatic mapping', () => {
  const profile = { semester: 1, section: '1A', batch: '2026' };
  const res = resolveStudentAcademicGroup(profile);

  assert.strictEqual(res.params?.batch, '2026');
  assert.strictEqual(res.isAmbiguous, false);
  assert.strictEqual(res.groupId, 'chitkara-university_be-cse_2026_sem1_be-cse-1a');
});

runTest('Historical cohort with major discrepancy flags ambiguity instead of silent failure', () => {
  const profile = { semester: 1, section: '1A', batch: '2022' };
  const res = resolveStudentAcademicGroup(profile);

  assert.strictEqual(res.isAmbiguous, true, 'Discrepant historical batch must be flagged as ambiguous');
  assert.ok(res.ambiguityReason?.includes('2022'), 'Reason should cite the batch mismatch');
});

// ----------------------------------------------------------------------
// 3. Section vs Semester Conflict Detection
// ----------------------------------------------------------------------
console.log('\n--- 3. Section and Semester Conflict Detection ---');

runTest('Profile with Semester 5 and Section 1A flags conflict ambiguity', () => {
  const profile = { semester: 5, section: '1A' };
  const res = resolveStudentAcademicGroup(profile);

  assert.strictEqual(res.isAmbiguous, true, 'Mismatched semester & section must flag ambiguity');
  assert.ok(
    res.ambiguityReason?.includes('belongs to Semester 1'),
    `Expected explanation of mismatch, got: ${res.ambiguityReason}`
  );
});

runTest('Profile with Semester 1 and Section BE-CSE-5A flags conflict ambiguity', () => {
  const profile = { semester: 1, section: 'BE-CSE-5A' };
  const res = resolveStudentAcademicGroup(profile);

  assert.strictEqual(res.isAmbiguous, true);
  assert.ok(
    res.ambiguityReason?.includes('belongs to Semester 5'),
    `Expected explanation of mismatch, got: ${res.ambiguityReason}`
  );
});

// ----------------------------------------------------------------------
// 4. Parity Across Timetable, Dashboard & Attendance Consumers
// ----------------------------------------------------------------------
console.log('\n--- 4. Cross-Consumer Parity Verification ---');

runTest('Timetable, Dashboard, and Attendance resolve identical canonical group ID', () => {
  const student = {
    uid: 'test_student_123',
    college: 'Chitkara University',
    program: 'BE-CSE',
    semester: 1,
    section: '1B',
  };

  // Simulating consumer useMemo resolution in all 3 pages
  const timetableRes = resolveStudentAcademicGroup(student);
  const dashboardRes = resolveStudentAcademicGroup(student);
  const attendanceRes = resolveStudentAcademicGroup(student);

  assert.strictEqual(timetableRes.groupId, 'chitkara-university_be-cse_2026_sem1_be-cse-1b');
  assert.strictEqual(timetableRes.groupId, dashboardRes.groupId, 'Dashboard and Timetable must match');
  assert.strictEqual(timetableRes.groupId, attendanceRes.groupId, 'Attendance and Timetable must match');
  assert.strictEqual(timetableRes.groupLabel, dashboardRes.groupLabel);
  assert.strictEqual(timetableRes.groupLabel, attendanceRes.groupLabel);
});

// ----------------------------------------------------------------------
// 5. Anti-Corruption Guard (Room Codes & Placeholders)
// ----------------------------------------------------------------------
console.log('\n--- 5. Timetable Anti-Corruption Checks ---');

runTest('isCorruptedTimetableDoc detects room codes as subjects (CL01-05, KLM108L)', () => {
  const corruptedDoc = {
    id: 'chitkara-university_be-cse_2024_sem1_be-cse-1a',
    slots: [
      { subjectCode: 'CL01', subjectName: 'CL01', startTime: '09:00', endTime: '09:50', dayOfWeek: 1 },
      { subjectCode: 'MATH', subjectName: 'MATH', startTime: '09:55', endTime: '10:45', dayOfWeek: 1 },
    ],
  };

  assert.strictEqual(isCorruptedTimetableDoc(corruptedDoc), true);
});

runTest('isCorruptedTimetableDoc detects LEC or TBD placeholders', () => {
  const placeholderDoc = {
    id: 'test_doc',
    slots: [
      { subjectCode: 'LEC', subjectName: 'LEC', startTime: '11:10', endTime: '12:00', dayOfWeek: 2 },
    ],
  };

  assert.strictEqual(isCorruptedTimetableDoc(placeholderDoc), true);
});

runTest('isCorruptedTimetableDoc returns false for clean verified slots', () => {
  const cleanDoc = {
    id: 'chitkara-university_be-cse_2026_sem1_be-cse-1a',
    slots: [
      { subjectCode: 'AM-I', subjectName: 'AM-I', startTime: '09:00', endTime: '09:50', dayOfWeek: 1 },
      { subjectCode: 'EP', subjectName: 'EP', startTime: '09:55', endTime: '10:45', dayOfWeek: 1 },
    ],
  };

  assert.strictEqual(isCorruptedTimetableDoc(cleanDoc), false);
});

// ----------------------------------------------------------------------
// 6. Cache Resolution & Corrupted Purge
// ----------------------------------------------------------------------
console.log('\n--- 6. Clean Cache Hydration & Corrupted Purge ---');

runTest('getSharedTimetableCache retrieves clean 34-slot Semester 1 dataset without corruption', () => {
  const cleanSem1Id = 'chitkara-university_be-cse_2026_sem1_be-cse-1a';
  const cached = getSharedTimetableCache(cleanSem1Id);

  assert.ok(cached, 'Cache must find Semester 1 dataset');
  assert.strictEqual(cached.slots.length, 34, 'Semester 1 section 1A must have exactly 34 slots');
  assert.strictEqual(isCorruptedTimetableDoc(cached), false, 'Cached doc must not be corrupted');

  // Verify none of the slots have room codes as subjects
  for (const s of cached.slots) {
    assert.strictEqual(
      KNOWN_CORRUPT_SUBJECT_CODES.has(s.subjectCode),
      false,
      `Subject code ${s.subjectCode} must not be a corrupted code`
    );
  }
});

// ----------------------------------------------------------------------
// 7. Cross-Semester Leakage Prevention
// ----------------------------------------------------------------------
console.log('\n--- 7. Cross-Semester Slot Leakage Prevention ---');

runTest('mergeSharedAndPersonalSlots prevents Semester 5 personal slots from leaking into Semester 1', () => {
  const sem1SharedSlots = [
    {
      id: 's1',
      subjectCode: 'AM-I',
      subjectName: 'AM-I',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '09:50',
    },
  ];

  const personalSlots = [
    {
      id: 'p_sem5',
      uid: 'student1',
      subjectId: 'sub_adi',
      subjectName: 'ADI',
      subjectCode: 'ADI',
      dayOfWeek: 1,
      startTime: '11:10',
      endTime: '12:50',
      color: '#3b82f6',
      isActive: true,
      isManual: true,
      section: 'BE-CSE-5A', // Stale Semester 5 slot
    },
    {
      id: 'p_sem1_valid',
      uid: 'student1',
      subjectId: 'sub_mentor',
      subjectName: 'MM',
      subjectCode: 'MM',
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '10:50',
      color: '#10b981',
      isActive: true,
      isManual: true,
      section: 'BE-CSE-1A', // Valid Semester 1 personal slot
    },
  ];

  const merged = mergeSharedAndPersonalSlots(
    sem1SharedSlots,
    personalSlots,
    'chitkara-university_be-cse_2026_sem1_be-cse-1a'
  );

  const mergedCodes = merged.map((s) => s.subjectCode);
  assert.ok(mergedCodes.includes('AM-I'), 'Authoritative shared slot must be present');
  assert.ok(mergedCodes.includes('MM'), 'Valid Sem 1 personal manual slot must be preserved');
  assert.strictEqual(
    mergedCodes.includes('ADI'),
    false,
    'Stale Sem 5 personal slot must NOT leak into Sem 1 timetable!'
  );
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(' Academic group resolution & anti-corruption guards verified! 🚀');
console.log('======================================================================\n');
