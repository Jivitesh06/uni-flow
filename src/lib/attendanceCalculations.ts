export interface AttendanceStats {
  attended: number;
  conducted: number;
  percentage: number;
  target: number;
  classesNeeded: number;
  maxAbsences: number;
  isOnTrack: boolean;
}

export function calculateAttendanceStats(
  attended: number,
  conducted: number,
  target: number = 0.75
): AttendanceStats {
  if (conducted === 0) {
    return {
      attended: 0,
      conducted: 0,
      percentage: 0,
      target,
      classesNeeded: 0,
      maxAbsences: 0,
      isOnTrack: true,
    };
  }

  const percentage = (attended / conducted) * 100;
  const isOnTrack = percentage >= target * 100;

  // Classes to attend to reach target:
  // max(0, ceil((r*T - A) / (1 - r)))
  const classesNeeded = isOnTrack
    ? 0
    : Math.max(0, Math.ceil((target * conducted - attended) / (1 - target)));

  // Max absences: floor((A - r*T) / r) but only when on track
  // Derived from: (A) / (T + x) >= r => x <= A/r - T
  const maxAbsences = isOnTrack
    ? Math.floor(attended / target - conducted)
    : 0;

  return {
    attended,
    conducted,
    percentage,
    target,
    classesNeeded,
    maxAbsences: Math.max(0, maxAbsences),
    isOnTrack,
  };
}

export interface SubjectAttendanceAggregate {
  baselineAttended: number;
  baselineConducted: number;
  loggedAttended: number;
  loggedConducted: number;
  totalAttended: number;
  totalConducted: number;
  stats: AttendanceStats;
  hasBaseline: boolean;
}

/**
 * Filters attendance records so that only records applicable to the student's assigned group are counted:
 * - A student in G1 counts 'G1' and 'ALL' (and legacy unassigned) records.
 * - A student in G2 counts 'G2' and 'ALL' (and legacy unassigned) records.
 * - An unassigned student counts 'ALL' (and legacy unassigned) records.
 * - Another group's class is NEVER counted for the student.
 */
export function filterAttendanceRecordsByGroup<T extends { group?: string | null }>(
  records: T[],
  studentGroup?: string | null
): T[] {
  if (studentGroup === 'G1') {
    return records.filter((r) => !r.group || r.group === 'ALL' || r.group === 'G1');
  }
  if (studentGroup === 'G2') {
    return records.filter((r) => !r.group || r.group === 'ALL' || r.group === 'G2');
  }
  // Unknown or unassigned group: only combined/unlabelled classes count
  return records.filter((r) => !r.group || r.group === 'ALL');
}

/**
 * Determines the lecture period count and attendance weight from duration/period metadata.
 *
 * Rules:
 * - One-period class: weight 1
 * - Two-period lab: weight 2
 * - A continuous lab spanning consecutive periods records as ONE event with weight 2
 * - If parser/timing cannot determine weight reliably, flags session for review instead of guessing.
 */
export function calculateLectureWeight(slot: {
  startTime?: string;
  endTime?: string;
  periods?: number;
  weight?: number;
  subjectName?: string;
  room?: string;
}): { weight: number; isConfident: boolean; reason?: string } {
  if (typeof slot.weight === 'number' && slot.weight > 0) {
    return { weight: slot.weight, isConfident: true };
  }
  if (typeof slot.periods === 'number' && slot.periods > 0) {
    return { weight: slot.periods, isConfident: true };
  }

  if (slot.startTime && slot.endTime) {
    const [sh, sm] = slot.startTime.split(':').map(Number);
    const [eh, em] = slot.endTime.split(':').map(Number);
    if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
      const duration = (eh * 60 + em) - (sh * 60 + sm);
      if (duration >= 35 && duration <= 65) {
        return { weight: 1, isConfident: true };
      }
      if (duration >= 80 && duration <= 125) {
        return { weight: 2, isConfident: true };
      }
      if (duration >= 135 && duration <= 175) {
        return { weight: 3, isConfident: true };
      }
      if (duration >= 180 && duration <= 245) {
        return { weight: 4, isConfident: true };
      }
      return {
        weight: 1,
        isConfident: false,
        reason: `Non-standard slot duration of ${duration} minutes`,
      };
    }
  }

  return { weight: 1, isConfident: false, reason: 'Timing duration unavailable' };
}

/**
 * Combines manually configured previous baseline and lecture-by-lecture records without double-counting.
 * Backward compatible with legacy attendanceBaselines documents and legacy unweighted records.
 * Group-aware: filters out records belonging to other groups when studentGroup is specified.
 * Weight-aware: correctly accumulates weighted periods for multi-period labs (e.g. 2 periods).
 */
