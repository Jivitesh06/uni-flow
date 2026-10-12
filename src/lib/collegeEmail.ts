/**
 * UniFlow College Email Validation, Academic Profile Parsing & Normalization Utilities
 * Specifically configured for Chitkara University (@chitkarauniversity.edu.in)
 */

export const CHITKARA_DOMAIN = 'chitkarauniversity.edu.in';

export const CHITKARA_SECTIONS = [
  'BE-CSE-5A',
  'BE-CSE-5B',
  'BE-CSE-5C',
  'BE-CSE-5D',
  'BE-CSE-5E',
  'BE-CSE-5F',
  'BE-CSE-5G',
] as const;

export type ChitkaraSection = (typeof CHITKARA_SECTIONS)[number];

export interface StudentProfileFields {
  universityId?: string;
  batch?: string;
  semester?: number;
  section?: string;
  expectedGraduationYear?: number;
}

/**
 * Normalizes email by trimming surrounding whitespace and converting to lowercase
 */
export function normalizeCollegeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checks whether an email address belongs to the allowed college domain
 */
export function isValidCollegeEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = normalizeCollegeEmail(email);
  return normalized.endsWith(`@${CHITKARA_DOMAIN}`);
}

/**
 * Throws an educational error if an email address does not belong to the allowed college domain
 */
export function validateCollegeEmail(email: string | null | undefined): void {
  if (!email) {
    throw new Error('College email address is required.');
  }
  const normalized = normalizeCollegeEmail(email);
  if (!normalized.endsWith(`@${CHITKARA_DOMAIN}`)) {
    throw new Error(
      `Access restricted. Please register using your official Chitkara University email (@${CHITKARA_DOMAIN}).`
    );
  }
}

/**
 * Normalizes section string by trimming whitespace, uppercase conversion, and collapsing multiple spaces.
 * Supports arbitrary section codes (e.g., "be-cse-5a" -> "BE-CSE-5A", "ece-3b" -> "ECE-3B").
 */
export function normalizeSection(section: string | null | undefined): string {
  if (!section) return '';
  return section.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Normalizes semester value strictly to a number between 1 and 8.
 * Accepts numbers (1..8) or strings (e.g. "5", "5th", "Semester 5").
 */
export function normalizeSemester(semester: number | string | null | undefined): number {
  if (typeof semester === 'number' && Number.isFinite(semester)) {
    return Math.min(8, Math.max(1, Math.round(semester)));
  }
  if (typeof semester === 'string') {
    const match = semester.match(/\d+/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (parsed >= 1 && parsed <= 8) {
        return parsed;
      }
    }
  }
  return 1;
}

/**
 * Derives admission batch year and expected graduation year from university ID / roll number or email.
 * Standard B.E. course duration is 4 years.
 *
 * Example:
 * - University ID: "2411981260" -> starts with "24" -> batch "2024", graduation "2028"
 * - Email: "jivitesh1260.be24@chitkarauniversity.edu.in" -> ".be24" -> batch "2024", graduation "2028"
 *
 * Does not assume every student follows a fixed username format; returns empty object if non-standard.
 */
export function deriveAcademicYears(
  universityId?: string | null,
  email?: string | null,
  courseDurationYears: number = 4
): { admissionYear?: string; expectedGraduationYear?: number } {
  // 1. Try deriving from university ID / roll number first
  if (universityId) {
    const cleanId = universityId.trim();
    // Chitkara roll numbers typically begin with 2-digit year (e.g., 2411981260 or 231099...)
    const match = cleanId.match(/^(\d{2})\d{4,12}$/);
    if (match) {
      const shortYear = parseInt(match[1], 10);
      if (shortYear >= 18 && shortYear <= 35) {
        const admissionYear = (2000 + shortYear).toString();
        return {
          admissionYear,
          expectedGraduationYear: 2000 + shortYear + courseDurationYears,
        };
      }
    }
  }

  // 2. Try deriving from college email convention if valid
  if (email) {
    const cleanEmail = normalizeCollegeEmail(email);
    const localPart = cleanEmail.split('@')[0];

    // Pattern: [name][roll].[degree][batchYear] e.g. jivitesh1260.be24
    const match = localPart.match(/\.([a-z]{2,4})(\d{2})$/i);
    if (match) {
      const shortYear = parseInt(match[2], 10);
      if (shortYear >= 18 && shortYear <= 35) {
        const admissionYear = (2000 + shortYear).toString();
        return {
          admissionYear,
          expectedGraduationYear: 2000 + shortYear + courseDurationYears,
        };
      }
    }

    // Pattern: direct roll number as email username e.g. 2411981260@chitkarauniversity.edu.in
    const rollMatch = localPart.match(/^(\d{2})\d{6,12}$/);
    if (rollMatch) {
      const shortYear = parseInt(rollMatch[1], 10);
      if (shortYear >= 18 && shortYear <= 35) {
        const admissionYear = (2000 + shortYear).toString();
        return {
          admissionYear,
          expectedGraduationYear: 2000 + shortYear + courseDurationYears,
        };
      }
    }
  }

  return {};
}

/**
 * Parses roll number, batch year, and expected graduation year from typical Chitkara email patterns
 * Preserved for backwards compatibility with existing tests and scripts.
 */
export function parseStudentDetailsFromEmail(email: string): StudentProfileFields {
  if (!email) return {};
  const normalized = normalizeCollegeEmail(email);
  const localPart = normalized.split('@')[0];

  const result: StudentProfileFields = {};

  // Pattern: [name][roll].[degree][batchYear] e.g. jivitesh1260.be24
  const match = localPart.match(/^([a-z]+)(\d{3,6})\.([a-z]{2,4})(\d{2})$/i);
  if (match) {
    result.universityId = match[2]; // e.g. 1260
    const shortYear = parseInt(match[4], 10);
    const admissionYear = 2000 + shortYear; // e.g. 2024
    result.batch = admissionYear.toString();
    result.expectedGraduationYear = admissionYear + 4; // 4-year B.E. program
  } else {
    // Secondary pattern: just roll number e.g. 2410991260@chitkarauniversity.edu.in
    const rollOnly = localPart.match(/^\d{8,12}$/);
    if (rollOnly) {
      result.universityId = rollOnly[0];
      const shortYear = parseInt(rollOnly[0].substring(0, 2), 10);
      if (shortYear >= 18 && shortYear <= 35) {
        result.batch = (2000 + shortYear).toString();
        result.expectedGraduationYear = 2000 + shortYear + 4;
      }
    }
  }

  return result;
}
