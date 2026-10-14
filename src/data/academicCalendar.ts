/**
 * Academic Calendar & Important Dates Architecture
 * Source of truth: Chitkara University Himachal Pradesh "Academic Calendar || Fall Semester 2026", dated July 1, 2026.
 */

export type AcademicEventCategory =
  | 'holiday'
  | 'semester_date'
  | 'semester_break'
  | 'reopening'
  | 'working_saturday';

export interface AcademicCalendarEvent {
  id: string;
  title: string;
  category: AcademicEventCategory;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (inclusive)
  dayOfWeek?: string;
  description?: string;
  applicableCohorts?: string[]; // e.g. ['ALL'], ['2023', '2024'], etc.
  officialRemarks?: string;
  timetableFollowed?: string;   // e.g. 'Friday timetable', 'Monday timetable'
  substitutedOffDay?: string;   // e.g. 'September 5, 2026 is observed as an off day instead'
  sourceDocument?: string;
  sourceUrl?: string;
}

export interface AcademicSessionInfo {
  id: string;
  name: string; // e.g. 'Fall Semester 2026'
  academicYear: string; // e.g. '2026-2027'
  institution: string;
  sourceTitle: string;
  sourceDate: string;
  events: AcademicCalendarEvent[];
}

export const FALL_SEMESTER_2026_EVENTS: AcademicCalendarEvent[] = [
  // 1. Semester Opening Dates
  {
    id: 'fall2026-reopen-2023-2024',
    title: 'University Reopening (Batches 2023 & 2024)',
    category: 'reopening',
    startDate: '2026-06-22',
    endDate: '2026-06-22',
    dayOfWeek: 'Monday',
    applicableCohorts: ['2023', '2024'],
    description: 'University reopening after Summer Break for SOET batches 2023 and 2024.',
    officialRemarks: 'University reopening after Summer Break for SOET batches 2023 and 2024.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-reopen-2025-sop-con',
    title: 'University Reopening (Batch 2025, SOP, CON)',
    category: 'reopening',
    startDate: '2026-06-29',
    endDate: '2026-06-29',
    dayOfWeek: 'Monday',
    applicableCohorts: ['2025', 'SOP', 'CON'],
    description: 'University reopening after Summer Break for SOET batch 2025, SOP and CON.',
    officialRemarks: 'University reopening after Summer Break for SOET batch 2025, SOP and CON.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },

  // 2. Holidays & Working Saturdays (Chronological)
  {
    id: 'fall2026-holiday-independence-day',
    title: 'Independence Day',
    category: 'holiday',
    startDate: '2026-08-15',
    endDate: '2026-08-15',
    dayOfWeek: 'Saturday',
    applicableCohorts: ['ALL'],
    description: 'National holiday in celebration of Independence Day.',
    officialRemarks: 'Official University Holiday.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-working-sat-aug-22',
    title: 'Working Saturday (Non-Teaching)',
    category: 'working_saturday',
    startDate: '2026-08-22',
    endDate: '2026-08-22',
    dayOfWeek: 'Saturday',
    applicableCohorts: ['ALL'],
    description: 'Non-Teaching Working Day. September 5, 2026 is observed as an off day instead.',
    officialRemarks: 'Non-Teaching Working Day; September 5, 2026 is observed as an off day instead.',
    substitutedOffDay: 'September 5, 2026',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-holiday-janmashtami',
    title: 'Krishna Janmashtami',
    category: 'holiday',
    startDate: '2026-09-04',
    endDate: '2026-09-04',
    dayOfWeek: 'Friday',
    applicableCohorts: ['ALL'],
    description: 'Celebration of Krishna Janmashtami.',
    officialRemarks: 'Official University Holiday.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-working-sat-sep-19',
    title: 'Teaching Working Saturday (Friday Timetable)',
    category: 'working_saturday',
    startDate: '2026-09-19',
    endDate: '2026-09-19',
    dayOfWeek: 'Saturday',
    applicableCohorts: ['ALL'],
    description: 'Teaching Working Day. Friday timetable is observed.',
    officialRemarks: 'Teaching Working Day; Friday timetable is observed.',
    timetableFollowed: 'Friday timetable',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-holiday-gandhi-jayanti',
    title: "Mahatma Gandhi's Birthday",
    category: 'holiday',
    startDate: '2026-10-02',
    endDate: '2026-10-02',
    dayOfWeek: 'Friday',
    applicableCohorts: ['ALL'],
    description: "National holiday observing Mahatma Gandhi's Birthday.",
    officialRemarks: 'Official University Holiday.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-working-sat-oct-10',
    title: 'Teaching Working Saturday (Monday Timetable)',
    category: 'working_saturday',
    startDate: '2026-10-10',
    endDate: '2026-10-10',
    dayOfWeek: 'Saturday',
    applicableCohorts: ['ALL'],
    description: 'Teaching Working Day. Monday timetable is observed, and October 3, 2026 is an off day instead.',
    officialRemarks: 'Teaching Working Day; Monday timetable is observed, and October 3, 2026 is an off day instead.',
    timetableFollowed: 'Monday timetable',
    substitutedOffDay: 'October 3, 2026',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-holiday-dussehra',
    title: 'Dussehra',
    category: 'holiday',
    startDate: '2026-10-19',
    endDate: '2026-10-20',
    dayOfWeek: 'Monday – Tuesday',
    applicableCohorts: ['ALL'],
    description: 'Festival of Dussehra (2 days).',
    officialRemarks: 'Official University Holiday (October 19–20, 2026).',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-holiday-diwali-break',
    title: 'Diwali Break',
    category: 'holiday',
    startDate: '2026-11-07',
    endDate: '2026-11-11',
    dayOfWeek: 'Saturday – Wednesday',
    applicableCohorts: ['ALL'],
    description: 'Diwali festival break (5 days). Note: November 7 overlaps with the off day substituted by the Nov 14 working Saturday.',
    officialRemarks: 'Official University Break (November 7–11, 2026). Note: Source records November 7 as an off day substituted for November 14 working Saturday as well as the start of Diwali break.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-working-sat-nov-14',
    title: 'Teaching Working Saturday (Tuesday Timetable)',
    category: 'working_saturday',
    startDate: '2026-11-14',
    endDate: '2026-11-14',
    dayOfWeek: 'Saturday',
    applicableCohorts: ['ALL'],
    description: 'Teaching Working Day. Tuesday timetable is observed, and November 7, 2026 is an off day instead.',
    officialRemarks: 'Teaching Working Day; Tuesday timetable is observed, and November 7, 2026 is an off day instead.',
    timetableFollowed: 'Tuesday timetable',
    substitutedOffDay: 'November 7, 2026',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-holiday-guru-nanak-jayanti',
    title: 'Shri Guru Nanak Dev Ji Birthday',
    category: 'holiday',
    startDate: '2026-11-24',
    endDate: '2026-11-24',
    dayOfWeek: 'Tuesday',
    applicableCohorts: ['ALL'],
    description: 'Gurpurab holiday commemorating the birth of Guru Nanak Dev Ji.',
    officialRemarks: 'Official University Holiday.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-holiday-christmas',
    title: 'Christmas Day',
    category: 'holiday',
    startDate: '2026-12-25',
    endDate: '2026-12-25',
    dayOfWeek: 'Friday',
    applicableCohorts: ['ALL'],
    description: 'Christmas celebration.',
    officialRemarks: 'Official University Holiday.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },

  // 3. Semester End & Winter Break
  {
    id: 'fall2026-semester-end',
    title: 'End of Fall Semester 2026',
    category: 'semester_date',
    startDate: '2026-12-30',
    endDate: '2026-12-30',
    dayOfWeek: 'Wednesday',
    applicableCohorts: ['ALL'],
    description: 'Conclusion of teaching and semester examinations for Fall Semester (July–December 2026).',
    officialRemarks: 'End of Fall Semester (July–December 2026).',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'fall2026-winter-break',
    title: 'Winter Break',
    category: 'semester_break',
    startDate: '2026-12-31',
    endDate: '2027-01-10',
    dayOfWeek: 'Thursday – Sunday',
    applicableCohorts: ['ALL'],
    description: 'Winter Vacation for students across all programs.',
    officialRemarks: 'Winter Break (December 31, 2026 – January 10, 2027).',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
  {
    id: 'spring2027-university-reopening',
    title: 'Spring Semester 2027 Reopening',
    category: 'reopening',
    startDate: '2027-01-18',
    endDate: '2027-01-18',
    dayOfWeek: 'Monday',
    applicableCohorts: ['ALL'],
    description: 'University reopening for students for Spring Semester 2027.',
    officialRemarks: 'University reopening for students for Spring Semester 2027.',
    sourceDocument: 'Academic Calendar || Fall Semester 2026 (Dated July 1, 2026)',
  },
];

export const CURRENT_ACADEMIC_SESSION: AcademicSessionInfo = {
  id: 'fall-2026',
  name: 'Fall Semester 2026',
  academicYear: '2026–2027',
  institution: 'Chitkara University Himachal Pradesh',
  sourceTitle: 'Academic Calendar || Fall Semester 2026',
  sourceDate: 'July 1, 2026',
  events: FALL_SEMESTER_2026_EVENTS,
};

/**
 * Returns YYYY-MM-DD string for date comparison.
 */
export function toISODateKey(d: Date | string = new Date()): string {
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      d = parsed;
    } else {
      return d;
    }
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type EventTemporalStatus = 'past' | 'ongoing' | 'upcoming';

export function getEventTemporalStatus(
  event: AcademicCalendarEvent,
  nowKey: string = toISODateKey()
): EventTemporalStatus {
  if (event.endDate < nowKey) return 'past';
  if (event.startDate <= nowKey && nowKey <= event.endDate) return 'ongoing';
  return 'upcoming';
}

/**
 * Filters and returns chronological upcoming holidays from the session.
 */
export function getUpcomingHolidays(
  events: AcademicCalendarEvent[] = CURRENT_ACADEMIC_SESSION.events,
  nowDate: Date | string = new Date(),
  limit = 5
): AcademicCalendarEvent[] {
  const nowKey = toISODateKey(nowDate);
  return events
    .filter((e) => (e.category === 'holiday' || e.category === 'semester_break') && e.endDate >= nowKey)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, limit);
}

/**
 * Returns the single next holiday or ongoing break.
 */
export function getNextUpcomingHoliday(
  events: AcademicCalendarEvent[] = CURRENT_ACADEMIC_SESSION.events,
  nowDate: Date | string = new Date()
): AcademicCalendarEvent | null {
  const list = getUpcomingHolidays(events, nowDate, 1);
  return list.length > 0 ? list[0] : null;
}

/**
 * Groups events by Month and Year (e.g. "August 2026").
 */
export function groupEventsByMonth(
  events: AcademicCalendarEvent[] = CURRENT_ACADEMIC_SESSION.events
): { monthYear: string; sortKey: string; events: AcademicCalendarEvent[] }[] {
  const map = new Map<string, AcademicCalendarEvent[]>();

  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate));

  for (const ev of sorted) {
    const [year, month] = ev.startDate.split('-');
    const sortKey = `${year}-${month}`;
    const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    const monthYear = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!map.has(sortKey)) {
      map.set(sortKey, []);
    }
    map.get(sortKey)!.push(ev);
  }

  return Array.from(map.entries())
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([sortKey, evList]) => {
      const [year, month] = sortKey.split('-');
      const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      const monthYear = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return {
        monthYear,
        sortKey,
        events: evList,
      };
    });
}
