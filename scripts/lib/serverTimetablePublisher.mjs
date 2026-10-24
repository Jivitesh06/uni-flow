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

import crypto from 'node:crypto';

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
 * Computes a legacy 32-bit rolling hash (as in src/lib/sharedTimetable.ts)
 * for backward-compatibility checking against historical records.
 */
export function computeLegacyRollingContentHash(slots, effectiveDate) {
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

/**
 * Computes a collision-resistant, deterministic SHA-256 content fingerprint
 * for server-side timetable publication and idempotency.
 * Produces 'sha256_<64-hex-chars>'.
 *
 * @param {Array<object>} slots - SharedSlot items
 * @param {string} effectiveDate - Effective date string
 * @returns {string} SHA-256 fingerprint
 */
export function computeContentHash(slots, effectiveDate) {
  const normalized = slots
    .map((s) =>
      `${s.dayOfWeek}_${s.startTime}_${s.endTime}_${s.subjectCode.toUpperCase()}_` +
      `${(s.group || 'ALL').toUpperCase()}_${(s.room || '').toUpperCase()}`
    )
    .sort()
    .join('|');

  const payload = `${(effectiveDate || '').trim()}::${normalized}`;
  const sha = crypto.createHash('sha256').update(payload).digest('hex');
  return `sha256_${sha}`;
}

// ─── Date Normalization & Ordering ───────────────────────────────────────────

/**
 * Normalizes an effective date string (DD-MM-YYYY, YYYY-MM-DD, "October 21, 2026")
 * into a canonical ISO date string YYYY-MM-DD. Returns null if invalid or cannot be parsed.
 *
 * @param {string} rawDate
 * @returns {string|null}
 */
const MONTH_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function normalizeEffectiveDate(rawDate) {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  // DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY
  const dmy = trimmed.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // YYYY-MM-DD
  const ymd = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10);
    const day = parseInt(ymd[3], 10);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Textual Month first: "October 21, 2026" or "Oct 21 2026"
  const monthFirst = trimmed.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/i);
  if (monthFirst && MONTH_MAP[monthFirst[1].toLowerCase()]) {
    const month = MONTH_MAP[monthFirst[1].toLowerCase()];
    const day = parseInt(monthFirst[2], 10);
    const year = parseInt(monthFirst[3], 10);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Textual Day first: "21 October 2026" or "21-Oct-2026"
  const dayFirst = trimmed.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([a-z]+)[\s\-]+(\d{4})\b/i);
  if (dayFirst && MONTH_MAP[dayFirst[2].toLowerCase()]) {
    const day = parseInt(dayFirst[1], 10);
    const month = MONTH_MAP[dayFirst[2].toLowerCase()];
    const year = parseInt(dayFirst[3], 10);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Try ISO date / Date.parse fallback if valid
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    if (d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Compares two effective dates.
 * Returns:
 *   < 0 if dateA is earlier (older) than dateB
 *   0 if dateA and dateB represent the same date
 *   > 0 if dateA is later (newer) than dateB
 *
 * @param {string} dateA
 * @param {string} dateB
 * @returns {number}
 */
export function compareEffectiveDates(dateA, dateB) {
  const normA = normalizeEffectiveDate(dateA);
  const normB = normalizeEffectiveDate(dateB);
  if (!normA && !normB) return 0;
  if (!normA) return -1;
  if (!normB) return 1;
  if (normA < normB) return -1;
  if (normA > normB) return 1;
  return 0;
}

// ─── Firestore Serialization Sanitizer ────────────────────────────────────────

/**
 * Recursively sanitizes any value for Firestore:
 * - Omits keys whose value is undefined
 * - Recursively processes nested objects and arrays
 * - Preserves Date, FieldValue, Timestamp, Buffers, null, and primitives
 *
 * @param {*} val
 * @returns {*} sanitized value free of undefined
 */
export function sanitizeForFirestore(val) {
  if (val === undefined) {
    return null;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return val;
  }
  if (typeof val.isEqual === 'function' || val._methodName || Buffer.isBuffer(val)) {
    return val;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item));
  }

  const result = {};
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      result[k] = sanitizeForFirestore(v);
    }
  }
  return result;
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
  if (!slots || !Array.isArray(slots) || slots.length === 0) {
    throw new Error('Cannot publish timetable: zero parsed lectures/slots provided.');
  }

  const normalizedDate = normalizeEffectiveDate(effectiveDate);
  if (!effectiveDate || !normalizedDate) {
    throw new Error(`Cannot publish timetable: missing or unparseable effective date ("${effectiveDate || ''}").`);
  }

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

  if (!auditMeta.skipProcessedHashCheck && auditMeta.attachmentHash && processedHashes.includes(auditMeta.attachmentHash)) {
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

  if (existingSnap.exists) {
    const existing = existingSnap.data();

    // ── Effective date ordering check ──────────────────────────────────────
    // A timetable with an older effective date MUST NEVER replace a newer timetable!
    if (existing.effectiveDate && effectiveDate) {
      const cmp = compareEffectiveDates(effectiveDate, existing.effectiveDate);
      if (cmp < 0) {
        return {
          success: true,
          duplicate: false,
          skippedOlderVersion: true,
          version: existing.version,
          groupId,
          groupLabel,
          message: `Skipping: Candidate effective date (${effectiveDate}) is older than published version ${existing.version} (${existing.effectiveDate}).`,
        };
      }
    }

    // Content hash duplicate check (supports both SHA-256 and legacy rolling hash)
    const legacyHash = computeLegacyRollingContentHash(sanitizedSlots, effectiveDate);
    if (existing.contentHash === contentHash || existing.contentHash === legacyHash) {
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

  const payload = sanitizeForFirestore({
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
    createdAt: existingSnap.exists
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
  });

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

  const sanitized = sanitizeForFirestore(jobData);
  const collection = adminDb.collection('timetableImportJobs');
  const jobRef = sanitized.syncJobId ? collection.doc(sanitized.syncJobId) : collection.doc();
  await jobRef.set({
    uid: adminUid,
    source: 'email',
    ...sanitized,
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

  const sanitized = sanitizeForFirestore(syncState);
  const publisherRef = adminDb.doc(`authorizedPublishers/${adminUid}`);
  await publisherRef.set(
    {
      gmailSyncState: {
        ...sanitized,
        // Never store tokens or credentials here
        updatedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );
}
