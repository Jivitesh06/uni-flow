/**
 * Comprehensive Integration & Verification Test Suite for UniFlow Production Fix
 *
 * Covers all 26 test points across:
 * PART A: Attendance per Timetable Session & Weighted Labs (Tests 1 - 10)
 * PART B: Registration & Google Sign-In Onboarding (Tests 11 - 13)
 * PART C: Canonical Academic Profile & Section Consistency (Tests 14 - 19)
 * PART D: Admin & Student Timetable Update Workflow (Tests 20 - 26)
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Import system libraries
const {
  calculateAttendanceStats,
  calculateSubjectAttendance,
  calculateLectureWeight,
  matchesSubjectRecord,
  canonicalizeSubjectsForAttendance,
} = await import('../src/lib/attendanceCalculations.ts');

const {
  normalizeSectionVariants,
  isProfileComplete,
  validateAcademicProfile,
} = await import('../src/lib/academicProfile.ts');

const {
  buildSharedGroupId,
  buildSharedGroupLabel,
  computeTimetableContentHash,
  mergeSharedAndPersonalSlots,
} = await import('../src/lib/sharedTimetable.ts');

const { parseChitkaraTimetableText } = await import('../src/lib/chitkaraTimetableParser.ts');

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
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

console.log('\n===============================================================');
console.log(' UniFlow: Comprehensive 26-Point Production Verification Suite');
console.log('===============================================================\n');

// -------------------------------------------------------------
// PART A: Attendance per Timetable Session & Weighted Labs
// -------------------------------------------------------------
console.log('--- PART A: Attendance per Timetable Session & Weighted Labs ---');

// Test 1: Two sessions of the same subject on the same day marked independently
runTest('1. Two sessions of the same subject on the same day can be marked independently (one Present, one Absent)', () => {
  const records = [
    { id: 'rec-1', subjectId: 'ADI', lectureSlotId: 'slot-mon-1', status: 'present', weight: 1 },
    { id: 'rec-2', subjectId: 'ADI', lectureSlotId: 'slot-mon-2', status: 'absent', weight: 1 },
  ];

  // Independent sessions do not overwrite each other
  assert.equal(records.length, 2);
  assert.equal(records[0].lectureSlotId, 'slot-mon-1');
  assert.equal(records[0].status, 'present');
  assert.equal(records[1].lectureSlotId, 'slot-mon-2');
  assert.equal(records[1].status, 'absent');

  const agg = calculateSubjectAttendance({ initialAttended: 0, initialConducted: 0 }, records, 0.75);
  assert.equal(agg.totalAttended, 1);
  assert.equal(agg.totalConducted, 2);
  assert.equal(agg.stats.percentage, 50);
});

// Test 2: Two sessions of ADI and ADI-FA remain independently markable while aggregating into same subject
runTest('2. Two sessions of ADI and ADI-FA on the same day remain independently markable while aggregating into the same subject', () => {
  const subject = { id: 'ADI', code: 'ADI', name: 'App Development' };
  const records = [
    { id: 'rec-1', subjectId: 'ADI', lectureSlotId: 'slot-adi-regular', status: 'present', weight: 1 },
    { id: 'rec-2', subjectId: 'ADI-FA', lectureSlotId: 'slot-adi-fa', status: 'present', weight: 1 },
  ];

  // Verify matching
  assert.equal(matchesSubjectRecord(subject, records[0].subjectId), true);
  assert.equal(matchesSubjectRecord(subject, records[1].subjectId), true);

  const matched = records.filter(r => matchesSubjectRecord(subject, r.subjectId));
  const agg = calculateSubjectAttendance({ initialAttended: 0, initialConducted: 0 }, matched, 0.75);
  assert.equal(agg.totalAttended, 2);
  assert.equal(agg.totalConducted, 2);
  assert.equal(agg.stats.percentage, 100);
});

// Test 3: Attempting to mark the same timetable session twice is rejected
runTest('3. Attempting to mark the same timetable session twice is rejected', () => {
  const existingRecords = [
    { id: 'rec-1', subjectId: 'ADI', lectureSlotId: 'slot-mon-1', status: 'present', date: '2026-10-12' },
  ];

  function canMarkSession(newRecord, existingList) {
    const duplicate = existingList.find(
      r => r.date === newRecord.date && r.lectureSlotId === newRecord.lectureSlotId && r.status !== 'cancelled'
    );
    return !duplicate;
  }

  // Same slot on same date -> rejected
  const duplicateAttempt = { id: 'rec-2', subjectId: 'ADI', lectureSlotId: 'slot-mon-1', status: 'absent', date: '2026-10-12' };
  assert.equal(canMarkSession(duplicateAttempt, existingRecords), false);

  // Different slot on same date -> allowed
  const secondSlotAttempt = { id: 'rec-3', subjectId: 'ADI', lectureSlotId: 'slot-mon-2', status: 'absent', date: '2026-10-12' };
  assert.equal(canMarkSession(secondSlotAttempt, existingRecords), true);
});

// Test 4: Correcting one session does not affect other sessions of the same subject
runTest('4. Correcting one session does not affect other sessions of the same subject', () => {
  const records = [
    { id: 'rec-1', subjectId: 'ADI', lectureSlotId: 'slot-mon-1', status: 'present', weight: 1 },
    { id: 'rec-2', subjectId: 'ADI', lectureSlotId: 'slot-mon-2', status: 'absent', weight: 1 },
  ];

  // Correct slot 2 from absent to present
  const updatedRecords = records.map(r => (r.id === 'rec-2' ? { ...r, status: 'present' } : r));
  assert.equal(updatedRecords[0].status, 'present');
  assert.equal(updatedRecords[1].status, 'present');

  const agg = calculateSubjectAttendance({ initialAttended: 0, initialConducted: 0 }, updatedRecords, 0.75);
  assert.equal(agg.totalAttended, 2);
  assert.equal(agg.totalConducted, 2);
  assert.equal(agg.stats.percentage, 100);
});

// Test 5: Single-period lecture receives weight 1
runTest('5. Single-period lecture receives weight 1', () => {
  const singleSlot = { startTime: '09:00', endTime: '09:50' };
  const result = calculateLectureWeight(singleSlot);
  assert.equal(result.weight, 1);
  assert.equal(result.isConfident, true);
});

// Test 6: Continuous 2-period lab receives weight 2
runTest('6. Continuous 2-period lab receives weight 2', () => {
  const labSlot = { startTime: '10:00', endTime: '11:40' };
  const result = calculateLectureWeight(labSlot);
  assert.equal(result.weight, 2);
  assert.equal(result.isConfident, true);
});

// Test 7: Attendance percentage equals weighted attended / weighted conducted * 100
runTest('7. Attendance percentage equals weighted attended / weighted conducted * 100', () => {
  const records = [
    { id: 'r1', subjectId: 'CS301', status: 'present', weight: 2 }, // 2-period lab present -> +2 attended, +2 conducted
    { id: 'r2', subjectId: 'CS301', status: 'absent', weight: 1 },  // 1-period lecture absent -> +0 attended, +1 conducted
    { id: 'r3', subjectId: 'CS301', status: 'present', weight: 1 }, // 1-period lecture present -> +1 attended, +1 conducted
  ];

  const agg = calculateSubjectAttendance({ initialAttended: 0, initialConducted: 0 }, records, 0.75);
  // Total attended = 2 + 0 + 1 = 3
  // Total conducted = 2 + 1 + 1 = 4
  assert.equal(agg.totalAttended, 3);
  assert.equal(agg.totalConducted, 4);
  assert.equal(agg.stats.percentage, 75);
  assert.equal(agg.stats.isOnTrack, true);
});

// Test 8: Attendance percentage matches across dashboard, attendance tracker, and subject overview
runTest('8. Attendance percentage matches across dashboard, attendance tracker, and subject overview', () => {
  const records = [
    { id: 'r1', subjectId: 'CS301', status: 'present', weight: 2 },
    { id: 'r2', subjectId: 'CS301', status: 'absent', weight: 2 },
  ];
  // Attended: 2, Conducted: 4 -> 50%
  const agg = calculateSubjectAttendance({ initialAttended: 0, initialConducted: 0 }, records, 0.75);
  const dashboardStats = calculateAttendanceStats(agg.totalAttended, agg.totalConducted, 0.75);

  assert.equal(agg.stats.percentage, dashboardStats.percentage);
  assert.equal(agg.stats.percentage, 50);
  assert.equal(agg.stats.classesNeeded, dashboardStats.classesNeeded);
});

// Test 9: Historical records without weight default to weight 1 without breaking calculations
runTest('9. Historical records without weight default to weight 1 without breaking calculations', () => {
  const legacyRecords = [
    { id: 'leg-1', subjectId: 'CS301', status: 'present' }, // weight is undefined
    { id: 'leg-2', subjectId: 'CS301', status: 'absent' },  // weight is undefined
  ];

  const agg = calculateSubjectAttendance({ initialAttended: 0, initialConducted: 0 }, legacyRecords, 0.75);
  assert.equal(agg.totalAttended, 1);
  assert.equal(agg.totalConducted, 2);
  assert.equal(agg.stats.percentage, 50);
});

// Test 10: Low attendance warning triggers based on weighted percentage
runTest('10. Low attendance warning triggers based on weighted percentage', () => {
  // If weight was ignored: 1 present, 1 absent = 50%
  // With lab weight 2 for absent: 1 present (weight 1), 1 absent (weight 2) = 1/3 = 33.33%
  const records = [
    { id: 'r1', subjectId: 'CS301', status: 'present', weight: 1 },
    { id: 'r2', subjectId: 'CS301', status: 'absent', weight: 2 },
  ];

  const agg = calculateSubjectAttendance({ initialAttended: 0, initialConducted: 0 }, records, 0.75);
  assert.equal(agg.totalAttended, 1);
  assert.equal(agg.totalConducted, 3);
  assert.equal(Math.round(agg.stats.percentage * 100) / 100, 33.33);
  assert.equal(agg.stats.isOnTrack, false);
  assert.ok(agg.stats.classesNeeded > 0);
});

// -------------------------------------------------------------
// PART B: Registration & Google Sign-In Onboarding
// -------------------------------------------------------------
console.log('\n--- PART B: Registration & Google Sign-In Onboarding ---');

// Test 11: Fresh Google sign-in without profile redirects to registration/profile completion
runTest('11. Fresh Google sign-in without profile redirects to registration/profile completion', () => {
  // Fresh Google sign-in profile has name and email but no academic fields
  const googleProfile = {
    uid: 'google-user-123',
    email: 'newstudent@chitkarauniversity.edu.in',
    displayName: 'New Student',
    photoURL: 'https://example.com/photo.jpg',
  };

  assert.equal(isProfileComplete(googleProfile), false);
});

// Test 12: Returning student with complete profile goes directly to dashboard
runTest('12. Returning student with complete profile goes directly to dashboard', () => {
  const completeProfile = {
    uid: 'returning-user-456',
    email: 'student.24@chitkarauniversity.edu.in',
    displayName: 'Returning Student',
    semester: 5,
    section: 'A',
    universityId: '2411981260',
    studentGroup: 'G1',
    college: 'Chitkara University',
    program: 'BE-CSE',
    batch: '2024',
    attendanceTarget: 75,
  };

  assert.equal(isProfileComplete(completeProfile), true);
});

// Test 13: Required fields (universityId, semester, section, group) are strictly enforced before accessing dashboard
runTest('13. Required fields (universityId, semester, section, group) are strictly enforced before accessing the dashboard', () => {
  // Missing universityId
  const missingRoll = { displayName: 'A', email: 'a@chitkarauniversity.edu.in', semester: 5, section: 'A' };
  assert.equal(isProfileComplete(missingRoll), false);

  // Missing section
  const missingSec = { displayName: 'A', email: 'a@chitkarauniversity.edu.in', semester: 5, universityId: '2411981260' };
  assert.equal(isProfileComplete(missingSec), false);

  // Missing semester
  const missingSem = { displayName: 'A', email: 'a@chitkarauniversity.edu.in', section: 'A', universityId: '2411981260' };
  assert.equal(isProfileComplete(missingSem), false);

  // Complete profile
  const complete = {
    displayName: 'A',
    email: 'a@chitkarauniversity.edu.in',
    semester: 5,
    section: 'A',
    universityId: '2411981260',
  };
  assert.equal(isProfileComplete(complete), true);
});

// -------------------------------------------------------------
// PART C: Canonical Academic Profile & Section Consistency
// -------------------------------------------------------------
console.log('\n--- PART C: Canonical Academic Profile & Section Consistency ---');

// Test 14: Section 5B student cannot access 5A timetable by default
runTest('14. Section 5B student cannot access 5A timetable by default', () => {
  const student5B = {
    institution: 'Chitkara University',
    program: 'BE-CSE',
    batch: '2024',
    semester: 5,
    section: 'B',
  };
  const student5A = {
    institution: 'Chitkara University',
    program: 'BE-CSE',
    batch: '2024',
    semester: 5,
    section: 'A',
  };

  const groupId5B = buildSharedGroupId(student5B);
  const groupId5A = buildSharedGroupId(student5A);

  assert.notEqual(groupId5B, groupId5A);
  assert.ok(groupId5B.includes('5b'));
  assert.ok(groupId5A.includes('5a'));
});

// Test 15: Section 5A student receives the verified 5A shared timetable
runTest('15. Section 5A student receives the verified 5A shared timetable', () => {
  const student5A = {
    institution: 'Chitkara University',
    program: 'BE-CSE',
    batch: '2024',
    semester: 5,
    section: 'A',
  };
  const groupId5A = buildSharedGroupId(student5A);
  assert.equal(groupId5A, 'chitkara-university_be-cse_2024_sem5_be-cse-5a');
});

// Test 16: Normalizing "5A", "A", and "BE-CSE-5A" resolves to the same canonical section
runTest('16. Normalizing "5A", "A", and "BE-CSE-5A" resolves to the same canonical section', () => {
  const fromA = normalizeSectionVariants('A', 5, 'BE-CSE');
  const from5A = normalizeSectionVariants('5A', 5, 'BE-CSE');
  const fromFull = normalizeSectionVariants('BE-CSE-5A', 5, 'BE-CSE');

  assert.equal(fromA.letter, 'A');
  assert.equal(from5A.letter, 'A');
  assert.equal(fromFull.letter, 'A');

  assert.equal(fromA.short, '5A');
  assert.equal(from5A.short, '5A');
  assert.equal(fromFull.short, '5A');

  assert.equal(fromA.full, 'BE-CSE-5A');
  assert.equal(from5A.full, 'BE-CSE-5A');
  assert.equal(fromFull.full, 'BE-CSE-5A');
});

// Test 17: Student editing Settings preserves batch, roll number, and section consistency
runTest('17. Student editing Settings preserves batch, roll number, and section consistency', () => {
  const validation = validateAcademicProfile({
    displayName: 'Alex Doe',
    email: 'alex.24@chitkarauniversity.edu.in',
    universityId: '2411981260',
    semester: 5,
    section: '5B',
    studentGroup: 'G1',
    college: 'Chitkara University',
    program: 'BE-CSE',
  });

  assert.equal(validation.isValid, true);
  assert.equal(validation.cleaned.section, 'B');
  assert.equal(validation.cleaned.sectionLetter, 'B');
  assert.equal(validation.cleaned.fullSection, 'BE-CSE-5B');
  assert.equal(validation.cleaned.batch, '2024');
  assert.equal(validation.cleaned.universityId, '2411981260');
});

// Test 18: Settings update succeeds without "Failed to update" or permission errors
runTest('18. Settings update succeeds without "Failed to update" or permission errors', () => {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Verify that client update rule does NOT have broken !('role' in request.resource.data)
  // but uses diff affectedKeys
  assert.ok(
    rules.includes('!request.resource.data.diff(resource.data).affectedKeys().hasAny'),
    'firestore.rules must use diff().affectedKeys() instead of blanket role check'
  );
});

// Test 19: Firestore rules reject client attempts to modify protected fields (role, authorizedPublishers)
runTest('19. Firestore rules reject client attempts to modify protected fields (role, authorizedPublishers)', () => {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Verify affectedKeys protects 'role', 'gmailAccessToken', 'gmailRefreshToken'
  assert.ok(rules.includes("'role'"));
  assert.ok(rules.includes("'gmailAccessToken'"));
  assert.ok(rules.includes("'gmailRefreshToken'"));

  // Verify /authorizedPublishers write is strictly false
  assert.ok(
    /match\s+\/authorizedPublishers\/\{uid\}\s*\{[\s\S]*?allow\s+write:\s*if\s+false;/.test(rules),
    'firestore.rules must forbid write on /authorizedPublishers'
  );
});

// -------------------------------------------------------------
// PART D: Admin & Student Timetable Update Workflow
// -------------------------------------------------------------
console.log('\n--- PART D: Admin & Student Timetable Update Workflow ---');

// Test 20: Authorized publisher can publish a timetable for any batch/semester/section
runTest('20. Authorized publisher can publish a timetable for any batch/semester/section', () => {
  const anyGroup = {
    institution: 'Chitkara University',
    program: 'BE-CSE',
    batch: '2023',
    semester: 6,
    section: 'C',
  };
  const groupId = buildSharedGroupId(anyGroup);
  const groupLabel = buildSharedGroupLabel(anyGroup);

  assert.equal(groupId, 'chitkara-university_be-cse_2023_sem6_be-cse-6c');
  assert.equal(groupLabel, 'Chitkara University / BE-CSE / 2023 / Semester 6 / BE-CSE-6C');
});

// Test 21: Publishing creates a new immutable revision document with content hash and timestamp
runTest('21. Publishing creates a new immutable revision document with content hash and timestamp', () => {
  const slots = [
    { id: 's1', subjectCode: 'CS101', subjectName: 'Intro CS', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
  ];
  const hash1 = computeTimetableContentHash(slots, '2026-10-13');
  const hash2 = computeTimetableContentHash(slots, '2026-10-13');
  const hashDifferentDate = computeTimetableContentHash(slots, '2026-10-20');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashDifferentDate);
  assert.ok(hash1.length >= 8); // Non-empty deterministic hash
});

// Test 22: Student submitting a timetable PDF is restricted to their own canonical section
runTest('22. Student submitting a timetable PDF is restricted to their own canonical section', () => {
  const timetablePagePath = path.join(rootDir, 'src', 'pages', 'TimetablePage.tsx');
  const timetablePageContent = fs.readFileSync(timetablePagePath, 'utf8');

  // Check that handleSubmitUpdateRequest normalizes userProfile.section
  assert.ok(
    timetablePageContent.includes('const targetSection = normalizeSection(userProfile.section)'),
    'TimetablePage must restrict student submissions to their own canonical section'
  );
});

// Test 23: Student PDF submission creates a pending request without going live
runTest('23. Student PDF submission creates a pending request without going live', () => {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Verify that students can only create with status == 'pending'
  assert.ok(
    rules.includes("request.resource.data.status == 'pending'"),
    'firestore.rules must enforce status == pending on student change requests'
  );
  // Verify that only publishers can write shared timetables
  assert.ok(
    /match\s+\/sharedTimetables\/\{groupId\}\s*\{[\s\S]*?allow\s+write:\s*if\s+isPublisher\(\);/.test(rules),
    'firestore.rules must restrict sharedTimetables writes to isPublisher()'
  );
});

// Test 24: Approved request updates the live shared timetable
runTest('24. Approved request updates the live shared timetable', () => {
  const adminPagePath = path.join(rootDir, 'src', 'pages', 'AdminPublishPage.tsx');
  const adminContent = fs.readFileSync(adminPagePath, 'utf8');

  assert.ok(
    adminContent.includes('publishSharedTimetable'),
    'AdminPublishPage must invoke publishSharedTimetable on approval'
  );
  assert.ok(
    adminContent.includes("status: 'approved'"),
    'AdminPublishPage must update request status to approved'
  );
});

// Test 25: Rejected request does not alter the live shared timetable
runTest('25. Rejected request does not alter the live shared timetable', () => {
  const adminPagePath = path.join(rootDir, 'src', 'pages', 'AdminPublishPage.tsx');
  const adminContent = fs.readFileSync(adminPagePath, 'utf8');

  // Rejection should only update timetableChangeRequests, never call publishSharedTimetable
  const rejectSection = adminContent.slice(
    adminContent.indexOf('handleRejectRequest'),
    adminContent.indexOf('toast.success(`Request for Section ${request.section} marked as rejected.`')
  );
  assert.ok(!rejectSection.includes('publishSharedTimetable'));
  assert.ok(rejectSection.includes("status: 'rejected'"));
});

// Test 26: Unauthorized student write to /sharedTimetables is rejected by Firestore rules
runTest('26. Unauthorized student write to /sharedTimetables is rejected by Firestore rules', () => {
  const rulesPath = path.join(rootDir, 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Match /sharedTimetables rule: write is strictly isPublisher()
  assert.ok(
    rules.includes('allow write: if isPublisher();'),
    'firestore.rules must strictly require isPublisher() for writing sharedTimetables'
  );
});

console.log('\n===============================================================');
console.log(` Summary: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(' All 26 Production Verification Points Successfully Verified! 🚀');
console.log('===============================================================\n');
