/**
 * UniFlow Shared Timetable Architecture & Synchronization Engine
 * 
 * Provides:
 * 1. Normalized group identifier builder (Institution / Program / Batch / Semester / Section)
 * 2. Shared timetable publishing with versioning, duplicate detection & revision history
 * 3. Offline-first local caching with background revalidation
 * 4. Deterministic merger between published group slots and personal additions (preserving manual classes)
 * 5. Role-verified publication barrier preventing unauthorized client tampering
 */

import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import {
  normalizeSection,
  normalizeSemester,
  formatFullSection,
  parseSectionDetails,
  deriveAcademicYears,
  ACTIVE_COHORT_BATCH_MAP,
} from './collegeEmail.ts';
import { SEEDED_5TH_SEM_TIMETABLES } from '../data/seededSharedTimetables.ts';
import type { TimetableSlot, TimetableGroupScope } from '../types';

export { ACTIVE_COHORT_BATCH_MAP };

export interface TimetableGroupParams {
  institution?: string;
  program?: string;
  batch?: string;
  semester: number | string;
  section: string;
}

export interface AcademicGroupResolution {
  params: TimetableGroupParams | null;
  groupId: string | null;
  groupLabel: string;
  isSupportedCohort: boolean;
  isAmbiguous: boolean;
  ambiguityReason?: string;
}

/**
 * Known room codes and placeholders that were erroneously parsed as subject codes in old timetables
 */
export const KNOWN_CORRUPT_SUBJECT_CODES = new Set([
  'CL01',
  'CL02',
  'CL03',
  'CL04',
  'CL05',
  'KLM108L',
  'LEC',
  'TBD',
]);

/**
 * Checks if a timetable document contains corrupted slots (e.g. room codes or LEC as subjects)
 */
export function isCorruptedTimetableDoc(doc: SharedTimetableDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.slots) || doc.slots.length === 0) return false;
  return doc.slots.some((s) => {
    const code = (s.subjectCode || '').trim().toUpperCase();
    const name = (s.subjectName || '').trim().toUpperCase();
    return KNOWN_CORRUPT_SUBJECT_CODES.has(code) || KNOWN_CORRUPT_SUBJECT_CODES.has(name);
  });
}

/**
 * Unified Canonical Academic Group Resolver for all timetable entry points:
 * - TimetablePage
 * - DashboardPage
 * - AttendancePage
 *
 * Rules:
 * 1. An explicitly verified, valid 4-digit profile batch takes precedence.
 * 2. If profile batch is missing, resolves to active cohort batch:
 *    Semester 1 -> 2026
 *    Semester 3 -> 2025
 *    Semester 5 -> 2024
 * 3. Detects conflicts between section label and profile semester (e.g. section 1A with semester 5).
 * 4. Flags ambiguity rather than silently selecting the wrong timetable.
 * 5. Guarantees identical canonical group ID across all consumers.
 */
