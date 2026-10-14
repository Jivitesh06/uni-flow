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
  targetSlotSessionNumber?: number; // Chronological 1-based session of target subject on today's schedule
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

/**
 * Calculates the chronological 1-based session/lecture number of a slot among all
 * scheduled sessions of that same subject on a given day's timetable.
 * Multi-period labs spanning consecutive hours count as one scheduled session unless
 * distinct slots exist.
 */
export function calculateDailySlotSessionNumber(
  targetSlot: TimetableSlot | null | undefined,
  daySlots: TimetableSlot[]
): { sessionNumber: number; totalSessions: number } | null {
  if (!targetSlot) return null;
  const targetKey = getSubjectMatchKey(targetSlot);
  if (!targetKey) return null;

  // Filter day slots for this same subject and sort chronologically by startTime, then endTime
  const subjectSlots = daySlots
    .filter((s) => s.isActive !== false && getSubjectMatchKey(s) === targetKey)
    .sort((a, b) => {
      const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      if (startDiff !== 0) return startDiff;
      return timeToMinutes(a.endTime) - timeToMinutes(b.endTime);
    });

  if (subjectSlots.length === 0) return null;

  const foundIndex = subjectSlots.findIndex(
    (s) => s.id === targetSlot.id || (s.startTime === targetSlot.startTime && s.endTime === targetSlot.endTime)
  );

  const sessionNumber = foundIndex >= 0 ? foundIndex + 1 : 1;
  return {
    sessionNumber,
    totalSessions: subjectSlots.length,
  };
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
