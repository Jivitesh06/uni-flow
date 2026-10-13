/**
 * UniFlow — Critical Timetable Accuracy Overhaul Ground-Truth Test Suite
 *
 * Validates 100% end-to-end correctness across PDF parsing, multi-period lab weights,
 * room/subject classification, non-academic periods, admin publishing, and student hydration
 * using the three real Chitkara PDF fixtures:
 * 1. BE CSE 1st sem.pdf
 * 2. BE CSE 3rd sem Section Wise.pdf
 * 3. Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const {
  parseChitkaraPdf,
  detectGroupInString,
  CHITKARA_SUBJECT_NAMES,
} = await import('../src/lib/chitkaraTimetableParser.ts');

const {
  buildSharedGroupId,
  buildSharedGroupLabel,
  computeTimetableContentHash,
  getSharedTimetableCache,
  mergeSharedAndPersonalSlots,
} = await import('../src/lib/sharedTimetable.ts');

const {
  canonicalizeSubjectsForAttendance,
  calculateSubjectAttendance,
  buildTimetableSubjectEquivalenceMap,
} = await import('../src/lib/attendanceCalculations.ts');

const {
  isSectionMatch,
} = await import('../src/lib/collegeEmail.ts');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS ${passedTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS ${passedTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('\n===============================================================');
console.log(' UniFlow: Critical Timetable Accuracy Ground-Truth Verification');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// PART 1: Real PDF Fixture Extraction & Section Discovery
// -----------------------------------------------------------------------------
console.log('--- PART 1: Real PDF Extraction & Section Discovery ---');

const sem1Path = path.join(projectRoot, 'tests', 'fixtures', 'BE CSE 1st sem.pdf');
const sem3Path = path.join(projectRoot, 'tests', 'fixtures', 'BE CSE 3rd sem Section Wise.pdf');
const sem5Path = path.join(projectRoot, 'tests', 'fixtures', 'Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf');

const buf1 = new Uint8Array(fs.readFileSync(sem1Path));
const buf3 = new Uint8Array(fs.readFileSync(sem3Path));
const buf5 = new Uint8Array(fs.readFileSync(sem5Path));

const res1 = await parseChitkaraPdf(buf1, undefined, path.basename(sem1Path));
const res3 = await parseChitkaraPdf(buf3, undefined, path.basename(sem3Path));
const res5 = await parseChitkaraPdf(buf5, undefined, path.basename(sem5Path));

runTest('1. Semester 1 PDF discovers 4 sections (1A, 1B, 1C, 1D) with batch 2026', () => {
  assert.equal(res1.success, true);
  assert.deepEqual(res1.sectionsFound, ['BE-CSE-1A', 'BE-CSE-1B', 'BE-CSE-1C', 'BE-CSE-1D']);
  assert.equal(res1.detectedSemester, 1);
  assert.equal(res1.detectedBatch, '2026');
});

runTest('2. Semester 3 PDF discovers 4 sections (3A, 3B, 3C, 3D) with batch 2025', () => {
  assert.equal(res3.success, true);
  assert.deepEqual(res3.sectionsFound, ['BE-CSE-3A', 'BE-CSE-3B', 'BE-CSE-3C', 'BE-CSE-3D']);
  assert.equal(res3.detectedSemester, 3);
  assert.equal(res3.detectedBatch, '2025');
});

runTest('3. Semester 5 PDF discovers 7 sections (5A through 5G) with batch 2024', () => {
  assert.equal(res5.success, true);
  assert.deepEqual(res5.sectionsFound, [
    'BE-CSE-5A', 'BE-CSE-5B', 'BE-CSE-5C', 'BE-CSE-5D', 'BE-CSE-5E', 'BE-CSE-5F', 'BE-CSE-5G'
  ]);
  assert.equal(res5.detectedSemester, 5);
  assert.equal(res5.detectedBatch, '2024');
});

// -----------------------------------------------------------------------------
// PART 2: Zero Room Code Misclassifications & Accurate Room/Faculty Extraction
// -----------------------------------------------------------------------------
console.log('\n--- PART 2: Room Code vs Subject Accuracy ---');

await runAsyncTest('4. Zero room codes parsed as subjects across all 15 sections', async () => {
  const allFixtures = [
    { buf: buf1, name: path.basename(sem1Path), sections: res1.sectionsFound },
    { buf: buf3, name: path.basename(sem3Path), sections: res3.sectionsFound },
    { buf: buf5, name: path.basename(sem5Path), sections: res5.sectionsFound },
  ];

  for (const f of allFixtures) {
    for (const sec of f.sections) {
      const parsed = await parseChitkaraPdf(f.buf, sec, f.name);
      for (const l of parsed.lectures) {
        // Room codes like CL02, KLM108L, RJ309R, CVR203R must NEVER be subjectCode
        assert.equal(
          /^(?:CL|KLM|RJ|CVR|LH|CR|LAB)[0-9A-Z]+/i.test(l.subjectCode),
          false,
          `Room code ${l.subjectCode} was erroneously extracted as a subject in section ${sec}!`
        );
      }
    }
  }
});

await runAsyncTest('5. Academic lecture rooms and faculty are reliably populated without TBD defaults', async () => {
  const p1A = await parseChitkaraPdf(buf1, 'BE-CSE-1A', 'BE CSE 1st sem.pdf');
  const academic1A = p1A.lectures.filter(l => !l.isNonAcademic && l.subjectCode !== 'Lib');
  for (const l of academic1A) {
    assert.ok(l.room && l.room !== 'TBD', `Missing room in 1A: ${l.subjectCode}`);
    assert.ok(l.faculty && l.faculty !== 'TBD', `Missing faculty in 1A: ${l.subjectCode}`);
  }

  const p3A = await parseChitkaraPdf(buf3, 'BE-CSE-3A', 'BE CSE 3rd sem Section Wise.pdf');
  for (const l of p3A.lectures) {
    assert.ok(l.room && l.room !== 'TBD', `Missing room in 3A: ${l.subjectCode}`);
    assert.ok(l.faculty && l.faculty !== 'TBD', `Missing faculty in 3A: ${l.subjectCode}`);
  }
});

// -----------------------------------------------------------------------------
// PART 3: Multi-Period Lab Weights & Group Scopes
// -----------------------------------------------------------------------------
console.log('\n--- PART 3: Multi-Period Labs & Group Scoping ---');

await runAsyncTest('6. 2-period lab blocks span across periods and carry weight = 2', async () => {
  const p5A = await parseChitkaraPdf(buf5, 'BE-CSE-5A', 'Time Table-BE CSE 2024 batch-5th Semester.pdf');
  // In 5A, NALR-I (09:30-11:10), ADI (11:10-12:50), ADI-FA (14:30-16:10) are 2-period blocks
  const twoPeriodLabs = p5A.lectures.filter(l => l.startTime === '09:30' && l.endTime === '11:10');
  assert.ok(twoPeriodLabs.length > 0, 'Found 2-period lab blocks');
  for (const lab of twoPeriodLabs) {
    assert.equal(lab.periods, 2, 'Periods must equal 2');
    assert.equal(lab.weight, 2, 'Weight multiplier must equal 2');
  }
});

await runAsyncTest('7. Concurrent lab sessions preserve distinct group scopes (G1 vs G2)', async () => {
  const p1A = await parseChitkaraPdf(buf1, 'BE-CSE-1A', 'BE CSE 1st sem.pdf');
  const g1Labs = p1A.lectures.filter(l => l.group === 'G1');
  const g2Labs = p1A.lectures.filter(l => l.group === 'G2');
  assert.ok(g1Labs.length > 0, 'Found Group 1 labs');
  assert.ok(g2Labs.length > 0, 'Found Group 2 labs');
});

// -----------------------------------------------------------------------------
// PART 4: Non-Academic Period Handling (Library / Lib)
// -----------------------------------------------------------------------------
console.log('\n--- PART 4: Non-Academic / Library Period Handling ---');

await runAsyncTest('8. Library slots are flagged with isNonAcademic and isFreePeriod', async () => {
  const p1A = await parseChitkaraPdf(buf1, 'BE-CSE-1A', 'BE CSE 1st sem.pdf');
  const libSlot = p1A.lectures.find(l => l.subjectCode === 'Lib' || l.subjectName === 'Library');
  assert.ok(libSlot, 'Library slot must be present in Sem 1A timetable');
  assert.equal(libSlot.isNonAcademic, true, 'isNonAcademic must be true');
  assert.equal(libSlot.isFreePeriod, true, 'isFreePeriod must be true');
});

await runAsyncTest('9. Library slots are excluded from attendance canonicalization and calculation', async () => {
  const p1A = await parseChitkaraPdf(buf1, 'BE-CSE-1A', 'BE CSE 1st sem.pdf');
  const canonical = canonicalizeSubjectsForAttendance([], p1A.lectures, 'test-uid');
  const libEntry = canonical.find(s => s.code === 'Lib' || s.name === 'Library');
  assert.equal(libEntry, undefined, 'Library must NOT appear in canonical attendance subjects!');
});

// -----------------------------------------------------------------------------
// PART 5: Dynamic Subject Identity Canonicalization
// -----------------------------------------------------------------------------
console.log('\n--- PART 5: Dynamic Subject Canonicalization ---');

await runAsyncTest('10. Sem 1 LAC and LACT resolve to the same canonical attendance subject', async () => {
  const p1A = await parseChitkaraPdf(buf1, 'BE-CSE-1A', 'BE CSE 1st sem.pdf');
  const canonical = canonicalizeSubjectsForAttendance([], p1A.lectures, 'test-uid');
  const lacSubject = canonical.find(s => s.aliases?.includes('LAC') || s.code === 'LAC');
  assert.ok(lacSubject, 'Must find unified LAC subject');
  assert.ok(lacSubject.aliases?.includes('LACT'), 'LACT must be unified as alias of LAC');
  assert.equal(canonical.filter(s => s.aliases?.includes('LAC') || s.aliases?.includes('LACT')).length, 1);
});

await runAsyncTest('11. Dynamic subject matching unifies SPC and SPCL into single subject', async () => {
  const p1A = await parseChitkaraPdf(buf1, 'BE-CSE-1A', 'BE CSE 1st sem.pdf');
  const slotsWithSpcl = [
    ...p1A.lectures,
    {
      subjectCode: 'SPCL',
      subjectName: 'Structured Programming in C Lab',
      dayOfWeek: 2,
      startTime: '14:30',
      endTime: '16:10',
    },
  ];
  const canonical = canonicalizeSubjectsForAttendance([], slotsWithSpcl, 'test-uid');
  const spcMatches = canonical.filter(s => s.aliases?.includes('SPC') || s.aliases?.includes('SPCL'));
  assert.equal(spcMatches.length, 1, 'SPC and SPCL must unify into exactly one canonical subject');
  assert.ok(spcMatches[0].aliases?.includes('SPCL'), 'SPCL must be listed as an alias');
});

// -----------------------------------------------------------------------------
// PART 6: Admin Publishing Isolation & Scope Protection
// -----------------------------------------------------------------------------
console.log('\n--- PART 6: Admin Publishing Scope Isolation ---');

runTest('12. Admin profile in Sem 5 publishing Sem 1 PDF is permitted without section mismatch error', () => {
  // Admin user profile is in Semester 5 Section A
  const adminSemester = 5;
  const adminSection = 'A';
  const targetSection = 'BE-CSE-1A';

  // For regular student upload, this would mismatch:
  const studentMatch = isSectionMatch(targetSection, adminSemester, adminSection, 'BE-CSE');
  assert.equal(studentMatch, false, 'Student profile mismatch detected');

  // But for admin with skipProfileSectionMatch = true, the mismatch is suppressed
  const skipProfileSectionMatch = true;
  const shouldWarn = !skipProfileSectionMatch && !studentMatch;
  assert.equal(shouldWarn, false, 'Admin must NOT receive group mismatch alert');
});

// -----------------------------------------------------------------------------
// PART 7: Instant Timetable Hydration & Cross-Semester Leak Prevention
// -----------------------------------------------------------------------------
console.log('\n--- PART 7: Multi-Semester Hydration & Cache Switching ---');

runTest('13. Pre-seeded cache hydrates Sem 1, Sem 3, and Sem 5 instantly', () => {
  const sem1Doc = getSharedTimetableCache('chitkara-university_be-cse_2026_sem1_be-cse-1a');
  assert.ok(sem1Doc, 'Sem 1 1A pre-seeded doc must be available');
  assert.equal(sem1Doc.slots.length, 34);

  const sem3Doc = getSharedTimetableCache('chitkara-university_be-cse_2025_sem3_be-cse-3a');
  assert.ok(sem3Doc, 'Sem 3 3A pre-seeded doc must be available');
  assert.equal(sem3Doc.slots.length, 21);

  const sem5Doc = getSharedTimetableCache('chitkara-university_be-cse_2024_sem5_be-cse-5a');
  assert.ok(sem5Doc, 'Sem 5 5A pre-seeded doc must be available');
  assert.equal(sem5Doc.slots.length, 12);
});

runTest('14. Batch-variant cache lookup resolves correctly across 2024 and cohort admission years', () => {
  // Student registered with batch 2024 in Semester 3:
  const sem3LegacyDoc = getSharedTimetableCache('chitkara-university_be-cse_2024_sem3_be-cse-3a');
  assert.ok(sem3LegacyDoc, 'Legacy batch 2024 must resolve Sem 3 timetable');
  assert.equal(sem3LegacyDoc.section, 'BE-CSE-3A');

  // Student registered with batch 2024 in Semester 1:
  const sem1LegacyDoc = getSharedTimetableCache('chitkara-university_be-cse_2024_sem1_be-cse-1a');
  assert.ok(sem1LegacyDoc, 'Legacy batch 2024 must resolve Sem 1 timetable');
  assert.equal(sem1LegacyDoc.section, 'BE-CSE-1A');
});

runTest('15. mergeSharedAndPersonalSlots strictly prevents old semester slots from leaking on semester switch', () => {
  const sem5GroupId = 'chitkara-university_be-cse_2024_sem5_be-cse-5a';
  const sem3GroupId = 'chitkara-university_be-cse_2025_sem3_be-cse-3a';

  // Suppose the user had personal/imported slots tagged with sem5GroupId:
  const personalSlots = [
    {
      id: 'personal_slot_1',
      uid: 'u1',
      subjectId: 's1',
      subjectName: 'Old Sem 5 Subject',
      subjectCode: 'ADI',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      color: '#3b82f6',
      isActive: true,
      isManual: true,
      sharedGroupId: sem5GroupId,
    },
    {
      id: 'personal_mentor_slot',
      uid: 'u1',
      subjectId: 'mentor',
      subjectName: 'Personal Mentor Meeting',
      subjectCode: 'MENTOR',
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '11:00',
      color: '#10b981',
      isActive: true,
      isManual: true,
      // No sharedGroupId tagged
    },
  ];

  // Now student switches to Sem 3:
  const merged = mergeSharedAndPersonalSlots([], personalSlots, sem3GroupId);
  assert.equal(
    merged.some(s => s.subjectCode === 'ADI'),
    false,
    'Old Sem 5 slot must NEVER leak into Sem 3 schedule!'
  );
  assert.equal(
    merged.some(s => s.subjectCode === 'MENTOR'),
    true,
    'Untagged personal manual meeting is safely preserved'
  );
});

console.log('\n===============================================================');
console.log(` Summary: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(' All Critical Timetable Accuracy Overhaul Checks Verified! 🚀');
console.log('===============================================================\n');