export function resolveStudentAcademicGroup(
  profile?: {
    college?: string | null;
    institution?: string | null;
    program?: string | null;
    batch?: string | null;
    semester?: number | string | null;
    section?: string | null;
    universityId?: string | null;
    email?: string | null;
    expectedGraduationYear?: number | null;
  } | null
): AcademicGroupResolution {
  if (!profile || !profile.section || profile.semester == null) {
    return {
      params: null,
      groupId: null,
      groupLabel: '',
      isSupportedCohort: false,
      isAmbiguous: false,
    };
  }

  const rawSection = profile.section.trim();
  if (!rawSection) {
    return {
      params: null,
      groupId: null,
      groupLabel: '',
      isSupportedCohort: false,
      isAmbiguous: false,
    };
  }

  const semNum = normalizeSemester(profile.semester);
  const isSupportedCohort = semNum in ACTIVE_COHORT_BATCH_MAP;
  const institution = (profile.institution || profile.college || 'Chitkara University').trim();
  const program = (profile.program || 'BE-CSE').trim().toUpperCase();

  let isAmbiguous = false;
  let ambiguityReason: string | undefined;

  // Check section details for conflicts with profile semester
  const secDetails = parseSectionDetails(rawSection);
  if (secDetails.semester !== undefined && secDetails.semester !== semNum) {
    isAmbiguous = true;
    ambiguityReason = `Academic conflict: Profile specifies Semester ${semNum}, but section "${rawSection}" belongs to Semester ${secDetails.semester}.`;
  }

  // Resolve batch
  let resolvedBatch = '';
  const rawBatch = (profile.batch || '').trim();
  const hasExplicitBatch = /^\d{4}$/.test(rawBatch);

  if (hasExplicitBatch) {
    resolvedBatch = rawBatch;
    const cohortExpectedBatch = ACTIVE_COHORT_BATCH_MAP[semNum];
    if (cohortExpectedBatch && Math.abs(parseInt(resolvedBatch, 10) - parseInt(cohortExpectedBatch, 10)) > 2) {
      isAmbiguous = true;
      ambiguityReason = `Conflicting academic metadata: Batch ${resolvedBatch} differs from active Semester ${semNum} cohort (${cohortExpectedBatch}).`;
    }
  } else {
    const derived = deriveAcademicYears(profile.universityId, profile.email);
    if (derived.admissionYear && /^\d{4}$/.test(derived.admissionYear)) {
      resolvedBatch = derived.admissionYear;
    } else if (isSupportedCohort) {
      resolvedBatch = ACTIVE_COHORT_BATCH_MAP[semNum];
    } else {
      resolvedBatch = '2024';
      isAmbiguous = true;
      ambiguityReason = `Unsupported semester ${semNum}: Unable to determine active admission batch.`;
    }
  }

  const sectionLetter = secDetails.sectionLetter || rawSection.toUpperCase();
  const canonicalSection = formatFullSection(program, semNum, sectionLetter);

  const params: TimetableGroupParams = {
    institution,
    program,
    batch: resolvedBatch,
    semester: semNum,
    section: canonicalSection,
  };

  const groupId = buildSharedGroupId(params);
  const groupLabel = buildSharedGroupLabel(params);

  return {
    params,
    groupId,
    groupLabel,
    isSupportedCohort,
    isAmbiguous,
    ambiguityReason,
  };
}

export interface SharedSlot {
  id: string;
  subjectCode: string;
  subjectName: string;
  faculty?: string;
  room?: string;
  dayOfWeek: number; // 0=Sun..6=Sat
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  color?: string;
  group?: TimetableGroupScope; // 'G1' | 'G2' | 'ALL'
  periods?: number;
  weight?: number;
  durationMinutes?: number;
  isNonAcademic?: boolean;
  isFreePeriod?: boolean;
  requiresReview?: boolean;
}

export interface SharedTimetableRevisionRecord {
  revisionId: string;
  version: number;
  effectiveDate: string;
  publishedAt: string;
  publishedBy: string;
  contentHash: string;
  slotCount: number;
  changeSummary?: string;
}

export interface SharedTimetableDoc {
  id: string; // Group ID
  groupLabel: string;
  institution: string;
  program: string;
  batch: string;
  semester: number;
  section: string;
  version: number;
  effectiveDate: string;
  contentHash: string;
  slots: SharedSlot[];
  publishedAt: Timestamp | null;
  publishedBy: string;
  publishedByName?: string;
  publisherRole?: string;
  updatedAt: Timestamp | null;
  createdAt: Timestamp | null;
  revisionHistory?: SharedTimetableRevisionRecord[];
}

/**
 * Builds a readable human-facing group label.
 * Example: "Chitkara University / BE-CSE / 2026 / Semester 1 / BE-CSE-1A"
 */
export function buildSharedGroupLabel(params: TimetableGroupParams): string {
  const institution = (params.institution || 'Chitkara University').trim();
  const program = (params.program || 'BE-CSE').trim().toUpperCase();
  const semNum = normalizeSemester(params.semester);
  const defaultBatch = ACTIVE_COHORT_BATCH_MAP[semNum] || '2024';
  const batch = (params.batch || defaultBatch).trim();
  const fullSec = formatFullSection(program, semNum, params.section || 'A');

  return `${institution} / ${program} / ${batch} / Semester ${semNum} / ${fullSec}`;
}

/**
 * Builds a stable, sanitized, lowercase group identifier for Firestore documents.
 * Example: "chitkara-university_be-cse_2026_sem1_be-cse-1a"
 */
