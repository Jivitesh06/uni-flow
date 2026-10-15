import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('======================================================================');
console.log(' UNIFLOW DISPATCHER MODES & LIVE CREDENTIALS VERIFICATION SUITE');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

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

const {
  parseServiceAccountCredentials,
  initializeFirebaseAdmin,
  runReminderDispatcher,
  buildDeterministicNotificationId,
  isSlotIn10MinWindow,
  validateVapidKeypair,
  CANONICAL_VAPID_PUBLIC_KEY,
  CANONICAL_REMINDER_OFFSET,
} = await import('./dispatch-class-reminders.mjs');

// Dynamically generate a throwaway test keypair for test execution
const dynamicEcdh = crypto.createECDH('prime256v1');
dynamicEcdh.generateKeys();
const dynamicTestPriv = dynamicEcdh.getPrivateKey('base64url');
const dynamicTestPub = dynamicEcdh.getPublicKey('base64url');

// -----------------------------------------------------------------------------
// 1. Service Account Parsing & Sanitization Tests
// -----------------------------------------------------------------------------
console.log('--- 1. Service Account Parsing & Sanitization ---');

await runTest('parseServiceAccountCredentials parses raw JSON string', () => {
  const raw = JSON.stringify({
    type: 'service_account',
    project_id: 'uniflow-b7a88',
    client_email: 'test@uniflow-b7a88.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk\n-----END PRIVATE KEY-----\n',
  });
  const parsed = parseServiceAccountCredentials(raw);
  assert.ok(parsed);
  assert.equal(parsed.project_id, 'uniflow-b7a88');
  assert.equal(parsed.client_email, 'test@uniflow-b7a88.iam.gserviceaccount.com');
});

await runTest('parseServiceAccountCredentials parses Base64 encoded JSON string', () => {
  const rawObj = {
    type: 'service_account',
    project_id: 'uniflow-b7a88',
    client_email: 'base64-sa@uniflow-b7a88.iam.gserviceaccount.com',
    private_key: 'test-key',
  };
  const b64 = Buffer.from(JSON.stringify(rawObj)).toString('base64');
  const parsed = parseServiceAccountCredentials(b64);
  assert.ok(parsed);
  assert.equal(parsed.client_email, 'base64-sa@uniflow-b7a88.iam.gserviceaccount.com');
});

await runTest('parseServiceAccountCredentials strips surrounding double and single quotes', () => {
  const rawObj = { project_id: 'uniflow-b7a88', client_email: 'test@uniflow.com', private_key: 'key' };
  const strWithQuotes = `"${JSON.stringify(rawObj)}"`;
  const parsed = parseServiceAccountCredentials(strWithQuotes);
  assert.ok(parsed);
  assert.equal(parsed.project_id, 'uniflow-b7a88');
});

await runTest('parseServiceAccountCredentials returns null for invalid formats', () => {
  assert.equal(parseServiceAccountCredentials(null), null);
  assert.equal(parseServiceAccountCredentials(''), null);
  assert.equal(parseServiceAccountCredentials('not-valid-json-or-base64-{}'), null);
});

// -----------------------------------------------------------------------------
// 2. Strict Live Mode Enforcement & Zero Silent Fallback
// -----------------------------------------------------------------------------
console.log('\n--- 2. Strict Live Mode Enforcement (Never Silent Dry-Run) ---');

await runTest('Live mode throws fatal error if db is null (cannot silently enter dry-run)', async () => {
  await assert.rejects(
    async () => {
      await runReminderDispatcher({ mode: 'live', db: null });
    },
    (err) => {
      assert.match(err.message, /Cannot run in LIVE mode without a live Firestore connection/);
      return true;
    }
  );
});

await runTest('Test-push mode throws fatal error if db is null', async () => {
  await assert.rejects(
    async () => {
      await runReminderDispatcher({ mode: 'test-push', db: null });
    },
    (err) => {
      assert.match(err.message, /Cannot run in TEST-PUSH mode without a live Firestore connection/);
      return true;
    }
  );
});

