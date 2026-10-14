import type { TimetableSlot } from '../types';

export type LiveClassStatus =
  | 'LIVE_NOW'
  | 'STARTING_SOON'
  | 'FREE_NOW'
  | 'NO_MORE_CLASSES_TODAY'
  | 'NO_CLASSES_TODAY'
  | 'EMPTY_TIMETABLE';

export interface NextScheduledDay {
  dayOfWeek: number;
  dayName: string;
  firstSlot: TimetableSlot;
  daysAway: number;
}

export interface FreePeriod {
  start: string; // HH:mm
  end: string;   // HH:mm
  durationMinutes: number;
}

export interface LiveDashboardState {
  status: LiveClassStatus;
  currentSlot: TimetableSlot | null;
  startingSoonSlot: TimetableSlot | null;
  nextSlot: TimetableSlot | null;
  targetSlotSessionNumber?: number; // Institutional period index (1-based)
  targetSlotPeriodLabel?: string;   // Formatted period label, e.g. "Lecture 1" or "Lecture 1–2"
  targetSlotCompactLabel?: string;  // Compact period label, e.g. "L1" or "L1–2"
  totalSubjectSessionsToday?: number; // Total scheduled sessions for this subject on today's schedule
  currentFreePeriod: FreePeriod | null;
  todaySlots: TimetableSlot[];
  remainingSlots: TimetableSlot[];
  nextScheduledDay: NextScheduledDay | null;
  minutesRemainingInCurrent: number;
  minutesUntilNext: number;
  timeRemainingFormatted: string;
}

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Converts "HH:mm" time string into minutes from midnight (0 to 1439).
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const parts = timeStr.trim().split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

/**
 * Formats a duration in minutes into human readable "1h 25m" or "42m".
 */
export function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * Normalizes subject key to match slots belonging to the same academic subject.
 */
export function getSubjectMatchKey(slot?: { subjectId?: string; subjectCode?: string; subjectName?: string } | null): string {
  if (!slot) return '';
  if (slot.subjectId && slot.subjectId.trim()) return slot.subjectId.trim().toUpperCase();
  if (slot.subjectCode && slot.subjectCode.trim()) return slot.subjectCode.trim().toUpperCase();
  if (slot.subjectName && slot.subjectName.trim()) return slot.subjectName.trim().toUpperCase();
  return '';
}

export interface TimetablePeriod {
  period: number;
  startTime: string; // "09:30"
  endTime: string;   // "10:20"
  startMinutes: number; // 570
  endMinutes: number;   // 620
}

/**
 * Institutional timetable periods for Chitkara University:
 * 8 lecture periods of 50 minutes each from 09:30 to 16:10.
 */
export const INSTITUTIONAL_PERIODS: readonly TimetablePeriod[] = [
  { period: 1, startTime: '09:30', endTime: '10:20', startMinutes: 570, endMinutes: 620 },
  { period: 2, startTime: '10:20', endTime: '11:10', startMinutes: 620, endMinutes: 670 },
  { period: 3, startTime: '11:10', endTime: '12:00', startMinutes: 670, endMinutes: 720 },
  { period: 4, startTime: '12:00', endTime: '12:50', startMinutes: 720, endMinutes: 770 },
  { period: 5, startTime: '12:50', endTime: '13:40', startMinutes: 770, endMinutes: 820 },
  { period: 6, startTime: '13:40', endTime: '14:30', startMinutes: 820, endMinutes: 870 },
  { period: 7, startTime: '14:30', endTime: '15:20', startMinutes: 870, endMinutes: 920 },
  { period: 8, startTime: '15:20', endTime: '16:10', startMinutes: 920, endMinutes: 970 },
];

export interface SlotPeriodMapping {
  sessionNumber: number; // Institutional period index (1-based, matches startPeriod)
  totalSessions: number; // Total periods in institutional schedule (8)
  startPeriod: number;
  endPeriod: number;
  periodLabel: string;   // e.g. "Lecture 1", "Lecture 1–2", "Lecture 7–8"
  compactLabel: string;  // e.g. "L1", "L1–2", "L7–8"
  isMultiPeriod: boolean;
}

/**
 * Maps a timetable slot to university periods based on institutional timetable schedule.
 * Correctly distinguishes single-period lectures (e.g. 50 min) from multi-period labs (e.g. 100 min).
 * If a slot cannot be confidently mapped to institutional periods or is non-academic/free, returns null.
 */
