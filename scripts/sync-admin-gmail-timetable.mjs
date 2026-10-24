/**
 * scripts/sync-admin-gmail-timetable.mjs
 *
 * UniFlow Admin Gmail Timetable Sync Dispatcher
 * Runs in GitHub Actions on a scheduled interval.
 *
 * Pipeline:
 * 1. Validate environment and credentials (fail-fast on missing secrets)
 * 2. Authenticate Gmail API using stored refresh token
 * 3. Determine sync strategy (incremental via historyId, or full search)
 * 4. Search for new timetable emails matching configured sender/subject filters
 * 5. For each new email with PDF attachment:
 *    a. Download attachment into memory (never to disk)
 *    b. Compute SHA-256 hash — skip if already processed
 *    c. Parse via existing chitkaraTimetableParser.ts (pdfjs-dist/legacy)
 *    d. Validate via strict timetableValidation.mjs rules
 *    e. If TIMETABLE_SYNC_ENABLED !== 'true': record as dry-run, never write timetable
 *    f. If TIMETABLE_SYNC_ENABLED === 'true': publish all valid sections via Admin SDK
 * 6. Write job record to timetableImportJobs (admin readable via uid filter)
 * 7. Update sync cursor and state in authorizedPublishers/{adminUid}
 *
 * Security guarantees:
 * - Refresh tokens and client secrets are NEVER logged or printed.
 * - Attachment bytes are kept in-memory only; never written to disk.
 * - Email subjects and body contents are never logged.
 * - Admin UID is hardcoded as fallback; overrideable via env var only.
 * - Feature flag TIMETABLE_SYNC_ENABLED must be explicitly 'true' for live writes.
 */

import crypto from 'node:crypto';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  createAuthenticatedOAuth2Client,
  validateAndGetGmailClient,
  buildGmailSearchQuery,
  searchTimetableMessages,
  getMessageAttachments,
  downloadAttachmentBuffer,
  getNewMessagesSinceHistoryId,
  getCurrentHistoryId,
} from './lib/adminGmailApi.mjs';

import {
  validateParsedTimetable,
  computeAttachmentHash,
} from './lib/timetableValidation.mjs';

import {
  sanitizeLecturesToSharedSlots,
  serverPublishSharedTimetable,
  writeImportJobRecord,
  updateAdminSyncState,
  buildSharedGroupId,
  buildSharedGroupLabel,
  normalizeSemester,
  ACTIVE_COHORT_BATCH_MAP,
} from './lib/serverTimetablePublisher.mjs';

import {
  parseChitkaraPdf,
} from '../src/lib/chitkaraTimetableParser.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hardcoded admin UID as security fallback — env var overrides for testing only */
const HARDCODED_ADMIN_UID = 'TngcyE1MF9ZLRIQYW25C7LefShp2';

/** Maximum processed hashes to keep in Firestore state (rolling window) */
const MAX_PROCESSED_HASHES = 100;

// ─── Environment Validation ───────────────────────────────────────────────────