export function buildSharedGroupId(params: TimetableGroupParams): string {
  const cleanInst = (params.institution || 'chitkara-university')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const cleanProg = (params.program || 'be-cse')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const semNum = normalizeSemester(params.semester);
  const defaultBatch = ACTIVE_COHORT_BATCH_MAP[semNum] || '2024';
  const cleanBatch = (params.batch || defaultBatch)
    .toString()
    .trim()
    .replace(/[^a-z0-9]+/g, '');

  const semSlug = `sem${semNum}`;

  const fullSec = formatFullSection(params.program || 'BE-CSE', semNum, params.section || 'A');
  const cleanSec = fullSec
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${cleanInst}_${cleanProg}_${cleanBatch}_${semSlug}_${cleanSec}`;
}

/**
 * Computes deterministic content hash of slots and effective date for duplicate prevention.
 */
export function computeTimetableContentHash(slots: SharedSlot[], effectiveDate: string): string {
  const normalized = slots
    .map(
      (s) =>
        `${s.dayOfWeek}_${s.startTime}_${s.endTime}_${s.subjectCode.toUpperCase()}_${(
          s.group || 'ALL'
        ).toUpperCase()}_${(s.room || '').toUpperCase()}`
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
 * Local offline cache helpers for shared timetables
 */
export function getSharedTimetableCache(groupId: string): SharedTimetableDoc | null {
  // 1. Check local storage cache (offline copy or updated version from Firestore)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(`uniflow_shared_tt_${groupId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as SharedTimetableDoc;
        // Invalidate and purge corrupt cache entries (e.g. room codes or LEC as subjects)
        if (isCorruptedTimetableDoc(parsed)) {
          console.warn(`[getSharedTimetableCache] Invalidating and purging corrupted local cache for ${groupId}`);
          window.localStorage.removeItem(`uniflow_shared_tt_${groupId}`);
          window.localStorage.removeItem(`uniflow_shared_tt_ts_${groupId}`);
        } else if (parsed && Array.isArray(parsed.slots)) {
          parsed.slots = parsed.slots.map((s) => ({
            ...s,
            subjectName: s.subjectCode?.trim() || s.subjectName,
          }));
          return parsed;
        }
      }
    } catch {
      // Ignore cache parse error safely
    }
  }

  // 2. Fall back to pre-seeded common dataset for this exact group ID if available and clean
  if (SEEDED_5TH_SEM_TIMETABLES && SEEDED_5TH_SEM_TIMETABLES[groupId]) {
    const doc = SEEDED_5TH_SEM_TIMETABLES[groupId];
    if (!isCorruptedTimetableDoc(doc)) {
      return doc;
    }
  }

  // 3. Fall back to matching semester & section if batch year varies, prioritizing canonical cohort
  if (SEEDED_5TH_SEM_TIMETABLES) {
    const semSecMatch = groupId.match(/sem(\d+)_([a-z0-9-]+)$/i);
    if (semSecMatch) {
      const semNum = parseInt(semSecMatch[1], 10);
      const targetSuffix = `sem${semNum}_${semSecMatch[2]}`.toLowerCase();
      const preferredBatch = ACTIVE_COHORT_BATCH_MAP[semNum];

      // Prioritize entry matching preferred canonical batch for this semester
      if (preferredBatch) {
        for (const [key, doc] of Object.entries(SEEDED_5TH_SEM_TIMETABLES)) {
          if (key.endsWith(targetSuffix) && key.includes(`_${preferredBatch}_`) && !isCorruptedTimetableDoc(doc)) {
            return doc;
          }
        }
      }

      // Fallback to any uncorrupted matching entry
      for (const [key, doc] of Object.entries(SEEDED_5TH_SEM_TIMETABLES)) {
        if (key.endsWith(targetSuffix) && !isCorruptedTimetableDoc(doc)) {
          return doc;
        }
      }
    }
  }

  return null;
}

export function setSharedTimetableCache(groupId: string, data: SharedTimetableDoc): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  // Never write corrupted data to local cache
  if (isCorruptedTimetableDoc(data)) {
    console.warn(`[setSharedTimetableCache] Refusing to cache corrupted document for ${groupId}`);
    return;
  }
  try {
    window.localStorage.setItem(`uniflow_shared_tt_${groupId}`, JSON.stringify(data));
    window.localStorage.setItem(`uniflow_shared_tt_ts_${groupId}`, Date.now().toString());
  } catch (err) {
    console.warn('Failed to write shared timetable cache:', err);
  }
}

/**
 * Deterministically merges shared published slots with personal additions:
 * - Shared slots represent the authoritative departmental timetable for the section.
 * - Personal slots marked with `isManual: true` are ALWAYS preserved (e.g. mentor meetings, remedial labs).
 * - Avoids duplicate classes if a manual slot already duplicates an authoritative shared slot.
 * - If no shared slots exist yet, falls back to the user's personal timetable slots.
 * - Strictly prevents personal slots from other semesters from leaking into the current timetable.
 */
