/**
 * UniFlow College Email Validation & Profile Parsing Utilities
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
 * Parses roll number, batch year, and expected graduation year from typical Chitkara email patterns
 * e.g., "jivitesh1260.be24@chitkarauniversity.edu.in"
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
    }
  }

  return result;
}
