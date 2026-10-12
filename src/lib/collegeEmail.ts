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
  studentGroup?: 'G1' | 'G2' | 'ALL' | null;
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
 * Checks whether an input string is strictly a single alphabetic section letter (e.g. "A", "a", "B").
 * Rejects full labels such as "5A", "BE-CSE-5A", "AB", "1", or empty strings.
 */
export function isValidSectionLetter(section: string | null | undefined): boolean {
  if (!section) return false;
  return /^[a-zA-Z]$/.test(section.trim());
}

/**
 * Validates that the input is strictly a single alphabetic section letter.
 * Throws a clear educational Error if invalid (does not silently extract a letter).
 * Returns the normalized uppercase single letter (e.g. "a" -> "A").
 */
export function validateSectionLetter(section: string | null | undefined): string {
  if (!section || !section.trim()) {
    throw new Error('Section is required. Please enter your section letter only (e.g. A).');
  }
  const trimmed = section.trim();
  if (!/^[a-zA-Z]$/.test(trimmed)) {
    throw new Error(
      `Invalid section "${trimmed}". Enter your section letter only (e.g. A, B). Full labels such as "5A" or "BE-CSE-5A" are not accepted.`
    );
  }
  return trimmed.toUpperCase();
}

/**
 * Normalizes section string by trimming whitespace, uppercase conversion, and collapsing multiple spaces.
 * If input is a single letter, returns uppercase letter (e.g. "a" -> "A").
 * Preserves existing legacy section strings (e.g. "be-cse-5a" -> "BE-CSE-5A").
 */