export function mapSlotToTimetablePeriod(
  slot: {
    startTime?: string;
    endTime?: string;
    periods?: number;
    durationMinutes?: number;
    isNonAcademic?: boolean;
    isFreePeriod?: boolean;
    subjectCode?: string;
    subjectName?: string;
  } | null | undefined
): SlotPeriodMapping | null {
  if (!slot || !slot.startTime) return null;

  // Omit lecture numbering for non-academic / free period entries
  if (
    slot.isNonAcademic ||
    slot.isFreePeriod ||
    /^(?:Lib|Library|Free Period|Break)$/i.test(slot.subjectCode || '') ||
    /^(?:Lib|Library|Free Period|Break)$/i.test(slot.subjectName || '')
  ) {
    return null;
  }

  const startMins = timeToMinutes(slot.startTime);
  if (startMins <= 0) return null;

  // Match start period (tolerance +/- 6 minutes)
  const TOLERANCE_MINS = 6;
  const startPeriodObj = INSTITUTIONAL_PERIODS.find(
    (p) => Math.abs(p.startMinutes - startMins) <= TOLERANCE_MINS
  );
  if (!startPeriodObj) return null;

  let endPeriodObj: TimetablePeriod | undefined;

  if (slot.endTime) {
    const endMins = timeToMinutes(slot.endTime);
    if (endMins > startMins) {
      endPeriodObj = INSTITUTIONAL_PERIODS.find(
        (p) => Math.abs(p.endMinutes - endMins) <= TOLERANCE_MINS
      );
    }
  }

  // Fallback if endTime didn't match directly: derive from periods count or duration
  if (!endPeriodObj) {
    const periodCount =
      typeof slot.periods === 'number' && slot.periods >= 1
        ? slot.periods
        : typeof slot.durationMinutes === 'number' && slot.durationMinutes >= 80
        ? 2
        : 1;

    const targetEndIndex = (startPeriodObj.period - 1) + (periodCount - 1);
    if (targetEndIndex >= 0 && targetEndIndex < INSTITUTIONAL_PERIODS.length) {
      endPeriodObj = INSTITUTIONAL_PERIODS[targetEndIndex];
    }
  }

  if (!endPeriodObj || endPeriodObj.period < startPeriodObj.period) {
    return null;
  }

  const startPeriod = startPeriodObj.period;
  const endPeriod = endPeriodObj.period;
  const isMultiPeriod = endPeriod > startPeriod;
  const periodLabel = isMultiPeriod ? `Lecture ${startPeriod}–${endPeriod}` : `Lecture ${startPeriod}`;
  const compactLabel = isMultiPeriod ? `L${startPeriod}–${endPeriod}` : `L${startPeriod}`;

  return {
    sessionNumber: startPeriod,
    totalSessions: INSTITUTIONAL_PERIODS.length,
    startPeriod,
    endPeriod,
    periodLabel,
    compactLabel,
    isMultiPeriod,
  };
}

/**
 * Calculates the timetable period mapping for a slot based on the official university schedule.
 * Returns SlotPeriodMapping if matched, or null if the slot cannot be confidently mapped.
 */
export function calculateDailySlotSessionNumber(
  targetSlot: TimetableSlot | null | undefined,
  _daySlots?: TimetableSlot[]
): SlotPeriodMapping | null {
  if (!targetSlot) return null;
  return mapSlotToTimetablePeriod(targetSlot);
}

/**
 * Derives comprehensive live class status and insights from student timetable and current date/time.
 * Pure function: deterministic, highly testable, zero side-effects.
 */