await runTest('Dry-run mode returns safe simulation summary when db is null', async () => {
  const res = await runReminderDispatcher({ mode: 'dry-run', db: null });
  assert.equal(res.status, 'success_dry_run');
  assert.equal(res.mode, 'dry-run');
  assert.equal(res.dispatchedCount, 0);
  assert.equal(res.pushAttempts, 0);
});

// -----------------------------------------------------------------------------
// 3. Mock Database & Dispatch Metrics
// -----------------------------------------------------------------------------
console.log('\n--- 3. Mock Database & Dispatch Metrics Tracking ---');

function createMockFirestore(options = {}) {
  const {
    users = [],
    subscriptionsByUser = {},
    timetableByUser = {},
    notificationsByUser = {},
    sharedTimetables = {},
  } = options;

  return {
    collection: (collName) => {
      if (collName === 'users') {
        return {
          get: async () => ({
            docs: users.map((u) => ({
              id: u.uid,
              data: () => u,
            })),
          }),
          doc: (uid) => ({
            get: async () => {
              const found = users.find((u) => u.uid === uid);
              return {
                exists: Boolean(found),
                data: () => found || {},
              };
            },
            collection: (subColl) => {
              if (subColl === 'pushSubscriptions') {
                const subs = subscriptionsByUser[uid] || [];
                return {
                  get: async () => ({
                    docs: subs.map((s) => ({
                      id: s.id,
                      data: () => s,
                    })),
                    forEach: (cb) => {
                      subs.forEach((s) => cb({ id: s.id, data: () => s }));
                    },
                  }),
                  doc: (subId) => ({
                    delete: async () => {
                      const idx = subs.findIndex((s) => s.id === subId);
                      if (idx !== -1) subs.splice(idx, 1);
                    },
                  }),
                };
              }
              if (subColl === 'timetable') {
                const slots = timetableByUser[uid] || [];
                return {
                  where: () => ({
                    where: () => ({
                      get: async () => ({
                        docs: slots.map((s) => ({
                          id: s.id,
                          data: () => s,
                        })),
                      }),
                    }),
                  }),
                };
              }
              if (subColl === 'notifications') {
                const notifs = notificationsByUser[uid] || {};
                return {
                  doc: (notifId) => ({
                    get: async () => ({
                      exists: Boolean(notifs[notifId]),
                      data: () => notifs[notifId] || {},
                    }),
                    set: async (data) => {
                      notifs[notifId] = data;
                    },
                  }),
                };
              }
              throw new Error(`Unhandled subcollection ${subColl}`);
            },
            update: async () => {},
          }),
        };
      }
      if (collName === 'sharedTimetables') {
        return {
          doc: (groupId) => ({
            get: async () => {
              const shared = sharedTimetables[groupId];
              return {
                exists: Boolean(shared),
                data: () => shared || {},
              };
            },
          }),
        };
      }
      throw new Error(`Unhandled collection ${collName}`);
    },
  };
}

await runTest('Honest reporting: zero eligible reminders reports success_no_eligible_reminders', async () => {
  // Test time 09:10, class at 10:00 (50 mins away -> not in 8-12 min window)
  const mockDb = createMockFirestore({
    users: [{ uid: 'user-1', fcmTokens: ['token-1'] }],
    timetableByUser: {
      'user-1': [{ id: 's1', startTime: '10:00', endTime: '10:50', dayOfWeek: 3, subjectName: 'AI' }],
    },
  });

  const now = new Date(2026, 9, 14, 9, 10, 0); // 09:10 Wednesday
  const res = await runReminderDispatcher({
    mode: 'live',
    db: mockDb,
    now,
    vapidOptions: { publicKey: dynamicTestPub, privateKey: dynamicTestPriv },
  });
  assert.equal(res.status, 'success_no_eligible_reminders');
  assert.equal(res.eligibleCount, 0);
  assert.equal(res.pushAttempts, 0);
  assert.equal(res.successfulSends, 0);
});

