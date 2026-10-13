/**
 * UniFlow Canonical Academic Profile & Section Validation System
 *
 * Provides:
 * 1. Single canonical schema for student profiles.
 * 2. Shared validation for registration, Google onboarding, and Settings.
 * 3. Unified section and semester normalization.
 * 4. Safe profile completeness checks.
 */

import {
  CHITKARA_DOMAIN,
  normalizeCollegeEmail,
  isValidCollegeEmail,
  normalizeSemester,
  deriveAcademicYears,
  ACTIVE_COHORT_BATCH_MAP,
} from './collegeEmail.ts';

export interface CanonicalAcademicProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  college: string;
  program: string;
  batch: string;
  semester: number;
  section: string;        // e.g. "A" or "5A"
  sectionLetter: string;  // e.g. "A"
  fullSection: string;    // e.g. "BE-CSE-5A"
  studentGroup?: 'G1' | 'G2' | 'ALL' | null;
  universityId: string;
  expectedGraduationYear?: number;
  attendanceTarget: number;
  emailVerified: boolean;
  profileCompleted: boolean;
  role?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProfileValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  cleaned?: {
    displayName: string;
    email: string;
    college: string;
    program: string;
    batch: string;
    semester: number;
    section: string;
    sectionLetter: string;
    fullSection: string;
    studentGroup: 'G1' | 'G2' | 'ALL';
    universityId: string;
    expectedGraduationYear?: number;
    attendanceTarget: number;
  };
}

/**
 * Normalizes any section representation into its constituent forms:
 * - letter: "A"
 * - short: "5A"
 * - full: "BE-CSE-5A"
 */
export function normalizeSectionVariants(
  rawSection: string | null | undefined,
  semester: number = 5,
  program: string = 'BE-CSE'
): { letter: string; short: string; full: string } {
  if (!rawSection || !rawSection.trim()) {
    return { letter: '', short: '', full: '' };
  }

  const cleaned = rawSection.trim().toUpperCase().replace(/\s+/g, '');
  const semNum = normalizeSemester(semester);
  const prog = (program || 'BE-CSE').trim().toUpperCase();

  // Pattern 1: Full format e.g. "BE-CSE-5A"
  const fullMatch = cleaned.match(/^([A-Z0-9_-]+)-(\d+)([A-Z])$/);
  if (fullMatch) {
    const letter = fullMatch[3];
    return {
      letter,
      short: `${fullMatch[2]}${letter}`,
      full: cleaned,
    };
  }

  // Pattern 2: Short format e.g. "5A"
  const shortMatch = cleaned.match(/^(\d+)([A-Z])$/);
  if (shortMatch) {
    const letter = shortMatch[2];
    return {
      letter,
      short: cleaned,
      full: `${prog}-${cleaned}`,
    };
  }

  // Pattern 3: Single letter e.g. "A"
  if (/^[A-Z]$/.test(cleaned)) {
    return {
      letter: cleaned,
      short: `${semNum}${cleaned}`,
      full: `${prog}-${semNum}${cleaned}`,
    };
  }

  // Fallback: extract last letter
  const lastLetterMatch = cleaned.match(/[A-Z]$/);
  const letter = lastLetterMatch ? lastLetterMatch[0] : 'A';
  return {
    letter,
    short: `${semNum}${letter}`,
    full: `${prog}-${semNum}${letter}`,
  };
}

/**
 * Checks whether an academic profile is complete.
 * Never allows accessing dashboard with missing section, semester, or roll number.
 */
export function isProfileComplete(
  profile: Partial<CanonicalAcademicProfile> | null | undefined
): boolean {
  if (!profile) return false;

  const hasName = Boolean(profile.displayName && profile.displayName.trim().length > 0);
  const hasEmail = Boolean(profile.email && profile.email.trim().length > 0);
  const semNum =
    typeof profile.semester === 'number'
      ? profile.semester
      : typeof profile.semester === 'string'
      ? parseInt(profile.semester, 10)
      : NaN;
  const hasSem = !isNaN(semNum) && semNum >= 1 && semNum <= 8;
  const hasSec = Boolean(profile.section && String(profile.section).trim().length > 0);
  const hasRoll = Boolean(profile.universityId && String(profile.universityId).trim().length > 0);

  return Boolean(hasName && hasEmail && hasSem && hasSec && hasRoll);
}