export function validateEnvironment(env = process.env) {
  const required = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'FIREBASE_SERVICE_ACCOUNT_KEY',
  ];

  const missing = required.filter((k) => !env[k] || env[k].trim() === '');
  if (missing.length > 0) {
    console.error(`[UniFlow Sync] FATAL: Missing required environment variables: ${missing.join(', ')}`);
    console.error('[UniFlow Sync] Ensure all secrets are configured in GitHub Actions repository settings.');
    process.exit(1);
  }

  const rawAdminUid = env.FIREBASE_ADMIN_UID?.trim();
  if (rawAdminUid && rawAdminUid !== HARDCODED_ADMIN_UID && env.NODE_ENV !== 'test') {
    console.error(`[UniFlow Sync] SECURITY ERROR: Overriding administrator UID is prohibited in production.`);
    console.error(`[UniFlow Sync] Expected verified administrator UID: ${HARDCODED_ADMIN_UID}`);
    process.exit(1);
  }
  const adminUid = HARDCODED_ADMIN_UID;

  const forceFullSearch = (env.FORCE_FULL_SEARCH || 'false').trim().toLowerCase() === 'true';
  let syncEnabled = (env.TIMETABLE_SYNC_ENABLED || 'false').trim().toLowerCase() === 'true';

  // Safety invariant: Diagnostic runs are strictly dry-run to protect production data
  if (forceFullSearch) {
    syncEnabled = false;
    console.log('[UniFlow Sync] 🔍 DIAGNOSTIC MODE: FORCE_FULL_SEARCH=true — bypassing history cursor to scan existing emails.');
    console.log('[UniFlow Sync] 🔒 DRY-RUN FORCED: Timetable writing is strictly disabled during diagnostic runs.');
  } else if (syncEnabled) {
    console.log('[UniFlow Sync] ⚡ LIVE MODE: TIMETABLE_SYNC_ENABLED=true — timetable writes ARE enabled.');
  } else {
    console.log('[UniFlow Sync] 🔒 DRY-RUN MODE: TIMETABLE_SYNC_ENABLED is not "true" — no timetable writes.');
  }

  return {
    gmailClientId: env.GMAIL_CLIENT_ID,
    gmailClientSecret: env.GMAIL_CLIENT_SECRET,
    gmailRefreshToken: env.GMAIL_REFRESH_TOKEN,
    serviceAccountKey: env.FIREBASE_SERVICE_ACCOUNT_KEY,
    adminUid,
    syncEnabled,
    forceFullSearch,
    senderEmail: env.TIMETABLE_SENDER_EMAIL?.trim() || 'office.cse@chitkarauniversity.edu.in',
    subjectPrefix: env.TIMETABLE_SUBJECT_PREFIX?.trim() || 'Time Table:',
    projectId: env.FIREBASE_PROJECT_ID?.trim() || 'uniflow-b7a88',
  };
}

// ─── Firebase Admin Initialization ───────────────────────────────────────────