export function calculateSubjectAttendance(
  subject: {
    initialAttended?: number;
    initialConducted?: number;
    baselineAttended?: number;
    baselineConducted?: number;
  },
  records: Array<{ status: string; subjectId?: string; group?: string | null; weight?: number }>,
  target: number = 0.75,
  fallbackBaseline?: { attended?: number; conducted?: number } | null,
  studentGroup?: string | null
): SubjectAttendanceAggregate {
  const applicableRecords =
    studentGroup !== undefined
      ? filterAttendanceRecordsByGroup(records, studentGroup)
      : records;

  const rawBaselineAttended = subject.initialAttended ?? subject.baselineAttended ?? fallbackBaseline?.attended;
  const rawBaselineConducted = subject.initialConducted ?? subject.baselineConducted ?? fallbackBaseline?.conducted;

  const hasBaseline = typeof rawBaselineConducted === 'number' && rawBaselineConducted >= 0;

  const baselineConducted = hasBaseline ? Math.max(0, Math.floor(rawBaselineConducted)) : 0;
  const baselineAttended = hasBaseline ? Math.max(0, Math.min(baselineConducted, Math.floor(rawBaselineAttended ?? 0))) : 0;

  // Accumulate weighted period counts: default to weight 1 if weight is omitted on historical records
  const loggedAttended = applicableRecords
    .filter((r) => r.status === 'present')
    .reduce((sum, r) => sum + (typeof r.weight === 'number' && r.weight > 0 ? r.weight : 1), 0);

  const loggedConducted = applicableRecords
    .filter((r) => r.status !== 'not_marked' && r.status !== 'cancelled')
    .reduce((sum, r) => sum + (typeof r.weight === 'number' && r.weight > 0 ? r.weight : 1), 0);

  const totalAttended = baselineAttended + loggedAttended;
  const totalConducted = baselineConducted + loggedConducted;

  const stats = calculateAttendanceStats(totalAttended, totalConducted, target);

  return {
    baselineAttended,
    baselineConducted,
    loggedAttended,
    loggedConducted,
    totalAttended,
    totalConducted,
    stats,
    hasBaseline,
  };
}

export interface BaselineValidationResult {
  isValid: boolean;
  error?: string;
  attended: number;
  conducted: number;
}

/**
 * Validates manual attendance baseline input:
 * - Must be non-negative integers.
 * - Attended cannot exceed conducted.
 * - Handles zero total classes without error.
 */
export function validateAttendanceBaseline(
  attendedInput: string | number,
  conductedInput: string | number
): BaselineValidationResult {
  const attendedStr = String(attendedInput).trim();
  const conductedStr = String(conductedInput).trim();

  if (attendedStr === '' || conductedStr === '') {
    return {
      isValid: false,
      error: 'Please enter both attended and total conducted classes.',
      attended: 0,
      conducted: 0,
    };
  }

  const attendedNum = Number(attendedStr);
  const conductedNum = Number(conductedStr);

  if (isNaN(attendedNum) || isNaN(conductedNum)) {
    return {
      isValid: false,
      error: 'Please enter valid numerical values for classes.',
      attended: 0,
      conducted: 0,
    };
  }

  if (!Number.isInteger(attendedNum) || !Number.isInteger(conductedNum)) {
    return {
      isValid: false,
      error: 'Class counts must be whole integers without decimals.',
      attended: 0,
      conducted: 0,
    };
  }

  if (attendedNum < 0 || conductedNum < 0) {
    return {
      isValid: false,
      error: 'Class counts cannot be negative numbers.',
      attended: 0,
      conducted: 0,
    };
  }

  if (attendedNum > conductedNum) {
    return {
      isValid: false,
      error: `Attended classes (${attendedNum}) cannot exceed total conducted classes (${conductedNum}).`,
      attended: attendedNum,
      conducted: conductedNum,
    };
  }

  return {
    isValid: true,
    attended: attendedNum,
    conducted: conductedNum,
  };
}

/**
 * Strips a trailing `-FA` suffix (case-insensitively) from a subject name or course code,
 * after trimming whitespace.
 * Preserves names that contain 'FA' elsewhere or do not end with '-FA'.
 *
 * Examples:
 * - 'ADI-FA' -> 'ADI'
 * - 'ADI-fa' -> 'ADI'
 * - 'ADI - FA' -> 'ADI'
 * - 'DBMS-FA' -> 'DBMS'
 * - 'DBMS' -> 'DBMS'
 * - 'SOFA' -> 'SOFA'
 * - 'FARM' -> 'FARM'
 * - 'FIFA' -> 'FIFA'
 * - 'FA' -> 'FA'
 * - 'FA-101' -> 'FA-101'
 */
export function normalizeAttendanceSubjectCode(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return trimmed.replace(/[\s]*-[\s]*FA$/i, '').trim();
}

/**
 * Returns the canonical uppercase attendance key for matching subjects, slot codes, or record IDs.
 * Handles prefixes like 'shared_' and trailing '-FA'.
 *
 * Examples:
 * - 'ADI' -> 'ADI'
 * - 'ADI-FA' -> 'ADI'
 * - 'adi-fa' -> 'ADI'
 * - 'shared_adi-fa' -> 'ADI'
 * - 'shared_adi' -> 'ADI'
 */
export interface SubjectMatchEvidence {
  subjectA: string;
  subjectB: string;
  score: number;
  isConfident: boolean;
  isAmbiguous: boolean;
  reason: string;
  sharedFaculty?: boolean;
  sharedName?: boolean;
  suffixType?: 'THEORY' | 'LAB' | 'SPECIALIZATION' | 'TRUNCATION' | 'EXACT' | null;
}

export interface SubjectResolutionContext {
  canonicalKeyMap: Map<string, string>;
  canonicalNameMap?: Map<string, string>;
  aliasMap: Map<string, Set<string>>;
  ambiguousSubjects: string[];
  evidenceLog: SubjectMatchEvidence[];
  getCanonicalKey: (raw: string | null | undefined) => string;
  getCanonicalName?: (raw: string | null | undefined) => string;
  areEquivalent: (subA: any, subB: any) => boolean;
}

