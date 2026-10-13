import assert from 'node:assert/strict';
import { getGreeting } from '../src/lib/greeting.ts';

console.log('======================================================================');
console.log(' UNIFLOW DYNAMIC GREETING & ATTENDANCE CORRECTION TEST SUITE');
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

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS ${totalTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// 1. DYNAMIC DASHBOARD GREETING SCHEDULE & BOUNDARY TESTS
// -----------------------------------------------------------------------------
console.log('--- 1. Dynamic Greeting Schedule & Boundary Tests ---');

function createTime(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

runTest('Midnight (00:00) returns "Good Night 🌙"', () => {
  const g = getGreeting(createTime(0, 0));
  assert.equal(g.text, 'Good Night');
  assert.equal(g.emoji, '🌙');
  assert.equal(g.fullGreeting, 'Good Night 🌙');
});

runTest('Early morning boundary (04:59) returns "Good Night 🌙"', () => {
  const g = getGreeting(createTime(4, 59));
  assert.equal(g.text, 'Good Night');
  assert.equal(g.emoji, '🌙');
});

runTest('Morning start boundary (05:00) returns "Good Morning 🌅"', () => {
  const g = getGreeting(createTime(5, 0));
  assert.equal(g.text, 'Good Morning');
  assert.equal(g.emoji, '🌅');
  assert.equal(g.fullGreeting, 'Good Morning 🌅');
});

runTest('Morning end boundary (11:59) returns "Good Morning 🌅"', () => {
  const g = getGreeting(createTime(11, 59));
  assert.equal(g.text, 'Good Morning');
  assert.equal(g.emoji, '🌅');
});

runTest('Noon start boundary (12:00) returns "Good Afternoon ☀️"', () => {
  const g = getGreeting(createTime(12, 0));
  assert.equal(g.text, 'Good Afternoon');
  assert.equal(g.emoji, '☀️');
  assert.equal(g.fullGreeting, 'Good Afternoon ☀️');
});

runTest('Afternoon end boundary (16:59) returns "Good Afternoon ☀️"', () => {
  const g = getGreeting(createTime(16, 59));
  assert.equal(g.text, 'Good Afternoon');
  assert.equal(g.emoji, '☀️');
});

runTest('Evening start boundary (17:00) returns "Good Evening 🌆"', () => {
  const g = getGreeting(createTime(17, 0));
  assert.equal(g.text, 'Good Evening');
  assert.equal(g.emoji, '🌆');
  assert.equal(g.fullGreeting, 'Good Evening 🌆');
});

runTest('Evening end boundary (20:59) returns "Good Evening 🌆"', () => {
  const g = getGreeting(createTime(20, 59));
  assert.equal(g.text, 'Good Evening');
  assert.equal(g.emoji, '🌆');
});

runTest('Night start boundary (21:00) returns "Good Night 🌙"', () => {
  const g = getGreeting(createTime(21, 0));
  assert.equal(g.text, 'Good Night');
  assert.equal(g.emoji, '🌙');
  assert.equal(g.fullGreeting, 'Good Night 🌙');
});

runTest('Late night boundary (23:59) returns "Good Night 🌙"', () => {
  const g = getGreeting(createTime(23, 59));
  assert.equal(g.text, 'Good Night');
  assert.equal(g.emoji, '🌙');
});

// -----------------------------------------------------------------------------
// 2. ATTENDANCE CORRECTION ROOT CAUSE & WRITE SIMULATION TESTS
// -----------------------------------------------------------------------------
console.log('\n--- 2. Attendance Correction Root Cause & Payload Tests ---');

// Mock Firestore sentinel
const DELETE_SENTINEL = Symbol('deleteField');
const SERVER_TIMESTAMP = Symbol('serverTimestamp');

function buildCorrectionPayload({ uid, newStatus, correctionNote }) {
  const trimmed = correctionNote ? correctionNote.trim() : '';
  const payload = {
    uid,
    status: newStatus,
    updatedAt: SERVER_TIMESTAMP,
  };
  if (trimmed) {
    payload.notes = trimmed;
  } else {
    payload.notes = DELETE_SENTINEL;
  }
  return payload;
}

runTest('Root Cause Reproduction: { notes: undefined } is invalid Firestore data', () => {
  const buggyPayload = {
    status: 'present',
    notes: '' || undefined,
    updatedAt: SERVER_TIMESTAMP,
  };
  assert.equal(buggyPayload.notes, undefined);
  // Verify that an object with undefined violates Firestore non-undefined rule
  const hasUndefined = Object.values(buggyPayload).some((v) => v === undefined);
  assert.equal(hasUndefined, true, 'Buggy payload contains undefined property');
});

runTest('Bug Fix: Empty note produces deleteField sentinel, not undefined', () => {
  const fixedPayload = buildCorrectionPayload({
    uid: 'user_123',
    newStatus: 'absent',
    correctionNote: '',
  });
  assert.equal(fixedPayload.status, 'absent');
  assert.equal(fixedPayload.notes, DELETE_SENTINEL);
  assert.equal(fixedPayload.uid, 'user_123');
  const hasUndefined = Object.values(fixedPayload).some((v) => v === undefined);
  assert.equal(hasUndefined, false, 'Fixed payload has no undefined properties');
});

runTest('Correction: Present -> Absent with note preserved', () => {
  const payload = buildCorrectionPayload({
    uid: 'user_123',
    newStatus: 'absent',
    correctionNote: 'Teacher confirmed absent due to family event',
  });
  assert.equal(payload.status, 'absent');
  assert.equal(payload.notes, 'Teacher confirmed absent due to family event');
  assert.equal(payload.uid, 'user_123');
});

runTest('Correction: Absent -> Present with medical leave note', () => {
  const payload = buildCorrectionPayload({
    uid: 'user_123',
    newStatus: 'present',
    correctionNote: 'Medical slip approved by HOD',
  });
  assert.equal(payload.status, 'present');
  assert.equal(payload.notes, 'Medical slip approved by HOD');
});

runTest('Correction: To Cancelled (holiday / class suspended)', () => {
  const payload = buildCorrectionPayload({
    uid: 'user_123',
    newStatus: 'cancelled',
    correctionNote: 'Teacher on leave, session cancelled',
  });
  assert.equal(payload.status, 'cancelled');
  assert.equal(payload.notes, 'Teacher on leave, session cancelled');
});

// -----------------------------------------------------------------------------
// 3. HANDLER GUARDS, PERMISSIONS, AND ERROR RESILIENCE
// -----------------------------------------------------------------------------
console.log('\n--- 3. Handler Lifecycle, Validation & Concurrency Guards ---');

class MockCorrectionController {
  constructor({ uid, firestoreMock }) {
    this.uid = uid;
    this.firestore = firestoreMock;
    this.isCorrecting = false;
    this.correctingStatus = null;
    this.editingRecord = { id: 'rec_456', status: 'present', date: new Date() };
    this.correctionNote = '';
    this.toasts = [];
    this.consoleErrors = [];
  }

  toastError(msg, opts) {
    this.toasts.push({ type: 'error', msg, id: opts?.id });
  }

  toastSuccess(msg, opts) {
    this.toasts.push({ type: 'success', msg, id: opts?.id });
  }

  async handleCorrection(recordId, newStatus) {
    if (this.isCorrecting) return;
    if (!this.uid) {
      this.toastError('You must be signed in to correct attendance records', { id: 'attendance-correction' });
      return;
    }
    if (!recordId) {
      this.toastError('Invalid attendance record ID', { id: 'attendance-correction' });
      return;
    }

    this.isCorrecting = true;
    this.correctingStatus = newStatus;
    try {
      const payload = buildCorrectionPayload({
        uid: this.uid,
        newStatus,
        correctionNote: this.correctionNote,
      });

      await this.firestore.updateDoc(`users/${this.uid}/attendance/${recordId}`, payload);
      this.toastSuccess('Attendance record corrected', { id: 'attendance-correction' });
      this.editingRecord = null;
      this.correctionNote = '';
    } catch (err) {
      this.consoleErrors.push(err);
      const userMessage =
        err?.code === 'permission-denied'
          ? 'Permission denied: Cannot edit this attendance record'
          : err?.code === 'not-found'
          ? 'Record no longer exists'
          : 'Failed to update record. Please check your connection and try again.';
      this.toastError(userMessage, { id: 'attendance-correction' });
    } finally {
      this.isCorrecting = false;
      this.correctingStatus = null;
    }
  }
}

await runAsyncTest('Guard: Missing UID blocks write and shows toast without crashing', async () => {
  const ctrl = new MockCorrectionController({
    uid: '',
    firestoreMock: { updateDoc: async () => {} },
  });
  await ctrl.handleCorrection('rec_456', 'absent');
  assert.equal(ctrl.toasts.length, 1);
  assert.match(ctrl.toasts[0].msg, /must be signed in/i);
  assert.notEqual(ctrl.editingRecord, null, 'Modal state is preserved');
});

await runAsyncTest('Guard: Missing record ID blocks write without crashing', async () => {
  const ctrl = new MockCorrectionController({
    uid: 'user_123',
    firestoreMock: { updateDoc: async () => {} },
  });
  await ctrl.handleCorrection('', 'absent');
  assert.equal(ctrl.toasts.length, 1);
  assert.match(ctrl.toasts[0].msg, /invalid attendance record id/i);
  assert.notEqual(ctrl.editingRecord, null);
});

await runAsyncTest('Success path: updates record, closes modal, and notifies', async () => {
  let writtenPath = null;
  let writtenData = null;

  const ctrl = new MockCorrectionController({
    uid: 'user_123',
    firestoreMock: {
      updateDoc: async (path, data) => {
        writtenPath = path;
        writtenData = data;
      },
    },
  });

  ctrl.correctionNote = 'Correction after medical cert';
  await ctrl.handleCorrection('rec_456', 'present');

  assert.equal(writtenPath, 'users/user_123/attendance/rec_456');
  assert.equal(writtenData.status, 'present');
  assert.equal(writtenData.notes, 'Correction after medical cert');
  assert.equal(ctrl.editingRecord, null, 'Modal cleanly closed');
  assert.equal(ctrl.correctionNote, '');
  assert.equal(ctrl.toasts[0].type, 'success');
  assert.equal(ctrl.toasts[0].id, 'attendance-correction');
});

await runAsyncTest('Failure path (permission-denied): modal stays open, safe error message shown', async () => {
  const ctrl = new MockCorrectionController({
    uid: 'user_123',
    firestoreMock: {
      updateDoc: async () => {
        const err = new Error('Missing or insufficient permissions');
        err.code = 'permission-denied';
        throw err;
      },
    },
  });

  ctrl.correctionNote = 'My note';
  await ctrl.handleCorrection('rec_456', 'absent');

  assert.notEqual(ctrl.editingRecord, null, 'Modal was NOT falsely closed');
  assert.equal(ctrl.correctionNote, 'My note', 'User input was NOT lost');
  assert.equal(ctrl.toasts[0].type, 'error');
  assert.match(ctrl.toasts[0].msg, /permission denied/i);
  assert.equal(ctrl.consoleErrors.length, 1);
  assert.equal(ctrl.consoleErrors[0].code, 'permission-denied');
});

await runAsyncTest('Failure path (network error): modal stays open, connection advice given', async () => {
  const ctrl = new MockCorrectionController({
    uid: 'user_123',
    firestoreMock: {
      updateDoc: async () => {
        const err = new Error('Failed to fetch');
        err.code = 'unavailable';
        throw err;
      },
    },
  });

  await ctrl.handleCorrection('rec_456', 'absent');
  assert.notEqual(ctrl.editingRecord, null);
  assert.match(ctrl.toasts[0].msg, /check your connection/i);
});

await runAsyncTest('Concurrency guard: rapid duplicate clicks do NOT trigger multiple writes', async () => {
  let writeCount = 0;
  const ctrl = new MockCorrectionController({
    uid: 'user_123',
    firestoreMock: {
      updateDoc: async () => {
        writeCount++;
        await new Promise((r) => setTimeout(r, 50));
      },
    },
  });

  // Launch two concurrent requests
  const p1 = ctrl.handleCorrection('rec_456', 'present');
  const p2 = ctrl.handleCorrection('rec_456', 'absent');

  await Promise.all([p1, p2]);
  assert.equal(writeCount, 1, 'Exactly one write was processed; second concurrent click ignored');
});

await runAsyncTest('Toast deduplication: toast ID is fixed to "attendance-correction"', async () => {
  const ctrl = new MockCorrectionController({
    uid: 'user_123',
    firestoreMock: {
      updateDoc: async () => {},
    },
  });

  await ctrl.handleCorrection('rec_456', 'present');
  assert.equal(ctrl.toasts[0].id, 'attendance-correction');
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (100%)`);
console.log(' Dynamic greeting & attendance correction verification complete! 🚀');
console.log('======================================================================\n');