async function initFirebaseAdmin(serviceAccountKey, projectId) {
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let creds;
  try {
    const str = String(serviceAccountKey).trim().replace(/^['"]|['"]$/g, '');
    try {
      creds = JSON.parse(str);
    } catch {
      const decoded = Buffer.from(str, 'base64').toString('utf8').trim();
      creds = JSON.parse(decoded);
    }
  } catch {
    console.error('[UniFlow Sync] FATAL: Cannot parse FIREBASE_SERVICE_ACCOUNT_KEY.');
    process.exit(1);
  }

  const clientEmail = creds.client_email || creds.clientEmail;
  let privateKey = creds.private_key || creds.privateKey;

  if (!clientEmail || !privateKey) {
    console.error('[UniFlow Sync] FATAL: Service account JSON missing client_email or private_key.');
    process.exit(1);
  }
  if (!clientEmail.includes('@')) {
    console.error('[UniFlow Sync] FATAL: Service account client_email is not a valid email.');
    process.exit(1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    console.error('[UniFlow Sync] FATAL: Service account private_key is missing PEM markers.');
    process.exit(1);
  }

  const resolvedProjectId = creds.project_id || projectId;
  if (resolvedProjectId !== 'uniflow-b7a88') {
    console.warn(`[UniFlow Sync] WARNING: Project ID "${resolvedProjectId}" differs from expected "uniflow-b7a88".`);
  }

  const existingApps = getApps();
  const app = existingApps.length > 0
    ? existingApps[0]
    : initializeApp({
        credential: cert({ projectId: resolvedProjectId, clientEmail, privateKey }),
        projectId: resolvedProjectId,
      });

  const db = getFirestore(app);
  // Mask email for safe logging
  const emailParts = clientEmail.split('@');
  const maskedEmail = `${emailParts[0].slice(0, 3)}***@${emailParts[1]}`;
  console.log(`[UniFlow Sync] Firebase Admin initialized for: ${maskedEmail}`);

  return { db, app };
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runAdminGmailTimetableSync() {
  const startTime = Date.now();
  const syncJobId = `sync_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  console.log('======================================================================');
  console.log(' UniFlow Admin Gmail Timetable Sync');
  console.log(`======================================================================`);
  console.log(`[UniFlow Sync] Job ID: ${syncJobId}`);
  console.log(`[UniFlow Sync] Timestamp: ${new Date().toISOString()}`);

  // ── Phase 1: Validate environment ────────────────────────────────────────────
  const env = validateEnvironment();
  const { adminUid, syncEnabled, forceFullSearch } = env;

  // ── Phase 2: Initialize Firebase Admin ──────────────────────────────────────
  const { db } = await initFirebaseAdmin(env.serviceAccountKey, env.projectId);

  // ── Phase 3: Initialize Gmail API ────────────────────────────────────────────
  let gmail;
  try {
    const auth = createAuthenticatedOAuth2Client({
      clientId: env.gmailClientId,
      clientSecret: env.gmailClientSecret,
      refreshToken: env.gmailRefreshToken,
    });
    gmail = await validateAndGetGmailClient(auth);
    console.log('[UniFlow Sync] Gmail API authenticated successfully.');
  } catch (err) {
    await writeJobAndUpdateState(db, adminUid, syncJobId, {
      status: 'requires_manual_review',
      mode: forceFullSearch ? 'diagnostic_dry_run' : syncEnabled ? 'live' : 'dry_run',
      featureFlagEnabled: syncEnabled,
      errorSummary: err.message,
      messagesExamined: 0,
      attachmentsFound: 0,
      sectionsPublished: [],
      validationReports: [],
    });
    console.error(`[UniFlow Sync] FATAL: Gmail authentication failed: ${err.message}`);
    process.exit(1);
  }

  // ── Phase 4: Read existing sync state ───────────────────────────────────────
  let lastHistoryId = null;
  let processedHashes = [];
  let existingSyncState = {};

  try {
    const publisherSnap = await db.doc(`authorizedPublishers/${adminUid}`).get();
    if (publisherSnap.exists) {
      const data = publisherSnap.data();
      if (!data || data.active === false) {
        console.error(`[UniFlow Sync] FATAL: Admin UID ${adminUid} is not an active authorized publisher.`);
        process.exit(1);
      }
      existingSyncState = data.gmailSyncState || {};
      lastHistoryId = existingSyncState.lastHistoryId || null;
      processedHashes = existingSyncState.processedAttachmentHashes || [];
      console.log(`[UniFlow Sync] Last sync: ${existingSyncState.lastSuccessAt?.toDate?.()?.toISOString() || 'never'}`);
      if (forceFullSearch) {
        console.log(`[UniFlow Sync] Stored cursor (historyId: ${lastHistoryId || 'none'}) will be bypassed for forced diagnostic search.`);
      } else if (lastHistoryId) {
        console.log(`[UniFlow Sync] Incremental sync from historyId: ${lastHistoryId}`);
      } else {
        console.log('[UniFlow Sync] No history cursor found — performing full search.');
      }
    } else {
      console.error(`[UniFlow Sync] FATAL: authorizedPublishers/${adminUid} document not found.`);
      console.error('[UniFlow Sync] Add the admin UID to Firestore authorizedPublishers via Firebase Console.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`[UniFlow Sync] FATAL: Cannot read authorizedPublishers/${adminUid}: ${err.message}`);
    process.exit(1);
  }

  // ── Phase 5: Discover new timetable messages ─────────────────────────────────
  let messageIds = [];
  let newHistoryId = null;
  let historyExpired = false;

  try {
    if (lastHistoryId && !forceFullSearch) {
      const { newMessageIds, latestHistoryId, historyExpired: expired } =
        await getNewMessagesSinceHistoryId(gmail, lastHistoryId);

      if (expired) {
        historyExpired = true;
        console.log('[UniFlow Sync] History cursor expired. Falling back to full search.');
      } else {
        messageIds = newMessageIds || [];
        newHistoryId = latestHistoryId;
        console.log(`[UniFlow Sync] Incremental: found ${messageIds.length} new message(s) since last sync.`);
      }
    }

    // Full search (initial sync, history expired, or forced full search)
    if (!lastHistoryId || historyExpired || forceFullSearch) {
      if (forceFullSearch) {
        console.log('[UniFlow Sync] [DIAGNOSTIC] Performing forced full search across existing matching messages.');
      }
      const searchQuery = buildGmailSearchQuery({
        senderEmail: env.senderEmail,
        subjectPrefix: env.subjectPrefix,
        // Search last 90 days on initial or forced search
        afterDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

      console.log(`[UniFlow Sync] Full search query: from:${env.senderEmail} subject:"${env.subjectPrefix}" has:attachment filename:pdf`);
      const messages = await searchTimetableMessages(gmail, searchQuery);
      messageIds = messages.map((m) => m.messageId);
      console.log(`[UniFlow Sync] Full search: found ${messageIds.length} candidate message(s).`);
    }

    // Save current historyId for future incremental syncs (only for standard sync)
    if (!newHistoryId && !forceFullSearch) {
      newHistoryId = await getCurrentHistoryId(gmail);
    }
  } catch (err) {
    console.error(`[UniFlow Sync] ERROR: Message discovery failed: ${err.message}`);
    await writeJobAndUpdateState(db, adminUid, syncJobId, {
      status: 'requires_manual_review',
      mode: forceFullSearch ? 'diagnostic_dry_run' : syncEnabled ? 'live' : 'dry_run',
      featureFlagEnabled: syncEnabled,
      errorSummary: `Message discovery failed: ${err.message}`,
      messagesExamined: 0,
      attachmentsFound: 0,
      sectionsPublished: [],
      validationReports: [],
    });
    process.exit(1);
  }

  // ── Phase 6: Process each message ────────────────────────────────────────────
  let messagesExamined = 0;
  let attachmentsFound = 0;
  let attachmentsProcessed = 0;
  let hadFailures = false;
  const sectionsPublished = [];
  const validationReports = [];
  const newlyProcessedHashes = [];

  for (const messageId of messageIds) {
    messagesExamined++;

    let messageInfo;
    try {
      messageInfo = await getMessageAttachments(gmail, messageId);
    } catch (err) {
      console.warn(`[UniFlow Sync] WARN: Could not read attachments for message ${messageId}: ${err.message}`);
      hadFailures = true;
      continue;
    }

    if (messageInfo.attachments.length === 0) continue;
    attachmentsFound += messageInfo.attachments.length;

    for (const attachment of messageInfo.attachments) {
      console.log(`\n[UniFlow Sync] Processing: ${attachment.filename} (${(attachment.size / 1024).toFixed(1)} KB)`);

      // ── Download attachment ─────────────────────────────────────────────────
      let pdfBuffer;
      try {
        pdfBuffer = await downloadAttachmentBuffer(
          gmail,
          messageId,
          attachment.attachmentId,
          attachment.data
        );
      } catch (err) {
        console.warn(`[UniFlow Sync] WARN: Cannot download ${attachment.filename}: ${err.message}`);
        continue;
      }

      // ── Deduplication: skip already-processed attachments ──────────────────
      const attachmentHash = computeAttachmentHash(pdfBuffer);
      if (!forceFullSearch && (processedHashes.includes(attachmentHash) || newlyProcessedHashes.includes(attachmentHash))) {
        console.log(`[UniFlow Sync] Skipping duplicate attachment (hash prefix: ${attachmentHash.slice(0, 8)}...)`);
        continue;
      }
      if (forceFullSearch && newlyProcessedHashes.includes(attachmentHash)) {
        console.log(`[UniFlow Sync] Skipping duplicate attachment within same run (hash prefix: ${attachmentHash.slice(0, 8)}...)`);
        continue;
      }
      if (forceFullSearch && processedHashes.includes(attachmentHash)) {
        console.log(`[UniFlow Sync] [DIAGNOSTIC] Evaluating attachment (hash prefix: ${attachmentHash.slice(0, 8)}...) despite prior processed state.`);
      }
      attachmentsProcessed++;

      // ── Parse PDF ──────────────────────────────────────────────────────────
      let parseResult;
      try {
        const uint8 = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
        // No targetSection — parse ALL sections for batch publishing
        parseResult = await parseChitkaraPdf(uint8, undefined, attachment.filename);
      } catch (err) {
        console.warn(`[UniFlow Sync] WARN: PDF parse error for ${attachment.filename}: ${err.message}`);
        validationReports.push({
          filename: attachment.filename,
          status: 'parse_error',
          error: err.message,
        });
        continue;
      }

      console.log(`[UniFlow Sync] Parsed ${parseResult.totalLectures} lectures across sections: ${parseResult.sectionsFound?.join(', ') || 'unknown'}`);
      console.log(`[UniFlow Sync] Detected semester: ${parseResult.detectedSemester || 'unknown'}, batch: ${parseResult.detectedBatch || 'unknown'}, effective: ${parseResult.effectiveDate || 'unknown'}`);

      const allSectionLectures = parseResult.allSectionLectures || {
        [parseResult.selectedSection || 'unknown']: parseResult.lectures,
      };

      // ── Process each section found in the PDF ─────────────────────────────
      for (const [section, lectures] of Object.entries(allSectionLectures)) {
        if (!lectures || lectures.length === 0) continue;

        // Build a per-section parse result for validation
        const sectionParseResult = {
          ...parseResult,
          lectures,
          selectedSection: section,
          totalLectures: lectures.length,
        };

        // ── Validate section ───────────────────────────────────────────────
        const validation = validateParsedTimetable(sectionParseResult, {
          expectedSection: section,
        });

        const reportEntry = {
          filename: attachment.filename,
          section,
          slotCount: lectures.length,
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          stats: validation.report,
        };
        validationReports.push(reportEntry);

        if (!validation.valid) {
          console.warn(`[UniFlow Sync] VALIDATION FAILED for ${section}:`);
          validation.errors.forEach((e) => console.warn(`  ❌ ${e}`));
          continue;
        }

        if (validation.warnings.length > 0) {
          validation.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
        }

        // ── Determine academic group parameters ───────────────────────────
        const detectedSemester = parseResult.detectedSemester;
        const detectedBatch = parseResult.detectedBatch;
        const effectiveDate = parseResult.effectiveDate || new Date().toISOString().split('T')[0];

        if (!detectedSemester) {
          console.warn(`[UniFlow Sync] Cannot determine semester for ${section} — skipping.`);
          continue;
        }

        const semNum = normalizeSemester(detectedSemester);
        const batch = detectedBatch || ACTIVE_COHORT_BATCH_MAP?.[semNum] || '2024';

        const groupParams = {
          institution: 'Chitkara University',
          program: 'BE-CSE',
          batch,
          semester: semNum,
          section,
        };

        const slots = sanitizeLecturesToSharedSlots(lectures);

        // ── Publish (or dry-run) ──────────────────────────────────────────
        try {
          const publishResult = await serverPublishSharedTimetable(
            db,
            { uid: adminUid, displayName: 'UniFlow Admin Gmail Sync' },
            groupParams,
            slots,
            effectiveDate,
            {
              sourceMessageId: messageId,
              attachmentHash,
              attachmentFilename: attachment.filename,
              syncJobId,
              skipProcessedHashCheck: forceFullSearch,
            },
            forceFullSearch ? true : !syncEnabled
          );

          reportEntry.publishResult = publishResult;

          if (publishResult.duplicate) {
            console.log(`[UniFlow Sync] ${section}: ${publishResult.message}`);
          } else if (publishResult.dryRun) {
            console.log(`[UniFlow Sync] ${section}: [DRY RUN] ${publishResult.message}`);
            sectionsPublished.push({ section, version: publishResult.version, dryRun: true });
          } else {
            console.log(`[UniFlow Sync] ✅ ${section}: ${publishResult.message}`);
            sectionsPublished.push({ section, version: publishResult.version, dryRun: false });
          }
        } catch (err) {
          console.error(`[UniFlow Sync] ERROR publishing ${section}: ${err.message}`);
          reportEntry.publishError = err.message;
          hadFailures = true;
        }
      }

      newlyProcessedHashes.push(attachmentHash);
    }
  }

  // ── Phase 7: Write job record and update sync state ──────────────────────────
  const duration = Date.now() - startTime;
  const jobStatus = hadFailures
    ? 'completed_with_errors'
    : sectionsPublished.length > 0 || validationReports.length > 0
    ? 'completed'
    : messagesExamined === 0
    ? 'completed'
    : 'completed';

  if (forceFullSearch) {
    console.log(`\n[UniFlow Sync] [DIAGNOSTIC] Preserving production sync state in authorizedPublishers/${adminUid}.`);
    console.log(`[UniFlow Sync] [DIAGNOSTIC] Stored historyId (${lastHistoryId || 'none'}) and processed hashes (${processedHashes.length}) remain unchanged.`);

    // Record job in timetableImportJobs for audit logging with syncState = null to prevent overwriting cursor/hashes
    await writeJobAndUpdateState(db, adminUid, syncJobId, {
      status: jobStatus,
      mode: 'diagnostic_dry_run',
      featureFlagEnabled: false,
      forcedFullSearch: true,
      messagesExamined,
      attachmentsFound,
      attachmentsProcessed,
      sectionsPublished,
      validationReports: validationReports.map((r) => ({
        ...r,
        // Never include email content in job records
        emailContent: undefined,
      })),
      durationMs: duration,
    }, null);
  } else {
    // Normal sync: update processed hash rolling window and cursor
    const updatedHashes = [...processedHashes, ...newlyProcessedHashes]
      .slice(-MAX_PROCESSED_HASHES);

    const cursorToSave = hadFailures ? lastHistoryId : (newHistoryId || lastHistoryId);
    if (hadFailures && newHistoryId && newHistoryId !== lastHistoryId) {
      console.warn(`[UniFlow Sync] WARN: Failures detected during execution. Preserving cursor at ${lastHistoryId} to ensure retryability.`);
    }

    const syncState = {
      lastHistoryId: cursorToSave,
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: hadFailures ? (existingSyncState.lastSuccessAt || null) : new Date().toISOString(),
      lastError: hadFailures ? 'Errors encountered during sync run' : null,
      processedAttachmentHashes: updatedHashes,
      lastJobId: syncJobId,
      totalMessagesExamined: (existingSyncState.totalMessagesExamined || 0) + messagesExamined,
    };

    await writeJobAndUpdateState(db, adminUid, syncJobId, {
      status: jobStatus,
      mode: syncEnabled ? 'live' : 'dry_run',
      featureFlagEnabled: syncEnabled,
      messagesExamined,
      attachmentsFound,
      attachmentsProcessed,
      sectionsPublished,
      validationReports: validationReports.map((r) => ({
        ...r,
        // Never include email content in job records
        emailContent: undefined,
      })),
      durationMs: duration,
    }, syncState);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n======================================================================`);
  console.log(` UniFlow Gmail Sync Summary`);
  console.log(`======================================================================`);
  console.log(` Mode:                 ${forceFullSearch ? 'DIAGNOSTIC (FORCED DRY-RUN)' : syncEnabled ? 'LIVE' : 'DRY-RUN'}`);
  console.log(` Messages examined:    ${messagesExamined}`);
  console.log(` Attachments found:    ${attachmentsFound}`);
  console.log(` Attachments processed:${attachmentsProcessed}`);
  console.log(` Sections published:   ${sectionsPublished.length} ${syncEnabled && !forceFullSearch ? '' : '(simulated / dry-run)'}`);
  console.log(` Validation reports:   ${validationReports.length}`);
  if (validationReports.length > 0) {
    console.log(`\n--- Diagnostic Validation Breakdown ---`);
    for (const rep of validationReports) {
      console.log(` Section ${rep.section} (${rep.filename}): ${rep.valid ? '✅ VALID' : '❌ INVALID'} — ${rep.slotCount} slots`);
      if (rep.errors && rep.errors.length > 0) {
        rep.errors.forEach((e) => console.log(`    ❌ Error: ${e}`));
      }
      if (rep.warnings && rep.warnings.length > 0) {
        rep.warnings.forEach((w) => console.log(`    ⚠️  Warning: ${w}`));
      }
    }
  }
  console.log(` Duration:             ${(duration / 1000).toFixed(1)}s`);
  console.log(` Job ID:               ${syncJobId}`);
  console.log(`======================================================================\n`);
}

// Auto-execute when run directly as script
if (process.argv[1]?.endsWith('sync-admin-gmail-timetable.mjs')) {
  runAdminGmailTimetableSync().catch((err) => {
    console.error(`[UniFlow Sync] Unhandled fatal error: ${err.message}`);
    process.exit(1);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeJobAndUpdateState(db, adminUid, syncJobId, jobData, syncState = null) {
  try {
    await writeImportJobRecord(db, adminUid, {
      ...jobData,
      syncJobId,
    });

    if (syncState) {
      await updateAdminSyncState(db, adminUid, syncState);
    }
  } catch (err) {
    // State write failure is non-fatal — log and continue
    console.warn(`[UniFlow Sync] WARN: Failed to write job record/state: ${err.message}`);
  }
}