export function mergeSharedAndPersonalSlots(
  sharedSlots: SharedSlot[],
  personalSlots: TimetableSlot[],
  groupId?: string
): TimetableSlot[] {
  const semMatch = groupId ? groupId.match(/_sem(\d+)_/i) : null;
  const targetSem = semMatch ? parseInt(semMatch[1], 10) : undefined;

  // 1. If no shared slots are available, return personal slots strictly matching the active semester/group
  if (!sharedSlots || sharedSlots.length === 0) {
    if (!groupId) return personalSlots;
    return personalSlots.filter((p) => {
      if (p.sharedGroupId && p.sharedGroupId !== groupId) return false;
      if (targetSem !== undefined && p.section) {
        const secDetails = parseSectionDetails(p.section);
        if (secDetails.semester !== undefined && secDetails.semester !== targetSem) return false;
      }
      return true;
    });
  }

  // 2. Map shared slots to TimetableSlot structure with isManual = false
  const mappedShared: TimetableSlot[] = sharedSlots.map((s) => ({
    id: `shared_${s.id}`,
    uid: 'shared_group',
    subjectId: `shared_${s.subjectCode.toLowerCase()}`,
    subjectName: s.subjectCode?.trim() || s.subjectName,
    subjectCode: s.subjectCode,
    faculty: s.faculty,
    room: s.room,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    color: s.color || '#3b82f6',
    isActive: true,
    isManual: false,
    group: s.group || 'ALL',
    periods: s.periods,
    weight: s.weight,
    durationMinutes: s.durationMinutes,
    requiresReview: s.requiresReview || false,
    section: groupId ? groupId.split('_').pop() : undefined,
  }));

  // Create lookup set of shared slots to prevent duplicating identical classes
  const sharedKeySet = new Set(
    mappedShared.map(
      (s) => `${s.dayOfWeek}_${s.startTime}_${s.subjectCode.toUpperCase()}_${(s.group || 'ALL').toUpperCase()}`
    )
  );

  // 3. Extract and preserve personal additions that are not redundant duplicates and match the current group & semester
  const personalManual = personalSlots.filter((s) => {
    if (!s.isActive || !s.isManual) return false;
    if (groupId && s.sharedGroupId && s.sharedGroupId !== groupId) return false;
    if (targetSem !== undefined && s.section) {
      const secDetails = parseSectionDetails(s.section);
      if (secDetails.semester !== undefined && secDetails.semester !== targetSem) return false;
    }
    const key = `${s.dayOfWeek}_${s.startTime}_${s.subjectCode.toUpperCase()}_${(s.group || 'ALL').toUpperCase()}`;
    return !sharedKeySet.has(key);
  });

  return [...mappedShared, ...personalManual];
}

/**
 * Validates that document identity, group parameters, and slot metadata strictly agree.
 * Rejects inconsistent payloads with clear errors rather than silently publishing corrupt data.
 */
export function validateTimetablePublicationScope(
  groupParams: TimetableGroupParams,
  slots: SharedSlot[]
): { isValid: boolean; error?: string; canonicalGroupId: string; canonicalGroupLabel: string } {
  if (!groupParams.section || !groupParams.section.trim()) {
    return {
      isValid: false,
      error: 'Section is required to publish a shared timetable.',
      canonicalGroupId: '',
      canonicalGroupLabel: '',
    };
  }

  const batch = (groupParams.batch || '').toString().trim();
  if (!batch) {
    return {
      isValid: false,
      error: 'Admission batch year is required and cannot be empty or assumed.',
      canonicalGroupId: '',
      canonicalGroupLabel: '',
    };
  }

  const rawSem =
    typeof groupParams.semester === 'number'
      ? groupParams.semester
      : typeof groupParams.semester === 'string'
      ? parseInt(groupParams.semester, 10)
      : NaN;

  if (isNaN(rawSem) || rawSem < 1 || rawSem > 8) {
    return {
      isValid: false,
      error: `Invalid semester: ${groupParams.semester}. Must be between 1 and 8.`,
      canonicalGroupId: '',
      canonicalGroupLabel: '',
    };
  }

  const semNum = normalizeSemester(groupParams.semester);

  const canonicalGroupId = buildSharedGroupId(groupParams);
  const canonicalGroupLabel = buildSharedGroupLabel(groupParams);

  // Validate that canonical groupId embeds the exact target batch, semester, and section
  const cleanBatch = batch.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const semSlug = `sem${semNum}`;
  if (!canonicalGroupId.includes(cleanBatch)) {
    return {
      isValid: false,
      error: `Document ID mismatch: Generated ID "${canonicalGroupId}" does not contain batch "${cleanBatch}".`,
      canonicalGroupId,
      canonicalGroupLabel,
    };
  }

  if (!canonicalGroupId.includes(semSlug)) {
    return {
      isValid: false,
      error: `Document ID mismatch: Generated ID "${canonicalGroupId}" does not contain semester slug "${semSlug}".`,
      canonicalGroupId,
      canonicalGroupLabel,
    };
  }

  // Validate slots metadata
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s.subjectCode || !s.startTime || !s.endTime || typeof s.dayOfWeek !== 'number') {
      return {
        isValid: false,
        error: `Slot #${i + 1} has invalid or missing core timetable properties.`,
        canonicalGroupId,
        canonicalGroupLabel,
      };
    }
  }

  return {
    isValid: true,
    canonicalGroupId,
    canonicalGroupLabel,
  };
}

