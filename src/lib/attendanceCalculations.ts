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
 * Combines manually configured previous baseline and lecture-by-lecture records without double-counting.
 * Backward compatible with legacy attendanceBaselines documents.
 */
export function calculateSubjectAttendance(
  subject: {
    initialAttended?: number;
    initialConducted?: number;
    baselineAttended?: number;
    baselineConducted?: number;
  },
  records: Array<{ status: string; subjectId?: string }>,
  target: number = 0.75,
  fallbackBaseline?: { attended?: number; conducted?: number } | null
): SubjectAttendanceAggregate {
  const rawBaselineAttended = subject.initialAttended ?? subject.baselineAttended ?? fallbackBaseline?.attended;
  const rawBaselineConducted = subject.initialConducted ?? subject.baselineConducted ?? fallbackBaseline?.conducted;

  const hasBaseline = typeof rawBaselineConducted === 'number' && rawBaselineConducted >= 0;

  const baselineConducted = hasBaseline ? Math.max(0, Math.floor(rawBaselineConducted)) : 0;
  const baselineAttended = hasBaseline ? Math.max(0, Math.min(baselineConducted, Math.floor(rawBaselineAttended ?? 0))) : 0;

  const loggedAttended = records.filter((r) => r.status === 'present').length;
  const loggedConducted = records.filter((r) => r.status !== 'not_marked' && r.status !== 'cancelled').length;

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