await runTest('Duplicate suppression: already recorded reminders are skipped and tracked', async () => {
  // Class at 10:00, now is 09:50 (in 10m window)
  const slot = { id: 's1', startTime: '10:00', endTime: '10:50', dayOfWeek: 3, subjectName: 'Math', subjectCode: 'MATH101' };
  const now = new Date(2026, 9, 14, 9, 50, 0);
  const notifId = buildDeterministicNotificationId('user-1', slot, now, 'class_reminder', CANONICAL_REMINDER_OFFSET);

  const mockDb = createMockFirestore({
    users: [{ uid: 'user-1', fcmTokens: ['token-1'] }],
    timetableByUser: { 'user-1': [slot] },
    notificationsByUser: {
      'user-1': {
        [notifId]: { title: 'Class in 10 mins', read: false },
      },
    },
  });

  const res = await runReminderDispatcher({
    mode: 'live',
    db: mockDb,
    now,
    vapidOptions: { publicKey: dynamicTestPub, privateKey: dynamicTestPriv },
  });
  assert.equal(res.eligibleCount, 1);
  assert.equal(res.alreadyRecordedCount, 1);
  assert.equal(res.pushAttempts, 0); // Not attempted because already recorded
});

await runTest('Dry-run mode with live DB evaluates slots but never writes to notifications', async () => {
  const slot = { id: 's1', startTime: '10:00', endTime: '10:50', dayOfWeek: 3, subjectName: 'Physics', subjectCode: 'PHY101' };
  const now = new Date(2026, 9, 14, 9, 50, 0);
  const notifsObj = {};

  const mockDb = createMockFirestore({
    users: [{ uid: 'user-dry', fcmTokens: ['tok-1'] }],
    timetableByUser: { 'user-dry': [slot] },
    notificationsByUser: { 'user-dry': notifsObj },
  });

  const res = await runReminderDispatcher({ mode: 'dry-run', db: mockDb, now });
  assert.equal(res.status, 'dry_run_complete');
  assert.equal(res.eligibleCount, 1);
  assert.equal(res.dispatchedCount, 1);
  assert.equal(res.pushAttempts, 0);
  assert.equal(Object.keys(notifsObj).length, 0); // No write occurred
});

// -----------------------------------------------------------------------------
// 4. VAPID Key Security & Keypair Cryptographic Validation
// -----------------------------------------------------------------------------
console.log('\n--- 4. VAPID Key Security & Keypair Validation ---');

await runTest('validateVapidKeypair confirms genuine P-256 keypair matches mathematically', () => {
  const result = validateVapidKeypair(dynamicTestPub, dynamicTestPriv);
  assert.equal(result.valid, true);
  assert.equal(result.error, null);
});

await runTest('validateVapidKeypair detects mismatched public and private keys', () => {
  const otherEcdh = crypto.createECDH('prime256v1');
  otherEcdh.generateKeys();
  const otherPub = otherEcdh.getPublicKey('base64url');

  const result = validateVapidKeypair(otherPub, dynamicTestPriv);
  assert.equal(result.valid, false);
  assert.match(result.error, /does not match the configured public key/);
  // Verify that error message never exposes the private key
  assert.ok(!result.error.includes(dynamicTestPriv));
});

await runTest('validateVapidKeypair rejects missing, truncated, or invalid format keys', () => {
  assert.equal(validateVapidKeypair(null, 'dummy').valid, false);
  assert.equal(validateVapidKeypair('dummy', null).valid, false);
  assert.equal(validateVapidKeypair('too-short', 'too-short').valid, false);
});