/**
 * Normalizes a subject code for timetable-aware matching:
 * - Trims whitespace
 * - Strips 'shared_' prefix
 * - Strips enclosing parentheses/brackets
 * - Normalizes internal spaces
 * - Converts to uppercase
 */
export function normalizeCodeForMatching(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();
  if (str.toLowerCase().startsWith('shared_')) {
    str = str.slice(7).trim();
  }
  str = str.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
  str = str.replace(/\s+/g, ' ').trim();
  return str.toUpperCase();
}

/**
 * Extracts acronym initials from a multi-word subject name, ignoring common stop words.
 * e.g. 'Linear Algebra and Calculus' -> 'LAC'
 */
function extractInitials(name: string): string {
  if (!name) return '';
  return name
    .replace(/[&/\\#,+()$~%.'":*?<>{}]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !['AND', 'OF', 'IN', 'FOR', 'TO', 'THE', 'A', 'AN', 'LAB', 'THEORY', 'PRACTICAL'].includes(w.toUpperCase()))
    .map((w) => w[0].toUpperCase())
    .join('');
}

/**
 * Evaluates match confidence between two candidate subjects based on:
 * - Direct / punctuation normalization
 * - Specialization suffixes (-FA)
 * - Theory/Lab variations (LAC vs LACT, SPC vs SPCL)
 * - Truncation detection with timetable corroboration (faculty, full name)
 * - Anti-collision guards (conflicting numbers, Roman numerals, conflicting acronyms)
 */
export function computeSubjectMatchScore(
  candA: { code?: string; name?: string; faculty?: string },
  candB: { code?: string; name?: string; faculty?: string }
): SubjectMatchEvidence {
  const codeA = normalizeCodeForMatching(candA.code || candA.name);
  const codeB = normalizeCodeForMatching(candB.code || candB.name);

  if (!codeA || !codeB) {
    return {
      subjectA: codeA,
      subjectB: codeB,
      score: 0,
      isConfident: false,
      isAmbiguous: false,
      reason: 'Empty subject code',
    };
  }

  // 1. Exact match
  if (codeA === codeB) {
    return {
      subjectA: codeA,
      subjectB: codeB,
      score: 1.0,
      isConfident: true,
      isAmbiguous: false,
      reason: 'Exact code match',
      suffixType: 'EXACT',
    };
  }

  // 2. Cleaned punctuation/spaces match (e.g. L.A.C. vs LAC, SPC - L vs SPCL)
  const strippedA = codeA.replace(/[\s.\-_/]+/g, '');
  const strippedB = codeB.replace(/[\s.\-_/]+/g, '');
  if (strippedA === strippedB) {
    return {
      subjectA: codeA,
      subjectB: codeB,
      score: 1.0,
      isConfident: true,
      isAmbiguous: false,
      reason: 'Punctuation/spacing normalized match',
      suffixType: 'EXACT',
    };
  }

  // 3. Specialization -FA match
  const noFaA = normalizeAttendanceSubjectCode(codeA).replace(/[\s.\-_/]+/g, '');
  const noFaB = normalizeAttendanceSubjectCode(codeB).replace(/[\s.\-_/]+/g, '');
  if (noFaA === noFaB) {
    return {
      subjectA: codeA,
      subjectB: codeB,
      score: 1.0,
      isConfident: true,
      isAmbiguous: false,
      reason: 'Specialization -FA variant',
      suffixType: 'SPECIALIZATION',
    };
  }

  // 4. Hard Anti-collision Guards: Different numeric or Roman numeral levels
  const numRegex = /(?:[\s.\-_]+(I{1,3}|IV|V|VI{0,3}|IX|X)|(?:[\s.\-_]?)([0-9]+))$/i;
  const matchNumA = codeA.match(numRegex);
  const matchNumB = codeB.match(numRegex);
  if (matchNumA && matchNumB) {
    const valA = (matchNumA[1] || matchNumA[2]).toUpperCase();
    const valB = (matchNumB[1] || matchNumB[2]).toUpperCase();
    if (valA !== valB) {
      return {
        subjectA: codeA,
        subjectB: codeB,
        score: 0.0,
        isConfident: true,
        isAmbiguous: false,
        reason: `Conflicting numeric/level suffixes (${valA} vs ${valB})`,
      };
    }
  }

  const courseNumRegex = /\b(\d{3,4})\b/;
  const cNumA = codeA.match(courseNumRegex);
  const cNumB = codeB.match(courseNumRegex);
  if (cNumA && cNumB && cNumA[1] !== cNumB[1]) {
    return {
      subjectA: codeA,
      subjectB: codeB,
      score: 0.0,
      isConfident: true,
      isAmbiguous: false,
      reason: `Conflicting course numbers (${cNumA[1]} vs ${cNumB[1]})`,
    };
  }

  // Determine shorter and longer representations
  const short = strippedA.length <= strippedB.length ? strippedA : strippedB;
  const long = strippedA.length <= strippedB.length ? strippedB : strippedA;
  const candShort = strippedA.length <= strippedB.length ? candA : candB;
  const candLong = strippedA.length <= strippedB.length ? candB : candA;

  // 5. Theory / Lab Suffix Matching (e.g. LAC vs LACT, SPC vs SPCL)
  if (long.startsWith(short)) {
    const remainder = long.slice(short.length);
    const isTheory = ['T', 'TH', 'THEORY'].includes(remainder);
    const isLab = ['L', 'LB', 'LAB', 'P', 'PR', 'PRAC', 'PRACTICAL'].includes(remainder);

    if (isTheory || isLab) {
      const suffixType = isTheory ? 'THEORY' : 'LAB';

      const facultyMatch = Boolean(
        candShort.faculty &&
        candLong.faculty &&
        candShort.faculty.trim().toLowerCase() === candLong.faculty.trim().toLowerCase()
      );

      const nameCleanShort = (candShort.name || '').trim().toLowerCase().replace(/[\s.\-_/]+/g, '');
      const nameCleanLong = (candLong.name || '').trim().toLowerCase().replace(/[\s.\-_/]+/g, '');
      const nameMatch = Boolean(
        nameCleanShort &&
        nameCleanLong &&
        (nameCleanShort === nameCleanLong ||
         nameCleanLong.startsWith(nameCleanShort) ||
         nameCleanShort.startsWith(nameCleanLong))
      );

      if (short.length >= 3) {
        let score = 0.88;
        if (facultyMatch) score += 0.10;
        if (nameMatch) score += 0.10;
        score = Math.min(1.0, score);
        return {
          subjectA: codeA,
          subjectB: codeB,
          score,
          isConfident: score >= 0.75,
          isAmbiguous: false,
          reason: `${suffixType} suffix on base code (${short})`,
          sharedFaculty: facultyMatch,
          sharedName: nameMatch,
          suffixType,
        };
      } else if (short.length === 2) {
        if (facultyMatch || nameMatch) {
          const score = facultyMatch && nameMatch ? 0.95 : 0.85;
          return {
            subjectA: codeA,
            subjectB: codeB,
            score,
            isConfident: true,
            isAmbiguous: false,
            reason: `${suffixType} suffix on 2-letter code (${short}) with corroborating evidence`,
            sharedFaculty: facultyMatch,
            sharedName: nameMatch,
            suffixType,
          };
        } else {
          return {
            subjectA: codeA,
            subjectB: codeB,
            score: 0.35,
            isConfident: false,
            isAmbiguous: false,
            reason: `Uncorroborated ${suffixType} suffix on short 2-letter code (${short})`,
            suffixType,
          };
        }
      }
    }
  }

  // 6. General Prefix Truncation (column width constraint e.g. COMP vs COMPILER)
  if (long.startsWith(short) && short.length >= 4) {
    const facultyMatch = Boolean(
      candShort.faculty &&
      candLong.faculty &&
      candShort.faculty.trim().toLowerCase() === candLong.faculty.trim().toLowerCase()
    );
    const nameMatch = Boolean(
      candShort.name &&
      candLong.name &&
      (candShort.name.trim().toLowerCase() === candLong.name.trim().toLowerCase() ||
       candLong.name.toLowerCase().includes(candShort.name.toLowerCase()) ||
       candShort.name.toLowerCase().includes(candLong.name.toLowerCase()))
    );

    if (facultyMatch || nameMatch) {
      const score = facultyMatch && nameMatch ? 0.95 : 0.88;
      return {
        subjectA: codeA,
        subjectB: codeB,
        score,
        isConfident: true,
        isAmbiguous: false,
        reason: `Truncated subject prefix (${short} -> ${long}) with timetable corroboration`,
        sharedFaculty: facultyMatch,
        sharedName: nameMatch,
        suffixType: 'TRUNCATION',
      };
    } else {
      return {
        subjectA: codeA,
        subjectB: codeB,
        score: 0.40,
        isConfident: false,
        isAmbiguous: false,
        reason: `Truncated prefix (${short} -> ${long}) without corroborating faculty/name evidence`,
        suffixType: 'TRUNCATION',
      };
    }
  }

  // 7. Full Subject Name Match across slots
  const nameA = (candA.name || '').trim().toLowerCase();
  const nameB = (candB.name || '').trim().toLowerCase();
  if (nameA && nameB) {
    const normNameA = nameA.replace(/[\s.\-_/]+/g, '');
    const normNameB = nameB.replace(/[\s.\-_/]+/g, '');
    if (normNameA === normNameB) {
      return {
        subjectA: codeA,
        subjectB: codeB,
        score: 0.98,
        isConfident: true,
        isAmbiguous: false,
        reason: 'Identical full subject name across slots',
        sharedName: true,
      };
    }
  }

  // 8. Initials / Acronym Cross-Matching
  const initialsA = extractInitials(candA.name || '');
  const initialsB = extractInitials(candB.name || '');

  if (initialsA && initialsB && initialsA !== initialsB && codeA !== codeB) {
    return {
      subjectA: codeA,
      subjectB: codeB,
      score: 0.0,
      isConfident: true,
      isAmbiguous: false,
      reason: `Conflicting acronyms derived from subject names (${initialsA} vs ${initialsB})`,
    };
  }

  if (
    (initialsA && initialsA.length >= 2 && (codeB === initialsA || strippedB === initialsA)) ||
    (initialsB && initialsB.length >= 2 && (codeA === initialsB || strippedA === initialsB))
  ) {
    return {
      subjectA: codeA,
      subjectB: codeB,
      score: 0.92,
      isConfident: true,
      isAmbiguous: false,
      reason: 'Cross acronym match from full subject name',
    };
  }

  return {
    subjectA: codeA,
    subjectB: codeB,
    score: 0.0,
    isConfident: false,
    isAmbiguous: false,
    reason: 'Distinct subjects',
  };
}

/**
 * Builds a dynamic subject equivalence map and resolution context for a specific timetable scope.
 * Clusters equivalent variants (e.g. LAC & LACT, SPC & SPCL, ADI & ADI-FA) while strictly
 * preserving genuinely distinct subjects (e.g. CN vs CNS, MATH1 vs MATH2) and detecting ambiguity.
 */
export function buildTimetableSubjectEquivalenceMap(
  slots: Array<{
    id?: string;
    subjectId?: string;
    subjectName?: string;
    subjectCode?: string;
    faculty?: string;
    color?: string;
    room?: string;
    weight?: number;
    periods?: number;
  }> = [],
  userSubjects: Array<{
    id?: string;
    code?: string;
    name?: string;
    faculty?: string;
  }> = []
): SubjectResolutionContext {
  const candidateMap = new Map<
    string,
    {
      baseKey: string;
      primaryCode: string;
      primaryName: string;
      faculties: Set<string>;
      rawCodes: Set<string>;
      rawNames: Set<string>;
      color?: string;
    }
  >();

  function recordCandidate(item: {
    code?: string;
    subjectCode?: string;
    name?: string;
    subjectName?: string;
    faculty?: string;
    color?: string;
  }) {
    if (!item) return;
    if (
      (item as any).isNonAcademic ||
      (item as any).isFreePeriod ||
      /^(?:Lib|Library|Free Period)$/i.test(item.code || item.subjectCode || '') ||
      /^(?:Lib|Library|Free Period)$/i.test(item.name || item.subjectName || '')
    ) {
      return;
    }
    const rawCode = (item.code || item.subjectCode || item.name || item.subjectName || '').trim();
    const rawName = (item.name || item.subjectName || item.code || item.subjectCode || '').trim();
    if (!rawCode && !rawName) return;

    const baseKey = normalizeCodeForMatching(rawCode || rawName);
    if (!baseKey) return;

    if (!candidateMap.has(baseKey)) {
      candidateMap.set(baseKey, {
        baseKey,
        primaryCode: rawCode || baseKey,
        primaryName: rawName || baseKey,
        faculties: new Set(item.faculty ? [item.faculty.trim()] : []),
        rawCodes: new Set([rawCode]),
        rawNames: new Set([rawName]),
        color: item.color,
      });
    } else {
      const existing = candidateMap.get(baseKey)!;
      if (item.faculty) existing.faculties.add(item.faculty.trim());
      if (rawCode) existing.rawCodes.add(rawCode);
      if (rawName) existing.rawNames.add(rawName);
      if (rawName && rawName.length > existing.primaryName.length && !rawName.toUpperCase().endsWith('-FA')) {
        existing.primaryName = rawName;
      }
    }
  }

  for (const s of slots) recordCandidate(s);
  for (const u of userSubjects) recordCandidate(u);

  const candidates = Array.from(candidateMap.values());
  const evidenceLog: SubjectMatchEvidence[] = [];
  const matchesByCandidate = new Map<string, Array<{ target: string; score: number; reason: string }>>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const c1 = candidates[i];
      const c2 = candidates[j];
      const match = computeSubjectMatchScore(
        { code: c1.primaryCode, name: c1.primaryName, faculty: Array.from(c1.faculties)[0] },
        { code: c2.primaryCode, name: c2.primaryName, faculty: Array.from(c2.faculties)[0] }
      );

      if (match.score >= 0.75) {
        evidenceLog.push({
          subjectA: c1.baseKey,
          subjectB: c2.baseKey,
          score: match.score,
          reason: match.reason,
          isConfident: match.isConfident,
          isAmbiguous: match.isAmbiguous,
          suffixType: match.suffixType,
          sharedFaculty: match.sharedFaculty,
          sharedName: match.sharedName,
        });

        if (!matchesByCandidate.has(c1.baseKey)) matchesByCandidate.set(c1.baseKey, []);
        if (!matchesByCandidate.has(c2.baseKey)) matchesByCandidate.set(c2.baseKey, []);
        matchesByCandidate.get(c1.baseKey)!.push({ target: c2.baseKey, score: match.score, reason: match.reason });
        matchesByCandidate.get(c2.baseKey)!.push({ target: c1.baseKey, score: match.score, reason: match.reason });
      }
    }
  }

  // Detect ambiguity: if a candidate matches multiple candidates with comparable scores
  const ambiguousSet = new Set<string>();
  for (const [key, list] of matchesByCandidate.entries()) {
    if (list.length > 1) {
      list.sort((a, b) => b.score - a.score);
      if (Math.abs(list[0].score - list[1].score) < 0.15) {
        ambiguousSet.add(key);
        for (const item of list) ambiguousSet.add(item.target);
      }
    }
  }

  // Disjoint Set Union (Union-Find)
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }
  function union(x: string, y: string) {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }

  for (const ev of evidenceLog) {
    if (ambiguousSet.has(ev.subjectA) || ambiguousSet.has(ev.subjectB)) {
      continue; // Ambiguous: do NOT silently merge
    }
    union(ev.subjectA, ev.subjectB);
  }

  const clusters = new Map<string, typeof candidates>();
  for (const cand of candidates) {
    const root = find(cand.baseKey);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(cand);
  }

  const canonicalKeyMap = new Map<string, string>();
  const canonicalNameMap = new Map<string, string>();
  const aliasMap = new Map<string, Set<string>>();

  for (const [, cluster] of clusters.entries()) {
    // Choose canonical code: prefer base code without theory/lab/FA suffix
    const sortedCodes = [...cluster].sort((a, b) => {
      const aHasSuffix = /(?:[\s\-_]?(?:T|TH|THEORY|L|LB|LAB|P|PR|PRAC|FA))$/i.test(a.baseKey);
      const bHasSuffix = /(?:[\s\-_]?(?:T|TH|THEORY|L|LB|LAB|P|PR|PRAC|FA))$/i.test(b.baseKey);
      if (aHasSuffix && !bHasSuffix) return 1;
      if (!aHasSuffix && bHasSuffix) return -1;
      return a.baseKey.length - b.baseKey.length;
    });

    const canonicalCode = sortedCodes[0].primaryCode.replace(/[\s]*-[\s]*FA$/i, '').trim();
    const canonicalKey = normalizeCodeForMatching(canonicalCode);

    // Choose canonical name: prefer base name without Lab/Tutorial/FA suffix, then longest
    const sortedNames = cluster
      .flatMap((c) => Array.from(c.rawNames))
      .filter((n) => n && n.length > 2 && !/^[A-Z0-9\-_]{2,6}$/.test(n))
      .sort((a, b) => {
        const aHasSuffix = /(?:[\s\-_]?(?:Lab|Tutorial|FA|\(Financial Apps\)|Practical|Practice))$/i.test(a.trim());
        const bHasSuffix = /(?:[\s\-_]?(?:Lab|Tutorial|FA|\(Financial Apps\)|Practical|Practice))$/i.test(b.trim());
        if (aHasSuffix && !bHasSuffix) return 1;
        if (!aHasSuffix && bHasSuffix) return -1;
        return b.length - a.length;
      });

    const canonicalName = sortedNames[0] || sortedCodes[0].primaryName || canonicalCode;
    canonicalNameMap.set(canonicalKey, canonicalName);

    const aliases = new Set<string>();
    for (const member of cluster) {
      for (const rc of member.rawCodes) {
        if (!rc) continue;
        const normRc = normalizeCodeForMatching(rc);
        const strippedRc = normRc.replace(/[\s.\-_/]+/g, '');
        const noFaStrippedRc = normalizeAttendanceSubjectCode(normRc).replace(/[\s.\-_/]+/g, '');

        aliases.add(rc);
        aliases.add(normRc);
        aliases.add(strippedRc);
        aliases.add(`shared_${rc.toLowerCase()}`);
        aliases.add(`shared_${normRc.toLowerCase()}`);

        canonicalKeyMap.set(normRc, canonicalKey);
        canonicalKeyMap.set(rc.toUpperCase(), canonicalKey);
        canonicalKeyMap.set(`SHARED_${normRc}`, canonicalKey);
        canonicalKeyMap.set(strippedRc, canonicalKey);
        canonicalKeyMap.set(noFaStrippedRc, canonicalKey);
      }
      for (const rn of member.rawNames) {
        if (rn) aliases.add(rn);
      }
    }

    aliasMap.set(canonicalKey, aliases);
  }

  function getCanonicalKey(raw: string | null | undefined): string {
    if (!raw || typeof raw !== 'string') return '';
    const norm = normalizeCodeForMatching(raw);
    const direct = canonicalKeyMap.get(norm) || canonicalKeyMap.get(raw.toUpperCase());
    if (direct) return direct;

    const stripped = norm.replace(/[\s.\-_/]+/g, '');
    const strippedMatch = canonicalKeyMap.get(stripped);
    if (strippedMatch) return strippedMatch;

    const noFaStripped = normalizeAttendanceSubjectCode(norm).replace(/[\s.\-_/]+/g, '');
    const noFaMatch = canonicalKeyMap.get(noFaStripped);
    if (noFaMatch) return noFaMatch;

    return norm;
  }

  function getCanonicalName(raw: string | null | undefined): string {
    if (!raw || typeof raw !== 'string') return '';
    const key = getCanonicalKey(raw);
    return canonicalNameMap.get(key) || key;
  }

  function areEquivalent(subA: any, subB: any): boolean {
    if (!subA || !subB) return false;
    const keyA = typeof subA === 'string' ? getCanonicalKey(subA) : getCanonicalKey(subA.code || subA.name || subA.id);
    const keyB = typeof subB === 'string' ? getCanonicalKey(subB) : getCanonicalKey(subB.code || subB.name || subB.id);
    return Boolean(keyA && keyB && keyA === keyB);
  }

  return {
    canonicalKeyMap,
    canonicalNameMap,
    aliasMap,
    ambiguousSubjects: Array.from(ambiguousSet),
    evidenceLog,
    getCanonicalKey,
    getCanonicalName,
    areEquivalent,
  };
}

