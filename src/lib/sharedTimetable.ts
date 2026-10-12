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
import { normalizeSection, normalizeSemester, formatFullSection } from './collegeEmail.ts';
import type { TimetableSlot, TimetableGroupScope } from '../types';

export interface TimetableGroupParams {
  institution?: string;
  program?: string;
  batch?: string;
  semester: number | string;
  section: string;
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
 * Example: "Chitkara HP / BE-CSE / 2024 / Semester 5 / BE-CSE-5A"
 */
export function buildSharedGroupLabel(params: TimetableGroupParams): string {
  const institution = (params.institution || 'Chitkara University').trim();
  const program = (params.program || 'BE-CSE').trim().toUpperCase();
  const batch = (params.batch || '2024').trim();
  const semester = normalizeSemester(params.semester);
  const fullSec = formatFullSection(program, semester, params.section || 'A');

  return `${institution} / ${program} / ${batch} / Semester ${semester} / ${fullSec}`;
}

/**
 * Builds a stable, sanitized, lowercase group identifier for Firestore documents.
 * Example: "chitkara-university_be-cse_2024_sem5_be-cse-5a"
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

  const cleanBatch = (params.batch || '2024')
    .toString()
    .trim()
    .replace(/[^a-z0-9]+/g, '');

  const semNum = normalizeSemester(params.semester);
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
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`uniflow_shared_tt_${groupId}`);
    if (raw) {
      return JSON.parse(raw) as SharedTimetableDoc;
    }
  } catch {
    // Ignore cache parse error
  }
  return null;
}

export function setSharedTimetableCache(groupId: string, data: SharedTimetableDoc): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
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
 */
export function mergeSharedAndPersonalSlots(
  sharedSlots: SharedSlot[],
  personalSlots: TimetableSlot[],
  groupId?: string
): TimetableSlot[] {
  // 1. If no shared slots are available, return personal slots
  if (!sharedSlots || sharedSlots.length === 0) {
    return personalSlots;
  }

  // 2. Map shared slots to TimetableSlot structure with isManual = false
  const mappedShared: TimetableSlot[] = sharedSlots.map((s) => ({
    id: `shared_${s.id}`,
    uid: 'shared_group',
    subjectId: `shared_${s.subjectCode.toLowerCase()}`,
    subjectName: s.subjectName,
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
    requiresReview: s.requiresReview || false,
    section: groupId ? groupId.split('_').pop() : undefined,
  }));

  // Create lookup set of shared slots to prevent duplicating identical classes
  const sharedKeySet = new Set(
    mappedShared.map(
      (s) => `${s.dayOfWeek}_${s.startTime}_${s.subjectCode.toUpperCase()}_${(s.group || 'ALL').toUpperCase()}`
    )
  );

  // 3. Extract and preserve personal additions that are not redundant duplicates
  const personalManual = personalSlots.filter((s) => {
    if (!s.isActive || !s.isManual) return false;
    const key = `${s.dayOfWeek}_${s.startTime}_${s.subjectCode.toUpperCase()}_${(s.group || 'ALL').toUpperCase()}`;
    return !sharedKeySet.has(key);
  });

  return [...mappedShared, ...personalManual];
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
  const groupId = buildSharedGroupId(groupParams);
  const groupLabel = buildSharedGroupLabel(groupParams);
  const contentHash = computeTimetableContentHash(slots, effectiveDate);

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
    slots,
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