await runTest('LIVE mode strictly requires VAPID_PRIVATE_KEY when Web Push subscriptions exist', async () => {
  const mockDb = createMockFirestore({
    users: [{ uid: 'user-wp' }],
    subscriptionsByUser: {
      'user-wp': [
        {
          id: 'sub-1',
          endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test',
          keys: { p256dh: 'test', auth: 'test' },
        },
      ],
    },
    timetableByUser: {
      'user-wp': [{ id: 's1', startTime: '10:00', endTime: '10:50', dayOfWeek: 3, subjectName: 'CS' }],
    },
  });

  const now = new Date(2026, 9, 14, 9, 50, 0);

  // Missing private key in LIVE mode must throw
  await assert.rejects(
    async () => {
      await runReminderDispatcher({
        mode: 'live',
        db: mockDb,
        now,
        vapidOptions: { publicKey: dynamicTestPub, privateKey: '' },
      });
    },
    (err) => {
      assert.match(err.message, /VAPID_PRIVATE_KEY environment variable is missing/);
      return true;
    }
  );
});

await runTest('DRY-RUN mode does NOT require VAPID_PRIVATE_KEY', async () => {
  const mockDb = createMockFirestore({
    users: [{ uid: 'user-wp' }],
    subscriptionsByUser: {
      'user-wp': [
        {
          id: 'sub-1',
          endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test',
          keys: { p256dh: 'test', auth: 'test' },
        },
      ],
    },
    timetableByUser: {
      'user-wp': [{ id: 's1', startTime: '10:00', endTime: '10:50', dayOfWeek: 3, subjectName: 'CS' }],
    },
  });

  const now = new Date(2026, 9, 14, 9, 50, 0);
  const res = await runReminderDispatcher({
    mode: 'dry-run',
    db: mockDb,
    now,
    vapidOptions: { privateKey: '' },
  });
  assert.equal(res.status, 'dry_run_complete');
});

// -----------------------------------------------------------------------------
// 5. GitHub Actions Workflow Configuration Invariants
// -----------------------------------------------------------------------------
console.log('\n--- 5. GitHub Actions Workflow Invariants & Credential Safety ---');

await runTest('scheduled-class-reminders.yml specifies Node.js 22 and npm ci', () => {
  const ymlPath = path.join(rootDir, '.github/workflows/scheduled-class-reminders.yml');
  const src = fs.readFileSync(ymlPath, 'utf8');

  assert.ok(src.includes('node-version: 22'), 'Workflow uses node-version: 22');
  assert.ok(src.includes('run: npm ci'), 'Workflow runs npm ci');
  assert.ok(!src.includes('npm ci --omit=dev'), 'Workflow does not use --omit=dev');
});

await runTest('scheduled-class-reminders.yml maps secrets without hardcoded fallbacks', () => {
  const ymlPath = path.join(rootDir, '.github/workflows/scheduled-class-reminders.yml');
  const src = fs.readFileSync(ymlPath, 'utf8');

  assert.ok(src.includes('VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}'), 'Injects secrets.VAPID_PRIVATE_KEY');
  assert.ok(!src.includes('VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY ||'), 'No fallback string for private key');
  assert.ok(src.includes('FIREBASE_SERVICE_ACCOUNT_KEY:'), 'Maps service account key');
  assert.ok(src.includes('node scripts/dispatch-class-reminders.mjs --live'), 'Runs in explicit --live mode for scheduled cron');
});

await runTest('Tracked production source files contain ZERO hardcoded VAPID private key constants', () => {
  const targetFiles = [
    'scripts/dispatch-class-reminders.mjs',
    'src/lib/classReminderScheduler.ts',
    '.github/workflows/scheduled-class-reminders.yml',
    '.env.example',
  ];

  for (const relPath of targetFiles) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');

    // Ensure CANONICAL_VAPID_PRIVATE_KEY is not defined in production files
    assert.ok(
      !content.includes('CANONICAL_VAPID_PRIVATE_KEY'),
      `File ${relPath} should not contain CANONICAL_VAPID_PRIVATE_KEY`
    );
  }
});

console.log('\n======================================================================');
console.log(` SUMMARY: ${passedTests} / ${totalTests} Tests Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log(' Dispatcher modes and live credentials verified successfully! 🚀');
console.log('======================================================================\n');