/**
 * Returns the canonical uppercase attendance key for matching subjects, slot codes, or record IDs.
 * Handles prefixes like 'shared_' and trailing '-FA', and supports dynamic resolution context.
 */
export function getCanonicalSubjectKey(
  identifier: string | null | undefined,
  context?: SubjectResolutionContext | null
): string {
  if (!identifier || typeof identifier !== 'string') return '';
  if (context) {
    return context.getCanonicalKey(identifier);
  }
  let cleaned = identifier.trim();
  if (cleaned.toLowerCase().startsWith('shared_')) {
    cleaned = cleaned.slice(7);
  }
  const stripped = normalizeAttendanceSubjectCode(cleaned);
  return stripped.toUpperCase();
}

/**
 * Checks whether two subject representations or identifiers represent the same
 * attendance subject, respecting the canonical `-FA` suffix normalization and dynamic timetable context.
 */
export function isSameAttendanceSubject(
  subA: { id?: string; code?: string; name?: string; aliases?: string[] } | string | null | undefined,
  subB: { id?: string; code?: string; name?: string; aliases?: string[] } | string | null | undefined,
  context?: SubjectResolutionContext | null
): boolean {
  if (!subA || !subB) return false;

  if (context) {
    return context.areEquivalent(subA, subB);
  }

  const keyA = typeof subA === 'string'
    ? getCanonicalSubjectKey(subA)
    : getCanonicalSubjectKey(subA.code || subA.name || subA.id);

  const keyB = typeof subB === 'string'
    ? getCanonicalSubjectKey(subB)
    : getCanonicalSubjectKey(subB.code || subB.name || subB.id);

  if (keyA && keyB && keyA === keyB) return true;

  // Direct ID match fallback
  const idA = typeof subA === 'string' ? subA : subA.id;
  const idB = typeof subB === 'string' ? subB : subB.id;
  return Boolean(idA && idB && idA === idB);
}