/**
 * Attempts to publish a shared timetable update to Firestore.
 * Requires publisher authorization; ordinary students will be rejected by security rules.
 */
export async function publishSharedTimetable(
  db: Firestore,
  user: { uid: string; displayName?: string | null; role?: string },
  groupParams: TimetableGroupParams,
  slots: SharedSlot[],
  effectiveDate: string
): Promise<{ success: boolean; version: number; duplicate: boolean; message: string }> {
  // Always sanitize slots to enforce timetable shortform naming
  const sanitizedSlots = slots.map((s) => ({
    ...s,
    subjectName: s.subjectCode?.trim() || s.subjectName,
  }));

  // Preflight validation: Enforce canonical document identity and reject inconsistent scopes
  const validation = validateTimetablePublicationScope(groupParams, sanitizedSlots);
  if (!validation.isValid) {
    throw new Error(`Publish Preflight Validation Failed: ${validation.error}`);
  }

  const groupId = validation.canonicalGroupId;
  const groupLabel = validation.canonicalGroupLabel;
  const contentHash = computeTimetableContentHash(sanitizedSlots, effectiveDate);

  const docRef = doc(db, 'sharedTimetables', groupId);
  const existingSnap = await getDoc(docRef);

  let version = 1;
  let history: SharedTimetableRevisionRecord[] = [];

  if (existingSnap.exists()) {
    const existing = existingSnap.data() as SharedTimetableDoc;
    // Duplicate prevention check:
    if (existing.contentHash === contentHash) {
      return {
        success: true,
        version: existing.version,
        duplicate: true,
        message: `Version ${existing.version} with identical timetable content is already published.`,
      };
    }
    version = (existing.version || 1) + 1;
    history = existing.revisionHistory || [];
    // Archive previous version to history
    history.unshift({
      revisionId: `rev_v${existing.version}_${Date.now()}`,
      version: existing.version,
      effectiveDate: existing.effectiveDate || 'Unknown',
      publishedAt: existing.publishedAt ? existing.publishedAt.toDate().toISOString() : new Date().toISOString(),
      publishedBy: existing.publishedBy || 'system',
      contentHash: existing.contentHash || 'legacy',
      slotCount: existing.slots?.length || 0,
      changeSummary: `Replaced by Version ${version}`,
    });
  }

  const payload: SharedTimetableDoc = {
    id: groupId,
    groupLabel,
    institution: groupParams.institution || 'Chitkara University',
    program: groupParams.program || 'BE-CSE',
    batch: (groupParams.batch || '2024').toString(),
    semester: normalizeSemester(groupParams.semester),
    section: normalizeSection(groupParams.section),
    version,
    effectiveDate,
    contentHash,
    slots: sanitizedSlots,
    publishedAt: serverTimestamp() as any,
    publishedBy: user.uid,
    publishedByName: user.displayName || 'Authorized Publisher',
    publisherRole: user.role || 'publisher',
    updatedAt: serverTimestamp() as any,
    createdAt: existingSnap.exists() ? (existingSnap.data().createdAt as any) : (serverTimestamp() as any),
    revisionHistory: history.slice(0, 10), // keep last 10 revisions
  };

  await setDoc(docRef, payload, { merge: true });

  // Update local cache
  setSharedTimetableCache(groupId, {
    ...payload,
    publishedAt: null,
    updatedAt: null,
    createdAt: null,
  });

  return {
    success: true,
    version,
    duplicate: false,
    message: `Successfully published version ${version} for ${groupLabel}!`,
  };
}
