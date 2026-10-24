/**
 * scripts/lib/serverTimetablePublisher.mjs
 *
 * Server-side timetable publisher for the admin Gmail sync pipeline.
 * Wraps the existing sharedTimetable publish logic for use via Firebase Admin SDK.
 *
 * This module is used exclusively by GitHub Actions scripts (Admin SDK context).
 * It NEVER runs in the browser.
 *
 * Atomicity guarantees:
 * - Content hash prevents duplicate publishes of the same timetable.
 * - setDoc with merge:true is used — no partial writes.
 * - Version pointer and slot data are written in a single setDoc call.
 * - Audit record is written after successful publish only.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_CORRUPT_SUBJECT_CODES = new Set([
  'CL01', 'CL02', 'CL03', 'CL04', 'CL05',
  'KLM108L', 'LEC', 'TBD', 'FREE', 'BREAK',
]);

export const ACTIVE_COHORT_BATCH_MAP = {
  1: '2026', 2: '2026',
  3: '2025', 4: '2025',
  5: '2024', 6: '2024',
  7: '2023', 8: '2023',
};

// ─── Group ID Builders (mirrors src/lib/sharedTimetable.ts) ──────────────────

/**
 * Normalizes a semester value (string or number) to an integer.
 */
export function normalizeSemester(semester) {
  if (typeof semester === 'number') return semester;
  const num = parseInt(String(semester).replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? 1 : num;
}

/**
 * Normalizes a section string to a canonical format (e.g. 'A', '5A', 'BE-CSE-5A').
 */
export function normalizeSection(section) {
  if (!section) return '';
  return section.trim().toUpperCase();
}

/**
 * Builds a full section label like 'BE-CSE-5A'.
 */
export function formatFullSection(program, semester, sectionInput) {
  const semNum = normalizeSemester(semester);
  const cleanProg = (program || 'BE-CSE').toUpperCase().replace(/\s+/g, '-');
  const sectionUpper = (sectionInput || 'A').toUpperCase().trim();

  // If already a full section (e.g. 'BE-CSE-5A'), return as-is
  if (sectionUpper.includes('-') && /\d/.test(sectionUpper)) {
    return sectionUpper;
  }

  // Strip leading semester digit if present (e.g. '5A' → 'A')
  const stripped = sectionUpper.replace(/^\d+/, '').replace(/^-/, '');
  return `${cleanProg}-${semNum}${stripped}`;
}

/**
 * Builds a stable canonical group ID for Firestore.
 * Example: 'chitkara-university_be-cse_2024_sem5_be-cse-5a'
 */
export function buildSharedGroupId(params) {
  const cleanInst = (params.institution || 'chitkara-university')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cleanProg = (params.program || 'be-cse')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const semNum = normalizeSemester(params.semester);
  const defaultBatch = ACTIVE_COHORT_BATCH_MAP[semNum] || '2024';
  const cleanBatch = (params.batch || defaultBatch).toString().trim().replace(/[^a-z0-9]+/g, '');
  const semSlug = `sem${semNum}`;
  const fullSec = formatFullSection(params.program || 'BE-CSE', semNum, params.section || 'A');
  const cleanSec = fullSec.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${cleanInst}_${cleanProg}_${cleanBatch}_${semSlug}_${cleanSec}`;
}

/**
 * Builds a human-readable group label.
 * Example: 'Chitkara University / BE-CSE / 2024 / Semester 5 / BE-CSE-5A'
 */
export function buildSharedGroupLabel(params) {
  const institution = (params.institution || 'Chitkara University').trim();
  const program = (params.program || 'BE-CSE').trim().toUpperCase();
  const semNum = normalizeSemester(params.semester);
  const defaultBatch = ACTIVE_COHORT_BATCH_MAP[semNum] || '2024';
  const batch = (params.batch || defaultBatch).trim();
  const fullSec = formatFullSection(program, semNum, params.section || 'A');
  return `${institution} / ${program} / ${batch} / Semester ${semNum} / ${fullSec}`;
}

/**
 * Computes a deterministic content hash for duplicate prevention.
 * Mirrors src/lib/sharedTimetable.ts computeTimetableContentHash()
 */
export function computeContentHash(slots, effectiveDate) {
  const normalized = slots
    .map((s) =>
      `${s.dayOfWeek}_${s.startTime}_${s.endTime}_${s.subjectCode.toUpperCase()}_` +
      `${(s.group || 'ALL').toUpperCase()}_${(s.room || '').toUpperCase()}`
    )
    .sort()
    .join('|');

  const payload = `${effectiveDate.trim()}::${normalized}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return `thash_${Math.abs(hash).toString(16)}`;
}

// ─── Slot Sanitization ────────────────────────────────────────────────────────

/**
 * Converts ExtractedLecture[] from the parser into SharedSlot[] for Firestore.
 * Filters out corrupt/non-academic slots, normalizes subject names.
 *
 * @param {import('../../src/lib/chitkaraTimetableParser.ts').ExtractedLecture[]} lectures
 * @returns {Array<object>} sanitized SharedSlot-compatible objects
 */
export function sanitizeLecturesToSharedSlots(lectures) {
  return lectures
    .filter((l) => {
      const code = (l.subjectCode || '').trim().toUpperCase();
      return code.length > 0 && !KNOWN_CORRUPT_SUBJECT_CODES.has(code);
    })
    .map((l) => ({
      id: `slot_${l.dayOfWeek}_${l.startTime.replace(':', '')}_${(l.subjectCode || '').replace(/[^a-zA-Z0-9]/g, '')}_${(l.group || 'ALL').toUpperCase()}`,
      subjectCode: l.subjectCode.trim(),
      subjectName: l.subjectCode.trim(), // Use shortform; full names resolved client-side
      faculty: l.faculty?.trim() || undefined,
      room: l.room?.trim() || undefined,
      dayOfWeek: l.dayOfWeek,
      startTime: l.startTime,
      endTime: l.endTime,
      color: l.color || '#3b82f6',
      group: l.group || 'ALL',
      periods: l.periods || 1,
      weight: l.weight || 1,
      durationMinutes: l.durationMinutes || computeDuration(l.startTime, l.endTime),
      isNonAcademic: l.isNonAcademic || false,
      isFreePeriod: l.isFreePeriod || false,
      requiresReview: l.requiresReview || false,
    }));
}

function computeDuration(startTime, endTime) {
  try {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  } catch {
    return 50; // Default Chitkara period length
  }
}

// ─── Server-Side Publisher ─────────────────────────────────────────────────────

/**
 * Publishes a validated timetable to Firestore using the Firebase Admin SDK.
 * Equivalent to publishSharedTimetable() in src/lib/sharedTimetable.ts but
 * uses the Admin SDK Firestore instance instead of the client SDK.
 *
 * @param {import('firebase-admin/firestore').Firestore} adminDb
 * @param {object} publisherInfo - Admin identity
 * @param {string} publisherInfo.uid
 * @param {string} publisherInfo.displayName
 * @param {object} groupParams
 * @param {string} groupParams.institution
 * @param {string} groupParams.program
 * @param {string} groupParams.batch
 * @param {number|string} groupParams.semester
 * @param {string} groupParams.section
 * @param {object[]} slots - SharedSlot-compatible objects
 * @param {string} effectiveDate - Effective date string
 * @param {object} [auditMeta] - Audit metadata (never contains secrets)
 * @param {string} [auditMeta.sourceMessageId]
 * @param {string} [auditMeta.attachmentHash]
 * @param {string} [auditMeta.attachmentFilename]
 * @param {string} [auditMeta.syncJobId]
 * @param {boolean} [dryRun=false] - If true, validate but do not write
 * @returns {Promise<PublishResult>}
 */
export async function serverPublishSharedTimetable(
  adminDb,
  publisherInfo,
  groupParams,
  slots,
  effectiveDate,
  auditMeta = {},
  dryRun = false
) {
  const { FieldValue } = await import('firebase-admin/firestore');

  // Sanitize and normalize slots
  const sanitizedSlots = slots.map((s) => ({
    ...s,
    subjectName: s.subjectCode?.trim() || s.subjectName,
  }));

  // Build canonical group IDs
  const semNum = normalizeSemester(groupParams.semester);
  const groupId = buildSharedGroupId(groupParams);
  const groupLabel = buildSharedGroupLabel(groupParams);
  const contentHash = computeContentHash(sanitizedSlots, effectiveDate);

  // Validate idempotency key against processed hashes to prevent duplicate publishes
  const adminPublisherRef = adminDb.doc(`authorizedPublishers/${publisherInfo.uid}`);
  const adminPublisherSnap = await adminPublisherRef.get();
  const existingState = adminPublisherSnap.data()?.gmailSyncState || {};
  const processedHashes = existingState.processedAttachmentHashes || [];

  if (auditMeta.attachmentHash && processedHashes.includes(auditMeta.attachmentHash)) {
    return {
      success: true,
      duplicate: true,
      version: null,
      groupId,
      groupLabel,
      message: `Attachment ${auditMeta.attachmentHash.slice(0, 8)}... was already processed. Skipping.`,
    };
  }

  const docRef = adminDb.doc(`sharedTimetables/${groupId}`);
  const existingSnap = await docRef.get();

  let version = 1;
  let history = [];

  if (existingSnap.exists()) {
    const existing = existingSnap.data();
    // Content hash duplicate check
    if (existing.contentHash === contentHash) {
      return {
        success: true,
        duplicate: true,
        version: existing.version,
        groupId,
        groupLabel,
        message: `Version ${existing.version} with identical content is already published. No change.`,
      };
    }
    version = (existing.version || 1) + 1;
    history = existing.revisionHistory || [];
    // Archive previous version
    history.unshift({
      revisionId: `rev_v${existing.version}_${Date.now()}`,
      version: existing.version,
      effectiveDate: existing.effectiveDate || 'Unknown',
      publishedAt: existing.publishedAt?.toDate().toISOString() || new Date().toISOString(),
      publishedBy: existing.publishedBy || 'system',
      contentHash: existing.contentHash || 'legacy',
      slotCount: existing.slots?.length || 0,
      changeSummary: `Auto-replaced by Version ${version} (Gmail sync)`,
    });
  }

  const payload = {
    id: groupId,
    groupLabel,
    institution: groupParams.institution || 'Chitkara University',
    program: groupParams.program || 'BE-CSE',
    batch: (groupParams.batch || ACTIVE_COHORT_BATCH_MAP[semNum] || '2024').toString(),
    semester: semNum,
    section: normalizeSection(groupParams.section),
    version,
    effectiveDate,
    contentHash,
    slots: sanitizedSlots,
    publishedAt: FieldValue.serverTimestamp(),
    publishedBy: publisherInfo.uid,
    publishedByName: publisherInfo.displayName || 'Admin Gmail Sync',
    publisherRole: 'admin',
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existingSnap.exists()
      ? existingSnap.data().createdAt
      : FieldValue.serverTimestamp(),
    revisionHistory: history.slice(0, 10),
    // Audit trace (non-secret metadata only)
    _syncMeta: {
      syncJobId: auditMeta.syncJobId || null,
      attachmentFilename: auditMeta.attachmentFilename || null,
      attachmentHashPrefix: auditMeta.attachmentHash?.slice(0, 16) || null,
      sourceMessageId: auditMeta.sourceMessageId || null,
      syncedAt: new Date().toISOString(),
    },
  };

  if (dryRun) {
    return {
      success: true,
      duplicate: false,
      dryRun: true,
      version,
      groupId,
      groupLabel,
      slotCount: sanitizedSlots.length,
      message: `[DRY RUN] Would publish Version ${version} for ${groupLabel} with ${sanitizedSlots.length} slots.`,
    };
  }

  // Atomic write — single setDoc call
  await docRef.set(payload, { merge: true });

  return {
    success: true,
    duplicate: false,
    dryRun: false,
    version,
    groupId,
    groupLabel,
    slotCount: sanitizedSlots.length,
    message: `Published Version ${version} for ${groupLabel} with ${sanitizedSlots.length} slots.`,
  };
}

/**
 * Writes a sync job record to timetableImportJobs (readable by admin client via uid filter).
 * Admin SDK bypasses Firestore security rules.
 *
 * @param {import('firebase-admin/firestore').Firestore} adminDb
 * @param {string} adminUid
 * @param {object} jobData
 */
export async function writeImportJobRecord(adminDb, adminUid, jobData) {
  const { FieldValue } = await import('firebase-admin/firestore');

  const jobRef = adminDb.collection('timetableImportJobs').doc();
  await jobRef.set({
    uid: adminUid,
    source: 'email',
    ...jobData,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return jobRef.id;
}

/**
 * Updates the Gmail sync state in authorizedPublishers/{adminUid}.
 * Stores cursor (historyId), last run timestamps, and metrics.
 * Does NOT store tokens, refresh tokens, or any credentials.
 *
 * @param {import('firebase-admin/firestore').Firestore} adminDb
 * @param {string} adminUid
 * @param {object} syncState
 */
export async function updateAdminSyncState(adminDb, adminUid, syncState) {
  const { FieldValue } = await import('firebase-admin/firestore');

  const publisherRef = adminDb.doc(`authorizedPublishers/${adminUid}`);
  await publisherRef.set(
    {
      gmailSyncState: {
        ...syncState,
        // Never store tokens or credentials here
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
}