/**
 * Checks whether an attendance record's subjectId or code belongs to a given subject,
 * respecting `-FA` normalization, aliases, dynamic timetable context, and legacy shared subject ID variants.
 */
export function matchesSubjectRecord(
  subject: { id?: string; code?: string; name?: string; aliases?: string[] } | string | null | undefined,
  recordSubjectId: string | null | undefined,
  context?: SubjectResolutionContext | null
): boolean {
  if (!subject || !recordSubjectId) return false;

  // 1. Direct exact ID match
  if (typeof subject !== 'string' && subject.id && subject.id === recordSubjectId) {
    return true;
  }

  // 2. Direct exact code match
  if (typeof subject !== 'string' && subject.code && subject.code === recordSubjectId) {
    return true;
  }

  // 3. Exact shared ID match
  if (typeof subject !== 'string' && subject.code) {
    const sharedBaseId = `shared_${subject.code.toLowerCase()}`;
    if (recordSubjectId.toLowerCase() === sharedBaseId.toLowerCase()) {
      return true;
    }
  }

  // 4. Aliases array attached to subject
  if (typeof subject !== 'string' && Array.isArray(subject.aliases)) {
    const recClean = recordSubjectId.trim().toUpperCase();
    const recNoShared = recClean.startsWith('SHARED_') ? recClean.slice(7) : recClean;
    const recNoFA = normalizeAttendanceSubjectCode(recNoShared).toUpperCase();
    for (const alias of subject.aliases) {
      const aliasClean = alias.trim().toUpperCase();
      const aliasNoShared = aliasClean.startsWith('SHARED_') ? aliasClean.slice(7) : aliasClean;
      const aliasNoFA = normalizeAttendanceSubjectCode(aliasNoShared).toUpperCase();
      if (
        aliasClean === recClean ||
        aliasNoShared === recNoShared ||
        aliasNoFA === recNoFA ||
        aliasClean === `SHARED_${recClean}` ||
        `SHARED_${aliasClean}` === recClean
      ) {
        return true;
      }
    }
  }

  // 5. Context-based matching if context passed
  if (context) {
    const keyA = typeof subject === 'string'
      ? context.getCanonicalKey(subject)
      : context.getCanonicalKey(subject.code || subject.name || subject.id);
    const keyB = context.getCanonicalKey(recordSubjectId);
    if (keyA && keyB && keyA === keyB) return true;
  }

  return isSameAttendanceSubject(subject, recordSubjectId, context);
}