export function normalizeSection(section: string | null | undefined): string {
  if (!section) return '';
  return section.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Combines program, numeric semester, and section letter into the full canonical section identifier.
 * Example:
 * - formatFullSection('BE-CSE', 5, 'A') -> 'BE-CSE-5A'
 * - formatFullSection('BE-CSE', 5, 'B') -> 'BE-CSE-5B'
 * - formatFullSection('BE-CSE', 6, 'A') -> 'BE-CSE-6A'
 * - formatFullSection('BE-CSE', 5, 'BE-CSE-5A') -> 'BE-CSE-5A' (backward compatibility)
 */
export function formatFullSection(
  program: string = 'BE-CSE',
  semester: number | string = 5,
  sectionLetter: string = 'A'
): string {
  const cleanProg = (program || 'BE-CSE').trim().toUpperCase();
  const cleanSem = normalizeSemester(semester);
  const cleanSec = (sectionLetter || 'A').trim().toUpperCase();
  // If already a full canonical or hyphenated label (e.g. "BE-CSE-5A" or "ME-2B")
  if (cleanSec.includes('-')) {
    return cleanSec;
  }
  // If string contains number + letter like "5A", extract the letter
  const letterMatch = cleanSec.match(/[A-Z]$/);
  const letter = letterMatch ? letterMatch[0] : cleanSec;
  return `${cleanProg}-${cleanSem}${letter}`;
}

/**
 * Parses program, semester, and section letter from an arbitrary section identifier.
 * Examples:
 * - "BE-CSE-5A" -> { program: "BE-CSE", semester: 5, sectionLetter: "A" }
 * - "5A" -> { semester: 5, sectionLetter: "A" }
 * - "A" -> { sectionLetter: "A" }
 */
export function parseSectionDetails(
  sectionStr: string | null | undefined
): { program?: string; semester?: number; sectionLetter?: string } {
  if (!sectionStr) return {};
  const cleaned = sectionStr.trim().toUpperCase();

  // Pattern: [PROGRAM]-[SEMESTER][LETTER] e.g. "BE-CSE-5A"
  const fullMatch = cleaned.match(/^([A-Z0-9_-]+)-(\d+)([A-Z])$/);
  if (fullMatch) {
    return {
      program: fullMatch[1],
      semester: parseInt(fullMatch[2], 10),
      sectionLetter: fullMatch[3],
    };
  }

  // Pattern: [SEMESTER][LETTER] e.g. "5A"
  const semSecMatch = cleaned.match(/^(\d+)([A-Z])$/);
  if (semSecMatch) {
    return {
      semester: parseInt(semSecMatch[1], 10),
      sectionLetter: semSecMatch[2],
    };
  }

  // Single letter e.g. "A"
  if (/^[A-Z]$/.test(cleaned)) {
    return {
      sectionLetter: cleaned,
    };
  }

  return {};
}

/**
 * Compares a PDF section string (e.g. "BE-CSE-5A") against the student's numeric semester and section letter.
 * Does NOT do naive raw string comparison.
 */
export function isSectionMatch(
  pdfSectionStr: string,
  studentSemester: number | string,
  studentSectionLetter: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _program?: string
): boolean {
  if (!pdfSectionStr || !studentSectionLetter) return false;
  const parsedPdf = parseSectionDetails(pdfSectionStr);
  const targetSem = normalizeSemester(studentSemester);
  const targetLetter = studentSectionLetter.trim().toUpperCase();

  // If PDF section has parsed semester and section letter
  if (parsedPdf.semester !== undefined && parsedPdf.sectionLetter !== undefined) {
    return parsedPdf.semester === targetSem && parsedPdf.sectionLetter === targetLetter;
  }

  // If PDF section is just a letter
  if (parsedPdf.sectionLetter !== undefined) {
    return parsedPdf.sectionLetter === targetLetter;
  }

  // Fallback: check if the string ends with the target semester + letter (e.g. "5A")
  return pdfSectionStr.toUpperCase().endsWith(`${targetSem}${targetLetter}`);
}

/**
 * Returns a descriptive error message if a PDF section does not match the student's group, or null if it matches.
 */
export function describeSectionMismatch(
  pdfSectionStr: string,
  studentSemester: number | string,
  studentSectionLetter: string,
  program: string = 'BE-CSE'
): string | null {
  if (isSectionMatch(pdfSectionStr, studentSemester, studentSectionLetter, program)) {
    return null;
  }
  const targetSem = normalizeSemester(studentSemester);
  const targetLetter = studentSectionLetter.trim().toUpperCase();
  const expectedLabel = formatFullSection(program, targetSem, targetLetter);
  return `Section mismatch: Your profile is configured for Semester ${targetSem}, Section ${targetLetter} (${expectedLabel}), but the selected timetable section is "${pdfSectionStr}".`;
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

/**
 * Normalizes raw group strings (e.g. "Group 1", "G1", "Batch 1", "Gr.2") into internal 'G1' | 'G2' | 'ALL'.
 */
export function normalizeGroupScope(raw: string | null | undefined): 'G1' | 'G2' | 'ALL' {
  if (!raw) return 'ALL';
  const clean = raw.trim().toUpperCase();
  if (/^(?:GROUP[\s_-]*1|G[\s_-]*1|GR\.?[\s_-]*1|BATCH[\s_-]*1)$/i.test(clean)) {
    return 'G1';
  }
  if (/^(?:GROUP[\s_-]*2|G[\s_-]*2|GR\.?[\s_-]*2|BATCH[\s_-]*2)$/i.test(clean)) {
    return 'G2';
  }
  if (/^(?:ALL|BOTH|COMBINED|WHOLE[\s_-]*SECTION|ENTIRE[\s_-]*SECTION)$/i.test(clean)) {
    return 'ALL';
  }
  return 'ALL';
}

/**
 * Formats internal group scope into user-friendly display labels.
 */
export function formatGroupLabel(group: string | null | undefined): string {
  if (!group || group === 'ALL') return 'All (Combined Section)';
  if (group === 'G1') return 'Group 1 (G1)';
  if (group === 'G2') return 'Group 2 (G2)';
  return group;
}

/**
 * Determines whether a timetable slot applies to a student based on their group assignment:
 * - 'ALL' slots apply to EVERY student.
 * - 'G1' slots apply ONLY to Group 1 students.
 * - 'G2' slots apply ONLY to Group 2 students.
 * - If student group is unknown/unassigned: only 'ALL' slots apply by default.
 */
export function isSlotApplicableToStudent(
  slotGroup: string | null | undefined,
  studentGroup: string | null | undefined
): boolean {
  const normSlot = normalizeGroupScope(slotGroup);
  // Combined / whole-section slots always apply to every student
  if (normSlot === 'ALL') return true;

  // When a student has explicitly selected G1 or G2, only their group's slots apply
  if (studentGroup === 'G1' || studentGroup === 'G2') {
    return normSlot === studentGroup;
  }

  // When unassigned (null, undefined, or 'ALL'), the student views the whole-section schedule
  return true;
}