/**
 * Validates and cleans raw academic profile form input.
 */
export function validateAcademicProfile(input: {
  displayName?: string;
  email?: string;
  college?: string;
  program?: string;
  batch?: string;
  semester?: number | string;
  section?: string;
  studentGroup?: string | null;
  universityId?: string;
  expectedGraduationYear?: number | string;
  attendanceTarget?: number | string;
}): ProfileValidationResult {
  const errors: Record<string, string> = {};

  // Display Name
  const displayName = (input.displayName || '').trim();
  if (!displayName) {
    errors.displayName = 'Full name is required.';
  } else if (displayName.length < 2) {
    errors.displayName = 'Name must be at least 2 characters.';
  }

  // Email
  const email = normalizeCollegeEmail(input.email || '');
  if (!email) {
    errors.email = 'University email address is required.';
  } else if (!isValidCollegeEmail(email)) {
    errors.email = `Please enter your official Chitkara email ending in @${CHITKARA_DOMAIN}.`;
  }

  // University ID / Roll Number
  const universityId = (input.universityId || '').trim();
  if (!universityId) {
    errors.universityId = 'University Roll Number is required.';
  } else if (!/^[A-Za-z0-9]{5,20}$/.test(universityId)) {
    errors.universityId = 'Please enter a valid University Roll Number (5-20 characters).';
  }

  // Semester
  const semNum = Number(input.semester);
  if (isNaN(semNum) || semNum < 1 || semNum > 8) {
    errors.semester = 'Please select a valid semester (1 to 8).';
  }

  // Section
  const rawSec = (input.section || '').trim();
  if (!rawSec) {
    errors.section = 'Section is required.';
  }
  const secVariants = normalizeSectionVariants(rawSec, semNum || 5, input.program || 'BE-CSE');
  if (!secVariants.letter || !/^[A-Z]$/.test(secVariants.letter)) {
    errors.section = 'Please enter a valid section letter (e.g. A, B, C).';
  }

  // Student Group
  let studentGroup: 'G1' | 'G2' | 'ALL' = 'ALL';
  const rawGroup = (input.studentGroup || '').trim().toUpperCase();
  if (rawGroup === 'G1' || rawGroup === 'G2' || rawGroup === 'ALL') {
    studentGroup = rawGroup;
  }

  // Program & College
  const program = (input.program || 'BE-CSE').trim().toUpperCase();
  const college = (input.college || 'Chitkara University').trim();

  // Batch
  const derived = deriveAcademicYears(universityId, email);
  let batch = (input.batch || '').trim();
  if (!batch) {
    batch = derived.admissionYear || ACTIVE_COHORT_BATCH_MAP[semNum] || '2024';
  }

  // Expected Graduation Year
  let expectedGraduationYear: number | undefined;
  if (input.expectedGraduationYear) {
    const parsed = Number(input.expectedGraduationYear);
    if (!isNaN(parsed) && parsed >= 2024 && parsed <= 2035) {
      expectedGraduationYear = parsed;
    }
  }
  if (!expectedGraduationYear && derived.expectedGraduationYear) {
    expectedGraduationYear = derived.expectedGraduationYear;
  }

  // Attendance Target
  let attendanceTarget = 75;
  if (input.attendanceTarget !== undefined && input.attendanceTarget !== '') {
    const t = Number(input.attendanceTarget);
    if (!isNaN(t) && t >= 50 && t <= 100) {
      attendanceTarget = t;
    } else {
      errors.attendanceTarget = 'Attendance target must be between 50% and 100%.';
    }
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: {},
    cleaned: {
      displayName,
      email,
      college,
      program,
      batch,
      semester: semNum,
      section: secVariants.letter,
      sectionLetter: secVariants.letter,
      fullSection: secVariants.full,
      studentGroup,
      universityId,
      expectedGraduationYear,
      attendanceTarget,
    },
  };
}
