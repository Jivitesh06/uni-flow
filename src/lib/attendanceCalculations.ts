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
export function getCanonicalSubjectKey(identifier: string | null | undefined): string {
  if (!identifier || typeof identifier !== 'string') return '';
  let cleaned = identifier.trim();
  if (cleaned.toLowerCase().startsWith('shared_')) {
    cleaned = cleaned.slice(7);
  }
  const stripped = normalizeAttendanceSubjectCode(cleaned);
  return stripped.toUpperCase();
}

/**
 * Checks whether two subject representations or identifiers represent the same
 * attendance subject, respecting the canonical `-FA` suffix normalization.
 */
export function isSameAttendanceSubject(
  subA: { id?: string; code?: string; name?: string } | string | null | undefined,
  subB: { id?: string; code?: string; name?: string } | string | null | undefined
): boolean {
  if (!subA || !subB) return false;

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
 * respecting `-FA` normalization and legacy shared subject ID variants.
 */
export function matchesSubjectRecord(
  subject: { id?: string; code?: string; name?: string } | string | null | undefined,
  recordSubjectId: string | null | undefined
): boolean {
  if (!subject || !recordSubjectId) return false;

  // Direct exact ID match
  if (typeof subject !== 'string' && subject.id && subject.id === recordSubjectId) {
    return true;
  }

  // Exact shared ID match
  if (typeof subject !== 'string' && subject.code) {
    const sharedBaseId = `shared_${subject.code.toLowerCase()}`;
    if (recordSubjectId.toLowerCase() === sharedBaseId.toLowerCase()) {
      return true;
    }
  }

  return isSameAttendanceSubject(subject, recordSubjectId);
}

/**
 * Consolidates user enrolled subjects and timetable class slots into a unified,
 * canonical list of subjects for all attendance views.
 *
 * Merges `-FA` variants (e.g. 'ADI-FA') into the base canonical subject (e.g. 'ADI')
 * while retaining base naming, colors, and combining baselines.
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
}>(
  userSubjects: T[],
  timetableSlots: Array<{
    id?: string;
    subjectId?: string;
    subjectName?: string;
    subjectCode?: string;
    faculty?: string;
    color?: string;
  }>,
  currentUid: string = 'shared'
): T[] {
  const map = new Map<string, T>();

  // 1. Process user enrolled subjects first
  for (const sub of userSubjects) {
    const canonicalKey = getCanonicalSubjectKey(sub.code || sub.name);
    if (!canonicalKey) continue;

    if (!map.has(canonicalKey)) {
      const baseCode = normalizeAttendanceSubjectCode(sub.code) || canonicalKey;
      const baseName = normalizeAttendanceSubjectCode(sub.name) || sub.name;
      map.set(canonicalKey, {
        ...sub,
        code: baseCode,
        name: baseName,
      });
    } else {
      const existing = map.get(canonicalKey)!;
      const combinedInitialAttended =
        (existing.initialAttended ?? 0) + (sub.initialAttended ?? 0);
      const combinedInitialConducted =
        (existing.initialConducted ?? 0) + (sub.initialConducted ?? 0);

      const preferredName = !sub.name.toUpperCase().endsWith('-FA') ? sub.name : existing.name;

      map.set(canonicalKey, {
        ...existing,
        name: preferredName,
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
    const rawCode = slot.subjectCode || slot.subjectName || '';
    const canonicalKey = getCanonicalSubjectKey(rawCode);
    if (!canonicalKey) continue;

    if (!map.has(canonicalKey)) {
      const baseCode = normalizeAttendanceSubjectCode(rawCode) || canonicalKey;
      const baseName = normalizeAttendanceSubjectCode(slot.subjectName || rawCode) || baseCode;

      const newSubject: any = {
        id: `shared_${baseCode.toLowerCase()}`,
        uid: currentUid || 'shared',
        name: baseName,
        code: baseCode,
        faculty: slot.faculty,
        credits: 3,
        color: slot.color || '#3b82f6',
        createdAt: slot && 'createdAt' in slot ? (slot as any).createdAt : undefined,
        updatedAt: slot && 'updatedAt' in slot ? (slot as any).updatedAt : undefined,
      };
      map.set(canonicalKey, newSubject);
    } else {
      const existing = map.get(canonicalKey)!;
      // If the existing entry had an -FA name and this slot provides the clean base name, upgrade it
      if (
        existing.name.toUpperCase().endsWith('-FA') &&
        slot.subjectName &&
        !slot.subjectName.toUpperCase().endsWith('-FA')
      ) {
        existing.name = slot.subjectName;
      }
    }
  }

  return Array.from(map.values());
}