export function calculateLiveClassState(
  slots: TimetableSlot[],
  currentTime: Date = new Date(),
  startingSoonWindowMinutes: number = 15
): LiveDashboardState {
  const activeSlots = slots.filter((s) => s.isActive !== false);

  if (activeSlots.length === 0) {
    return {
      status: 'EMPTY_TIMETABLE',
      currentSlot: null,
      startingSoonSlot: null,
      nextSlot: null,
      currentFreePeriod: null,
      todaySlots: [],
      remainingSlots: [],
      nextScheduledDay: null,
      minutesRemainingInCurrent: 0,
      minutesUntilNext: 0,
      timeRemainingFormatted: '',
    };
  }

  const currentDay = currentTime.getDay();
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // Sort slots for today ascending by startTime, then endTime
  const todaySlots = activeSlots
    .filter((s) => s.dayOfWeek === currentDay)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // Determine next scheduled day across the entire week if today has no classes or all done
  let nextScheduledDay: NextScheduledDay | null = null;
  for (let offset = 1; offset <= 7; offset++) {
    const checkDay = (currentDay + offset) % 7;
    const daySlots = activeSlots
      .filter((s) => s.dayOfWeek === checkDay)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (daySlots.length > 0) {
      nextScheduledDay = {
        dayOfWeek: checkDay,
        dayName: DAYS_OF_WEEK[checkDay],
        firstSlot: daySlots[0],
        daysAway: offset,
      };
      break;
    }
  }

  if (todaySlots.length === 0) {
    return {
      status: 'NO_CLASSES_TODAY',
      currentSlot: null,
      startingSoonSlot: null,
      nextSlot: null,
      currentFreePeriod: null,
      todaySlots: [],
      remainingSlots: [],
      nextScheduledDay,
      minutesRemainingInCurrent: 0,
      minutesUntilNext: 0,
      timeRemainingFormatted: '',
    };
  }

  // Find currently active lecture (if overlapping, picks the one ending earliest/in progress)
  const currentSlot =
    todaySlots.find((s) => {
      const startMin = timeToMinutes(s.startTime);
      const endMin = timeToMinutes(s.endTime);
      return currentMinutes >= startMin && currentMinutes < endMin;
    }) || null;

  // Remaining slots strictly after now
  const remainingSlots = todaySlots.filter((s) => timeToMinutes(s.startTime) > currentMinutes);
  const nextSlot = remainingSlots.length > 0 ? remainingSlots[0] : null;

  // 1. If currently in lecture
  if (currentSlot) {
    const endMin = timeToMinutes(currentSlot.endTime);
    const minutesRemaining = Math.max(0, endMin - currentMinutes);
    const sessionInfo = calculateDailySlotSessionNumber(currentSlot, todaySlots);
    return {
      status: 'LIVE_NOW',
      currentSlot,
      startingSoonSlot: null,
      nextSlot,
      targetSlotSessionNumber: sessionInfo?.sessionNumber,
      targetSlotPeriodLabel: sessionInfo?.periodLabel,
      targetSlotCompactLabel: sessionInfo?.compactLabel,
      totalSubjectSessionsToday: sessionInfo?.totalSessions,
      currentFreePeriod: null,
      todaySlots,
      remainingSlots,
      nextScheduledDay,
      minutesRemainingInCurrent: minutesRemaining,
      minutesUntilNext: nextSlot ? Math.max(0, timeToMinutes(nextSlot.startTime) - currentMinutes) : 0,
      timeRemainingFormatted: formatDurationMinutes(minutesRemaining),
    };
  }

  // 2. Check if a lecture starts soon (within threshold, e.g. 15 minutes)
  if (nextSlot) {
    const startMin = timeToMinutes(nextSlot.startTime);
    const minutesUntil = startMin - currentMinutes;
    const sessionInfo = calculateDailySlotSessionNumber(nextSlot, todaySlots);

    if (minutesUntil <= startingSoonWindowMinutes && minutesUntil > 0) {
      return {
        status: 'STARTING_SOON',
        currentSlot: null,
        startingSoonSlot: nextSlot,
        nextSlot,
        targetSlotSessionNumber: sessionInfo?.sessionNumber,
        targetSlotPeriodLabel: sessionInfo?.periodLabel,
        targetSlotCompactLabel: sessionInfo?.compactLabel,
        totalSubjectSessionsToday: sessionInfo?.totalSessions,
        currentFreePeriod: null,
        todaySlots,
        remainingSlots,
        nextScheduledDay,
        minutesRemainingInCurrent: 0,
        minutesUntilNext: minutesUntil,
        timeRemainingFormatted: formatDurationMinutes(minutesUntil),
      };
    }

    // 3. Free period before next lecture
    // Calculate start of current free window: latest completed slot before now, or now
    const pastSlots = todaySlots.filter((s) => timeToMinutes(s.endTime) <= currentMinutes);
    const lastCompleted = pastSlots.length > 0 ? pastSlots[pastSlots.length - 1] : null;
    const freePeriodStart = lastCompleted ? lastCompleted.endTime : formatTimeFromMinutes(currentMinutes);

    const freePeriod: FreePeriod = {
      start: freePeriodStart,
      end: nextSlot.startTime,
      durationMinutes: minutesUntil,
    };

    return {
      status: 'FREE_NOW',
      currentSlot: null,
      startingSoonSlot: null,
      nextSlot,
      targetSlotSessionNumber: sessionInfo?.sessionNumber,
      targetSlotPeriodLabel: sessionInfo?.periodLabel,
      targetSlotCompactLabel: sessionInfo?.compactLabel,
      totalSubjectSessionsToday: sessionInfo?.totalSessions,
      currentFreePeriod: freePeriod,
      todaySlots,
      remainingSlots,
      nextScheduledDay,
      minutesRemainingInCurrent: 0,
      minutesUntilNext: minutesUntil,
      timeRemainingFormatted: formatDurationMinutes(minutesUntil),
    };
  }

  // 4. All lectures finished for today
  return {
    status: 'NO_MORE_CLASSES_TODAY',
    currentSlot: null,
    startingSoonSlot: null,
    nextSlot: null,
    currentFreePeriod: null,
    todaySlots,
    remainingSlots: [],
    nextScheduledDay,
    minutesRemainingInCurrent: 0,
    minutesUntilNext: 0,
    timeRemainingFormatted: '',
  };
}

function formatTimeFromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
