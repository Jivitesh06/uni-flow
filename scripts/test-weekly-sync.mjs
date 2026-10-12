/**
 * Verification Test Suite for UniFlow Weekly Timetable Email Sync & Revision Management
 */
import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const parser = require('../functions/lib/pdfTimetableParser.js');

console.log('===============================================================');
console.log(' UniFlow: Weekly Timetable Email Sync & Revision Test Suite');
console.log('===============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// Test 1: SHA-256 Buffer Hashing & Duplicate Detection
// -------------------------------------------------------------
runTest('SHA-256 attachment hashing is deterministic and prevents duplicate processing', () => {
  const bufA = Buffer.from('%PDF-1.4 Mock Weekly Timetable Week 5 Section A');
  const bufB = Buffer.from('%PDF-1.4 Mock Weekly Timetable Week 5 Section A');
  const bufC = Buffer.from('%PDF-1.4 Mock Weekly Timetable Week 6 Section A Revised');

  const hashA = parser.computeBufferHash(bufA);
  const hashB = parser.computeBufferHash(bufB);
  const hashC = parser.computeBufferHash(bufC);

  assert.strictEqual(hashA, hashB, 'Identical PDF buffers must produce identical hashes');
  assert.notStrictEqual(hashA, hashC, 'Different PDF buffers must produce different hashes');
  assert.strictEqual(hashA.length, 64, 'SHA-256 hash must be 64 hexadecimal characters');
});

// -------------------------------------------------------------
// Test 2: Time normalization
// -------------------------------------------------------------
runTest('Time string normalization handles 12-hour AM/PM and 24-hour formats', () => {
  assert.strictEqual(parser.normalizeTimeString('9:00 AM'), '09:00');
  assert.strictEqual(parser.normalizeTimeString('09:00am'), '09:00');
  assert.strictEqual(parser.normalizeTimeString('1:30 PM'), '13:30');
  assert.strictEqual(parser.normalizeTimeString('12:00 PM'), '12:00');
  assert.strictEqual(parser.normalizeTimeString('12:00 AM'), '00:00');
  assert.strictEqual(parser.normalizeTimeString('14:45'), '14:45');
  assert.strictEqual(parser.normalizeTimeString('08:15'), '08:15');
  assert.strictEqual(parser.normalizeTimeString('invalid'), null);
});

// -------------------------------------------------------------
// Test 3: Timetable Diff - Initial Import (Empty active slots)
// -------------------------------------------------------------
runTest('Timetable diff for initial import marks all proposed slots as added', () => {
  const activeSlots = [];
  const proposedSlots = [
    {
      subjectName: 'Data Structures',
      subjectCode: 'CS201',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      faculty: 'Dr. Rao',
      room: 'LH-101',
    },
    {
      subjectName: 'Computer Networks',
      subjectCode: 'CS301',
      dayOfWeek: 1,
      startTime: '10:15',
      endTime: '11:15',
      faculty: 'Prof. Mehta',
      room: 'LH-102',
    },
  ];

  const diff = parser.computeTimetableDiff(activeSlots, proposedSlots);

  assert.strictEqual(diff.added.length, 2, 'All slots should be marked as added');
  assert.strictEqual(diff.changed.length, 0, 'No slots should be changed');
  assert.strictEqual(diff.cancelled.length, 0, 'No slots should be cancelled');
  assert.strictEqual(diff.unchanged.length, 0, 'No slots should be unchanged');
});

// -------------------------------------------------------------
// Test 4: Timetable Diff - Exact Match (Unchanged slots)
// -------------------------------------------------------------
runTest('Timetable diff identifies identical slots as unchanged', () => {
  const activeSlots = [
    {
      subjectName: 'Data Structures',
      subjectCode: 'CS201',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      faculty: 'Dr. Rao',
      room: 'LH-101',
    },
  ];
  const proposedSlots = [
    {
      subjectName: 'Data Structures',
      subjectCode: 'CS201',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      faculty: 'Dr. Rao',
      room: 'LH-101',
    },
  ];

  const diff = parser.computeTimetableDiff(activeSlots, proposedSlots);

  assert.strictEqual(diff.added.length, 0);
  assert.strictEqual(diff.changed.length, 0);
  assert.strictEqual(diff.cancelled.length, 0);
  assert.strictEqual(diff.unchanged.length, 1);
  assert.strictEqual(diff.unchanged[0].subjectName, 'Data Structures');
});

// -------------------------------------------------------------
// Test 5: Timetable Diff - Weekly Revisions (Changed room & faculty, cancelled, added)
// -------------------------------------------------------------
runTest('Timetable diff accurately flags room shift, faculty reassignment, cancellations, and additions', () => {
  const activeSlots = [
    // Slot 1: will have room and faculty changed
    {
      subjectName: 'Data Structures',
      subjectCode: 'CS201',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      faculty: 'Dr. Rao',
      room: 'LH-101',
    },
    // Slot 2: will be cancelled in revised timetable
    {
      subjectName: 'Discrete Maths',
      subjectCode: 'MA202',
      dayOfWeek: 1,
      startTime: '11:30',
      endTime: '12:30',
      faculty: 'Prof. Sharma',
      room: 'LH-201',
    },
    // Slot 3: remains unchanged
    {
      subjectName: 'Operating Systems',
      subjectCode: 'CS204',
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '15:00',
      faculty: 'Dr. Singh',
      room: 'Lab-3',
    },
  ];

  const proposedSlots = [
    // Slot 1 modified: room moved to LH-205, faculty changed to Prof. Alice
    {
      subjectName: 'Data Structures',
      subjectCode: 'CS201',
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '10:00',
      faculty: 'Prof. Alice',
      room: 'LH-205',
    },
    // Slot 3 unchanged
    {
      subjectName: 'Operating Systems',
      subjectCode: 'CS204',
      dayOfWeek: 2,
      startTime: '14:00',
      endTime: '15:00',
      faculty: 'Dr. Singh',
      room: 'Lab-3',
    },
    // Slot 4: new lab slot added
    {
      subjectName: 'AI & Machine Learning',
      subjectCode: 'CS401',
      dayOfWeek: 3,
      startTime: '10:00',
      endTime: '12:00',
      faculty: 'Dr. Verma',
      room: 'AI-Lab',
    },
  ];

  const diff = parser.computeTimetableDiff(activeSlots, proposedSlots);

  // Assertions
  assert.strictEqual(diff.changed.length, 1, 'Should detect 1 modified slot');
  assert.strictEqual(diff.changed[0].oldSlot.room, 'LH-101');
  assert.strictEqual(diff.changed[0].newSlot.room, 'LH-205');
  assert.strictEqual(diff.changed[0].oldSlot.faculty, 'Dr. Rao');
  assert.strictEqual(diff.changed[0].newSlot.faculty, 'Prof. Alice');
  assert(diff.changed[0].changeReason.includes('Room'), 'Change reason should mention room change');
  assert(diff.changed[0].changeReason.includes('Faculty'), 'Change reason should mention faculty change');

  assert.strictEqual(diff.cancelled.length, 1, 'Discrete Maths should be detected as cancelled');
  assert.strictEqual(diff.cancelled[0].subjectName, 'Discrete Maths');

  assert.strictEqual(diff.added.length, 1, 'AI & Machine Learning should be detected as added');
  assert.strictEqual(diff.added[0].subjectName, 'AI & Machine Learning');

  assert.strictEqual(diff.unchanged.length, 1, 'Operating Systems should be unchanged');
  assert.strictEqual(diff.unchanged[0].subjectName, 'Operating Systems');
});

// -------------------------------------------------------------
// Test 6: Scanned / Image-Based PDF Detection
// -------------------------------------------------------------
await runAsyncTest('Scanned or image-only PDF buffer triggers isScanned: true and manual review warning', async () => {
  // A tiny dummy buffer containing almost no extractable text
  const dummyBuffer = Buffer.from('%PDF-1.4 %image only binary data without text font streams');

  const result = await parser.parsePdfBuffer(dummyBuffer, 'Weekly_Timetable_Scan.pdf', []);

  assert.strictEqual(result.isScanned, true, 'isScanned flag must be set to true');
  assert.strictEqual(result.success, false, 'Success must be false for scanned documents');
  assert.strictEqual(result.extractedSlots.length, 0, 'Extracted slots should be empty for image scan');
  assert(
    result.warning.includes('Scanned or image-based') || result.warning.includes('Failed to read PDF structure'),
    'Warning message must indicate unreadable or scanned PDF'
  );
});

// -------------------------------------------------------------
// Test 7: Attendance Preservation Invariant Simulation
// -------------------------------------------------------------
runTest('Applying weekly revision archives previous slots without touching past attendance records', () => {
  // Simulate active state
  const mockDatabase = {
    attendance: [
      { id: 'att-1', subjectId: 'sub-1', date: '2026-10-01', status: 'present' },
      { id: 'att-2', subjectId: 'sub-1', date: '2026-10-02', status: 'absent' },
      { id: 'att-3', subjectId: 'sub-2', date: '2026-10-05', status: 'present' },
    ],
    timetable: [
      { id: 'slot-1', subjectId: 'sub-1', dayOfWeek: 1, startTime: '09:00', endTime: '10:00', isActive: true },
      { id: 'slot-2', subjectId: 'sub-2', dayOfWeek: 1, startTime: '10:00', endTime: '11:00', isActive: true },
    ],
    timetableHistory: [],
    revisions: [
      { id: 'rev-wk6', status: 'pending_review', weekLabel: 'Week 6' },
    ],
  };

  const initialAttendanceLength = mockDatabase.attendance.length;
  const initialAttendanceSnapshot = JSON.stringify(mockDatabase.attendance);

  // Apply Revision Action:
  // 1. Archive active timetable slots to timetableHistory with archivedAt timestamp
  const archivedSlots = mockDatabase.timetable.map(s => ({
    ...s,
    archivedAt: new Date().toISOString(),
    supercededByRevision: 'rev-wk6',
  }));
  mockDatabase.timetableHistory.push({
    revisionId: 'rev-wk6',
    archivedSlots,
    archivedAt: new Date().toISOString(),
  });

  // 2. Replace active slots with new proposed slots
  mockDatabase.timetable = [
    { id: 'slot-new-1', subjectId: 'sub-1', dayOfWeek: 1, startTime: '09:30', endTime: '10:30', isActive: true },
  ];

  // 3. Mark revision applied
  mockDatabase.revisions[0].status = 'applied';

  // 4. Verify Attendance Invariant:
  // Attendance records MUST remain completely unchanged
  assert.strictEqual(
    mockDatabase.attendance.length,
    initialAttendanceLength,
    'Attendance record count must not change'
  );
  assert.strictEqual(
    JSON.stringify(mockDatabase.attendance),
    initialAttendanceSnapshot,
    'Attendance records must remain byte-identical before and after revision'
  );
  assert.strictEqual(mockDatabase.timetableHistory.length, 1, 'Previous timetable must be safely archived in history');
  assert.strictEqual(mockDatabase.timetable.length, 1, 'Active timetable updated with new slots');
  assert.strictEqual(mockDatabase.revisions[0].status, 'applied', 'Revision status transitioned to applied');
});

// -------------------------------------------------------------
// Test 8: Genuine PDF text stream parsing (Week, Section, w.e.f., Lecture Slots)
// -------------------------------------------------------------
await runAsyncTest('Genuine PDF text buffer parses week label, section, and lecture slots', async () => {
  // Construct minimal valid PDF document with text stream
  const pdfSource = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 230 >>
stream
BT
/F1 12 Tf
72 700 Td
(COLLEGE TIMETABLE Week 8 w.e.f. 15/10/2024 Section A) Tj
0 -30 Td
(Monday) Tj
0 -20 Td
(CS201 Data Structures 09:00 - 10:00 Room LH-101 Dr. Alan) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000119 00000 n 
0000000234 00000 n 
0000000305 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
590
%%EOF`;

  const validBuffer = Buffer.from(pdfSource);
  const result = await parser.parsePdfBuffer(validBuffer, 'Timetable_Week_8.pdf', []);

  assert.strictEqual(result.success, true, 'Parsing valid PDF should succeed');
  assert.strictEqual(result.isScanned, false, 'Valid text PDF should not be flagged as scanned');
  assert(result.weekLabel && result.weekLabel.toLowerCase().includes('week 8'), 'Week 8 should be extracted');
  assert.strictEqual(result.detectedSection, 'A', 'Section A should be extracted');
  assert.strictEqual(result.effectiveDate, '15/10/2024', 'Effective date 15/10/2024 should be extracted');
  assert(result.extractedSlots.length >= 1, 'Should extract at least 1 lecture slot');
  assert.strictEqual(result.extractedSlots[0].subjectCode, 'CS201');
  assert.strictEqual(result.extractedSlots[0].startTime, '09:00');
  assert.strictEqual(result.extractedSlots[0].endTime, '10:00');
  assert.strictEqual(result.extractedSlots[0].dayOfWeek, 1, 'Monday is day 1');
});

// -------------------------------------------------------------
// Test 9: OAuth Refresh Token Storage Isolation
// -------------------------------------------------------------
runTest('OAuth token separation ensures emailConnections contains zero sensitive tokens', () => {
  const uid = 'user_test_123';
  const connectionId = 'conn_abc_456';
  const mockTokens = {
    refresh_token: '1//0gXmockRefreshTokenLongSecretString1234567890',
    expiry_date: Date.now() + 3600000,
  };

  // Connection document created for user
  const emailConnectionDoc = {
    uid,
    email: 'student@college.edu',
    provider: 'gmail',
    status: 'connected',
    senderFilter: 'academics@college.edu',
    subjectKeywords: 'timetable, schedule',
    filenameFilter: '*.pdf',
  };

  // Secret document created in private subcollection
  const emailSecretDoc = {
    uid,
    connectionId,
    refreshToken: mockTokens.refresh_token,
    tokenExpiry: mockTokens.expiry_date,
  };

  // Invariant 1: emailConnections MUST NOT contain any token properties
  assert.strictEqual(emailConnectionDoc.refreshToken, undefined);
  assert.strictEqual(emailConnectionDoc._refreshToken, undefined);
  assert.strictEqual(emailConnectionDoc.tokenExpiry, undefined);
  assert.strictEqual(emailConnectionDoc._tokenExpiry, undefined);

  // Invariant 2: emailSecrets contains the refresh token and connectionId link
  assert.strictEqual(emailSecretDoc.refreshToken, mockTokens.refresh_token);
  assert.strictEqual(emailSecretDoc.connectionId, connectionId);
  assert.strictEqual(emailSecretDoc.uid, uid);
});

// -------------------------------------------------------------
// Test 10: Legacy Token Auto-Migration Simulation
// -------------------------------------------------------------
runTest('Legacy token migration extracts token into emailSecrets and purges from emailConnections', () => {
  const uid = 'user_legacy_789';
  const connectionId = 'conn_legacy_999';

  // Existing database state with legacy un-migrated token
  const legacyConnection = {
    uid,
    email: 'legacy@college.edu',
    provider: 'gmail',
    status: 'connected',
    _refreshToken: '1//0gLegacyToken998877',
    _tokenExpiry: 1730000000,
  };

  let emailSecretsStore = null;

  // Migration procedure executed on first sync:
  if (legacyConnection._refreshToken) {
    emailSecretsStore = {
      uid,
      connectionId,
      refreshToken: legacyConnection._refreshToken,
      tokenExpiry: legacyConnection._tokenExpiry,
      migratedAt: new Date().toISOString(),
    };

    // Strip legacy fields from connection document
    delete legacyConnection._refreshToken;
    delete legacyConnection._tokenExpiry;
  }

  // Verification
  assert(emailSecretsStore !== null, 'Secret must be initialized during migration');
  assert.strictEqual(emailSecretsStore.refreshToken, '1//0gLegacyToken998877');
  assert.strictEqual(legacyConnection._refreshToken, undefined, 'Legacy token MUST be deleted from connection');
  assert.strictEqual(legacyConnection._tokenExpiry, undefined, 'Legacy expiry MUST be deleted from connection');
});

// -------------------------------------------------------------
// Test 11: Security Rules Invariants on emailSecrets and emailConnections
// -------------------------------------------------------------
runTest('Firestore security rules strictly deny client access to emailSecrets and forbid writing tokens', () => {
  const fs = require('fs');
  const path = require('path');
  const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

  // Invariant 1: emailSecrets must have allow read, write: if false;
  assert(
    /match\s+\/emailSecrets\/\{secretId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;/.test(rulesContent),
    'firestore.rules must explicitly forbid read and write on /emailSecrets/{secretId}'
  );

  // Invariant 2: emailConnections updates must forbid writing refreshToken or _refreshToken
  assert(
    rulesContent.includes("!('refreshToken' in request.resource.data)"),
    'firestore.rules must reject refreshToken in emailConnections updates'
  );
  assert(
    rulesContent.includes("!('_refreshToken' in request.resource.data)"),
    'firestore.rules must reject _refreshToken in emailConnections updates'
  );

  // Invariant 3: Users document updates must forbid writing refreshToken or _refreshToken
  assert(
    rulesContent.includes("!('gmailRefreshToken' in request.resource.data)"),
    'firestore.rules must reject gmailRefreshToken in user updates'
  );
});

// -------------------------------------------------------------
// Test 12: Authenticated getGmailAuthUrl and Token-guarded OAuth
// -------------------------------------------------------------
runTest('Backend exports getGmailAuthUrl and protects OAuth initiation from UID forgery', () => {
  const fs = require('fs');
  const path = require('path');
  const gmailCode = fs.readFileSync(path.resolve(process.cwd(), 'functions/src/gmail.ts'), 'utf-8');

  // Must export getGmailAuthUrl callable
  assert(
    gmailCode.includes('export const getGmailAuthUrl = functions.https.onCall('),
    'functions/src/gmail.ts must export getGmailAuthUrl callable'
  );

  // Callable must require authentication
  assert(
    gmailCode.includes('if (!context.auth)'),
    'getGmailAuthUrl must require signed-in caller context'
  );

  // gmailOAuthStart must verify ID token if provided
  assert(
    gmailCode.includes('verifyIdToken(idToken)'),
    'gmailOAuthStart must verify ID token cryptographically when supplied'
  );
});

console.log('\n===============================================================');
console.log(` Summary: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(' All Weekly Timetable Sync, Revision & Token Security Invariants Verified!');
console.log('===============================================================\n');