/**
 * Consolidates user enrolled subjects and timetable class slots into a unified,
 * canonical list of subjects for all attendance views.
 *
 * Dynamically resolves timetable-based variations (e.g. LAC & LACT, SPC & SPCL, ADI & ADI-FA)
 * into their unified canonical subject identity while retaining base naming, colors,
 * combined baselines, and maintaining full compatibility with historical records.
 */
export function canonicalizeSubjectsForAttendance<T extends {
  id: string;
  uid?: string;
  name: string;
  code: string;
  faculty?: string;
  credits?: number;
  color?: string;
  initialAttended?: number;
  initialConducted?: number;
  baselineAttended?: number;
  baselineConducted?: number;
  createdAt?: any;
  updatedAt?: any;
  aliases?: string[];
}>(
  userSubjects: T[],
  timetableSlots: Array<{
    id?: string;
    subjectId?: string;
    subjectName?: string;
    subjectCode?: string;
    faculty?: string;
    color?: string;
    room?: string;
    weight?: number;
    periods?: number;
  }>,
  currentUid: string = 'shared',
  existingContext?: SubjectResolutionContext | null
): T[] {
  const context = existingContext || buildTimetableSubjectEquivalenceMap(timetableSlots, userSubjects);
  const map = new Map<string, T>();

  // 1. Process user enrolled subjects first
  for (const sub of userSubjects) {
    if (
      (sub as any).isNonAcademic ||
      (sub as any).isFreePeriod ||
      /^(?:Lib|Library|Free Period)$/i.test(sub.code || '') ||
      /^(?:Lib|Library|Free Period)$/i.test(sub.name || '')
    ) {
      continue;
    }
    const canonicalKey = context.getCanonicalKey(sub.code || sub.name);
    if (!canonicalKey) continue;

    const clusterAliases = Array.from(context.aliasMap.get(canonicalKey) || []);
    const allAliases = Array.from(new Set([...clusterAliases, sub.code, sub.id, `shared_${sub.code.toLowerCase()}`]));

    if (!map.has(canonicalKey)) {
      const baseCode = canonicalKey || normalizeAttendanceSubjectCode(sub.code);
      const clusterName = context.getCanonicalName ? context.getCanonicalName(canonicalKey) : '';
      const baseName = clusterName || normalizeAttendanceSubjectCode(sub.name) || sub.name;
      map.set(canonicalKey, {
        ...sub,
        code: baseCode,
        name: baseName,
        aliases: allAliases,
      });
    } else {
      const existing = map.get(canonicalKey)!;
      const combinedInitialAttended =
        (existing.initialAttended ?? 0) + (sub.initialAttended ?? 0);
      const combinedInitialConducted =
        (existing.initialConducted ?? 0) + (sub.initialConducted ?? 0);

      const preferredName =
        !sub.name.toUpperCase().endsWith('-FA') && sub.name.length >= existing.name.length
          ? sub.name
          : existing.name;

      const mergedAliases = Array.from(new Set([...(existing.aliases || []), ...allAliases]));

      map.set(canonicalKey, {
        ...existing,
        name: preferredName,
        aliases: mergedAliases,
        initialAttended:
          existing.initialAttended !== undefined || sub.initialAttended !== undefined
            ? combinedInitialAttended
            : undefined,
        initialConducted:
          existing.initialConducted !== undefined || sub.initialConducted !== undefined
            ? combinedInitialConducted
            : undefined,
        baselineAttended:
          existing.baselineAttended !== undefined || sub.baselineAttended !== undefined
            ? (existing.baselineAttended ?? 0) + (sub.baselineAttended ?? 0)
            : undefined,
        baselineConducted:
          existing.baselineConducted !== undefined || sub.baselineConducted !== undefined
            ? (existing.baselineConducted ?? 0) + (sub.baselineConducted ?? 0)
            : undefined,
      });
    }
  }

  // 2. Process timetable slots (shared & personal)
  for (const slot of timetableSlots) {
    if (
      (slot as any).isNonAcademic ||
      (slot as any).isFreePeriod ||
      /^(?:Lib|Library|Free Period)$/i.test(slot.subjectCode || '') ||
      /^(?:Lib|Library|Free Period)$/i.test(slot.subjectName || '')
    ) {
      continue;
    }
    const rawCode = slot.subjectCode || slot.subjectName || '';
    const canonicalKey = context.getCanonicalKey(rawCode);
    if (!canonicalKey) continue;

    const clusterAliases = Array.from(context.aliasMap.get(canonicalKey) || []);
    const allAliases = Array.from(new Set([...clusterAliases, rawCode, `shared_${rawCode.toLowerCase()}`]));

    if (!map.has(canonicalKey)) {
      const baseCode = canonicalKey || normalizeAttendanceSubjectCode(rawCode);
      const clusterName = context.getCanonicalName ? context.getCanonicalName(canonicalKey) : '';
      const baseName = clusterName || normalizeAttendanceSubjectCode(slot.subjectName || rawCode) || baseCode;

      const newSubject: any = {
        id: `shared_${baseCode.toLowerCase()}`,
        uid: currentUid || 'shared',
        name: baseName,
        code: baseCode,
        faculty: slot.faculty,
        credits: 3,
        color: slot.color || '#3b82f6',
        aliases: allAliases,
        createdAt: slot && 'createdAt' in slot ? (slot as any).createdAt : undefined,
        updatedAt: slot && 'updatedAt' in slot ? (slot as any).updatedAt : undefined,
      };
      map.set(canonicalKey, newSubject);
    } else {
      const existing = map.get(canonicalKey)!;
      const mergedAliases = Array.from(new Set([...(existing.aliases || []), ...allAliases]));
      existing.aliases = mergedAliases;

      const currentCanonicalName = context.getCanonicalName ? context.getCanonicalName(canonicalKey) : '';
      if (currentCanonicalName && existing.name !== currentCanonicalName) {
        existing.name = currentCanonicalName;
        existing.code = canonicalKey;
      } else if (
        (existing.name.toUpperCase().endsWith('-FA') || /(?:T|TH|L|LAB)$/i.test(existing.name)) &&
        slot.subjectName &&
        !slot.subjectName.toUpperCase().endsWith('-FA') &&
        !/(?:T|TH|L|LAB)$/i.test(slot.subjectName)
      ) {
        existing.name = slot.subjectName;
        existing.code = canonicalKey;
      }
    }
  }

  return Array.from(map.values());
}

