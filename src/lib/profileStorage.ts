/**
 * UniFlow Local Profile Storage & Offline Cache Management
 *
 * Provides:
 * 1. Safe localStorage caching for authenticated student profiles.
 * 2. Instant offline hydration before network or Firestore resolution.
 * 3. Graceful degradation when localStorage is unavailable, full, or corrupt.
 * 4. Strict stripping of sensitive tokens/secrets before disk persistence.
 */

import { isProfileComplete } from './academicProfile.ts';

export interface StoredUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  semester?: number;
  section?: string;
  college?: string;
  program?: string;
  universityId?: string;
  batch?: string;
  expectedGraduationYear?: number;
  studentGroup?: 'G1' | 'G2' | 'ALL' | null;
  subjectGroups?: Record<string, 'G1' | 'G2'>;
  attendanceTarget: number;
  emailVerified: boolean;
  profileCompleted?: boolean;
  cachedAt?: number;
  schemaVersion?: number;
}

const PROFILE_CACHE_PREFIX = 'uniflow_profile_';
const PROFILE_SCHEMA_VERSION = 1;

/**
 * Strips any sensitive credentials, privileged roles, or non-serializable fields
 * before persisting the profile to localStorage.
 */
function sanitizeProfileForCache(profile: Partial<StoredUserProfile>): StoredUserProfile {
  const semNum =
    typeof profile.semester === 'number'
      ? profile.semester
      : typeof profile.semester === 'string'
      ? parseInt(profile.semester, 10)
      : undefined;

  const targetNum =
    typeof profile.attendanceTarget === 'number'
      ? profile.attendanceTarget
      : typeof profile.attendanceTarget === 'string'
      ? parseInt(profile.attendanceTarget, 10)
      : 75;

  const validTarget =
    !isNaN(targetNum) && targetNum >= 50 && targetNum <= 100 ? targetNum : 75;

  const sanitized: StoredUserProfile = {
    uid: String(profile.uid || '').trim(),
    email: String(profile.email || '').trim().toLowerCase(),
    displayName: String(profile.displayName || '').trim(),
    photoURL: profile.photoURL ? String(profile.photoURL) : undefined,
    semester: semNum !== undefined && !isNaN(semNum) && semNum >= 1 && semNum <= 8 ? semNum : undefined,
    section: profile.section ? String(profile.section).trim().toUpperCase() : undefined,
    college: profile.college ? String(profile.college).trim() : 'Chitkara University',
    program: profile.program ? String(profile.program).trim().toUpperCase() : 'BE-CSE',
    universityId: profile.universityId ? String(profile.universityId).trim() : undefined,
    batch: profile.batch ? String(profile.batch).trim() : undefined,
    expectedGraduationYear:
      typeof profile.expectedGraduationYear === 'number'
        ? profile.expectedGraduationYear
        : typeof profile.expectedGraduationYear === 'string'
        ? parseInt(profile.expectedGraduationYear, 10) || undefined
        : undefined,
    studentGroup: profile.studentGroup || 'ALL',
    subjectGroups: profile.subjectGroups && typeof profile.subjectGroups === 'object' ? profile.subjectGroups : undefined,
    attendanceTarget: validTarget,
    emailVerified: Boolean(profile.emailVerified),
    profileCompleted: isProfileComplete(profile as any),
    cachedAt: Date.now(),
    schemaVersion: PROFILE_SCHEMA_VERSION,
  };

  return sanitized;
}

/**
 * Loads a cached student profile from localStorage for the given user UID.
 * Returns null if no cache exists, is corrupted, or belongs to another user.
 */
export function getCachedUserProfile<T = StoredUserProfile>(uid: string): T | null {
  if (!uid || typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${PROFILE_CACHE_PREFIX}${uid}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredUserProfile;
    if (!parsed || typeof parsed !== 'object' || parsed.uid !== uid) {
      window.localStorage.removeItem(`${PROFILE_CACHE_PREFIX}${uid}`);
      return null;
    }

    // Recompute profileCompleted to ensure adherence to canonical validation rules
    parsed.profileCompleted = isProfileComplete(parsed as any);

    return parsed as unknown as T;
  } catch (err) {
    console.warn('[profileStorage] Failed to read cached profile:', err);
    return null;
  }
}

/**
 * Persists a validated student profile to localStorage for offline access.
 */
export function setCachedUserProfile(uid: string, profile: Partial<StoredUserProfile>): void {
  if (!uid || !profile || typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    const sanitized = sanitizeProfileForCache({ ...profile, uid });
    window.localStorage.setItem(`${PROFILE_CACHE_PREFIX}${uid}`, JSON.stringify(sanitized));
  } catch (err) {
    console.warn('[profileStorage] Failed to write cached profile to localStorage:', err);
  }
}

/**
 * Removes the cached profile for the given UID (e.g. on user deletion or profile reset).
 */
export function clearCachedUserProfile(uid: string): void {
  if (!uid || typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(`${PROFILE_CACHE_PREFIX}${uid}`);
  } catch (err) {
    console.warn('[profileStorage] Failed to clear cached profile:', err);
  }
}
