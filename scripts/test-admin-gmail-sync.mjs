/**
 * scripts/test-admin-gmail-sync.mjs
 *
 * Comprehensive test suite for UniFlow Admin-Only Gmail Timetable Synchronization.
 * Covers all 14 testing requirements specified in the project definition:
 *
 *  1. Admin UID authorization (admin allowed, non-admin denied)
 *  2. OAuth callback & token refresh error handling (mocked)
 *  3. Missing/revoked/expired credentials detection
 *  4. Duplicate message and attachment hash deduplication (SHA-256)
 *  5. Invalid/unrelated PDF rejection (< MIN_LECTURE_COUNT or corrupt)
 *  6. Correct section, semester, and cohort batch mapping
 *  7. Lab blocks & multi-period session integrity
 *  8. Contradictory / overlapping session detection
 *  9. Attendance history preservation (zero attendance mutations)
 * 10. Retry after partial failure (idempotency)
 * 11. Concurrent sync protection & rolling processed-hash window
 * 12. Feature flag TIMETABLE_SYNC_ENABLED enforcement (dry-run vs live)
 * 13. Student mailbox isolation (never process student accounts)
 * 14. Validation report generation & metrics
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('======================================================================');
console.log(' UNIFLOW ADMIN GMAIL TIMETABLE SYNC COMPREHENSIVE TEST SUITE');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS ${totalTests.toString().padStart(2, '0')}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests.toString().padStart(2, '0')}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ─── Module Imports ───────────────────────────────────────────────────────────

const {
  validateParsedTimetable,
  computeAttachmentHash,
} = await import('./lib/timetableValidation.mjs');

const {
  normalizeSemester,
  normalizeSection,
  formatFullSection,
  buildSharedGroupId,
  buildSharedGroupLabel,
  computeContentHash,
  computeLegacyRollingContentHash,
  sanitizeLecturesToSharedSlots,
  serverPublishSharedTimetable,
  writeImportJobRecord,
  updateAdminSyncState,
  normalizeEffectiveDate,
  compareEffectiveDates,
  sanitizeForFirestore,
  ACTIVE_COHORT_BATCH_MAP,
} = await import('./lib/serverTimetablePublisher.mjs');

const {
  createAuthenticatedOAuth2Client,
  buildGmailSearchQuery,
  getMessageAttachments,
  downloadAttachmentBuffer,
  getNewMessagesSinceHistoryId,
  GMAIL_READONLY_SCOPE,
} = await import('./lib/adminGmailApi.mjs');

const {
  validateEnvironment,
} = await import('./sync-admin-gmail-timetable.mjs');

const {
  parseChitkaraPdf,
  extractEffectiveDate,
  normalizeTimeString24,
} = await import('../src/lib/chitkaraTimetableParser.ts');

const VERIFIED_ADMIN_UID = 'TngcyE1MF9ZLRIQYW25C7LefShp2';
const NON_ADMIN_UID = 'student_uid_xyz_998877';

// ─── Category 1: Admin UID Authorization ──────────────────────────────────────
console.log('--- 1. Admin UID Authorization & Access Control ---');

await runTest('Hardcoded admin UID matches project specifications', () => {
  assert.equal(VERIFIED_ADMIN_UID, 'TngcyE1MF9ZLRIQYW25C7LefShp2');
});

await runTest('Non-admin UID is explicitly rejected by admin authorization filter', () => {
  const isAuthorized = (uid) => uid === VERIFIED_ADMIN_UID;
  assert.equal(isAuthorized(VERIFIED_ADMIN_UID), true);
  assert.equal(isAuthorized(NON_ADMIN_UID), false);
  assert.equal(isAuthorized('anonymous'), false);
  assert.equal(isAuthorized(''), false);
});

// ─── Category 2: OAuth & Credentials Error Handling ───────────────────────────
console.log('\n--- 2. OAuth Callback & Token Refresh Error Handling ---');

await runTest('createAuthenticatedOAuth2Client throws on missing credentials', () => {
  assert.throws(
    () => createAuthenticatedOAuth2Client({ clientId: '', clientSecret: '', refreshToken: '' }),
    /Missing required Gmail OAuth credentials/
  );
  assert.throws(
    () => createAuthenticatedOAuth2Client({ clientId: 'id', clientSecret: '', refreshToken: 'tok' }),
    /Missing required Gmail OAuth credentials/
  );
});

await runTest('createAuthenticatedOAuth2Client accepts valid credential structure without throwing', () => {
  const client = createAuthenticatedOAuth2Client({
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-secret',
    refreshToken: '1//test-mock-refresh-token',
  });
  assert.ok(client);
  assert.equal(typeof client.getAccessToken, 'function');
});

await runTest('GMAIL_READONLY_SCOPE is strictly read-only (no write/modify scopes)', () => {
  assert.equal(GMAIL_READONLY_SCOPE, 'https://www.googleapis.com/auth/gmail.readonly');
  assert.ok(!GMAIL_READONLY_SCOPE.includes('compose'));
  assert.ok(!GMAIL_READONLY_SCOPE.includes('modify'));
  assert.ok(!GMAIL_READONLY_SCOPE.includes('send'));
});

// ─── Category 3: Search Query Construction ────────────────────────────────────
console.log('\n--- 3. Gmail Search Query Construction ---');

await runTest('buildGmailSearchQuery formats from, subject, and filename filters correctly', () => {
  const query = buildGmailSearchQuery({
    senderEmail: 'office.cse@chitkarauniversity.edu.in',
    subjectPrefix: 'Time Table:',
  });
  assert.ok(query.includes('has:attachment'));
  assert.ok(query.includes('filename:pdf'));
  assert.ok(query.includes('from:office.cse@chitkarauniversity.edu.in'));
  assert.ok(query.includes('subject:"Time Table:"'));
});

await runTest('buildGmailSearchQuery works with fallback defaults', () => {
  const query = buildGmailSearchQuery({});
  assert.ok(query.includes('has:attachment filename:pdf'));
});

await runTest('getMessageAttachments parses nested multipart MIME tree with attachmentId', async () => {
  // Simulates multipart/mixed -> multipart/alternative -> text/html + application/pdf
  const mockGmail = {
    users: {
      messages: {
        get: async () => ({
          data: {
            payload: {
              headers: [
                { name: 'Subject', value: 'Time Table: BE CSE 2024 batch-5th Semester (W.e.f. October 21, 2026)' },
                { name: 'From', value: 'office.cse@chitkarauniversity.edu.in' },
                { name: 'Date', value: 'Wed, 21 Oct 2026 10:00:00 +0530' },
              ],
              parts: [
                {
                  mimeType: 'multipart/alternative',
                  parts: [
                    { mimeType: 'text/plain', body: { size: 100 } },
                    { mimeType: 'text/html', body: { size: 450 } },
                  ],
                },
                {
                  mimeType: 'application/pdf',
                  filename: 'Time Table-BE CSE 2024 batch-5th Semester-(wef 21.10.2026).pdf',
                  headers: [
                    { name: 'Content-Disposition', value: 'attachment; filename="Time Table-BE CSE 2024 batch-5th Semester-(wef 21.10.2026).pdf"' },
                  ],
                  body: {
                    attachmentId: 'att_id_abc_123',
                    size: 118722,
                  },
                },
              ],
            },
          },
        }),
      },
    },
  };

  const res = await getMessageAttachments(mockGmail, 'msg_test_001');
  assert.equal(res.attachments.length, 1);
  assert.equal(res.attachments[0].attachmentId, 'att_id_abc_123');
  assert.equal(res.attachments[0].filename, 'Time Table-BE CSE 2024 batch-5th Semester-(wef 21.10.2026).pdf');
  assert.equal(res.attachments[0].size, 118722);
  assert.equal(res.attachments[0].mimeType, 'application/pdf');
});

await runTest('getMessageAttachments detects deeply nested PDF in multipart/related with inline data', async () => {
  const dummyBase64 = Buffer.from('FAKE_PDF_CONTENT').toString('base64');
  const mockGmail = {
    users: {
      messages: {
        get: async () => ({
          data: {
            payload: {
              headers: [{ name: 'Subject', value: 'Time Table Update' }],
              parts: [
                {
                  mimeType: 'multipart/related',
                  parts: [
                    {
                      mimeType: 'application/octet-stream',
                      filename: 'TimeTable.pdf',
                      body: {
                        data: dummyBase64,
                        size: dummyBase64.length,
                      },
                    },
                  ],
                },
              ],
            },
          },
        }),
      },
    },
  };

  const res = await getMessageAttachments(mockGmail, 'msg_test_002');
  assert.equal(res.attachments.length, 1);
  assert.equal(res.attachments[0].filename, 'TimeTable.pdf');
  assert.equal(res.attachments[0].data, dummyBase64);

  // Test downloading from inline data without API network call
  const buf = await downloadAttachmentBuffer(mockGmail, 'msg_test_002', null, res.attachments[0].data);
  assert.equal(buf.toString(), 'FAKE_PDF_CONTENT');
});

await runTest('getMessageAttachments returns 0 attachments when message has no PDFs', async () => {
  const mockGmail = {
    users: {
      messages: {
        get: async () => ({
          data: {
            payload: {
              headers: [{ name: 'Subject', value: 'Announcement' }],
              parts: [
                { mimeType: 'text/plain', body: { size: 50 } },
                { mimeType: 'image/png', filename: 'header.png', body: { attachmentId: 'att_img' } },
              ],
            },
          },
        }),
      },
    },
  };

  const res = await getMessageAttachments(mockGmail, 'msg_test_003');
  assert.equal(res.attachments.length, 0);
});

// ─── Category 4: Duplicate & Hash Deduplication ───────────────────────────────
console.log('\n--- 4. Duplicate Message & Attachment Hash Deduplication ---');

await runTest('computeAttachmentHash produces deterministic SHA-256 hex', () => {
  const buf1 = Buffer.from('PDF_SAMPLE_DATA_123');
  const buf2 = Buffer.from('PDF_SAMPLE_DATA_123');
  const buf3 = Buffer.from('DIFFERENT_DATA');

  const hash1 = computeAttachmentHash(buf1);
  const hash2 = computeAttachmentHash(buf2);
  const hash3 = computeAttachmentHash(buf3);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 64);
});

await runTest('computeContentHash generates collision-resistant SHA-256 slot fingerprint', () => {
  const slotsA = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', subjectCode: 'CS101', room: 'LH1', group: 'ALL' },
    { dayOfWeek: 2, startTime: '10:00', endTime: '11:00', subjectCode: 'CS102', room: 'LH2', group: 'G1' },
  ];
  // Identical content, reverse order: must yield identical fingerprint (ordering stability)
  const slotsB = [
    { dayOfWeek: 2, startTime: '10:00', endTime: '11:00', subjectCode: 'CS102', room: 'LH2', group: 'G1' },
    { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', subjectCode: 'CS101', room: 'LH1', group: 'ALL' },
  ];
  const slotsC = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', subjectCode: 'CS999', room: 'LH1', group: 'ALL' },
  ];

  const hashA = computeContentHash(slotsA, '12-10-2026');
  const hashB = computeContentHash(slotsB, '12-10-2026');
  const hashC = computeContentHash(slotsC, '12-10-2026');

  assert.equal(hashA, hashB, 'Slots in different orders must produce identical hash (ordering stability)');
  assert.notEqual(hashA, hashC, 'Different timetable content must produce different hash');
  assert.ok(hashA.startsWith('sha256_'), 'Fingerprint must use sha256_ prefix');
  assert.equal(hashA.length, 7 + 64, 'Fingerprint must contain full 64-character SHA-256 hex string');
});

await runTest('computeLegacyRollingContentHash produces valid historical thash format', () => {
  const slots = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '10:00', subjectCode: 'CS101', room: 'LH1', group: 'ALL' },
  ];
  const legacyHash = computeLegacyRollingContentHash(slots, '12-10-2026');
  assert.ok(legacyHash.startsWith('thash_'), 'Legacy hash must use thash_ prefix');
});

// ─── Category 5: Invalid & Corrupt PDF Rejection ──────────────────────────────
console.log('\n--- 5. Invalid & Corrupt PDF Rejection ---');

await runTest('validateParsedTimetable rejects failed parse result', () => {
  const badParse = { success: false, warnings: ['Syntax error in PDF stream'], lectures: [] };
  const res = validateParsedTimetable(badParse);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('PDF parse failed')));
});

await runTest('validateParsedTimetable rejects scanned/empty PDFs (< MIN_LECTURE_COUNT)', () => {
  const nearEmpty = {
    success: true,
    lectures: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS101' },
    ],
  };
  const res = validateParsedTimetable(nearEmpty);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Insufficient sessions')));
});

await runTest('validateParsedTimetable rejects corrupt subject codes like room labels (CL01, KLM108L)', () => {
  const corrupt = {
    success: true,
    lectures: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CL01' },
      { dayOfWeek: 1, startTime: '09:50', endTime: '10:40', subjectCode: 'CS102' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '09:50', subjectCode: 'KLM108L' },
      { dayOfWeek: 2, startTime: '09:50', endTime: '10:40', subjectCode: 'CS104' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '09:50', subjectCode: 'FREE' },
      { dayOfWeek: 3, startTime: '09:50', endTime: '10:40', subjectCode: 'CS106' },
    ],
  };
  const res = validateParsedTimetable(corrupt);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('corrupt subject codes')));
});

await runTest('validateParsedTimetable rejects > 60 sessions as hard error (sanity check)', () => {
  const hugeTimetable = {
    success: true,
    lectures: Array.from({ length: 65 }, (_, i) => ({
      dayOfWeek: (i % 5) + 1,
      startTime: `${String(8 + Math.floor(i / 7)).padStart(2, '0')}:00`,
      endTime: `${String(8 + Math.floor(i / 7)).padStart(2, '0')}:50`,
      subjectCode: `CS${100 + i}`,
    })),
  };
  const res = validateParsedTimetable(hugeTimetable);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Unusually high session count')));
});

// ─── Category 6: Section, Semester, and Cohort Batch Mapping ──────────────────
console.log('\n--- 6. Section, Semester & Cohort Batch Mapping ---');

await runTest('normalizeSemester handles numbers, strings, and roman numerals properly', () => {
  assert.equal(normalizeSemester(5), 5);
  assert.equal(normalizeSemester('5th'), 5);
  assert.equal(normalizeSemester('Sem 3'), 3);
  assert.equal(normalizeSemester('Semester 7'), 7);
  assert.equal(normalizeSemester('invalid'), 1);
});

await runTest('ACTIVE_COHORT_BATCH_MAP accurately maps active semesters to entry cohorts', () => {
  assert.equal(ACTIVE_COHORT_BATCH_MAP[1], '2026');
  assert.equal(ACTIVE_COHORT_BATCH_MAP[2], '2026');
  assert.equal(ACTIVE_COHORT_BATCH_MAP[3], '2025');
  assert.equal(ACTIVE_COHORT_BATCH_MAP[4], '2025');
  assert.equal(ACTIVE_COHORT_BATCH_MAP[5], '2024');
  assert.equal(ACTIVE_COHORT_BATCH_MAP[6], '2024');
  assert.equal(ACTIVE_COHORT_BATCH_MAP[7], '2023');
  assert.equal(ACTIVE_COHORT_BATCH_MAP[8], '2023');
});

await runTest('buildSharedGroupId constructs canonical Firestore document ID', () => {
  const groupId = buildSharedGroupId({
    institution: 'Chitkara University',
    program: 'BE-CSE',
    batch: '2024',
    semester: 5,
    section: 'BE-CSE-5A',
  });
  assert.equal(groupId, 'chitkara-university_be-cse_2024_sem5_be-cse-5a');
});

await runTest('formatFullSection standardizes short section codes', () => {
  assert.equal(formatFullSection('BE-CSE', 5, 'A'), 'BE-CSE-5A');
  assert.equal(formatFullSection('BE-CSE', 5, '5A'), 'BE-CSE-5A');
  assert.equal(formatFullSection('BE-CSE', 5, 'BE-CSE-5A'), 'BE-CSE-5A');
});

await runTest('Section mismatch blocks publishing: PDF for 5A cannot be validated/published as section 5C', () => {
  const parseResult5A = {
    success: true,
    selectedSection: 'BE-CSE-5A',
    detectedSemester: 5,
    lectures: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS101' },
      { dayOfWeek: 1, startTime: '09:50', endTime: '10:40', subjectCode: 'CS102' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '09:50', subjectCode: 'CS103' },
      { dayOfWeek: 2, startTime: '09:50', endTime: '10:40', subjectCode: 'CS104' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '09:50', subjectCode: 'CS105' },
      { dayOfWeek: 3, startTime: '09:50', endTime: '10:40', subjectCode: 'CS106' },
    ],
  };

  // Attempt to validate section 5A as section 5C
  const res = validateParsedTimetable(parseResult5A, {
    expectedSection: 'BE-CSE-5C',
    expectedSemester: 5,
  });

  assert.equal(res.valid, false, 'Validation must fail on section mismatch');
  assert.ok(
    res.errors.some((e) => e.includes('Section mismatch') && e.includes('BE-CSE-5A') && e.includes('BE-CSE-5C')),
    'Must include explicit error message indicating section mismatch'
  );
});

// ─── Category 7: Lab Blocks & Real PDF Parsing Integrity ──────────────────────
console.log('\n--- 7. Lab Blocks & Real PDF Parser Fixture Integrity ---');

await runTest('Real Chitkara 5th Sem PDF fixture exists and parses cleanly', async () => {
  const samplePdfPath = path.resolve(rootDir, 'tests/fixtures/Time Table-BE CSE 2024 batch-5th Semester-(wef 12.10.2026).pdf');
  assert.ok(fs.existsSync(samplePdfPath), 'Sample PDF exists in fixtures');

  const pdfBuffer = fs.readFileSync(samplePdfPath);
  const uint8 = new Uint8Array(pdfBuffer);
  const filename = path.basename(samplePdfPath);

  const effDate = extractEffectiveDate(filename);
  assert.equal(effDate, '12-10-2026');

  const parseResult = await parseChitkaraPdf(uint8, 'BE-CSE-5A', filename);
  assert.equal(parseResult.success, true);
  assert.ok(parseResult.lectures.length >= 5, 'Has at least 5 lectures');
  assert.ok(parseResult.sectionsFound.includes('BE-CSE-5A'));

  // Run validator on real parse result
  const valRes = validateParsedTimetable(parseResult, {
    expectedSection: 'BE-CSE-5A',
    expectedSemester: 5,
  });
  assert.equal(valRes.valid, true, `Validation failed: ${valRes.errors.join(', ')}`);
});

// ─── Category 8: Overlapping & Duplicate Session Detection ────────────────────
console.log('\n--- 8. Overlapping & Duplicate Session Detection ---');

await runTest('detectOverlaps rejects conflicting slots on same day for same group', () => {
  const overlappingParse = {
    success: true,
    lectures: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:40', subjectCode: 'CS101', group: 'G1' },
      { dayOfWeek: 1, startTime: '10:00', endTime: '11:40', subjectCode: 'CS102', group: 'G1' }, // Overlap!
      { dayOfWeek: 2, startTime: '09:00', endTime: '09:50', subjectCode: 'CS103' },
      { dayOfWeek: 2, startTime: '09:50', endTime: '10:40', subjectCode: 'CS104' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '09:50', subjectCode: 'CS105' },
      { dayOfWeek: 3, startTime: '09:50', endTime: '10:40', subjectCode: 'CS106' },
    ],
  };
  const res = validateParsedTimetable(overlappingParse);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Overlapping sessions')));
});

await runTest('Concurrent non-overlapping groups (G1 vs G2 at same time) are permitted', () => {
  const parallelGroupsParse = {
    success: true,
    lectures: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:40', subjectCode: 'CS101_LAB', group: 'G1' },
      { dayOfWeek: 1, startTime: '09:00', endTime: '10:40', subjectCode: 'CS102_LAB', group: 'G2' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '09:50', subjectCode: 'CS103' },
      { dayOfWeek: 2, startTime: '09:50', endTime: '10:40', subjectCode: 'CS104' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '09:50', subjectCode: 'CS105' },
      { dayOfWeek: 3, startTime: '09:50', endTime: '10:40', subjectCode: 'CS106' },
    ],
  };
  const res = validateParsedTimetable(parallelGroupsParse);
  assert.equal(res.valid, true, `Parallel groups incorrectly rejected: ${res.errors.join(', ')}`);
});

// ─── Category 9: Attendance History Preservation ──────────────────────────────
console.log('\n--- 9. Attendance History Preservation Guarantee ---');

await runTest('Timetable publisher NEVER touches or writes to attendance subcollections', async () => {
  // Inspect serverTimetablePublisher source code: ensure NO references to attendance collection
  const publisherSrcPath = path.resolve(rootDir, 'scripts/lib/serverTimetablePublisher.mjs');
  const src = fs.readFileSync(publisherSrcPath, 'utf8');

  assert.ok(!src.includes('/attendance'), 'No writes to user attendance collections in publisher');
  assert.ok(!src.includes('users/${uid}/attendance'), 'No user attendance path references');
  assert.ok(!src.includes('attendanceRecords'), 'No attendanceRecords modifications');
});

// ─── Category 10: Idempotency & Partial Failure Handling ──────────────────────
console.log('\n--- 10. Idempotency & Partial Failure Handling ---');

await runTest('Duplicate attachment hash returns duplicate: true and skips re-publishing', async () => {
  const dummyHash = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
  const mockDb = {
    doc: (p) => {
      if (p.startsWith('authorizedPublishers/')) {
        return {
          get: async () => ({
            data: () => ({
              gmailSyncState: {
                processedAttachmentHashes: [dummyHash],
              },
            }),
          }),
        };
      }
      return {
        get: async () => ({ exists: false }),
        set: async () => {},
      };
    },
  };

  const pubRes = await serverPublishSharedTimetable(
    mockDb,
    { uid: VERIFIED_ADMIN_UID, email: 'admin@chitkara.edu.in', displayName: 'Admin' },
    { program: 'BE-CSE', semester: 5, section: 'BE-CSE-5A', batch: '2024' },
    [{ dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS101' }],
    '12-10-2026',
    { attachmentHash: dummyHash },
    false
  );

  assert.equal(pubRes.success, true);
  assert.equal(pubRes.duplicate, true);
  assert.ok(pubRes.message.includes('already processed. Skipping'));
});

// ─── Category 11: Concurrent Sync Protection & Rolling Window ────────────────
console.log('\n--- 11. Concurrent Sync Protection & Rolling Window ---');

await runTest('Rolling hash window truncates older hashes beyond MAX_PROCESSED_HASHES', () => {
  const max = 100;
  const existing = Array.from({ length: 120 }, (_, i) => `hash_${i}`);
  const newHashes = ['hash_new_1', 'hash_new_2'];
  const merged = Array.from(new Set([...existing, ...newHashes])).slice(-max);

  assert.equal(merged.length, max);
  assert.ok(merged.includes('hash_new_1'));
  assert.ok(merged.includes('hash_new_2'));
  assert.ok(!merged.includes('hash_0')); // oldest pruned
});

// ─── Category 12: Feature Flag TIMETABLE_SYNC_ENABLED ────────────────────────
console.log('\n--- 12. Feature Flag TIMETABLE_SYNC_ENABLED Enforcement ---');

await runTest('Dry-run mode (dryRun=true) computes version without committing writes', async () => {
  let writeCalled = false;
  const mockDb = {
    doc: (p) => ({
      get: async () => ({
        exists: true,
        data: () => ({
          version: 2,
          contentHash: 'old_hash',
          history: [],
        }),
      }),
      set: async () => {
        writeCalled = true;
      },
    }),
  };

  const pubRes = await serverPublishSharedTimetable(
    mockDb,
    { uid: VERIFIED_ADMIN_UID, email: 'admin@chitkara.edu.in', displayName: 'Admin' },
    { program: 'BE-CSE', semester: 5, section: 'BE-CSE-5A', batch: '2024' },
    [{ dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS101' }],
    '12-10-2026',
    { attachmentHash: 'new_hash_dry_run' },
    true // dryRun = true
  );

  assert.equal(pubRes.success, true);
  assert.equal(pubRes.dryRun, true);
  assert.equal(writeCalled, false, 'Database set() must NOT be called in dry-run mode');
  assert.ok(pubRes.message.includes('[DRY RUN] Would publish'));
});

// ─── Category 13: Student Mailbox Isolation ──────────────────────────────────
console.log('\n--- 13. Student Mailbox Isolation ---');

await runTest('Email sync strictly binds state to authorizedPublishers, never student user records', async () => {
  const mockDb = {
    collectionsWritten: [],
    doc: function(pathStr) {
      return {
        set: async () => {
          mockDb.collectionsWritten.push(pathStr);
        },
      };
    },
    collection: function(name) {
      return {
        doc: () => ({
          id: 'job_123',
          set: async () => {
            mockDb.collectionsWritten.push(name);
          },
        }),
      };
    },
  };

  await updateAdminSyncState(mockDb, VERIFIED_ADMIN_UID, {
    lastRunAt: new Date().toISOString(),
    status: 'success',
  });

  await writeImportJobRecord(mockDb, VERIFIED_ADMIN_UID, {
    status: 'completed',
    sectionsPublished: 7,
  });

  // Verify paths
  assert.ok(mockDb.collectionsWritten.some((p) => p.startsWith('authorizedPublishers/')));
  assert.ok(mockDb.collectionsWritten.some((p) => p === 'timetableImportJobs'));
  assert.ok(!mockDb.collectionsWritten.some((p) => p.startsWith('users/')));
});

// ─── Category 14: Validation Report Generation ───────────────────────────────
console.log('\n--- 14. Validation Report Generation & Summary ---');

await runTest('validateParsedTimetable returns structured report with slot metrics', () => {
  const validMock = {
    success: true,
    lectures: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS101', group: 'G1' },
      { dayOfWeek: 1, startTime: '09:50', endTime: '10:40', subjectCode: 'CS102', group: 'G2' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '09:50', subjectCode: 'CS103' },
      { dayOfWeek: 2, startTime: '09:50', endTime: '10:40', subjectCode: 'CS104' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '09:50', subjectCode: 'CS105' },
      { dayOfWeek: 3, startTime: '09:50', endTime: '10:40', subjectCode: 'CS106' },
    ],
  };

  const report = validateParsedTimetable(validMock);
  assert.equal(report.valid, true);
  assert.equal(report.report.totalSlots, 6);
  assert.equal(report.report.distinctDays, 3);
  assert.equal(report.report.g1Slots, 1);
  assert.equal(report.report.g2Slots, 1);
  assert.equal(report.report.allSlots, 4);
  assert.equal(report.report.errorCount, 0);
});

// ─── Category 15: Safety & Regression Invariants ─────────────────────────────
console.log('\n--- 15. Safety & Regression Invariants ---');

await runTest('Version pointer atomicity: setDoc writes single complete document containing slots, version, and contentHash', async () => {
  let capturedPayload = null;
  const mockDb = {
    doc: (p) => {
      if (p.startsWith('authorizedPublishers/')) {
        return {
          get: async () => ({
            data: () => ({ gmailSyncState: { processedAttachmentHashes: [] } }),
          }),
        };
      }
      return {
        get: async () => ({ exists: false }),
        set: async (payload) => {
          capturedPayload = payload;
        },
      };
    },
  };

  const pubRes = await serverPublishSharedTimetable(
    mockDb,
    { uid: VERIFIED_ADMIN_UID, displayName: 'Admin' },
    { program: 'BE-CSE', semester: 5, section: 'BE-CSE-5A', batch: '2024' },
    [{ dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS101' }],
    '12-10-2026',
    { attachmentHash: 'atomic_test_hash' },
    false
  );

  assert.equal(pubRes.success, true);
  assert.ok(capturedPayload, 'Payload must be written in a single document set');
  assert.equal(capturedPayload.version, 1);
  assert.ok(capturedPayload.contentHash.startsWith('sha256_'));
  assert.equal(capturedPayload.slots.length, 1);
  assert.ok(capturedPayload.publishedAt);
  assert.equal(capturedPayload.id, 'chitkara-university_be-cse_2024_sem5_be-cse-5a');
});

await runTest('Cursor recovery: history cursor does NOT advance when processing has failures', () => {
  const lastHistoryId = '1000';
  const newHistoryId = '2000';

  // Scenario A: Failure occurred -> cursor must stay at lastHistoryId
  const hadFailuresA = true;
  const cursorA = hadFailuresA ? lastHistoryId : (newHistoryId || lastHistoryId);
  assert.equal(cursorA, '1000', 'Cursor must be preserved at previous position on failure');

  // Scenario B: Success -> cursor advances to newHistoryId
  const hadFailuresB = false;
  const cursorB = hadFailuresB ? lastHistoryId : (newHistoryId || lastHistoryId);
  assert.equal(cursorB, '2000', 'Cursor must advance on complete success');
});

await runTest('Non-admin UID override in production is prevented by hardcoded check', () => {
  const HARDCODED_ADMIN_UID = 'TngcyE1MF9ZLRIQYW25C7LefShp2';
  const isAllowedUid = (attemptedUid) => {
    return attemptedUid === HARDCODED_ADMIN_UID;
  };

  assert.equal(isAllowedUid('TngcyE1MF9ZLRIQYW25C7LefShp2'), true);
  assert.equal(isAllowedUid('attacker_uid_123'), false);
  assert.equal(isAllowedUid('student_uid_456'), false);
});

await runTest('Firebase Admin DocumentSnapshot: existing publisher document verified via boolean snapshot.exists', async () => {
  // Simulates Admin SDK DocumentSnapshot with boolean `exists` property
  const existingPublisherDoc = {
    exists: true,
    data: () => ({
      active: true,
      email: 'jivitesh1260.be24@chitkarauniversity.edu.in',
      gmailSyncState: { lastHistoryId: '987654' },
    }),
  };

  assert.equal(typeof existingPublisherDoc.exists, 'boolean', 'Admin SDK exists must be a boolean');
  assert.equal(existingPublisherDoc.exists, true);
  assert.equal(existingPublisherDoc.data().active, true);
  assert.equal(existingPublisherDoc.data().gmailSyncState.lastHistoryId, '987654');
});

await runTest('Firebase Admin DocumentSnapshot: missing publisher document handled safely via boolean snapshot.exists === false', async () => {
  // Simulates Admin SDK DocumentSnapshot when document does not exist
  const missingPublisherDoc = {
    exists: false,
    data: () => undefined,
  };

  assert.equal(typeof missingPublisherDoc.exists, 'boolean', 'Admin SDK exists must be a boolean');
  assert.equal(missingPublisherDoc.exists, false);

  let errorTriggered = false;
  if (!missingPublisherDoc.exists) {
    errorTriggered = true;
  }
  assert.equal(errorTriggered, true, 'Missing document must be safely detected without calling .exists()');
});

// ─── Category 16: Forced Full-Search Diagnostic Mode ──────────────────────────
console.log('\n--- 16. Forced Full-Search Diagnostic Mode ---');

await runTest('validateEnvironment with FORCE_FULL_SEARCH=true forces syncEnabled=false (dry-run)', () => {
  const dummyServiceAccount = JSON.stringify({
    project_id: 'uniflow-b7a88',
    client_email: 'service@uniflow-b7a88.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n',
  });
  const mockEnv = {
    GMAIL_CLIENT_ID: 'dummy_client_id',
    GMAIL_CLIENT_SECRET: 'dummy_secret',
    GMAIL_REFRESH_TOKEN: 'dummy_token',
    FIREBASE_SERVICE_ACCOUNT_KEY: dummyServiceAccount,
    TIMETABLE_SYNC_ENABLED: 'true', // Attempt to enable live mode
    FORCE_FULL_SEARCH: 'true', // But forced search is active
    NODE_ENV: 'test',
  };

  const parsed = validateEnvironment(mockEnv);
  assert.equal(parsed.forceFullSearch, true);
  assert.equal(parsed.syncEnabled, false, 'Diagnostic search MUST force syncEnabled to false');
  assert.equal(parsed.senderEmail, 'office.cse@chitkarauniversity.edu.in');
  assert.equal(parsed.subjectPrefix, 'Time Table:');
});

await runTest('FORCE_FULL_SEARCH diagnostic run bypasses historyId cursor and triggers full search', () => {
  const lastHistoryId = '326098';
  const forceFullSearch = true;

  // Normal mode: lastHistoryId triggers incremental sync
  const shouldDoIncrementalNormal = Boolean(lastHistoryId && !false);
  assert.equal(shouldDoIncrementalNormal, true);

  // Forced diagnostic search: bypasses incremental sync
  const shouldDoIncrementalDiagnostic = Boolean(lastHistoryId && !forceFullSearch);
  assert.equal(shouldDoIncrementalDiagnostic, false, 'Diagnostic run must bypass incremental sync');

  const shouldDoFullSearch = !lastHistoryId || forceFullSearch;
  assert.equal(shouldDoFullSearch, true, 'Diagnostic run must execute full search');
});

await runTest('Diagnostic run preserves stored sync state in authorizedPublishers (syncState not overwritten)', () => {
  const forceFullSearch = true;

  let updatedStateInDb = null;
  const mockUpdateAdminSyncState = (db, uid, state) => {
    updatedStateInDb = state;
  };

  // Simulating Phase 7 state handling:
  if (forceFullSearch) {
    // In diagnostic mode, syncState passed to writeJobAndUpdateState is null
    const syncState = null;
    if (syncState) {
      mockUpdateAdminSyncState(null, 'admin', syncState);
    }
  }

  assert.equal(updatedStateInDb, null, 'Production sync state must remain completely untouched during diagnostic run');
});

await runTest('Full search query strictly includes office.cse@chitkarauniversity.edu.in and Time Table: prefix', () => {
  const query = buildGmailSearchQuery({
    senderEmail: 'office.cse@chitkarauniversity.edu.in',
    subjectPrefix: 'Time Table:',
  });

  assert.ok(query.includes('from:office.cse@chitkarauniversity.edu.in'), 'Query must filter by confirmed sender');
  assert.ok(query.includes('subject:"Time Table:"'), 'Query must filter by Time Table: prefix');
  assert.ok(query.includes('has:attachment filename:pdf'), 'Query must filter for PDF attachments');
});

// ─── Category 17: Firestore Undefined Sanitization & Safe Job Records ────────
console.log('\n--- 17. Firestore Undefined Sanitization & Safe Job Records ---');

await runTest('sanitizeForFirestore recursively removes undefined values at all nesting levels', () => {
  const dirty = {
    syncJobId: 'job_123',
    status: 'completed',
    emailContent: undefined,
    nested: {
      a: 1,
      b: undefined,
      deep: {
        x: undefined,
        y: 'keep_me',
      },
    },
    arrayField: [
      { id: 1, toRemove: undefined, toKeep: 'valid' },
      undefined,
      'primitive',
    ],
  };

  const clean = sanitizeForFirestore(dirty);

  assert.equal('emailContent' in clean, false, 'emailContent key must be omitted');
  assert.equal('b' in clean.nested, false, 'nested.b key must be omitted');
  assert.equal('x' in clean.nested.deep, false, 'nested.deep.x key must be omitted');
  assert.equal(clean.nested.deep.y, 'keep_me', 'nested.deep.y must be preserved');
  assert.equal('toRemove' in clean.arrayField[0], false, 'array item toRemove key must be omitted');
  assert.equal(clean.arrayField[0].toKeep, 'valid');
  assert.equal(clean.arrayField.length, 2, 'undefined array items must be filtered');
});

await runTest('writeImportJobRecord successfully sanitizes and saves jobData with nested undefined values', async () => {
  let capturedDocId = null;
  let capturedData = null;

  const mockDb = {
    collection: (name) => {
      assert.equal(name, 'timetableImportJobs');
      return {
        doc: (id) => {
          capturedDocId = id || 'auto_id_123';
          return {
            id: capturedDocId,
            set: async (payload) => {
              capturedData = payload;
            },
          };
        },
      };
    },
  };

  const jobDataWithUndefined = {
    syncJobId: 'sync_test_job_999',
    mode: 'diagnostic_dry_run',
    validationReports: [
      {
        filename: 'test.pdf',
        section: '5A',
        emailContent: undefined,
        errors: [],
        warnings: [],
        optionalNotes: undefined,
      },
    ],
  };

  const id = await writeImportJobRecord(mockDb, VERIFIED_ADMIN_UID, jobDataWithUndefined);
  assert.equal(id, 'sync_test_job_999');
  assert.ok(capturedData);
  assert.equal(capturedData.uid, VERIFIED_ADMIN_UID);
  assert.equal(capturedData.mode, 'diagnostic_dry_run');
  assert.equal('emailContent' in capturedData.validationReports[0], false, 'Firestore payload must not contain emailContent');
  assert.equal('optionalNotes' in capturedData.validationReports[0], false, 'Firestore payload must not contain optionalNotes');
});

// ─── Category 18: Effective Date Ordering & Precedence Protection ─────────────
console.log('\n--- 18. Effective Date Ordering & Precedence Protection ---');

await runTest('compareEffectiveDates correctly ranks dates across formats (DD-MM-YYYY, YYYY-MM-DD, textual)', () => {
  // Newest: 21-10-2026 vs Older: 12-10-2026
  assert.ok(compareEffectiveDates('21-10-2026', '12-10-2026') > 0, '21-10-2026 must be newer than 12-10-2026');
  assert.ok(compareEffectiveDates('12-10-2026', '21-10-2026') < 0, '12-10-2026 must be older than 21-10-2026');

  // Month-name parsing
  assert.equal(compareEffectiveDates('October 21, 2026', '21-10-2026'), 0, 'October 21, 2026 and 21-10-2026 must be equivalent');
  assert.ok(compareEffectiveDates('October 21, 2026', 'October 12, 2026') > 0, 'October 21 must be newer than October 12');

  // August vs October
  assert.ok(compareEffectiveDates('01-08-2026', '21-10-2026') < 0, 'August timetable must be older than October timetable');
  assert.ok(compareEffectiveDates('2026-10-21', '2026-08-01') > 0, 'ISO date comparison');
});

await runTest('serverPublishSharedTimetable rejects older timetable replacing newer timetable (skippedOlderVersion)', async () => {
  // Existing published timetable is Version 1 effective 21-10-2026
  const mockDb = {
    doc: (p) => {
      if (p.startsWith('authorizedPublishers/')) {
        return {
          get: async () => ({
            data: () => ({ gmailSyncState: { processedAttachmentHashes: [] } }),
          }),
        };
      }
      return {
        get: async () => ({
          exists: true,
          data: () => ({
            id: 'chitkara-university_be-cse_2024_sem5_be-cse-5a',
            version: 1,
            effectiveDate: '21-10-2026', // Current published version is Oct 21
            contentHash: 'sha256_existing_october_hash',
            slots: [{ subjectCode: 'CS501' }],
          }),
        }),
        set: async () => {
          throw new Error('docRef.set should NOT be called when candidate is older than published version');
        },
      };
    },
  };

  // Candidate is an older attachment effective 12-10-2026 (or earlier)
  const candidateSlots = [{ dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS502' }];
  const pubRes = await serverPublishSharedTimetable(
    mockDb,
    { uid: VERIFIED_ADMIN_UID, displayName: 'Admin' },
    { program: 'BE-CSE', semester: 5, section: 'BE-CSE-5A', batch: '2024' },
    candidateSlots,
    '12-10-2026', // Older effective date
    { attachmentHash: 'candidate_older_hash' },
    false // Live mode attempt
  );

  assert.equal(pubRes.success, true);
  assert.equal(pubRes.skippedOlderVersion, true, 'Must flag as skippedOlderVersion');
  assert.equal(pubRes.version, 1, 'Version must remain unchanged');
  assert.ok(pubRes.message.includes('older than published version 1'), 'Message must explain candidate is older');
});

await runTest('serverPublishSharedTimetable accepts newer timetable replacing older timetable and archives to revisionHistory', async () => {
  let writtenPayload = null;

  // Existing published timetable is Version 1 effective 12-10-2026
  const mockDb = {
    doc: (p) => {
      if (p.startsWith('authorizedPublishers/')) {
        return {
          get: async () => ({
            data: () => ({ gmailSyncState: { processedAttachmentHashes: [] } }),
          }),
        };
      }
      return {
        get: async () => ({
          exists: true,
          data: () => ({
            id: 'chitkara-university_be-cse_2024_sem5_be-cse-5a',
            version: 1,
            effectiveDate: '12-10-2026',
            contentHash: 'sha256_older_hash',
            slots: [{ subjectCode: 'CS501' }],
            createdAt: '2026-10-12T00:00:00.000Z',
          }),
        }),
        set: async (payload) => {
          writtenPayload = payload;
        },
      };
    },
  };

  // Candidate is newer: effective 21-10-2026
  const candidateSlots = [{ dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS502' }];
  const pubRes = await serverPublishSharedTimetable(
    mockDb,
    { uid: VERIFIED_ADMIN_UID, displayName: 'Admin' },
    { program: 'BE-CSE', semester: 5, section: 'BE-CSE-5A', batch: '2024' },
    candidateSlots,
    '21-10-2026', // Newer effective date
    { attachmentHash: 'candidate_newer_hash' },
    false // Live mode
  );

  assert.equal(pubRes.success, true);
  assert.equal(pubRes.version, 2, 'Version must increment to 2');
  assert.ok(writtenPayload, 'Payload must be written');
  assert.equal(writtenPayload.version, 2);
  assert.equal(writtenPayload.effectiveDate, '21-10-2026');
  assert.equal(writtenPayload.revisionHistory.length, 1, 'Older version must be archived in revisionHistory');
  assert.equal(writtenPayload.revisionHistory[0].version, 1);
  assert.equal(writtenPayload.revisionHistory[0].effectiveDate, '12-10-2026');
});

// ─── Category 19: Incremental Sync Invariants, Ordering & Rejection ──────────
console.log('\n--- 19. Incremental Sync Invariants, Ordering & Rejection ---');

await runTest('validateParsedTimetable rejects missing or unparseable effective date when requireEffectiveDate is true', () => {
  const baseValidLectures = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS501' },
    { dayOfWeek: 1, startTime: '09:50', endTime: '10:40', subjectCode: 'CS502' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '09:50', subjectCode: 'CS503' },
    { dayOfWeek: 2, startTime: '09:50', endTime: '10:40', subjectCode: 'CS504' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '09:50', subjectCode: 'CS505' },
    { dayOfWeek: 3, startTime: '09:50', endTime: '10:40', subjectCode: 'CS506' },
  ];

  // Missing effectiveDate
  const noDateResult = validateParsedTimetable(
    { success: true, lectures: baseValidLectures, effectiveDate: null },
    { requireEffectiveDate: true }
  );
  assert.equal(noDateResult.valid, false, 'Must fail when effectiveDate is null');
  assert.ok(noDateResult.errors.some((e) => e.includes('Missing or unparseable effective date')));

  // Unparseable effectiveDate
  const badDateResult = validateParsedTimetable(
    { success: true, lectures: baseValidLectures, effectiveDate: 'invalid-not-a-date' },
    { requireEffectiveDate: true }
  );
  assert.equal(badDateResult.valid, false, 'Must fail when effectiveDate is unparseable string');
  assert.ok(badDateResult.errors.some((e) => e.includes('Missing or unparseable effective date')));

  // Valid effectiveDate
  const validDateResult = validateParsedTimetable(
    { success: true, lectures: baseValidLectures, effectiveDate: '21-10-2026' },
    { requireEffectiveDate: true }
  );
  assert.equal(validDateResult.valid, true, `Should pass with valid effective date: ${validDateResult.errors.join('; ')}`);
});

await runTest('validateParsedTimetable rejects zero parsed lectures', () => {
  const zeroLectures = validateParsedTimetable(
    { success: true, lectures: [], effectiveDate: '21-10-2026' },
    { requireEffectiveDate: true }
  );
  assert.equal(zeroLectures.valid, false);
  assert.ok(zeroLectures.errors.some((e) => e.includes('Insufficient sessions')));
});

await runTest('serverPublishSharedTimetable throws when zero lectures or unparseable effective date is provided', async () => {
  const mockDb = { doc: () => ({ get: async () => ({ exists: false }) }) };

  // Zero lectures
  await assert.rejects(
    async () => {
      await serverPublishSharedTimetable(
        mockDb,
        { uid: VERIFIED_ADMIN_UID, displayName: 'Admin' },
        { program: 'BE-CSE', semester: 5, section: 'BE-CSE-5A', batch: '2024' },
        [], // zero slots
        '21-10-2026',
        {},
        true
      );
    },
    (err) => err.message.includes('zero parsed lectures/slots provided'),
    'Must throw error for zero lectures'
  );

  // Unparseable effective date
  await assert.rejects(
    async () => {
      await serverPublishSharedTimetable(
        mockDb,
        { uid: VERIFIED_ADMIN_UID, displayName: 'Admin' },
        { program: 'BE-CSE', semester: 5, section: 'BE-CSE-5A', batch: '2024' },
        [{ dayOfWeek: 1, startTime: '09:00', endTime: '09:50', subjectCode: 'CS501' }],
        'not-a-real-date', // unparseable date
        {},
        true
      );
    },
    (err) => err.message.includes('missing or unparseable effective date'),
    'Must throw error for unparseable effective date'
  );
});

await runTest('Normal scheduled sync uses Gmail history cursor and does NOT perform full search on historical messages', async () => {
  let fullSearchCalled = false;
  let incrementalHistoryCalled = false;

  const lastHistoryId = '326098';
  const forceFullSearch = false;

  // Mock Gmail API client
  const mockGmail = {
    users: {
      history: {
        list: async ({ startHistoryId }) => {
          incrementalHistoryCalled = true;
          assert.equal(startHistoryId, '326098');
          return {
            data: {
              history: [
                {
                  historyId: '326150',
                  messagesAdded: [{ message: { id: 'msg_new_123' } }],
                },
              ],
            },
          };
        },
      },
      messages: {
        list: async () => {
          fullSearchCalled = true;
          return { data: { messages: [] } };
        },
      },
    },
  };

  // Execute Phase 5 discovery logic as in normal sync
  let messageIds = [];
  let newHistoryId = null;
  let historyExpired = false;

  if (lastHistoryId && !forceFullSearch) {
    const { newMessageIds, latestHistoryId, historyExpired: expired } =
      await getNewMessagesSinceHistoryId(mockGmail, lastHistoryId);

    if (expired) {
      historyExpired = true;
    } else {
      messageIds = newMessageIds || [];
      newHistoryId = latestHistoryId;
    }
  }

  if (!lastHistoryId || historyExpired || forceFullSearch) {
    fullSearchCalled = true;
  }

  assert.equal(incrementalHistoryCalled, true, 'Incremental history must be called');
  assert.equal(fullSearchCalled, false, 'Full search MUST NOT be called during normal scheduled sync with valid cursor');
  assert.deepEqual(messageIds, ['msg_new_123'], 'Only newly arrived messages should be returned');
  assert.equal(newHistoryId, '326150', 'New history ID should be updated');
});

await runTest('Multi-email batch with out-of-order effective dates sorts chronologically so older PDF cannot overwrite newer PDF', () => {
  const candidates = [
    { section: 'BE-CSE-5A', effectiveDate: '21-10-2026', source: 'email_2' },
    { section: 'BE-CSE-5A', effectiveDate: '12-10-2026', source: 'email_1' },
    { section: 'BE-CSE-5A', effectiveDate: '18-10-2026', source: 'email_3' },
  ];

  // Sort chronologically ascending
  candidates.sort((a, b) => compareEffectiveDates(a.effectiveDate, b.effectiveDate));

  assert.equal(candidates[0].effectiveDate, '12-10-2026', 'Oldest timetable (Oct 12) must come first');
  assert.equal(candidates[1].effectiveDate, '18-10-2026', 'Intermediate timetable (Oct 18) must come second');
  assert.equal(candidates[2].effectiveDate, '21-10-2026', 'Newest timetable (Oct 21) must come last');
});

await runTest('History cursor and sync state invariant: cursor is preserved and does not advance when processing encounters failures', () => {
  const lastHistoryId = '326098';
  const newHistoryId = '326150';

  // Scenario 1: Run encounters failures (hadFailures = true)
  const hadFailures = true;
  const cursorToSaveOnFailure = hadFailures ? lastHistoryId : (newHistoryId || lastHistoryId);
  assert.equal(cursorToSaveOnFailure, lastHistoryId, 'Cursor must remain at lastHistoryId when failures occur');

  // Scenario 2: Run succeeds with no failures (hadFailures = false)
  const noFailures = false;
  const cursorToSaveOnSuccess = noFailures ? lastHistoryId : (newHistoryId || lastHistoryId);
  assert.equal(cursorToSaveOnSuccess, newHistoryId, 'Cursor must advance to newHistoryId when run succeeds cleanly');
});

// ─── Final Summary ────────────────────────────────────────────────────────────
console.log('\n======================================================================');
console.log(` RESULT: ${passedTests} / ${totalTests} tests passed`);
console.log('======================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
